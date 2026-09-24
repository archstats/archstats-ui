import { describe, expect, it } from "vitest"
import { cutPlan, cycleCountsByComponent, cycleThrough, edgeKey, edgeUsage, edgesOf, extendCutPlan, lineOf, participantsOf, pathWithout, stillCycles, symbolOwner, type CyclePath, type Digraph } from "./cycles"

const cycle = (id: number, nodes: string[], sharedCommits = 0): CyclePath =>
    ({ id, nodes, size: nodes.length, sharedCommits, severity: 0 })

const freeCost = { references: () => 1 }

describe("edgesOf", () => {
    it("closes the loop", () => {
        expect(edgesOf(["a", "b", "c"])).toEqual([
            { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" },
        ])
    })

    it("reads a mutual pair as two edges", () => {
        expect(edgesOf(["a", "b"])).toEqual([{ from: "a", to: "b" }, { from: "b", to: "a" }])
    })

    it("survives a degenerate cycle", () => {
        expect(edgesOf([])).toEqual([])
        expect(edgesOf(["a"])).toEqual([{ from: "a", to: "a" }])
    })
})

describe("edgeUsage", () => {
    it("collects the cycles each edge appears in", () => {
        const usage = edgeUsage([cycle(1, ["a", "b"]), cycle(2, ["a", "b", "c"])])
        expect(usage.get(edgeKey("a", "b"))).toEqual([1, 2])
        expect(usage.get(edgeKey("b", "c"))).toEqual([2])
    })
})

describe("cutPlan", () => {
    it("finds the edge that breaks the most cycles first", () => {
        //  a -> b closes three different loops; everything else closes one.
        const cycles = [
            cycle(1, ["a", "b"]),
            cycle(2, ["a", "b", "c"]),
            cycle(3, ["a", "b", "d"]),
        ]
        const [first] = cutPlan(cycles, freeCost)
        expect(first).toMatchObject({ from: "a", to: "b", breaks: 3, remaining: 0 })
    })

    it("keeps cutting until nothing is left", () => {
        const cycles = [cycle(1, ["a", "b"]), cycle(2, ["c", "d"])]
        const steps = cutPlan(cycles, freeCost)
        expect(steps).toHaveLength(2)
        expect(steps[steps.length - 1].remaining).toBe(0)
    })

    it("counts only the cycles still standing", () => {
        const cycles = [cycle(1, ["a", "b"]), cycle(2, ["a", "b", "c"]), cycle(3, ["c", "a"])]
        const steps = cutPlan(cycles, freeCost)
        expect(steps[0].breaks).toBe(2)
        expect(steps[1].breaks).toBe(1)
        expect(steps.reduce((n, s) => n + s.breaks, 0)).toBe(3)
    })

    it("breaks a tie on the cheaper import to remove", () => {
        const cycles = [cycle(1, ["a", "b"])]
        const cost = { references: (from: string) => (from === "a" ? 40 : 2) }
        expect(cutPlan(cycles, cost)[0]).toMatchObject({ from: "b", to: "a", references: 2 })
    })

    it("carries the cycles a cut removes, for filtering", () => {
        const steps = cutPlan([cycle(7, ["a", "b"]), cycle(9, ["a", "b", "c"])], freeCost)
        expect(steps[0].cycleIds).toEqual([7, 9])
    })

    it("stops at the limit rather than running away", () => {
        const many = Array.from({ length: 20 }, (_, i) => cycle(i, [`x${i}`, `y${i}`]))
        expect(cutPlan(many, freeCost, 3)).toHaveLength(3)
    })

    it("has nothing to plan without cycles", () => {
        expect(cutPlan([], freeCost)).toEqual([])
    })
})

describe("participantsOf", () => {
    it("counts the others, never itself", () => {
        const rows = participantsOf([cycle(1, ["me", "a"]), cycle(2, ["me", "a", "b"])], "me")
        expect(rows).toEqual([{ name: "a", count: 2 }, { name: "b", count: 1 }])
    })

    it("counts a component once per cycle", () => {
        expect(participantsOf([cycle(1, ["me", "a", "a"])], "me")).toEqual([{ name: "a", count: 1 }])
    })
})

describe("pathWithout", () => {
    it("rotates to start after the component and drops it", () => {
        expect(pathWithout(["a", "me", "b"], "me")).toEqual(["b", "a"])
        expect(pathWithout(["me", "a", "b"], "me")).toEqual(["a", "b"])
    })

    it("leaves a cycle it is not part of alone", () => {
        expect(pathWithout(["a", "b"], "me")).toEqual(["a", "b"])
    })

    it("empties a mutual pair down to the other side", () => {
        expect(pathWithout(["me", "a"], "me")).toEqual(["a"])
    })
})

describe("symbolOwner", () => {
    const components = new Set(["com.elepy", "com.elepy.i18n", "com.elepy.http"])

    it("attributes a symbol to the longest component that owns it", () => {
        expect(symbolOwner("com.elepy.Elepy", components, ".")).toBe("com.elepy")
        expect(symbolOwner("com.elepy.i18n.ElepyInterpolator", components, ".")).toBe("com.elepy.i18n")
    })

    it("recognises a symbol that is a component", () => {
        expect(symbolOwner("com.elepy.http", components, ".")).toBe("com.elepy.http")
    })

    it("returns nothing for a symbol from outside the codebase", () => {
        expect(symbolOwner("jakarta.inject.Inject", components, ".")).toBeNull()
    })

    it("needs a separator to look for ancestors", () => {
        expect(symbolOwner("com.elepy.Elepy", components, "")).toBeNull()
    })
})

describe("lineOf", () => {
    it("reads the line from a snippet position", () => {
        expect(lineOf("3:8")).toBe(3)
        expect(lineOf("128:0")).toBe(128)
    })

    it("has no line to report for a missing or odd position", () => {
        expect(lineOf(null)).toBeNull()
        expect(lineOf("")).toBeNull()
        expect(lineOf("0:1")).toBeNull()
        expect(lineOf("x:y")).toBeNull()
    })
})

describe("cycleCountsByComponent", () => {
    it("counts each component once per cycle", () => {
        const counts = cycleCountsByComponent([cycle(1, ["a", "b"]), cycle(2, ["a", "b", "c"])])
        expect(counts.get("a")).toBe(2)
        expect(counts.get("c")).toBe(1)
    })

    it("does not double-count a component the path repeats", () => {
        // The stored path repeats its first component; nodes may carry it twice.
        expect(cycleCountsByComponent([cycle(1, ["a", "b", "a"])]).get("a")).toBe(1)
    })

    it("has nothing to count without cycles", () => {
        expect(cycleCountsByComponent([]).size).toBe(0)
    })
})

/** "a -> b", "b -> c" as a digraph. */
function graphOf(...edges: string[]): Digraph {
    const out = new Map<string, Set<string>>()
    for (const edge of edges) {
        const [from, to] = edge.split(" -> ")
        out.set(from, (out.get(from) ?? new Set()).add(to))
    }
    return out
}

describe("cutPlan really breaks every cycle it is given", () => {
    const broken = (cycles: CyclePath[], steps: ReturnType<typeof cutPlan>) => {
        const cut = new Set(steps.map(s => edgeKey(s.from, s.to)))
        return cycles.filter(c => edgesOf(c.nodes).some(e => cut.has(edgeKey(e.from, e.to))))
    }

    it("leaves no listed cycle standing", () => {
        const cycles = [
            cycle(1, ["a", "b"]),
            cycle(2, ["a", "b", "c"]),
            cycle(3, ["d", "e", "f"]),
            cycle(4, ["b", "c", "d"]),
        ]
        const steps = cutPlan(cycles, freeCost)
        expect(broken(cycles, steps)).toHaveLength(cycles.length)
        expect(steps[steps.length - 1].remaining).toBe(0)
    })

    it("accounts for every cycle exactly once across the steps", () => {
        const cycles = [cycle(1, ["a", "b"]), cycle(2, ["a", "b", "c"]), cycle(3, ["x", "y"])]
        const steps = cutPlan(cycles, freeCost)
        expect(steps.reduce((n, s) => n + s.breaks, 0)).toBe(cycles.length)
    })
})

describe("cycleThrough", () => {
    it("finds a loop and closes it on the component it started from", () => {
        const loop = cycleThrough(graphOf("a -> b", "b -> c", "c -> a"), "a")
        expect(loop).toEqual(["a", "b", "c", "a"])
    })

    it("returns nothing when the dependencies flow one way", () => {
        expect(cycleThrough(graphOf("a -> b", "b -> c"), "a")).toBeNull()
    })

    it("ignores a loop the component is not part of", () => {
        expect(cycleThrough(graphOf("a -> b", "b -> c", "c -> b"), "a")).toBeNull()
    })
})

describe("extendCutPlan", () => {
    it("finishes what the listed cycles miss", () => {
        // The shortest cycle is a <-> b; a longer one runs a -> c -> d -> a
        // and survives cutting the short one.
        const graph = graphOf("a -> b", "b -> a", "a -> c", "c -> d", "d -> a")
        const shortCut = [{ from: "a", to: "b" }]
        expect(stillCycles(graph, "a", shortCut)).toBe(true)

        const { extra, clear } = extendCutPlan(graph, "a", shortCut, freeCost)
        expect(clear).toBe(true)
        expect(extra.length).toBeGreaterThan(0)
        expect(extra[0].beyondListed).toBe(true)
        expect(stillCycles(graph, "a", [...shortCut, ...extra])).toBe(false)
    })

    it("cuts the cheapest import in the loop it found", () => {
        const graph = graphOf("a -> b", "b -> c", "c -> a")
        const cost = { references: (from: string) => (from === "b" ? 1 : 50) }
        const { extra } = extendCutPlan(graph, "a", [], cost)
        expect(extra[0]).toMatchObject({ from: "b", to: "c", references: 1 })
    })

    it("has nothing to add when the graph is already clear", () => {
        const { extra, clear } = extendCutPlan(graphOf("a -> b"), "a", [], freeCost)
        expect(extra).toHaveLength(0)
        expect(clear).toBe(true)
    })

    it("stops at the limit and says it did not finish", () => {
        const graph = graphOf("a -> b", "b -> a", "a -> c", "c -> a", "a -> d", "d -> a")
        const { extra, clear } = extendCutPlan(graph, "a", [], freeCost, 1)
        expect(extra).toHaveLength(1)
        expect(clear).toBe(false)
    })
})
