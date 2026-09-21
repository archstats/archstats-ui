import { describe, expect, it } from "vitest"
import { deltaFrom, deltaText, deltaTitle, deltaTone, NO_DELTA } from "./delta"

describe("deltaFrom", () => {
    it("subtracts the baseline from the current value", () => {
        expect(deltaFrom(120, 100, true, true)).toEqual({ change: 20, baseline: 100, isNew: false })
    })

    it("stays silent without a baseline scan", () => {
        expect(deltaFrom(120, 100, false, true)).toEqual(NO_DELTA)
    })

    it("marks a unit the baseline snapshot never had", () => {
        expect(deltaFrom(120, undefined, true, false).isNew).toBe(true)
    })

    it("stays silent when the baseline row lacks the metric", () => {
        expect(deltaFrom(120, null, true, true)).toEqual(NO_DELTA)
        expect(deltaFrom(120, "", true, true)).toEqual(NO_DELTA)
        expect(deltaFrom(120, "n/a", true, true)).toEqual(NO_DELTA)
    })

    it("stays silent when the current value is missing", () => {
        expect(deltaFrom(null, 100, true, true)).toEqual(NO_DELTA)
    })
})

describe("deltaText", () => {
    const d = (change: number) => ({ change, baseline: 0, isNew: false })

    it("signs the change with a true minus", () => {
        expect(deltaText(d(12))).toBe("+12")
        expect(deltaText(d(-12))).toBe("−12")
    })

    it("says nothing when nothing moved", () => {
        expect(deltaText(d(0))).toBe("")
    })

    it("says nothing when the move would round away at the shown precision", () => {
        expect(deltaText(d(0.4))).toBe("")
        expect(deltaText(d(0.04), 1)).toBe("")
        expect(deltaText(d(0.4), 1)).toBe("+0.4")
    })

    it("names a unit that is new rather than showing a number", () => {
        expect(deltaText({ change: null, baseline: null, isNew: true })).toBe("new")
    })
})

describe("deltaTone", () => {
    const rise = { change: 5, baseline: 1, isNew: false }
    const fall = { change: -5, baseline: 9, isNew: false }

    it("keeps size and centrality colourless", () => {
        expect(deltaTone(rise, "neutral")).toBe("quiet")
        expect(deltaTone(fall, "neutral")).toBe("quiet")
    })

    it("reads a rise as good only where higher is better", () => {
        expect(deltaTone(rise, "up-good")).toBe("good")
        expect(deltaTone(fall, "up-good")).toBe("bad")
    })

    it("reads a rise as bad where higher is riskier", () => {
        expect(deltaTone(rise, "up-risk")).toBe("bad")
        expect(deltaTone(fall, "up-risk")).toBe("good")
    })

    it("marks a new unit whatever the direction", () => {
        expect(deltaTone({ change: null, baseline: null, isNew: true }, "up-risk")).toBe("new")
    })
})

describe("deltaTitle", () => {
    it("reports the earlier value", () => {
        expect(deltaTitle({ change: 20, baseline: 100, isNew: false })).toBe("Was 100")
    })

    it("explains a new unit", () => {
        expect(deltaTitle({ change: null, baseline: null, isNew: true })).toBe("Not in the baseline snapshot")
    })
})
