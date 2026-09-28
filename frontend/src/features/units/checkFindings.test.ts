import { describe, expect, it } from "vitest"
import { duplicateFinding, reachFinding } from "./checkFindings"

describe("reachFinding", () => {
    const lines = new Map([["a.ts", 10], ["b.ts", 5]])
    it("claims the unreached files and counts their lines", () => {
        const f = reachFinding({ unreachable: ["a.ts", "b.ts"], testOnly: ["c.ts"], roots: new Set(["main.ts"]) }, lines)!
        expect(f.headline).toBe("2 files are reached by nothing.")
        expect(f.detail).toContain("15 lines")
        expect(f.detail).toContain("1 more file only tests import")
        expect(f.region.map).toBe("reach")
        expect(f.region.paths).toEqual(["a.ts", "b.ts", "c.ts"])
    })
    it("says nothing when everything is reached", () => {
        expect(reachFinding({ unreachable: [], testOnly: [], roots: new Set() }, lines)).toBeNull()
    })
})

describe("duplicateFinding", () => {
    it("names the most repeated first and opens on every file involved", () => {
        const f = duplicateFinding([{ name: "Edge", files: ["a", "b"] }, { name: "Finding", files: ["a", "c", "d"] }], [{ name: "x.ts", files: ["e", "f"] }])!
        expect(f.headline).toBe("2 names are declared in more than one file.")
        expect(f.detail).toMatch(/^Most often Finding \(3 files\) and Edge \(2 files\)/)
        expect(f.region.paths.sort()).toEqual(["a", "b", "c", "d", "e", "f"])
    })
    it("says nothing when no name repeats", () => {
        expect(duplicateFinding([], [])).toBeNull()
    })
})
