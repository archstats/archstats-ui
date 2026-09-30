import { describe, expect, it } from "vitest"
import { misjudged } from "./judgement"

const comps = Array.from({ length: 20 }, (_, i) => ({ name: `org.x.part${i}`, codesmells__code_health: i < 2 ? 3 + i * 0.67 : 8 + i / 10 }))
const snap = { components: () => comps, columns: { components: ["name", "codesmells__code_health"] } } as any

describe("misjudged", () => {
    it("catches a low value called good", () => {
        const m = misjudged("Code health of org.x.part1 is 3.67 out of 10, which is relatively good [E2.1].", snap)
        expect(m).toHaveLength(1)
        expect(m[0].detail).toBe("Calls org.x.part1's code health (3.67) good; it is the 2nd worst of 20")
    })

    it("accepts a judgement that matches the rank", () => {
        expect(misjudged("part19 has good code health: 9.9.", snap)).toEqual([])
        expect(misjudged("org.x.part0 is unhealthy at 3.", snap)).toEqual([])
    })
})
