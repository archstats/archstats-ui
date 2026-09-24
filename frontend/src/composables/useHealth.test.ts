import { describe, expect, it } from "vitest"
import { formatHealth, healthLevel } from "~/composables/useHealth"

describe("healthLevel", () => {
    it("reads a score below the 1-10 floor as not scored, not as the worst", () => {
        // Older snapshots stored unscored files (XML, text, vendored code) as 0.
        expect(healthLevel(0)).toBe("none")
        expect(formatHealth(0)).toBe("—")
        expect(healthLevel(null)).toBe("none")
    })
    it("still grades real scores", () => {
        expect(healthLevel(1)).toBe("bad")
        expect(healthLevel(5)).toBe("warn")
        expect(healthLevel(8.1)).toBe("good")
        expect(formatHealth(8.14)).toBe("8.1")
    })
})
