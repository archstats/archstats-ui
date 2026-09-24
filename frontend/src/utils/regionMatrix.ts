// A region's modules, arranged for the dependency matrix.
//
// The matrix itself is the one Connections already ships: sticky headers,
// vertical column labels, weight-shaded cells, cycle rings, pair selection,
// scroll-into-view. Rebuilding a second one would mean maintaining two, and
// the architect would have to learn the same grid twice.
//
// The two axes are the two sides of the dependency. Drawn square instead --
// one set of modules on both axes -- it was 93% empty on the region that
// prompted this: twenty of the forty rows were repositories, which are
// imported constantly and import nothing.
//
// The cost is that a reference running back the other way only appears when
// its source is also among the importers. Measured on that region it never
// was, so nothing is lost in practice; the count is stated in the claim above
// the grid and every one of them is in the list behind it.

import type { CEdge, CNode } from "~/utils/connections"
import { edgeKey } from "~/utils/connections"
import type { ModuleGraph } from "~/utils/moduleGraph"
import type { Reference } from "~/utils/findings"
import type { LaneColor } from "~/utils/javaFrameworks"

/** How many modules the grid draws before it stops being readable. */
export const REGION_MATRIX_CAP = 40

export interface RegionMatrix {
    /** Every module drawn, for the caller that wants one set. */
    nodes: CNode[]
    /** The importing side, which becomes the grid's rows. */
    rowNodes: CNode[]
    /** The imported side, which becomes its columns. */
    colNodes: CNode[]
    edges: CEdge[]
    /** Directed edges whose two modules import each other. */
    cycleKeys: Set<string>
    cycleNodes: Set<string>
    /** Cycles each module takes part in, shown on its row. */
    badges: Map<string, number>
    /** Modules in the region that did not fit in the grid. */
    omitted: number
}

export interface RegionMatrixInput {
    references: Reference[]
    graph: ModuleGraph
    laneLabel: (lane: string) => string
    laneColor: (lane: string) => LaneColor
    cap?: number
}

/** The data ramps, as real colours rather than utility classes. */
const LANE_RGB: Record<LaneColor, string> = {
    blue: "rgb(var(--c-blue-500))",
    green: "rgb(var(--c-green-500))",
    amber: "rgb(var(--c-amber-500))",
    violet: "rgb(var(--c-violet-500))",
    red: "rgb(var(--c-red-500))",
    neutral: "rgb(var(--c-neutral-400))",
}

/**
 * Build the grid for a set of references.
 *
 * The modules kept are the region's densest corner rather than an arbitrary
 * slice, measured within the region rather than across the codebase: an
 * importer picked for reaching thirty modules elsewhere would sit here with
 * an empty row.
 */
export function buildRegionMatrix(
    { references, graph, laneLabel, laneColor, cap = REGION_MATRIX_CAP }: RegionMatrixInput,
): RegionMatrix {
    // Rows and columns are chosen separately, then unioned.
    //
    // Ranking by total degree instead floods the grid with whatever is most
    // imported: in the Repositories-to-Services region the top forty were
    // almost all repositories, which import nothing, so twenty-seven of the
    // forty rows came out empty. Taking the widest importers *and* the
    // most-imported guarantees the grid has both a populated left edge and a
    // populated top.
    const outDegree = new Map<string, number>()
    const inDegree = new Map<string, number>()
    for (const r of references) {
        outDegree.set(r.from, (outDegree.get(r.from) ?? 0) + 1)
        inDegree.set(r.to, (inDegree.get(r.to) ?? 0) + 1)
    }

    // A cap that arrives as NaN -- a prop that did not get wired -- would
    // slice every axis to nothing and the grid would quietly disappear
    // behind its own empty state rather than failing where it broke.
    const size = Number.isFinite(cap) && cap > 0 ? cap : REGION_MATRIX_CAP
    const half = Math.max(1, Math.floor(size / 2))
    // Ties broken by path so the grid never reshuffles between renders.
    const byCount = (m: Map<string, number>) => [...m.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, half)
        .map(([path]) => path)

    const importers = byCount(outDegree)
    const imported = byCount(inDegree)
    const kept = [...new Set([...importers, ...imported])]
    const inGrid = new Set(kept)
    const touched = new Set([...outDegree.keys(), ...inDegree.keys()])

    const nodeOf = (path: string): CNode => {
        const m = graph.byPath.get(path)
        const lane = m?.lane ?? ""
        return {
            id: path,
            label: m?.name ?? path,
            kind: "file",
            group: lane ? laneLabel(lane) : undefined,
            color: LANE_RGB[laneColor(lane)] ?? LANE_RGB.neutral,
            lines: m?.lines,
        }
    }
    const nodes = kept.map(nodeOf)
    // The two axes are the two sides of the dependency, not one set drawn
    // twice: every module imported but importing nothing -- which is most of
    // a repository lane -- would otherwise hold an empty row.
    const rowNodes = importers.map(nodeOf)
    const colNodes = imported.map(nodeOf)

    // Every dependency between two kept modules, in both directions -- not
    // only the ones the region was selected on, or the back-references that
    // make the link red would be missing from the picture of it.
    const seen = new Set<string>()
    const raw: Array<{ from: string; to: string; references: number }> = []
    for (const e of graph.edges) {
        if (!inGrid.has(e.from) || !inGrid.has(e.to)) continue
        const key = edgeKey(e.from, e.to)
        if (seen.has(key)) continue
        seen.add(key)
        raw.push({ from: e.from, to: e.to, references: e.via.length })
    }

    const heaviest = Math.max(1, ...raw.map((e) => e.references))
    const edges: CEdge[] = raw.map((e) => ({
        from: e.from,
        to: e.to,
        references: e.references,
        sharedCommits: 0,
        // Square-rooted so a single very chatty pair does not flatten the
        // rest of the grid to the palest shade available.
        weight: Math.sqrt(e.references / heaviest),
    }))

    const directed = new Set(raw.map((e) => edgeKey(e.from, e.to)))
    const cycleKeys = new Set<string>()
    const cycleNodes = new Set<string>()
    const badges = new Map<string, number>()
    for (const e of raw) {
        if (!directed.has(edgeKey(e.to, e.from))) continue
        cycleKeys.add(edgeKey(e.from, e.to))
        cycleNodes.add(e.from)
        cycleNodes.add(e.to)
        badges.set(e.from, (badges.get(e.from) ?? 0) + 1)
    }

    return {
        nodes, rowNodes, colNodes, edges, cycleKeys, cycleNodes, badges,
        omitted: Math.max(0, touched.size - kept.length),
    }
}
