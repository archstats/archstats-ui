// Group suggestions for the Connections view. Every pair of units (components,
// or files when a component may be split) gets an affinity from weighted
// signals; a preset says which signals boost, which penalise and how finely
// to cut. Vertical cuts (domains) cluster the affinity graph; horizontal cuts
// (layers) band units by an attribute. Pure: the composable feeds it tables,
// the view draws what comes back.

import { louvain } from "~/utils/louvain"
import { stronglyConnectedSets } from "~/utils/connections"

export type SignalId = "references" | "cochange" | "entities" | "names" | "path" | "lanes" | "depth" | "cycles" | "authors"
export type Weight = -2 | -1 | 0 | 1 | 2
import { domainKeys, roleKeys, segmenterFor, subjectOf, type DomainBasis, type Ties } from "~/utils/subject"

export type Engine = "cluster" | "band" | "subject" | "role"
export type BandBy = "lanes" | "depth"
export type Cut = "vertical" | "horizontal" | "free"
export type Grain = "component" | "file"

export interface SignalDef { id: SignalId; label: string; hint: string; needs?: "git" | "java" }

export const SIGNALS: SignalDef[] = [
  { id: "references", label: "References", hint: "Static references between them" },
  { id: "cochange", label: "Co-change", hint: "Changed in the same commits", needs: "git" },
  { id: "entities", label: "Shared domain types", hint: "Import the same entities and models", needs: "java" },
  { id: "names", label: "Name tokens", hint: "Share a rare word in their names" },
  { id: "path", label: "Package proximity", hint: "Live in the same package tree" },
  { id: "lanes", label: "Same lane", hint: "Play the same framework role", needs: "java" },
  { id: "depth", label: "Same depth", hint: "Sit at the same distance from the entry points" },
  { id: "cycles", label: "Cycles", hint: "Depend on each other in a cycle" },
  { id: "authors", label: "Same authors", hint: "Written by the same people", needs: "git" },
]

export interface SuggestSettings {
  /** The cut this preset makes; recorded on the saved dimension. */
  cut?: Cut
  engine: Engine
  bandBy: BandBy
  weights: Record<SignalId, Weight>
  /** 0 = few large groups, 1 = many small ones. */
  granularity: number
  minSize: number
  /**
   * How much of its own referencing a proposed group must keep inside before
   * the engine is willing to stand behind it, 0..1. Below this the group is
   * not proposed at all and its members stay unplaced, which is the honest
   * answer: the engine found no structure there, and saying so beats handing
   * over a group someone has to undo.
   *
   * Only where cohesion is the right question. A layer's members deliberately
   * do NOT reference each other — adjacency finds domains, equivalence finds
   * layers — so a horizontal cut leaves this unset. Measured by `npm run
   * bench` at four members and 15%:
   *
   *   BroadleafCommerce, Domains   122 groups / Q 0.147 / 27.3% kept
   *                             →    9 groups / Q 0.227 / 42.6% kept
   *   qp visualizer, Domains       242 groups / Q 0.194 / 29.4% kept
   *                             →   26 groups / Q 0.436 / 56.0% kept
   *   qp visualizer, Ownership     499 groups / Q 0.019 /  4.2% kept
   *                             →   30 groups / Q 0.464 / 57.3% kept
   *
   * The same gate on Layers moves modularity by 0.001, which is the point:
   * it is not asked there.
   */
  minKept?: number
  /** Words the architect has taken out of the vocabulary by hand. */
  struckSubjects?: string[]
  /**
   * Which reading of the names to take, rather than the one the codebase
   * suggests. A tree already holding its domains and a tree holding layers
   * want opposite readings, and the architect can see which this is.
   */
  basis?: DomainBasis
  keepSharedApart: boolean
  splitFiles: boolean
  /** Split giants, fold dwarfs, merge clusters that would carry the same name. */
  balance: boolean
  dimension: string
}

export interface Preset { id: string; label: string; hint: string; cut: Cut; settings: SuggestSettings }

export const weightsOf = (o: Partial<Record<SignalId, Weight>>): Record<SignalId, Weight> => ({
  references: 0, cochange: 0, entities: 0, names: 0, path: 0, lanes: 0, depth: 0, cycles: 0, authors: 0, ...o,
})

export const PRESETS: Preset[] = [
  // Named for the evidence each one reads, because that is the choice being
  // made. "Domain" and "Layer" named the hoped-for result instead, and hid
  // the fact that a domain is found two opposite ways in two codebases.
  {
    id: "tree", label: "Package tree", cut: "vertical",
    hint: "Where each thing sits, cut at the depth that divides the tree best.",
    settings: { engine: "subject", basis: "tree", bandBy: "lanes", weights: weightsOf({ path: 2, references: 1 }), granularity: 0.5, minSize: 2, keepSharedApart: false, splitFiles: false, balance: false, dimension: "Domain" },
  },
  {
    id: "subject", label: "Subject in the name", cut: "vertical",
    hint: "The word that moves through the names: Catalog at any depth, in every layer.",
    settings: { engine: "subject", basis: "subject", bandBy: "lanes", weights: weightsOf({ references: 1, cochange: 2, entities: 2, names: 1, path: 1, lanes: -1, cycles: 1 }), granularity: 0.5, minSize: 2, keepSharedApart: false, splitFiles: false, balance: false, dimension: "Domain" },
  },
  {
    id: "role", label: "Role in the name", cut: "horizontal",
    hint: "The word that fills the same slot in every name: everything ending in Controllers.",
    settings: { engine: "role", bandBy: "lanes", weights: weightsOf({ names: 2, lanes: 1, references: -1 }), granularity: 0.5, minSize: 2, keepSharedApart: false, splitFiles: true, balance: false, dimension: "Layer" },
  },
  {
    id: "references", label: "What references what", cut: "free",
    hint: "Clusters in the reference graph. Reads no names at all, so a badly named codebase is no obstacle.",
    settings: { engine: "cluster", bandBy: "lanes", weights: weightsOf({ references: 2, path: 2, cycles: 2, cochange: 1, names: 1 }), granularity: 0.5, minSize: 4, minKept: 0.15, keepSharedApart: true, splitFiles: false, balance: true, dimension: "Module" },
  },
  {
    id: "depth", label: "Distance from the entry points", cut: "horizontal",
    hint: "How many hops each thing sits from something that calls in.",
    settings: { engine: "band", bandBy: "depth", weights: weightsOf({ depth: 2, path: 1, references: -1 }), granularity: 0.5, minSize: 4, keepSharedApart: false, splitFiles: true, balance: true, dimension: "Layer" },
  },
  {
    id: "commits", label: "What changes together", cut: "free",
    hint: "What gets edited in the same commits, whatever it is called or where it lives.",
    // No minKept, and for the same reason the domain cut carries none:
    // `minKept` asks what share of a group's *references* stay inside, and
    // things edited in the same commit need not reference each other at all
    // -- that is the whole point of reading the history instead of the code.
    // Measured, the gate was throwing away most of the answer: Sakai placed
    // 318 of 1,271 with it and 1,228 without.
    settings: { engine: "cluster", bandBy: "lanes", weights: weightsOf({ cochange: 2, cycles: 1, references: 0.8, path: 0.3 }), granularity: 0.5, minSize: 4, keepSharedApart: false, splitFiles: false, balance: true, dimension: "Change" },
  },
  {
    id: "authors", label: "Who works on it", cut: "vertical",
    hint: "The hands in the commit history: the same people, the same commits.",
    // Same again: people who look after the same things do not have to make
    // those things reference each other. With the gate off, every component
    // gets an owner on all four codebases measured instead of four in five.
    settings: { engine: "cluster", bandBy: "lanes", weights: weightsOf({ authors: 2, cochange: 2, path: 1 }), granularity: 0.5, minSize: 4, keepSharedApart: false, splitFiles: false, balance: true, dimension: "Team" },
  },
  {
    id: "lanes", label: "What the framework makes it", cut: "horizontal",
    hint: "Controller, repository, entity: the role the framework itself gives each file.",
    settings: { engine: "band", bandBy: "lanes", weights: weightsOf({ lanes: 2, depth: 1, path: 1, references: -1 }), granularity: 0.5, minSize: 4, keepSharedApart: false, splitFiles: true, balance: true, dimension: "Layer" },
  },
  {
    id: "blend", label: "Every signal at once", cut: "free",
    hint: "All of the above counted together, with none of them leading.",
    settings: { engine: "cluster", bandBy: "lanes", weights: weightsOf({ references: 1, cochange: 1, entities: 1, names: 1, path: 1 }), granularity: 0.5, minSize: 4, minKept: 0.15, keepSharedApart: true, splitFiles: false, balance: true, dimension: "Dimension" },
  },
]

export function presetById(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? PRESETS[0]
}

// ── Sources → input ──────────────────────────────────────────────────────

export interface RefEdge { from: string; to: string; references: number }
export interface CountEdge { from: string; to: string; count: number }

/** What the engine has already measured about a component's place in the graph. */
export interface GraphMetrics {
  community: number | null
  /** HITS: points at many authorities — a component that reaches everywhere. */
  hub: number
  /** HITS: pointed at by many hubs — a utility everything leans on. */
  authority: number
  pageRank: number
  betweenness: number
}

export interface SignalSources {
  components: string[]
  files: Array<{ name: string; component: string | null }>
  componentRefs: RefEdge[]
  fileRefs: RefEdge[]
  componentCochange: CountEdge[]
  fileCochange: CountEdge[]
  laneOfFile: Map<string, string>
  laneLabels: Record<string, string>
  /** file → the entity/model files it imports. */
  entityImports: Map<string, string[]>
  authorsOfFile: Map<string, string[]>
  /** Empty when the snapshot carries no community metrics. */
  graph: Map<string, GraphMetrics>
}

export const EMPTY_SOURCES: SignalSources = {
  components: [], files: [], componentRefs: [], fileRefs: [], componentCochange: [], fileCochange: [],
  laneOfFile: new Map(), laneLabels: {}, entityImports: new Map(), authorsOfFile: new Map(), graph: new Map(),
}

export interface Unit {
  id: string
  component: string
  file: string | null
  tokens: string[]
  segments: string[]
  lane: string | null
  laneProfile: Map<string, number> | null
  depth: number | null
  authors: string[]
  entities: string[]
}

export interface Pair { a: string; b: string; v: Partial<Record<SignalId, number>>; raw: Partial<Record<SignalId, number>> }

export interface SuggestInput {
  grain: Grain
  units: Unit[]
  pairs: Pair[]
  laneLabels: Record<string, string>
  hubs: Set<string>
  filesPerComponent: Map<string, number>
  idf: Map<string, number>
  /** What the engine measured about each component's place in the graph. */
  graph: Map<string, GraphMetrics>
  /** Directed references at this grain: who points at whom, and how hard. */
  refsOut: Map<string, Map<string, number>>
}

const STOP = new Set(["com", "org", "net", "io", "java", "main", "src", "test", "tests", "impl", "internal", "api", "core", "common", "util", "utils", "base", "abstract", "default", "app", "application", "lib", "libs", "module", "package", "the"])

/** File extensions, which name a language rather than a subject. */
const EXT = new Set([
  "java", "kt", "kts", "scala", "groovy", "clj",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte",
  "go", "py", "rb", "cs", "fs", "vb", "php", "rs", "swift", "dart", "lua", "pl",
  "c", "cc", "cpp", "cxx", "hpp", "hxx", "mm", "ex", "exs", "erl", "sh", "sql",
])

export function tokensOf(id: string): string[] {
  const out = new Set<string>()
  for (const seg of id.split(/::|[./\\_\-\s]+/)) {
    for (const t of seg.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(" ")) {
      const w = t.toLowerCase()
      // The split has already separated "Handler.php" into two, so an
      // extension arrives as a word of its own. Left in, every file of a
      // language would share a name with every other one.
      if (w.length >= 3 && !STOP.has(w) && !EXT.has(w) && !/^\d+$/.test(w)) out.add(w)
    }
  }
  return Array.from(out)
}

function segmentsOf(id: string, isFile: boolean): string[] {
  const parts = id.split(/::|[./\\]+/).filter(Boolean)
  return isFile ? parts.slice(0, -1) : parts
}

const SEP = "\u0000"
function pairKey(a: string, b: string): string { return a < b ? a + SEP + b : b + SEP + a }

/** Longest path from the entry points over the condensed component graph; null for components without references. */
export function componentDepths(components: Iterable<string>, refs: RefEdge[]): Map<string, number | null> {
  const ids = Array.from(components)
  const sccs = stronglyConnectedSets(ids, refs)
  const sccOf = new Map<string, number>()
  sccs.forEach((set, i) => set.forEach(c => sccOf.set(c, i)))
  ids.forEach(c => { if (!sccOf.has(c)) { sccOf.set(c, sccs.length); sccs.push([c]) } })
  const n = sccs.length
  const succ: Array<Set<number>> = Array.from({ length: n }, () => new Set())
  const indeg = new Array(n).fill(0)
  const touched = new Set<string>()
  for (const e of refs) {
    const a = sccOf.get(e.from), b = sccOf.get(e.to)
    if (a === undefined || b === undefined) continue
    touched.add(e.from); touched.add(e.to)
    if (a === b) continue
    if (!succ[a].has(b)) { succ[a].add(b); indeg[b]++ }
  }
  const depth = new Array(n).fill(0)
  const queue: number[] = []
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i)
  while (queue.length) {
    const i = queue.shift()!
    succ[i].forEach(j => { depth[j] = Math.max(depth[j], depth[i] + 1); if (--indeg[j] === 0) queue.push(j) })
  }
  const out = new Map<string, number | null>()
  for (const c of ids) out.set(c, touched.has(c) ? depth[sccOf.get(c)!] : null)
  return out
}

export function buildSuggestInput(src: SignalSources, grain: Grain, include: (component: string) => boolean = () => true): SuggestInput {
  const componentOfFile = new Map<string, string>()
  const filesPerComponent = new Map<string, number>()
  for (const f of src.files) {
    if (!f.component || !include(f.component)) continue
    componentOfFile.set(f.name, f.component)
    filesPerComponent.set(f.component, (filesPerComponent.get(f.component) ?? 0) + 1)
  }
  const depths = componentDepths(src.components, src.componentRefs)

  // Units
  const units: Unit[] = []
  if (grain === "file") {
    for (const f of src.files) {
      if (!f.component) continue
      units.push({
        id: f.name, component: f.component, file: f.name, tokens: tokensOf(f.name), segments: segmentsOf(f.name, true),
        lane: src.laneOfFile.get(f.name) ?? null, laneProfile: null, depth: depths.get(f.component) ?? null,
        authors: src.authorsOfFile.get(f.name) ?? [], entities: src.entityImports.get(f.name) ?? [],
      })
    }
  } else {
    const filesOf = new Map<string, string[]>()
    for (const [file, c] of componentOfFile) filesOf.set(c, [...(filesOf.get(c) ?? []), file])
    for (const c of src.components) {
      if (!include(c)) continue
      const files = filesOf.get(c) ?? []
      const profile = new Map<string, number>()
      const authors = new Set<string>(), entities = new Set<string>()
      for (const f of files) {
        const lane = src.laneOfFile.get(f); if (lane) profile.set(lane, (profile.get(lane) ?? 0) + 1)
        for (const a of src.authorsOfFile.get(f) ?? []) authors.add(a)
        for (const e of src.entityImports.get(f) ?? []) entities.add(e)
      }
      let lane: string | null = null, best = 0
      profile.forEach((n, l) => { if (n > best) { best = n; lane = l } })
      units.push({ id: c, component: c, file: null, tokens: tokensOf(c), segments: segmentsOf(c, false), lane, laneProfile: profile.size ? profile : null, depth: depths.get(c) ?? null, authors: Array.from(authors), entities: Array.from(entities) })
    }
  }
  const unitIds = new Set(units.map(u => u.id))
  const byId = new Map(units.map(u => [u.id, u]))
  const N = Math.max(1, units.length)

  // idf of name tokens
  const df = new Map<string, number>()
  for (const u of units) for (const t of u.tokens) df.set(t, (df.get(t) ?? 0) + 1)
  const idf = new Map<string, number>()
  df.forEach((d, t) => idf.set(t, Math.log(N / d)))

  const pairs = new Map<string, Pair>()
  const pairOf = (a: string, b: string): Pair | null => {
    if (a === b || !unitIds.has(a) || !unitIds.has(b)) return null
    const k = pairKey(a, b)
    let p = pairs.get(k)
    if (!p) { p = a < b ? { a, b, v: {}, raw: {} } : { a: b, b: a, v: {}, raw: {} }; pairs.set(k, p) }
    return p
  }
  const addRaw = (a: string, b: string, s: SignalId, n: number) => { const p = pairOf(a, b); if (p) p.raw[s] = (p.raw[s] ?? 0) + n }

  // References and co-change: counts, then log-scaled against the strongest pair.
  const degree = new Map<string, Set<string>>()
  for (const e of grain === "file" ? src.fileRefs : src.componentRefs) {
    if (e.from === e.to) continue
    addRaw(e.from, e.to, "references", e.references)
    if (unitIds.has(e.from) && unitIds.has(e.to)) {
      if (!degree.has(e.from)) degree.set(e.from, new Set())
      degree.get(e.from)!.add(e.to)
      if (!degree.has(e.to)) degree.set(e.to, new Set())
      degree.get(e.to)!.add(e.from)
    }
  }
  for (const e of grain === "file" ? src.fileCochange : src.componentCochange) addRaw(e.from, e.to, "cochange", e.count)

  // Shared domain types: pairs among importers of one entity; hub entities skipped.
  const importers = new Map<string, string[]>()
  for (const u of units) for (const e of u.entities) importers.set(e, [...(importers.get(e) ?? []), u.id])
  importers.forEach(list => {
    if (list.length < 2 || list.length > 40) return
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) addRaw(list[i], list[j], "entities", 1)
  })

  // Rare name tokens: pairs among the few units that share one.
  const sharers = new Map<string, string[]>()
  for (const u of units) for (const t of u.tokens) sharers.set(t, [...(sharers.get(t) ?? []), u.id])
  sharers.forEach(list => {
    if (list.length < 2 || list.length > 40) return
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairOf(list[i], list[j])
  })

  // Package siblings.
  const siblings = new Map<string, string[]>()
  for (const u of units) { const parent = u.segments.slice(0, -1).join("/"); siblings.set(parent, [...(siblings.get(parent) ?? []), u.id]) }
  siblings.forEach(list => {
    if (list.length < 2 || list.length > 60) return
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairOf(list[i], list[j])
  })

  // Cycles at component grain.
  const sccOf = new Map<string, number>()
  stronglyConnectedSets(src.components, src.componentRefs).forEach((set, i) => { if (set.length > 1) set.forEach(c => sccOf.set(c, i)) })
  if (grain === "component") {
    const bySet = new Map<number, string[]>()
    sccOf.forEach((i, c) => bySet.set(i, [...(bySet.get(i) ?? []), c]))
    bySet.forEach(list => { if (list.length <= 40) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairOf(list[i], list[j]) })
  }

  // How much each package prefix narrows the codebase down. A prefix every
  // unit shares carries no information; one only two units share carries a lot.
  const prefixCount = new Map<string, number>()
  for (const u of units) {
    let path = ""
    for (const seg of u.segments) {
      path = path ? path + "/" + seg : seg
      prefixCount.set(path, (prefixCount.get(path) ?? 0) + 1)
    }
  }
  /** The information in a prefix only one unit has: the ceiling for any pair. */
  const maxPathInfo = Math.log(N)
  const pathInfo = (segments: string[], upto: number): number => {
    let path = ""
    let info = 0
    for (let i = 0; i < upto; i++) {
      path = path ? path + "/" + segments[i] : segments[i]
      info += -Math.log((prefixCount.get(path) ?? 1) / N)
    }
    return info
  }

  // Normalise every candidate pair.
  let maxRefs = 0, maxCo = 0
  pairs.forEach(p => { maxRefs = Math.max(maxRefs, p.raw.references ?? 0); maxCo = Math.max(maxCo, p.raw.cochange ?? 0) })
  let maxDepth = 1
  units.forEach(u => { if (u.depth !== null) maxDepth = Math.max(maxDepth, u.depth) })
  const jaccard = (a: string[], b: string[]) => { if (!a.length || !b.length) return 0; const s = new Set(a); let n = 0; for (const x of b) if (s.has(x)) n++; return n / (a.length + b.length - n) }
  pairs.forEach(p => {
    const A = byId.get(p.a)!, B = byId.get(p.b)!
    if (p.raw.references) p.v.references = Math.log(1 + p.raw.references) / Math.log(1 + maxRefs)
    if (p.raw.cochange) p.v.cochange = Math.log(1 + p.raw.cochange) / Math.log(1 + maxCo)
    if (p.raw.entities) p.v.entities = jaccard(A.entities, B.entities)
    // names: idf-weighted overlap of tokens
    const sa = new Set(A.tokens), sb = new Set(B.tokens)
    let shared = 0, union = 0, sharedCount = 0
    new Set([...A.tokens, ...B.tokens]).forEach(t => { const w = idf.get(t) ?? 0; union += w; if (sa.has(t) && sb.has(t)) { shared += w; sharedCount++ } })
    if (shared > 0) { p.v.names = union > 0 ? shared / union : 0; p.raw.names = sharedCount }
    // path: how much the shared prefix actually narrows things down. Counting
    // segments alone made every pair in a single-root codebase look close,
    // because "com.elepy" is shared by everything and so says nothing at all.
    let common = 0
    while (common < A.segments.length && common < B.segments.length && A.segments[common] === B.segments[common]) common++
    if (common > 0) {
      // Measured against a location unique to one unit, which is as specific
      // as any path can be. Dividing by each unit's own depth instead would
      // score every pair of siblings 1, however common their package is.
      const shared = pathInfo(A.segments, common)
      if (shared > 0 && maxPathInfo > 0) { p.v.path = Math.min(1, shared / maxPathInfo); p.raw.path = common }
    }
    // lanes
    if (grain === "file") { if (A.lane && B.lane) { p.v.lanes = A.lane === B.lane ? 1 : 0; p.raw.lanes = p.v.lanes } }
    else if (A.laneProfile && B.laneProfile) {
      let dot = 0, na = 0, nb = 0
      A.laneProfile.forEach((x, l) => { na += x * x; dot += x * (B.laneProfile!.get(l) ?? 0) })
      B.laneProfile.forEach(y => { nb += y * y })
      p.v.lanes = na && nb ? dot / Math.sqrt(na * nb) : 0; p.raw.lanes = p.v.lanes
    }
    if (A.depth !== null && B.depth !== null) { p.v.depth = 1 - Math.abs(A.depth - B.depth) / maxDepth; p.raw.depth = Math.abs(A.depth - B.depth) }
    const ca = sccOf.get(A.component), cb = sccOf.get(B.component)
    if (ca !== undefined && ca === cb) { p.v.cycles = 1; p.raw.cycles = 1 }
    if (A.authors.length && B.authors.length) { const j = jaccard(A.authors, B.authors); if (j > 0) { p.v.authors = j; p.raw.authors = j } }
  })

  // Hubs: referenced by far more units than usual.
  const hubs = new Set<string>()
  const degs = Array.from(degree.values()).map(s => s.size)
  if (degs.length) {
    const mean = degs.reduce((s, d) => s + d, 0) / degs.length
    const threshold = Math.max(10, 3 * mean, 0.08 * N)
    degree.forEach((s, id) => { if (s.size >= threshold) hubs.add(id) })
  }

  // Direction is thrown away by the pair table, which is symmetric, but a
  // layer is defined by it: kept here so relatedness can be measured either
  // by who you touch or by who touches you.
  const refsOut = new Map<string, Map<string, number>>()
  for (const e of grain === "file" ? src.fileRefs : src.componentRefs) {
    if (!unitIds.has(e.from) || !unitIds.has(e.to) || e.from === e.to) continue
    const row = refsOut.get(e.from) ?? new Map<string, number>()
    row.set(e.to, (row.get(e.to) ?? 0) + e.references)
    refsOut.set(e.from, row)
  }
  return { grain, units, pairs: Array.from(pairs.values()), laneLabels: src.laneLabels, hubs, filesPerComponent, idf, graph: src.graph, refsOut }
}

// ── Engine ───────────────────────────────────────────────────────────────

export interface SuggestionPart { component: string; files: string[] | null; total: number }
export interface Reason { signal: SignalId; text: string; share: number }
export interface Suggestion {
  key: string
  name: string
  parts: SuggestionPart[]
  /** Components to draw the hull around: each component sits in the suggestion holding most of it. */
  components: string[]
  reasons: Reason[]
  units: number
  split: number
}

const MULT: Record<Weight, number> = { [-2]: -1, [-1]: -0.5, 0: 0, 1: 1, 2: 2 }

/** A draft to reshuffle around: units already placed, and which groups are decided. */
export interface Constraints {
  /** unit id → draft group key */
  placed: Map<string, string>
  /** draft group keys whose units never move */
  locked: Set<string>
  /** draft group key → its name, kept when the cluster survives */
  names: Map<string, string>
}

/** Sum of weighted signals between two units, the same number the clustering sees. */
function pairWeight(p: Pair, settings: SuggestSettings): number {
  let w = 0
  for (const s of SIGNALS) { const v = p.v[s.id]; if (v) w += MULT[settings.weights[s.id]] * v }
  return w
}

function bandKey(u: Unit, by: BandBy, maxDepth: number): { key: string; label: string } | null {
  if (by === "lanes") {
    // A file the framework says nothing about is left for the architect,
    // not quietly answered with its depth. That substitution is why
    // "framework role" and "distance from the entry points" returned
    // identical cuts on every codebase measured, while claiming to be two
    // different readings.
    return u.lane ? { key: "lane:" + u.lane, label: u.lane } : null
  }
  if (u.depth === null) return null
  const third = u.depth / Math.max(1, maxDepth)
  if (third <= 0.34) return { key: "depth:0", label: "Entry points" }
  if (third <= 0.67) return { key: "depth:1", label: "Middle" }
  return { key: "depth:2", label: "Foundations" }
}


/** One signal's pairs as a weighted adjacency, for the subject reading. */
function tiesFrom(pairs: Pair[], signal: SignalId): Ties {
  const out = new Map<string, Map<string, { weight: number }>>()
  const link = (a: string, b: string, weight: number) => {
    const row = out.get(a) ?? new Map<string, { weight: number }>()
    row.set(b, { weight })
    out.set(a, row)
  }
  for (const p of pairs) {
    const weight = p.v[signal] ?? 0
    if (weight <= 0) continue
    link(p.a, p.b, weight)
    link(p.b, p.a, weight)
  }
  return out
}

/**
 * Names the groups a name-reading made. A group the reading could name keeps
 * that word; one the package tree named keeps its last segment. Two branches
 * can end in the same segment, though, and numbering the second "Web 2" tells
 * the reader nothing that "Group B" did not, so where the last segment is
 * shared they take as much of the path as it takes to tell them apart.
 */
function nameGroups(keys: Map<string, string>, labels: Map<string, string>, style: { split(id: string): string[] }) {
  const byLabel = new Map<string, string[]>()
  for (const key of new Set(keys.values())) {
    const word = subjectOf(key)
    const plain = word ?? style.split(key).pop() ?? key
    byLabel.set(plain, [...(byLabel.get(plain) ?? []), key])
  }
  for (const [plain, sharing] of byLabel) {
    if (sharing.length === 1) {
      labels.set(sharing[0], titleCase(plain))
      continue
    }
    for (const key of sharing) {
      const segments = style.split(key)
      let name = titleCase(plain)
      for (let take = 2; take <= segments.length; take++) {
        const candidate = segments.slice(-take).map(titleCase).join(" ")
        name = candidate
        if (sharing.every(other => other === key || !style.split(other).slice(-take).map(titleCase).join(" ").endsWith(candidate))) break
      }
      labels.set(key, name)
    }
  }
}

function titleCase(word: string): string {
  const said = word.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return said.charAt(0).toUpperCase() + said.slice(1)
}

export function suggest(input: SuggestInput, settings: SuggestSettings, taken: ReadonlySet<string> = new Set(), constraints?: Constraints): Suggestion[] {
  const byId = new Map(input.units.map(u => [u.id, u]))
  const clusterOf = new Map<string, string>()
  const labels = new Map<string, string>()
  const weighted = input.pairs.map(p => ({ p, w: pairWeight(p, settings) }))
  const frozenUnits = new Set<string>()
  if (constraints) constraints.placed.forEach((g, id) => { if (constraints.locked.has(g) && byId.has(id)) frozenUnits.add(id) })
  const hasFrozen = (ids: Iterable<string>) => { for (const id of ids) if (frozenUnits.has(id)) return true; return false }

  if (settings.engine === "band") {
    let maxDepth = 1
    input.units.forEach(u => { if (u.depth !== null) maxDepth = Math.max(maxDepth, u.depth) })
    for (const u of input.units) {
      const b = bandKey(u, settings.bandBy, maxDepth)
      if (!b) continue
      clusterOf.set(u.id, b.key)
      labels.set(b.key, b.key.startsWith("lane:") ? (input.laneLabels[b.label] ?? b.label) : b.label)
    }
  } else if (settings.engine === "subject") {
    // The domain axis is read off the names and confirmed against the graph,
    // rather than clustered out of it. Clustering finds whichever axis is
    // strongest, and in a layered codebase that is the layer: measured across
    // six platforms it scored the best modularity of anything tried and the
    // worst domain recovery, and it names nothing, which is where "Group A"
    // came from.
    const ids = input.units.map(u => u.id)
    const style = segmenterFor(ids)
    const { keys, subjects } = domainKeys(
      ids,
      { style, refs: tiesFrom(input.pairs, "references"), moves: tiesFrom(input.pairs, "cochange") },
      new Set(settings.struckSubjects ?? []),
      settings.basis,
    )
    keys.forEach((key, id) => clusterOf.set(id, key))
    nameGroups(keys, labels, style)
    void subjects
  } else if (settings.engine === "role") {
    // The same measurement read from the other end. A subject floats through
    // the names and a role sits still, so where `subject` finds Catalog in
    // four layers this finds every Controllers in one band.
    const ids = input.units.map(u => u.id)
    const style = segmenterFor(ids)
    const { keys } = roleKeys(ids, { style }, new Set(settings.struckSubjects ?? []))
    keys.forEach((key, id) => clusterOf.set(id, key))
    nameGroups(keys, labels, style)
  } else {
    const shared = settings.keepSharedApart ? input.hubs : new Set<string>()
    const ids = input.units.map(u => u.id).filter(id => !shared.has(id))
    const edges = weighted.filter(x => x.w > 0 && !shared.has(x.p.a) && !shared.has(x.p.b)).map(x => ({ a: x.p.a, b: x.p.b, w: x.w }))
    const resolution = 0.6 + Math.min(1, Math.max(0, settings.granularity)) * 1.6
    const initial = constraints ? new Map(Array.from(constraints.placed.entries()).filter(([id]) => !shared.has(id))) : undefined
    louvain(ids, edges, resolution, { initial, frozen: frozenUnits }).forEach((c, id) => clusterOf.set(id, "c:" + c))
    if (shared.size) { shared.forEach(id => clusterOf.set(id, "shared")); labels.set("shared", "Shared") }
    const minUnits = input.grain === "file" ? Math.max(settings.minSize, 2) : settings.minSize
    const membersByCluster = () => { const m = new Map<string, string[]>(); clusterOf.forEach((c, id) => m.set(c, [...(m.get(c) ?? []), id])); return m }
    const medianSize = () => {
      const sizes = Array.from(membersByCluster().entries()).filter(([c, m]) => c !== "shared" && m.length >= minUnits).map(([, m]) => m.length).sort((a, b) => a - b)
      return sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0
    }

    // Balance, part one: a cluster several times the median is cut again on
    // its own edges, at a finer resolution, when that yields real parts.
    if (settings.balance) {
      for (let round = 0; round < 2; round++) {
        const median = medianSize()
        if (!median) break
        let changed = false
        membersByCluster().forEach((ids, c) => {
          if (c === "shared" || hasFrozen(ids) || ids.length < Math.max(3 * median, 2 * minUnits, 6)) return
          const set = new Set(ids)
          const sub = louvain(ids, weighted.filter(x => x.w > 0 && set.has(x.p.a) && set.has(x.p.b)).map(x => ({ a: x.p.a, b: x.p.b, w: x.w })), resolution * 1.6)
          const groups = new Map<number, string[]>()
          sub.forEach((g, id) => groups.set(g, [...(groups.get(g) ?? []), id]))
          if (Array.from(groups.values()).filter(g => g.length >= minUnits).length < 2) return
          groups.forEach((g, k) => g.forEach(id => clusterOf.set(id, `${c}.${k}`)))
          changed = true
        })
        if (!changed) break
      }
    }

    // Balance, part two: clusters below the minimum, or well under the
    // median, fold into their best-connected neighbour.
    const sizes = new Map<string, number>()
    clusterOf.forEach(c => sizes.set(c, (sizes.get(c) ?? 0) + 1))
    const strength = new Map<string, Map<string, number>>()
    const bump = (x: string, y: string, w: number) => { if (!strength.has(x)) strength.set(x, new Map()); strength.get(x)!.set(y, (strength.get(x)!.get(y) ?? 0) + w) }
    for (const { p, w } of weighted) {
      if (w <= 0) continue
      const ca = clusterOf.get(p.a), cb = clusterOf.get(p.b)
      if (!ca || !cb || ca === cb) continue
      bump(ca, cb, w); bump(cb, ca, w)
    }
    const dwarf = settings.balance ? Math.max(minUnits, Math.ceil(0.5 * medianSize())) : minUnits
    const folded = new Map<string, string>()
    const resolve = (c: string): string => { let x = c; while (folded.has(x)) x = folded.get(x)!; return x }
    const frozenClusters = new Set<string>()
    clusterOf.forEach((c, id) => { if (frozenUnits.has(id)) frozenClusters.add(c) })
    Array.from(sizes.entries()).filter(([c, n]) => c !== "shared" && n < dwarf && !frozenClusters.has(c)).sort((a, b) => a[1] - b[1]).forEach(([c]) => {
      let best: string | null = null, bestW = 0
      strength.get(c)?.forEach((w, other) => { const t = resolve(other); if (t !== c && t !== "shared" && w > bestW) { bestW = w; best = t } })
      if (best) { folded.set(c, best); sizes.set(best, (sizes.get(best) ?? 0) + (sizes.get(c) ?? 0)) }
    })
    clusterOf.forEach((c, id) => { const t = resolve(c); if (t !== c) clusterOf.set(id, t); if ((sizes.get(t) ?? 0) < minUnits && t !== "shared") clusterOf.delete(id) })

    // Same story in different corners: clusters that would carry the same
    // rare name ("Auth", "Auth 2", "Auth 3") become one group.
    const byName = new Map<string, string[]>()
    membersByCluster().forEach((ids, c) => {
      if (c === "shared") return
      const t = topToken(ids.map(id => byId.get(id)!), input.idf, 0.5)
      if (t && (input.idf.get(t) ?? 0) >= Math.log(2)) byName.set(t, [...(byName.get(t) ?? []), c])
    })
    byName.forEach(list => {
      if (list.length < 2) return
      const frozenOnes = list.filter(c => frozenClusters.has(c))
      if (frozenOnes.length > 1) return
      const target = frozenOnes[0] ?? list[0]
      const rest = new Set(list.filter(c => c !== target))
      clusterOf.forEach((c, id) => { if (rest.has(c)) clusterOf.set(id, target) })
    })
  }

  // Roll units up to components, splitting a component whose files disagree.
  const perComponent = new Map<string, Map<string, string[]>>()
  clusterOf.forEach((c, id) => {
    const u = byId.get(id)!
    if (!perComponent.has(u.component)) perComponent.set(u.component, new Map())
    const m = perComponent.get(u.component)!
    m.set(c, [...(m.get(c) ?? []), id])
  })
  const parts = new Map<string, SuggestionPart[]>()
  const drawIn = new Map<string, string>()
  const unitCount = new Map<string, number>()
  const addPart = (c: string, part: SuggestionPart, n: number) => { parts.set(c, [...(parts.get(c) ?? []), part]); unitCount.set(c, (unitCount.get(c) ?? 0) + n) }
  perComponent.forEach((clusters, component) => {
    const total = input.filesPerComponent.get(component) ?? 0
    const sorted = Array.from(clusters.entries()).sort((a, b) => b[1].length - a[1].length)
    drawIn.set(component, sorted[0][0])
    if (input.grain === "component") { addPart(sorted[0][0], { component, files: null, total }, 1); return }
    const inUnits = sorted.reduce((s, [, f]) => s + f.length, 0)
    const top = sorted[0]
    const whole = !settings.splitFiles || top[1].length >= 0.8 * Math.max(total, inUnits)
    if (whole) { addPart(top[0], { component, files: null, total }, inUnits); return }
    // Small components split freely; big ones fold slivers under a tenth into the main part.
    const size = Math.max(total, inUnits)
    const minPart = size >= 10 ? Math.max(2, Math.ceil(0.1 * size)) : 1
    const fold: string[] = []
    for (const [c, files] of sorted) {
      if (c !== top[0] && files.length < minPart) { fold.push(...files); continue }
      addPart(c, { component, files: files.slice().sort(), total }, files.length)
    }
    if (fold.length) {
      const tp = parts.get(top[0])!.find(p => p.component === component)!
      tp.files = [...tp.files!, ...fold].sort()
      unitCount.set(top[0], (unitCount.get(top[0]) ?? 0) + fold.length)
    }
  })

  // Reasons: which signals bound each cluster, from its internal pairs.
  const contrib = new Map<string, Map<SignalId, number>>()
  const rawSum = new Map<string, Map<SignalId, number>>()
  for (const { p } of weighted) {
    const ca = clusterOf.get(p.a), cb = clusterOf.get(p.b)
    if (!ca || ca !== cb) continue
    if (!contrib.has(ca)) { contrib.set(ca, new Map()); rawSum.set(ca, new Map()) }
    for (const s of SIGNALS) {
      const v = p.v[s.id]; if (!v) continue
      const m = MULT[settings.weights[s.id]]
      if (m > 0) contrib.get(ca)!.set(s.id, (contrib.get(ca)!.get(s.id) ?? 0) + m * v)
      rawSum.get(ca)!.set(s.id, (rawSum.get(ca)!.get(s.id) ?? 0) + (p.raw[s.id] ?? 0))
    }
  }

  const usedNames = new Set(taken)
  const out: Suggestion[] = []
  let letter = 0
  const clusterIds = Array.from(new Set(clusterOf.values())).filter(c => parts.has(c))
  // A draft group keeps its name and key on the cluster holding most of its units.
  const keyOf = new Map<string, string>()
  if (constraints) {
    const tally = new Map<string, Map<string, number>>()
    constraints.placed.forEach((g, id) => { const c = clusterOf.get(id); if (!c) return; if (!tally.has(g)) tally.set(g, new Map()); tally.get(g)!.set(c, (tally.get(g)!.get(c) ?? 0) + 1) })
    const claimed = new Set<string>()
    Array.from(tally.entries()).map(([g, m]) => { const best = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]; return { g, c: best[0], n: best[1] } }).sort((a, b) => b.n - a.n).forEach(({ g, c }) => {
      if (claimed.has(c)) return
      claimed.add(c)
      keyOf.set(c, g)
      const name = constraints.names.get(g)
      if (name) labels.set(c, name)
    })
  }
  clusterIds.sort((a, b) => (unitCount.get(b) ?? 0) - (unitCount.get(a) ?? 0))
  for (const c of clusterIds) {
    const members = input.units.filter(u => clusterOf.get(u.id) === c)
    const cParts = parts.get(c)!
    const reasons = describe(c, members, contrib.get(c), rawSum.get(c), input, settings)
    let name = labels.get(c) ?? nameFor(members, input, settings, reasons)
    if (!name) { do { name = `Group ${String.fromCharCode(65 + (letter % 26))}${letter >= 26 ? Math.floor(letter / 26) : ""}`; letter++ } while (usedNames.has(name)) }
    const kept = keyOf.has(c) && labels.get(c) === name
    let unique = name, n = 2
    while (!kept && usedNames.has(unique)) unique = `${name} ${n++}`
    usedNames.add(unique)
    out.push({
      key: keyOf.get(c) ?? c, name: unique, parts: cParts,
      components: cParts.map(p => p.component).filter(comp => drawIn.get(comp) === c),
      reasons, units: unitCount.get(c) ?? 0, split: cParts.filter(p => p.files !== null).length,
    })
  }
  return worthProposing(out, input, settings, constraints)
}

/**
 * References between components, whatever the input is made of.
 *
 * `refsOut` is keyed at the grain the engine is clustering, so on a file-grain
 * pass every lookup by component name misses. A gate that asks it about a
 * component therefore saw no references at all, concluded there was nothing to
 * judge, and passed everything: on BroadleafCommerce the Domains pass shipped
 * 91 groups covering 452 of 454 components at modularity 0.143. Rolling the
 * file edges up to their components asks the intended question at both grains.
 */
const componentRefsCache = new WeakMap<SuggestInput, Map<string, Map<string, number>>>()
function componentRefs(input: SuggestInput): Map<string, Map<string, number>> {
  const cached = componentRefsCache.get(input)
  if (cached) return cached
  let out = input.refsOut
  if (input.grain === "file") {
    const componentOf = new Map<string, string>()
    for (const u of input.units) componentOf.set(u.id, u.component)
    out = new Map()
    for (const [from, row] of input.refsOut) {
      const a = componentOf.get(from)
      if (!a) continue
      for (const [to, n] of row) {
        const b = componentOf.get(to)
        if (!b || a === b) continue
        const mine = out.get(a) ?? new Map<string, number>()
        mine.set(b, (mine.get(b) ?? 0) + n)
        out.set(a, mine)
      }
    }
  }
  componentRefsCache.set(input, out)
  return out
}

/**
 * What the engine is willing to put its name to. A first pass that places
 * every component has not finished the job, it has hidden it: on
 * BroadleafCommerce the Domains pass proposed 47 groups covering all 454
 * components, a median group of seven, five groups of three, and kept only
 * 30% of references inside. Refusing the weakest of them doubles both quality
 * measures and hands back what it could not answer.
 *
 * A group someone has already touched is theirs, not a proposal, and is never
 * taken away by this.
 */
export function worthProposing(
  out: Suggestion[],
  input: SuggestInput,
  settings: SuggestSettings,
  constraints?: Constraints,
): Suggestion[] {
  const minKept = settings.minKept ?? 0
  if (minKept <= 0 && settings.minSize <= 1) return out
  const held = constraints ? new Set(constraints.placed.keys()) : new Set<string>()
  const refs = componentRefs(input)

  return out.filter(s => {
    if (s.key === "shared") return true
    if (s.components.some(c => held.has(c))) return true
    // Counted in the things the architect will see in it: contributing
    // components, whole or partial. Not files — eight files of two components
    // is a group of two, and counting them as eight let every group through.
    // Not majority owners either — a layer band holding one controller from
    // each of two components owns neither of them and is still a band of two.
    const members = s.parts.map(p => p.component)
    const size = members.length
    if (size < settings.minSize) return false
    if (minKept <= 0) return true
    // How much of its own referencing stays inside it: the same question the
    // scorecard asks of a finished cut, asked before the cut is offered.
    const mine = new Set(members)
    let inside = 0
    let all = 0
    for (const c of members) {
      for (const [to, n] of refs.get(c) ?? []) {
        if (to === c) continue
        all += n
        if (mine.has(to)) inside += n
      }
    }
    // Nothing to judge it on is not the same as failing: a group whose
    // members reference nothing at all is left to the architect to read.
    return all === 0 ? size >= settings.minSize : inside / all >= minKept
  })
}

function describe(cluster: string, members: Unit[], contrib: Map<SignalId, number> | undefined, raw: Map<SignalId, number> | undefined, input: SuggestInput, settings: SuggestSettings): Reason[] {
  if (cluster === "shared") return [{ signal: "references", text: "referenced from most of the codebase", share: 1 }]
  if (settings.engine === "band") {
    const lane = topLane(members)
    return lane && settings.bandBy === "lanes"
      ? [{ signal: "lanes", text: `same lane ${input.laneLabels[lane] ?? lane}`, share: 1 }]
      : [{ signal: "depth", text: "same depth from the entry points", share: 1 }]
  }
  if (settings.engine === "subject") {
    // Said as it was arrived at: a word the names carry, or a branch of the
    // tree. There are no cluster contributions to report here, and reporting
    // none at all would leave the group with no answer to "why these".
    const word = subjectOf(cluster)
    return [word
      ? { signal: "names", text: `all named ${word}`, share: 1 }
      : { signal: "path", text: "same package tree", share: 1 }]
  }
  if (!contrib) return []
  const total = Array.from(contrib.values()).reduce((s, x) => s + x, 0) || 1
  const top = Array.from(contrib.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return top.map(([signal, value]) => ({ signal, share: value / total, text: reasonText(signal, members, raw?.get(signal) ?? 0, input) }))
}

function reasonText(signal: SignalId, members: Unit[], raw: number, input: SuggestInput): string {
  switch (signal) {
    case "references": return `${Math.round(raw)} references between them`
    case "cochange": return `co-changed ${Math.round(raw)} times`
    case "entities": {
      const count = new Map<string, number>()
      members.forEach(u => u.entities.forEach(e => count.set(e, (count.get(e) ?? 0) + 1)))
      const shared = Array.from(count.values()).filter(n => n >= 2).length
      return `share ${shared} domain type${shared === 1 ? "" : "s"}`
    }
    case "names": { const t = topToken(members, input.idf); return t ? `name “${t}”` : "similar names" }
    case "path": return "same package tree"
    case "lanes": { const lane = topLane(members); return lane ? `same lane ${input.laneLabels[lane] ?? lane}` : "same lane" }
    case "depth": return "same depth from the entry points"
    case "cycles": return "in a cycle together"
    case "authors": { const a = topAuthors(members, 2); return a.length ? `same authors: ${a.join(", ")}` : "same authors" }
  }
}

// Words that describe a role or a count, never a domain: they still count as
// signals but never name a group.
const NAME_STOP = new Set(["controller", "controllers", "service", "services", "repository", "repositories", "repo", "entity", "entities", "dto", "dtos", "model", "models", "config", "configuration", "helper", "helpers", "handler", "handlers", "manager", "factory", "client", "clients", "mapper", "validator", "validation", "exception", "exceptions", "resource", "resources", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "data", "domain", "shared", "web", "rest", "http", "spring", "jpa", "junit", "mock", "mocks", "resources"])

function topToken(members: Unit[], idf: Map<string, number>, coverage = 0.4): string | null {
  const score = new Map<string, { n: number; w: number }>()
  // Tokens in more than half of every unit (the project's own name, say) never name a group.
  members.forEach(u => u.tokens.forEach(t => { if (NAME_STOP.has(t) || (idf.get(t) ?? 0) < Math.log(2)) return; const s = score.get(t) ?? { n: 0, w: idf.get(t) ?? 0 }; s.n++; score.set(t, s) }))
  let best: string | null = null, bestScore = 0
  score.forEach((s, t) => { if (s.n >= Math.max(2, coverage * members.length)) { const v = s.n * s.w; if (v > bestScore) { bestScore = v; best = t } } })
  return best
}
function topLane(members: Unit[]): string | null {
  const c = new Map<string, number>()
  members.forEach(u => { if (u.lane) c.set(u.lane, (c.get(u.lane) ?? 0) + 1) })
  return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
function topAuthors(members: Unit[], n: number): string[] {
  const c = new Map<string, number>()
  members.forEach(u => u.authors.forEach(a => c.set(a, (c.get(a) ?? 0) + 1)))
  return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0])
}

function nameFor(members: Unit[], input: SuggestInput, settings: SuggestSettings, reasons: Reason[]): string | null {
  const ownership = settings.weights.authors >= 1 && settings.weights.authors >= Math.max(...SIGNALS.map(s => settings.weights[s.id]))
  if (ownership) { const a = topAuthors(members, 1)[0]; if (a) return a }
  const t = topToken(members, input.idf)
  if (t) return t.charAt(0).toUpperCase() + t.slice(1)
  if (reasons[0]?.signal === "lanes") { const lane = topLane(members); if (lane) return input.laneLabels[lane] ?? lane }
  return null
}

export interface Placement { key: string; score: number; reason: string }

/**
 * For every unit not in `placed`, the draft group it has the strongest
 * affinity with, and the signal that carries most of it. Nothing placed moves.
 */
export function placeRest(input: SuggestInput, settings: SuggestSettings, placed: Map<string, string>): Map<string, Placement> {
  const sums = new Map<string, Map<string, { w: number; by: Map<SignalId, number> }>>()
  const bump = (id: string, key: string, p: Pair) => {
    if (!sums.has(id)) sums.set(id, new Map())
    const m = sums.get(id)!
    const e = m.get(key) ?? { w: 0, by: new Map() }
    for (const sig of SIGNALS) { const v = p.v[sig.id]; if (!v) continue; const w = MULT[settings.weights[sig.id]] * v; e.w += w; if (w > 0) e.by.set(sig.id, (e.by.get(sig.id) ?? 0) + w) }
    m.set(key, e)
  }
  for (const p of input.pairs) {
    const ga = placed.get(p.a), gb = placed.get(p.b)
    if (ga && !gb) bump(p.b, ga, p)
    else if (gb && !ga) bump(p.a, gb, p)
  }
  const byId = new Map(input.units.map(u => [u.id, u]))
  const out = new Map<string, Placement>()
  sums.forEach((m, id) => {
    let best: string | null = null, bestW = 0, bestBy: Map<SignalId, number> | null = null
    m.forEach((e, key) => { if (e.w > bestW) { bestW = e.w; best = key; bestBy = e.by } })
    if (!best || !bestBy) return
    const top = Array.from((bestBy as Map<SignalId, number>).entries()).sort((a, b) => b[1] - a[1])[0]
    const u = byId.get(id)
    out.set(id, { key: best, score: bestW, reason: top && u ? reasonText(top[0], [u], 0, input).replace(/^0 references between them$/, "references") : "affinity" })
  })
  return out
}
