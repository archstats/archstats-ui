// Writing a conversation up as a report, as a person would: pick the kind of
// report it is (a template the gallery offers, or a free outline), lay out its
// sections with their evidence, then write every section in the report's voice
// from that evidence and from what the conversation found, and a summary on
// top. Every number is checked against the evidence it was written from.

import { useReportsStore } from "~/features/reports/reports.store"
import { buildTemplate, ECOSYSTEM_TEMPLATES, GENERAL_TEMPLATES, QUICK_TEMPLATES, bestTemplate, type ReportTemplate } from "~/features/reports/reportTemplates"
import { ecosystems, probe, readingDef, type Ecosystem, type ReadingContext, type SnapshotFacts } from "~/features/reports/readings"
import { fromMarkdown, isCell, newId, type Block } from "~/features/reports/reportDoc"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { unsourcedNumbers } from "../engine/checks"
import type { Evidence, ModelClient } from "../engine/types"
import { hybridSearch, type Embed } from "../knowledge/semantic"
import { takeView } from "./stage"
import type { Cell } from "~/features/reports/reportDoc"
import { words } from "../knowledge/capabilities"
import type { Thread, Turn } from "./ask.store"
import { evidenceBlocks, exhibitBlock, reportable } from "./toReport"
import { layoutAnswer } from "../render/blocks"
import { trustedText } from "../render/verdict"
import { stableKey } from "~/features/exhibits/schema"
import type { ExhibitPart } from "~/features/exhibits/types"

export interface TemplateSuggestion { id: string; name: string; audience: string; summary: string; why: string; recommended: boolean }

export interface WriteProgress {
    phase: "planning" | "reading" | "writing" | "summary" | "saving" | "figures" | "done" | "error"
    sections: Array<{ heading: string; status: "waiting" | "writing" | "done" | "revised" | "skipped" }>
    message: string
}

const ALL = () => [...GENERAL_TEMPLATES, ...QUICK_TEMPLATES, ...ECOSYSTEM_TEMPLATES]

function conversationText(t: Thread): string {
    return t.turns.filter(x => x.status === "done").map(x => `${x.question}\n${trustedText(x.answer, x.grounding).slice(0, 600)}`).join("\n\n")
}

async function snapshotFacts(): Promise<{ ctx: ReadingContext; facts: SnapshotFacts; ecos: Ecosystem[] } | null> {
    const reports = useReportsStore()
    const ctx = reports.readingContext(reports.openKernel)
    if (!ctx) return null
    const facts = await probe(ctx)
    return { ctx, facts, ecos: ecosystems(facts) }
}

/** The templates that fit this conversation and this codebase, best first; the first is recommended. The model reads the conversation and picks, with a reason; search is the fallback. */
export async function suggestTemplates(thread: Thread, embed?: Embed, model?: ModelClient): Promise<TemplateSuggestion[]> {
    if (model) {
        try {
            const snap = await snapshotFacts()
            const detected = new Set(snap?.ecos.map(e => e.id) ?? [])
            const candidates = ALL().filter(t => !t.ecosystem || detected.has(t.ecosystem))
            const reply = await model.chat({
                messages: [
                    { role: "system", content: "You choose report templates for an architecture conversation. Pick the 3 templates whose purpose best matches what the conversation investigated and what its reader would need. Give each a reason of at most 12 words that names what in the conversation it fits. Reply as JSON." },
                    { role: "user", content: `Conversation questions:\n${thread.turns.filter(t => t.status === "done").map(t => `- ${t.question}`).join("\n")}\n\nTemplates:\n${candidates.map(t => `${t.id}: ${t.name} — ${t.summary} ${t.when ?? ""}`).join("\n")}` },
                ],
                format: { type: "object", properties: { picks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } } }, required: ["picks"] },
                think: false,
            }, () => {}, new AbortController().signal)
            const picks = (JSON.parse(reply.content).picks ?? []) as Array<{ id: string; reason: string }>
            const out: TemplateSuggestion[] = picks.map(p => ({ p, t: candidates.find(t => t.id === p.id) })).filter(x => x.t).slice(0, 3)
                .map((x, i) => ({ id: x.t!.id, name: x.t!.name, audience: x.t!.audience, summary: x.t!.summary, why: x.p.reason, recommended: i === 0 }))
            if (out.length) {
                if (!out.some(o => o.id === "architecture-review")) {
                    const t = ALL().find(x => x.id === "architecture-review")!
                    out.push({ id: t.id, name: t.name, audience: t.audience, summary: t.summary, why: "the full review, whatever was asked", recommended: false })
                }
                return out
            }
        } catch { /* fall back to search */ }
    }
    return searchTemplates(thread, embed)
}

async function searchTemplates(thread: Thread, embed?: Embed): Promise<TemplateSuggestion[]> {
    const snap = await snapshotFacts()
    const detected = new Set(snap?.ecos.map(e => e.id) ?? [])
    const candidates = ALL().filter(t => !t.ecosystem || detected.has(t.ecosystem))
    const hits = await hybridSearch(conversationText(thread), candidates, t => `${t.name}. ${t.summary} ${t.when ?? ""} For ${t.audience}.`, { embed, limit: 3 })
    const asked = thread.turns.filter(x => x.status === "done").map(x => x.question)
    // Why a template fits: the question of the conversation it shares most with.
    const closest = (t: ReportTemplate) => {
        const tw = new Set(words(`${t.name} ${t.summary} ${t.when ?? ""}`))
        let best = "", score = 0
        for (const q of asked) { const n = words(q).filter(w => tw.has(w)).length; if (n > score) { score = n; best = q } }
        return best
    }
    const out: TemplateSuggestion[] = hits.map(h => {
        const q = closest(h.item)
        return { id: h.item.id, name: h.item.name, audience: h.item.audience, summary: h.item.summary, why: q ? `covers “${q.replace(/\?$/, "")}”` : "close in meaning to the conversation", recommended: false }
    })
    // The codebase's own framework review, and the general review, are always on offer.
    if (snap) {
        for (const id of [bestTemplate(snap.facts, snap.ecos), "architecture-review"]) {
            const t = ALL().find(x => x.id === id)
            if (t && !out.some(o => o.id === t.id)) out.push({ id: t.id, name: t.name, audience: t.audience, summary: t.summary, why: t.ecosystem ? "made for this codebase's framework" : "the full review, whatever was asked", recommended: false })
        }
    }
    if (out[0]) out[0].recommended = true
    return out.slice(0, 5)
}

// ── Writing ──────────────────────────────────────────────────────────────

const VOICE = `You write one section of an architecture report about a codebase, for readers who do not read code all day.
Voice:
- The code is the subject, never a tool: "checkout depends on 12 components", never "Archstats shows" or "the scan finds" or "the evidence".
- One idea per sentence. Plain words; name a metric the first time it appears ("dependents: how many components import it").
- More than two parallel things: a lead sentence, then a bulleted list.
- Shorten long package paths in prose to their last two parts; tables keep full names.
- Say what the evidence shows and what it would cost or risk, in numbers where the evidence has them. No verdicts or loaded words ("bad", "a mess", "severe", "degradation", "not well layered", "well designed", "velocity"), no guesses about people, intent or skill.
- Never assume an intended architecture ("intended layering", "should stay separate", "violates") unless declared rules are in the evidence. Describe the direction the imports actually run.
- Write every number as digits (61, not sixty-one), exactly as the evidence has it; every number must appear in the evidence given. If the evidence cannot answer part of the brief, say so once, in one sentence, for the whole section; never repeat a limitation per item.
- Never make "the evidence", "the data", "the scan" or "the table" the subject of a sentence. Vary sentence openings; do not repeat one pattern for every item of a list.
- No citations, no brackets, no "[E1]", no "[Snapshot]", no offers to show things, no questions to the reader, no headings.
Write Markdown: paragraphs and lists only. Keep it under 180 words unless the brief asks for more.`

/** Loaded words a report must not use: they judge instead of describing. */
export const LOADED = /\b(the (evidence|data|scan) (does|do|shows?|indicates?|suggests?|reveals?|names?|identif\w+|specif\w+|states?)\b|severe(ly)?|degradation|degraded|bad design|poorly|a mess|messy|spaghetti|terrible|awful|well[- ]designed|not well[- ]layered|clean architecture|velocity|violat(e|es|ing|ion|ions)|intended \w+|should (stay|be kept) separate|lack of (oversight|discipline)|technical debt crisis)\b/i

/** Numbers written as words, four and up: a way round the number check. */
export const SPELLED = /\b(four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine|percent|hundred|thousand))?\b/gi

const WORD_NUM: Record<string, number> = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const UNIT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }

/** Spelled numbers as digits ("sixty-one" → 61, "twenty-two percent" → 22%), keeping the case of the first letter out of it. */
export function digitize(text: string): string {
    return text.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)\b/gi, (_m, t: string, u: string) => String(WORD_NUM[t.toLowerCase()] + UNIT[u.toLowerCase()]))
        .replace(/\b(four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b(?![- ](?:one|two|three|four|five|six|seven|eight|nine)\b)/gi, m => String(WORD_NUM[m.toLowerCase()]))
        .replace(/(\d+) percent\b/g, "$1%")
}

/** Sentences whose numbers the evidence does not hold, after a rewrite still had them: dropped, not printed. */
function dropUnsourced(text: string, evidence: string): { text: string; dropped: number } {
    let dropped = 0
    const out = text.split("\n").map(line => line.split(/(?<=[.!?])\s+/).filter(sentence => {
        const bad = unsourcedNumbers(sentence, evidence).length > 0
        if (bad) dropped++
        return !bad
    }).join(" ")).filter((l, i, all) => l.trim() || (i > 0 && all[i - 1].trim())).join("\n")
    return { text: out.replace(/^\s*[-*]\s*$/gm, "").trim(), dropped }
}

async function write(model: ModelClient, brief: string, evidence: string, signal: AbortSignal, declaredRules = false): Promise<{ text: string; revised: boolean }> {
    const ask = async (extra = "") => (await model.chat({
        messages: [
            { role: "system", content: VOICE },
            { role: "user", content: `Brief:\n${brief}\n\nEvidence (the only source of facts and numbers):\n${evidence.slice(0, 14000)}${extra}` },
        ],
        think: false,
    }, () => {}, signal)).content.trim()
    let text = digitize(clean(await ask()))
    const bad = unsourcedNumbers(text, evidence)
    const hasRules = declaredRules
    const loaded = [...new Set([...text.matchAll(new RegExp(LOADED.source, "gi"))].map(m => m[0]))].filter(w => !(hasRules && /violat|intended/i.test(w)))
    // Spelled-out numbers slip past the number check; they must be digits.
    const spelled = [...new Set([...text.matchAll(SPELLED)].map(m => m[0]))]
    if ((bad.length || loaded.length || spelled.length) && !signal.aborted) {
        const why = [bad.length ? `numbers that are not in the evidence: ${bad.join(", ")}` : "", loaded.length ? `judging words instead of describing: ${loaded.join(", ")}` : "", spelled.length ? `numbers spelled as words (${spelled.slice(0, 4).join(", ")}); write them as digits` : ""].filter(Boolean).join("; and ")
        text = digitize(clean(await ask(`\n\nYour previous draft used ${why}. Write it again without them: describe what the imports and numbers show.\n\nPrevious draft:\n${text}`)))
        // Checked again: what is still not in the evidence does not print.
        text = dropUnsourced(text, evidence).text
        return { text, revised: true }
    }
    return { text, revised: false }
}

/** What a model sometimes adds anyway: citation markers, offers, a heading on top. */
function clean(md: string): string {
    return md
        .replace(/\s*\[(?:E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*|Snapshot|snapshot card|show:[^\]]*|source[^\]]*)\]/g, "")
        .replace(/^#{1,6}\s.*\n+/, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/** The exhibits an answer rested on: those it placed or cited. */
function shownExhibits(t: Turn): ExhibitPart[] {
    const byId = new Map((t.exhibits ?? []).map(x => [x.id, x]))
    return layoutAnswer(t.answer, new Set(byId.keys())).blocks.flatMap(b => (b.type === "exhibit" && byId.get(b.id) ? [byId.get(b.id)!] : []))
}
const exhibitKey = (x: ExhibitPart) => `exhibit:${x.spec.kind}:${stableKey(x.spec.params)}`

function evidenceText(e: Evidence, toolText?: string): string {
    return `${e.title}:\n${toolText ?? ""}`.slice(0, 3000)
}

/** The conversation's findings for a topic: the closest answers and their tool results. */
async function findingsFor(topic: string, thread: Thread, embed?: Embed): Promise<{ text: string; turns: Turn[] }> {
    const done = thread.turns.filter(t => t.status === "done" && (t.answer.trim() || t.evidence.length || t.exhibits?.length))
    const hits = await hybridSearch(topic, done, t => `${t.question}\n${trustedText(t.answer, t.grounding).slice(0, 800)}`, { embed, limit: 2 })
    const turns = hits.filter(h => h.score > 0.25).map(h => h.item)
    const text = turns.map(t => `Question asked: ${t.question}\nWhat was found: ${trustedText(t.answer, t.grounding)}\n${t.steps.map(s => s.text ?? "").join("\n").slice(0, 3500)}`).join("\n\n")
    return { text, turns }
}

function readingKeyText(b: Block): string {
    if (!isCell(b)) return ""
    const s = b.cell.spec
    if (s.type === "reading") return `reading:${s.reading}:${JSON.stringify(s.params ?? {})}`
    if (s.type === "sql") return `sql:${s.sql}`
    return ""
}

/** What a template's cells say, computed now, for the writer to read. */
async function cellEvidence(blocks: Block[], ctx: ReadingContext): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    for (const b of blocks) {
        if (!isCell(b)) continue
        const s = b.cell.spec
        const key = readingKeyText(b)
        if (!key || out.has(key)) continue
        try {
            if (s.type === "reading") {
                const def = readingDef(s.reading)
                if (def) { const r = await def.run(ctx, s.params ?? {}); if (!r.instruction && !r.absent) out.set(key, `${b.cell.title || def.label}:\n${r.text}`) }
            } else if (s.type === "sql") {
                const rows = await ctx.query(`SELECT * FROM (${s.sql}) LIMIT 15`)
                if (rows.length) out.set(key, `${b.cell.title || "Table"}:\n${Object.keys(rows[0]).join(" | ")}\n${rows.map(r => Object.values(r).map(v => (v === null ? "" : String(v).slice(0, 60))).join(" | ")).join("\n")}`)
            }
        } catch { /* a cell that cannot run here is left to the report */ }
    }
    return out
}

/** The component the conversation was most about: named in its figures' subjects (and older evidence cards). */
export function mostDiscussedComponent(thread: Thread): string | null {
    const counts = new Map<string, number>()
    const add = (name: unknown, n = 1) => { if (typeof name === "string" && name) counts.set(name, (counts.get(name) ?? 0) + n) }
    for (const t of thread.turns) {
        for (const e of t.evidence) if (e.kind === "component") add(e.name)
        for (const x of t.exhibits ?? []) if (["profile", "neighbours", "authors", "activity", "files"].includes(x.spec.kind)) add(x.spec.params.of, 2)
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** The component a template asks for, if it asks for one: chosen in the sheet before writing. */
export function templateComponentParam(templateId: string): { id: string; label: string } | null {
    const t = ALL().find(x => x.id === templateId) as ReportTemplate | undefined
    const p = t?.params?.find(x => x.kind === "component")
    return p ? { id: p.id, label: p.label } : null
}

/** The biggest hotspot, which a template about one component starts on when the conversation named none. */
async function biggestHotspot(): Promise<string | null> {
    const reports = useReportsStore()
    const ctx = reports.readingContext(reports.openKernel)
    try {
        const [r] = await ctx.query("SELECT name FROM components WHERE name <> '.' AND codesmells__hotspot_score IS NOT NULL ORDER BY codesmells__hotspot_score DESC LIMIT 1")
        return r?.name ? String(r.name) : null
    } catch { return null }
}

interface Section { heading: string; blocks: Block[] }

/** The report's sections, each holding its own blocks (by reference, so later edits never shift another section). */
function sectionsOf(blocks: Block[]): Section[] {
    const out: Section[] = []
    // What comes before the first heading is the introduction.
    let cur: Section | null = { heading: "Introduction", blocks: [] }
    for (const b of blocks) {
        if (!isCell(b) && (b.kind === "h1" || b.kind === "h2")) {
            if (cur) out.push(cur)
            cur = { heading: b.text, blocks: [] }
        } else if (cur) cur.blocks.push(b)
    }
    if (cur) out.push(cur)
    return out.filter(x => x.heading !== "Introduction" || x.blocks.length)
}

export async function writeReport(opts: {
    thread: Thread
    templateId: string | null
    model: ModelClient
    embed?: Embed
    signal: AbortSignal
    progress: (p: WriteProgress) => void
    /** What the template asks for, chosen before writing (the component a refactoring case is about). */
    params?: Record<string, string>
}): Promise<{ reportId: string; title: string }> {
    const { thread, model, embed, signal } = opts
    const reports = useReportsStore()
    const ws = useWorkspacesStore()
    if (!ws.active) throw new Error("No workspace is open.")
    if (reports.workspace !== ws.active.id) await reports.load(ws.active.id)
    const snap = await snapshotFacts()
    if (!snap) throw new Error("No snapshot to write the report on.")
    const state: WriteProgress = { phase: "planning", sections: [], message: "Laying out the report" }
    const tell = () => opts.progress({ ...state, sections: state.sections.map(s => ({ ...s })) })
    tell()

    let blocks: Block[]
    let title: string
    const used = new Set<string>()
    /** The same query or reading twice is one piece of evidence. */
    const seen = new Set<string>()
    const evidenceKey = (e: Evidence) => ("sql" in e && e.sql ? `sql:${e.sql}` : e.kind === "component" ? `component:${e.name}` : `${e.kind}:${e.title}`)

    if (opts.templateId) {
        // A template: its own sections, readings, queries and figure slots.
        const t = ALL().find(x => x.id === opts.templateId) as ReportTemplate | undefined
        if (!t) throw new Error(`No template ${opts.templateId}.`)
        const params: Record<string, string> = {}
        for (const p of t.params ?? []) if (p.kind === "component") params[p.id] = opts.params?.[p.id] || mostDiscussedComponent(thread) || (await biggestHotspot()) || ""
        blocks = buildTemplate(t, { facts: snap.facts, ecosystems: snap.ecos, params, explain: true }).blocks
        title = t.title(ws.active.name, params)
    } else {
        // Free form: an outline of the conversation, related questions merged, chatter dropped.
        const done = thread.turns.filter(x => x.status === "done" && (x.evidence.some(reportable) || shownExhibits(x).length))
        const reply = await model.chat({
            messages: [
                { role: "system", content: "You organise an architecture conversation into a short report. Group related questions into 2 to 5 sections with plain, specific headings (not the questions themselves). Drop questions that found nothing (requests for visualisations, small talk). Reply as JSON." },
                { role: "user", content: done.map((x, i) => `#${i} ${x.question}\n${trustedText(x.answer, x.grounding).slice(0, 300)}`).join("\n\n") },
            ],
            format: { type: "object", properties: { title: { type: "string" }, sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, questions: { type: "array", items: { type: "number" } } }, required: ["heading", "questions"] } } }, required: ["title", "sections"] },
            think: false,
        }, () => {}, signal)
        let outline: { title: string; sections: Array<{ heading: string; questions: number[] }> }
        try { outline = JSON.parse(reply.content) } catch { outline = { title: thread.title, sections: done.map((x, i) => ({ heading: x.question, questions: [i] })) } }
        blocks = []
        for (const s of outline.sections ?? []) {
            const turns = (s.questions ?? []).map(i => done[i]).filter(Boolean)
            if (!turns.length) continue
            blocks.push({ id: newId(), kind: "h2", text: s.heading })
            blocks.push({ id: newId(), kind: "p", text: "", prompt: `Write what the conversation found about: ${s.heading}.`, })
            for (const t of turns) {
                for (const e of t.evidence.filter(reportable)) { if (!used.has(e.id) && !seen.has(evidenceKey(e))) { used.add(e.id); seen.add(evidenceKey(e)); blocks.push(...evidenceBlocks(e)) } }
                for (const x of shownExhibits(t)) { if (!seen.has(exhibitKey(x))) { seen.add(exhibitKey(x)); blocks.push(exhibitBlock(x)) } }
            }
        }
        blocks.push({ id: newId(), kind: "h2", text: "What this cannot show" })
        blocks.push({ id: newId(), kind: "p", text: "", prompt: "Name what the scan leaves out (ignored folders, tests, generated code) and any question the evidence could not answer." })
        title = outline.title?.trim() || thread.title
    }

    // Violations and intent may only be spoken of when rules are declared.
    let declaredRules = false
    try { declaredRules = Number((await snap.ctx.query("SELECT count(*) AS n FROM rules WHERE status <> 'not_applicable'"))[0]?.n ?? 0) > 0 } catch { declaredRules = false }

    // What each section's cells say, computed now.
    state.phase = "reading"; state.message = "Reading the evidence"; tell()
    const cells = await cellEvidence(blocks, snap.ctx)

    // Write every section that asks for words.
    const sections = sectionsOf(blocks).filter(s => s.blocks.some(b => !isCell(b) && b.prompt && !b.text.trim()))
    state.sections = sections.map(s => ({ heading: s.heading, status: "waiting" }))
    state.phase = "writing"; tell()
    const written = new Map<string, Block[]>()
    /** Conversation evidence to place after a block, applied when the report is assembled. */
    const after = new Map<string, Block[]>()
    const allWritten: string[] = []
    for (const [i, s] of sections.entries()) {
        if (signal.aborted) throw new Error("Stopped.")
        state.sections[i].status = "writing"; state.message = `Writing “${s.heading}”`; tell()
        try {
            const prompts = s.blocks.filter(b => !isCell(b) && b.prompt && !b.text.trim())
            const intro = s.blocks.filter(b => !isCell(b) && b.text.trim() && b.kind === "p").map(b => (b as any).text).join("\n").slice(0, 1500)
            const cellText = s.blocks.map(readingKeyText).map(k => cells.get(k)).filter(Boolean).join("\n\n")
            const isIntro = s.heading === "Introduction"
            const synthesis = !isIntro && /summary|finding|recommend|conclusion|next step|takeaway|what to do|verdict|overall/i.test(`${s.heading} ${prompts.map(p => (p as any).prompt).join(" ")}`)
            if (isIntro) {
                const asked = thread.turns.filter(t => t.status === "done").map(t => `- ${t.question}`).join("\n")
                const out = await write(model, `Section: Introduction\nTwo or three sentences: what this report looks at and why, from the questions that were asked below. Do not invent who asked, deadlines or decisions; if the reason is not in the questions, describe what the report covers instead. The report is titled "${title}".`, `Questions asked about ${ws.active!.name}:\n${asked}`, signal)
                if (out.text && prompts[0]) written.set(prompts[0].id, fromMarkdown(out.text).filter(b => isCell(b) || b.text.trim()))
                state.sections[i].status = out.revised ? "revised" : "done"; tell()
                continue
            }
            const found = synthesis
                ? { text: thread.turns.filter(t => t.status === "done").map(t => `Question asked: ${t.question}\nWhat was found: ${trustedText(t.answer, t.grounding)}`).join("\n\n").slice(0, 7000), turns: [] as Turn[] }
                : await findingsFor(`${s.heading}\n${prompts.map(p => (p as any).prompt).join("\n")}`, thread, embed)
            const earlier = synthesis && allWritten.length ? `What the report says so far:\n${allWritten.join("\n\n").slice(0, 6000)}` : ""
            // Conversation evidence that belongs here, when the template did not bring its own.
            if (opts.templateId && !synthesis) {
                const anchor = [...s.blocks].reverse().find(isCell)?.id ?? prompts[prompts.length - 1]?.id
                const pool = found.turns.flatMap(t => t.evidence.filter(reportable)).filter(e => !used.has(e.id) && !seen.has(evidenceKey(e)))
                // Only evidence about this section's subject, at most two pieces: a section is an argument, not a dump.
                const fit = (await hybridSearch(`${s.heading} ${prompts.map(p => (p as any).prompt).join(" ")}`, pool, e => `${e.title} ${e.kind}`, { embed, limit: 2 })).filter(x => x.score > 0.45).map(x => x.item)
                for (const e of fit) {
                    if (!anchor) break
                    used.add(e.id); seen.add(evidenceKey(e))
                    after.set(anchor, [...(after.get(anchor) ?? []), ...evidenceBlocks(e)])
                }
                // Exhibits the answers showed, by the same rule: about this section, at most two.
                const shown = found.turns.flatMap(shownExhibits).filter(x => !seen.has(exhibitKey(x)))
                const fitX = (await hybridSearch(`${s.heading} ${prompts.map(p => (p as any).prompt).join(" ")}`, shown, x => `${x.title} ${x.facts.slice(0, 3).map(f => f.text).join(" ")}`, { embed, limit: 2 })).filter(x => x.score > 0.45).map(x => x.item)
                for (const x of fitX) {
                    if (!anchor) break
                    seen.add(exhibitKey(x))
                    after.set(anchor, [...(after.get(anchor) ?? []), exhibitBlock(x)])
                }
            }
            const evidence = [cellText, found.text, earlier, intro ? `Section introduction already written:\n${intro}` : ""].filter(Boolean).join("\n\n")
            if (!cellText && !found.text && !earlier) { state.sections[i].status = "skipped"; tell(); continue }
            const brief = `Section: ${s.heading}\nWhat the writer is asked to cover:\n${prompts.map(p => `- ${(p as any).prompt}`).join("\n")}\nThe report is titled "${title}".`
            const out = await write(model, brief, evidence, signal, declaredRules)
            if (out.text && prompts[0]) {
                written.set(prompts[0].id, fromMarkdown(out.text).filter(b => isCell(b) || b.text.trim()))
                allWritten.push(`## ${s.heading}\n${out.text}`)
            }
            state.sections[i].status = out.revised ? "revised" : "done"; tell()
        } catch (e: any) {
            if (signal.aborted) throw e
            // One section failing leaves its prompt for the writer; the report still gets written.
            state.sections[i].status = "skipped"; tell()
            console.error(`Ask could not write “${s.heading}”`, e)
        }
    }

    // Written text replaces the first prompt of each section; the prompt stays as the block's instruction.
    const final: Block[] = []
    for (const b of blocks) {
        const w = written.get(b.id)
        if (w?.length && !isCell(b)) {
            final.push({ ...w[0], id: b.id, ...(w[0].kind === "p" ? { prompt: b.prompt } : {}) } as Block, ...w.slice(1))
        } else final.push(b)
        final.push(...(after.get(b.id) ?? []))
    }

    // A summary on top, from what was written.
    let summary: Block[] = []
    if (allWritten.length && !signal.aborted) {
        state.phase = "summary"; state.message = "Writing the summary"; tell()
        const s = await write(model, `Section: Summary\nThe three to five things a reader must take away from this report, most important first, as a short lead sentence and a bulleted list. The report is titled "${title}".`, allWritten.join("\n\n"), signal)
        if (s.text) summary = [{ id: newId(), kind: "h2", text: "Summary" }, ...fromMarkdown(s.text).filter(b => isCell(b) || b.text.trim())]
    }

    state.phase = "saving"; state.message = "Saving the report"; tell()
    const note: Block = { id: newId(), kind: "p", text: "", prompt: `Written by Ask (${model.name}) on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })} from the conversation “${thread.title}”${opts.templateId ? `, on the “${ALL().find(x => x.id === opts.templateId)?.name}” template` : ""}. The numbers come from the cells; the words are the model's. Read it through before sharing it.` }
    const firstSection = final.findIndex(b => !isCell(b) && (b.kind === "h1" || b.kind === "h2"))
    const doc = firstSection > 0 ? [note, ...final.slice(0, firstSection), ...summary, ...final.slice(firstSection)] : [note, ...summary, ...final]
    const rec = await reports.create(title, doc)
    if (!rec) throw new Error("The report could not be saved.")
    void reports.runAll()

    // Every figure the template asks for, taken from its view out of sight, the way "Take" would.
    const kernel = reports.openKernel
    const slots = reports.doc.blocks.filter(b => isCell(b) && b.cell.spec.type === "slot") as Array<Extract<Block, { kind: "cell" }>>
    const slotsLeft = () => reports.doc.blocks.filter(b => isCell(b) && b.cell.spec.type === "slot").length
    if (kernel && slots.length) {
        state.phase = "figures"; tell()
        const ranOn = { scanId: kernel.id, label: kernel.label, commit: kernel.headCommit, committed: kernel.committed, revision: kernel.revision, at: new Date().toISOString() }
        let filled = 0
        for (const [i, b] of slots.entries()) {
            if (signal.aborted) break
            const spec = b.cell.spec as Extract<Cell["spec"], { type: "slot" }>
            state.message = `Taking “${b.cell.title || spec.view}” from ${spec.view} (${i + 1} of ${slots.length})`; tell()
            try {
                const got = await takeView(kernel.id, spec.route, { take: spec.take, figures: 1, report: true })
                let cell: Cell | null = null
                if (spec.kind === "figure" && got.figures[0]?.reportPng) {
                    const path = await reports.keepFigure(got.figures[0].reportPng)
                    cell = { spec: { type: "capture", kind: "figure", route: spec.route, view: spec.view }, title: b.cell.title || got.figures[0].title, caption: "", output: { figure: path }, ranOn }
                } else if (spec.kind === "table" && got.tables[0]) {
                    const t = got.tables[0]
                    cell = { spec: { type: "capture", kind: "table", route: spec.route, view: spec.view }, title: b.cell.title || t.title, caption: "", output: { table: { columns: t.columns.map((c, k) => ({ id: `c${k}`, label: c, numeric: t.rows.every(r => r[k] === "" || !Number.isNaN(Number(r[k]))) })), rows: t.rows.slice(0, 25).map(r => Object.fromEntries(r.map((v, k) => [`c${k}`, v]))), total: t.total } }, ranOn }
                }
                if (cell) { await reports.fillSlot(rec.id, b.id, [{ id: newId(), kind: "cell", cell }]); filled++ }
                else reports.setCell(b.id, { spec: { ...spec, hint: `Ask could not take this: ${spec.view} drew nothing for this snapshot (it may need a lens, a newer scan, or data this codebase lacks). ${spec.hint}` } })
            } catch (e) {
                console.error(`Ask could not take “${b.cell.title}”`, e)
                reports.setCell(b.id, { spec: { ...spec, hint: `Ask could not take this (${String((e as Error)?.message ?? e)}). ${spec.hint}` } })
            }
        }
    }
    state.phase = "done"
    state.message = slots.length ? `Written · ${slots.length - slotsLeft()} of ${slots.length} figures and tables taken from their views` : "Written"
    tell()
    return { reportId: rec.id, title }
}
