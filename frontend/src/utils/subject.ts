// Reading a codebase for the subject each component is named for.
//
// Kept apart from both the studio and the suggester because both need it and
// neither may import the other, and kept free of their types for the same
// reason: a splitter and a weighted adjacency are all it takes, and
// `PathStyle` and `AffinityIndex` both already satisfy them.

/** Anything that can cut a name into segments and put it back together. */
export interface Segmenter {
  split(id: string): string[]
  join(segments: string[]): string
}

/** Weighted ties between components, whatever produced them. */
export type Ties = ReadonlyMap<string, ReadonlyMap<string, { weight: number }>>

/** What the reading needs to know about the codebase it is reading. */
export interface SubjectWorld {
  style: Segmenter
  /** Static references. */
  refs?: Ties
  /** Co-change, when the snapshot carries any. */
  moves?: Ties
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

/** A segmenter for these names, reading the delimiter off the names themselves. */
export function segmenterFor(ids: Iterable<string>): Segmenter {
  const sep = detectSeparator(ids)
  return { split: (id: string) => id.split(sep).filter(Boolean), join: (segments: string[]) => segments.join(sep) }
}

// ── Domain: the subject each component is named for ──────────────────────
//
// A codebase laid out layer-first has no prefix that means "catalog":
// `Nop.Services.Catalog`, `Nop.Core.Domain.Catalog` and
// `Nop.Web.Areas.Admin.Models.Catalog` share only `Nop`. Cutting such a
// codebase by the package tree returns its layers, and so does clustering it
// by coupling — measured across six platforms in five languages, community
// detection scored the best modularity of anything tried and the worst
// domain recovery, because in a layered codebase the strongest coupling is
// *within* a layer.
//
// What separates a subject from a role is where the word sits. A role fills
// a fixed slot in the convention — `*.Controllers` is always last — while a
// subject floats: third segment in one layer, sixth in another. How far a
// word moves was the only signal pointing the same way in every codebase
// measured. Coupling on its own pointed the wrong way in half of them,
// because a core domain has *low* cohesion precisely because everything uses
// it. So the names are read first and the graph only confirms: do the
// components carrying this word reference each other, and change together?

/** A word that names a subject rather than a role, and what says so. */
export interface Subject {
  word: string
  members: string[]
  /** How freely the word moves through the names carrying it. */
  float: number
  /** How many distinct places in a name it was found at. */
  places: number
  /** Share of its members' references that stay inside the set. */
  inside: number
  /** Share of its members' co-changes that stay inside the set. */
  moves: number
  score: number
}

/** Said twice, or it is a name rather than a subject. */
const SUBJECT_MIN = 2
/**
 * Past this share of the codebase a word is scaffolding: the root namespace,
 * `Services`, `Plugin`. The floor is what keeps small codebases workable —
 * 8% of forty-nine components is three, which would disqualify every word in
 * the project and leave the reading with nothing to say.
 */
const SUBJECT_SHARE = 0.08
const SUBJECT_FLOOR = 20
/** Enough for a large platform's domains; past it the tail is scaffolding. */
const SUBJECT_LIMIT = 70
/** Co-change is the scarcer evidence, and the harder to arrange by accident. */
const MOVES_WEIGHT = 2
/** The least the graph has to say before a word counts as a subject at all. */
const SUBJECT_EVIDENCE = 0.1
/** Marks a key as a word rather than a path, since either can look like either. */
const SUBJECT_KEY = "~subject~"

const WORD = /[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g

/**
 * The words inside one segment. `OrderBundle` is two of them: Sylius names
 * the same domain `Sylius\Component\Order` in one place and
 * `Sylius\Bundle\OrderBundle` in another, and without this they are two
 * subjects that never meet.
 */
export function wordsOf(segment: string): string[] {
  return (segment.replace(/[_-]+/g, " ").match(WORD) ?? [])
    .map(w => w.toLowerCase())
    .filter(w => w.length > 1)
}

/** Every word in a name, in the order it is read. */
function nameWords(id: string, style: Segmenter): string[] {
  return style.split(id).flatMap(wordsOf)
}

/** How widely a word is scattered through the names that carry it. */
function spread(places: number[]): number {
  if (places.length < 2) return 0
  const counts = new Map<number, number>()
  for (const p of places) counts.set(p, (counts.get(p) ?? 0) + 1)
  let h = 0
  for (const c of counts.values()) {
    const share = c / places.length
    h -= share * Math.log(share)
  }
  return h
}

/** How much of a set's weight stays inside it. */
function insideShare(members: Set<string>, index: Ties | undefined): number {
  if (!index) return 0
  let inside = 0
  let all = 0
  for (const id of members) {
    const row = index.get(id)
    if (!row) continue
    for (const [other, tie] of row) {
      all += tie.weight
      if (members.has(other)) inside += tie.weight
    }
  }
  return all > 0 ? inside / all : 0
}

/** The subjects this pool is named for, best first. */
export function subjectsIn(ids: string[], world: SubjectWorld): Subject[] {
  const refs = world.refs
  const places = new Map<string, number[]>()
  const carries = new Map<string, Set<string>>()
  for (const id of ids) {
    const flat = nameWords(id, world.style)
    flat.forEach((word, at) => places.set(word, [...(places.get(word) ?? []), at]))
    for (const word of new Set(flat)) {
      const held = carries.get(word) ?? new Set<string>()
      held.add(id)
      carries.set(word, held)
    }
  }
  const cap = Math.max(SUBJECT_FLOOR, SUBJECT_SHARE * ids.length)
  const out: Subject[] = []
  for (const [word, members] of carries) {
    if (members.size < SUBJECT_MIN || members.size > cap) continue
    const at = places.get(word) ?? []
    const float = spread(at)
    // A word that never moves is part of the convention rather than a
    // subject. In a codebase where nothing moves, nothing qualifies — which
    // is this reading saying it has nothing to add, rather than guessing.
    if (float <= 0) continue
    const inside = insideShare(members, refs)
    const moves = insideShare(members, world.moves)
    // A word the graph says nothing about is a word in the names only, and
    // that is how `js`, `migrations` and the vendored asset folders arrive.
    // Asking for a little evidence and no more is deliberate: raising this
    // starts dropping real domains, because a core domain is referenced from
    // everywhere and so keeps little of its own traffic inside.
    if (inside + moves < SUBJECT_EVIDENCE) continue
    out.push({
      word,
      members: Array.from(members).sort(),
      float,
      places: new Set(at).size,
      inside,
      moves,
      score: float * (1 + inside + MOVES_WEIGHT * moves),
    })
  }
  return out
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, SUBJECT_LIMIT)
}

/**
 * The depth at which the package tree divides a pool best: neither one group
 * holding nearly everything nor a group per component, since both answer
 * nothing. One depth rather than a depth per branch, because a cut that
 * cannot be said in a sentence is a cut nobody can check.
 */
export function treeKeys(ids: string[], style: Segmenter): Map<string, string> {
  const keys = new Map<string, string>()
  if (ids.length === 0) return keys
  const deepest = Math.max(...ids.map(id => style.split(id).length))
  let best: { keys: Map<string, string>; score: number } | null = null
  for (let depth = 1; depth <= Math.min(deepest, 8); depth++) {
    const at = new Map<string, string>()
    for (const id of ids) at.set(id, style.join(style.split(id).slice(0, depth)))
    const counts = new Map<string, number>()
    for (const k of at.values()) counts.set(k, (counts.get(k) ?? 0) + 1)
    if (counts.size < 2) continue
    const biggest = Math.max(...counts.values()) / ids.length
    const alone = Array.from(counts.values()).filter(c => c === 1).length / counts.size
    const score = (1 - biggest) * (1 - alone)
    if (!best || score > best.score) best = { keys: at, score }
  }
  if (best) return best.keys
  for (const id of ids) keys.set(id, style.join(style.split(id).slice(0, 1)))
  return keys
}

/** How self-contained a partition's groups are, against one set of ties. */
function selfContainment(keys: Map<string, string>, index: Ties | undefined): number {
  if (!index) return 0
  const degree = new Map<string, number>()
  let total = 0
  for (const [id, row] of index) {
    if (!keys.has(id)) continue
    let d = 0
    for (const [other, tie] of row) if (keys.has(other)) d += tie.weight
    degree.set(id, d)
    total += d
  }
  if (total <= 0) return 0
  const inside = new Map<string, number>()
  const held = new Map<string, number>()
  for (const [id, row] of index) {
    const group = keys.get(id)
    if (group === undefined) continue
    held.set(group, (held.get(group) ?? 0) + (degree.get(id) ?? 0))
    for (const [other, tie] of row) {
      if (keys.get(other) === group) inside.set(group, (inside.get(group) ?? 0) + tie.weight)
    }
  }
  let q = 0
  for (const group of new Set(keys.values())) {
    q += (inside.get(group) ?? 0) / total - Math.pow((held.get(group) ?? 0) / total, 2)
  }
  return q
}

/**
 * Whether this codebase is laid out domain-first or layer-first. That is the
 * whole question, and it is a fact about the codebase rather than a setting.
 *
 * A domain-first tree already holds its domains — `com.fedex.qp.booking.*`,
 * `com.elepy.auth.*` — so cutting it by the tree leaves groups that keep
 * their own references, and reading those names for a floating subject finds
 * the *layers* instead, because there it is the roles that float. A
 * layer-first tree does the exact opposite. So the tree is asked first, and
 * the names are only read when the tree fails to produce self-contained
 * groups.
 *
 * Measured across six platforms this separated cleanly: the one domain-first
 * codebase scored 0.48 and the highest layer-first one 0.22.
 */
const TREE_IS_THE_DOMAIN = 0.3

export type DomainBasis = "tree" | "subject"

export function domainBasisOf(ids: string[], world: SubjectWorld): { basis: DomainBasis; tree: Map<string, string>; strength: number } {
  const tree = treeKeys(ids, world.style)
  const strength = selfContainment(tree, world.refs)
  return { basis: strength >= TREE_IS_THE_DOMAIN ? "tree" : "subject", tree, strength }
}

/** What each component is named for, and the package for whatever is left. */
export function domainKeys(
  ids: string[],
  world: SubjectWorld,
  struck: ReadonlySet<string> = new Set(),
  /** Read it this way rather than the way the codebase suggests. */
  forced?: DomainBasis,
): { keys: Map<string, string>; subjects: Subject[]; basis: DomainBasis } {
  const detected = domainBasisOf(ids, world)
  const basis = forced ?? detected.basis
  if (basis === "tree") return { keys: detected.tree, subjects: [], basis }
  // A word the architect has struck out is not a subject here, whatever the
  // evidence says. Measured across six platforms, no rule separates a
  // subject from a role in every codebase: where a project replicates its
  // whole layer structure per plugin, `controllers` moves through the names
  // exactly as freely as `catalog` does. So the reading offers its best and
  // the architect, who can see in one glance what no statistic settles,
  // takes a word out and watches the cut re-measure.
  const subjects = subjectsIn(ids, world).filter(s => !struck.has(s.word))
  const rank = new Map(subjects.map(s => [s.word, s.score]))
  const keys = new Map<string, string>()
  for (const id of ids) {
    let best: string | null = null
    for (const word of new Set(nameWords(id, world.style))) {
      if (!rank.has(word)) continue
      if (!best || rank.get(word)! > rank.get(best)!) best = word
    }
    if (best) keys.set(id, SUBJECT_KEY + best)
  }
  // Whatever no subject speaks for still has a package to answer for it.
  const rest = ids.filter(id => !keys.has(id))
  for (const [id, key] of treeKeys(rest, world.style)) keys.set(id, key)
  return { keys, subjects, basis }
}

/** The word a subject key stands for, or null when the key is a path. */
export function subjectOf(key: string): string | null {
  return key.startsWith(SUBJECT_KEY) ? key.slice(SUBJECT_KEY.length) : null
}

/** What to tell someone about a group the subject reading made. */
export function subjectReason(s: Subject, members: number): string {
  if (members === 1) return `named for ${s.word}`
  const said = [`all named ${s.word}`]
  if (s.places > 1) said.push(`in ${s.places} different places in the tree`)
  if (s.inside >= 0.15) said.push(`${Math.round(s.inside * 100)}% of their references stay inside`)
  else if (s.moves >= 0.15) said.push(`${Math.round(s.moves * 100)}% of their changes land together`)
  return said.join(", ")
}

// ── The other word in a name: the one that does not move ─────────────────
//
// A subject floats and a role sits still, so the same measurement read from
// the other end finds the layers: `Controllers` is last in every name that
// has it, `Repository` is last in every other. This is the mirror of
// `subjectsIn`, and it is here rather than in the studio so that the
// suggester can offer it as a cut of its own.

/** A word that names the job rather than the thing. */
export interface Role {
  word: string
  members: string[]
  /** How many different parts of the tree it turns up in. */
  reach: number
  score: number
}

/** The roles this pool's names give away, best first. */
export function rolesIn(ids: string[], world: SubjectWorld): Role[] {
  const reach = new Map<string, Set<string>>()
  const uses = new Map<string, number>()
  const carries = new Map<string, Set<string>>()
  for (const id of ids) {
    const segments = world.style.split(id)
    const parent = world.style.join(segments.slice(0, -1))
    for (const word of new Set(segments.flatMap(wordsOf))) {
      const seen = reach.get(word) ?? new Set<string>()
      seen.add(parent)
      reach.set(word, seen)
      uses.set(word, (uses.get(word) ?? 0) + 1)
      const held = carries.get(word) ?? new Set<string>()
      held.add(id)
      carries.set(word, held)
    }
  }
  // Reach alone would crown the root package, which touches everything and
  // says nothing, so it is weighed by how rare the word is and a word on
  // every component scores nothing at all.
  const n = Math.max(1, ids.length)
  const out: Role[] = []
  for (const [word, members] of carries) {
    const used = uses.get(word) ?? 0
    const spread = reach.get(word)?.size ?? 0
    if (used < 2 || spread < 2) continue
    const score = spread * Math.log(n / used)
    if (score <= 0) continue
    out.push({ word, members: Array.from(members).sort(), reach: spread, score })
  }
  return out.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
}

/** What job each name gives away, and nothing for the names that give none. */
export function roleKeys(ids: string[], world: SubjectWorld, struck: ReadonlySet<string> = new Set()): { keys: Map<string, string>; roles: Role[] } {
  const roles = rolesIn(ids, world).filter(r => !struck.has(r.word))
  const rank = new Map(roles.map(r => [r.word, r.score]))
  const keys = new Map<string, string>()
  for (const id of ids) {
    let best: string | null = null
    for (const word of new Set(nameWords(id, world.style))) {
      if (!rank.has(word)) continue
      if (!best || rank.get(word)! > rank.get(best)!) best = word
    }
    if (best) keys.set(id, SUBJECT_KEY + best)
  }
  return { keys, roles }
}
