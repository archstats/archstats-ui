import { describe, expect, it } from "vitest"
import { afterCuts, edgeId, foldEdges, layoutTangle, planCuts, tanglesOf, type WEdge } from "./untangle"

const e = (from: string, to: string, imports = 1, files = 1): WEdge => ({ from, to, imports, files })

describe("untangle", () => {
    it("finds tangles, largest first", () => {
        const edges = [e("a", "b"), e("b", "a"), e("c", "d"), e("d", "e"), e("e", "c"), e("a", "c")]
        expect(tanglesOf(["a", "b", "c", "d", "e", "f"], edges)).toEqual([["c", "d", "e"], ["a", "b"]])
    })

    it("orders a loop so the light import runs against it", () => {
        const edges = [e("a", "b", 10), e("b", "c", 10), e("c", "a", 1)]
        const l = layoutTangle(["a", "b", "c"], edges)
        expect(l.against.map(x => `${x.from}>${x.to}`)).toEqual(["c>a"])
        expect(l.layers).toEqual([["a"], ["b"], ["c"]])
    })

    it("plans the cut that splits most first, and ends with no tangle", () => {
        // Two loops sharing b: a⇄b and b⇄c; the plan frees everything.
        const edges = [e("a", "b", 5), e("b", "a", 1), e("b", "c", 5), e("c", "b", 2)]
        const nodes = ["a", "b", "c"]
        const plan = planCuts(nodes, layoutTangle(nodes, edges))
        expect(plan.length).toBe(2)
        expect(plan[plan.length - 1]).toMatchObject({ tangled: 0, freed: 3, left: [] })
        const cut = new Set(plan.map(s => edgeId(s.from, s.to)))
        expect(afterCuts(nodes, edges, cut).tangles).toEqual([])
    })

    it("folds connection rows into edges with imports and files", () => {
        const rows = [{ from: "a", to: "b", file: "x", count: 2 }, { from: "a", to: "b", file: "y", count: 1 }, { from: ".", to: "b", file: "z", count: 1 }, { from: "a", to: "a", file: "x", count: 4 }]
        expect(foldEdges(rows)).toEqual([{ from: "a", to: "b", imports: 3, files: 2 }])
    })
})
