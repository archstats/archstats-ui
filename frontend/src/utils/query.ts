// What belongs in a group, said in text.
//
// A group used to be a list of ids, which is a snapshot of a decision rather
// than the decision itself: rename a package and the list silently loses its
// members, over exactly the months the architect is watching for drift. A
// query cannot rot quietly — a line that stops matching is a line that says
// so, which is the whole reason this exists.
//
//   line   := ["!"] source ["where" cond {"and" cond}]
//   source := <glob> | "components" | "files" | "contains" <text>
//   cond   := <metric> [op number]        // bare metric means "> 0"
//   op     := >  >=  <  <=  =  !=
//
// Lines union; "!" lines subtract. "where" intersects, inside one line. That
// split is the design: people enumerate with OR ("shipdoc, booking, mail")
// and qualify with AND ("the big ones"), so one flat boolean language would
// need parentheses and precedence, and a group would become a program
// instead of a description.
//
// Not called a rule. Every rule this audience knows — lint, firewall, CI —
// fires and blocks. This describes a set and governs nothing.

import { detectSeparator } from "~/utils/studio"

export type UnitKind = "component" | "file"
export type Op = ">" | ">=" | "<" | "<=" | "=" | "!="

/** `components where lines > 2000`: the part after `where`. */
export interface Cond {
  metric: string
  op: Op
  value: number
}

/** Where a line starts from, before `where` narrows it. */
export type Source =
  | { kind: "glob"; pattern: string }
  /** The bare keywords, for a line that asks only a question about metrics. */
  | { kind: "all"; unit: UnitKind }
  /** Files whose source holds the text (any case), and the components they sit in. */
  | { kind: "contains"; needle: string }

export interface Line {
  /** Line numbers are 1-based and count blank and comment lines, so that an
   *  error or an "empty" report points at the text the architect is looking at. */
  no: number
  raw: string
  exclude: boolean
  source: Source
  conds: Cond[]
}

export interface QueryError {
  no: number
  raw: string
  message: string
}

export interface Query {
  lines: Line[]
  errors: QueryError[]
}

// ── Parsing ──────────────────────────────────────────────────────────────

const OPS: Op[] = [">=", "<=", "!=", ">", "<", "="]

/**
 * Never throws. A half-typed query is the normal state of a query — the
 * editor re-parses on every keystroke — so an unfinished line becomes an
 * error the editor can show next to the line, and the lines around it still
 * match and still preview.
 */
export function parseQuery(text: string): Query {
  const lines: Line[] = []
  const errors: QueryError[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const no = i + 1
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith("#")) return

    const exclude = trimmed.startsWith("!")
    const body = (exclude ? trimmed.slice(1) : trimmed).trim()
    if (!body) {
      errors.push({ no, raw, message: "nothing to exclude" })
      return
    }

    const [head, ...rest] = splitKeyword(body, "where")
    if (rest.length > 1) {
      errors.push({ no, raw, message: "only one `where` per line" })
      return
    }

    const source = parseSource(head.trim())
    if (!source) {
      errors.push({ no, raw, message: `\`${head.trim()}\` is not a pattern` })
      return
    }

    const conds: Cond[] = []
    if (rest.length === 1) {
      const clauses = splitKeyword(rest[0], "and")
      for (const clause of clauses) {
        const cond = parseCond(clause.trim())
        if (!cond) {
          errors.push({ no, raw, message: `\`${clause.trim()}\` is not a condition` })
          return
        }
        conds.push(cond)
      }
    }

    lines.push({ no, raw, exclude, source, conds })
  })

  return { lines, errors }
}

/**
 * Splits on a bare word, not on the letters. Without this, a perfectly good
 * component called `com.example.warehouse` loses its tail to the `where` that
 * is not there.
 */
function splitKeyword(text: string, word: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\s${word}\\s`, "gi")
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index))
    last = m.index + m[0].length
    re.lastIndex = last
  }
  out.push(text.slice(last))
  return out
}

function parseSource(text: string): Source | null {
  if (!text) return null
  const contains = /^contains\s+(?:"([^"]+)"|(\S+))$/i.exec(text)
  if (contains) return { kind: "contains", needle: contains[1] ?? contains[2] }
  const word = text.toLowerCase()
  if (word === "components" || word === "component") return { kind: "all", unit: "component" }
  if (word === "files" || word === "file") return { kind: "all", unit: "file" }
  if (/\s/.test(text)) return null
  return { kind: "glob", pattern: text }
}

function parseCond(text: string): Cond | null {
  if (!text) return null
  for (const op of OPS) {
    const at = text.indexOf(op)
    if (at <= 0) continue
    const metric = text.slice(0, at).trim()
    const rhs = text.slice(at + op.length).trim()
    // `Number("")` is 0, so a half-typed `lines >` would parse as `lines > 0`
    // and quietly match everything while the architect is still typing.
    if (!rhs) return null
    const value = Number(rhs)
    if (!metric || !Number.isFinite(value)) return null
    return { metric, op, value }
  }
  // A metric on its own asks whether there is any of it at all, which is how
  // "has controllers" and "is in a cycle" want to be written.
  if (/\s/.test(text)) return null
  return { metric: text, op: ">", value: 0 }
}

// ── Globbing ─────────────────────────────────────────────────────────────

/**
 * A glob, compiled for one separator.
 *
 * `*` stays inside a segment and `**` crosses them, which is the convention
 * everyone already knows from file paths — transposed onto whatever delimiter
 * the codebase uses for components, because a Java package, a PHP namespace
 * and a C++ scope are the same idea with different punctuation.
 *
 * `a.**` matches `a` itself as well as everything under it. "Everything under
 * shipdoc" plainly includes shipdoc, and a rule that needs two lines to say
 * one obvious thing is a rule people will get wrong.
 */
export function globToRegExp(pattern: string, sep: string): RegExp {
  const s = escapeRe(sep)
  // `::` is a separator too, and `[^::]` is a character class of one colon
  // rather than "not a scope break", so anything but a single character needs
  // a tempered dot instead.
  const notSep = sep.length === 1 ? `[^${escapeClass(sep)}]` : `(?:(?!${s}).)`
  let out = ""
  let i = 0

  while (i < pattern.length) {
    const rest = pattern.slice(i)

    // The separator belongs to the wildcard, so it is optional along with it.
    // At the end that makes `a.**` match `a` — "everything under shipdoc"
    // plainly includes shipdoc, and a pattern needing two lines to say one
    // obvious thing is one people will get wrong. In the middle it makes
    // `a.**.b` match `a.b`, because the separator that follows is written out
    // by the next pass round this loop.
    if (rest.startsWith(sep + "**")) {
      out += `(?:${s}.*)?`
      i += sep.length + 2
      continue
    }
    if (i === 0 && rest.startsWith("**" + sep)) {
      out += `(?:.*${s})?`
      i = 2 + sep.length
      continue
    }
    if (rest.startsWith("**")) {
      out += ".*"
      i += 2
      continue
    }
    if (rest.startsWith("*")) {
      out += `${notSep}*`
      i += 1
      continue
    }
    if (rest.startsWith("?")) {
      out += notSep
      i += 1
      continue
    }
    out += escapeRe(pattern[i])
    i += 1
  }

  return new RegExp(`^${out}$`)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const escapeClass = (s: string) => s.replace(/[\]\\^-]/g, "\\$&")

// ── Evaluation ───────────────────────────────────────────────────────────

/** The snapshot a query runs against. */
export interface QueryWorld {
  components: string[]
  files: string[]
  /**
   * The delimiter component names use here. Detected rather than assumed:
   * the same query text has to read naturally over `.`, `::`, `\` and `/`.
   */
  componentSep?: string
  /**
   * One number about one unit, or undefined when this snapshot does not
   * measure it. Undefined is not zero — a missing metric must not quietly
   * satisfy `< 10`.
   */
  metric?: (kind: UnitKind, id: string, metric: string) => number | undefined
  /**
   * What holds a text, or undefined while the code is still being searched.
   * Defaults to the lookup the app provides (see provideContains).
   */
  contains?: ContainsLookup
}

export type ContainsLookup = (needle: string) => { components: Set<string>; files: Set<string> } | undefined

let providedContains: ContainsLookup | null = null

/** The app's code search, for `contains` lines; kept out of this module so it stays pure. */
export function provideContains(lookup: ContainsLookup | null) {
  providedContains = lookup
}

export interface QueryResult {
  components: string[]
  files: string[]
  /** Unit id → the line that put it in. */
  matchedBy: Map<string, number>
  /** Unit id → the line that took it out, for units an include line had found. */
  excludedBy: Map<string, number>
  /**
   * Lines that matched nothing. After a re-scan this is the drift alarm: a
   * list of ids would have dropped its members in silence.
   */
  empty: number[]
  /** `contains` lines still waiting on the code search: neither empty nor answered. */
  pending?: number[]
}

const EMPTY_RESULT: QueryResult = { components: [], files: [], matchedBy: new Map(), excludedBy: new Map(), empty: [] }

export function runQuery(query: Query, world: QueryWorld | null | undefined): QueryResult {
  // A toolbar can render before the snapshot it queries has loaded; nothing
  // to search yet is an empty result, not a crash on every route.
  if (query.lines.length === 0 || !world) return { ...EMPTY_RESULT, matchedBy: new Map(), excludedBy: new Map(), empty: [] }

  const sep = world.componentSep || detectSeparator(world.components)
  const compiled = new Map<string, RegExp>()
  const re = (pattern: string, s: string) => {
    const key = s + "\u0000" + pattern
    let r = compiled.get(key)
    if (!r) { r = globToRegExp(pattern, s); compiled.set(key, r) }
    return r
  }

  const contains = world.contains ?? providedContains
  const pending: number[] = []

  /** Which units one line finds, before anything else is taken away; null while a search runs. */
  const hits = (line: Line): { components: string[]; files: string[] } | null => {
    if (line.source.kind === "contains") {
      const found = contains?.(line.source.needle)
      if (!found) return null
      return {
        components: world.components.filter(id => found.components.has(id) && passes(line.conds, "component", id, world)),
        files: world.files.filter(id => found.files.has(id) && passes(line.conds, "file", id, world)),
      }
    }
    const wants = (kind: UnitKind) =>
      line.source.kind === "all" ? line.source.unit === kind : true
    const pattern = line.source.kind === "glob" ? line.source.pattern : null

    const pick = (kind: UnitKind, ids: string[], s: string) => {
      if (!wants(kind)) return []
      // A component pattern and a file pattern live in different id spaces,
      // so one text box needs no prefixes: `com.fedex.qp.order.**` cannot
      // match a path, and `repos/*/src/**` cannot match a package.
      const rx = pattern === null ? null : re(pattern, s)
      const out: string[] = []
      for (const id of ids) {
        if (rx && !rx.test(id)) continue
        if (!passes(line.conds, kind, id, world)) continue
        out.push(id)
      }
      return out
    }

    return { components: pick("component", world.components, sep), files: pick("file", world.files, "/") }
  }

  const components = new Set<string>()
  const files = new Set<string>()
  const matchedBy = new Map<string, number>()
  const excludedBy = new Map<string, number>()
  const empty: number[] = []

  const includes = query.lines.filter(l => !l.exclude)
  const excludes = query.lines.filter(l => l.exclude)

  for (const line of includes) {
    const found = hits(line)
    if (!found) { pending.push(line.no); continue }
    if (found.components.length === 0 && found.files.length === 0) empty.push(line.no)
    for (const id of found.components) { if (!components.has(id)) matchedBy.set(id, line.no); components.add(id) }
    for (const id of found.files) { if (!files.has(id)) matchedBy.set(id, line.no); files.add(id) }
  }

  // Exclusions apply last, wherever they sit in the text. The moment line
  // order decides the answer, reordering becomes a hidden mechanic and nobody
  // can read a query and know what it does.
  for (const line of excludes) {
    const found = hits(line)
    if (!found) { pending.push(line.no); continue }
    let removed = 0
    for (const id of found.components) if (components.delete(id)) { excludedBy.set(id, line.no); matchedBy.delete(id); removed++ }
    for (const id of found.files) if (files.delete(id)) { excludedBy.set(id, line.no); matchedBy.delete(id); removed++ }
    if (removed === 0) empty.push(line.no)
  }

  return {
    components: Array.from(components),
    files: Array.from(files),
    matchedBy,
    excludedBy,
    empty: empty.sort((a, b) => a - b),
    pending,
  }
}

function passes(conds: Cond[], kind: UnitKind, id: string, world: QueryWorld): boolean {
  if (conds.length === 0) return true
  if (!world.metric) return false
  for (const c of conds) {
    const v = world.metric(kind, id, c.metric)
    // A metric this snapshot does not carry fails rather than passes: a query
    // about size must not quietly include everything because nothing was
    // measured.
    if (v === undefined) return false
    switch (c.op) {
      case ">": if (!(v > c.value)) return false; break
      case ">=": if (!(v >= c.value)) return false; break
      case "<": if (!(v < c.value)) return false; break
      case "<=": if (!(v <= c.value)) return false; break
      case "=": if (v !== c.value) return false; break
      case "!=": if (v === c.value) return false; break
    }
  }
  return true
}

// ── What kind of thing a query is ────────────────────────────────────────

/**
 * A query that asks only about names answers the same way until someone
 * renames something; one that asks about metrics answers differently every
 * scan. The difference decides whether a group is a decision or a finding,
 * and the architect is asked rather than defaulted — so the app has to be
 * able to tell them apart.
 */
/**
 * What a search starts as, with the caret between the two pairs.
 *
 * The grammar's cheapest useful question is "does the name contain this",
 * and writing it means remembering to fence the word on both sides. Starting
 * empty made the first keystroke produce `c` — a query for a component named
 * exactly "c", matching nothing — so the box answered zero until you knew
 * the syntax. Starting fenced makes plain typing do the obvious thing, and
 * the stars are right there to delete when you want an anchored pattern.
 */
export const SEARCH_SEED = "****"
/** Where the caret belongs in it. */
export const SEARCH_SEED_CARET = 2

/**
 * A query that asks nothing: empty, or nothing but wildcards.
 *
 * `****` left behind by opening the box and closing it again is not a filter
 * anybody set, and leaving it active would put a view into a filtered state
 * that matches everything and offers a clear button for it.
 */
export function isBlankQuery(text: string): boolean {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  return lines.length === 0 || lines.every(l => /^\*+$/.test(l))
}

export function isLive(query: Query): boolean {
  return query.lines.some(l => l.conds.length > 0 || l.source.kind === "contains")
}

/** Whether this text is only literal ids: what a hand-picked selection looks like. */
export function isLiteral(query: Query): boolean {
  return query.lines.every(l => l.source.kind === "glob" && !/[*?]/.test(l.source.pattern) && l.conds.length === 0)
}

/** A selection, written as the query that would find exactly it. */
export function literalQuery(ids: Iterable<string>): string {
  return Array.from(ids).join("\n")
}

// ── Selection → query ────────────────────────────────────────────────────

export interface Generalised {
  /** The query text: include lines first, then any exclusions. */
  text: string
  /** Include terms, in the order they were chosen. */
  terms: string[]
  /** Literal ids a pattern had to take out to stay exact. */
  exclusions: string[]
  /** Members no pattern covered, written out as themselves. */
  literals: string[]
  /** Whether the result matches the selection and nothing else. */
  exact: boolean
}

/**
 * The shortest patterns that describe a set, and nothing outside it.
 *
 * This is the bridge between the two halves of the product. The engine and
 * the pointer both produce sets of ids; the architect wants intent. Turning
 * fourteen ids into `com.fedex.qp.booking.**` plus two exceptions is the
 * difference between a group that decays on the next rename and one that
 * explains itself in March.
 *
 * Greedy set cover over the prefixes and trailing roles the members
 * themselves suggest. A pattern is only taken if it catches nothing outside
 * the selection, unless the trade is plainly worth it — several more members
 * for one or two exclusions — because an exclusion a person has to read is a
 * cost, not a free repair.
 */
export function generalise(
  ids: Iterable<string>,
  universe: Iterable<string>,
  sep: string,
  options: { maxTerms?: number } = {},
): Generalised {
  const maxTerms = options.maxTerms ?? 8
  const members = Array.from(new Set(ids))
  const all = Array.from(universe)
  const inside = new Set(members)
  const outsiders = all.filter(id => !inside.has(id))
  if (members.length === 0) return { text: "", terms: [], exclusions: [], literals: [], exact: true }

  // Only patterns the members themselves suggest: an ancestor of one of them,
  // or the role at the end of one of them. Anything else would be a guess.
  const candidates = new Set<string>()
  for (const id of members) {
    const parts = id.split(sep)
    for (let i = 1; i < parts.length; i++) candidates.add(parts.slice(0, i).join(sep) + sep + "**")
    if (parts.length > 1) candidates.add("**" + sep + parts[parts.length - 1])
  }

  const scored = Array.from(candidates).map(pattern => {
    const rx = globToRegExp(pattern, sep)
    return {
      pattern,
      covers: members.filter(id => rx.test(id)),
      catches: outsiders.filter(id => rx.test(id)),
    }
  }).filter(c => c.covers.length > 1)

  const uncovered = new Set(members)
  const terms: string[] = []
  const exclusions = new Set<string>()

  while (uncovered.size > 0 && terms.length < maxTerms) {
    let best: { pattern: string; gain: number; catches: string[] } | null = null
    for (const c of scored) {
      if (terms.includes(c.pattern)) continue
      const gain = c.covers.reduce((n, id) => n + (uncovered.has(id) ? 1 : 0), 0)
      if (gain === 0) continue
      const cost = c.catches.filter(id => !exclusions.has(id)).length
      // One line plus two exceptions still reads; one line plus nine is a
      // list wearing a pattern's clothes, and the list is more honest.
      if (cost > 2 || cost >= gain) continue
      const better = !best
        || gain - cost > best.gain
        || (gain - cost === best.gain && c.pattern.length < best.pattern.length)
      if (better) best = { pattern: c.pattern, gain: gain - cost, catches: c.catches }
    }
    if (!best) break
    terms.push(best.pattern)
    for (const id of best.catches) exclusions.add(id)
    const rx = globToRegExp(best.pattern, sep)
    for (const id of Array.from(uncovered)) if (rx.test(id)) uncovered.delete(id)
  }

  const literals = Array.from(uncovered)
  const lines = [...terms, ...literals, ...Array.from(exclusions, id => "!" + id)]
  return {
    text: lines.join("\n"),
    terms,
    exclusions: Array.from(exclusions),
    literals,
    exact: true,
  }
}
