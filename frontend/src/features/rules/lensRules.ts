import type { Declaration } from "~/features/groups/groups.store"
import type { GroupEdge } from "~/features/groups/groupEdges"
import { tanglesOf } from "~/features/cycles/untangle"

// Checking a lens's imports against what was declared for it. A layer may
// use any layer below it; an explicit pair wins over the layers; anything
// neither covers is not judged unless the declaration forbids the unset.

export type Verdict = "allowed" | "forbidden" | "unjudged"

export function verdictOf(from: string, to: string, d: Declaration): Verdict {
    const pair = d.pairs.find(p => p.from === from && p.to === to)
    if (pair) return pair.verdict
    const a = d.layers.indexOf(from), b = d.layers.indexOf(to)
    if (a >= 0 && b >= 0) return a < b ? "allowed" : "forbidden"
    return d.unset === "forbidden" ? "forbidden" : "unjudged"
}

export interface Crossing {
    from: string
    to: string
    edges: GroupEdge[]
    refs: number
    /** Type-only imports between the two, reported but not counted. */
    typeOnly: number
    ambiguous: number
}

/** Every group pair whose imports break the declaration, heaviest first. */
export function crossings(edges: GroupEdge[], d: Declaration): Crossing[] {
    const by = new Map<string, Crossing>()
    for (const e of edges) {
        if (verdictOf(e.fromGroup, e.toGroup, d) !== "forbidden") continue
        const k = `${e.fromGroup}>${e.toGroup}`
        const c = by.get(k) ?? { from: e.fromGroup, to: e.toGroup, edges: [], refs: 0, typeOnly: 0, ambiguous: 0 }
        if (e.kind === "type_only") { c.typeOnly++; by.set(k, c); continue }
        c.edges.push(e)
        c.refs += e.refs
        if (e.ambiguous) c.ambiguous++
        by.set(k, c)
    }
    return [...by.values()].filter(c => c.edges.length).sort((a, b) => b.refs - a.refs || a.from.localeCompare(b.from))
}

/** Imports that cross, counted once per file and target: "N imports cross the declared order". */
export function crossingCount(cs: Crossing[]): number {
    return cs.reduce((n, c) => n + c.edges.length, 0)
}

/** A key for comparing findings across snapshots: the components and file, not the line. */
export function findingKey(e: Pick<GroupEdge, "fromComponent" | "toComponent" | "file">): string {
    return `${e.fromComponent}>${e.toComponent}@${e.file}`
}

/** A cycle between groups that no forbidden pair breaks, and the groups in it the layers leave out. */
export interface SilentCycle { groups: string[]; outOfLayers: string[] }

/**
 * Cycles the declaration says nothing against. With every group of a cycle
 * in the layers, one of its imports must point up and cross; a cycle that
 * crosses nothing runs through groups left out of the layers, or pairs
 * allowed by hand. "Nothing crosses" must not read as "no cycles".
 */
export function silentCycles(edges: GroupEdge[], d: Declaration): SilentCycle[] {
    const pairs = new Map<string, number>()
    for (const e of edges) if (e.kind !== "type_only" && e.fromGroup !== e.toGroup) pairs.set(`${e.fromGroup}>${e.toGroup}`, (pairs.get(`${e.fromGroup}>${e.toGroup}`) ?? 0) + 1)
    const out: SilentCycle[] = []
    const links = [...pairs.keys()].map(k => { const [from, to] = k.split(">"); return { from, to } })
    for (const t of tanglesOf(links.flatMap(l => [l.from, l.to]), links)) {
        const inside = new Set(t)
        const judged = [...pairs.keys()].some(k => { const [a, b] = k.split(">"); return inside.has(a) && inside.has(b) && verdictOf(a, b, d) === "forbidden" })
        if (!judged) out.push({ groups: t, outOfLayers: t.filter(g => !d.layers.includes(g)) })
    }
    return out
}
