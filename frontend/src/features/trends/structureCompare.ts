// Two snapshots read through one lens: did the change make its groups
// depend on each other less, and did anything new start pointing between
// them?

import type { FileEdge } from "~/features/checks/checks"
import { tanglesOf } from "~/features/cycles/untangle"
import { t } from "~/shared/i18n"

export interface Evaluation {
    /** "a>b" (group ids) → the file imports behind it. */
    pairs: Map<string, FileEdge[]>
    /** Pairs that import each other, with the imports each way. */
    mutual: Array<{ a: string; b: string; ab: number; ba: number }>
    /** Sets of groups in a cycle, largest first. */
    tangles: string[][]
    /** Imports that cross a group boundary. */
    crossing: number
}

/** How a placement of files into groups reads over production imports. */
export function evaluate(placement: Map<string, string>, edges: FileEdge[], production: ReadonlySet<string>): Evaluation {
    const pairs = new Map<string, FileEdge[]>()
    let crossing = 0
    for (const e of edges) {
        if (!production.has(e.from) || !production.has(e.to)) continue
        const a = placement.get(e.from), b = placement.get(e.to)
        if (!a || !b || a === b) continue
        crossing++
        const k = `${a}>${b}`
        if (!pairs.has(k)) pairs.set(k, [])
        pairs.get(k)!.push(e)
    }
    const mutual: Evaluation["mutual"] = []
    for (const [k, ab] of pairs) {
        const [a, b] = k.split(">")
        if (a < b && pairs.has(`${b}>${a}`)) mutual.push({ a, b, ab: ab.length, ba: pairs.get(`${b}>${a}`)!.length })
    }
    mutual.sort((x, y) => Math.min(y.ab, y.ba) - Math.min(x.ab, x.ba))
    const links = [...pairs.keys()].map(k => { const [from, to] = k.split(">"); return { from, to } })
    return { pairs, mutual, tangles: tanglesOf(links.flatMap(l => [l.from, l.to]), links), crossing }
}

export interface StructureRow { label: string; why: string; before: number; after: number; better: "lower" | "none" }

export interface StructureDiff {
    rows: StructureRow[]
    /** Group dependencies ("a>b") that appeared, or went. */
    depsNew: Array<{ from: string; to: string; imports: number }>
    depsGone: Array<{ from: string; to: string; imports: number }>
    mutualNew: Array<{ a: string; b: string }>
    mutualGone: Array<{ a: string; b: string }>
}

const inCycles = (e: Evaluation) => e.tangles.reduce((n, t) => n + t.length, 0)

export function compareStructure(base: Evaluation, head: Evaluation, unplaced: [number, number]): StructureDiff {
    const rows: StructureRow[] = [
        { label: t("trends.structureCompare.groupDependencies"), why: t("trends.structureCompare.orderedGroupPairsLeast"), before: base.pairs.size, after: head.pairs.size, better: "none" },
        { label: t("trends.structureCompare.importsCrossingGroupEdge"), why: t("trends.structureCompare.fileImportsWhoseTwo"), before: base.crossing, after: head.crossing, better: "lower" },
        { label: t("trends.structureCompare.groupPairsImportEach"), why: t("trends.structureCompare.twoGroupsEachImporting"), before: base.mutual.length, after: head.mutual.length, better: "lower" },
        { label: t("trends.structureCompare.groupsCaughtCycles"), why: t("trends.structureCompare.groupsStronglyConnectedSet"), before: inCycles(base), after: inCycles(head), better: "lower" },
        { label: t("trends.structureCompare.filesNoGroupTakes"), why: t("trends.structureCompare.productionCodeFilesOutside"), before: unplaced[0], after: unplaced[1], better: "lower" },
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
