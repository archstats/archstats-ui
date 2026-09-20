// Finding the components whose files disagree with each other.
//
// A component is torn when its files answer the dimension's question two
// different ways. `org.broadleafcommerce.common.time` is the clearest example
// in the Broadleaf snapshot: five of its nine files are BroadleafEnumerationType
// implementations that import the common module, and the other four are the
// TimeSource machinery that imports almost nothing. The enums and the clock,
// filed together because they share a word in the package name.
//
// WHAT THE SCORE IS. Not a "tearness" heuristic that we then hope correlates
// with better cuts — that is how a detector ends up proposing splits for their
// own sake. The score IS the measure of the cut:
//
//     an edge (file, component) is kept in proportion to the share of that
//     component's files sitting in the file's own group.
//
// A whole component contributes 1 or 0, so on an unsplit cut this is the
// ordinary "references that stay inside a group". Splitting is scored by what
// it does to that number and nothing else, so a split that does not improve
// the cut scores nothing and is never offered.
//
// The rule is also self-limiting, which is what stops the search running away:
// dividing a component dilutes every edge pointing AT it, so splitting
// something many others depend on costs more than it pays. A detector scored
// only on outgoing edges would happily shred the codebase.
//
// WHAT IT REFUSES. Measured on Broadleaf against the package tree, the guards
// below refuse between 58% and 72% of the components they consider, and the
// refusals are the point: held-out against git co-change, the stricter the
// guard the higher the hit rate (89% of splits beat their own null at a
// minimum part of three against a coarse partition, against 70% at two).
// See tasks/desktop-shell-plan.md for the full table.

export interface TearInput {
  /** Every component's files. A component with one file cannot be torn. */
  filesOf: Map<string, string[]>
  /** file → the components it imports, and how often. */
  importsOf: Map<string, Map<string, number>>
  /** component → the group holding it. Components with no group take no part. */
  groupOf: Map<string, string>
}

export interface Tear {
  component: string
  /** The group it sits in now, and the one its minority leans towards. */
  home: string
  rival: string
  leaving: string[]
  staying: string[]
  /** What this split adds to the share of references kept inside a group. */
  gain: number
  /** That same gain as a count: references that stop crossing a boundary. */
  moved: number
}

export type RefusalReason =
  /** Its files all want the same thing: there is no line to draw. */
  | "agreed"
  /** One side would be a handful of files: an exception, not a structure. */
  | "sliver"
  /** A real line, but drawing it does not improve the cut. */
  | "no gain"
  /**
   * Most of it wants to be somewhere else, which is not a tear at all — the
   * component is in the wrong group, and the honest answer is to move it.
   */
  | "misplaced"

export interface TearOptions {
  /** Neither side of a split may be smaller than this. */
  minPart?: number
  /** How much a split must add to be worth offering, in share of references. */
  minGain?: number
  /** Stop after this many, strongest first. */
  limit?: number
}

const DEFAULTS = { minPart: 3, minGain: 0.0005, limit: 25 }

/**
 * Past this, the minority is not the part leaving — two thirds of a component
 * wanting out is a component in the wrong group, and offering to "split" it
 * dresses a misplacement up as a design.
 *
 * Measured on Broadleaf rather than picked. A bare majority rule refuses too
 * much: it throws away common.time, which splits five to four and is the
 * best-validated tear in the snapshot (0% of its co-change crosses the line,
 * against 56% by chance). At twice, only the genuinely lopsided go — 22 files
 * of 26 leaving — and the held-out hit rate rises from 45/63 to 45/60 while
 * in-sample gain falls only from 7.87 points to 6.47.
 */
const MISPLACED_RATIO = 2

/** Every import reference the measure is a share of. */
export function totalWeight(input: TearInput, owners: Map<string, string> = ownersOf(input)): number {
  let total = 0
  for (const [file, row] of input.importsOf) {
    const owner = owners.get(file)
    if (owner === undefined) continue
    for (const [t, w] of row) if (input.filesOf.has(t) && t !== owner) total += w
  }
  return total
}

/** file → the component that holds it. Built once; the measure runs often. */
export function ownersOf(input: TearInput): Map<string, string> {
  const m = new Map<string, string>()
  for (const [c, files] of input.filesOf) for (const f of files) m.set(f, c)
  return m
}

/**
 * The share of all import references that stay inside one group, with the
 * given splits applied. Whole components and split ones are priced by the
 * same rule, so the two arms of any comparison are the same measurement.
 */
export function keptInside(
  input: TearInput,
  splits: Map<string, Set<string>> = new Map(),
  rivalOf: Map<string, string> = new Map(),
  owners: Map<string, string> = ownersOf(input),
): number {
  const groupOfFile = (file: string, owner: string) => {
    const leaving = splits.get(owner)
    return leaving?.has(file) ? rivalOf.get(owner)! : input.groupOf.get(owner)
  }
  const shareIn = (target: string, group: string | undefined) => {
    const files = input.filesOf.get(target)
    if (!files || files.length === 0) return 0
    const leaving = splits.get(target)
    if (!leaving) return input.groupOf.get(target) === group ? 1 : 0
    const here = group === rivalOf.get(target) ? leaving.size : group === input.groupOf.get(target) ? files.length - leaving.size : 0
    return here / files.length
  }

  let inside = 0
  let total = 0
  for (const [file, row] of input.importsOf) {
    const owner = owners.get(file)
    if (owner === undefined) continue
    const g = groupOfFile(file, owner)
    for (const [t, w] of row) {
      if (!input.filesOf.has(t) || t === owner) continue
      total += w
      if (g !== undefined) inside += w * shareIn(t, g)
    }
  }
  return total > 0 ? inside / total : 0
}

/**
 * The line one component would be cut along: its files' strongest single
 * rival group, and which of them lean to it. Two parts, never more — a
 * component divided five ways is not a design, and the studio would have no
 * honest way to draw it.
 *
 * A file with nothing to say stays home. Silence is not a vote to leave.
 */
export function proposeTear(input: TearInput, component: string): { home: string; rival: string; leaving: string[]; staying: string[] } | null {
  const files = input.filesOf.get(component)
  const home = input.groupOf.get(component)
  if (!files || files.length < 2 || home === undefined) return null

  const votes = new Map<string, Map<string, number>>()
  const rivalWeight = new Map<string, number>()
  for (const f of files) {
    const row = new Map<string, number>()
    for (const [t, w] of input.importsOf.get(f) ?? []) {
      const g = input.groupOf.get(t)
      if (g === undefined || t === component) continue
      row.set(g, (row.get(g) ?? 0) + w)
      if (g !== home) rivalWeight.set(g, (rivalWeight.get(g) ?? 0) + w)
    }
    votes.set(f, row)
  }

  let rival: string | null = null
  let best = 0
  for (const [g, w] of rivalWeight) if (w > best) { best = w; rival = g }
  if (rival === null) return null

  const leaving: string[] = []
  const staying: string[] = []
  for (const f of files) {
    const row = votes.get(f)!
    ;((row.get(rival) ?? 0) > (row.get(home) ?? 0) ? leaving : staying).push(f)
  }
  if (leaving.length === 0 || staying.length === 0) return null
  return { home, rival, leaving, staying }
}

/**
 * What splitting one component would be worth, measured against the cut as it
 * stands right now. This is the question a person is actually asking when
 * they look at a row — "if I do this, what does it buy?" — so nothing here
 * chains off other splits the engine might also like. It is also what makes
 * the detector affordable in a live studio: scoring the twenty members of the
 * group you have open costs a fraction of scoring all four hundred.
 */
export function scoreTear(
  input: TearInput,
  component: string,
  options: TearOptions = {},
  owners: Map<string, string> = ownersOf(input),
  baseline?: number,
): { tear: Tear | null; refused: RefusalReason | null } {
  const { minPart, minGain } = { ...DEFAULTS, ...options }
  const files = input.filesOf.get(component)
  if (!files || files.length < minPart * 2 || !input.groupOf.has(component)) return { tear: null, refused: null }

  const line = proposeTear(input, component)
  if (!line) return { tear: null, refused: "agreed" }
  if (Math.min(line.leaving.length, line.staying.length) < minPart) return { tear: null, refused: "sliver" }
  if (line.leaving.length >= MISPLACED_RATIO * line.staying.length) return { tear: null, refused: "misplaced" }

  const before = baseline ?? keptInside(input, new Map(), new Map(), owners)
  const after = keptInside(input, new Map([[component, new Set(line.leaving)]]), new Map([[component, line.rival]]), owners)
  const gain = after - before
  if (gain <= minGain) return { tear: null, refused: "no gain" }
  return { tear: { component, ...line, gain, moved: Math.round(gain * totalWeight(input, owners)) }, refused: null }
}

/** The same question asked of a handful of components, strongest first. */
export function tearsAmong(input: TearInput, components: Iterable<string>, options: TearOptions = {}): Tear[] {
  const owners = ownersOf(input)
  const baseline = keptInside(input, new Map(), new Map(), owners)
  const out: Tear[] = []
  for (const c of components) {
    const { tear } = scoreTear(input, c, options, owners, baseline)
    if (tear) out.push(tear)
  }
  return out.sort((a, b) => b.gain - a.gain)
}

/**
 * Every split worth offering, strongest first, with the ones refused and why.
 * Greedy and order-dependent by design: each candidate is scored against the
 * splits already accepted, so two components that only look torn because of
 * each other do not both get offered.
 */
export function findTears(input: TearInput, options: TearOptions = {}): { tears: Tear[]; refused: Map<string, RefusalReason> } {
  const { minPart, minGain, limit } = { ...DEFAULTS, ...options }
  const refused = new Map<string, RefusalReason>()
  const tears: Tear[] = []

  const owners = ownersOf(input)
  const total = totalWeight(input, owners)
  const splits = new Map<string, Set<string>>()
  const rivalOf = new Map<string, string>()
  let current = keptInside(input, splits, rivalOf, owners)

  // Biggest first: a component with more files has more to say, and an
  // accepted split there changes the ground the next candidate is judged on.
  const order = [...input.filesOf.keys()]
    .filter(c => (input.filesOf.get(c)?.length ?? 0) >= minPart * 2 && input.groupOf.has(c))
    .sort((a, b) => input.filesOf.get(b)!.length - input.filesOf.get(a)!.length)

  for (const c of order) {
    const line = proposeTear(input, c)
    if (!line) { refused.set(c, "agreed"); continue }
    if (Math.min(line.leaving.length, line.staying.length) < minPart) { refused.set(c, "sliver"); continue }
    // A tear is a minority leaving; see MISPLACED_RATIO.
    if (line.leaving.length >= MISPLACED_RATIO * line.staying.length) { refused.set(c, "misplaced"); continue }

    splits.set(c, new Set(line.leaving))
    rivalOf.set(c, line.rival)
    const after = keptInside(input, splits, rivalOf, owners)
    const gain = after - current
    if (gain > minGain) {
      tears.push({ component: c, home: line.home, rival: line.rival, leaving: line.leaving, staying: line.staying, gain, moved: Math.round(gain * total) })
      current = after
    } else {
      splits.delete(c)
      rivalOf.delete(c)
      refused.set(c, "no gain")
    }
  }

  tears.sort((a, b) => b.gain - a.gain)
  return { tears: tears.slice(0, limit), refused }
}
