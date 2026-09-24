// Dependencies between the groups of one lens. The engine records imports
// between components; a lens groups files and components its own way, so
// each import is re-read at group level:
//
// - the importing side is decided by the importing file (a group can hold
//   some of a component's files and not others);
// - the imported side by the target component, when one group holds it
//   whole; when groups split it, by the file the import resolved to (unit
//   connections), and failing that the row is ambiguous;
// - a file in two overlapping groups yields a pair for each.

export interface LensGroup {
    id: string
    name: string
    /** Every file the group holds. */
    files: Set<string>
    /** Components the group touches; `whole` when it holds all their files. */
    components: Map<string, { whole: boolean }>
}

export interface EdgeRow { from: string; to: string; file: string; refs: number; kind?: string | null; line?: number | null }

export interface GroupEdge {
    fromGroup: string
    toGroup: string
    fromComponent: string
    toComponent: string
    file: string
    refs: number
    kind: string
    line: number | null
    /** The target component is split across groups and the import's target file is unknown. */
    ambiguous: boolean
}

export interface GroupEdgeResult {
    edges: GroupEdge[]
    /** Rows whose importing file is in no group of the lens. */
    unplacedFrom: number
    /** Rows whose target component is in no group of the lens. */
    unplacedTo: number
    ambiguous: number
}

/** "file|toComponent" → the files the import resolved to, from unit_connections. */
export type TargetFiles = Map<string, string[]>

export const targetKey = (file: string, toComponent: string) => `${file}|${toComponent}`

export function resolveGroupEdges(rows: EdgeRow[], groups: LensGroup[], targets: TargetFiles = new Map()): GroupEdgeResult {
    const groupsOfFile = new Map<string, string[]>()
    const holders = new Map<string, Array<{ id: string; whole: boolean }>>()
    for (const g of groups) {
        for (const f of g.files) groupsOfFile.set(f, [...(groupsOfFile.get(f) ?? []), g.id])
        for (const [c, cov] of g.components) holders.set(c, [...(holders.get(c) ?? []), { id: g.id, whole: cov.whole }])
    }
    const out: GroupEdgeResult = { edges: [], unplacedFrom: 0, unplacedTo: 0, ambiguous: 0 }
    for (const r of rows) {
        const from = groupsOfFile.get(r.file) ?? []
        if (from.length === 0) { out.unplacedFrom++; continue }
        const cands = holders.get(r.to) ?? []
        if (cands.length === 0) { out.unplacedTo++; continue }
        let to: string[]
        let ambiguous = false
        const whole = cands.filter(c => c.whole)
        if (cands.length === 1 || (whole.length > 0 && whole.length === cands.length)) {
            to = cands.map(c => c.id)
        } else {
            const files = targets.get(targetKey(r.file, r.to))
            if (files?.length) {
                to = [...new Set(files.flatMap(f => groupsOfFile.get(f) ?? []))]
                if (to.length === 0) { out.unplacedTo++; continue }
            } else {
                to = cands.map(c => c.id)
                ambiguous = true
                out.ambiguous++
            }
        }
        for (const fg of from) for (const tg of to) {
            if (fg === tg) continue
            out.edges.push({ fromGroup: fg, toGroup: tg, fromComponent: r.from, toComponent: r.to, file: r.file, refs: r.refs, kind: r.kind ?? "import", line: r.line ?? null, ambiguous })
        }
    }
    return out
}

/** Group pair → total references, for a matrix. */
export function groupPairTotals(edges: GroupEdge[]): Map<string, { from: string; to: string; refs: number; files: Set<string> }> {
    const m = new Map<string, { from: string; to: string; refs: number; files: Set<string> }>()
    for (const e of edges) {
        const k = `${e.fromGroup}>${e.toGroup}`
        const cur = m.get(k) ?? { from: e.fromGroup, to: e.toGroup, refs: 0, files: new Set<string>() }
        cur.refs += e.refs
        cur.files.add(e.file)
        m.set(k, cur)
    }
    return m
}
