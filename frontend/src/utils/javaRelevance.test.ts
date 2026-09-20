import { describe, expect, it } from "vitest";
import { reverseAdjacency, scoreCandidates, type Adjacency } from "./javaRelevance";

function graph(edges: Array<[string, string, number?]>): Adjacency {
    const out: Adjacency = new Map();
    for (const [from, to, count] of edges) {
        if (!out.has(from)) out.set(from, new Map());
        out.get(from)!.set(to, (out.get(from)!.get(to) ?? 0) + (count ?? 1));
    }
    return out;
}

describe("scoreCandidates", () => {
    it("returns nothing when nothing is explored", () => {
        const out = graph([["A", "B"]]);
        expect(scoreCandidates([], out).size).toBe(0);
    });

    it("scores a direct neighbour above a one-hop neighbour and excludes the explored set", () => {
        // A -> B -> C, with A explored: B is direct, C is one hop further.
        const out = graph([["A", "B", 3], ["B", "C", 3]]);
        const scores = scoreCandidates(["A"], out);
        expect(scores.has("A")).toBe(false);
        expect(scores.get("B")?.score).toBe(100);
        expect(scores.get("B")?.direct).toBe(3);
        expect(scores.get("C")?.direct).toBe(0);
        expect(scores.get("C")?.indirect).toBeGreaterThan(0);
        expect(scores.get("C")!.score).toBeLessThan(scores.get("B")!.score);
    });

    it("penalises a hub that everything references", () => {
        // A references Util and Service with the same weight, but Util is
        // referenced by many other classes: it should rank below Service.
        const out = graph([
            ["A", "Util", 2], ["A", "Service", 2],
            ["X1", "Util"], ["X2", "Util"], ["X3", "Util"], ["X4", "Util"], ["X5", "Util"],
        ]);
        const scores = scoreCandidates(["A"], out);
        expect(scores.get("Service")?.score).toBe(100);
        expect(scores.get("Util")!.score).toBeLessThan(scores.get("Service")!.score);
    });

    it("counts incoming references and honours the known filter", () => {
        const out = graph([["Caller", "A", 4], ["A", "External", 9]]);
        const inc = reverseAdjacency(out);
        expect(inc.get("A")?.get("Caller")).toBe(4);
        const scores = scoreCandidates(["A"], out, inc, (id) => id !== "External");
        expect(scores.get("Caller")?.direct).toBe(4);
        expect(scores.has("External")).toBe(false);
    });

    it("favours a class in a package the exploration already touches, then the same component", () => {
        // A references three classes equally; one shares A's package, one only
        // its component, one neither.
        const out = graph([
            ["com.acme.audit.A", "com.acme.audit.Same", 2],
            ["com.acme.audit.A", "com.acme.audit.sub.Sibling", 2],
            ["com.acme.audit.A", "com.acme.billing.Far", 2],
        ]);
        const componentOf = (id: string) => (id.startsWith("com.acme.audit") ? "audit" : "billing");
        const scores = scoreCandidates(["com.acme.audit.A"], out, undefined, () => true, { componentOf });
        expect(scores.get("com.acme.audit.Same")?.near).toBe("package");
        expect(scores.get("com.acme.audit.sub.Sibling")?.near).toBe("component");
        expect(scores.get("com.acme.billing.Far")?.near).toBeNull();
        expect(scores.get("com.acme.audit.Same")!.score).toBe(100);
        expect(scores.get("com.acme.audit.sub.Sibling")!.score).toBeGreaterThan(scores.get("com.acme.billing.Far")!.score);
        expect(scores.get("com.acme.audit.Same")!.score).toBeGreaterThan(scores.get("com.acme.audit.sub.Sibling")!.score);
    });

    it("measures nearness against the whole explored set, not only the via class", () => {
        // B is reached through A, but sits in the package of explored class X.
        const out = graph([["com.acme.a.A", "com.acme.x.B", 1], ["com.acme.a.A", "com.acme.y.C", 1]]);
        const scores = scoreCandidates(["com.acme.a.A", "com.acme.x.X"], out);
        expect(scores.get("com.acme.x.B")?.near).toBe("package");
        expect(scores.get("com.acme.x.B")!.score).toBeGreaterThan(scores.get("com.acme.y.C")!.score);
    });

    it("shaves a little off a candidate that fans out to many classes", () => {
        // A references Focused and Broad equally; Broad also references twenty others.
        const edges: Array<[string, string, number?]> = [["A", "Focused", 2], ["A", "Broad", 2]];
        for (let i = 0; i < 20; i++) edges.push(["Broad", `Dep${i}`]);
        const scores = scoreCandidates(["A"], graph(edges));
        expect(scores.get("Focused")?.score).toBe(100);
        expect(scores.get("Broad")!.score).toBeLessThan(100);
        expect(scores.get("Broad")!.score).toBeGreaterThan(80);
    });
});
