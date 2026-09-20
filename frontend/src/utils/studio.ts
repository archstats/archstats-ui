// The engine behind building a dimension by sorting rather than partitioning.
// Everything here is pure: the studio hands it the affinity signals that the
// suggester already computes, and gets back the next question to ask, what
// each answer is worth, and which components a group should pull in next.

import { SIGNALS, type Cut, type SignalId, type SuggestInput, type Unit } from "~/utils/suggest"

/** How much each signal counts when the studio measures one thing against another. */
export const STUDIO_WEIGHTS: Partial<Record<SignalId, number>> = {
  references: 1,
  cochange: 1,
  entities: 1,
  path: 1,
  names: 0.6,
  cycles: 0.5,
  authors: 0.5,
}

const REASON: Record<SignalId, string> = {
  references: "references between them",
  cochange: "changed in the same commits",
  entities: "share domain types",
  names: "share a name",
  path: "same package tree",
  lanes: "same lane",
  depth: "same depth",
  cycles: "in a cycle together",
  authors: "same authors",
}

/** The two piles that keep a sort moving, addressed like groups. */
export const LATER_PILE = "__later__"
export const OUT_PILE = "__out__"

export interface Tie { weight: number; signal: SignalId | null }
export type AffinityIndex = Map<string, Map<string, Tie>>

/** Pair weights as a lookup, so set-against-set questions are cheap. */
export function affinityIndex(input: SuggestInput, weights: Partial<Record<SignalId, number>> = STUDIO_WEIGHTS): AffinityIndex {
  const index: AffinityIndex = new Map()
  const link = (a: string, b: string, tie: Tie) => {
    const row = index.get(a) ?? new Map<string, Tie>()
    row.set(b, tie)
    index.set(a, row)
  }
  for (const p of input.pairs) {
    let weight = 0
    let signal: SignalId | null = null
    let best = 0
    for (const s of SIGNALS) {
      const v = p.v[s.id]
      if (!v) continue
      const w = (weights[s.id] ?? 0) * v
      weight += w
      if (w > best) { best = w; signal = s.id }
    }
    if (weight <= 0) continue
    const tie = { weight, signal }
    link(p.a, p.b, tie)
    link(p.b, p.a, tie)
  }
  return index
}

/** How strongly one unit pulls towards a set of them, and why. */
export function affinityTo(id: string, members: Iterable<string>, index: AffinityIndex): Tie {
  const row = index.get(id)
  if (!row) return { weight: 0, signal: null }
  let weight = 0
  let signal: SignalId | null = null
  let best = 0
  for (const m of members) {
    const tie = row.get(m)
    if (!tie) continue
    weight += tie.weight
    if (tie.weight > best) { best = tie.weight; signal = tie.signal }
  }
  return { weight, signal }
}

export function reasonFor(signal: SignalId | null): string {
  return signal ? REASON[signal] : "loosely related"
}

// ── Path style: the delimiter this codebase actually uses ────────────────

/**
 * Every language spells "one level down" differently: a dot in Java and
 * Python, a backslash in PHP, a slash in a file tree, a double colon in Rust
 * and C++. The studio reads the delimiter off the names themselves rather
 * than assuming one, so packages, prefixes and the tree read natively.
 */
export interface PathStyle {
  sep: string
  split(id: string): string[]
  join(segments: string[]): string
  /** Is `id` at or under `path`? Compared level by level, never by text. */
  under(path: string, id: string): boolean
}

const SEPARATORS = ["::", "\\", "/", "."]

/** The delimiter that appears most across a set of names; a dot when none do. */
export function detectSeparator(ids: Iterable<string>): string {
  const seen = new Map<string, number>(SEPARATORS.map(s => [s, 0]))
  for (const id of ids) {
    for (const sep of SEPARATORS) {
      const n = id.split(sep).length - 1
      // A "::" also reads as two colons to nothing else, so only "." and "/"
      // ever compete on the same character, and they never co-occur.
      if (n) seen.set(sep, seen.get(sep)! + n)
    }
  }
  let best = "."
  let top = 0
  for (const sep of SEPARATORS) {
    const n = seen.get(sep)!
    if (n > top) { top = n; best = sep }
  }
  return best
}

export function pathStyle(ids: Iterable<string> = [], sep: string = detectSeparator(ids)): PathStyle {
  const split = (id: string) => id.split(sep).filter(Boolean)
  return {
    sep,
    split,
    join: (segments: string[]) => segments.join(sep),
    under(path: string, id: string) {
      if (!path) return true
      const head = split(path)
      const segs = split(id)
      if (segs.length < head.length) return false
      return head.every((s, i) => segs[i] === s)
    },
  }
}

/** What to assume before a codebase has been read: Java's dot. */
export const DOT_STYLE = pathStyle([], ".")

/** What to call a set of components: the deepest path they all share. */
export function commonName(ids: string[], style: PathStyle = DOT_STYLE): string {
  if (ids.length === 0) return "New group"
  if (ids.length === 1) return titleFromPrefix(ids[0], style)
  // Compare the whole names, not their parents: a branch taken with the node
  // it hangs from is still that branch, not the thing above it.
  const segs = ids.map(id => style.split(id))
  let shared = segs[0]
  for (const s of segs.slice(1)) {
    let i = 0
    while (i < shared.length && i < s.length && shared[i] === s[i]) i++
    shared = shared.slice(0, i)
  }
  return shared.length ? titleFromPrefix(style.join(shared), style) : titleFromPrefix(ids[0], style)
}

// ── Bundles: the unit of a decision ──────────────────────────────────────

export interface Bundle {
  key: string
  /** Stable across placements: what this bundle is grouped by. */
  groupKey: string
  members: string[]
  /** The path the members share, "org.acme.core.order" or "" when they share none. */
  prefix: string
  name: string
  reason: string
  lines: number
  /** The delimiter their names use, so callers can shorten and re-join. */
  sep: string
  /** How many levels deep the shared prefix runs. */
  depth: number
}

/**
 * What to call a group made from a query, asked of the query first.
 *
 * `commonName` answers with what the members share at the front, which is
 * right for a branch of the tree and wrong for everything else: keeping
 * `**.controller` on BroadleafCommerce produced a group of seven controllers
 * called "Broadleafcommerce". The query already says what the architect meant
 * by the set, so it gets asked before the members do.
 *
 * Only a single plain pattern is read — one line, no `where`, no exclusion.
 * Anything more is a set whose meaning is not in any one of its words, and
 * the members answer instead.
 */
export function nameForQuery(query: string, ids: string[], style: PathStyle = DOT_STYLE): string {
  const lines = query.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  const only = lines.length === 1 ? lines[0] : null
  if (only && !only.startsWith("!") && !/\swhere\s/i.test(only)) {
    // The last segment that names something, rather than standing for
    // anything: "**.controller" is about controllers, "com.acme.order.**"
    // about orders.
    const named = style.split(only).filter(seg => seg && !seg.includes("*")).pop()
    if (named) return titleFromPrefix(named, style)
  }
  return commonName(ids, style)
}

/** "org.acme.core.order" → "Order". A bare id keeps its last segment. */
export function titleFromPrefix(prefix: string, style: PathStyle = DOT_STYLE): string {
  const last = style.split(prefix).pop() ?? prefix
  const words = last.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Cuts the unplaced pool into bundles a person can answer in one go. Package
 * siblings come first because the reason is self-evident and the name comes
 * free; a sibling set too large to judge at a glance is cut a level deeper.
 */
export function bundleUnplaced(
  unplaced: Iterable<string>,
  linesOf: (id: string) => number = () => 0,
  max = 10,
  style: PathStyle = DOT_STYLE,
): Bundle[] {
  const ids = Array.from(unplaced)
  if (ids.length === 0) return []

  const byPrefix = new Map<string, string[]>()
  for (const id of ids) {
    const segs = style.split(id)
    const prefix = style.join(segs.slice(0, -1))
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), id])
  }

  const out: Bundle[] = []
  const push = (prefix: string, members: string[], depth: number) => {
    if (members.length > max) {
      // Too many to take on trust: cut them by the next segment down.
      const deeper = new Map<string, string[]>()
      for (const id of members) {
        const segs = style.split(id)
        const key = style.join(segs.slice(0, Math.min(depth + 1, segs.length - 1)))
        deeper.set(key, [...(deeper.get(key) ?? []), id])
      }
      // Only cut deeper if the cut yields groups rather than dust. A flat
      // package of forty siblings splits into forty questions of one, which is
      // worse than one question of forty: leave it whole and let Split ask.
      if (deeper.size > 1 && deeper.size <= Math.max(2, Math.ceil(members.length / 2))) {
        for (const [key, group] of deeper) push(key, group, depth + 1)
        return
      }
    }
    out.push(makeBundle(prefix, members, linesOf, style))
  }
  for (const [prefix, members] of byPrefix) push(prefix, members, style.split(prefix).length)

  // Cover ground first: a bundle worth several answers outranks a lone
  // component however large it is, and stragglers come at the end.
  const together = (b: Bundle) => (b.members.length > 1 ? 1 : 0)
  return out.sort((a, b) => together(b) - together(a) || b.lines - a.lines || b.members.length - a.members.length || a.name.localeCompare(b.name))
}

function makeBundle(prefix: string, members: string[], linesOf: (id: string) => number, style: PathStyle): Bundle {
  const sorted = members.slice().sort()
  // A lone component is named after itself; a set is named after what they share.
  const namedAfter = members.length === 1 || !prefix ? sorted[0] : prefix
  return {
    key: prefix + "#" + members.length + "#" + sorted[0],
    groupKey: prefix,
    members: sorted,
    prefix,
    name: titleFromPrefix(namedAfter, style),
    reason: members.length === 1 ? "on its own" : prefix ? `all under ${prefix}` : "no shared path",
    lines: sorted.reduce((s, id) => s + linesOf(id), 0),
    sep: style.sep,
    depth: prefix ? style.split(prefix).length : 0,
  }
}

/**
 * One question becomes several: the bundle cut by its next level down, so a
 * package you do not want to answer whole can be answered a branch at a
 * time. Members that stop at the shared prefix stand alone.
 */
export function splitBundle(bundle: Bundle, linesOf: (id: string) => number = () => 0, style: PathStyle = DOT_STYLE): Bundle[] {
  if (bundle.members.length < 2) return []
  let depth = bundle.depth
  const deepest = Math.max(...bundle.members.map(id => style.split(id).length))
  while (depth < deepest) {
    const byKey = new Map<string, string[]>()
    for (const id of bundle.members) {
      const segs = style.split(id)
      const key = style.join(segs.slice(0, Math.min(depth + 1, segs.length - 1)))
      byKey.set(key, [...(byKey.get(key) ?? []), id])
    }
    // Keep descending while everything still lands in the same branch: a
    // split that returns the question unchanged is not an answer.
    if (byKey.size > 1) {
      return Array.from(byKey, ([prefix, members]) => makeBundle(prefix, members, linesOf, style))
        .sort((a, b) => b.members.length - a.members.length || b.lines - a.lines || a.name.localeCompare(b.name))
    }
    depth++
  }
  return bundle.members.map(id => makeBundle(style.join(style.split(id).slice(0, -1)), [id], linesOf, style))
}

// ── What a bundle is closest to, and what a group should take next ────────

export interface GroupRef { key: string; name: string; members: string[] }

export interface GroupGuess { group: GroupRef; tie: Tie; score: number }

/** Every group this could belong to, best first, so the runners-up stay visible. */
export function rankGroups(members: string[], groups: GroupRef[], index: AffinityIndex): GroupGuess[] {
  const out: GroupGuess[] = []
  for (const group of groups) {
    if (group.members.length === 0) continue
    let weight = 0
    let signal: SignalId | null = null
    let top = 0
    for (const id of members) {
      const tie = affinityTo(id, group.members, index)
      weight += tie.weight
      if (tie.weight > top) { top = tie.weight; signal = tie.signal }
    }
    if (weight <= 0) continue
    // Weight alone would hand everything to the biggest group, because a
    // large one simply has more edges to sum. Judge by density instead.
    out.push({ group, tie: { weight, signal }, score: weight / Math.sqrt(group.members.length) })
  }
  return out.sort((a, b) => b.score - a.score || a.group.name.localeCompare(b.group.name))
}

export function closestGroup(members: string[], groups: GroupRef[], index: AffinityIndex): { group: GroupRef; tie: Tie } | null {
  const best = rankGroups(members, groups, index)[0]
  return best ? { group: best.group, tie: best.tie } : null
}

export interface Candidate { id: string; weight: number; signal: SignalId | null }

/** What a group should pull in next, strongest first, minus anything refused. */
export function rankCandidates(
  members: Iterable<string>,
  pool: Iterable<string>,
  index: AffinityIndex,
  refused: ReadonlySet<string> = new Set(),
  limit = 12,
): Candidate[] {
  const inside = new Set(members)
  const out: Candidate[] = []
  for (const id of pool) {
    if (inside.has(id) || refused.has(id)) continue
    const tie = affinityTo(id, inside, index)
    if (tie.weight <= 0) continue
    out.push({ id, weight: tie.weight, signal: tie.signal })
  }
  return out.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, limit)
}

// ── The package tree, for taking what you already know in one act ─────────

export interface TreeNode {
  path: string
  label: string
  /** Components at or under this path that are still unplaced. */
  count: number
  lines: number
  children: TreeNode[]
}

/** The unplaced pool as a path tree, collapsing runs with a single child. */
export function packageTree(unplaced: Iterable<string>, linesOf: (id: string) => number = () => 0, style: PathStyle = DOT_STYLE): TreeNode[] {
  interface Raw { path: string; label: string; count: number; lines: number; children: Map<string, Raw> }
  const root: Raw = { path: "", label: "", count: 0, lines: 0, children: new Map() }
  for (const id of Array.from(unplaced)) {
    const segs = style.split(id)
    let node = root
    let path = ""
    for (const seg of segs) {
      path = path ? path + style.sep + seg : seg
      const next = node.children.get(seg) ?? { path, label: seg, count: 0, lines: 0, children: new Map() }
      node.children.set(seg, next)
      node = next
      node.count++
      node.lines += linesOf(id)
    }
    root.count++
  }
  const collapse = (node: Raw): TreeNode => {
    let current = node
    let label = node.label
    // A chain with one child each is one step to a person: com.acme.core.
    while (current.children.size === 1) {
      const only = Array.from(current.children.values())[0]
      if (only.count !== current.count) break
      label = label ? label + style.sep + only.label : only.label
      current = only
    }
    return {
      path: current.path,
      label,
      count: current.count,
      lines: current.lines,
      children: Array.from(current.children.values()).map(collapse).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }
  }
  return Array.from(root.children.values()).map(collapse).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Every unplaced component at or under a path. */
export function underPath(path: string, pool: Iterable<string>, style: PathStyle = DOT_STYLE): string[] {
  return Array.from(pool).filter(id => id === path || style.under(path, id)).sort()
}

// ── Ways of cutting ──────────────────────────────────────────────────────
// A dimension is not always a domain. The same codebase cuts by what a thing
// does, who looks after it, or what moves with it, and each of those asks a
// different question, means a different thing by "close", and bundles the
// pool a different way. The way is chosen once and the three modes follow it.

export type WayId = "domain" | "layer" | "owner" | "change" | "free"

/**
 * What a dimension is made of. Most dimensions are made of whole components:
 * a package belongs to one domain, one team, one release train, and dividing
 * it would be a lie about the codebase. A few are not — a layer cuts straight
 * through packages, because one package routinely holds a controller and the
 * repository it calls, and those are two layers by definition.
 *
 * So this is not a preference and not a feature flag. It is a property of the
 * question being asked: it follows the way, and while it says "component" the
 * studio cannot divide anything, because the guard is in the store rather
 * than in the buttons.
 */
export type Grain = "component" | "file"

export interface Way {
  id: WayId
  label: string
  /** What this way asks about every component. */
  question: string
  hint: string
  /** What "close" means here; a negative weight pushes apart. */
  weights: Partial<Record<SignalId, number>>
  /**
   * How much structural equivalence counts: whether two components are used
   * by the same things rather than using each other. A layer is made of it;
   * a domain is broken by it.
   */
  structure: number
  /** The preset a first pass should run. */
  preset: string
  cut: Cut
  /**
   * What this way is normally made of. Only a layer asks a question one
   * package can answer two ways at once, so only a layer starts out allowed
   * to divide one.
   */
  grain: Grain
  /** The name to offer the dimension when this way is picked. */
  dimension: string
}

/**
 * Said in the architect's words rather than the model's, in both places. Both
 * labels are noun phrases because the control reads "Made of ___", and a mode
 * name that cannot finish the sentence it sits in is a mode name that will be
 * misread: "Made of files may split" was the first draft of this.
 */
export const GRAIN: Record<Grain, { label: string; hint: string; consequence: string; icon: string }> = {
  component: {
    label: "Whole components",
    hint: "A component belongs to one group, all of it.",
    consequence: "Nothing can be divided. Counts are plain, and every component has one home.",
    icon: "component",
  },
  file: {
    label: "Components and parts",
    hint: "A component can be divided between two groups, by its files.",
    consequence: "A divided component is drawn as the groups holding it, and never counted as if it had one home.",
    icon: "git-branch",
  },
}

export const WAYS: Way[] = [
  {
    id: "domain", label: "Domain", question: "What part of the business is this?",
    hint: "Orders with orders, catalog with catalog. Cuts down through the layers.",
    weights: { references: 1, cochange: 1, entities: 1, path: 1, names: 0.6, cycles: 0.5, authors: 0.5 },
    structure: 0,
    preset: "domains", cut: "vertical", grain: "component", dimension: "Domain",
  },
  {
    id: "layer", label: "Layer", question: "What job does this do?",
    hint: "Controllers with controllers, repositories with repositories. Cuts across the domains.",
    weights: { lanes: 2, depth: 1.5, names: 1.2, entities: 0.3, path: 0.2, references: -0.5 },
    structure: 2,
    preset: "layers", cut: "horizontal", grain: "file", dimension: "Layer",
  },
  {
    id: "owner", label: "Ownership", question: "Whose is this?",
    hint: "The same hands, in the commit history. Shows who carries what.",
    weights: { authors: 2, cochange: 1.2, path: 0.4, references: 0.2 },
    structure: 0,
    preset: "ownership", cut: "vertical", grain: "component", dimension: "Team",
  },
  {
    id: "change", label: "Change", question: "What moves with this?",
    hint: "Things edited in the same commits, whatever they are called or where they live.",
    weights: { cochange: 2, cycles: 1, references: 0.8, path: 0.3 },
    structure: 0,
    preset: "modules", cut: "free", grain: "component", dimension: "Change",
  },
  {
    id: "free", label: "Free", question: "Where does this belong?",
    hint: "Every signal counts a little. Use it when the cut is your own idea.",
    weights: STUDIO_WEIGHTS,
    structure: 0.5,
    preset: "custom", cut: "free", grain: "component", dimension: "Dimension",
  },
]

export function wayById(id: string): Way {
  return WAYS.find(w => w.id === id) ?? WAYS[0]
}

/** What a way will actually have to go on, in this snapshot. */
export interface Fitness { ok: boolean; basis: string; why: string }

export const LAYER_WHY: Record<string, string> = {
  lanes: "by the framework role each one plays",
  names: "by the word they share in their names",
  depth: "by how far they sit from the entry points",
}

export function fitnessOf(way: Way, units: Map<string, Unit>, hasCochange: boolean, ctx?: BundleContext): Fitness {
  const any = (f: (u: Unit) => unknown) => { for (const u of units.values()) if (f(u)) return true; return false }
  switch (way.id) {
    case "layer": {
      const keying = ctx ? bestLayerKeying(Array.from(units.keys()), ctx) : null
      if (keying) return { ok: true, basis: keying.basis, why: LAYER_WHY[keying.basis] }
      if (!ctx && (any(u => u.lane) || any(u => u.tokens.length) || any(u => u.depth !== null))) {
        return { ok: true, basis: "unknown", why: "by what each one is for" }
      }
      return { ok: false, basis: "none", why: "Nothing here divides these by the job they do." }
    }
    case "free":
      return { ok: true, basis: "blend", why: "by every signal at once, with none of them leading" }
    case "owner":
      return any(u => u.authors.length)
        ? { ok: true, basis: "authors", why: "by the hands in the commit history" }
        : { ok: false, basis: "none", why: "This snapshot carries no git history." }
    case "change":
      return hasCochange
        ? { ok: true, basis: "cochange", why: "by what is edited in the same commits" }
        : { ok: false, basis: "none", why: "This snapshot carries no commit history." }
    default:
      return { ok: true, basis: "path", why: "by the package tree and what references what" }
  }
}

export interface BundleContext {
  units: Map<string, Unit>
  laneLabels: Record<string, string>
  index: AffinityIndex
  linesOf: (id: string) => number
  style: PathStyle
}

/** The pool cut into questions the way this dimension is being cut. */
export function bundleFor(way: Way, pool: Iterable<string>, ctx: BundleContext): Bundle[] {
  const ids = Array.from(pool)
  if (ids.length === 0) return []
  switch (way.id) {
    case "layer": {
      const keying = bestLayerKeying(ids, ctx)
      return keying ? keyed(ids, keying.keys, keying.describe, ctx) : bundleUnplaced(ids, ctx.linesOf, 10, ctx.style)
    }
    case "owner":
      return keyed(ids, id => hands(ctx.units.get(id)), (k, m) => ({ name: k, reason: m.length === 1 ? `touched by ${k}` : `all touched by ${k}` }), ctx)
    case "change":
      return keyed(ids, tieClusters(ids, ctx.index), (_, m) => ({ name: commonName(m, ctx.style), reason: m.length === 1 ? "moves on its own" : "they move in the same commits" }), ctx)
    default: {
      // A bundle that survives the path cut is one the path could not divide:
      // a flat namespace of forty siblings. Neither forty questions of one nor
      // one question of forty is answerable, so let the ties divide it.
      return bundleUnplaced(ids, ctx.linesOf, 10, ctx.style).flatMap(b => {
        if (b.members.length <= 12) return [b]
        const clusters = keyed(
          b.members,
          tieClusters(b.members, ctx.index),
          (_, m) => ({ name: commonName(m, ctx.style), reason: m.length === 1 ? "nothing else leans its way" : "they lean on each other" }),
          ctx,
        )
        return clusters.length > 1 ? clusters : [b]
      })
    }
  }
}

interface LayerKeying {
  basis: "lanes" | "names" | "depth"
  keys: Map<string, string>
  describe: (key: string, members: string[]) => { name: string; reason: string }
}

function layerKeyings(ids: string[], ctx: BundleContext): LayerKeying[] {
  const out: LayerKeying[] = []
  const label = (lane: string) => ctx.laneLabels[lane] ?? titleFromPrefix(lane, ctx.style)

  const lanes = new Map<string, string>()
  for (const id of ids) { const l = ctx.units.get(id)?.lane; if (l) lanes.set(id, l) }
  if (lanes.size) out.push({ basis: "lanes", keys: lanes, describe: (k, m) => ({ name: label(k), reason: m.length === 1 ? `plays the ${label(k)} role` : `all play the ${label(k)} role` }) })

  const roles = roleTokens(ids, ctx)
  if (roles.size) out.push({ basis: "names", keys: roles, describe: (k, m) => ({ name: titleFromPrefix(k, ctx.style), reason: m.length === 1 ? `named for ${k}` : `all named for ${k}` }) })

  const depths = new Map<string, string>()
  for (const id of ids) { const d = ctx.units.get(id)?.depth; if (d !== null && d !== undefined) depths.set(id, String(d)) }
  if (depths.size) out.push({ basis: "depth", keys: depths, describe: k => ({ name: k === "0" ? "Entry points" : `${k} hops in`, reason: k === "0" ? "nothing calls in to them" : `all ${k} hops from an entry point` }) })

  return out
}

/**
 * Groups people can name beat groups they can only number: "Controller" is a
 * layer, "6 hops in" is a measurement. Depth has to divide distinctly better
 * before it wins.
 */
const LEGIBILITY: Record<LayerKeying["basis"], number> = { lanes: 1, names: 0.95, depth: 0.7 }

/**
 * A basis that drops nearly everything into one bucket has said nothing. On a
 * codebase whose framework roles are mostly "other", the word in the name is
 * the better cut, so each basis is judged by how evenly it divides the pool,
 * how much of it it can speak for, and whether its groups have real names.
 */
export function bestLayerKeying(ids: string[], ctx: BundleContext): LayerKeying | null {
  let best: { keying: LayerKeying; score: number } | null = null
  for (const keying of layerKeyings(ids, ctx)) {
    const counts = new Map<string, number>()
    for (const key of keying.keys.values()) counts.set(key, (counts.get(key) ?? 0) + 1)
    if (counts.size < 2) continue
    const covered = keying.keys.size
    const largest = Math.max(...counts.values())
    const score = (1 - largest / Math.max(1, covered)) * (covered / Math.max(1, ids.length)) * LEGIBILITY[keying.basis]
    if (score <= 0) continue
    if (!best || score > best.score) best = { keying, score }
  }
  return best?.keying ?? null
}

/** Group a pool by a key, and let the package tree speak for whatever is left. */
function keyed(
  pool: string[],
  keyOf: ((id: string) => string | null) | Map<string, string>,
  describe: (key: string, members: string[]) => { name: string; reason: string },
  ctx: BundleContext,
): Bundle[] {
  const of = typeof keyOf === "function" ? keyOf : (id: string) => keyOf.get(id) ?? null
  const byKey = new Map<string, string[]>()
  const rest: string[] = []
  for (const id of pool) {
    const key = of(id)
    if (key === null) rest.push(id)
    else byKey.set(key, [...(byKey.get(key) ?? []), id])
  }
  const out: Bundle[] = []
  for (const [key, members] of byKey) {
    const sorted = members.slice().sort()
    const { name, reason } = describe(key, sorted)
    out.push({
      key: key + "#" + sorted.length + "#" + sorted[0],
      groupKey: key,
      members: sorted,
      prefix: "",
      name,
      reason,
      lines: sorted.reduce((s, id) => s + ctx.linesOf(id), 0),
      sep: ctx.style.sep,
      depth: 0,
    })
  }
  const together = (b: Bundle) => (b.members.length > 1 ? 1 : 0)
  out.sort((a, b) => together(b) - together(a) || b.lines - a.lines || b.members.length - a.members.length || a.name.localeCompare(b.name))
  // Whatever the way cannot speak for still has a package to fall back on.
  return [...out, ...bundleUnplaced(rest, ctx.linesOf, 10, ctx.style)]
}

/**
 * The word that marks a role rather than a subject. A domain word lives in
 * one package; a role word turns up in many, so spread is what tells them
 * apart without anyone having to name the layers first.
 */
function roleTokens(pool: string[], ctx: BundleContext): Map<string, string> {
  const spread = new Map<string, Set<string>>()
  const uses = new Map<string, number>()
  for (const id of pool) {
    const u = ctx.units.get(id)
    if (!u) continue
    const parent = ctx.style.join(ctx.style.split(id).slice(0, -1))
    for (const t of new Set(u.tokens)) {
      const seen = spread.get(t) ?? new Set<string>()
      seen.add(parent)
      spread.set(t, seen)
      uses.set(t, (uses.get(t) ?? 0) + 1)
    }
  }
  // Spread alone would crown the root package, which reaches everything and
  // says nothing. Weight it by how rare the word is, and a word on every
  // component scores nothing at all.
  const n = Math.max(1, pool.length)
  const score = (t: string) => (spread.get(t)?.size ?? 0) * Math.log(n / Math.max(1, uses.get(t) ?? 1))
  const out = new Map<string, string>()
  for (const id of pool) {
    const u = ctx.units.get(id)
    if (!u) continue
    let best: string | null = null
    for (const t of u.tokens) {
      if ((uses.get(t) ?? 0) < 2 || (spread.get(t)?.size ?? 0) < 2 || score(t) <= 0) continue
      if (!best || score(t) > score(best) || (score(t) === score(best) && t < best)) best = t
    }
    if (best) out.set(id, best)
  }
  return out
}

/** Who has hands on it: a pair or a person, never a crowd. */
function hands(unit: Unit | undefined): string | null {
  if (!unit || unit.authors.length === 0) return null
  const sorted = unit.authors.slice().sort()
  return sorted.length <= 2 ? sorted.join(" & ") : sorted[0] + " and " + (sorted.length - 1) + " others"
}

const CLUSTER_MAX = 12

/**
 * Clusters by strongest tie under the current weights: each thing joins what
 * it leans on most, and a cluster stops growing once it is too big to be one
 * question. Under the Change weights these are the things that move together.
 */
function tieClusters(pool: string[], index: AffinityIndex): Map<string, string> {
  const inside = new Set(pool)
  const root = new Map<string, string>(pool.map(id => [id, id]))
  const size = new Map<string, number>(pool.map(id => [id, 1]))
  const find = (id: string): string => {
    let r = id
    while (root.get(r) !== r) r = root.get(r)!
    while (root.get(id) !== r) { const next = root.get(id)!; root.set(id, r); id = next }
    return r
  }
  for (const id of pool.slice().sort()) {
    const row = index.get(id)
    if (!row) continue
    let partner: string | null = null
    let top = 0
    for (const [other, tie] of row) {
      if (!inside.has(other) || other === id) continue
      if (tie.weight > top || (tie.weight === top && partner !== null && other < partner)) { top = tie.weight; partner = other }
    }
    if (!partner || top <= 0) continue
    const a = find(id)
    const b = find(partner)
    if (a === b) continue
    const merged = size.get(a)! + size.get(b)!
    if (merged > CLUSTER_MAX) continue
    root.set(a, b)
    size.set(b, merged)
  }
  const out = new Map<string, string>()
  for (const id of pool) out.set(id, find(id))
  return out
}
