// Whether a dimension is any good, measured rather than felt.
//
// A cut is a partition of the component graph, and partitions have been
// measurable for decades. Three numbers answer three different questions:
//
//   Modularity  — are there more edges inside the groups than chance would
//                 put there? The standard Newman–Girvan measure: above about
//                 0.3 is a real structure, near 0 is an arbitrary slicing.
//   Kept inside — what share of all references never leave their group. This
//                 is the one an architect feels: the higher it is, the more a
//                 change stays where it started.
//   Crossing    — cycles and edges that straddle a boundary, which are what
//                 a cut is supposed to expose and what will hurt to keep.
//
// Nothing here knows about the studio: it takes a partition and edges, so the
// same measure scores a hand-built dimension, a preset's first pass, and any
// future algorithm, which is the only way to tell whether one beats another.

export interface QualityEdge { from: string; to: string; weight?: number }

export interface GroupQuality {
  key: string
  name: string
  size: number
  /** References from this group that stay inside it, against all of its references. */
  kept: number
  /** The groups it exchanges its crossing references with, heaviest first. */
  leans: Array<{ name: string; weight: number }>
}

export interface CutQuality {
  /** Newman–Girvan modularity of the partition, -0.5..1. */
  modularity: number
  /** Of the references between placed components, the share staying inside one, 0..1. */
  kept: number
  /** Components placed, and the total there were to place. */
  placed: number
  total: number
  /** Components in no group at all. */
  orphans: number
  /** Edge weight that crosses a boundary. */
  crossing: number
  /** Groups holding a single component; a cut made of singletons is a list. */
  singletons: number
  /** The largest group as a share of everything placed: a cut with one giant group hides the work. */
  biggest: number
  groups: GroupQuality[]
}

const EMPTY: CutQuality = {
  modularity: 0, kept: 0, placed: 0, total: 0, orphans: 0,
  crossing: 0, singletons: 0, biggest: 0, groups: [],
}

/**
 * Newman–Girvan modularity: the share of edge weight inside groups, less the
 * share chance alone would put there given each group's total degree. It is
 * the measure every clustering algorithm optimises, so it is the fair way to
 * compare a cut a person made against one an engine proposed.
 */
export function measureCut(
  groups: Array<{ key: string; name: string; members: string[] }>,
  edges: QualityEdge[],
  total: number,
): CutQuality {
  if (groups.length === 0) return { ...EMPTY, total }

  const groupOf = new Map<string, string>()
  const nameOf = new Map<string, string>()
  for (const g of groups) {
    nameOf.set(g.key, g.name)
    for (const m of g.members) groupOf.set(m, g.key)
  }

  let m = 0
  const inside = new Map<string, number>()
  const degree = new Map<string, number>()
  // Degree double-counts an edge with both ends in one group, which is right
  // for modularity and wrong for `kept`: measured against it, a group holding
  // every one of its references scores 0.5 and the scale has no top half. The
  // crossing weight is counted once, on both sides, and answers it directly.
  const outside = new Map<string, number>()
  const between = new Map<string, Map<string, number>>()
  const bump = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v)
  const toward = (from: string, to: string, v: number) => {
    const row = between.get(from) ?? new Map<string, number>()
    row.set(to, (row.get(to) ?? 0) + v)
    between.set(from, row)
  }

  for (const e of edges) {
    const w = e.weight ?? 1
    if (w <= 0 || e.from === e.to) continue
    const a = groupOf.get(e.from)
    const b = groupOf.get(e.to)
    // Modularity is defined over the graph being partitioned, so an edge with
    // an end that has not been placed is not part of this partition yet.
    // Counting those would score every half-finished cut as arbitrary, which
    // says only that it is half-finished — something coverage already says.
    if (!a || !b) continue
    m += w
    bump(degree, a, w)
    bump(degree, b, w)
    if (a === b) bump(inside, a, w)
    else {
      // Both ends, because a group that is only ever referenced by others is
      // still reaching out of itself — and listing nothing for it would leave
      // its score unexplained on the one row that had to explain it.
      bump(outside, a, w)
      bump(outside, b, w)
      toward(a, b, w)
      toward(b, a, w)
    }
  }

  let modularity = 0
  let keptWeight = 0
  if (m > 0) {
    for (const g of groups) {
      const i = inside.get(g.key) ?? 0
      const d = degree.get(g.key) ?? 0
      modularity += i / m - (d / (2 * m)) ** 2
      keptWeight += i
    }
  }

  const placed = groupOf.size
  const out: GroupQuality[] = groups.map(g => {
    const i = inside.get(g.key) ?? 0
    const o = outside.get(g.key) ?? 0
    const leans = Array.from(between.get(g.key) ?? [])
      .map(([key, weight]) => ({ name: nameOf.get(key) ?? key, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
    return { key: g.key, name: g.name, size: g.members.length, kept: i + o > 0 ? i / (i + o) : 0, leans }
  })

  return {
    modularity,
    kept: m > 0 ? keptWeight / m : 0,
    placed,
    total,
    orphans: Math.max(0, total - placed),
    crossing: m - keptWeight,
    singletons: groups.filter(g => g.members.length === 1).length,
    biggest: placed > 0 ? Math.max(0, ...groups.map(g => g.members.length)) / placed : 0,
    groups: out.sort((a, b) => a.kept - b.kept),
  }
}

/**
 * A plain reading of a modularity number, which means nothing on its own —
 * including that it cannot mean much across two or three groups, where the
 * measure is bounded well below one whatever the cut does. Saying so is
 * better than calling a clean pair of domains arbitrary.
 */
export function readModularity(q: number, groups = 4): { word: string; tone: "good" | "fair" | "poor" } {
  if (groups < 4) return { word: "too few groups to judge yet", tone: "fair" }
  if (q >= 0.4) return { word: "strong structure", tone: "good" }
  if (q >= 0.25) return { word: "real structure", tone: "good" }
  if (q >= 0.1) return { word: "weak structure", tone: "fair" }
  return { word: "little better than arbitrary", tone: "poor" }
}

export interface MemberQuality {
  id: string
  /** Of the references it shares with grouped components, the share staying in its own group. */
  kept: number
  /** Weight exchanged with the rest of its group, and with everything placed. */
  inside: number
  degree: number
  /** The other group it exchanges most with, if any. */
  leans: { name: string; weight: number } | null
  /** It exchanges more with `leans` than with the group it is in. */
  pullsAway: boolean
}

/**
 * The same measure as `GroupQuality.kept`, asked of one component at a time.
 *
 * A group's standing is an average, and an average hides the thing worth
 * acting on: which members hold it together and which are only filed here.
 * Defined identically to the group number — references to components nobody
 * has placed are not part of the partition either way — so a row and the
 * sentence above it can never disagree.
 */
export function measureMembers(
  key: string,
  groups: Array<{ key: string; name: string; members: string[] }>,
  edges: QualityEdge[],
): MemberQuality[] {
  const group = groups.find(g => g.key === key)
  if (!group) return []

  const groupOf = new Map<string, string>()
  const nameOf = new Map<string, string>()
  for (const g of groups) {
    nameOf.set(g.key, g.name)
    for (const m of g.members) groupOf.set(m, g.key)
  }

  const inside = new Map<string, number>()
  const degree = new Map<string, number>()
  const toward = new Map<string, Map<string, number>>()

  const count = (id: string, otherGroup: string, w: number) => {
    degree.set(id, (degree.get(id) ?? 0) + w)
    if (otherGroup === key) {
      inside.set(id, (inside.get(id) ?? 0) + w)
      return
    }
    const row = toward.get(id) ?? new Map<string, number>()
    row.set(otherGroup, (row.get(otherGroup) ?? 0) + w)
    toward.set(id, row)
  }

  for (const e of edges) {
    const w = e.weight ?? 1
    if (w <= 0 || e.from === e.to) continue
    const a = groupOf.get(e.from)
    const b = groupOf.get(e.to)
    if (!a || !b) continue
    if (a === key) count(e.from, b, w)
    if (b === key) count(e.to, a, w)
  }

  return group.members.map(id => {
    const i = inside.get(id) ?? 0
    const d = degree.get(id) ?? 0
    const best = Array.from(toward.get(id) ?? []).sort((x, y) => y[1] - x[1])[0]
    return {
      id,
      kept: d > 0 ? i / d : 0,
      inside: i,
      degree: d,
      leans: best ? { name: nameOf.get(best[0]) ?? best[0], weight: best[1] } : null,
      pullsAway: !!best && best[1] > i,
    }
  })
}
