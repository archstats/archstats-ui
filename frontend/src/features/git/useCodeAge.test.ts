import { describe, expect, it } from "vitest"
import { ageShares } from "./useCodeAge"

describe("ageShares", () => {
    it("weighs by lines and ignores files with no history", () => {
        const s = ageShares([{ lines: 100, days: 400 }, { lines: 100, days: 2000 }, { lines: 200, days: 10 }, { lines: 50, days: null }])
        expect(s).toEqual({ over1: 0.5, over2: 0.25, over5: 0.25, lines: 400 })
    })
})
