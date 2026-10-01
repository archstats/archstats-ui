import { describe, expect, it } from "vitest"
import { COMPARES_SCANS } from "./loop"

describe("COMPARES_SCANS", () => {
    it("knows a question that compares scans", () => {
        for (const q of ["What got worse since the last scan?", "What changed since the previous snapshot?", "Is it getting better?", "Compare with the last scan"]) expect(COMPARES_SCANS.test(q), q).toBe(true)
        for (const q of ["What changed in the last 30 days?", "Which files changed most?", "Is it well layered?"]) expect(COMPARES_SCANS.test(q), q).toBe(false)
    })
})

describe("unfinished", () => {
    it("knows an answer that stops before its conclusion", async () => {
        const { unfinished } = await import("./loop")
        expect(unfinished("To determine if common is a good foundation, I need to check what it imports. I will now check what common imports.")).toBe(true)
        expect(unfinished("Common imports nothing above it except profile, with 3 references [E1.20].")).toBe(false)
        expect(unfinished("The largest components are:\n\n- a\n- b")).toBe(false)
    })
})
