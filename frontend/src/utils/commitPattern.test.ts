import { describe, expect, it } from "vitest"
import { compileFixPattern, DEFAULT_FIX_PATTERN, matchesFix, nearMisses } from "./commitPattern"

const re = compileFixPattern(DEFAULT_FIX_PATTERN).re!

describe("fix pattern", () => {
    it("matches fix work in the subject line, in any case", () => {
        for (const m of ["Fix order total", "fixes #12", "BUGFIX: null cart", "Hotfix for release", "Revert \"Add cache\"", "[bug] wrong tax"]) expect(matchesFix(re, m)).toBe(true)
    })
    it("leaves words that only contain the stem alone", () => {
        for (const m of ["Add Fixture for orders", "prefix routes", "debug logging", "Fixtures: products", "suffix"]) expect(matchesFix(re, m)).toBe(false)
    })
    it("reads the subject only, not the body", () => {
        expect(matchesFix(re, "Update docs\n\nfixes the typo reported in #3")).toBe(false)
    })
    it("shows near-misses so the pattern can be checked", () => {
        expect(nearMisses(re, ["Fix a", "Add Fixture", "debug x", "Add Fixture", "plain"])).toEqual(["Add Fixture", "debug x"])
    })
    it("says why a pattern is refused", () => {
        expect(compileFixPattern("(fix").error).toMatch(/Unterminated group/)
        expect(compileFixPattern("x*").error).toMatch(/every commit/)
        expect(compileFixPattern(" ").error).toMatch(/every commit/)
    })
})
