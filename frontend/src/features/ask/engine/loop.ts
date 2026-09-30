// One turn of the conversation: route → (plan) → act → draft → check →
// (one repair) → answer. Everything it does is reported as events, so the
// view can draw progress and the trace can be read afterwards; nothing here
// touches the app.

import { checkAnswer, stripMarkers } from "./checks"
import { systemPrompt } from "./prompt"
import { intentsPrompt } from "../intents/prompt"
import { figureHints, isBroad, route } from "./route"
import type { ExhibitPart, Fact } from "~/features/exhibits/types"
import { checkGrounding, recite, type Grounding } from "~/features/exhibits/grounding"
import { misjudged } from "./judgement"
import { viewCall } from "../intents/fromView"
import type { Check, Evidence, ModelClient, ModelMessage, ModelReply, Namespace, RanOn, Tool, ToolContext, ToolResult, TurnEvent, ViewContext, World } from "./types"

export interface TurnInput {
    question: string
    /** Earlier turns, already compacted. */
    history: ModelMessage[]
    model: ModelClient
    tools: Tool[]
    world: World
    card: string
    here: string
    onScreen: ViewContext | null
    ranOn: RanOn
    nextId: () => string
    recall: (id: string) => string | null
    /** Every source the conversation holds so far (card, earlier tool results), for the number audit. */
    sources: string
    /** Evidence ids already in the conversation. */
    evidenceIds: Set<string>
    signal: AbortSignal
    emit: (e: TurnEvent) => void
    maxSteps?: number
    think?: boolean
    /** Plan broad questions first (one extra model call). */
    plan?: boolean
    /** Pictures to show a model that can see (base64 PNG), sent with the question. */
    images?: string[]
    /** Test each claim of the plan in its own clean-context loop before answering (default on). */
    investigate?: boolean
    /** Wall time for the tool loop; past it the model answers from what it has. Default 150 s. */
    budgetMs?: number
    /** The model asks intents; the tools answer with exhibits (default: the legacy tools). */
    intents?: boolean
    /** Facts of earlier turns' exhibits: this answer may cite them too. */
    facts?: Fact[]
    /** Asked again strictly, after an answer its facts did not bear out: cite everything, or leave it out. */
    strict?: boolean
}

export interface TurnOutput {
    /** The messages this turn added: the question, tool traffic, the final answer. */
    messages: ModelMessage[]
    answer: string
    evidence: Evidence[]
    exhibits: ExhibitPart[]
    /** Each sentence of the answer against the facts it cites. */
    grounding: Grounding | null
    sources: string
    checks: Check[]
    tokens: { prompt: number; output: number; ms: number }
    toolCalls: number
    stopped: boolean
}

const INVESTIGATE = `You test one claim about a codebase with Archstats tools. Call the tools that test it (one to three calls), then reply, without thinking aloud, with exactly one line "Verdict: supported", "Verdict: refuted" or "Verdict: can't tell", followed by one to three plain sentences that give the deciding numbers with their evidence ids like [E4]. Only numbers from tool results. No verdicts on people or design quality.`

/** Questions that compare this scan with another: "since the last scan", "what got worse". */
export const COMPARES_SCANS = /\b(?:since (?:the |my )?(?:last|previous|prior|earlier) (?:scan|snapshot)|(?:got|gotten|getting) (?:worse|better)|between (?:the |two )?(?:scans|snapshots)|(?:compared?|vs\.?) (?:to |with )?(?:the )?(?:last|previous|prior|earlier) (?:scan|snapshot)|over the last (?:few )?scans)\b/i

/** What of one tool result enters the model's context; the rest is recallable by evidence id. */
const MAX_TOOL_TEXT = 6000

const PLAN_SCHEMA = {
    type: "object",
    properties: {
        claims: {
            type: "array", maxItems: 4,
            items: { type: "object", properties: { claim: { type: "string" }, test: { type: "string" } }, required: ["claim", "test"] },
        },
    },
    required: ["claims"],
}

export function toolSpec(t: Tool) {
    return {
        type: "function" as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: { type: "object", properties: t.params, required: t.required ?? [] },
        },
    }
}

async function chatWithRetry(model: ModelClient, req: Parameters<ModelClient["chat"]>[0], onDelta: Parameters<ModelClient["chat"]>[1], signal: AbortSignal, onRetry: () => void): Promise<ModelReply> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await model.chat(req, onDelta, signal)
        } catch (e: any) {
            // A local model sometimes writes a tool call its server cannot parse; asked again it usually lands.
            if (signal.aborted || attempt >= 2 || !/JSON|parse|tool call|unexpected end/i.test(String(e?.message ?? e))) throw e
            onRetry()
        }
    }
}

export async function runTurn(input: TurnInput): Promise<TurnOutput> {
    const { emit, signal } = input
    const tokens = { prompt: 0, output: 0, ms: 0 }
    const evidence: Evidence[] = []
    const exhibits: ExhibitPart[] = []
    const evidenceIds = new Set(input.evidenceIds)
    let sources = input.sources
    let toolCalls = 0
    /** Set when a tool asks the person to choose (a holder: TypeScript cannot see closure writes). */
    const pending: { asked: { question: string; options: string[] } | null } = { asked: null }
    let checks: Check[] = []

    // Route.
    const namespaces = new Set<Namespace>(route(input.question, { onScreen: !!input.onScreen }))
    const offered = () => input.tools.filter(t => namespaces.has(t.namespace))
    emit({ type: "route", namespaces: [...namespaces], tools: offered().map(t => t.name) })

    // Plan, for questions that judge the whole codebase.
    let plan: Array<{ claim: string; test: string }> | undefined
    if (input.plan !== false && isBroad(input.question)) {
        try {
            const reply = await input.model.chat({
                messages: [
                    { role: "system", content: `You plan an architecture investigation. Given the question and the snapshot, write 2 to 4 claims about the code that could be wrong and that together decide the answer (the central ones, not side details), each with the Archstats evidence that would test it (layers, tangles and cycles, dependents, rankings, co-change, file outlines). A claim is a checkable fact about structure or history ("the order module is in a tangle with catalog"), never about people's skill, intent or oversight, and never a judgement ("well designed", "a mess"). Reply as JSON.\n\nSnapshot:\n${input.card}` },
                    { role: "user", content: input.question },
                ],
                format: PLAN_SCHEMA,
                think: false,
            }, () => {}, signal)
            tokens.prompt += reply.promptTokens; tokens.output += reply.outputTokens; tokens.ms += reply.ms
            const parsed = JSON.parse(reply.content || "{}")
            plan = (parsed.claims ?? []).filter((c: any) => c?.claim).slice(0, 4)
            if (plan?.length) emit({ type: "plan", steps: plan })
        } catch { plan = undefined }
    }

    const system: ModelMessage = { role: "system", content: (input.intents ? intentsPrompt : systemPrompt)({ card: input.card, here: input.here, onScreen: input.onScreen, plan, strict: input.strict }) }
    emit({ type: "system", content: system.content, tools: offered().map(t => t.name) })
    // They asked to see something: name the tools that draw it, so the answer is figures, not a list.
    // With intents the engine draws what answers the question; the model is never told which tool draws.
    const hints = input.intents ? [] : figureHints(input.question)
    const drawNote = hints.length ? `\n\n(They want to see it: draw it with ${hints.join(", ")}${hints.includes("untangle") ? " (after tangles)" : ""}, and add show for a view if one fits. Then explain the pictures briefly.)` : ""
    const user: ModelMessage = input.images?.length
        ? { role: "user", content: `${input.question}${drawNote}\n\n(Attached: pictures of the figures on the view they came from. Read shapes and patterns from them; take every number from the tools.)`, images: input.images }
        : { role: "user", content: `${input.question}${drawNote}` }
    const added: ModelMessage[] = [user]
    const conversation = () => [system, ...input.history, ...added]

    const ctx: ToolContext = { world: input.world, ranOn: input.ranOn, nextId: input.nextId, recall: input.recall }

    /** Runs one tool call and reports it; returns the message the model reads. Large results enter the context as a preview. */
    async function runCall(callIn: { name: string; args: Record<string, any> }, prefix: string): Promise<ModelMessage> {
        let call = callIn
        const tool = input.tools.find(t => t.name === call.name)
        if (tool) call = { ...call, args: aliasArgs(tool, call.args ?? {}) }
        const callId = `${prefix}:${toolCalls}`
        toolCalls++
        const label = tool ? safeLabel(tool, call.args) : call.name
        emit({ type: "tool", phase: "start", callId, name: call.name, args: call.args, label })
        const t0 = now()
        let result: ToolResult
        let error: string | undefined
        if (!tool) {
            result = { text: `No tool named ${call.name}. Available: ${offered().map(t => t.name).join(", ")}.${input.intents ? "" : " Other namespaces load with load_tools."}` }
            error = "unknown tool"
        } else {
            try {
                result = await Promise.race([
                    tool.run(call.args ?? {}, ctx),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the tool took longer than 60 s")), 60_000)),
                ])
            } catch (e: any) {
                error = String(e?.message ?? e)
                result = { text: `The tool failed: ${error}. Check the arguments, or try another tool.` }
            }
        }
        for (const ns of result.load ?? []) namespaces.add(ns)
        if (result.askUser) pending.asked = result.askUser
        for (const ev of result.evidence ?? []) { evidence.push(ev); evidenceIds.add(ev.id) }
        for (const x of result.exhibits ?? []) { exhibits.push(x); evidenceIds.add(x.id); for (const f of x.facts) evidenceIds.add(f.id) }
        sources += `\n${result.text}`
        emit({ type: "tool", phase: "end", callId, name: call.name, result, ms: Math.round(now() - t0), error })
        const ids = [...(result.evidence ?? []).map(e => e.id), ...(result.exhibits ?? []).map(x => x.id)]
        const content = result.text.length > MAX_TOOL_TEXT
            ? `${result.text.slice(0, MAX_TOOL_TEXT)}\n…[${result.text.length - MAX_TOOL_TEXT} more characters${ids.length ? `; recall ${ids.join(", ")} for all of it` : ""}]`
            : result.text
        return { role: "tool", tool_name: call.name, content }
    }
    // Each claim of the plan is tested in its own short loop with a clean context,
    // so a local model's window is not flooded; the answer is then written from
    // what the tests found.
    if (plan?.length && input.investigate !== false) {
        const findings: string[] = []
        for (const [i, c] of plan.entries()) {
            if (signal.aborted) break
            emit({ type: "claim", index: i, status: "testing" })
            const own = new Set<Namespace>(route(`${c.claim} ${c.test}`, { onScreen: false }))
            const tools = () => input.tools.filter(t => own.has(t.namespace) || namespaces.has(t.namespace) && t.namespace !== "view")
            const msgs: ModelMessage[] = [
                { role: "system", content: `${INVESTIGATE}\n\nThe snapshot:\n${input.card}` },
                { role: "user", content: `Claim: ${c.claim}\nHow to test it: ${c.test}` },
            ]
            let verdict: "supported" | "refuted" | "can't tell" = "can't tell"
            let summary = ""
            for (let k = 0; k < 4 && !signal.aborted; k++) {
                const last = k === 3
                let reply: ModelReply
                try {
                    reply = await chatWithRetry(input.model, { messages: msgs, tools: last ? undefined : tools().map(toolSpec), think: false }, () => {}, signal, () => {})
                } catch { break }
                tokens.prompt += reply.promptTokens; tokens.output += reply.outputTokens; tokens.ms += reply.ms
                if (reply.toolCalls.length && !last) {
                    msgs.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls.map(x => ({ function: { name: x.name, arguments: x.args } })) })
                    for (const call of reply.toolCalls) msgs.push(await runCall(call, `c${i}.${k}`))
                    continue
                }
                const text = reply.content.trim()
                // The last verdict line counts; what follows it is the summary, what precedes it was thinking aloud.
                const all = [...text.matchAll(/verdict:\s*\**\s*(supported|refuted|can'?t tell|cannot tell)\**[^\n]*/gi)]
                const m = all[all.length - 1]
                verdict = m ? (m[1].toLowerCase().startsWith("sup") ? "supported" : m[1].toLowerCase().startsWith("ref") ? "refuted" : "can't tell") : "can't tell"
                const tail = m ? text.slice(m.index! + m[0].length).trim() : ""
                const sentences = (tail || text).replace(/^(wait|hmm|let me|actually|okay|ok)\b[^.]*\.\s*/gim, "").split(/(?<=[.!?])\s+/).filter(x => !/^(wait|hmm|let me|actually|so the claim)/i.test(x))
                summary = (tail ? sentences.slice(0, 3) : sentences.slice(-2)).join(" ").trim()
                break
            }
            emit({ type: "claim", index: i, status: "done", verdict, summary })
            findings.push(`${i + 1}. ${c.claim} — ${verdict}. ${summary}`)
        }
        if (findings.length) added.push({ role: "user", content: `[Findings] Your plan was tested:\n${findings.join("\n")}\nAnswer the question from these findings and their evidence ids. Call more tools only if something is missing.` })
    }

    // A question that compares scans: the one thing Ask cannot do from a snapshot. The offer of the Changes
    // view is made before the model speaks, so it says so from a tool result instead of guessing what changed.
    if (input.intents && COMPARES_SCANS.test(input.question) && input.tools.some(t => t.name === "compare")) {
        added.push({ role: "assistant", content: "", tool_calls: [{ function: { name: "compare", arguments: {} } }] })
        added.push(await runCall({ name: "compare", args: {} }, "pre"))
    }
    // Asked about a view: its own figure first, so "this" rests on what the person was looking at, with facts to cite.
    const fromView = input.intents ? viewCall(input.onScreen) : null
    if (fromView && input.tools.some(t => t.name === fromView.name)) {
        added.push({ role: "assistant", content: "", tool_calls: [{ function: { name: fromView.name, arguments: fromView.args } }] })
        added.push(await runCall({ name: fromView.name, args: fromView.args as Record<string, any> }, "view"))
    }
    const allFacts = () => [...(input.facts ?? []), ...exhibits.flatMap(x => x.facts)]
    /** The answer's checks, and whether it calls a value good or bad against where it ranks. */
    const judged = (ans: string, base: Check[]): Check[] => {
        if (!input.intents) return base
        const m = misjudged(ans, input.world)
        return [...base, { id: "judgement", ok: !m.length, detail: m.length ? m.map(x => x.detail).join("; ") : "Judgements agree with rank" }]
    }

    const maxSteps = input.maxSteps ?? 10
    let repairs = 0
    let answer = ""
    let draftBeforeRepair = ""
    let stopped = false

    const started = now()
    const budget = input.budgetMs ?? 150_000
    let finalCall = false
    for (let step = 0; step < maxSteps; step++) {
        if (signal.aborted) { stopped = true; break }
        // Out of steps or time: one last call without tools, to answer from the evidence already found.
        if (!finalCall && toolCalls > 0 && (step === maxSteps - 1 || now() - started > budget)) {
            finalCall = true
            added.push({ role: "user", content: "[Check] Time to answer. Use only the evidence you already have; say what you could not check." })
            emit({ type: "repair", reason: "Out of time or steps: answering from the evidence found so far." })
        }
        emit({ type: "model", step, phase: "start" })
        let reply: ModelReply
        try {
            reply = await chatWithRetry(input.model, {
                messages: conversation(),
                tools: finalCall ? undefined : offered().map(toolSpec),
                think: input.think,
            }, d => emit({ type: "delta", content: d.content, thinking: d.thinking }), signal, () => emit({ type: "draft-reset" }))
        } catch (e: any) {
            if (signal.aborted) { stopped = true; break }
            throw e
        }
        tokens.prompt += reply.promptTokens; tokens.output += reply.outputTokens; tokens.ms += reply.ms
        emit({ type: "model", step, phase: "end", reply })
        if (reply.stopped || signal.aborted) { stopped = true; answer = reply.content; break }

        if (reply.toolCalls.length && !finalCall) {
            // Words written before a tool call are the model thinking aloud; the answer comes after.
            emit({ type: "draft-reset" })
            added.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls.map(c => ({ function: { name: c.name, arguments: c.args } })) })
            for (const call of reply.toolCalls) added.push(await runCall(call, `${step}`))
            // The model asked the person to choose: the turn ends on the question.
            const asked = pending.asked
            if (asked) {
                answer = asked.question
                added.push({ role: "assistant", content: `${asked.question} (${asked.options.join(" / ")})` })
                emit({ type: "choices", question: asked.question, options: asked.options })
                break
            }
            continue
        }

        // A draft answer: check it before it is shown.
        answer = reply.content.trim()
        if (!answer && !signal.aborted) {
            // An empty answer after the tools: asked once more, then said plainly.
            const again = await chatWithRetry(input.model, { messages: [...conversation(), { role: "user", content: "[Check] (Automatic, not the person.) Write the answer now in plain words from the tool results above, citing their ids. If they do not answer the question, say what they do show and what is missing." }], think: false }, d => emit({ type: "delta", content: d.content, thinking: d.thinking }), signal, () => {})
            tokens.prompt += again.promptTokens; tokens.output += again.outputTokens; tokens.ms += again.ms
            answer = again.content.trim()
            if (!answer) answer = `I looked at ${toolCalls} thing${toolCalls === 1 ? "" : "s"} but could not put an answer together. The evidence is below: ${[...new Set([...evidence.filter(e => e.kind !== "link").map(e => e.id), ...exhibits.map(x => x.id)])].map(id => `[${id}]`).join(" ")}.`
        }
        let outcome = checkAnswer({ question: input.question, answer, sources, card: input.card, toolCalls, evidenceIds, intents: input.intents, exhibits })
        // Only the citations are missing and every number is sourced: the harness names the sources
        // itself. Asking a local model to rewrite a long list to add ids can scramble it.
        const onlyUncited = outcome.checks.every(c => c.ok || c.id === "uncited") && /without citing/.test(outcome.checks.find(c => c.id === "uncited")?.detail ?? "")
        if (onlyUncited && (evidence.length || exhibits.length)) {
            answer = `${answer}\n\n*Sources: ${[...new Set([...evidence.filter(e => e.kind !== "link").map(e => e.id), ...exhibits.map(x => x.id)])].map(id => `[${id}]`).join(" ")}*`
            outcome = checkAnswer({ question: input.question, answer, sources, card: input.card, toolCalls, evidenceIds, intents: input.intents, exhibits })
        }
        // Citations put right without a model: a wrong or missing one moved to the one fact that holds the sentence.
        if (input.intents && allFacts().length) {
            const r = recite(answer, allFacts(), { given: input.question })
            if (r.fixed) { answer = r.text; outcome = checkAnswer({ question: input.question, answer, sources, card: input.card, toolCalls, evidenceIds, intents: input.intents, exhibits }) }
        }
        outcome = { ...outcome, checks: judged(answer, outcome.checks) }
        if (!outcome.repair && input.intents) {
            const wrong = misjudged(answer, input.world)
            if (wrong.length) outcome.repair = `Revise: ${wrong.map(x => x.fix).join(" ")} Keep everything else.`
        }
        // An answer about the code that looked nothing up: the card orients, the tools answer. Once.
        // It comes first: any other repair of an answer that looked nothing up only polishes a guess.
        if (input.intents && toolCalls === 0 && /\d/.test(answer)) {
            outcome.repair = "Ask the codebase with a tool before answering: the snapshot card only orients you. Call the tool for this question (structure, about, rank…), then answer from its facts, citing them."
        }
        // What the facts still do not bear out: one repair that names each sentence and why, before anything is shown.
        if (!outcome.repair && input.intents && allFacts().length) {
            const bad = checkGrounding(answer, allFacts(), { given: input.question }).claims.filter(c => c.verdict === "unsupported" || c.verdict === "uncited")
            if (bad.length) outcome.repair = `Revise: these sentences are not backed by the facts they cite. ${bad.slice(0, 6).map(c => `"${c.sentence.replace(/\s*\[E[^\]]*\]/g, "").slice(0, 160)}": ${c.reasons.join("; ")}.`).join(" ")} For each, cite the fact that holds its number, or leave the sentence out. Keep everything else.`
        }
        checks = outcome.checks
        emit({ type: "checks", checks })
        if (outcome.repair && repairs < (input.intents ? 2 : 1) && !finalCall && step < maxSteps - 1) {
            repairs++
            if (outcome.checks.find(c => c.id === "gave-up" && !c.ok)) {
                for (const s of outcome.suggestions) for (const name of s.tools) {
                    const t = input.tools.find(x => x.name === name)
                    if (t) namespaces.add(t.namespace)
                }
            }
            emit({ type: "repair", reason: outcome.repair })
            emit({ type: "draft-reset" })
            draftBeforeRepair = answer
            added.push({ role: "assistant", content: reply.content })
            added.push({ role: "user", content: `[Check] (An automatic check, not the person: do not mention it, thank for it or apologise; just give the corrected answer.) ${outcome.repair}` })
            continue
        }
        // A repair that came back scrambled (digits glued to words, broken markup) is worse than the draft it repaired.
        if (draftBeforeRepair && garbled(answer) > garbled(draftBeforeRepair) + 2) answer = draftBeforeRepair
        // An answer opens with the answer, never with an apology to a check the person never saw.
        answer = answer.replace(/^\s*(you'?re right|you are right|i apologi[sz]e|apologies|sorry|good catch|thanks for (the|pointing))[^.!\n]*[.!]\s*(i should have[^.!\n]*[.!]\s*)?/i, "")
        // Markers a repair did not remove cite nothing: they go, and so do ids no tool returned.
        // A range of facts ([E6.1–E6.14]) cites the exhibit they belong to.
        answer = answer.replace(/\[(E\d+)\.\d+\s*[–—-]\s*(?:E?\d+\.)?\d+\]/g, "[$1]")
        answer = stripMarkers(answer).replace(/\[(E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*)\]/g, (all, list: string) => {
            const kept = list.split(/\s*,\s*/).filter(id => evidenceIds.has(id))
            return kept.length ? `[${kept.join(", ")}]` : ""
        })
        if (input.intents && allFacts().length) answer = recite(answer, allFacts(), { given: input.question }).text
        checks = judged(answer, checkAnswer({ question: input.question, answer, sources, card: input.card, toolCalls, evidenceIds, intents: input.intents, exhibits }).checks)
        emit({ type: "checks", checks })
        added.push({ role: "assistant", content: answer })
        break
    }

    if (!stopped && !answer.trim() && !pending.asked && !signal.aborted) {
        try {
            const again = await chatWithRetry(input.model, { messages: [...conversation(), { role: "user", content: "[Check] (Automatic, not the person.) Write the answer now in plain words from the tool results above, citing their ids. If they do not answer the question, say what they do show and what is missing." }], think: false }, d => emit({ type: "delta", content: d.content, thinking: d.thinking }), signal, () => {})
            tokens.prompt += again.promptTokens; tokens.output += again.outputTokens; tokens.ms += again.ms
            answer = stripMarkers(again.content.trim())
        } catch { /* fall through to the plain statement */ }
        if (!answer.trim()) answer = `I looked at ${toolCalls} thing${toolCalls === 1 ? "" : "s"} but could not put an answer together. The evidence is below: ${[...new Set([...evidence.filter(e => e.kind !== "link").map(e => e.id), ...exhibits.map(x => x.id)])].map(id => `[${id}]`).join(" ")}.`
        added.push({ role: "assistant", content: answer })
        if (input.intents && allFacts().length) answer = recite(answer, allFacts(), { given: input.question }).text
        checks = judged(answer, checkAnswer({ question: input.question, answer, sources, card: input.card, toolCalls, evidenceIds, intents: input.intents, exhibits }).checks)
        emit({ type: "checks", checks })
    }
    if (!stopped) emit({ type: "done", answer })
    const grounding = exhibits.length || input.facts?.length ? checkGrounding(answer, [...(input.facts ?? []), ...exhibits.flatMap(x => x.facts)], { given: input.question }) : null
    return { messages: added, answer, evidence, exhibits, grounding, sources, checks, tokens, toolCalls, stopped }
}

/** How scrambled a text looks: words glued to digits, orphan emphasis, broken ids. */
export function garbled(text: string): number {
    return (text.match(/\b[a-z]{3,}\d{2,}\b|\b\d+[a-z]{3,}\b/gi) ?? []).length + (text.match(/\*\*\s*[—–-]\*\*|\[E\s*\n|\n\d\]/g) ?? []).length * 2
}

/** Arguments a model names loosely (a component passed as "name", a file as "file"): mapped to the tool's own. */
function aliasArgs(t: Tool, args: Record<string, any>): Record<string, any> {
    const out = { ...args }
    const has = (k: string) => k in t.params
    const pairs: Array<[string, string]> = [["component", "name"], ["name", "component"], ["path", "file"], ["path", "name"], ["text", "query"], ["query", "text"], ["metric", "by"]]
    for (const [want, alt] of pairs) if (has(want) && out[want] === undefined && out[alt] !== undefined && !has(alt)) out[want] = out[alt]
    return out
}

function safeLabel(t: Tool, args: Record<string, any>): string {
    try { return t.label(args ?? {}) } catch { return t.name }
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
