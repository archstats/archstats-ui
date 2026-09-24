import { describe, expect, it } from "vitest"
import { changesMarkdown, countChanges, isUnchanged, pickSides, summaryLine, type ChangeSet } from "./changes"

const scans = [
    { id: "new", startedAt: "2026-09-22T10:00:00Z", headTime: "2026-09-22T09:00:00Z", status: "complete" },
    { id: "old", startedAt: "2026-09-20T10:00:00Z", headTime: "2026-09-20T09:00:00Z", status: "complete" },
    { id: "rescan", startedAt: "2026-09-23T10:00:00Z", headTime: "2026-09-01T09:00:00Z", status: "complete" },
]

describe("pickSides", () => {
    it("defaults to the scan of the code just before head", () => {
        expect(pickSides(scans, { head: "new" })).toMatchObject({ base: { id: "old" }, head: { id: "new" }, swapped: false })
    })
    it("orders a rescan of an old commit before later code", () => {
        expect(pickSides(scans, { head: "old" }).base?.id).toBe("rescan")
    })
    it("prefers the pinned baseline, and swaps a base newer than head", () => {
        expect(pickSides(scans, { head: "old", baseline: "new" })).toMatchObject({ base: { id: "old" }, head: { id: "new" }, swapped: true })
    })
    it("has no base with one scan", () => {
        expect(pickSides([scans[0]], { head: "new" }).base).toBeNull()
    })
})

describe("summary", () => {
    const cs: ChangeSet = {
        baseId: "a", headId: "b", componentsAdded: ["x"], componentsRemoved: [], edgesAdded: [{ from: "x", to: "y", refs: 2, files: ["x/a.py"], dynamic: false }],
        edgesRemoved: null, edgesChanged: null, tangles: [{ kind: "formed", before: [], after: ["x", "y"], joined: ["x", "y"], left: [] }],
        rulesNew: null, rulesGone: null, rulesChecked: { base: false, head: false }, moves: null,
    }
    it("counts and words the changes", () => {
        const c = countChanges(cs)
        expect(isUnchanged(c)).toBe(false)
        expect(summaryLine(c)).toBe("+1 −0 component · +1 −0 dependency · +1 tangles")
        expect(changesMarkdown(cs, "Sep 20", "Sep 22")).toContain("- `x` → `y` (2 refs)")
    })
    it("says so when nothing changed", () => {
        const empty = countChanges({ ...cs, componentsAdded: [], edgesAdded: [], tangles: [] })
        expect(isUnchanged(empty)).toBe(true)
        expect(summaryLine(empty)).toBe("No structural changes")
    })
})
