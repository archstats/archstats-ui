import { describe, expect, it } from "vitest";
import { louvain } from "./louvain";

describe("louvain", () => {
  it("finds two tight communities joined by one weak edge", () => {
    const edges = [
      { a: "a1", b: "a2", w: 3 }, { a: "a2", b: "a3", w: 3 }, { a: "a1", b: "a3", w: 3 },
      { a: "b1", b: "b2", w: 3 }, { a: "b2", b: "b3", w: 3 }, { a: "b1", b: "b3", w: 3 },
      { a: "a3", b: "b1", w: 0.2 },
    ];
    const c = louvain(["a1", "a2", "a3", "b1", "b2", "b3"], edges);
    expect(c.get("a1")).toBe(c.get("a2"));
    expect(c.get("a2")).toBe(c.get("a3"));
    expect(c.get("b1")).toBe(c.get("b2"));
    expect(c.get("a1")).not.toBe(c.get("b1"));
  });

  it("leaves isolated nodes in their own community and is deterministic", () => {
    const edges = [{ a: "x", b: "y", w: 1 }];
    const first = louvain(["x", "y", "z"], edges);
    const second = louvain(["x", "y", "z"], edges);
    expect(first.get("x")).toBe(first.get("y"));
    expect(first.get("z")).not.toBe(first.get("x"));
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it("splits more finely at a higher resolution", () => {
    // A chain of four triangles; low resolution merges neighbours, high keeps them apart.
    const edges: Array<{ a: string; b: string; w: number }> = [];
    for (let t = 0; t < 4; t++) {
      const [p, q, r] = [`t${t}a`, `t${t}b`, `t${t}c`];
      edges.push({ a: p, b: q, w: 2 }, { a: q, b: r, w: 2 }, { a: p, b: r, w: 2 });
      if (t > 0) edges.push({ a: `t${t - 1}c`, b: p, w: 1.5 });
    }
    const ids = edges.flatMap(e => [e.a, e.b]);
    const coarse = new Set(louvain(ids, edges, 0.3).values()).size;
    const fine = new Set(louvain(ids, edges, 2).values()).size;
    expect(fine).toBeGreaterThanOrEqual(coarse);
    expect(fine).toBe(4);
  });

  it("starts from a partition and never moves frozen nodes", () => {
    // Four nodes all equally connected; the partition says {p,q} and {r,s}.
    const edges = [{ a: "p", b: "q", w: 1 }, { a: "q", b: "r", w: 1 }, { a: "r", b: "s", w: 1 }, { a: "s", b: "p", w: 1 }, { a: "p", b: "r", w: 1 }, { a: "q", b: "s", w: 1 }];
    const initial = new Map<string, string>([["p", "left"], ["q", "left"], ["r", "right"], ["s", "right"]]);
    const c = louvain(["p", "q", "r", "s"], edges, 1, { initial, frozen: new Set(["p", "q", "r", "s"]) });
    expect(c.get("p")).toBe(c.get("q"));
    expect(c.get("r")).toBe(c.get("s"));
    expect(c.get("p")).not.toBe(c.get("r"));
  });

  it("lets free nodes join a frozen community but never merges two frozen ones", () => {
    const edges = [{ a: "a1", b: "a2", w: 5 }, { a: "b1", b: "b2", w: 5 }, { a: "a2", b: "b1", w: 5 }, { a: "x", b: "a1", w: 3 }];
    const initial = new Map<string, string>([["a1", "A"], ["a2", "A"], ["b1", "B"], ["b2", "B"]]);
    const c = louvain(["a1", "a2", "b1", "b2", "x"], edges, 0.3, { initial, frozen: new Set(["a1", "a2", "b1", "b2"]) });
    expect(c.get("a1")).not.toBe(c.get("b1"));
    expect(c.get("x")).toBe(c.get("a1"));
  });
});
