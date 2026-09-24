// Louvain community detection on a weighted undirected graph, deterministic
// (no shuffling) so the same input always suggests the same groups. The
// resolution parameter trades few large communities (below 1) for many small
// ones (above 1).

export interface WeightedEdge { a: string; b: string; w: number }

export interface LouvainOptions {
  /** Starting partition: nodes sharing a value start in one community. Others start alone. */
  initial?: Map<string, number | string>
  /** Nodes that never leave the community they start in; their community never merges into another. */
  frozen?: Set<string>
}

export function louvain(ids: Iterable<string>, edges: WeightedEdge[], resolution = 1, options: LouvainOptions = {}): Map<string, number> {
  const idList = Array.from(new Set(ids))
  const index = new Map(idList.map((id, i) => [id, i]))
  let n = idList.length
  // adjacency as maps: node -> neighbour -> weight (self loops allowed)
  let adj: Array<Map<number, number>> = idList.map(() => new Map())
  for (const e of edges) {
    const a = index.get(e.a), b = index.get(e.b)
    if (a === undefined || b === undefined || !(e.w > 0)) continue
    if (a === b) { adj[a].set(a, (adj[a].get(a) ?? 0) + e.w); continue }
    adj[a].set(b, (adj[a].get(b) ?? 0) + e.w)
    adj[b].set(a, (adj[b].get(a) ?? 0) + e.w)
  }
  // membership of original nodes in current-level nodes
  let membership = idList.map((_, i) => i)
  // frozen flag per current-level node
  let frozenNode = idList.map(id => options.frozen?.has(id) ?? false)
  // the starting partition applies at the first level only
  let seed: number[] | null = null
  if (options.initial && options.initial.size) {
    const keys = new Map<number | string, number>()
    seed = idList.map((id, i) => {
      const k = options.initial!.get(id)
      if (k === undefined) return i
      if (!keys.has(k)) keys.set(k, i)
      return keys.get(k)!
    })
  }

  for (let level = 0; level < 20; level++) {
    const degree = adj.map((nb, i) => { let d = 0; nb.forEach((w, j) => { d += j === i ? 2 * w : w }); return d })
    const m2 = degree.reduce((s, d) => s + d, 0) // 2m
    if (m2 === 0 && !seed) break
    const community = seed ?? adj.map((_, i) => i)
    seed = null
    const tot = new Array(n).fill(0)
    for (let i = 0; i < n; i++) tot[community[i]] += degree[i]
    // a community holding a frozen node is itself frozen: nothing frozen leaves it
    const frozenCommunity = new Set<number>()
    for (let i = 0; i < n; i++) if (frozenNode[i]) frozenCommunity.add(community[i])
    let moved = true, rounds = 0
    while (moved && rounds < 50) {
      moved = false; rounds++
      for (let i = 0; i < n; i++) {
        if (frozenNode[i]) continue
        const ci = community[i]
        const ki = degree[i]
        // weights from i to each neighbouring community
        const links = new Map<number, number>()
        adj[i].forEach((w, j) => { if (j !== i) links.set(community[j], (links.get(community[j]) ?? 0) + w) })
        tot[ci] -= ki
        let best = ci
        let bestGain = (links.get(ci) ?? 0) - resolution * ki * tot[ci] / m2
        links.forEach((kin, c) => {
          const gain = kin - resolution * ki * tot[c] / m2
          if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < best)) { bestGain = gain; best = c }
        })
        tot[best] += ki
        if (best !== ci) { community[i] = best; moved = true }
      }
    }
    // renumber communities
    const renum = new Map<number, number>()
    for (let i = 0; i < n; i++) if (!renum.has(community[i])) renum.set(community[i], renum.size)
    const next = renum.size
    if (next === n) break
    // aggregate
    const nextAdj: Array<Map<number, number>> = Array.from({ length: next }, () => new Map())
    for (let i = 0; i < n; i++) {
      const ci = renum.get(community[i])!
      adj[i].forEach((w, j) => {
        const cj = renum.get(community[j])!
        if (i === j) nextAdj[ci].set(ci, (nextAdj[ci].get(ci) ?? 0) + w)
        else if (i < j) {
          if (ci === cj) nextAdj[ci].set(ci, (nextAdj[ci].get(ci) ?? 0) + w)
          else { nextAdj[ci].set(cj, (nextAdj[ci].get(cj) ?? 0) + w); nextAdj[cj].set(ci, (nextAdj[cj].get(ci) ?? 0) + w) }
        }
      })
    }
    membership = membership.map(c => renum.get(community[c])!)
    const nextFrozen = new Array(next).fill(false)
    for (let i = 0; i < n; i++) if (frozenNode[i]) nextFrozen[renum.get(community[i])!] = true
    frozenNode = nextFrozen
    adj = nextAdj
    n = next
    if (m2 === 0) break
  }
  const out = new Map<string, number>()
  idList.forEach((id, i) => out.set(id, membership[i]))
  return out
}
