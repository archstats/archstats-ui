// Editor support for the query language: colour and suggestions.
//
// Kept apart from `query.ts`, which is the language itself. The language must
// not care that anything is typing it; this file exists only so a person can
// see the shape of what they wrote and be told what the codebase actually
// contains — which is the whole difference between a text box and something
// that teaches you the codebase while you compose.

import { globToRegExp, type UnitKind } from "~/utils/query"

// ── Colour ───────────────────────────────────────────────────────────────

export type TokenKind =
  | "comment"   // a switched-off line
  | "bang"      // the ! that subtracts
  | "keyword"   // where, and
  | "metric"
  | "op"
  | "number"
  | "glob"      // * ** ?
  | "sep"       // the delimiter between segments
  | "text"

export interface Token { text: string; kind: TokenKind }

const KEYWORDS = /^(where|and)$/i

/**
 * One line, split for colour.
 *
 * The point is not decoration: `*` and `**` mean different things and look
 * nearly identical, a `!` at the start reverses a line's meaning, and a `#`
 * makes the whole line do nothing. Those three are exactly what a reader
 * misses in a monospace row, so those three are what gets a colour.
 */
export function highlight(line: string, sep = "."): Token[] {
  const out: Token[] = []
  const push = (text: string, kind: TokenKind) => { if (text) out.push({ text, kind }) }

  const lead = line.match(/^\s*/)?.[0] ?? ""
  push(lead, "text")
  let rest = line.slice(lead.length)
  if (!rest) return out

  if (rest.startsWith("#")) { push(rest, "comment"); return out }
  if (rest.startsWith("!")) { push("!", "bang"); rest = rest.slice(1) }

  // Everything up to a bare `where` is a pattern; after it, conditions.
  const at = rest.search(/\swhere\s/i)
  const pattern = at < 0 ? rest : rest.slice(0, at)
  const conds = at < 0 ? "" : rest.slice(at)

  pushPattern(pattern, sep, push)

  if (conds) {
    for (const piece of conds.split(/(\s+)/)) {
      if (!piece.trim()) { push(piece, "text"); continue }
      if (KEYWORDS.test(piece)) push(piece, "keyword")
      else if (/^(>=|<=|!=|>|<|=)$/.test(piece)) push(piece, "op")
      else if (/^-?\d+(\.\d+)?$/.test(piece)) push(piece, "number")
      else pushCond(piece, push)
    }
  }
  return out
}

/** A bare keyword is a keyword; the same letters inside a name are not. */
function pushPattern(text: string, sep: string, push: (t: string, k: TokenKind) => void) {
  if (/^(components?|files?)$/i.test(text.trim())) { push(text, "keyword"); return }
  let buf = ""
  let i = 0
  const flush = () => { push(buf, "text"); buf = "" }
  while (i < text.length) {
    if (text.startsWith("**", i)) { flush(); push("**", "glob"); i += 2; continue }
    if (text[i] === "*" || text[i] === "?") { flush(); push(text[i], "glob"); i += 1; continue }
    if (sep && text.startsWith(sep, i)) { flush(); push(sep, "sep"); i += sep.length; continue }
    if (text[i] === "/") { flush(); push("/", "sep"); i += 1; continue }
    buf += text[i]
    i += 1
  }
  flush()
}

/** `lines>2000` written without spaces still reads as three things. */
function pushCond(piece: string, push: (t: string, k: TokenKind) => void) {
  const m = piece.match(/^([A-Za-z_][\w.]*)(>=|<=|!=|>|<|=)?(-?[\d.]+)?$/)
  if (!m) { push(piece, "text"); return }
  push(m[1], "metric")
  if (m[2]) push(m[2], "op")
  if (m[3]) push(m[3], "number")
}

// ── Suggestions ──────────────────────────────────────────────────────────

export type SuggestionKind = "package" | "file" | "metric" | "value" | "start" | "recent" | "group"

export interface Suggestion {
  /** What the row shows. */
  label: string
  /** The count or explanation on the right. */
  detail?: string
  /** The text that replaces the token being typed. */
  insert: string
  kind: SuggestionKind
  /** Put the caret here inside `insert` instead of at its end. */
  caret?: number
}

export interface AssistWorld {
  components: string[]
  files: string[]
  sep: string
  /** Metric id → label and one-line description, from `_metric_definitions`. */
  metrics?: Array<{ id: string; label: string; hint?: string }>
  /** Every value of one metric, for showing where a threshold actually falls. */
  valuesOf?: (metric: string, kind: UnitKind) => number[]
  recents?: string[]
  saved?: Array<{ name: string; query: string }>
}

export interface Assist {
  items: Suggestion[]
  /** The slice of the line that accepting a suggestion replaces. */
  from: number
  to: number
}

const EMPTY: Assist = { items: [], from: 0, to: 0 }

/**
 * What to offer for one line, given where the caret is.
 *
 * Everything here answers a question the architect would otherwise have to
 * leave the app to answer: what packages exist, what this codebase measures,
 * and whether 2,000 lines is large *here*. A completion list that only
 * repeated the syntax would be documentation in a costume.
 */
export function assist(line: string, caret: number, world: AssistWorld): Assist {
  const before = line.slice(0, caret)
  const trimmed = line.trim()

  if (trimmed.startsWith("#")) return EMPTY

  // Nothing typed yet: say what a line can be, rather than what it must look
  // like. The three entry points are the whole grammar a person needs.
  if (!trimmed) {
    const items: Suggestion[] = [
      { label: "a package", detail: "everything under it", insert: "", kind: "start" },
      { label: "a file path", detail: "src/**/*.java", insert: "", kind: "start" },
      { label: "a measurement", detail: "components where …", insert: "components where ", kind: "start" },
    ]
    for (const q of (world.recents ?? []).slice(0, 5)) items.push({ label: q.split("\n")[0], detail: "recent", insert: q, kind: "recent" })
    for (const g of (world.saved ?? []).slice(0, 5)) items.push({ label: g.name, detail: "saved group", insert: g.query, kind: "group" })
    return { items, from: caret, to: caret }
  }

  const whereAt = before.search(/\swhere\s/i)
  if (whereAt >= 0) return assistCondition(line, caret, before.slice(whereAt), world)

  return assistName(line, caret, world)
}

/** The next segment of a name, and how much of the codebase is under it. */
function assistName(line: string, caret: number, world: AssistWorld): Assist {
  const before = line.slice(0, caret)
  const start = before.search(/[^\s!]*$/)
  const token = before.slice(start)
  if (token.startsWith("#")) return EMPTY

  const isPath = token.includes("/")
  const sep = isPath ? "/" : world.sep
  const pool = isPath ? world.files : world.components

  // Once a wildcard has been typed, the architect has said something we
  // cannot finish for them, and guessing at the literal prefix behind it
  // would offer completions for a part they have already moved past.
  if (/[*?]/.test(token)) return EMPTY
  const prefix = token

  const cut = prefix.lastIndexOf(sep)
  const stem = cut < 0 ? "" : prefix.slice(0, cut + sep.length)
  const partial = prefix.slice(stem.length).toLowerCase()

  const under = new Map<string, number>()
  for (const id of pool) {
    if (stem && !id.startsWith(stem)) continue
    const tail = id.slice(stem.length)
    if (!tail) continue
    const next = tail.split(sep)[0]
    if (!next || !next.toLowerCase().startsWith(partial)) continue
    under.set(next, (under.get(next) ?? 0) + 1)
  }

  const word = isPath ? "file" : "component"
  const items: Suggestion[] = Array.from(under, ([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 40)
    .flatMap(({ name, n }) => {
      const exact = stem + name
      const kind = isPath ? ("file" as const) : ("package" as const)
      const rows: Suggestion[] = []
      // Two visibly different accepts, because "shipdoc" and "everything
      // under shipdoc" are different questions and both get asked. The exact
      // row says what IT would match — one thing — rather than borrowing the
      // count of everything beneath it, which would be a lie by proximity.
      if (pool.includes(exact)) rows.push({ label: exact, detail: `this one`, insert: exact, kind })
      const all = exact + sep + "**"
      if (n > 1 || !pool.includes(exact)) {
        rows.push({ label: all, detail: `${n} ${n === 1 ? word : word + "s"}`, insert: all, kind })
      }
      return rows
    })

  return { items, from: start, to: caret }
}

/** Metric names, then where a threshold would actually fall. */
function assistCondition(line: string, caret: number, clause: string, world: AssistWorld): Assist {
  const before = line.slice(0, caret)
  const kind: UnitKind = /^\s*files?\b/i.test(line.trim()) ? "file" : "component"

  // After an operator: offer the distribution, so a number is chosen rather
  // than guessed. "Is 2,000 lines big?" is a question about this codebase.
  const op = clause.match(/([A-Za-z_][\w.]*)\s*(>=|<=|!=|>|<|=)\s*([\d.]*)$/)
  if (op) {
    const values = world.valuesOf?.(op[1], kind) ?? []
    if (!values.length) return EMPTY
    const sorted = [...values].sort((a, b) => a - b)
    const at = (q: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))]
    const marks: Array<[string, number]> = [
      ["median", at(0.5)], ["top quarter", at(0.75)], ["top tenth", at(0.9)], ["largest", sorted[sorted.length - 1]],
    ]
    const seen = new Set<number>()
    const items = marks
      .filter(([, v]) => Number.isFinite(v) && !seen.has(v) && (seen.add(v), true))
      .map(([label, v]) => {
        const rounded = Math.round(v)
        const over = sorted.filter(x => x > rounded).length
        return { label: String(rounded), detail: `${label} · ${over} above`, insert: String(rounded), kind: "value" as const }
      })
    const start = before.length - (op[3]?.length ?? 0)
    return { items, from: start, to: caret }
  }

  // Otherwise a metric name. Names and descriptions come from the snapshot,
  // so an extension that adds a metric extends the suggestions.
  const m = before.match(/[\w.]*$/)
  const typed = (m?.[0] ?? "").toLowerCase()
  const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
  const items = (world.metrics ?? [])
    // Prefix, not substring: `li` must not reach "Efferent Coup-li-ng", or
    // the list stops being predictable the moment it gets long.
    .filter(d => !typed || d.id.toLowerCase().startsWith(typed) || words(d.label).some(w => w.startsWith(typed)))
    .slice(0, 40)
    .map(d => ({ label: d.id, detail: d.hint ? `${d.label} · ${d.hint}` : d.label, insert: d.id + " > ", kind: "metric" as const }))
  return { items, from: before.length - typed.length, to: caret }
}

/** Replace the slice a suggestion covers, and say where the caret lands. */
export function applySuggestion(line: string, assisted: Assist, pick: Suggestion): { line: string; caret: number } {
  const next = line.slice(0, assisted.from) + pick.insert + line.slice(assisted.to)
  return { line: next, caret: assisted.from + (pick.caret ?? pick.insert.length) }
}

/** Whether a line adds nothing the rest of the query does not already hold. */
export function coveredBy(line: string, others: string[], ids: string[], sep: string): number | null {
  const bare = line.trim().replace(/^!/, "")
  if (!bare || bare.startsWith("#") || /\swhere\s/i.test(bare)) return null
  const mine = ids.filter(id => globToRegExp(bare, sep).test(id))
  if (!mine.length) return null
  for (let i = 0; i < others.length; i++) {
    const other = others[i].trim()
    if (!other || other === bare || other.startsWith("!") || other.startsWith("#") || /\swhere\s/i.test(other)) continue
    const rx = globToRegExp(other, sep)
    if (mine.every(id => rx.test(id))) return i
  }
  return null
}
