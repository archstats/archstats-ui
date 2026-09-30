import { describe, expect, it } from "vitest"
import { pointsAtView } from "./deixis"

describe("pointsAtView", () => {
    it("takes an explicit pointer at any point of a conversation", () => {
        expect(pointsAtView("Is this component risky?", false)).toBe(true)
        expect(pointsAtView("What do these rows have in common?", false)).toBe(true)
        expect(pointsAtView("Explain what is on screen", false)).toBe(true)
    })

    it("takes a bare this only as the first question", () => {
        expect(pointsAtView("Why are these tangled together?", true)).toBe(true)
        expect(pointsAtView("Is this bad?", false)).toBe(false)
        expect(pointsAtView("Who is the key person here?", true)).toBe(true)
        expect(pointsAtView("Where are the tangles?", true)).toBe(false)
    })
})
