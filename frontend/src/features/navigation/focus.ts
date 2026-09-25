// Neighbourhoods on the component graph: the sets behind "focus on this and
// what talks to it". Pure, so the query language, the scope, the selection
// tray and the Connections view all answer the same question the same way.
//
// Every set includes its anchors. "Billing and what uses it" plainly contains
// billing, and a focus that dropped the thing you pointed at would leave the
// graph without its centre.

export interface GraphEdge { from: string; to: string }

/** out: what it depends on; in: what depends on it; both: either. */
export type Direction = "out" | "in" | "both"

export interface Adjacency {
  out: Map<string, Set<string>>
  in: Map<string, Set<string>>
}

export function adjacency(edges: Iterable<GraphEdge>): Adjacency {
  const out = new Map<string, Set<string>>()
  const inn = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, a: string, b: string) => {
    const s = m.get(a)
    if (s) s.add(b); else m.set(a, new Set([b]))
  }
  for (const e of edges) {
    if (e.from === e.to) continue
    add(out, e.from, e.to)
    add(inn, e.to, e.from)
  }
  return { out, in: inn }
}

function step(adj: Adjacency, id: string, dir: Direction): string[] {
  const o = dir !== "in" ? adj.out.get(id) : undefined
  const i = dir !== "out" ? adj.in.get(id) : undefined
  return [...(o ?? []), ...(i ?? [])]
}

/**
 * The anchors and everything within `depth` hops of them in one direction;
 * `null` depth walks until nothing new turns up (everything it reaches, or
 * the whole blast radius).
 *
 * "Both" walks each direction on its own. Mixing them at every step would
 * wander from billing to what billing uses to whatever else uses that, which
 * is a neighbourhood of the neighbourhood and not what "around" means.
 */
export function reach(adj: Adjacency, anchors: Iterable<string>, dir: Direction, depth: number | null): Set<string> {
  if (dir === "both") {
    const out = reach(adj, anchors, "out", depth)
    for (const id of reach(adj, anchors, "in", depth)) out.add(id)
    return out
  }
  const seen = new Set(anchors)
  let frontier = Array.from(seen)
  for (let d = 0; frontier.length && (depth === null || d < depth); d++) {
    const next: string[] = []
    for (const id of frontier) for (const n of step(adj, id, dir)) if (!seen.has(n)) { seen.add(n); next.push(n) }
    frontier = next
  }
  return seen
}

/** Hops from the anchors to every node reached, following one direction. */
function distances(adj: Adjacency, anchors: Iterable<string>, dir: "out" | "in"): Map<string, number> {
  const dist = new Map<string, number>()
  let frontier: string[] = []
  for (const a of anchors) if (!dist.has(a)) { dist.set(a, 0); frontier.push(a) }
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) for (const n of step(adj, id, dir)) if (!dist.has(n)) { dist.set(n, d); next.push(n) }
    frontier = next
  }
  return dist
}

/**
 * Every component on some route from `a` to `b`, or from `b` to `a`. With no
 * `b`, the routes among the members of `a` themselves: "what sits between
 * these five". The ends are always in.
 */
export function between(adj: Adjacency, a: string[], b: string[] | null): Set<string> {
  const out = new Set<string>([...a, ...(b ?? [])])
  const routes = (from: string[], to: string[]) => {
    const down = reach(adj, from, "out", null)
    const up = reach(adj, to, "in", null)
    for (const id of down) if (up.has(id)) out.add(id)
  }
  if (b === null) {
    // A node counts when some member reaches it and it reaches some member
    // other than one it could only have come from alone -- the plain
    // intersection would put every member's own cycle in.
    for (const s of a) routes([s], a.filter(x => x !== s))
  } else {
    routes(a, b)
    routes(b, a)
  }
  return out
}

/**
 * The components on the shortest routes from `a` to `b`. When nothing leads
 * that way, the routes back from `b` to `a`: a person asking for "the path
 * between web and persistence" rarely knows which way the imports point.
 * Empty when neither reaches the other.
 */
export function shortestPath(adj: Adjacency, a: string[], b: string[]): { nodes: Set<string>; hops: number; reversed: boolean } {
  const attempt = (from: string[], to: string[]) => {
    const fromStart = distances(adj, from, "out")
    const toEnd = distances(adj, to, "in")
    let best = Infinity
    for (const t of to) { const d = fromStart.get(t); if (d !== undefined && d < best) best = d }
    if (best === Infinity || best === 0) return null
    const nodes = new Set<string>()
    for (const [id, d] of fromStart) { const e = toEnd.get(id); if (e !== undefined && d + e === best) nodes.add(id) }
    return { nodes, hops: best }
  }
  const forward = attempt(a, b)
  if (forward) return { ...forward, reversed: false }
  const back = attempt(b, a)
  if (back) return { ...back, reversed: true }
  return { nodes: new Set(), hops: 0, reversed: false }
}

/**
 * The tangle each anchor sits in: everything it reaches that also reaches it
 * back. An anchor in no cycle is a tangle of one.
 */
export function tangleOf(adj: Adjacency, anchors: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const a of anchors) {
    if (out.has(a)) continue
    const down = reach(adj, [a], "out", null)
    const up = reach(adj, [a], "in", null)
    for (const id of down) if (up.has(id)) out.add(id)
    out.add(a)
  }
  return out
}

/**
 * The next component along the strongest edge, for walking the graph from
 * the keyboard: `]` follows the heaviest dependency, `[` the heaviest
 * dependent. Ties go by name so the same key always lands in the same place.
 */
export function strongestNeighbour(
  edges: Iterable<GraphEdge & { weight?: number; references?: number }>,
  id: string,
  dir: "out" | "in",
  skip: ReadonlySet<string> = new Set(),
): string | null {
  let best: { id: string; w: number } | null = null
  for (const e of edges) {
    const near = dir === "out" ? e.from : e.to
    const far = dir === "out" ? e.to : e.from
    if (near !== id || far === id || skip.has(far)) continue
    const w = e.references ?? e.weight ?? 1
    if (!best || w > best.w || (w === best.w && far < best.id)) best = { id: far, w }
  }
  return best?.id ?? null
}
