// Checks an answer must pass before it is shown, run without a model. A
// failing check earns the model one repair turn that says exactly what
// failed; after that the answer is shown with the failure marked.

import type { Check } from "./types"
import { searchCapabilities, type Capability } from "../knowledge/capabilities"
import { subjectMismatch, topicMismatch, type TopicExhibit } from "./topic"

const NUMBER = /(?<![\w.#&])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?%?(?![\w])/g

/** The numeric values a text holds, in the forms an answer might quote them. */
export function numbersOf(text: string): Set<string> {
    const out = new Set<string>()
    for (const m of text.matchAll(NUMBER)) {
        const v = Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`)
        if (!Number.isFinite(v)) continue
        out.add(String(v))
        out.add(String(Math.round(v)))
        out.add(v.toFixed(1))
        out.add(v.toFixed(2))
    }
    return out
}

/** Whether a number in an answer is too small or too structural to need a source. */
function trivial(v: number, frac: string | undefined): boolean {
    return !frac && v <= 3
}

/**
 * The numbers of an answer that no source holds. Code spans and evidence
 * ids are skipped: `v2`, `E12` and `line 40` of a quoted path are not claims.
 */
export function unsourcedNumbers(answer: string, sources: string): string[] {
    const known = numbersOf(sources)
    // List numbering ("4. metrics.vue") is structure, not a claim.
    const text = answer.replace(/`[^`]*`/g, " ").replace(/\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g, " ").replace(/\bE\d+(?:\.\d+)?\b/g, " ").replace(/^\s*(?:#{1,6}\s*)?\d+[.)]\s/gm, " ")
    const stated = [...text.matchAll(NUMBER)].map(m => Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`)).filter(v => known.has(String(v)) || known.has(String(Math.round(v))))
    const out: string[] = []
    for (const m of text.matchAll(NUMBER)) {
        const v = Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`)
        if (trivial(v, m[2])) continue
        if (known.has(String(v)) || known.has(String(Math.round(v))) || (m[2] && (known.has(v.toFixed(1)) || known.has(v.toFixed(2))))) continue
        // A share worked out from two sourced numbers the answer also states ("112 of 783 files, 14%").
        if (derived(v, m[0].endsWith("%"), stated)) continue
        out.push(m[0])
    }
    return [...new Set(out)]
}

/** Whether v is a ratio, share, sum or difference of two numbers already stated with a source. */
function derived(v: number, percent: boolean, stated: number[]): boolean {
    for (const a of stated) for (const b of stated) {
        if (a === b) continue
        if (b && (Math.abs((100 * a) / b - v) < 0.6 || (!percent && Math.abs(a / b - v) < 0.06))) return true
        if (!percent && (Math.abs(a + b - v) < 0.01 || Math.abs(a - b - v) < 0.01)) return true
    }
    return false
}

/** Citation markers a model invents ("[Snapshot]", "[show: cycles]"): removed when a repair did not remove them. */
export function stripMarkers(answer: string): string {
    return answer.replace(/\s*\[(?!E\d)(?:snapshot(?: card)?|show:[^\]\n]*|sources?[^\]\n]*|card|evidence)\]/gi, "")
}

/** Marks unsourced numbers in rendered HTML; entities and code are left alone. */
export function markUnsourced(html: string, sources: string): { html: string; count: number } {
    const known = numbersOf(sources)
    let count = 0
    let inCode = 0
    const parts = html.split(/(<[^>]+>)/)
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (p.startsWith("<")) {
            if (/^<(code|pre)\b/i.test(p)) inCode++
            else if (/^<\/(code|pre)>/i.test(p)) inCode = Math.max(0, inCode - 1)
            continue
        }
        if (inCode) continue
        parts[i] = p.split(/(&#?\w+;)/).map(seg => seg.startsWith("&") ? seg : seg.replace(NUMBER, (all, whole: string, frac?: string) => {
            const v = Number(`${whole.replace(/,/g, "")}${frac ? `.${frac}` : ""}`)
            if (trivial(v, frac)) return all
            if (known.has(String(v)) || known.has(String(Math.round(v))) || (frac && (known.has(v.toFixed(1)) || known.has(v.toFixed(2))))) return all
            count++
            return `<span class="ask-unsourced" title="No evidence in this conversation holds this number">${all}</span>`
        })).join("")
    }
    return { html: parts.join(""), count }
}

const GAVE_UP = /\b(cannot|can't|can not|unable to|not possible|no way to|does(?:n't| not) (?:show|provide|contain|include|have|list)|isn't available|not available|no tool|insufficient|not enough (?:data|information))\b/i
const VERDICT = /\b(bad design|poorly designed|terrible|a mess|messy|spaghetti|garbage|awful|horrible|well[- ]designed|excellent architecture|clean architecture|severe(ly)? (degradation|problems?)|degradation|lack of (architectural )?oversight|velocity|intended (separation|architecture|design|boundar\w*))\b/i

export interface CheckInput {
    question: string
    answer: string
    sources: string
    /** The snapshot card: its numbers need no citation. */
    card?: string
    toolCalls: number
    evidenceIds: Set<string>
    /** The turn used intents: repairs name intents, not the legacy tools. */
    intents?: boolean
    /** The exhibits the turn made: a ranking the answer cites must rank by what was asked. */
    exhibits?: TopicExhibit[]
}

/** The legacy tools a capability names, as the intents that answer the same question. */
export const INTENT_FOR: Record<string, string> = {
    layers: "structure", tangles: "structure", untangle: "structure", cycles: "structure",
    graph: "dependencies", component: "about", mass: "about", cookbook: "about", sql: "about", schema: "about", run_code: "rank",
    rank: "rank", files_of: "code", file_outline: "code", file_read: "code", code_search: "code",
    activity: "change", cochange: "change", knowledge: "people", knowledge_map: "people", find: "search", capabilities: "explain",
    look_at_view: "about", on_screen: "about", show: "about", playbook: "about",
}

export interface CheckOutcome { checks: Check[]; repair: string | null; suggestions: Capability[] }

export function checkAnswer(i: CheckInput): CheckOutcome {
    const checks: Check[] = []
    const unsourced = unsourcedNumbers(i.answer, i.sources)
    checks.push({ id: "unsourced", ok: unsourced.length === 0, detail: unsourced.length ? `No source for ${unsourced.join(", ")}` : "Every number traced to evidence" })

    const cited = [...i.answer.matchAll(/\bE(\d+(?:\.\d+)?)\b/g)].map(m => `E${m[1]}`)
    // Made-up markers ("[Snapshot]", "[show: cycles]") read as citations and point at nothing.
    // Code spans hold real brackets (Nuxt's `[name]` folders, array types): not markers.
    const prose = i.answer.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ")
    // Brackets inside a path (`components/[name]/index.vue`) are part of the path.
    const markers = [...prose.matchAll(/(?<![/\w])\[(?!E\d)([A-Za-z][^\]\n]{0,40})\](?![/(\w])/g)].map(m => m[0]).filter(m => !/^\[[ x]\]$/.test(m))
    const unknown = cited.filter(c => !i.evidenceIds.has(c))
    // Numbers the card already holds need no citation; any other number needs one somewhere in the answer.
    const cardNumbers = numbersOf(i.card ?? "")
    const cardVals = [...cardNumbers].map(Number)
    const answerNums = [...numbersOf(i.answer.replace(/\bE\d+(?:\.\d+)?\b/g, "").replace(/^\s*(?:#{1,6}\s*)?\d+[.)]\s/gm, " "))].map(Number)
    // Numbers from the card, or worked out from card numbers, need no citation.
    const fromCard = (v: number) => cardNumbers.has(String(v)) || cardVals.some(a => cardVals.some(b => b && a !== b && Math.abs((100 * a) / b - v) < 0.6))
    const hasNumbers = answerNums.some(v => v > 3 && !fromCard(v))
    const uncitedOk = unknown.length === 0 && (!hasNumbers || cited.length > 0 || i.evidenceIds.size === 0)
    const citesOk = uncitedOk && markers.length === 0
    checks.push({ id: "uncited", ok: citesOk, detail: unknown.length ? `Cites ids no tool returned: ${[...new Set(unknown)].join(", ")}` : markers.length ? `Made-up markers: ${[...new Set(markers)].slice(0, 3).join(", ")}` : !uncitedOk ? "States numbers without citing evidence" : "Citations resolve" })

    const suggestions = searchCapabilities(i.question, 2)
    // Only the best match counts: when it is a known "cannot" (coverage, runtime), saying so is right.
    const gaveUp = GAVE_UP.test(i.answer) && i.toolCalls < 2 && !!suggestions[0] && suggestions[0].tools.length > 0
    checks.push({ id: "gave-up", ok: !gaveUp, detail: gaveUp ? `Said it could not answer after ${i.toolCalls} tool call${i.toolCalls === 1 ? "" : "s"}; the catalogue says: ${suggestions[0]?.how ?? ""}` : "Did not give up early" })

    // File names no tool returned, and admitted guesses: the answer made them up.
    const fileNames = [...new Set([...i.answer.matchAll(/\b[\w-]+\.(java|kt|kts|scala|ts|tsx|js|jsx|mjs|vue|svelte|py|go|cs|php|rb|rs|swift|m|dart|sql|xml|yml|yaml|json|gradle)\b/gi)].map(m => m[0]))]
        .filter(f => !i.sources.includes(f) && !i.question.includes(f))
    const guessed = /\b(typical(ly)?|usually|standard (broadleaf|spring|java|project)?\s*structure|based on (common|typical|usual)|would likely be|are likely to be|I (assume|believe|expect) (it|they|the)|not listed[^.]*but)\b/i.exec(i.answer)
    checks.push({ id: "invented", ok: !fileNames.length && !guessed, detail: fileNames.length ? `Names no tool returned: ${fileNames.slice(0, 4).join(", ")}` : guessed ? `Guesses instead of looking ("${guessed[0]}")` : "Every name came from a tool" })

    // A menu instead of an answer ("Would you like to see: 1… 2… 3…").
    const menu = /^\s*(would you like|do you want|shall i|should i|what would you like|which (one|of these) would)/i.test(i.answer.trim())
    checks.push({ id: "menu", ok: !menu, detail: menu ? "Offered a menu instead of answering" : "Answers first" })

    // Right numbers, wrong question: the answer rests on a ranking of another measure than the one asked about.
    const topic = topicMismatch(i.question, i.answer, i.exhibits ?? [])
    const subject = topic ? null : subjectMismatch(i.question, i.answer, i.exhibits ?? [])
    checks.push({ id: "topic", ok: !topic && !subject, detail: topic ? `Asked about ${topic.asked}; the answer rests on a ranking by ${topic.ranked} [${topic.cites}]` : subject ? `Asked about ${subject.asked}; the answer does not use the figure that shows it [${subject.cites}]` : "Answers what was asked" })

    const verdict = i.answer.match(VERDICT)
    checks.push({ id: "verdict", ok: !verdict, detail: verdict ? `Verdict word "${verdict[0]}"` : "No verdicts" })

    let repair: string | null = null
    const invented = checks.find(c => c.id === "invented" && !c.ok)
    if (checks.find(c => c.id === "menu" && !c.ok)) {
        repair = "Answer the question first, in one or two sentences, from the tools (or say plainly that the scan cannot tell, and why). Offer at most one next step after that, as a sentence, not a menu."
    } else if (subject) {
        repair = `The question asks about ${subject.asked}. Answer it from [${subject.cites}], the figure you drew for it: confirm, push back, or say what it cannot tell, with its facts cited. Do not repeat an earlier answer.`
    } else if (topic) {
        repair = `The question asks about ${topic.asked}, but the ranking you cite [${topic.cites}] is by ${topic.ranked}: a different measure. ${i.intents ? `Call rank with measure "${topic.asked.replace(/ \(.*\)$/, "")}"` : "Rank by what was asked"}, then answer from that ranking, and do not describe one measure in the words of the other.`
    } else if (invented) {
        repair = `${invented.detail}. Do not guess names or facts: call the tool that lists them (files_of for a component's files, file_outline for a file, find for names), then answer from what it returns.`
    } else if (gaveUp) {
        repair = `You concluded it cannot be answered, but Archstats can: ${suggestions.map(s => `${s.asks[0]}: ${s.how} (tools: ${[...new Set(s.tools.map(t => (i.intents ? INTENT_FOR[t] ?? t : t)))].join(", ")})`).join(" / ")}. Use those tools now, then answer.`
    } else if (!checks[0].ok || !checks[1].ok || markers.length) {
        const parts: string[] = []
        if (unsourced.length) parts.push(`these numbers are in no tool result: ${unsourced.join(", ")}. Either call a tool that gives them or leave them out`)
        if (unknown.length) parts.push(`these ids were never returned: ${[...new Set(unknown)].join(", ")}. Cite only real ids`)
        if (!unknown.length && !uncitedOk) parts.push("cite the evidence id after each number, like [E2]")
        if (markers.length) parts.push(`remove these markers, they cite nothing: ${[...new Set(markers)].slice(0, 4).join(", ")}; cite only E-ids, and card numbers need no citation`)
        repair = `Revise your answer: ${parts.join("; ")}. Keep everything else.`
    } else if (verdict) {
        repair = `Replace the verdict "${verdict[0]}" with what the evidence shows. Keep everything else.`
    }
    return { checks, repair, suggestions }
}
