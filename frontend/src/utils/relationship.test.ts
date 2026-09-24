import { describe, expect, it } from "vitest"
import { readRelationship } from "./relationship"
import type { Reference } from "./findings"

const nameOf = (p: string) => p.replace(/\.\w+$/, "")
const labelOf = (l: string) => l.charAt(0).toUpperCase() + l.slice(1)

function ref(from: string, to: string, weight = 1): Reference {
    return { from, to, weight }
}

/** Three data modules reaching into logic, and one reference back. */
function boundary(extra: Reference[] = []) {
    const references = [
        ref("D1.ts", "L1.ts"), ref("D2.ts", "L1.ts"), ref("D3.ts", "L2.ts"),
        ref("L9.ts", "D1.ts"),
        ...extra,
    ]
    const laneOf = new Map<string, string>()
    for (const r of references) {
        for (const p of [r.from, r.to]) laneOf.set(p, p.startsWith("D") ? "data" : "logic")
    }
    return { references, laneOf, a: "data", b: "logic", nameOf, labelOf }
}

describe("readRelationship", () => {
    it("splits the traffic by which way most of it runs", () => {
        const r = readRelationship(boundary())
        expect(r.forward).toHaveLength(3)
        expect(r.backward).toHaveLength(1)
    })

    it("reads the grain from the counts, not from the order the lanes were named", () => {
        // Naming logic first must not make its single reference "the grain".
        const b = boundary()
        const flipped = readRelationship({ ...b, a: "logic", b: "data" })
        expect(flipped.forward).toHaveLength(3)
        expect(flipped.backward).toHaveLength(1)
    })

    it("ranks the modules that cross by how far they reach", () => {
        const r = readRelationship(boundary([ref("D1.ts", "L2.ts"), ref("D1.ts", "L3.ts")]))
        expect(r.senders[0].path).toBe("D1.ts")
        expect(r.senders[0].partners.sort()).toEqual(["L1.ts", "L2.ts", "L3.ts"])
    })

    it("ranks what is reached by how many reach it", () => {
        expect(readRelationship(boundary()).receivers[0].path).toBe("L1.ts")
    })

    it("names the modules sending against the grain", () => {
        expect(readRelationship(boundary()).returners.map((c) => c.path)).toEqual(["L9.ts"])
    })

    it("calls the traffic against the grain out as an anomaly", () => {
        const a = readRelationship(boundary()).anomalies.find((x) => x.kind === "against-grain")!
        expect(a.headline).toContain("back into")
        expect(a.tone).toBe("warn")
        expect(a.references).toHaveLength(1)
    })

    it("puts a cycle first, because it is the thing you cannot pull apart", () => {
        // D1 imports L1 and L1 imports D1 back.
        const r = readRelationship(boundary([ref("L1.ts", "D1.ts")]))
        expect(r.anomalies[0].kind).toBe("cycle")
        expect(r.anomalies[0].headline).toMatch(/D1 and L1|L1 and D1/)
    })

    it("counts each cycle once, whichever way round it was seen", () => {
        const r = readRelationship(boundary([ref("L1.ts", "D1.ts")]))
        expect(r.anomalies[0].references).toHaveLength(1)
    })

    it("does not call a one-way dependency a cycle", () => {
        expect(readRelationship(boundary()).anomalies.some((a) => a.kind === "cycle")).toBe(false)
    })

    it("flags a receiver that most of the boundary shares", () => {
        const many = ["A", "B", "C", "D", "E"].map((s) => ref(`D${s}.ts`, "Lhub.ts"))
        const laneOf = new Map<string, string>()
        for (const r of many) { laneOf.set(r.from, "data"); laneOf.set(r.to, "logic") }
        const a = readRelationship({ references: many, laneOf, a: "data", b: "logic", nameOf, labelOf })
            .anomalies.find((x) => x.kind === "bottleneck")!
        expect(a.headline).toBe("Lhub carries 5 of the 5 crossings.")
    })

    it("does not call a receiver a bottleneck when the boundary is spread", () => {
        const spread = ["A", "B", "C", "D", "E"].map((s) => ref(`D${s}.ts`, `L${s}.ts`))
        const laneOf = new Map<string, string>()
        for (const r of spread) { laneOf.set(r.from, "data"); laneOf.set(r.to, "logic") }
        expect(readRelationship({ references: spread, laneOf, a: "data", b: "logic", nameOf, labelOf })
            .anomalies.some((x) => x.kind === "bottleneck")).toBe(false)
    })

    it("flags a module reaching across too widely to be using an interface", () => {
        const wide = ["1", "2", "3", "4", "5"].map((i) => ref("D1.ts", `L${i}.ts`))
        const laneOf = new Map<string, string>()
        for (const r of wide) { laneOf.set(r.from, "data"); laneOf.set(r.to, "logic") }
        const a = readRelationship({ references: wide, laneOf, a: "data", b: "logic", nameOf, labelOf })
            .anomalies.find((x) => x.kind === "wide")!
        expect(a.headline).toBe("D1 reaches 5 modules across the boundary.")
    })

    it("says a clean boundary is clean rather than showing nothing", () => {
        // An empty anomaly list reads as the screen having failed to load.
        const clean = [ref("D1.ts", "L1.ts"), ref("D2.ts", "L2.ts")]
        const laneOf = new Map<string, string>()
        for (const r of clean) { laneOf.set(r.from, "data"); laneOf.set(r.to, "logic") }
        const r = readRelationship({ references: clean, laneOf, a: "data", b: "logic", nameOf, labelOf })
        expect(r.anomalies).toHaveLength(1)
        expect(r.anomalies[0].headline).toBe("Nothing is wrong at this boundary.")
        expect(r.anomalies[0].tone).toBe("neutral")
    })

    it("sums the unit references a crossing carries", () => {
        const heavy = [ref("D1.ts", "L1.ts", 4), ref("D1.ts", "L2.ts", 3)]
        const laneOf = new Map([["D1.ts", "data"], ["L1.ts", "logic"], ["L2.ts", "logic"]])
        const r = readRelationship({ references: heavy, laneOf, a: "data", b: "logic", nameOf, labelOf })
        expect(r.senders[0].weight).toBe(7)
    })
})
