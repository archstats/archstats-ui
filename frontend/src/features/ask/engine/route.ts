// Which tools to offer for a question. A local model picks worse the longer
// the tool list, so each turn offers the core set plus the namespaces the
// question points at; `load_tools` lets the model widen it when the guess
// was wrong. Deterministic and instant: no model call.

import type { Namespace } from "./types"

const SIGNALS: Array<[Namespace, RegExp]> = [
    ["cycles", /\b(cycl|tangl|circular|loop|mutual|each other|untangl|cut|strongly connected|scc)/i],
    ["graph", /\b(depend|path|route|between|around|reach|blast|impact|affect|ripple|uses?\b|used by|import|neighbou?r|transitiv|connected|coupl|layer)/i],
    ["files", /\b(file|class|code|method|function|line|read|source|implement|declar|annotation|grep|search|mention|usage|inside|contain|what does .* do|explain)/i],
    ["history", /\b(chang|churn|commit|history|histor|author|who|know|owner|bus factor|recent|activ|over time|timeline|together|co-?change|hidden|stale|old|age|maintain)/i],
    ["query", /\b(sql|query|how many|count|list all|per (month|year|component|file)|total|average|ratio|language|extension|role|test|module|rule)/i],
    ["view", /\b(this|these|here|on screen|figure|chart|table|view|looking at|show me|picture|visuali[sz]|draw|diagram|units|deployables|checks|findings)\b/i],
]

export function route(question: string, opts: { onScreen: boolean }): Namespace[] {
    const out = new Set<Namespace>(["core"])
    for (const [ns, re] of SIGNALS) if (re.test(question)) out.add(ns)
    if (opts.onScreen) out.add("view")
    // A filter or a join ("more than 20 dependents … the lowest health") is one script, not many calls.
    if (/\b(more than|less than|fewer than|at least|at most|over \d|under \d|above \d|below \d|among|of those|which of)\b/i.test(question) || /\b(lowest|highest|most|least|largest|smallest)\b[^?]*\b(with|whose|that|among|and)\b/i.test(question)) out.add("query")
    // A request to see something needs the drawing tools.
    if (/\b(show me|visuali[sz]|picture|diagram|draw|figure|chart|map)\b/i.test(question)) { out.add("graph"); out.add("cycles"); out.add("files"); out.add("history") }
    // A broad question gets the structure namespaces: it will need them.
    if (isBroad(question)) { out.add("graph"); out.add("cycles"); out.add("history") }
    return [...out]
}

/** Questions that deserve a plan: judgements over the whole codebase, not a lookup. */
export function isBroad(question: string): boolean {
    if (figureHints(question).length) return false
    return /\b(overall|architecture|assess|review|evaluate|how (good|healthy|well)|well (structured|designed|layered)|state of|biggest (risk|problem)s?|where should (we|i) (start|focus)|what would you|recommend|due diligence|modulari[sz]|split|extract|migrat)/i.test(question)
}

/** A request to see something: the drawing tools that answer it, in the order the words ask for them. */
export function figureHints(question: string): string[] {
    const q = question.toLowerCase()
    if (!/\b(show|see|visuali[sz]|picture|diagram|draw|figure|chart|map)\b/.test(q)) return []
    const out: string[] = []
    if (/\b(layer|architecture|structure|stack|depend|overview|shape)/.test(q)) out.push("layers")
    if (/\b(where (the )?code lives|mass|folder|map of|treemap|tests|size)/.test(q)) out.push("mass")
    if (/\b(tangl|cycle|circular)/.test(q)) out.push("untangle")
    if (/\b(know|who|owner|people|author)/.test(q)) out.push("knowledge_map")
    if (/\b(hotspot|risk|health)/.test(q)) out.push("rank")
    if (/\b(connection|graph|matrix|around|between)/.test(q)) out.push("graph")
    return out.length ? out : ["layers", "mass"]
}
