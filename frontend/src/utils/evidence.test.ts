import { describe, expect, it } from "vitest"
import { cycleHolds, pickValues, pinStatus } from "./evidence"

describe("pinStatus", () => {
    it("says holds, was-now, gone, and why not", () => {
        expect(pinStatus({ pinned: { a: 1 }, now: { a: 1 } }).text).toBe("holds")
        expect(pinStatus({ pinned: { ce: 14 }, now: { ce: 3 } }).text).toBe("was 14, now 3")
        expect(pinStatus({ pinned: { a: 1, b: 2 }, now: { a: 1, b: 5 }, label: k => k.toUpperCase() }).text).toBe("B was 2, now 5")
        expect(pinStatus({ pinned: { a: 1 }, now: null }).text).toBe("gone")
        expect(pinStatus({ pinned: { a: 1 }, now: { a: 2 }, blocked: "different analyses" }).text).toBe("not comparable: different analyses")
        expect(pinStatus({ pinned: { a: 1 }, now: null, deleted: true }).kind).toBe("deleted")
    })
})

describe("helpers", () => {
    it("holds a cycle only while its members share one group", () => {
        expect(cycleHolds(["a", "b"], new Map([["a", "1"], ["b", "1"]]))).toBe(true)
        expect(cycleHolds(["a", "b"], new Map([["a", "1"], ["b", "2"]]))).toBe(false)
    })
    it("keeps the numeric metrics asked for", () => {
        expect(pickValues({ x: 1, y: "2", z: null, w: "n/a" }, ["x", "y", "z", "w"])).toEqual({ x: 1, y: 2 })
    })
})
