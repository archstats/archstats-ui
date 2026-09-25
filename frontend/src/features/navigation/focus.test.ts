import { describe, expect, it } from "vitest"
import { adjacency, between, reach, shortestPath, strongestNeighbour, tangleOf } from "./focus"

// web -> api -> service -> repo -> db ; admin -> service ; service <-> audit (a tangle)
const edges = [
  { from: "web", to: "api" },
  { from: "api", to: "service" },
  { from: "service", to: "repo" },
  { from: "repo", to: "db" },
  { from: "admin", to: "service" },
  { from: "service", to: "audit" },
  { from: "audit", to: "service" },
]
const adj = adjacency(edges)
const sorted = (s: Set<string>) => Array.from(s).sort()

describe("reach", () => {
  it("one hop out is what it uses, with itself", () => {
    expect(sorted(reach(adj, ["service"], "out", 1))).toEqual(["audit", "repo", "service"])
  })
  it("one hop in is what uses it", () => {
    expect(sorted(reach(adj, ["service"], "in", 1))).toEqual(["admin", "api", "audit", "service"])
  })
  it("both walks each direction on its own, not a neighbourhood of the neighbourhood", () => {
    // Two hops out of api reaches repo and audit; two hops in reaches web.
    // Mixed walking would also pick up admin (api -> service <- admin).
    expect(sorted(reach(adj, ["api"], "both", 2))).toEqual(["api", "audit", "repo", "service", "web"])
  })
  it("null depth is everything it reaches", () => {
    expect(sorted(reach(adj, ["api"], "out", null))).toEqual(["api", "audit", "db", "repo", "service"])
  })
  it("the blast radius is everything that reaches it", () => {
    expect(sorted(reach(adj, ["repo"], "in", null))).toEqual(["admin", "api", "audit", "repo", "service", "web"])
  })
})

describe("between", () => {
  it("finds every component on a route either way round", () => {
    expect(sorted(between(adj, ["db"], ["web"]))).toEqual(["api", "audit", "db", "repo", "service", "web"])
  })
  it("among a set, keeps the routes between members", () => {
    expect(sorted(between(adj, ["web", "repo", "admin"], null))).toEqual(["admin", "api", "audit", "repo", "service", "web"])
  })
  it("leaves unrelated members as themselves", () => {
    expect(sorted(between(adj, ["web", "admin"], null))).toEqual(["admin", "web"])
  })
})

describe("shortestPath", () => {
  it("keeps only the shortest route", () => {
    const p = shortestPath(adj, ["web"], ["repo"])
    expect(sorted(p.nodes)).toEqual(["api", "repo", "service", "web"])
    expect(p.hops).toBe(3)
    expect(p.reversed).toBe(false)
  })
  it("turns round when the imports point the other way", () => {
    const p = shortestPath(adj, ["db"], ["api"])
    expect(p.reversed).toBe(true)
    expect(sorted(p.nodes)).toEqual(["api", "db", "repo", "service"])
  })
  it("is empty when neither reaches the other", () => {
    expect(shortestPath(adj, ["web"], ["admin"]).nodes.size).toBe(0)
  })
})

describe("tangleOf", () => {
  it("is the strongly connected set", () => {
    expect(sorted(tangleOf(adj, ["audit"]))).toEqual(["audit", "service"])
  })
  it("is the component alone outside any cycle", () => {
    expect(sorted(tangleOf(adj, ["web"]))).toEqual(["web"])
  })
})

describe("strongestNeighbour", () => {
  const weighted = [
    { from: "a", to: "b", references: 3 },
    { from: "a", to: "c", references: 9 },
    { from: "d", to: "a", references: 4 },
    { from: "e", to: "a", references: 4 },
  ]
  it("follows the heaviest dependency", () => expect(strongestNeighbour(weighted, "a", "out")).toBe("c"))
  it("breaks ties by name", () => expect(strongestNeighbour(weighted, "a", "in")).toBe("d"))
  it("skips what it was told to", () => expect(strongestNeighbour(weighted, "a", "out", new Set(["c"]))).toBe("b"))
  it("is null at a leaf", () => expect(strongestNeighbour(weighted, "b", "out")).toBeNull())
})
