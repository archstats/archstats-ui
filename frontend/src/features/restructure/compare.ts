// Two snapshots read through one structure (a lens's groups, or the
// restructure plan's modules): did the move make the modules depend on each
// other less, and did anything new start pointing the wrong way?

import type { Evaluation } from "./plan"

export interface StructureRow { label: string; why: string; before: number; after: number; better: "lower" | "none" }

export interface StructureDiff {
    rows: StructureRow[]
    /** Module dependencies ("a>b") that appeared, or went. */
    depsNew: Array<{ from: string; to: string; imports: number }>
    depsGone: Array<{ from: string; to: string; imports: number }>
    mutualNew: Array<{ a: string; b: string }>
    mutualGone: Array<{ a: string; b: string }>
}

const inCycles = (e: Evaluation) => e.tangles.reduce((n, t) => n + t.length, 0)

export function compareStructure(base: Evaluation, head: Evaluation, unplaced: [number, number], ordered: boolean): StructureDiff {
    const rows: StructureRow[] = [
        { label: "Module dependencies", why: "Ordered module pairs with at least one import", before: base.pairs.size, after: head.pairs.size, better: "none" },
        { label: "Imports crossing a module edge", why: "File imports whose two ends sit in different modules", before: base.crossing, after: head.crossing, better: "lower" },
        { label: "Module pairs that import each other", why: "Two modules each importing the other", before: base.mutual.length, after: head.mutual.length, better: "lower" },
        { label: "Modules caught in cycles", why: "Modules in a strongly connected set", before: inCycles(base), after: inCycles(head), better: "lower" },
        ...(ordered ? [{ label: "Imports pointing up the order", why: "Imports from a module into one above it", before: base.upward.length, after: head.upward.length, better: "lower" as const }] : []),
        { label: "Files no module takes", why: "Production code files outside every module", before: unplaced[0], after: unplaced[1], better: "lower" },
    ]
    const deps = (e: Evaluation) => new Map([...e.pairs].map(([k, v]) => [k, v.length]))
    const b = deps(base), h = deps(head)
    const split = (k: string) => { const [from, to] = k.split(">"); return { from, to } }
    const mkey = (m: { a: string; b: string }) => `${m.a}|${m.b}`
    const bm = new Set(base.mutual.map(mkey)), hm = new Set(head.mutual.map(mkey))
    return {
        rows,
        depsNew: [...h].filter(([k]) => !b.has(k)).map(([k, n]) => ({ ...split(k), imports: n })).sort((x, y) => y.imports - x.imports),
        depsGone: [...b].filter(([k]) => !h.has(k)).map(([k, n]) => ({ ...split(k), imports: n })).sort((x, y) => y.imports - x.imports),
        mutualNew: head.mutual.filter(m => !bm.has(mkey(m))).map(({ a, b }) => ({ a, b })),
        mutualGone: base.mutual.filter(m => !hm.has(mkey(m))).map(({ a, b }) => ({ a, b })),
    }
}
