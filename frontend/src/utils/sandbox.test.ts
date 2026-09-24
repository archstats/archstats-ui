import { describe, expect, it } from "vitest"
import { pairKey, project, tangles, type SandboxBase } from "./sandbox"

// a/A1 imports b/B1; b/B1 imports a/A2 (a tangle a<->b); c/C1 imports a/A1.
function base(): SandboxBase {
    const compOf = new Map([["a/A1", "a"], ["a/A2", "a"], ["b/B1", "b"], ["c/C1", "c"]])
    return {
        compOf,
        components: ["a", "b", "c"],
        rows: [
            { from: "a", to: "b", file: "a/A1", refs: 2 },
            { from: "b", to: "a", file: "b/B1", refs: 1 },
            { from: "c", to: "a", file: "c/C1", refs: 3 },
        ],
        targets: new Map([["a/A1\u0000b", ["b/B1"]], ["b/B1\u0000a", ["a/A2"]], ["c/C1\u0000a", ["a/A1"]]]),
        importers: new Map([["b/B1", new Set(["a/A1"])], ["a/A2", new Set(["b/B1"])], ["a/A1", new Set(["c/C1"])]]),
        types: new Map([["a/A1", { total: 2, abstract: 1 }], ["a/A2", { total: 1, abstract: 0 }], ["b/B1", { total: 1, abstract: 1 }]]),
        componentTypes: new Map(),
    }
}

describe("sandbox", () => {
    it("reads the snapshot unchanged with no edits", () => {
        const p = project(base(), [])
        expect(p.metrics.get("a")).toMatchObject({ ca: 2, ce: 1, a: 1 / 3 })
        expect(p.metrics.get("a")!.i).toBeCloseTo(1 / 3)
        expect(p.tangles).toEqual([["a", "b"]])
        expect(p.importSites).toEqual({ sites: 0, files: 0 })
    })
    it("moves a file, and with it the imports it makes and receives", () => {
        // A2 is what b needs from a; moving it into b dissolves the tangle.
        const p = project(base(), [{ kind: "move", file: "a/A2", to: "b" }])
        expect(p.tangles).toEqual([])
        expect(p.pairs.has(pairKey("b", "a"))).toBe(false)
        expect(p.metrics.get("b")!.a).toBeCloseTo(0.5)
        expect(p.importSites).toEqual({ sites: 1, files: 1 })
    })
    it("merges two components and cuts a pair", () => {
        const merged = project(base(), [{ kind: "merge", from: "b", into: "a" }])
        expect(merged.tangles).toEqual([])
        expect(merged.metrics.has("b")).toBe(false)
        expect(merged.metrics.get("a")!.ca).toBe(1)
        const cut = project(base(), [{ kind: "cut", from: "b", to: "a" }])
        expect(cut.tangles).toEqual([])
        expect(cut.pairs.get(pairKey("c", "a"))).toBe(3)
    })
    it("finds tangles without recursion on a long chain", () => {
        const pairs = new Map<string, number>()
        for (let i = 0; i < 20000; i++) pairs.set(pairKey(`n${i}`, `n${i + 1}`), 1)
        pairs.set(pairKey("n20000", "n0"), 1)
        expect(tangles(pairs)[0]).toHaveLength(20001)
    })
})

describe("sandbox store", () => {
    it("undoes and redoes exactly", async () => {
        const { createPinia, setActivePinia } = await import("pinia")
        setActivePinia(createPinia())
        const { useSandboxStore } = await import("~/stores/sandbox")
        const s = useSandboxStore()
        s.base = base()
        const before = JSON.stringify([...s.after!.metrics])
        s.add({ kind: "move", file: "a/A2", to: "b" })
        s.add({ kind: "cut", from: "c", to: "a" })
        const two = JSON.stringify([...s.after!.metrics])
        s.stepBack(); s.stepBack()
        expect(JSON.stringify([...s.after!.metrics])).toBe(before)
        s.stepForward(); s.stepForward()
        expect(JSON.stringify([...s.after!.metrics])).toBe(two)
        expect(s.canRedo).toBe(false)
    })
})

describe("tangle changes", () => {
    it("tells a split from a new tangle", async () => {
        const { compareTangles } = await import("./sandbox")
        const r = compareTangles([["a", "b", "c", "d"], ["x", "y"]], [["a", "b"], ["c", "d"], ["p", "q"], ["x", "y"]])
        expect(r.split).toEqual([{ was: ["a", "b", "c", "d"], now: [["a", "b"], ["c", "d"]] }])
        expect(r.formed).toEqual([["p", "q"]])
        expect(r.gone).toEqual([])
        expect(compareTangles([["a", "b"]], []).gone).toEqual([["a", "b"]])
        expect(compareTangles([["a", "b"]], [["a", "b", "z"]]).formed).toEqual([["a", "b", "z"]])
    })
})
