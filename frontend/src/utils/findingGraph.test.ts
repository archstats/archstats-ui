import { describe, expect, it } from "vitest"
import { findingGraph, INLINE_CAP } from "./findingGraph"
import { buildModuleGraph } from "./moduleGraph"
import type { UnitNode } from "~/composables/useUnitsModel"

function unit(id: string, file: string): UnitNode {
    return {
        id, kind: "type", name: id, scope: file, component: "c", module: "",
        file, owner: "", lane: "logic", fanIn: 0, fanOut: 0, weight: 1,
    }
}
const laneLabel = (l: string) => l
const laneColor = () => "amber" as const

describe("findingGraph", () => {
    it("reports files that have nothing to do with each other", () => {
        // Eighteen copies of one handler that never import each other is
        // duplication, not a shared abstraction. Saying so is the finding.
        const graph = buildModuleGraph(["a", "b", "c"].map((f) => unit(f, `${f}.ts`)), [])
        const g = findingGraph(["a.ts", "b.ts", "c.ts"], graph, laneLabel, laneColor)
        expect(g.connected).toBe(false)
        expect(g.nodes).toHaveLength(3)
    })

    it("carries the dependencies between them when there are any", () => {
        const graph = buildModuleGraph(
            [unit("a", "a.ts"), unit("b", "b.ts")],
            [{ from: "a", to: "b" }],
        )
        const g = findingGraph(["a.ts", "b.ts"], graph, laneLabel, laneColor)
        expect(g.connected).toBe(true)
        expect(g.edges[0]).toMatchObject({ from: "a.ts", to: "b.ts", references: 1 })
    })

    it("ignores files the snapshot does not know", () => {
        const graph = buildModuleGraph([unit("a", "a.ts")], [])
        expect(findingGraph(["a.ts", "ghost.ts"], graph, laneLabel, laneColor).nodes).toHaveLength(1)
    })

    it("keeps the most connected when there are too many to draw", () => {
        const files = Array.from({ length: INLINE_CAP + 5 }, (_, i) => `f${i}.ts`)
        const units = files.map((f, i) => unit(`u${i}`, f))
        // u0 depends on everything, so its file is the most connected.
        const graph = buildModuleGraph(units, units.slice(1).map((u) => ({ from: "u0", to: u.id })))
        const g = findingGraph(files, graph, laneLabel, laneColor)
        expect(g.nodes).toHaveLength(INLINE_CAP)
        expect(g.omitted).toBe(5)
        expect(g.nodes[0].id).toBe("f0.ts")
    })

    it("has nothing to draw for a finding with no files", () => {
        const graph = buildModuleGraph([], [])
        expect(findingGraph([], graph, laneLabel, laneColor)).toMatchObject({ nodes: [], edges: [], connected: false })
    })
})
