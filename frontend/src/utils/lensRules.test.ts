import { describe, expect, it } from "vitest"
import { crossingCount, crossings, verdictOf } from "./lensRules"
import type { GroupEdge } from "./groupEdges"

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
