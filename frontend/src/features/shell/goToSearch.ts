import { charMask, matchNormalized, normalizeQuery } from "~/shared/fuzzy"

// The search behind Go to anything, kept free of stores so it can be tested
// and timed: an index of entries built once, a query read for its tab prefix
// and line suffix, and a search that only rescans what the last keystroke
// left when the query grows (typing "ordsvc" after "ord" scores the matches of
// "ord", not the whole snapshot again).

export type GoKind =
    | "view" | "metric" | "component" | "file" | "unit" | "function"
    | "author" | "group" | "lens" | "report" | "query" | "action" | "workspace"

export interface GoItem {
    kind: GoKind
    /** Stable within a workspace, for recents. */
    key: string
    label: string
    /** What the label is matched as, when it differs (a file's path, a view's other names). */
    text?: string
    /** Where the last segment of `text` starts. */
    tail?: number
    detail?: string
    to?: string
    /** The file a file, unit or function lives in, for "Name:42" jumps. */
    file?: string
    /** Scope to a group, or switch lens, instead of navigating. */
    group?: string
    lens?: string
    /** Runs instead of navigating: an action, a report, a saved query, a workspace. */
    run?: () => unknown
    /** Keys that run the action directly, shown beside it. */
    keys?: string[]
    /** Test code ranks below the code it tests. */
    test?: boolean
}

export type GoTab = "all" | "views" | "components" | "files" | "symbols" | "reports" | "actions"

export const TABS: GoTab[] = ["all", "views", "components", "files", "symbols", "reports", "actions"]

/** Which kinds each tab shows; All shows every kind. */
export const TAB_KINDS: Record<Exclude<GoTab, "all">, GoKind[]> = {
    views: ["view", "metric"],
    components: ["component", "group", "lens"],
    files: ["file"],
    symbols: ["unit", "function"],
    reports: ["report", "query"],
    actions: ["action", "workspace"],
}

/** Typed first, these open a tab as VS Code's do: ">" actions, "@" symbols, "#" components. */
export const PREFIXES: Record<string, GoTab> = { ">": "actions", "@": "symbols", "#": "components" }

export function tabOf(kind: GoKind): Exclude<GoTab, "all"> | null {
    return TAB_OF.get(kind) ?? null
}

export interface ParsedQuery {
    /** What is matched against names. */
    text: string
    /** The tab a prefix asked for, if any. */
    tab: GoTab | null
    /** A line asked for with "Name:42". */
    line: number | null
}

export function parseQuery(raw: string): ParsedQuery {
    let text = raw.trimStart()
    let tab: GoTab | null = null
    const prefix = PREFIXES[text[0]]
    if (prefix) { tab = prefix; text = text.slice(1) }
    text = text.trim()
    let line: number | null = null
    const m = /^(.+?):(\d+)(?::\d+)?$/.exec(text)
    if (m) { text = m[1]; line = Number(m[2]) }
    return { text, tab, line }
}

interface Entry {
    item: GoItem
    text: string
    lower: string
    mask: number
    tail: number
    boost: number
    /** The name a person types whole: a file without its extension, a function without its owner. */
    name: string
}

export interface Hit { item: GoItem; score: number }

export interface SearchResult {
    /** Best first. */
    hits: Hit[]
    /** Matches per tab, All included, before any limit. */
    counts: Record<GoTab, number>
}

// Views and definitions are few and named on purpose: a small lift keeps them
// above a file that merely contains the letters. Actions too, behind ">".
const KIND_BOOST: Partial<Record<GoKind, number>> = { view: 2, lens: 2, group: 2, report: 2, query: 1, action: 1, workspace: 1, function: -1 }

const TAB_OF = new Map<GoKind, Exclude<GoTab, "all">>()
for (const [tab, kinds] of Object.entries(TAB_KINDS)) for (const k of kinds) TAB_OF.set(k, tab as Exclude<GoTab, "all">)

/** The `k` best of `ids` by `score`, best first, without sorting all of them. */
function topK(ids: number[], score: (id: number) => number, k: number): number[] {
    if (ids.length <= k * 2) return ids.sort((a, b) => score(b) - score(a)).slice(0, k)
    // Keep a sorted window of the best k; most candidates fall below its floor and cost one comparison.
    const best: number[] = []
    let floor = Number.NEGATIVE_INFINITY
    for (const id of ids) {
        const s = score(id)
        if (best.length >= k && s <= floor) continue
        let lo = 0, hi = best.length
        while (lo < hi) { const mid = (lo + hi) >> 1; if (score(best[mid]) >= s) lo = mid + 1; else hi = mid }
        best.splice(lo, 0, id)
        if (best.length > k) best.pop()
        if (best.length >= k) floor = score(best[best.length - 1])
    }
    return best
}

/** The name inside a label: "OrderService.java" → "orderservice", "Address.getCity" → "getcity". */
function nameOf(item: GoItem): string {
    const l = item.label.toLowerCase()
    if (item.kind === "file") { const dot = l.lastIndexOf("."); return dot > 0 ? l.slice(0, dot) : l }
    if (item.kind === "function" || item.kind === "unit") return l.slice(l.lastIndexOf(".") + 1)
    return l
}

function entryOf(item: GoItem): Entry {
    const text = item.text ?? item.label
    // The matcher charges for length; a file is charged for its name, not for how deep it sits.
    const depth = text !== item.label && text.endsWith(item.label) ? (text.length - item.label.length) * 0.02 : 0
    return {
        item,
        text,
        lower: text.toLowerCase(),
        mask: charMask(text),
        tail: item.tail ?? text.lastIndexOf("/"),
        boost: (KIND_BOOST[item.kind] ?? 0) - (item.test ? 4 : 0) + depth,
        name: nameOf(item),
    }
}

/** Typing a whole name, or its start, is the strongest signal there is. */
function nameBonus(q: string, name: string): number {
    if (name === q) return 8
    if (name.startsWith(q)) return 3
    return 0
}

export function emptyCounts(): Record<GoTab, number> {
    return { all: 0, views: 0, components: 0, files: 0, symbols: 0, reports: 0, actions: 0 }
}

/**
 * An index over a fixed list of items. Rebuild it when the items change;
 * building is cheap next to reading them from the snapshot.
 */
export class GoIndex {
    private entries: Entry[]
    private last: { q: string; survivors: Entry[] } | null = null

    constructor(items: GoItem[]) {
        this.entries = items.map(entryOf)
    }

    get size(): number { return this.entries.length }

    items(): GoItem[] { return this.entries.map(e => e.item) }

    /**
     * Every match of `text`, scored, best first: the hits of `tab` capped at
     * `limit`, and the matches per tab before any cap (for the tab bar).
     */
    search(text: string, tab: GoTab = "all", limit = 400): SearchResult {
        const q = normalizeQuery(text)
        const counts = emptyCounts()
        if (!q) { this.last = null; return { hits: [], counts } }
        // A query that only grew can only match what the shorter one matched.
        const pool = this.last && q.startsWith(this.last.q) ? this.last.survivors : this.entries
        const qmask = charMask(q)
        const survivors: Entry[] = []
        const scores: number[] = []
        for (let i = 0; i < pool.length; i++) {
            const e = pool[i]
            if ((e.mask & qmask) !== qmask) continue
            const m = matchNormalized(q, e.text, e.lower, e.tail)
            if (!m) continue
            survivors.push(e)
            scores.push(m.score + e.boost + nameBonus(q, e.name))
        }
        this.last = { q, survivors }
        const kinds = tab === "all" ? null : TAB_KINDS[tab]
        const order: number[] = []
        for (let i = 0; i < survivors.length; i++) {
            const kind = survivors[i].item.kind
            counts.all++
            const t = tabOf(kind)
            if (t) counts[t]++
            if (!kinds || kinds.includes(kind)) order.push(i)
        }
        const top = topK(order, i => scores[i], limit)
        return { hits: top.map(i => ({ item: survivors[i].item, score: scores[i] })), counts }
    }

    find(kind: GoKind, key: string): GoItem | undefined {
        for (const e of this.entries) if (e.item.kind === kind && e.item.key === key) return e.item
        return undefined
    }
}

/** Where the label sits inside the matched text, so the matched letters can be drawn on it. */
export function labelOffset(item: GoItem): number {
    const text = item.text ?? item.label
    if (text === item.label || text.startsWith(item.label)) return 0
    if (text.endsWith(item.label)) return text.length - item.label.length
    return -1
}

/** A string cut into runs of matched and unmatched letters. */
export function highlightRuns(s: string, at: number[], offset: number): Array<{ text: string; hit: boolean }> {
    if (offset < 0 || !at.length) return [{ text: s, hit: false }]
    const hit = new Set<number>()
    for (const i of at) if (i >= offset && i < offset + s.length) hit.add(i - offset)
    const out: Array<{ text: string; hit: boolean }> = []
    for (let i = 0; i < s.length; i++) {
        const h = hit.has(i)
        const prev = out[out.length - 1]
        if (prev && prev.hit === h) prev.text += s[i]
        else out.push({ text: s[i], hit: h })
    }
    return out
}
