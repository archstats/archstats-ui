import { describe, expect, it } from "vitest"
import { breaksOf, dedupePoints, latestChange, segmentsOf, xBasis, type TrendPoint } from "./trends"

const p = (id: string, day: number, rev: number, value: number | null, commit = id): TrendPoint => ({
    scanId: id, label: "", startedAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00Z`, headTime: `2026-09-${String(day).padStart(2, "0")}T09:00:00Z`,
    headCommit: commit, analysisRevision: rev, ignoreGlobs: "", extensions: "", readings: { r: value }, error: "",
})

describe("trends", () => {
    it("keeps the newest scan of a commit and orders by the code", () => {
        const pts = dedupePoints([p("b", 5, 2, 1, "c1"), p("a", 3, 2, 1, "c0"), { ...p("b2", 5, 2, 2, "c1"), startedAt: "2026-09-06T10:00:00Z" }])
        expect(pts.map(x => x.scanId)).toEqual(["a", "b2"])
    })
    it("breaks at a revision change and leaves r0 points unjoined", () => {
        const pts = [p("a", 1, 0, 5), p("b", 2, 1, 6), p("c", 3, 1, 7), p("d", 4, 2, 9), p("e", 5, 2, 10)]
        const breaks = breaksOf(pts)
        expect(breaks).toEqual([{ index: 1, reason: "analysis r1" }, { index: 3, reason: "analysis r2" }])
        const s = segmentsOf(pts, "r", breaks)
        expect(s.loose).toEqual([{ index: 0, value: 5 }])
        expect(s.segments.map(g => g.points.map(x => x.value))).toEqual([[6, 7], [9, 10]])
        expect(latestChange(s)).toEqual({ latest: 10, change: 1 })
    })
    it("treats a missing reading as a gap, not a zero", () => {
        const pts = [p("a", 1, 2, 1), p("b", 2, 2, null), p("c", 3, 2, 3)]
        expect(segmentsOf(pts, "r", []).segments.length).toBe(2)
    })
    it("uses commit time only when every point has one", () => {
        expect(xBasis([p("a", 1, 2, 1)])).toBe("commit")
        expect(xBasis([p("a", 1, 2, 1), { ...p("b", 2, 2, 1), headTime: null }])).toBe("scan")
    })
})
