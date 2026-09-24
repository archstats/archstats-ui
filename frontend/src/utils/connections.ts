// Pure model and logic for the Connections view (`pages/views/connections.vue`).
// No Vue, no store, no D3 — everything here is plain data in, plain data out,
// so it can be unit tested without mounting anything. The three renderers and
// the page itself import this for URL state, edge weighting, node caps and
// the group expand/collapse and multi-selection logic.

import { componentPath } from "./routes"

export type Grain = "group" | "component" | "file"
export type Source = "static" | "git" | "combined"
export type Rep = "matrix" | "chord" | "graph" | "crosscut"
export type CrossMeasure = "coupling" | "files" | "cycles"

export interface CNode {
  id: string
  label: string
  kind: Grain
  group?: string
  /** Fill colour for the Graph representation: a real saved-group colour, or a stable per-component colour at file grain. Neutral when absent. */
  color?: string
  lines?: number
  files?: number
  health?: number
  hotspot?: number
  /**
   * When a component is split across groups, the share each one holds. The
   * node is drawn as those slices rather than as one colour, so it can never
   * read as wholly belonging to a group that only has part of it.
   */
  slices?: Array<{ color: string; share: number }>
}

export interface CEdge {
  from: string
  to: string
  references: number
  sharedCommits: number
  /** 0–1, meaning depends on `source`: refs share, shared-commits share, or the 50/50 blend. */
  weight: number
}

// ── Caps ─────────────────────────────────────────────────────────────────
// A chord of 150 arcs still labels its busiest; the old 120 refused
// django-oscar's 122 components by two.
export const CHORD_CAP = 150
export const MATRIX_CAP = 200

export function isOverCap(rep: Rep, nodeCount: number): boolean {
  if (rep === "chord") return nodeCount > CHORD_CAP
  if (rep === "matrix") return nodeCount > MATRIX_CAP
  return false
}

export function capFor(rep: Rep): number | null {
  if (rep === "chord") return CHORD_CAP
  if (rep === "matrix") return MATRIX_CAP
  return null
}

// ── URL state ────────────────────────────────────────────────────────────
// `rep`, `source`, `grain`, `q`, `sel` — defaults matrix · static · component,
// omitted from the query string so links stay short and the default route is
// bare `/views/connections`.

export type Level = "groups" | "components" | "files"
export type CycleMode = "off" | "all" | "selected"

export interface ConnectionsQueryState {
  rep: Rep
  source: Source
  /** Preset expansion: everything closed to groups, opened to components, or opened to files. */
  level: Level
  /** Dimension to roll up by; null means "not chosen" (the view picks the first dimension), "none" means no roll-up. */
  by: string | null
  /** Dimension to colour by; null means "same as `by`". */
  color: string | null
  /** Cross-cut: the column dimension; null means "the first dimension that is not the row one". */
  x: string | null
  /** Cross-cut: what a cell shows. */
  measure: CrossMeasure
  cycles: CycleMode
  q: string
  sel: string | null
}

// Graph is the default representation: it is the merged home of the old
// Coupling, Group Coupling and Clustering views, so it is what most visits
// to Connections want first. Matrix and Chord stay one click away.
export const DEFAULT_CONNECTIONS_STATE: ConnectionsQueryState = {
  rep: "graph",
  source: "static",
  level: "groups",
  by: null,
  color: null,
  x: null,
  measure: "coupling",
  cycles: "all",
  q: "",
  sel: null,
}

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined
  return typeof v === "string" ? v : undefined
}

export function parseRep(v: unknown): Rep {
  const s = firstString(v)
  return s === "chord" || s === "matrix" || s === "crosscut" ? s : "graph"
}

export function parseSource(v: unknown): Source {
  const s = firstString(v)
  return s === "git" || s === "combined" ? s : "static"
}

export function parseLevel(v: unknown): Level {
  const s = firstString(v)
  return s === "components" || s === "files" ? s : "groups"
}

export function parseCycles(v: unknown): CycleMode {
  const s = firstString(v)
  return s === "off" || s === "selected" ? s : "all"
}

/** Parses a route's `query` object (as vue-router hands it) into full state. Old `grain` links still land. */
export function parseConnectionsQuery(query: Record<string, unknown>): ConnectionsQueryState {
  const q = firstString(query.q)
  const sel = firstString(query.sel)
  const grain = firstString(query.grain)
  const level = query.level !== undefined ? parseLevel(query.level) : grain === "component" ? "components" : grain === "file" ? "files" : "groups"
  const by = firstString(query.by)
  const color = firstString(query.color)
  const x = firstString(query.x)
  const measure = firstString(query.measure)
  return {
    rep: parseRep(query.rep),
    source: parseSource(query.source),
    level,
    by: by && by.length > 0 ? by : null,
    color: color && color.length > 0 ? color : null,
    x: x && x.length > 0 ? x : null,
    measure: measure === "files" || measure === "cycles" ? measure : "coupling",
    cycles: parseCycles(query.cycles),
    q: q ?? "",
    sel: sel && sel.length > 0 ? sel : null,
  }
}

/** Builds a router query object from state, omitting anything at its default so the URL stays quiet. */
export function toConnectionsQuery(state: ConnectionsQueryState): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.rep !== DEFAULT_CONNECTIONS_STATE.rep) out.rep = state.rep
  if (state.source !== DEFAULT_CONNECTIONS_STATE.source) out.source = state.source
  if (state.level !== DEFAULT_CONNECTIONS_STATE.level) out.level = state.level
  if (state.by) out.by = state.by
  if (state.color) out.color = state.color
  if (state.x) out.x = state.x
  if (state.measure !== "coupling") out.measure = state.measure
  if (state.cycles !== DEFAULT_CONNECTIONS_STATE.cycles) out.cycles = state.cycles
  if (state.q) out.q = state.q
  if (state.sel) out.sel = state.sel
  return out
}

// ── Selection ────────────────────────────────────────────────────────────
// One `sel` query param encodes either a single node or a pair. A pair uses a
// separator that cannot appear in a component, file or group name.

export type Selection =
  | { type: "node"; id: string }
  | { type: "pair"; from: string; to: string }
  /** A cycle, named by any one of its members; the view resolves the whole strongly connected set. */
  | { type: "cycle"; id: string }

const PAIR_SEPARATOR = "→"
const CYCLE_PREFIX = "cycle:"

export function encodeSelection(sel: Selection | null): string | null {
  if (!sel) return null
  if (sel.type === "node") return sel.id
  if (sel.type === "cycle") return CYCLE_PREFIX + sel.id
  return `${sel.from}${PAIR_SEPARATOR}${sel.to}`
}

export function decodeSelection(raw: string | null): Selection | null {
  if (!raw) return null
  if (raw.startsWith(CYCLE_PREFIX)) return { type: "cycle", id: raw.slice(CYCLE_PREFIX.length) }
  const idx = raw.indexOf(PAIR_SEPARATOR)
  if (idx === -1) return { type: "node", id: raw }
  return { type: "pair", from: raw.slice(0, idx), to: raw.slice(idx + PAIR_SEPARATOR.length) }
}

// ── Multi-selection ──────────────────────────────────────────────────────
// Shift/cmd-click accumulates a Set<string> alongside (not instead of) the
// single node/pair `selection` above, which still drives the inspector. The
// multi-selection feeds the floating group-action bar and the context menu's
// "create group from selection".

export function toggleSelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// ── Edge weighting ───────────────────────────────────────────────────────
// weight = 0.5·refs/maxRefs + 0.5·shared/maxShared for `combined`; a single
// source uses just its own half, scaled back to 0–1.

export interface RawEdge {
  from: string
  to: string
  references: number
  sharedCommits: number
}

function share(value: number, max: number): number {
  return max > 0 ? value / max : 0
}

export function edgeWeight(source: Source, references: number, sharedCommits: number, maxRefs: number, maxShared: number): number {
  if (source === "static") return share(references, maxRefs)
  if (source === "git") return share(sharedCommits, maxShared)
  return 0.5 * share(references, maxRefs) + 0.5 * share(sharedCommits, maxShared)
}

/** Turns raw (from, to, references, sharedCommits) rows into weighted CEdges for the active source. */
export function normalizeEdges(source: Source, edges: RawEdge[]): CEdge[] {
  let maxRefs = 0
  let maxShared = 0
  for (const e of edges) {
    if (e.references > maxRefs) maxRefs = e.references
    if (e.sharedCommits > maxShared) maxShared = e.sharedCommits
  }
  return edges.map(e => ({
    from: e.from,
    to: e.to,
    references: e.references,
    sharedCommits: e.sharedCommits,
    weight: edgeWeight(source, e.references, e.sharedCommits, maxRefs, maxShared),
  }))
}

// Internal Map key for an unordered pair. Plain ASCII on purpose (never a
// \u-escaped control character) so the source file stays ordinary text.
const KEY_SEP = "::"

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Directed static edges, unchanged (used only when source === "static" and nothing is being rolled up). */
export function directedReferenceEdges(rows: Array<{ from: string; to: string; references: number }>): RawEdge[] {
  return rows.filter(r => r.from !== r.to).map(r => ({ from: r.from, to: r.to, references: r.references, sharedCommits: 0 }))
}

/** Undirected git edges, canonicalized (used only when source === "git" and nothing is being rolled up). */
export function undirectedSharedCommitEdges(rows: Array<{ from: string; to: string; sharedCommits: number }>): RawEdge[] {
  const map = new Map<string, RawEdge>()
  for (const r of rows) {
    if (r.from === r.to) continue
    const [a, b] = canonicalPair(r.from, r.to)
    const key = `${a}${KEY_SEP}${b}`
    const entry = map.get(key) ?? { from: a, to: b, references: 0, sharedCommits: 0 }
    entry.sharedCommits += r.sharedCommits
    map.set(key, entry)
  }
  return Array.from(map.values())
}

// ── Reindexing: group rollup and mixed-grain expand/collapse ────────────
// One function does the work behind every grain that isn't "take the rows
// as they are": rolling component edges up to their groups, and the mixed
// grain a group's "Expand" produces (some groups replaced by their member
// components, the rest still collapsed). Each edge's endpoints are resolved
// to whatever id currently represents them; a pair that resolves to the same
// id, or where either side has nowhere to go, is dropped — that's internal
// coupling, not a visible edge. Resolved pairs are canonicalized (a < b) and
// their references/sharedCommits summed, so calling this again with a wider
// or narrower resolver (an expand or a collapse) always yields a consistent
// re-aggregation instead of compounding the previous one.

export type IdResolver = (id: string) => string | null

/** Every id maps to itself, unless it's outside `validIds` (then it's dropped). Component and file grain use this. */
export function identityResolver(validIds: ReadonlySet<string>): IdResolver {
  return id => (validIds.has(id) ? id : null)
}

/** A component maps to itself when its group is expanded, otherwise to its (collapsed) group; with no expansions this is plain group grain. */
export function mixedGrainResolver(groupOf: IdResolver, expandedGroupIds: ReadonlySet<string>): IdResolver {
  return name => {
    const g = groupOf(name)
    if (!g) return null
    return expandedGroupIds.has(g) ? name : g
  }
}

export function reindexEdges(edges: RawEdge[], resolve: IdResolver, directed = false): RawEdge[] {
  const map = new Map<string, RawEdge>()
  for (const e of edges) {
    const from = resolve(e.from)
    const to = resolve(e.to)
    if (!from || !to || from === to) continue
    const [a, b] = directed ? [from, to] : canonicalPair(from, to)
    const key = `${a}${KEY_SEP}${b}`
    const entry = map.get(key) ?? { from: a, to: b, references: 0, sharedCommits: 0 }
    entry.references += e.references
    entry.sharedCommits += e.sharedCommits
    map.set(key, entry)
  }
  return Array.from(map.values())
}

/** Group grain, mixed with expansion: collapsed groups stay as one node, expanded groups are replaced in place by their member components (in group order, so a matrix/chord still reads as one block per group). */
export function buildMixedGrainNodes<G extends { id: string; members: string[] }>(
  groups: G[],
  expandedGroupIds: ReadonlySet<string>,
  componentNode: (memberId: string, group: G) => CNode,
  groupNode: (group: G) => CNode,
): CNode[] {
  const nodes: CNode[] = []
  const seen = new Set<string>()
  for (const g of groups) {
    if (expandedGroupIds.has(g.id)) {
      for (const member of g.members) {
        if (seen.has(member)) continue
        seen.add(member)
        nodes.push(componentNode(member, g))
      }
    } else {
      nodes.push(groupNode(g))
    }
  }
  return nodes
}

// ── Ordering, labeling ───────────────────────────────────────────────────

/** Matrix and chord order: by group, then by label. */
export function orderNodes(nodes: CNode[]): CNode[] {
  return [...nodes].sort((a, b) => (a.group || "").localeCompare(b.group || "") || a.label.localeCompare(b.label))
}

/** The Crowded Label Rule: a dense graph labels only its top-N hubs by degree, plus the caller's own always-show set. */
export function topDegreeIds(nodes: CNode[], edges: CEdge[], n = 20): Set<string> {
  const degree = new Map<string, number>()
  for (const node of nodes) degree.set(node.id, 0)
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1)
    degree.set(e.to, (degree.get(e.to) || 0) + 1)
  }
  return new Set(
    Array.from(degree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id),
  )
}

// ── Detail navigation ────────────────────────────────────────────────────

/** Where Enter/double-click on a node goes; groups have no detail page (caller sets scope and navigates to Metrics instead). */
export function detailRoute(grain: Grain, id: string): string | null {
  if (grain === "component") return componentPath(id)
  if (grain === "file") return `/views/files/${id}`
  return null
}

// ── Suggested groups ─────────────────────────────────────────────────────
// Louvain communities from the engine are the only automatic grouping left,
// and they never become groups on their own: the view draws them as dashed
// hulls and the user accepts the ones that make sense. Members that already
// belong to a saved group are left out, so a suggestion never fights a
// decision the user already made.

/** A suggested group as the graph draws it: a dashed hull with a label. */
export interface GroupSuggestion {
  key: string
  name: string
  /** Components inside the dashed hull. */
  members: string[]
  /** The strongest reason, one line. */
  reason?: string
  /** Every reason, for the tooltip. */
  reasons?: string[]
  /** Components only partly in this suggestion. */
  split?: number
  /** A draft group the architect has locked. */
  locked?: boolean
}

// ── Lasso ────────────────────────────────────────────────────────────────

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Ids whose point lies inside the rectangle, whichever corner the drag started from. */
export function idsInRect(points: Array<{ id: string; x: number; y: number }>, rect: Rect): string[] {
  const left = Math.min(rect.x0, rect.x1), right = Math.max(rect.x0, rect.x1)
  const top = Math.min(rect.y0, rect.y1), bottom = Math.max(rect.y0, rect.y1)
  return points.filter(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom).map(p => p.id)
}

/** Neighbours of one node with the edge numbers, strongest first; used by the inspector and the pair table. */
export function neighboursOf(id: string, edges: CEdge[]): Array<{ id: string; references: number; sharedCommits: number; weight: number; direction: "out" | "in" | "both" }> {
  const map = new Map<string, { id: string; references: number; sharedCommits: number; weight: number; direction: "out" | "in" | "both" }>()
  for (const e of edges) {
    const other = e.from === id ? e.to : e.to === id ? e.from : null
    if (!other) continue
    const direction: "out" | "in" = e.from === id ? "out" : "in"
    const entry = map.get(other)
    if (entry) {
      entry.references += e.references
      entry.sharedCommits += e.sharedCommits
      entry.weight = Math.max(entry.weight, e.weight)
      if (entry.direction !== direction) entry.direction = "both"
    } else {
      map.set(other, { id: other, references: e.references, sharedCommits: e.sharedCommits, weight: e.weight, direction })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.weight - a.weight)
}

// ── Tree: groups ⊃ components ⊃ files, opened per node ───────────────────
// The picture is one tree, and "grain" is per node: a closed group is one
// node, an open group shows its components, an open component shows its
// files. `openIds` holds what is open; presets fill it wholesale.

export interface TreeInput<G extends { id: string; name: string; members: string[] }> {
  /** Groups of the roll-up dimension; empty means no roll-up. */
  groups: G[]
  componentIds: string[]
  filesOf: (componentId: string) => string[]
  openIds: ReadonlySet<string>
  groupNode: (g: G) => CNode
  componentNode: (id: string, group: G | null) => CNode
  fileNode: (file: string, componentId: string) => CNode
}

export function buildTreeNodes<G extends { id: string; name: string; members: string[] }>(input: TreeInput<G>): CNode[] {
  const nodes: CNode[] = []
  const placed = new Set<string>()
  const component = (id: string, g: G | null) => {
    if (placed.has(id)) return
    placed.add(id)
    if (input.openIds.has(id)) {
      const files = input.filesOf(id)
      if (files.length === 0) { nodes.push(input.componentNode(id, g)); return }
      for (const f of files) nodes.push(input.fileNode(f, id))
    } else {
      nodes.push(input.componentNode(id, g))
    }
  }
  const known = new Set(input.componentIds)
  for (const g of input.groups) {
    if (input.openIds.has(g.id)) {
      for (const m of g.members) if (known.has(m)) component(m, g)
    } else {
      nodes.push(input.groupNode(g))
      for (const m of g.members) placed.add(m)
    }
  }
  for (const c of input.componentIds) component(c, null)
  return nodes
}

/** Where a raw component or file id shows up in the current tree, or null when it is out of view. */
export function treeResolver(opts: {
  groupOf: (componentId: string) => string | null
  componentOf: (fileId: string) => string | null
  isFile: (id: string) => boolean
  openIds: ReadonlySet<string>
  visible: ReadonlySet<string>
}): IdResolver {
  const resolveComponent = (c: string): string | null => {
    const g = opts.groupOf(c)
    if (g && !opts.openIds.has(g)) return opts.visible.has(g) ? g : null
    return opts.visible.has(c) ? c : null
  }
  return id => {
    if (opts.isFile(id)) {
      const c = opts.componentOf(id)
      if (!c) return null
      if (opts.openIds.has(c)) return opts.visible.has(id) ? id : null
      return resolveComponent(c)
    }
    return resolveComponent(id)
  }
}

/** The set of open ids a preset stands for. */
export function presetOpenIds(level: Level, groupIds: Iterable<string>, componentIds: Iterable<string>): Set<string> {
  const open = new Set<string>()
  if (level === "groups") return open
  for (const g of groupIds) open.add(g)
  if (level === "files") for (const c of componentIds) open.add(c)
  return open
}

/** Which preset an open set matches exactly, if any. */
export function levelOf(openIds: ReadonlySet<string>, groupIds: string[], componentIds: string[]): Level | null {
  // Without a roll-up there is no "groups" level: closed components are the top.
  if (groupIds.length === 0) {
    const anyOpen = componentIds.some(c => openIds.has(c))
    if (!anyOpen) return "components"
    return componentIds.every(c => openIds.has(c)) ? "files" : null
  }
  const groupsOpen = groupIds.every(g => openIds.has(g))
  const componentsOpen = componentIds.every(c => openIds.has(c))
  const anyComponentOpen = componentIds.some(c => openIds.has(c))
  const anyGroupOpen = groupIds.some(g => openIds.has(g))
  if (!anyGroupOpen && !anyComponentOpen) return "groups"
  if (groupsOpen && !anyComponentOpen) return "components"
  if (groupsOpen && componentsOpen) return "files"
  return null
}

// ── Cycles ───────────────────────────────────────────────────────────────
// A cycle at the current level is a strongly connected set of visible nodes
// under the directed edges. Tarjan, iterative, so a thousand files is fine.

/**
 * A small set of edges whose removal makes a cycle acyclic, cheapest first.
 * Greedy feedback arc set (Eades, Lin and Smyth) over the subgraph the
 * members induce, weighted by references so the light edges are the ones
 * offered up: breaking a loop should cost as little rewriting as possible.
 */
export function feedbackEdges(members: Iterable<string>, edges: CEdge[], weightOf: (e: CEdge) => number = e => e.references || 1): CEdge[] {
  const inside = new Set(members)
  const sub = edges.filter(e => inside.has(e.from) && inside.has(e.to) && e.from !== e.to)
  if (sub.length === 0) return []

  const out = new Map<string, Map<string, number>>()
  const inc = new Map<string, Map<string, number>>()
  const link = (m: Map<string, Map<string, number>>, a: string, b: string, w: number) => {
    const row = m.get(a) ?? new Map<string, number>()
    row.set(b, (row.get(b) ?? 0) + w)
    m.set(a, row)
  }
  const wOut = new Map<string, number>(), wIn = new Map<string, number>()
  for (const e of sub) {
    const w = Math.max(0.0001, weightOf(e))
    link(out, e.from, e.to, w)
    link(inc, e.to, e.from, w)
    wOut.set(e.from, (wOut.get(e.from) ?? 0) + w)
    wIn.set(e.to, (wIn.get(e.to) ?? 0) + w)
  }

  // Peel sinks to the right and sources to the left; what is left in the
  // middle gets picked by how much more it emits than it receives.
  const alive = new Set(Array.from(inside).filter(id => out.has(id) || inc.has(id)).sort())
  const left: string[] = [], right: string[] = []
  const drop = (id: string) => {
    alive.delete(id)
    out.get(id)?.forEach((w, to) => { if (alive.has(to)) wIn.set(to, (wIn.get(to) ?? 0) - w) })
    inc.get(id)?.forEach((w, from) => { if (alive.has(from)) wOut.set(from, (wOut.get(from) ?? 0) - w) })
  }
  while (alive.size > 0) {
    let peeled = true
    while (peeled && alive.size > 0) {
      peeled = false
      for (const id of Array.from(alive)) {
        if (!alive.has(id)) continue
        if ((wOut.get(id) ?? 0) <= 0.00001) { right.unshift(id); drop(id); peeled = true }
      }
      for (const id of Array.from(alive)) {
        if (!alive.has(id)) continue
        if ((wIn.get(id) ?? 0) <= 0.00001) { left.push(id); drop(id); peeled = true }
      }
    }
    if (alive.size === 0) break
    let best: string | null = null, bestDelta = -Infinity
    for (const id of alive) {
      const delta = (wOut.get(id) ?? 0) - (wIn.get(id) ?? 0)
      if (delta > bestDelta) { bestDelta = delta; best = id }
    }
    if (best === null) break
    left.push(best)
    drop(best)
  }

  const pos = new Map<string, number>()
  ;[...left, ...right].forEach((id, i) => pos.set(id, i))
  // Whatever still points backwards in that order is holding the loop shut.
  return sub
    .filter(e => (pos.get(e.from) ?? 0) > (pos.get(e.to) ?? 0))
    .sort((a, b) => weightOf(a) - weightOf(b) || a.from.localeCompare(b.from))
}

export function stronglyConnectedSets(ids: Iterable<string>, edges: Array<{ from: string; to: string }>): string[][] {
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const e of edges) { if (adj.has(e.from) && adj.has(e.to) && e.from !== e.to) adj.get(e.from)!.push(e.to) }
  let index = 0
  const idx = new Map<string, number>(), low = new Map<string, number>()
  const onStack = new Set<string>(), stack: string[] = [], out: string[][] = []
  for (const root of adj.keys()) {
    if (idx.has(root)) continue
    const work: Array<[string, number]> = [[root, 0]]
    idx.set(root, index); low.set(root, index); index++; stack.push(root); onStack.add(root)
    while (work.length) {
      const [v, i] = work[work.length - 1]
      const next = adj.get(v)!
      if (i < next.length) {
        work[work.length - 1][1] = i + 1
        const w = next[i]
        if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w); work.push([w, 0]) }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      } else {
        work.pop()
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u)!, low.get(v)!)) }
        if (low.get(v) === idx.get(v)) {
          const set: string[] = []
          let w: string
          do { w = stack.pop()!; onStack.delete(w); set.push(w) } while (w !== v)
          if (set.length > 1) out.push(set.sort())
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

export function edgeKey(from: string, to: string): string {
  return from + "\u2192" + to
}

/** Keys of directed edges that lie inside a strongly connected set. */
export function cycleEdgeKeys(edges: Array<{ from: string; to: string }>, sets: string[][]): Set<string> {
  const member = new Map<string, number>()
  sets.forEach((set, i) => set.forEach(id => member.set(id, i)))
  const out = new Set<string>()
  for (const e of edges) {
    const a = member.get(e.from), b = member.get(e.to)
    if (a !== undefined && a === b) out.add(edgeKey(e.from, e.to))
  }
  return out
}
