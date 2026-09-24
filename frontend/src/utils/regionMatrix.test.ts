import { describe, expect, it } from "vitest"
import { buildRegionMatrix } from "./regionMatrix"
import { buildModuleGraph } from "./moduleGraph"
import type { UnitNode } from "~/composables/useUnitsModel"
import type { Reference } from "./findings"

function unit(id: string, file: string, lane: string): UnitNode {
    return {
        id, kind: "type", name: id, scope: file, component: "c", module: "",
        file, owner: "", lane, fanIn: 0, fanOut: 0, weight: 1,
    }
}
const laneLabel = (l: string) => l.charAt(0).toUpperCase() + l.slice(1)
const laneColor = (l: string) => (l === "services" ? "green" : "amber") as any

/** Two services reaching into two repositories, with one reference back. */
function fixture() {
    const units = [
        unit("SvcA", "SvcA.java", "services"), unit("SvcB", "SvcB.java", "services"),
        unit("RepoX", "RepoX.java", "repos"), unit("RepoY", "RepoY.java", "repos"),
    ]
    const unitEdges = [
        { from: "SvcA", to: "RepoX" }, { from: "SvcA", to: "RepoY" },
        { from: "SvcB", to: "RepoX" },
        { from: "RepoX", to: "SvcA" },
    ]
    const graph = buildModuleGraph(units, unitEdges)
    const references: Reference[] = [
        { from: "SvcA.java", to: "RepoX.java", weight: 1, back: 1 },
        { from: "SvcA.java", to: "RepoY.java", weight: 1 },
        { from: "SvcB.java", to: "RepoX.java", weight: 1 },
    ]
    return { graph, references }
}

function build(extra: Partial<Parameters<typeof buildRegionMatrix>[0]> = {}) {
    const { graph, references } = fixture()
    return buildRegionMatrix({ references, graph, laneLabel, laneColor, ...extra })
}

describe("buildRegionMatrix", () => {
    it("keeps the modules the region's references actually touch", () => {
        expect(build().nodes.map((n) => n.id).sort())
            .toEqual(["RepoX.java", "RepoY.java", "SvcA.java", "SvcB.java"])
    })

    it("labels a node by its module name and groups it by lane", () => {
        const svc = build().nodes.find((n) => n.id === "SvcA.java")!
        expect(svc.label).toBe("SvcA")
        expect(svc.group).toBe("Services")
        expect(svc.kind).toBe("file")
    })

    it("gives the lane a real colour rather than a utility class", () => {
        // CNode.color is written straight into a style attribute.
        expect(build().nodes.find((n) => n.id === "SvcA.java")!.color)
            .toBe("rgb(var(--c-green-500))")
    })

    it("puts the importing side on the rows and the imported side on the columns", () => {
        // Drawn square, every repository row was empty: repositories are
        // imported constantly and import nothing.
        const m = build()
        expect(m.rowNodes.map((n) => n.id).sort()).toEqual(["SvcA.java", "SvcB.java"])
        expect(m.colNodes.map((n) => n.id).sort()).toEqual(["RepoX.java", "RepoY.java"])
    })

    it("gives every row at least one cell", () => {
        const m = build()
        for (const n of m.rowNodes) {
            expect(m.edges.some((e) => e.from === n.id), n.id).toBe(true)
        }
    })

    it("carries every dependency between kept modules, in both directions", () => {
        // Whether a back-reference can be *drawn* depends on its source also
        // being a row; the data carries it either way.
        expect(build().edges.some((e) => e.from === "RepoX.java" && e.to === "SvcA.java")).toBe(true)
    })

    it("marks both directions of a mutual pair as a cycle", () => {
        const m = build()
        expect(m.cycleKeys.size).toBe(2)
        expect([...m.cycleNodes].sort()).toEqual(["RepoX.java", "SvcA.java"])
    })

    it("scales weight against the heaviest edge and never divides by zero", () => {
        const m = build()
        expect(Math.max(...m.edges.map((e) => e.weight))).toBe(1)
        expect(m.edges.every((e) => e.weight > 0 && e.weight <= 1)).toBe(true)
    })

    it("falls back to the default when the cap is not a usable number", () => {
        // A prop that failed to get wired arrived as NaN, every axis sliced
        // to nothing, and the grid vanished behind its own empty state.
        expect(build({ cap: Number.NaN }).rowNodes.length).toBeGreaterThan(0)
        expect(build({ cap: 0 }).rowNodes.length).toBeGreaterThan(0)
    })

    it("says how many modules did not fit", () => {
        expect(build({ cap: 2 }).omitted).toBeGreaterThan(0)
        expect(build().omitted).toBe(0)
    })

    it("has nothing to draw for a region with no references", () => {
        const { graph } = fixture()
        const m = buildRegionMatrix({ references: [], graph, laneLabel, laneColor })
        expect(m.nodes).toEqual([])
        expect(m.edges).toEqual([])
    })
})
