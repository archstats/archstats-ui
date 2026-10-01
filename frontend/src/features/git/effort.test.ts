import { describe, expect, it } from "vitest"
import { effortLede, effortShares, monthlyLowShare, monthlyBreakdown, type EffortCommit } from "./effort"

const rows: EffortCommit[] = [
    { hash: "a", t: "2026-09-10T10:00:00Z", msg: "Fix tax\n\nbody", lines: 100, low: 40, tangle: 10, gone: 0, noHealth: 5 },
    { hash: "b", t: "2026-08-01T10:00:00Z", msg: "Add cart", lines: 60, low: 0, tangle: 30, gone: 20, noHealth: 0 },
    { hash: "c", t: "2025-01-01T10:00:00Z", msg: "prefix routes", lines: 1000, low: 1000, tangle: 0, gone: 0, noHealth: 0 },
]
const to = new Date("2026-09-18T00:00:00Z").getTime()
const fix = /\b(fix(es|ed)?|bug(fix)?|hotfix|revert)\b/i

describe("effort", () => {
    it("sums a window and counts fix lines by subject", () => {
        const s = effortShares(rows, to - 90 * 86400000, to, fix)
        expect(s).toEqual({ commits: 2, lines: 160, low: 40, tangle: 40, fix: 100, gone: 20, noHealth: 5 })
        expect(effortShares(rows, null, to, fix).commits).toBe(3)
    })
    it("says it in one sentence", () => {
        const s = effortShares(rows, to - 90 * 86400000, to, fix)
        expect(effortLede(s, 90, new Date(to), 5, 0.34)).toBe("In the 90 days to 18 Sep 2026, 25% of changed lines went into files with health below 5 (34% of files).")
        expect(effortLede(effortShares([], null, to, fix), null, new Date(to), 5, null)).toMatch(/no lines changed/)
    })
    it("keeps quiet months as gaps", () => {
        const m = monthlyLowShare(rows, to - 90 * 86400000, to)
        expect(m.map(x => x.month)).toEqual(["2026-08", "2026-09"])
        expect(m[1].share).toBeCloseTo(0.4)
    })
})

describe("monthlyBreakdown", () => {
    it("splits each month's lines into parts that add up, with empty months kept", () => {
        const rows = [
            { hash: "a", t: "2026-01-10T00:00:00Z", msg: "x", lines: 100, low: 30, tangle: 50, gone: 10, noHealth: 20 },
            { hash: "b", t: "2026-03-02T00:00:00Z", msg: "y", lines: 10, low: 0, tangle: 0, gone: 0, noHealth: 0 },
        ]
        const m = monthlyBreakdown(rows, null, Date.parse("2026-03-31T00:00:00Z"))
        expect(m.map(x => x.month)).toEqual(["2026-01", "2026-02", "2026-03"])
        expect(m[0]).toMatchObject({ lines: 100, low: 30, rated: 40, noHealth: 20, gone: 10, tangle: 50 })
        expect(m[0].low + m[0].rated + m[0].noHealth + m[0].gone).toBe(m[0].lines)
        expect(m[1].lines).toBe(0)
    })
})
