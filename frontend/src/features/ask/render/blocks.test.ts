import { describe, expect, it } from "vitest"
import { citesIn, layoutAnswer } from "./blocks"

const ids = new Set(["E1", "E2", "E3", "E4"])

describe("laying out an answer", () => {
    it("draws an embed where it is written, lit by the facts cited beside it", () => {
        const l = layoutAnswer("It is not layered: core → web points back up [E2.9].\n\n![Where it breaks](exhibit:E2)\n\nAlso a tangle [E2.12].", ids)
        expect(l.blocks.map(b => b.type)).toEqual(["prose", "exhibit", "prose"])
        const ex = l.blocks[1] as any
        expect(ex.id).toBe("E2")
        expect(ex.caption).toBe("Where it breaks")
        expect(ex.cites).toEqual(["E2.9", "E2.12"])
    })
    it("places a cited exhibit after the paragraph that first cites it, once", () => {
        const l = layoutAnswer("First [E1.2].\n\nAgain [E1.3] and [E3].\n\nEnd.", ids)
        expect(l.blocks.map(b => (b.type === "exhibit" ? b.id : "p"))).toEqual(["p", "E1", "p", "E3", "p"])
        expect(l.unplaced).toEqual(["E2", "E4"])
    })
    it("never draws an embed of an id no tool returned", () => {
        const l = layoutAnswer("Text.\n\n![Made up](exhibit:E9)", ids)
        expect(l.blocks.map(b => b.type)).toEqual(["prose"])
        expect(l.blocks[0]).toEqual({ type: "prose", text: "Text." })
    })
    it("draws at most three figures", () => {
        const l = layoutAnswer("[E1] [E2] [E3] [E4]", ids)
        expect(l.blocks.filter(b => b.type === "exhibit")).toHaveLength(3)
    })
    it("hides a half-written embed while streaming, and waits for the paragraph to end", () => {
        const l = layoutAnswer("It is not layered [E1.2].\n\n![Wh", ids, { streaming: true })
        expect(l.blocks).toEqual([{ type: "prose", text: "It is not layered [E1.2]." }, { type: "exhibit", id: "E1", caption: "", cites: ["E1.2"] }])
        const writing = layoutAnswer("Still writing [E1.2]", ids, { streaming: true })
        expect(writing.blocks.map(b => b.type)).toEqual(["prose"])
    })
    it("keeps fenced code whole", () => {
        const l = layoutAnswer("```\na\n\nb\n```\n\n[E1]", ids)
        expect((l.blocks[0] as any).text).toBe("```\na\n\nb\n```\n\n[E1]")
        expect(l.blocks[1]).toMatchObject({ type: "exhibit", id: "E1" })
    })
    it("reads exhibit and fact citations", () => {
        expect(citesIn("x [E3.4, E5] and E12")).toEqual(["E3.4", "E5", "E12"])
    })
})
