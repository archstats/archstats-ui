import { describe, expect, it } from "vitest"
import { findingsFor } from "./findings"
import { buildModuleGraph } from "./moduleGraph"
import type { UnitNode } from "~/composables/useUnitsModel"

function unit(id: string, file: string, lane: string): UnitNode {
    return {
        id, kind: "type", name: id, scope: file, component: "c", module: "",
        file, owner: "", lane, fanIn: 0, fanOut: 0, weight: 1,
    }
}
const label = (l: string) => l.charAt(0).toUpperCase() + l.slice(1)

/** Three view modules importing one model module, one way. */
function layered() {
    const units = [
        unit("View1", "View1.ts", "views"), unit("View2", "View2.ts", "views"),
        unit("View3", "View3.ts", "views"), unit("Model", "Model.ts", "models"),
    ]
    const edges = [
        { from: "View1", to: "Model" }, { from: "View2", to: "Model" },
        { from: "View3", to: "Model" },
    ]
    return { units, edges }
}

function findings(units: UnitNode[], edges: Array<{ from: string; to: string }>) {
    return findingsFor({ graph: buildModuleGraph(units, edges), laneLabel: label })
}

describe("findingsFor", () => {
    it("says plainly when a layer holds", () => {
        const { units, edges } = layered()
        const layering = findings(units, edges).find((f) => f.id === "layering")!
        expect(layering.headline).toContain("never the other way round")
        expect(layering.tone).toBe("neutral")
    })

    it("warns when two lanes depend on each other", () => {
        const { units, edges } = layered()
        const both = findings(units, [...edges, { from: "Model", to: "View1" }])
            .find((f) => f.id === "layering")!
        expect(both.headline).toContain("depend on each other")
        expect(both.tone).toBe("warn")
    })

    it("keeps a layering finding's evidence as references, not a bag of ends", () => {
        // Flattening "Model imports View1" into ["Model.ts", "View1.ts"] loses
        // the pairing, which was the whole claim.
        const { units, edges } = layered()
        const both = findings(units, [...edges, { from: "Model", to: "View1" }])
            .find((f) => f.id === "layering")!
        expect(both.region.references).toContainEqual(
            { from: "Model.ts", to: "View1.ts", weight: 1, back: 1 },
        )
    })

    it("carries both directions, so the landing can draw the relationship", () => {
        // Kept to the offending direction only, the boundary is half-drawn:
        // "6 against the grain" with nothing to weigh it against.
        const { units, edges } = layered()
        const both = findings(units, [...edges, { from: "Model", to: "View1" }])
            .find((f) => f.id === "layering")!
        const dirs = new Set(both.region.references!.map((r) => r.from.startsWith("Model") ? "back" : "forward"))
        expect([...dirs].sort()).toEqual(["back", "forward"])
    })

    it("names the two lanes a boundary region is about", () => {
        const { units, edges } = layered()
        const layering = findings(units, edges).find((f) => f.id === "layering")!
        expect(layering.region.sides).toEqual({ a: "views", b: "models" })
    })

    it("gives a knot region both directions' weights, so the pair reads as a pair", () => {
        const { units, edges } = layered()
        const knots = findings(units, [...edges, { from: "Model", to: "View1" }])
            .find((f) => f.id === "knots")!
        expect(knots.region.references).toHaveLength(1)
        expect(knots.region.references![0].weight).toBeGreaterThan(0)
        expect(knots.region.references![0].back).toBeGreaterThan(0)
    })

    it("carries the claim down with the evidence", () => {
        // Arriving at a list without the sentence that sent you there is the
        // descent losing what you clicked.
        const { units, edges } = layered()
        for (const f of findings([...units, unit("Orphan", "Orphan.ts", "views")], edges)) {
            expect(f.region.claim?.headline, f.id).toBe(f.headline)
            expect(f.region.claim?.tone, f.id).toBe(f.tone)
        }
    })

    it("shows modules, not references, when the claim is about modules", () => {
        const many = Array.from({ length: 9 }, (_, i) => unit(`thing${i}`, "god.ts", "views"))
        expect(findings(many, []).find((f) => f.id === "crowded")!.region.references).toBeUndefined()
    })

    it("names what the codebase leans on rather than counting it", () => {
        const { units, edges } = layered()
        const hubs = findings(units, edges).find((f) => f.id === "hubs")!
        expect(hubs.headline).toContain("Model")
        expect(hubs.detail).toContain("imported by 3")
    })

    it("finds the modules that are never imported", () => {
        const { units, edges } = layered()
        const dark = findings([...units, unit("Orphan", "Orphan.ts", "views")], edges)
            .find((f) => f.id === "dark")!
        // The views are imported by nothing either: never imported means
        // exactly that, not "has no edges at all".
        expect(dark.headline).toContain("4 modules are never imported")
        expect(dark.detail).toContain("1 of them import nothing either")
        // The ones importing nothing either come first.
        expect(dark.region.paths[0]).toBe("Orphan.ts")
        expect([...dark.region.paths].sort()).toEqual(["Orphan.ts", "View1.ts", "View2.ts", "View3.ts"])
    })

    it("flags a module that declares too many things", () => {
        const many = Array.from({ length: 9 }, (_, i) => unit(`thing${i}`, "god.ts", "views"))
        expect(findings(many, []).find((f) => f.id === "crowded")!.headline)
            .toContain("declares 9 separate things")
    })

    it("does not call generated code crowded, and says when never-imported modules are generated", () => {
        const many = Array.from({ length: 9 }, (_, i) => unit(`thing${i}`, "RateClient.cs", "views"))
        const out = findingsFor({
            graph: buildModuleGraph(many, []), laneLabel: label, generated: new Set(["RateClient.cs"]),
        })
        expect(out.find((f) => f.id === "crowded")).toBeUndefined()
        expect(out.find((f) => f.id === "dark")!.detail).toContain("1 is generated by a tool")
    })

    it("counts what a module declares, not its types' members", () => {
        // gin's context.go: one type with its methods is one thing.
        const methods = Array.from({ length: 12 }, (_, i) => ({ ...unit(`Context.m${i}`, "context.go", "views"), kind: "function", owner: "Context" }))
        const out = findings([unit("Context", "context.go", "views"), ...methods], [])
        expect(out.find((f) => f.id === "crowded")).toBeUndefined()
        // A Kotlin extension function belongs to a type in another file and
        // is still declared here.
        const ext = Array.from({ length: 9 }, (_, i) => ({ ...unit(`Table.ext${i}`, "Queries.kt", "views"), kind: "function", owner: "Table" }))
        expect(findings(ext, []).find((f) => f.id === "crowded")!.headline).toContain("declares 9 separate things")
    })

    it("does not read a layer into a lane defined by what references it", () => {
        const { units, edges } = layered()
        const out = findingsFor({ graph: buildModuleGraph(units, edges), laneLabel: label, definitional: new Set(["views"]) })
        expect(out.find((f) => f.id === "layering")).toBeUndefined()
    })

    it("does not call an ordinary module crowded", () => {
        const few = Array.from({ length: 4 }, (_, i) => unit(`thing${i}`, "fine.ts", "views"))
        expect(findings(few, []).find((f) => f.id === "crowded")).toBeUndefined()
    })

    it("puts what should change your next move above what is only context", () => {
        const { units, edges } = layered()
        const all = findings(units, [...edges, { from: "Model", to: "View1" }])
        const firstNeutral = all.findIndex((f) => f.tone === "neutral")
        const lastWarn = all.map((f) => f.tone).lastIndexOf("warn")
        expect(lastWarn).toBeLessThan(firstNeutral)
    })

    it("hands every finding somewhere to descend to", () => {
        const { units, edges } = layered()
        for (const f of findings([...units, unit("Orphan", "Orphan.ts", "views")], edges)) {
            expect(f.region.paths.length, f.id).toBeGreaterThan(0)
            expect(f.action, f.id).toBeTruthy()
        }
    })

    it("does not claim a layer from one or two stray references", () => {
        const thin = findings(
            [unit("a", "a.ts", "views"), unit("b", "b.ts", "models")],
            [{ from: "a", to: "b" }],
        )
        expect(thin.find((f) => f.id === "layering")).toBeUndefined()
    })

    it("says nothing at all about an empty codebase", () => {
        expect(findings([], [])).toEqual([])
    })

    it("still reads a codebase whose snapshot recorded no connections", () => {
        // Two snapshots on disk have units and no edges at all.
        const { units } = layered()
        const none = findings(units, [])
        expect(none.find((f) => f.id === "dark")!.headline).toContain("4 modules are never imported")
        expect(none.find((f) => f.id === "layering")).toBeUndefined()
    })
})

describe("isTestPath", () => {
    it("recognises the test conventions of each language", async () => {
        const { isTestPath } = await import("./findings")
        for (const p of ["context_test.go", "src/a/b.test.ts", "Foo.spec.tsx", "tests/test_x.py", "src/test/java/FooTest.java", "api/__tests__/x.js"]) {
            expect(isTestPath(p)).toBe(true)
        }
        for (const p of ["context.go", "src/testing/harness.ts", "latest.ts", "src/main/java/Contest.java"]) {
            expect(isTestPath(p)).toBe(false)
        }
    })
})

describe("the Unclassified lane", () => {
    it("is not a layer a finding can claim depends on another", async () => {
        const { UNCLASSIFIED } = await import("./javaFrameworks")
        const units = [
            unit("Entity1", "Entity1.ts", "entities"), unit("Entity2", "Entity2.ts", "entities"),
            unit("Entity3", "Entity3.ts", "entities"), unit("Iface", "Iface.ts", UNCLASSIFIED),
        ]
        // Every entity uses an interface nothing classified: that is not a
        // dependency of one layer on another.
        const edges = [{ from: "Entity1", to: "Iface" }, { from: "Entity2", to: "Iface" }, { from: "Entity3", to: "Iface" }]
        expect(findings(units, edges).find((f) => f.id === "layering")).toBeUndefined()
    })
})
