import { describe, expect, it } from "vitest"
import { crossingCount, crossings, verdictOf } from "./lensRules"
import type { GroupEdge } from "~/features/groups/groupEdges"

const d = { layers: ["web", "svc", "dom"], pairs: [{ from: "dom", to: "svc", verdict: "allowed" as const }], unset: "unjudged" as const }
const e = (from: string, to: string, kind = "import", refs = 1): GroupEdge => ({ fromGroup: from, toGroup: to, fromComponent: from, toComponent: to, file: `${from}/f.py`, refs, kind, line: 3, ambiguous: false })

describe("lens rules", () => {
    it("allows downward and skipping layers, forbids upward, lets pairs override", () => {
        expect(verdictOf("web", "dom", d)).toBe("allowed")
        expect(verdictOf("svc", "web", d)).toBe("forbidden")
        expect(verdictOf("dom", "svc", d)).toBe("allowed")
        expect(verdictOf("web", "other", d)).toBe("unjudged")
        expect(verdictOf("web", "other", { ...d, unset: "forbidden" })).toBe("forbidden")
    })
    it("collects crossings and keeps type-only imports out of the count", () => {
        const cs = crossings([e("svc", "web", "import", 4), e("svc", "web", "type_only"), e("dom", "web"), e("web", "svc")], d)
        expect(cs.map(c => `${c.from}>${c.to}:${c.refs}:${c.typeOnly}`)).toEqual(["svc>web:4:1", "dom>web:1:0"])
        expect(crossingCount(cs)).toBe(2)
    })
})

describe("cycles the declaration does not judge", () => {
    const edge = (fromGroup: string, toGroup: string) => ({ fromGroup, toGroup, kind: "import" }) as any
    it("names a cycle through groups left out of the layers", async () => {
        const { silentCycles } = await import("./lensRules")
        const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("x", "y"), edge("y", "x")]
        const d = { layers: ["a", "x", "y"], pairs: [], unset: "unjudged" } as any
        // x ⇄ y are both layered, so one direction crosses; a → b → c → a runs through b and c, which nothing judges.
        expect(silentCycles(edges, d)).toEqual([{ groups: ["a", "b", "c"], outOfLayers: ["b", "c"] }])
    })
})
