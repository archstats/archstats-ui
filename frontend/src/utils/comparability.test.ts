import { describe, expect, it } from "vitest"
import { comparability } from "./comparability"
import { newestFirst, olderThan } from "./scanOrder"
import { reasonsBetween } from "./revisions"

describe("comparability", () => {
    it("compares scans written by the same revision with the same settings", () => {
        expect(comparability({ analysisRevision: 2 }, { analysisRevision: 2 }).ok).toBe(true)
    })
    it("never treats an unknown revision as equal", () => {
        expect(comparability({ analysisRevision: 0 }, { analysisRevision: 0 }).ok).toBe(false)
        expect(comparability({ analysisRevision: 2 }, { analysisRevision: 1 }).ok).toBe(false)
    })
    it("blocks on different ignore globs and only warns on different language packs", () => {
        expect(comparability({ analysisRevision: 2, ignoreGlobs: "a" }, { analysisRevision: 2, ignoreGlobs: "" }).ok).toBe(false)
        const c = comparability({ analysisRevision: 2, extensions: "go" }, { analysisRevision: 2, extensions: "go,git" })
        expect(c.ok).toBe(true)
        expect(c.reasons[0].level).toBe("warn")
    })
})

describe("scan order", () => {
    const s = (id: string, startedAt: string, headTime?: string) => ({ id, startedAt, headTime, status: "complete" })
    it("orders by the code a scan read, then by when it ran", () => {
        const today = s("today", "2026-09-24", "2026-09-20")
        const rescanOfMarch = s("march", "2026-09-25", "2026-03-01")
        expect(newestFirst([rescanOfMarch, today]).map(x => x.id)).toEqual(["today", "march"])
        expect(olderThan([rescanOfMarch, today], today).map(x => x.id)).toEqual(["march"])
    })
})

describe("revision reasons", () => {
    it("lists what changed between two revisions, and nothing for the same one", () => {
        expect(reasonsBetween(0, 1).length).toBeGreaterThan(0)
        expect(reasonsBetween(1, 1)).toEqual([])
    })
})
