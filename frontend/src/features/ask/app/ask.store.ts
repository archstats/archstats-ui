import { acceptHMRUpdate, defineStore } from "pinia"
import { markRaw } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useStateStore } from "~/platform/state.store"
import { useReportsStore } from "~/features/reports/reports.store"
import { useEvidenceStore } from "~/features/reports/evidence.store"
import { newId, type Block } from "~/features/reports/reportDoc"
import { runTurn } from "../engine/loop"
import { compact } from "../engine/compact"
import type { Check, Evidence, ModelMessage, Namespace, RanOn, ViewContext } from "../engine/types"
import type { ExhibitPart } from "~/features/exhibits/types"
import type { Grounding } from "~/features/exhibits/grounding"
import { buildCard, type SnapshotCard } from "../knowledge/card"
import { INTENTS, TOOLS, useIntents } from "../tools"
import { appWorld } from "./world"
import { listModels, ollamaClient, type LocalModel } from "./ollama"
import { answerBlocks, checkBlocks, draftPrompt, evidenceBlocks, exhibitBlock, reportable } from "./toReport"
import { brokenCitations, trustedText, untrusted } from "../render/verdict"
import { suggestTemplates, writeReport, type TemplateSuggestion, type WriteProgress } from "./writer"
import { Embed } from "wailsjs/go/app/AskService"
import { pointsAtView } from "./deixis"

const embedLocal = async (texts: string[]) => (await Embed("nomic-embed-text", texts)) as number[][]
let writeController: AbortController | null = null

// Ask: conversations with a local model about the open snapshot. A
// conversation belongs to one snapshot; questions about another start a new
// one. Conversations are kept per workspace, with their evidence, so the
// person can come back to one and turn it into a report.

export interface Step {
    callId: string
    name: string
    label: string
    args: Record<string, any>
    status: "running" | "done" | "error"
    ms?: number
    text?: string
    evidenceIds: string[]
}

export interface TraceCall { step: number; promptTokens: number; outputTokens: number; ms: number; toolCalls: string[]; content: string; thinking: string }

export interface Turn {
    id: string
    question: string
    context: ViewContext | null
    askedAt: string
    model: string
    status: "running" | "done" | "stopped" | "error"
    error?: string
    /** What it is doing right now, in words, while it runs. */
    phase?: string
    namespaces: Namespace[]
    plan: Array<{ claim: string; test: string }>
    /** Evidence ids that repeat an earlier piece of this turn: cited, they point at the original card. */
    aliases?: Record<string, string>
    /** Where this turn's messages start in the thread's history, so it can be taken back. */
    historyFrom?: number
    /** The person's verdict on the answer, for improving the harness. */
    feedback?: "up" | "down"
    /** A question back to the person, with options to click. */
    choices?: { question: string; options: string[] }
    /** What testing each claim of the plan found. */
    claims?: Array<{ status: "waiting" | "testing" | "done"; verdict?: string; summary?: string }>
    steps: Step[]
    answer: string
    thinking: string
    evidence: Evidence[]
    /** Exhibits the tools made (absent in threads from before exhibits). */
    exhibits?: ExhibitPart[]
    /** Each sentence of the answer against the facts it cites. */
    grounding?: Grounding | null
    checks: Check[]
    repairs: string[]
    followUps: string[]
    tokens: { prompt: number; output: number; ms: number }
    trace: TraceCall[]
}

export interface Thread {
    id: string
    title: string
    scanId: string
    snapshot: string
    createdAt: string
    updatedAt: string
    turns: Turn[]
    history: ModelMessage[]
    seq: number
    reportId: string | null
    written: string[]
}

const THREADS_KEY = "ask.threads"
const MODEL_KEY = "archstats.ask.model"
const THINK_KEY = "archstats.ask.think"
const PREFERRED = ["qwen3.6:35b-a3b", "qwen3-vl:30b", "gemma4:26b", "qwen3:30b", "qwen3-vl:8b", "qwen3:8b", "mistral:7b"]
/** Tokens of history kept whole before older tool results are shortened. */
const HISTORY_BUDGET = 9000

let controller: AbortController | null = null
const cards = new Map<string, Promise<SnapshotCard>>()

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(message)), ms)
        p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
    })
}

function cardFor(scanId: string, build: () => Promise<SnapshotCard>): Promise<SnapshotCard> {
    let p = cards.get(scanId)
    if (!p) { p = build(); cards.set(scanId, p); p.catch(() => cards.delete(scanId)) }
    return p
}

/** A thread as stored: tables capped so the workspace state stays small. */
function slim(t: Thread): Thread {
    return {
        ...t,
        turns: t.turns.map(u => ({
            ...u,
            status: u.status === "running" ? "stopped" : u.status,
            context: u.context ? { ...u.context, images: undefined } : u.context,
            steps: u.steps.map(s => ({ ...s, status: s.status === "running" ? "error" : s.status, text: s.text && s.text.length > 6000 ? `${s.text.slice(0, 6000)}…` : s.text })),
            // Preview images are drawn again on load; kept, one view's SVG can weigh half a megabyte.
            evidence: u.evidence.map(e => (e.kind === "table" ? { ...e, rows: e.rows.slice(0, 60) } : e.kind === "code" ? { ...e, lines: e.lines.slice(0, 160) } : e.kind === "view" ? { ...e, figures: [] } : e)),
        })),
        history: t.history.slice(-60).map(m => (m.images ? { ...m, images: undefined } : m)),
    }
}

export const useAskStore = defineStore("ask", {
    state: () => ({
        workspaceId: "" as string,
        threads: [] as Thread[],
        currentId: null as string | null,
        models: [] as LocalModel[],
        modelName: "" as string,
        think: false,
        modelsError: null as string | null,
        loadingModels: false,
        /** What the view the person came from showed; attached to the next question. */
        pendingContext: null as ViewContext | null,
        /** The view the person was on before coming to Ask by any route: offered, and taken when a question says "this". */
        lastView: null as ViewContext | null,
        running: false,
        inspector: { open: true, tab: "evidence" as "evidence" | "context" | "trace", evidenceId: null as string | null },
        writing: false,
        notice: "" as string,
        /** The last system prompt and tool list, for the trace (not persisted). */
        lastSystem: "" as string,
        lastTools: [] as string[],
        /** The snapshot card of the open scan, for the Context tab. */
        cardText: "" as string,
        /** The write-up sheet: template suggestions, then progress. */
        writeup: { open: false, loading: false, suggestions: [] as TemplateSuggestion[], chosen: null as string | null, progress: null as WriteProgress | null, error: "", reportId: null as string | null, title: "" },
        /** The conversation a turn is running in: one model, one question at a time. */
        runningThreadId: null as string | null,
    }),
    getters: {
        current(s): Thread | null { return s.threads.find(t => t.id === s.currentId) ?? null },
        model(s): LocalModel | null { return s.models.find(m => m.name === s.modelName) ?? null },
        openScanId(): string { return useDataStore()._openScanId ?? "" },
        /** The current conversation is about another snapshot than the open one. */
        stale(): boolean { const t = this.current; return !!t && !!t.turns.length && t.scanId !== this.openScanId },
        allEvidence(): Evidence[] { return this.current?.turns.flatMap(t => t.evidence) ?? [] },
        /** Repeated evidence ids → the card they repeat. */
        aliases(): Record<string, string> { return Object.assign({}, ...(this.current?.turns.map(t => t.aliases ?? {}) ?? [])) },
        sorted(s): Thread[] { return [...s.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    },
    actions: {
        load(workspaceId: string) {
            if (this.workspaceId === workspaceId && this.threads.length) return
            this.workspaceId = workspaceId
            this.threads = useStateStore().get<Thread[]>(THREADS_KEY, []) ?? []
            this.currentId = this.sorted[0]?.id ?? null
            try {
                this.think = localStorage.getItem(THINK_KEY) === "1"
            } catch { /* default */ }
        },
        save() {
            useStateStore().set(THREADS_KEY, this.threads.slice(-40).map(slim) as any)
        },
        async loadModels() {
            this.loadingModels = true
            this.modelsError = null
            try {
                this.models = await listModels()
                let saved = ""
                try { saved = localStorage.getItem(MODEL_KEY) ?? "" } catch { /* none */ }
                const usable = this.models.filter(m => m.tools)
                const pick = usable.find(m => m.name === saved) ?? PREFERRED.map(n => usable.find(m => m.name === n)).find(Boolean) ?? usable.find(m => !m.remote) ?? usable[0]
                this.modelName = pick?.name ?? ""
                if (!usable.length) this.modelsError = "No local model can call tools. Pull one, for example: ollama pull qwen3:8b"
            } catch (e: any) {
                this.modelsError = `Ollama is not answering. Start it (ollama serve) and try again. ${String(e?.message ?? e)}`
            } finally {
                this.loadingModels = false
            }
        },
        async loadCard() {
            const world = appWorld(() => null)
            if (!world.scanId) return
            try { this.cardText = (await cardFor(world.scanId, () => buildCard(world))).text } catch { this.cardText = "" }
        },
        setModel(name: string) {
            this.modelName = name
            try { localStorage.setItem(MODEL_KEY, name) } catch { /* best effort */ }
        },
        setThink(on: boolean) {
            this.think = on
            try { localStorage.setItem(THINK_KEY, on ? "1" : "0") } catch { /* best effort */ }
        },
        newThread(): Thread {
            const info = appWorld(() => null).info
            const t: Thread = {
                id: newId(), title: "New conversation", scanId: this.openScanId,
                snapshot: `${String(info.git_head_commit ?? "").slice(0, 7) || "snapshot"} · rev ${info.analysis_revision ?? "?"}`,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), turns: [], history: [], seq: 0, reportId: null, written: [],
            }
            this.threads.push(t)
            this.currentId = t.id
            this.inspector.evidenceId = null
            return this.threads[this.threads.length - 1]
        },
        select(id: string) {
            this.currentId = id
            this.inspector.evidenceId = null
        },
        remove(id: string) {
            if (this.running && this.currentId === id) this.stop()
            this.threads = this.threads.filter(t => t.id !== id)
            if (this.currentId === id) this.currentId = this.sorted[0]?.id ?? null
            this.save()
        },
        rename(id: string, title: string) {
            const t = this.threads.find(x => x.id === id)
            if (t && title.trim()) { t.title = title.trim().slice(0, 80); this.save() }
        },
        /** Stops the running turn. The view is released at once, whatever the model or a tool is still doing. */
        stop() {
            controller?.abort()
            const t = this.threads.flatMap(x => x.turns).find(x => x.status === "running")
            if (t) { t.status = "stopped"; t.phase = undefined }
            this.running = false
            this.runningThreadId = null
        },
        inspect(id: string | null, tab: "evidence" | "context" | "trace" = "evidence") {
            this.inspector.open = true
            this.inspector.tab = tab
            this.inspector.evidenceId = id
        },

        async send(question: string) {
            const q = question.trim()
            if (!q || this.running) return
            if (!this.models.length) await this.loadModels()
            const model = this.model
            if (!model) return
            let thread = this.current
            if (!thread || (thread.turns.length && thread.scanId !== this.openScanId)) thread = this.newThread()
            if (!thread.turns.length) thread.scanId = this.openScanId

            let context = this.pendingContext
            this.pendingContext = null
            // "Is this risky?" with nothing attached, just back from a view: that view is what "this" means,
            // in a new conversation or a running one. The offer lasts one question.
            if (!context && this.lastView && pointsAtView(q, true)) context = this.lastView
            this.lastView = null
            thread.turns.push({
                historyFrom: thread.history.length,
                id: newId(), question: q, context, askedAt: new Date().toISOString(), model: model.name, status: "running",
                namespaces: [], plan: [], steps: [], answer: "", thinking: "", evidence: [], exhibits: [], checks: [], repairs: [], followUps: [],
                tokens: { prompt: 0, output: 0, ms: 0 }, trace: [],
            })
            const turn = thread.turns[thread.turns.length - 1]
            if (thread.turns.length === 1) thread.title = q.length > 64 ? `${q.slice(0, 64).replace(/\s+\S*$/, "")}…` : q
            thread.updatedAt = new Date().toISOString()
            // Kept from the moment it is asked: a reload mid-answer keeps the question and what was found.
            this.save()

            const data = useDataStore()
            const ws = useWorkspacesStore()
            const world = appWorld(() => context)
            const info = world.info
            const ranOn: RanOn = { scanId: world.scanId, commit: info.git_head_commit ?? "", revision: Number(info.analysis_revision ?? 0), workspace: ws.active?.name ?? "" }
            const here = `Workspace ${ranOn.workspace}; snapshot of commit ${ranOn.commit.slice(0, 7) || "?"} (analysis revision ${ranOn.revision}). They are in the Ask view.`

            this.running = true
            this.runningThreadId = thread.id
            turn.phase = "Reading the snapshot"
            controller = new AbortController()
            const signal = controller.signal
            const thr = thread
            try {
                const card = await withTimeout(cardFor(world.scanId, () => buildCard(world)), 30_000, "Reading the snapshot took too long: the app may have lost its connection to its backend. Reload the window.")
                if (signal.aborted) return
                const earlier = thr.turns.slice(0, -1)
                const sources = [card.numbers, ...earlier.flatMap(t => t.steps.map(s => s.text ?? ""))].join("\n")
                const ids = new Set([...earlier.flatMap(t => t.evidence.map(e => e.id)), ...earlier.flatMap(t => (t.exhibits ?? []).flatMap(x => [x.id, ...x.facts.map(f => f.id)]))])
                const out = await runTurn({
                    question: q,
                    history: compact(thr.history, HISTORY_BUDGET),
                    model: markRaw(ollamaClient(model)),
                    tools: useIntents() ? INTENTS : TOOLS,
                    intents: useIntents(),
                    facts: earlier.flatMap(t => (t.exhibits ?? []).flatMap(x => x.facts)),
                    world,
                    card: card.text,
                    here,
                    onScreen: context,
                    ranOn,
                    nextId: () => `E${++thr.seq}`,
                    recall: id => thr.turns.flatMap(t => t.steps).find(s => s.evidenceIds.includes(id))?.text ?? null,
                    sources,
                    evidenceIds: ids,
                    signal,
                    think: this.think,
                    images: model.vision && context?.images?.length ? context.images.map(i => i.png) : undefined,
                    emit: e => {
                        switch (e.type) {
                            case "route": turn.namespaces = e.namespaces; break
                            case "plan": turn.plan = e.steps; turn.claims = e.steps.map(() => ({ status: "waiting" })); turn.phase = "Testing the claims"; break
                            case "claim":
                                if (turn.claims?.[e.index]) turn.claims[e.index] = { status: e.status, verdict: e.verdict, summary: e.summary }
                                if (e.status === "testing") turn.phase = `Testing claim ${e.index + 1} of ${turn.plan.length}`
                                break
                            case "system": this.lastSystem = e.content; this.lastTools = e.tools; break
                            case "delta": turn.answer += e.content; turn.thinking += e.thinking; if (e.content) turn.phase = "Writing"; break
                            case "draft-reset": turn.answer = ""; break
                            case "model":
                                if (e.phase === "start") turn.phase = turn.steps.length ? "Reading what it found" : "Deciding where to look"
                                if (e.phase === "end") turn.trace.push({ step: e.step, promptTokens: e.reply.promptTokens, outputTokens: e.reply.outputTokens, ms: e.reply.ms, toolCalls: e.reply.toolCalls.map(c => `${c.name}(${JSON.stringify(c.args)})`), content: e.reply.content.slice(0, 2000), thinking: e.reply.thinking.slice(0, 2000) })
                                break
                            case "tool":
                                if (e.phase === "start") { turn.steps.push({ callId: e.callId, name: e.name, label: e.label, args: e.args, status: "running", evidenceIds: [] }); turn.phase = e.label }
                                else {
                                    const s = turn.steps.find(x => x.callId === e.callId)
                                    if (s) { s.status = e.error ? "error" : "done"; s.ms = e.ms; s.text = e.result.text; s.evidenceIds = [...(e.result.evidence ?? []).map(x => x.id), ...(e.result.exhibits ?? []).map(x => x.id)] }
                                    for (const x of e.result.exhibits ?? []) (turn.exhibits ??= []).push(x)
                                    for (const ev of e.result.evidence ?? []) {
                                        // The same lookup twice is one card; the second id points at the first.
                                        const key = (x: Evidence) => `${x.kind}|${x.title}|${"sql" in x ? x.sql ?? "" : ""}|${x.kind === "component" ? x.name : ""}`
                                        const same = turn.evidence.find(x => key(x) === key(ev))
                                        if (same) turn.aliases = { ...(turn.aliases ?? {}), [ev.id]: same.id }
                                        else turn.evidence.push(ev)
                                    }
                                    for (const f of e.result.followUps ?? []) if (!turn.followUps.includes(f)) turn.followUps.push(f)
                                    this.save()
                                }
                                break
                            case "checks": turn.checks = e.checks; break
                            case "choices": turn.choices = { question: e.question, options: e.options }; turn.answer = e.question; break
                            case "repair": turn.repairs.push(e.reason); turn.phase = "Revising after a check"; break
                            case "done": turn.answer = e.answer; break
                            case "error": turn.error = e.message; break
                        }
                    },
                })
                turn.tokens = out.tokens
                turn.grounding = out.grounding
                if (turn.status === "running") turn.status = out.stopped ? "stopped" : "done"
                if (out.stopped && !turn.answer) turn.answer = ""
                thr.history.push(...out.messages)
                turn.followUps = turn.followUps.slice(0, 3)
            } catch (e: any) {
                if (turn.status === "running") {
                    turn.status = signal.aborted ? "stopped" : "error"
                    if (!signal.aborted) turn.error = String(e?.message ?? e)
                }
            } finally {
                turn.phase = undefined
                if (this.runningThreadId === thr.id) { this.running = false; this.runningThreadId = null }
                controller = null
                thr.updatedAt = new Date().toISOString()
                this.save()
            }
        },

        /** The conversation's own report, opened; made on first use. Never another report the person has open. */
        async ownReport(thread: Thread): Promise<{ created: boolean } | null> {
            const reports = useReportsStore()
            const ws = useWorkspacesStore()
            if (!ws.active) return null
            if (reports.workspace !== ws.active.id) await reports.load(ws.active.id)
            if (thread.reportId && reports.list.some(r => r.id === thread.reportId)) {
                if (reports.currentId !== thread.reportId) reports.open(thread.reportId)
                return { created: false }
            }
            const intro: Block = { id: newId(), kind: "p", text: "", prompt: "Why this was looked into, and for whom. Drafted from an Ask conversation: each answer waits below as a prompt, and nothing of it prints until you write it in your own words." }
            const rec = await reports.create(`Ask: ${thread.title}`, [intro])
            if (!rec) return null
            thread.reportId = rec.id
            thread.written = []
            this.save()
            return { created: true }
        },

        async addToReport(e: Evidence): Promise<string | null> {
            const thread = this.current
            if (!thread || !reportable(e)) return null
            const own = await this.ownReport(thread)
            if (!own) return null
            const reports = useReportsStore()
            const last = reports.doc.blocks[reports.doc.blocks.length - 1]
            const blocks = evidenceBlocks(e)
            const id = reports.insert(last?.id ?? null, blocks)
            const first = blocks[0]
            if (id && first?.kind === "cell" && !first.cell.output) void reports.run(id)
            return reports.current?.title ?? null
        },

        /** One exhibit into the conversation's report, run on the report's snapshot. */
        async addExhibitToReport(x: ExhibitPart, highlight: string[] = []): Promise<string | null> {
            const thread = this.current
            if (!thread) return null
            const own = await this.ownReport(thread)
            if (!own) return null
            const reports = useReportsStore()
            const last = reports.doc.blocks[reports.doc.blocks.length - 1]
            const id = reports.insert(last?.id ?? null, [exhibitBlock(x, highlight)])
            if (id) void reports.run(id)
            return reports.current?.title ?? null
        },

        /** Each answered question not yet written becomes a section: heading, the answer as a prompt, the evidence as cells. */
        async writeUp(): Promise<{ title: string; sections: number } | null> {
            const thread = this.current
            if (!thread || this.writing) return null
            this.writing = true
            try {
                const own = await this.ownReport(thread)
                if (!own) return null
                const reports = useReportsStore()
                const blocks: Block[] = []
                let sections = 0
                for (const t of thread.turns) {
                    if (t.status !== "done" || thread.written.includes(t.id)) continue
                    const cells = t.evidence.filter(reportable).flatMap(evidenceBlocks)
                    if (!cells.length && !t.answer.trim()) continue
                    blocks.push({ id: newId(), kind: "h2", text: t.question.replace(/\?+$/, "").slice(0, 90) })
                    blocks.push({ id: newId(), kind: "p", text: "", prompt: draftPrompt(trustedText(t.answer, t.grounding)) })
                    blocks.push(...cells)
                    thread.written.push(t.id)
                    sections++
                }
                if (own.created) {
                    blocks.push({ id: newId(), kind: "h2", text: "What this cannot show" })
                    blocks.push({ id: newId(), kind: "p", text: "", prompt: "What the scan leaves out (ignored folders, tests, generated code), and any question the evidence could not answer." })
                }
                if (blocks.length) {
                    const at = reports.doc.blocks.findIndex(b => b.kind === "h2" && b.text === "What this cannot show")
                    const after = own.created || at <= 0 ? reports.doc.blocks[reports.doc.blocks.length - 1]?.id ?? null : reports.doc.blocks[at - 1].id
                    reports.insert(after, blocks)
                }
                void reports.runAll()
                this.save()
                return { title: reports.current?.title ?? "", sections }
            } finally {
                this.writing = false
            }
        },

        /** Takes back the last turn (its messages too) so it can be asked again or edited. */
        takeBack(turnId: string): { question: string; context: ViewContext | null } | null {
            const t = this.current
            if (!t || this.running) return null
            const i = t.turns.findIndex(x => x.id === turnId)
            if (i < 0 || i !== t.turns.length - 1) return null
            const turn = t.turns[i]
            t.history = t.history.slice(0, turn.historyFrom ?? t.history.length)
            t.turns.splice(i, 1)
            this.save()
            return { question: turn.question, context: turn.context }
        },
        async retry(turnId: string) {
            const back = this.takeBack(turnId)
            if (!back) return
            this.pendingContext = back.context
            await this.send(back.question)
        },
        rate(turnId: string, value: "up" | "down") {
            const turn = this.current?.turns.find(x => x.id === turnId)
            if (!turn) return
            turn.feedback = turn.feedback === value ? undefined : value
            this.save()
        },
        /** One answer into the conversation's report: its question as a heading, the answer, its evidence as cells. */
        async answerToReport(turnId: string): Promise<string | null> {
            const thread = this.current
            const turn = thread?.turns.find(x => x.id === turnId)
            if (!thread || !turn) return null
            const own = await this.ownReport(thread)
            if (!own) return null
            const reports = useReportsStore()
            const { fromMarkdown } = await import("~/features/reports/reportDoc")
            const ids = new Set(thread.turns.flatMap(t => [...(t.exhibits ?? []).flatMap(x => [x.id, ...x.facts.map(f => f.id)]), ...t.evidence.map(e => e.id)]))
            const blocks: Block[] = [{ id: newId(), kind: "h2", text: turn.question.replace(/\?+$/, "").slice(0, 90) }, ...answerBlocks(turn.answer, turn.exhibits ?? [], fromMarkdown, untrusted(turn.grounding).map(c => c.sentence)), ...checkBlocks(turn.grounding, brokenCitations(turn.answer, ids)), ...turn.evidence.filter(reportable).flatMap(evidenceBlocks)]
            const last = reports.doc.blocks[reports.doc.blocks.length - 1]
            reports.insert(last?.id ?? null, blocks)
            void reports.runAll()
            if (!thread.written.includes(turn.id)) thread.written.push(turn.id)
            this.save()
            return reports.current?.title ?? null
        },

        /** Opens the write-up sheet with the templates that fit this conversation. */
        async openWriteUp() {
            const thread = this.current
            if (!thread) return
            this.writeup = { open: true, loading: true, suggestions: [], chosen: null, progress: null, error: "", reportId: null, title: "" }
            try {
                this.writeup.suggestions = await suggestTemplates(thread, embedLocal, this.model ? ollamaClient(this.model) : undefined)
                this.writeup.chosen = this.writeup.suggestions.find(x => x.recommended)?.id ?? null
            } catch (e: any) { this.writeup.error = String(e?.message ?? e) } finally { this.writeup.loading = false }
        },
        /** Writes the report: the chosen template (or a free outline), every section written from its evidence. */
        async runWriteUp(templateId: string | null): Promise<string | null> {
            const thread = this.current
            const model = this.model
            if (!thread || !model) return null
            if (this.running) { this.writeup.error = "An answer is still being written. Write up can start when it is done."; return null }
            writeController = new AbortController()
            this.writeup.error = ""
            this.writeup.progress = { phase: "planning", sections: [], message: "Laying out the report" }
            this.running = true
            try {
                const r = await writeReport({ thread, templateId, model: ollamaClient(model), embed: embedLocal, signal: writeController.signal, progress: p => (this.writeup.progress = p) })
                this.writeup.reportId = r.reportId
                this.writeup.title = r.title
                thread.reportId = r.reportId
                this.save()
                return r.reportId
            } catch (e: any) {
                this.writeup.error = String(e?.message ?? e)
                if (this.writeup.progress) this.writeup.progress.phase = "error"
                return null
            } finally {
                this.running = false
                writeController = null
            }
        },
        cancelWriteUp() {
            writeController?.abort()
            this.writeup.open = false
        },

        /** Pins what the evidence pool can re-check on every scan: a component or a file, with its numbers. */
        async pin(e: Evidence): Promise<boolean> {
            const ev = useEvidenceStore()
            if (e.kind === "component") {
                const values = Object.fromEntries(e.values.filter(v => v.value !== null && v.id !== "cycles").map(v => [v.id, v.value as number]))
                return !!(await ev.pin({ kind: "component", entityKey: e.name, title: e.name, values, note: "Pinned from Ask" }))
            }
            if (e.kind === "file") return !!(await ev.pin({ kind: "file", entityKey: e.path, title: e.path, note: "Pinned from Ask" }))
            return false
        },

        flash(text: string) {
            this.notice = text
            setTimeout(() => { if (this.notice === text) this.notice = "" }, 4000)
        },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAskStore, import.meta.hot))
