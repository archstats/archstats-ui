import { describe, expect, it } from "vitest"
import { defaultSince, monthsBefore, parseSince, previousComparable, readiness, sameCommit, sinceKey } from "./since"

const scan = (id: string, commit: string, day: number, rev = 12, ran = day) => ({
    id, status: "complete", headCommit: commit, analysisRevision: rev, ignoreGlobs: "",
    headTime: `2026-09-${String(day).padStart(2, "0")}T10:00:00Z`, startedAt: `2026-10-${String(ran).padStart(2, "0")}T10:00:00Z`,
})

describe("since", () => {
    it("round-trips through the route", () => {
        for (const q of ["3m", "ref:v1.2.0", "scan:abc"]) expect(sinceKey(parseSince(q)!)).toBe(q)
        expect(parseSince("")).toBeNull()
        expect(parseSince("ref:")).toBeNull()
    })
    it("counts months back on the calendar, keeping the day where it exists", () => {
        expect(monthsBefore(new Date("2026-09-23T13:53:00Z"), 3).toISOString()).toBe("2026-06-23T13:53:00.000Z")
        expect(monthsBefore(new Date("2026-05-31T00:00:00Z"), 3).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    })
    it("reads a short hash and a full one as the same commit", () => {
        expect(sameCommit("6e43da3", "6e43da3f00")).toBe(true)
        expect(sameCommit("6e43", "6e43da3")).toBe(false)
        expect(sameCommit("", "6e43da3")).toBe(false)
    })
    it("never takes a rescan of head's own commit, or one read another way, as previous", () => {
        const head = scan("head", "c3c3c3c", 23)
        const scans = [head, scan("rescan", "c3c3c3c", 23, 12, 1), scan("oldrev", "c2c2c2c", 20, 8), scan("prev", "c1c1c1c", 10)]
        expect(previousComparable(scans, head)?.id).toBe("prev")
        expect(defaultSince(scans, head)).toEqual({ kind: "scan", id: "prev" })
        expect(defaultSince(scans.slice(0, 3), head)).toEqual({ kind: "ago", months: 3 })
    })
    it("prefers the pinned baseline when it is another commit read alike", () => {
        const head = scan("head", "c3c3c3c", 23)
        const scans = [head, scan("prev", "c2c2c2c", 20), scan("pinned", "c1c1c1c", 10)]
        expect(defaultSince(scans, head, "pinned")).toEqual({ kind: "scan", id: "pinned" })
        expect(defaultSince([...scans, scan("same", "c3c3c3c", 23, 12, 2)], head, "same")).toEqual({ kind: "scan", id: "prev" })
    })
    it("says whether the point is head itself, ready, behind an old head, or a scan away", () => {
        const head = scan("head", "c3c3c3c", 23)
        const commit = (sha: string) => ({ sha, time: "", subject: "" })
        expect(readiness([head], head, commit("c3c3c3c"), 12).state).toBe("same")
        expect(readiness([head, scan("b", "c1c1c1c", 1, 8), scan("a", "c1c1c1c", 1)], head, commit("c1c1c1c"), 12)).toMatchObject({ state: "ready", base: { id: "a" } })
        expect(readiness([head, scan("b", "c1c1c1c", 1, 8)], head, commit("c1c1c1c"), 12)).toMatchObject({ state: "scan", other: [{ id: "b" }] })
        const oldHead = scan("head", "c3c3c3c", 23, 8)
        expect(readiness([oldHead], oldHead, commit("c1c1c1c"), 12).state).toBe("outdated")
    })
})
