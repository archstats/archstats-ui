import { comparability } from "~/utils/comparability"
import { compareScans } from "~/utils/scanOrder"

// Over time: the app's readings of every snapshot, as series. A series breaks
// wherever two neighbouring snapshots cannot be compared (another analysis,
// other ignore rules): the line stops, a labelled hairline marks the break,
// and the next segment starts fresh. Snapshots of unknown analysis (r0) are
// dots that never join a line.

export interface TrendPoint {
    scanId: string
    label: string
    startedAt: string
    headTime: string | null
    headCommit: string
    analysisRevision: number
    ignoreGlobs: string
    extensions: string
    readings: Record<string, number | null>
    error: string
}

export const TREND_SERIES = [
    { id: "app__components", label: "Components", digits: 0 },
    { id: "app__components_in_tangles", label: "Components in tangles", digits: 0 },
    { id: "app__lines_in_tangles_share", label: "Lines in tangles", digits: 1, percent: true },
    { id: "app__largest_tangle", label: "Largest tangle", digits: 0 },
    { id: "app__cross_component_edges", label: "Component dependencies", digits: 0 },
    { id: "app__propagation_cost", label: "Propagation cost", digits: 1, percent: true },
    { id: "app__dependency_levels", label: "Dependency levels", digits: 0 },
    { id: "app__rule_findings", label: "Rule findings", digits: 0 },
    { id: "app__median_instability", label: "Median instability", digits: 2 },
    { id: "app__median_distance", label: "Median distance", digits: 2 },
] as const

export interface Break { index: number; reason: string }

/**
 * One point per commit and analysis: repeated scans of the same commit show
 * the newest. Points come back oldest first by the code they read.
 */
export function dedupePoints(points: TrendPoint[]): TrendPoint[] {
    const sorted = [...points].filter(p => !p.error).sort((a, b) => compareScans(
        { id: a.scanId, startedAt: a.startedAt, headTime: a.headTime },
        { id: b.scanId, startedAt: b.startedAt, headTime: b.headTime }))
    const keep = new Map<string, TrendPoint>()
    for (const p of sorted) {
        const key = p.headCommit ? `${p.headCommit}|${p.analysisRevision}|${p.ignoreGlobs}` : `scan:${p.scanId}`
        const prev = keep.get(key)
        if (!prev || new Date(p.startedAt) > new Date(prev.startedAt)) keep.set(key, p)
    }
    const kept = new Set(keep.values())
    return sorted.filter(p => kept.has(p))
}

/** Where neighbouring points stop being comparable, with the reason worded short. */
export function breaksOf(points: TrendPoint[]): Break[] {
    const out: Break[] = []
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i]
        if (b.analysisRevision === 0) continue
        if (a.analysisRevision === 0) { out.push({ index: i, reason: `analysis r${b.analysisRevision}` }); continue }
        const c = comparability(a, b)
        if (c.ok) continue
        out.push({ index: i, reason: a.analysisRevision !== b.analysisRevision ? `analysis r${b.analysisRevision}` : "ignore rules changed" })
    }
    return out
}

export interface Segment { points: Array<{ index: number; value: number }> }

/** A series cut into joinable segments; r0 points and gaps stand alone. */
export function segmentsOf(points: TrendPoint[], reading: string, breaks: Break[]): { segments: Segment[]; loose: Array<{ index: number; value: number }> } {
    const breakAt = new Set(breaks.map(b => b.index))
    const segments: Segment[] = []
    const loose: Array<{ index: number; value: number }> = []
    let current: Segment | null = null
    points.forEach((p, index) => {
        const v = p.readings?.[reading]
        if (p.analysisRevision === 0) {
            if (v !== null && v !== undefined) loose.push({ index, value: v })
            current = null
            return
        }
        if (v === null || v === undefined) { current = null; return }
        if (!current || breakAt.has(index)) { current = { points: [] }; segments.push(current) }
        current.points.push({ index, value: v })
    })
    return { segments, loose }
}

/** The latest value and its change since the first point of its segment. */
export function latestChange(seg: { segments: Segment[] }): { latest: number | null; change: number | null } {
    const last = seg.segments[seg.segments.length - 1]
    if (!last || !last.points.length) return { latest: null, change: null }
    const latest = last.points[last.points.length - 1].value
    return { latest, change: last.points.length > 1 ? latest - last.points[0].value : null }
}

/**
 * Commit time when every point knows it and the commits differ; scan time
 * otherwise (and the chart says which). Scans of one commit would otherwise
 * stack on one x.
 */
export function xBasis(points: TrendPoint[]): "commit" | "scan" {
    if (points.length === 0 || !points.every(p => p.headTime)) return "scan"
    const distinct = new Set(points.map(p => new Date(p.headTime as string).getTime()))
    return distinct.size > 1 || points.length === 1 ? "commit" : "scan"
}
