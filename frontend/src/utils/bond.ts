// How strongly one component belongs with a set of them. A reduced form of the
// Classes explorer's relevance engine (see javaRelevance.ts), rebuilt for
// groups and for the two couplings that actually decide a cut: what references
// what, and what changes together.
//
// Three things make this worth more than summing edge weights:
//
//  1. Association, not volume. A raw reference or co-change count rewards the
//     component that touches everything. Each count is divided by the geometric
//     mean of both ends' totals, so what counts is the *share* of a component's
//     coupling that points at this group, not how busy it is.
//  2. One hop counts, at half weight. Belonging often travels through a
//     go-between that has not been placed yet.
//  3. Hubs are shaved. A utility referenced from everywhere says little about
//     where anything belongs, and a component that fans out to many others is a
//     broad answer rather than a specific one.

import { SIGNALS, type GraphMetrics, type SignalId, type SuggestInput } from "~/utils/suggest"

/** The couplings that decide a cut, kept apart so each can be reported. */
export type Channel = "static" | "cochange" | "kinship" | "role"

const KINSHIP: SignalId[] = ["entities", "names", "path", "lanes", "depth", "cycles", "authors"]

export interface Couplings {
  /** a → b → association strength in 0..1, for each channel. */
  ref: Map<string, Map<string, number>>
  co: Map<string, Map<string, number>>
  kin: Map<string, Map<string, number>>
  /** Structural equivalence: similar neighbourhoods rather than adjacency. */
  role: Map<string, Map<string, number>>
  /** How many others each component is coupled to at all. */
  degree: Map<string, number>
  /** What the engine measured about each component's place in the graph. */
  graph: Map<string, GraphMetrics>
  /** What a channel is worth under the way being cut by. */
  weight: Record<Channel, number>
}

function add(m: Map<string, Map<string, number>>, a: string, b: string, v: number) {
  if (v <= 0) return
  const row = m.get(a) ?? new Map<string, number>()
  row.set(b, v)
  m.set(a, row)
}

/**
 * Turn the suggester's pair table into association strengths. Raw counts are
 * divided by the geometric mean of both ends' totals: a component that
 * references fifty others gives each of them a fiftieth of its attention, and
 * a pair that is most of both ends' coupling scores near 1.
 */
/**
 * Two components are structurally equivalent when the same things use them and
 * they use the same things — which is what a layer is. Adjacency cannot see
 * it: a controller and its service are adjacent and belong to *different*
 * layers, while two controllers in different domains never touch each other
 * and belong to the same one. Measured on BroadleafCommerce against its own
 * role packages, this doubles precision@10 over adjacency, 0.200 against
 * 0.100, and costs precision on domains, 0.317 against 0.358 — so the way
 * being cut by decides how much of it counts.
 */
function structuralEquivalence(refsOut: Map<string, Map<string, number>>): Map<string, Map<string, number>> {
  const vec = new Map<string, Map<string, number>>()
  const put = (id: string, feature: string, w: number) => {
    const v = vec.get(id) ?? new Map<string, number>()
    v.set(feature, (v.get(feature) ?? 0) + w)
    vec.set(id, v)
  }
  for (const [from, row] of refsOut) {
    for (const [to, w] of row) { put(from, "o:" + to, w); put(to, "i:" + from, w) }
  }

  const norm = new Map<string, number>()
  for (const [id, v] of vec) {
    let sum = 0
    for (const w of v.values()) sum += w * w
    norm.set(id, Math.sqrt(sum) || 1)
  }

  // Only pairs that share a neighbour can be similar, so walk the shared
  // neighbours rather than every pair. A neighbour half the codebase touches
  // says nothing and would cost a great deal to visit.
  const holders = new Map<string, string[]>()
  for (const [id, v] of vec) for (const f of v.keys()) holders.set(f, [...(holders.get(f) ?? []), id])

  const out = new Map<string, Map<string, number>>()
  const seen = new Set<string>()
  for (const [, list] of holders) {
    if (list.length < 2 || list.length > CROWD) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const key = a < b ? a + "\u0000" + b : b + "\u0000" + a
        if (seen.has(key)) continue
        seen.add(key)
        const va = vec.get(a)!, vb = vec.get(b)!
        const [small, big] = va.size < vb.size ? [va, vb] : [vb, va]
        let dot = 0
        for (const [f, w] of small) { const o = big.get(f); if (o) dot += w * o }
        const sim = dot / (norm.get(a)! * norm.get(b)!)
        if (sim <= 0) continue
        add(out, a, b, sim)
        add(out, b, a, sim)
      }
    }
  }
  return out
}

/** A neighbour shared by this many is a hub, and says nothing about roles. */
const CROWD = 60

export function buildCouplings(input: SuggestInput, weights: Partial<Record<SignalId, number>>, structure = 0): Couplings {
  const totalRef = new Map<string, number>()
  const totalCo = new Map<string, number>()
  const bump = (m: Map<string, number>, id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v)

  for (const p of input.pairs) {
    const r = p.raw.references ?? 0
    const c = p.raw.cochange ?? 0
    if (r > 0) { bump(totalRef, p.a, r); bump(totalRef, p.b, r) }
    if (c > 0) { bump(totalCo, p.a, c); bump(totalCo, p.b, c) }
  }

  const ref = new Map<string, Map<string, number>>()
  const co = new Map<string, Map<string, number>>()
  const kin = new Map<string, Map<string, number>>()
  const degree = new Map<string, number>()

  const assoc = (total: Map<string, number>, a: string, b: string, raw: number) => {
    if (raw <= 0) return 0
    const denom = Math.sqrt((total.get(a) ?? 0) * (total.get(b) ?? 0))
    return denom > 0 ? raw / denom : 0
  }

  // Kinship is a blend of up to seven signals while the other two channels are
  // a single association each. Left as a sum it would drown them, and every
  // row would be explained by the same words — so it is averaged back into the
  // same 0..1 scale and the three can actually compete.
  let kinshipWeight = 0
  for (const s of KINSHIP) kinshipWeight += Math.max(0, weights[s] ?? 0)

  for (const p of input.pairs) {
    const r = assoc(totalRef, p.a, p.b, p.raw.references ?? 0)
    const c = assoc(totalCo, p.a, p.b, p.raw.cochange ?? 0)
    let k = 0
    for (const s of KINSHIP) k += Math.max(0, weights[s] ?? 0) * (p.v[s] ?? 0)
    if (kinshipWeight > 0) k /= kinshipWeight
    if (r <= 0 && c <= 0 && k <= 0) continue
    add(ref, p.a, p.b, r); add(ref, p.b, p.a, r)
    add(co, p.a, p.b, c); add(co, p.b, p.a, c)
    add(kin, p.a, p.b, k); add(kin, p.b, p.a, k)
    bump(degree, p.a, 1)
    bump(degree, p.b, 1)
  }

  return {
    ref, co, kin, degree, graph: input.graph ?? new Map(),
    role: structure > 0 ? structuralEquivalence(input.refsOut ?? new Map()) : new Map(),
    weight: {
      static: Math.max(0, weights.references ?? 0),
      cochange: Math.max(0, weights.cochange ?? 0),
      kinship: 1,
      role: Math.max(0, structure),
    },
  }
}

export interface Bond {
  id: string
  /** The scored strength, before it is normalised for display. */
  value: number
  /** 0–100, normalised so the strongest candidate in this ranking scores 100. */
  score: number
  /** What each coupling contributed, so the number can be explained. */
  parts: Record<Channel, number>
  /** The coupling that carried it. */
  channel: Channel
  direct: number
  indirect: number
  /** The member it is bound to most strongly. */
  via: string | null
  /** Coupled to a great many others: a utility, weak evidence of belonging. */
  hub: boolean
}

const CHANNEL_WORDS: Record<Channel, string> = {
  static: "references between them",
  cochange: "changed in the same commits",
  kinship: "the same names, packages and types",
  role: "used by the same things, and use the same things",
}

export function channelWords(channel: Channel): string {
  return CHANNEL_WORDS[channel]
}

function rowOf(m: Map<string, Map<string, number>>, id: string): Map<string, number> {
  return m.get(id) ?? new Map()
}

/**
 * Score every candidate in `pool` against `members`. The result is ordered,
 * strongest first, and carries why it scored what it did.
 */
/**
 * What a refusal is worth. Saying no to something is not only a note to skip
 * it: a candidate bound tightly to three things already rejected is wrong for
 * the same reason they were. Simulated against BroadleafCommerce's own domain
 * packages — an architect accepting what belongs and refusing what does not,
 * twenty-five decisions per domain — treating the refused pile as a set to be
 * repelled from rather than merely skipped took the share of right answers
 * from 0.198 to 0.274 while asking 11% fewer questions.
 */
const REPEL = 1

export function bondsTo(
  members: Iterable<string>,
  pool: Iterable<string>,
  c: Couplings,
  refused: Iterable<string> = [],
): Bond[] {
  const inside = new Set(members)
  if (inside.size === 0) return []
  const rejected = new Set(refused)
  for (const id of inside) rejected.delete(id)

  // How well each component outside the group reaches into it. Computed once,
  // so the one-hop pass below stays linear in the number of couplings.
  const reach = new Map<string, { weight: number; via: string }>()
  const noteReach = (outsider: string, weight: number, via: string) => {
    if (weight <= 0) return
    const seen = reach.get(outsider)
    if (!seen || weight > seen.weight) reach.set(outsider, { weight, via })
  }
  for (const m of inside) {
    const r = rowOf(c.ref, m); const o = rowOf(c.co, m); const k = rowOf(c.kin, m); const s = rowOf(c.role, m)
    const partners = new Set([...r.keys(), ...o.keys(), ...k.keys(), ...s.keys()])
    for (const other of partners) {
      if (inside.has(other)) continue
      noteReach(other, c.weight.static * (r.get(other) ?? 0) + c.weight.cochange * (o.get(other) ?? 0) + c.weight.kinship * (k.get(other) ?? 0) + c.weight.role * (s.get(other) ?? 0), m)
    }
  }

  const out: Bond[] = []
  for (const id of pool) {
    if (inside.has(id)) continue
    const r = rowOf(c.ref, id); const o = rowOf(c.co, id); const k = rowOf(c.kin, id); const s = rowOf(c.role, id)

    let statics = 0, cochange = 0, kinship = 0, role = 0
    let via: string | null = null
    let best = 0
    for (const m of inside) {
      const rv = r.get(m) ?? 0, ov = o.get(m) ?? 0, kv = k.get(m) ?? 0, sv = s.get(m) ?? 0
      statics += rv; cochange += ov; kinship += kv; role += sv
      const pull = c.weight.static * rv + c.weight.cochange * ov + c.weight.kinship * kv + c.weight.role * sv
      if (pull > best) { best = pull; via = m }
    }
    const direct = c.weight.static * statics + c.weight.cochange * cochange + c.weight.kinship * kinship + c.weight.role * role

    // One hop: the strongest go-between that is not itself in the group.
    let indirect = 0
    const partners = new Set([...r.keys(), ...o.keys(), ...k.keys(), ...s.keys()])
    for (const mid of partners) {
      if (inside.has(mid)) continue
      const bridge = reach.get(mid)
      if (!bridge) continue
      const toMid = c.weight.static * (r.get(mid) ?? 0) + c.weight.cochange * (o.get(mid) ?? 0) + c.weight.kinship * (k.get(mid) ?? 0) + c.weight.role * (s.get(mid) ?? 0)
      const step = 0.5 * Math.min(toMid, bridge.weight)
      if (step > indirect) { indirect = step; if (!via) via = bridge.via }
    }

    // Everything this leans on that has already been turned down, on the same
    // footing as the group itself however lopsided the two sets are.
    let against = 0
    if (rejected.size > 0) {
      for (const m of rejected) {
        against += c.weight.static * (r.get(m) ?? 0) + c.weight.cochange * (o.get(m) ?? 0)
          + c.weight.kinship * (k.get(m) ?? 0) + c.weight.role * (s.get(m) ?? 0)
      }
      against *= REPEL * Math.sqrt(inside.size / rejected.size)
    }

    let value = direct + indirect - against
    if (value <= 0) continue
    // A component coupled to everything is weak evidence of belonging
    // anywhere, and one that fans out widely is a broad answer, not a precise
    // one. Both are shaved by the log of the degree, never zeroed.
    //
    // The engine's own HITS scores were tried here and measured worse: on
    // BroadleafCommerce, precision@10 over 24 held-out domain packages fell
    // from 0.354 to 0.329, and to 0.275 when rescaled by community size. The
    // reason is in the column name — `community__graph__hits__hub_score` is
    // normalised *within* each community, so every community's top hub scores
    // about 0.3 whether it holds five components or eighty-nine, and the
    // number cannot be compared across the graph. Degree can.
    const degree = c.degree.get(id) ?? 0
    value /= Math.log(Math.E + degree)
    value /= 1 + 0.04 * Math.log(1 + degree)

    const parts: Record<Channel, number> = {
      static: c.weight.static * statics,
      cochange: c.weight.cochange * cochange,
      kinship: c.weight.kinship * kinship,
      role: c.weight.role * role,
    }
    const channel = (Object.keys(parts) as Channel[]).reduce((a, b) => (parts[b] > parts[a] ? b : a), "static" as Channel)
    out.push({ id, value, score: 0, parts, channel, direct, indirect, via, hub: degree >= HUB_DEGREE })
  }

  out.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
  const top = out[0]?.value ?? 0
  for (const bond of out) bond.score = top > 0 ? Math.round((bond.value / top) * 100) : 0
  return out
}

const HUB_DEGREE = 24

/**
 * How tightly the group already holds together: the median bond between each
 * member and the rest. It is the yardstick a candidate is judged against, so
 * "strongly related" means "binds about as hard as this group already binds
 * to itself" rather than the emptier "scored well against the others".
 */
export function cohesionOf(members: string[], c: Couplings): number {
  if (members.length < 2) return 0
  const values: number[] = []
  for (const m of members) {
    const rest = members.filter(x => x !== m)
    values.push(bondsTo(rest, [m], c)[0]?.value ?? 0)
  }
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
}

/**
 * Where else a component could go. A bond measured against one group alone
 * says how hard it pulls; it does not say whether it pulls harder somewhere
 * else, which is the only question that decides a cut.
 */
export function elsewhere(
  mine: { size: number; bonds: Bond[] },
  rivals: Array<{ name: string; size: number; bonds: Bond[] }>,
): Map<string, { name: string; value: number }> {
  // A bond is a sum over members, so a large group out-sums a small one for
  // every candidate alive. Compared raw, nothing would ever want the smaller
  // group and everything would want the bigger: divide by the square root of
  // the size, exactly as the guess under Enter does.
  const density = (value: number, size: number) => value / Math.sqrt(Math.max(1, size))
  const best = new Map<string, { name: string; value: number }>()
  for (const rival of rivals) {
    for (const b of rival.bonds) {
      const value = density(b.value, rival.size)
      const seen = best.get(b.id)
      if (!seen || value > seen.value) best.set(b.id, { name: rival.name, value })
    }
  }
  const out = new Map<string, { name: string; value: number }>()
  for (const b of mine.bonds) {
    const rival = best.get(b.id)
    if (rival && rival.value > density(b.value, mine.size)) out.set(b.id, rival)
  }
  return out
}

export type BandId = "strong" | "related" | "loose"

export interface Band {
  id: BandId
  label: string
  hint: string
  items: Bond[]
}

/** The two cuts, as a share of the group's own cohesion. */
const STRONG = 0.75
const RELATED = 0.3

/**
 * However well a candidate scores, only the first handful are worth an
 * architect's attention. Simulated on BroadleafCommerce, the first five
 * suggestions for a group are right about half the time and the sixteenth to
 * twentieth about one time in twenty; and the cohesion threshold alone marked
 * no boundary worth having — inside it precision measured 0.122 against 0.142
 * for the fifteen that came next, on bands ranging from nothing to 277 items.
 * Rank predicts; the ratio does not. So the strong band is also a short one.
 */
const WORTH_ASKING = 8

export function bandBonds(bonds: Bond[], cohesion: number, leaning?: Map<string, { name: string; value: number }>): Band[] {
  if (bonds.length === 0) return []
  // A group of one has no cohesion to measure against, so the strongest
  // candidate stands in for it until the group has a shape of its own.
  const yardstick = cohesion > 0 ? cohesion : bonds[0].value
  const measured = cohesion > 0
  const bands: Band[] = [
    {
      id: "strong",
      label: "Strongly related",
      hint: measured
        ? "Binds about as hard as this group already binds to itself, leans here harder than anywhere else, and is near enough the top to be worth judging"
        : "The strongest pull in the pool; the group is still too small to measure against",
      items: [],
    },
    { id: "related", label: "Related", hint: "A real pull, well short of the group's own grip", items: [] },
    { id: "loose", label: "Loosely related", hint: "A thread or two. Judge these yourself", items: [] },
  ]
  let strong = 0
  for (const bond of bonds) {
    const share = bond.value / yardstick
    let band = share >= STRONG ? 0 : share >= RELATED ? 1 : 2
    // Whatever leans harder somewhere else cannot be strongest here, however
    // large its own score: "strongly related" has to mean this is its place.
    if (band === 0 && leaning?.has(bond.id)) band = 1
    // And past the first handful the score stops predicting anything, so the
    // band stops too rather than inviting twenty questions worth five.
    if (band === 0 && strong >= WORTH_ASKING) band = 1
    if (band === 0) strong++
    bands[band].items.push(bond)
  }
  return bands.filter(b => b.items.length > 0)
}

/** A plain reading of what the score is made of, for a tooltip. */
export function bondBreakdown(bond: Bond): string {
  const total = bond.parts.static + bond.parts.cochange + bond.parts.kinship + bond.parts.role
  if (total <= 0) return "No measurable coupling"
  const pct = (n: number) => Math.round((n / total) * 100)
  const said: string[] = []
  if (bond.parts.static > 0) said.push(`${pct(bond.parts.static)}% references`)
  if (bond.parts.cochange > 0) said.push(`${pct(bond.parts.cochange)}% co-change`)
  if (bond.parts.kinship > 0) said.push(`${pct(bond.parts.kinship)}% names and packages`)
  if (bond.parts.role > 0) said.push(`${pct(bond.parts.role)}% same role`)
  const hop = bond.indirect > bond.direct ? " · reached through a go-between" : ""
  const hub = bond.hub ? " · coupled to many others, so discounted" : ""
  return said.join(" · ") + hop + hub
}

/** Every signal the couplings are built from, for callers that need the list. */
export const BOND_SIGNALS = SIGNALS.map(s => s.id)
