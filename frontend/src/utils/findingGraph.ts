// The files behind a finding, arranged for an inline Connections view.
//
// The finding is about declarations; the question that follows it is always
// about the files those declarations live in, and that question belongs to
// Connections. Rather than send the reader away for a first look, the same
// matrix Connections uses is embedded here over just these files.

import type { CEdge, CNode } from "~/utils/connections"
import type { ModuleGraph } from "~/utils/moduleGraph"
import type { LaneColor } from "~/utils/javaFrameworks"

/** Beyond this a matrix stops being readable inline; the handoff takes over. */
export const INLINE_CAP = 30

export interface FindingGraph {
    nodes: CNode[]
    edges: CEdge[]
    /** Files left out because the inline view would not read. */
    omitted: number
    /**
     * Whether any of these files import one another.
     *
     * A finding whose files are entirely unconnected is itself a reading:
     * eighteen copies of the same handler that have nothing to do with each
     * other is duplication, not a shared abstraction.
     */
    connected: boolean
}

const LANE_RGB: Record<LaneColor, string> = {
    blue: "rgb(var(--c-blue-500))",
    green: "rgb(var(--c-green-500))",
    amber: "rgb(var(--c-amber-500))",
    violet: "rgb(var(--c-violet-500))",
    red: "rgb(var(--c-red-500))",
    neutral: "rgb(var(--c-neutral-400))",
}

export function findingGraph(
    files: string[],
    graph: ModuleGraph,
    laneLabel: (lane: string) => string,
    laneColor: (lane: string) => LaneColor,
): FindingGraph {
    const known = files.filter((f) => graph.byPath.has(f))
    // Most-connected first, so the cap keeps the part worth drawing.
    const ranked = [...known].sort((a, b) => {
        const ma = graph.byPath.get(a)!
        const mb = graph.byPath.get(b)!
        return (mb.fanIn + mb.fanOut) - (ma.fanIn + ma.fanOut) || a.localeCompare(b)
    })
    const kept = ranked.slice(0, INLINE_CAP)
    const inGraph = new Set(kept)

    const nodes: CNode[] = kept.map((path) => {
        const m = graph.byPath.get(path)!
        return {
            id: path,
            label: m.name,
            kind: "file",
            group: m.lane ? laneLabel(m.lane) : undefined,
            color: LANE_RGB[laneColor(m.lane)] ?? LANE_RGB.neutral,
            lines: m.lines,
        }
    })

    const raw = graph.edges.filter((e) => inGraph.has(e.from) && inGraph.has(e.to))
    const heaviest = Math.max(1, ...raw.map((e) => e.via.length))
    const edges: CEdge[] = raw.map((e) => ({
        from: e.from,
        to: e.to,
        references: e.via.length,
        sharedCommits: 0,
        weight: Math.sqrt(e.via.length / heaviest),
    }))

    return { nodes, edges, omitted: Math.max(0, known.length - kept.length), connected: edges.length > 0 }
}
