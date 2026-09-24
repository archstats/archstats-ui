import { describe, expect, it } from "vitest"
import { leansOnLessStable } from "./sdp"

const r = (name: string, i: number | null) => ({ name, instability: i, afferent: 1, efferent: 1 })

describe("leansOnLessStable", () => {
    it("lists dependencies more volatile than the component, tangled ones marked", () => {
        const rows = leansOnLessStable(r("core", 0.2), [r("util", 0.9), r("db", 0.1), r("same", 0.2), r("loop", 0.5), r("unknown", null)], n => (n === "core" || n === "loop" ? "t1" : null))
        expect(rows.map(x => [x.to.name, x.inTangle])).toEqual([["util", false], ["loop", true]])
    })
    it("says nothing when the component's own stability is unknown", () => {
        expect(leansOnLessStable(r("x", null), [r("y", 1)], () => null)).toEqual([])
    })
})
