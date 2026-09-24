import { describe, expect, it } from "vitest"
import { blastRadius, laneFlows, mutualPairs, reachOf } from "./graph"

describe("blastRadius", () => {
    // a -> b -> c -> d, with a shortcut a -> c.
    const chain = [
        { from: "a", to: "b" }, { from: "b", to: "c" },
        { from: "c", to: "d" }, { from: "a", to: "c" },
    ]

    it("follows a chain to its end, not just one hop", () => {
        expect([...blastRadius(chain, "a", "uses").keys()].sort()).toEqual(["b", "c", "d"])
    })

    it("reports the shortest distance when two paths reach the same node", () => {
        // c is two hops away through b and one hop away directly. A blast
        // radius that reported the long way would overstate the distance.
        expect(blastRadius(chain, "a", "uses").get("c")).toBe(1)
        expect(blastRadius(chain, "a", "uses").get("d")).toBe(2)
    })

    it("walks the other way round for what depends on a node", () => {
        expect([...blastRadius(chain, "d", "usedBy").keys()].sort()).toEqual(["a", "b", "c"])
    })

    it("terminates on a cycle rather than walking it forever", () => {
        expect([...blastRadius([{ from: "a", to: "b" }, { from: "b", to: "a" }], "a", "uses").keys()])
            .toEqual(["b"])
    })

    it("never counts the node itself, even when a cycle returns to it", () => {
        expect(blastRadius([{ from: "a", to: "b" }, { from: "b", to: "a" }], "a", "uses").has("a"))
            .toBe(false)
    })

    it("stops at the depth limit instead of crossing a whole codebase", () => {
        const long = [
            { from: "1", to: "2" }, { from: "2", to: "3" },
            { from: "3", to: "4" }, { from: "4", to: "5" },
        ]
        expect(blastRadius(long, "1", "uses", 2).size).toBe(2)
    })
})

describe("reachOf", () => {
    it("counts everything that transitively depends on a node", () => {
        expect(reachOf([{ from: "a", to: "b" }, { from: "b", to: "c" }], "c")).toEqual({ count: 2, hops: 2 })
    })

    it("reports nothing for a node at the top of the chain", () => {
        expect(reachOf([{ from: "a", to: "b" }], "a")).toEqual({ count: 0, hops: 0 })
    })
})

describe("mutualPairs", () => {
    it("finds nodes that use each other, once per pair", () => {
        const pairs = mutualPairs([
            { from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "c" },
        ])
        expect(pairs).toHaveLength(1)
        expect(pairs[0].slice().sort()).toEqual(["a", "b"])
    })

    it("has nothing to report when every edge runs one way", () => {
        expect(mutualPairs([{ from: "a", to: "b" }, { from: "b", to: "c" }])).toEqual([])
    })
})

describe("laneFlows", () => {
    const lanes = new Map([["a", "views"], ["b", "models"], ["c", "views"]])

    it("counts dependencies between lanes and the traffic back", () => {
        const flows = laneFlows(lanes, [
            { from: "a", to: "b" }, { from: "c", to: "b" }, { from: "b", to: "a" },
        ])
        const viewsToModels = flows.find((f) => f.from === "views" && f.to === "models")!
        expect(viewsToModels.count).toBe(2)
        expect(viewsToModels.reverse).toBe(1)
    })

    it("ignores edges inside one lane, which say nothing about layering", () => {
        expect(laneFlows(lanes, [{ from: "a", to: "c" }])).toEqual([])
    })

    it("ignores edges whose ends it cannot place in a lane", () => {
        expect(laneFlows(lanes, [{ from: "a", to: "unknown" }])).toEqual([])
    })
})

describe("reachOf is not capped", () => {
    it("counts everything a change reaches, however far", () => {
        // A chain of ten: the head is reached from nine modules, the furthest nine hops away.
        const edges = Array.from({ length: 9 }, (_, i) => ({ from: `m${i + 1}`, to: `m${i}` }))
        expect(reachOf(edges, "m0")).toEqual({ count: 9, hops: 9 })
    })
})
