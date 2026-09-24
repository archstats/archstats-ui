import { describe, expect, it } from "vitest"
import {
  feedbackEdges, idsInRect, isDynamicOnly, levelize, neighboursOf,
  buildTreeNodes, treeResolver, presetOpenIds, levelOf, stronglyConnectedSets, cycleEdgeKeys, edgeKey, type ConnectionsQueryState,
  DEFAULT_CONNECTIONS_STATE,
  buildMixedGrainNodes,
  decodeSelection,
  directedReferenceEdges,
  edgeWeight,
  encodeSelection,
  identityResolver,
  isOverCap,
  mixedGrainResolver,
  normalizeEdges,
  orderNodes,
  parseConnectionsQuery,
  reindexEdges,
  toConnectionsQuery,
  toggleSelection,
  topDegreeIds,
  undirectedSharedCommitEdges,
  type CNode,
  type ConnectionsQueryState,
} from "./connections"

describe("URL state round-trip", () => {
  it("parses an empty query into the documented defaults", () => {
    expect(parseConnectionsQuery({})).toEqual(DEFAULT_CONNECTIONS_STATE)
  })

  it("round-trips every field", () => {
    const state: ConnectionsQueryState = { rep: "crosscut", source: "git", level: "files", by: "Domain", color: "Layer", x: "Team", measure: "files", cycles: "selected", q: "dto", sel: "a" }
    expect(parseConnectionsQuery(toConnectionsQuery(state))).toEqual(state)
  })

  it("omits default fields so the bare route has no params", () => {
    expect(toConnectionsQuery(DEFAULT_CONNECTIONS_STATE)).toEqual({})
  })

  it("falls back to defaults for garbage and still reads old grain links", () => {
    const state = parseConnectionsQuery({ rep: "bogus", source: "bogus", grain: "file", cycles: "bogus", q: 42, sel: ["x", "y"] })
    expect(state.rep).toBe("graph")
    expect(state.source).toBe("static")
    expect(state.level).toBe("files")
    expect(state.cycles).toBe("all")
    expect(state.q).toBe("")
    expect(state.sel).toBe("x")
  })

  it("round-trips node, pair and cycle selections", () => {
    expect(decodeSelection(encodeSelection({ type: "pair", from: "a", to: "b" }))).toEqual({ type: "pair", from: "a", to: "b" })
    expect(decodeSelection(encodeSelection({ type: "node", id: "a" }))).toEqual({ type: "node", id: "a" })
    expect(decodeSelection(encodeSelection({ type: "cycle", id: "a" }))).toEqual({ type: "cycle", id: "a" })
    expect(encodeSelection(null)).toBeNull()
  })
})

describe("multi-selection toggling", () => {
  it("adds an id that isn't in the set", () => {
    const next = toggleSelection(new Set(["a"]), "b")
    expect(next).toEqual(new Set(["a", "b"]))
  })

  it("removes an id that's already in the set", () => {
    const next = toggleSelection(new Set(["a", "b"]), "a")
    expect(next).toEqual(new Set(["b"]))
  })

  it("never mutates the set it was given", () => {
    const original = new Set(["a"])
    toggleSelection(original, "b")
    expect(original).toEqual(new Set(["a"]))
  })
})

describe("combined-weight maths", () => {
  it("weighs a static-only edge as its share of the largest reference count", () => {
    expect(edgeWeight("static", 5, 0, 10, 0)).toBeCloseTo(0.5)
    expect(edgeWeight("static", 10, 0, 10, 0)).toBeCloseTo(1)
  })

  it("weighs a git-only edge as its share of the largest shared-commit count", () => {
    expect(edgeWeight("git", 0, 3, 0, 6)).toBeCloseTo(0.5)
  })

  it("blends both halves 50/50 for combined", () => {
    // refs share = 5/10 = 0.5, shared share = 3/6 = 0.5 -> 0.5*0.5 + 0.5*0.5 = 0.5
    expect(edgeWeight("combined", 5, 3, 10, 6)).toBeCloseTo(0.5)
    // refs share = 1, shared share = 0 -> 0.5*1 + 0.5*0 = 0.5
    expect(edgeWeight("combined", 10, 0, 10, 6)).toBeCloseTo(0.5)
    // both maxed out -> 1
    expect(edgeWeight("combined", 10, 6, 10, 6)).toBeCloseTo(1)
  })

  it("never divides by zero when the max is zero", () => {
    expect(edgeWeight("static", 0, 0, 0, 0)).toBe(0)
    expect(edgeWeight("combined", 0, 0, 0, 0)).toBe(0)
  })

  it("normalizeEdges computes weight against the max of the edge set, per source", () => {
    const edges = normalizeEdges("combined", [
      { from: "a", to: "b", references: 10, sharedCommits: 2 },
      { from: "b", to: "c", references: 5, sharedCommits: 6 },
    ])
    // maxRefs=10, maxShared=6
    expect(edges[0].weight).toBeCloseTo(0.5 * 1 + 0.5 * (2 / 6))
    expect(edges[1].weight).toBeCloseTo(0.5 * 0.5 + 0.5 * 1)
  })

  it("normalizeEdges under source=static ignores sharedCommits entirely", () => {
    const edges = normalizeEdges("static", [
      { from: "a", to: "b", references: 4, sharedCommits: 100 },
      { from: "b", to: "c", references: 8, sharedCommits: 0 },
    ])
    expect(edges[0].weight).toBeCloseTo(0.5)
    expect(edges[1].weight).toBeCloseTo(1)
  })
})

describe("raw edge shaping", () => {
  it("directedReferenceEdges keeps direction and drops self-loops", () => {
    const out = directedReferenceEdges([
      { from: "a", to: "b", references: 3 },
      { from: "a", to: "a", references: 9 },
    ])
    expect(out).toEqual([{ from: "a", to: "b", references: 3, sharedCommits: 0 }])
  })

  it("undirectedSharedCommitEdges canonicalizes direction and never counts a pair twice", () => {
    const out = undirectedSharedCommitEdges([
      { from: "b", to: "a", sharedCommits: 3 },
      { from: "a", to: "b", sharedCommits: 4 },
    ])
    expect(out).toEqual([{ from: "a", to: "b", references: 0, sharedCommits: 4 }])
  })
})

describe("reindexEdges and expand/collapse re-aggregation", () => {
  const groupOf = (name: string): string | null => {
    if (name === "core.Auth" || name === "core.Users") return "core"
    if (name === "billing.Invoice" || name === "billing.Ledger") return "billing"
    return null
  }

  const componentEdges = [
    { from: "core.Auth", to: "core.Users", references: 999, sharedCommits: 0 }, // internal to "core" -> dropped once rolled up
    { from: "core.Auth", to: "billing.Invoice", references: 4, sharedCommits: 1 },
    { from: "billing.Invoice", to: "core.Users", references: 6, sharedCommits: 2 },
    { from: "billing.Ledger", to: "core.Auth", references: 1, sharedCommits: 0 },
    { from: "core.Auth", to: "unowned.X", references: 100, sharedCommits: 0 }, // unowned.X has no group -> dropped
  ]

  it("identityResolver keeps only ids inside the given set", () => {
    const resolve = identityResolver(new Set(["a", "b"]))
    expect(resolve("a")).toBe("a")
    expect(resolve("c")).toBeNull()
  })

  it("rolls component edges up to their groups with plain group grain (nothing expanded)", () => {
    const resolve = mixedGrainResolver(groupOf, new Set())
    const out = reindexEdges(componentEdges, resolve)
    expect(out).toEqual([{ from: "billing", to: "core", references: 11, sharedCommits: 3 }])
  })

  it("expanding a group re-aggregates its members as their own nodes, keeping the other group collapsed", () => {
    const resolve = mixedGrainResolver(groupOf, new Set(["core"]))
    const out = reindexEdges(componentEdges, resolve)
    // core.Auth<->core.Users is now an internal-to-an-expanded-group edge between
    // two real nodes, so it survives; core.Auth/core.Users each still roll up
    // against the collapsed "billing" group.
    const byPair = new Map(out.map(e => [`${e.from}::${e.to}`, e]))
    expect(byPair.get("core.Auth::core.Users")).toEqual({ from: "core.Auth", to: "core.Users", references: 999, sharedCommits: 0 })
    expect(byPair.get("billing::core.Auth")).toEqual({ from: "billing", to: "core.Auth", references: 5, sharedCommits: 1 })
    expect(byPair.get("billing::core.Users")).toEqual({ from: "billing", to: "core.Users", references: 6, sharedCommits: 2 })
  })

  it("expanding every group is equivalent to plain component grain (modulo the unowned node)", () => {
    const resolve = mixedGrainResolver(groupOf, new Set(["core", "billing"]))
    const out = reindexEdges(componentEdges, resolve)
    // All four component-to-component pairs survive as their own edges;
    // only core.Auth->unowned.X drops, since unowned.X has no group.
    expect(out).toHaveLength(4)
  })

  it("collapsing (removing the expansion) re-aggregates from the same raw edges back to plain group grain", () => {
    const expandedResult = reindexEdges(componentEdges, mixedGrainResolver(groupOf, new Set(["core"])))
    const collapsedResult = reindexEdges(componentEdges, mixedGrainResolver(groupOf, new Set()))
    expect(collapsedResult).toEqual([{ from: "billing", to: "core", references: 11, sharedCommits: 3 }])
    expect(expandedResult).not.toEqual(collapsedResult)
  })

  it("buildMixedGrainNodes replaces only the expanded group with its members, in group order", () => {
    const groups = [
      { id: "core", members: ["core.Auth", "core.Users"] },
      { id: "billing", members: ["billing.Invoice"] },
    ]
    const nodes = buildMixedGrainNodes(
      groups,
      new Set(["core"]),
      (memberId, group): CNode => ({ id: memberId, label: memberId, kind: "component", group: group.id }),
      (group): CNode => ({ id: group.id, label: group.id, kind: "group" }),
    )
    expect(nodes.map(n => n.id)).toEqual(["core.Auth", "core.Users", "billing"])
    expect(nodes[0].kind).toBe("component")
    expect(nodes[2].kind).toBe("group")
  })
})

describe("caps", () => {
  it("flags matrix and chord past their node caps, never graph", () => {
    expect(isOverCap("matrix", 200)).toBe(false)
    expect(isOverCap("matrix", 401)).toBe(true)
    expect(isOverCap("chord", 150)).toBe(false)
    expect(isOverCap("chord", 151)).toBe(true)
    expect(isOverCap("graph", 100000)).toBe(false)
  })
})

describe("ordering and labeling", () => {
  const node = (id: string, group?: string): CNode => ({ id, label: id, kind: "component", group })

  it("orders by group then by label", () => {
    const ordered = orderNodes([node("z", "b"), node("a", "a"), node("b", "a")])
    expect(ordered.map(n => n.id)).toEqual(["a", "b", "z"])
  })

  it("topDegreeIds keeps the highest-degree nodes only", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")]
    const edges = [
      { from: "a", to: "b", references: 1, sharedCommits: 0, weight: 1 },
      { from: "a", to: "c", references: 1, sharedCommits: 0, weight: 1 },
      { from: "a", to: "d", references: 1, sharedCommits: 0, weight: 1 },
    ]
    const top = topDegreeIds(nodes, edges, 2)
    expect(top.has("a")).toBe(true) // degree 3
    expect(top.size).toBe(2)
  })
})

describe("suggestions and lasso", () => {

  it("selects points inside a rectangle regardless of drag direction", () => {
    const pts = [{ id: "a", x: 1, y: 1 }, { id: "b", x: 5, y: 5 }, { id: "c", x: 9, y: 9 }]
    expect(idsInRect(pts, { x0: 6, y0: 6, x1: 0, y1: 0 })).toEqual(["a", "b"])
  })

  it("lists neighbours with merged direction and strongest first", () => {
    const edges = [
      { from: "a", to: "b", references: 3, sharedCommits: 0, weight: 0.3 },
      { from: "b", to: "a", references: 1, sharedCommits: 0, weight: 0.1 },
      { from: "c", to: "a", references: 9, sharedCommits: 2, weight: 0.9 },
    ]
    const n = neighboursOf("a", edges)
    expect(n.map(x => x.id)).toEqual(["c", "b"])
    expect(n[1]).toMatchObject({ references: 4, direction: "both" })
    expect(n[0].direction).toBe("in")
  })
})

describe("tree, presets and cycles", () => {
  const groups = [
    { id: "g1", name: "Audits", members: ["a", "b"] },
    { id: "g2", name: "Ship", members: ["c"] },
  ]
  const files: Record<string, string[]> = { a: ["a/1", "a/2"], b: ["b/1"], c: [], d: ["d/1"] }
  const build = (open: string[]) => buildTreeNodes({
    groups, componentIds: ["a", "b", "c", "d"], filesOf: id => files[id] ?? [], openIds: new Set(open),
    groupNode: g => ({ id: g.id, label: g.name, kind: "group" }),
    componentNode: (id, g) => ({ id, label: id, kind: "component", group: g?.name }),
    fileNode: (f, c) => ({ id: f, label: f, kind: "file", group: c }),
  }).map(n => n.id)

  it("shows closed groups as one node and ungrouped components beside them", () => {
    expect(build([])).toEqual(["g1", "g2", "d"])
  })
  it("opens a group into its components and a component into its files", () => {
    expect(build(["g1"])).toEqual(["a", "b", "g2", "d"])
    expect(build(["g1", "a"])).toEqual(["a/1", "a/2", "b", "g2", "d"])
  })
  it("keeps a component without files as itself even when opened", () => {
    expect(build(["g2", "c"])).toEqual(["g1", "c", "d"])
  })
  it("presets and levelOf agree", () => {
    const gs = ["g1", "g2"], cs = ["a", "b", "c", "d"]
    expect(levelOf(presetOpenIds("groups", gs, cs), gs, cs)).toBe("groups")
    expect(levelOf(presetOpenIds("components", gs, cs), gs, cs)).toBe("components")
    expect(levelOf(presetOpenIds("files", gs, cs), gs, cs)).toBe("files")
    expect(levelOf(new Set(["g1"]), gs, cs)).toBeNull()
  })
  it("resolves raw ids to what is on screen", () => {
    const visible = new Set(["a/1", "a/2", "b", "g2", "d"])
    const r = treeResolver({
      groupOf: c => (["a", "b"].includes(c) ? "g1" : c === "c" ? "g2" : null),
      componentOf: f => f.split("/")[0],
      isFile: id => id.includes("/"),
      openIds: new Set(["g1", "a"]),
      visible,
    })
    expect(r("a/1")).toBe("a/1")
    expect(r("b/1")).toBe("b")
    expect(r("c")).toBe("g2")
    expect(r("d/1")).toBe("d")
    expect(r("zzz")).toBeNull()
  })
  it("finds strongly connected sets and their edges", () => {
    const edges = [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "b" }, { from: "d", to: "e" }]
    const sets = stronglyConnectedSets(["a", "b", "c", "d", "e"], edges)
    expect(sets).toEqual([["a", "b", "c", "d"]])
    const keys = cycleEdgeKeys(edges, sets)
    expect(keys.has(edgeKey("a", "b"))).toBe(true)
    expect(keys.has(edgeKey("d", "e"))).toBe(false)
  })
  it("reindexes directed edges without folding direction", () => {
    const raw = [{ from: "x", to: "y", references: 1, sharedCommits: 0 }, { from: "y", to: "x", references: 2, sharedCommits: 0 }]
    expect(reindexEdges(raw, id => id, true)).toHaveLength(2)
    expect(reindexEdges(raw, id => id)).toHaveLength(1)
  })

})

describe("feedbackEdges", () => {
  const edge = (from: string, to: string, references: number) => ({ from, to, references, sharedCommits: 0, weight: references / 10 })

  it("names the cheapest edge that closes a three-way loop", () => {
    const edges = [edge("a", "b", 10), edge("b", "c", 8), edge("c", "a", 1)]
    const cuts = feedbackEdges(["a", "b", "c"], edges)
    expect(cuts).toHaveLength(1)
    expect([cuts[0].from, cuts[0].to]).toEqual(["c", "a"])
  })

  it("returns cuts that actually break every loop, cheapest first", () => {
    // Two loops sharing a node: a→b→a and b→c→b.
    const edges = [edge("a", "b", 9), edge("b", "a", 2), edge("b", "c", 9), edge("c", "b", 1)]
    const cuts = feedbackEdges(["a", "b", "c"], edges)
    expect(cuts.map(c => c.references)).toEqual([1, 2])
    // Removing them leaves nothing strongly connected.
    const key = (e: { from: string; to: string }) => e.from + ">" + e.to
    const cutKeys = new Set(cuts.map(key))
    const left = edges.filter(e => !cutKeys.has(key(e)))
    expect(stronglyConnectedSets(["a", "b", "c"], left)).toEqual([])
  })

  it("has nothing to cut when the members do not touch", () => {
    expect(feedbackEdges(["a", "b"], [edge("a", "c", 3)])).toEqual([])
  })
})

describe("dynamic references", () => {
    it("marks a pair dynamic-only when every reference is a runtime lookup, and keeps the count through a rollup", () => {
        const raw = directedReferenceEdges([
            { from: "a", to: "b", references: 3, dynamicRefs: 3 },
            { from: "a", to: "c", references: 5, dynamicRefs: 2 },
            { from: "c", to: "b", references: 1, dynamicRefs: 0 },
        ])
        expect(raw.filter(isDynamicOnly).map(e => e.to)).toEqual(["b"])
        const rolled = reindexEdges(raw, id => (id === "a" ? "G" : "H"), true)
        expect(rolled).toEqual([{ from: "G", to: "H", references: 8, dynamicRefs: 5, sharedCommits: 0 }])
        expect(isDynamicOnly(rolled[0])).toBe(false)
    })
})

describe("levelize", () => {
  it("puts callers on top, dependencies below, tangles boxed together", () => {
    const edges = [{ from: "web", to: "svc" }, { from: "svc", to: "dom" }, { from: "svc", to: "util" }, { from: "util", to: "svc" }, { from: "web", to: "dom" }]
    const lv = levelize(["dom", "svc", "util", "web"], edges)
    expect(lv.order).toEqual(["web", "svc", "util", "dom"])
    expect(lv.boxes).toEqual([["svc", "util"]])
    expect(lv.depth).toBe(3)
    // Every edge runs downward or stays inside a box.
    const pos = new Map(lv.order.map((id, i) => [id, i]))
    const boxOf = new Map(lv.boxes.flatMap((b, i) => b.map(id => [id, i])))
    for (const e of edges) expect(pos.get(e.from)! < pos.get(e.to)! || boxOf.get(e.from) === boxOf.get(e.to)).toBe(true)
  })
})
