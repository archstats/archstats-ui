// SQL as the editor reads it: tokens for highlighting, the scope at the
// caret (which tables and aliases are in play, CTEs and subqueries
// included), completions that fit the clause being written, the signature of
// the function the caret is in, and diagnostics placed on the token they are
// about. SQLite's dialect, read-only statements; no parser generator, just
// enough structure to know where the writer is.

import { fuzzyScore } from "~/utils/fuzzy"

// ── Tokens ────────────────────────────────────────────────────────────────

export type SqlTokenKind = "keyword" | "ident" | "quoted" | "string" | "number" | "comment" | "op" | "punct" | "param" | "space"

export interface SqlToken {
    kind: SqlTokenKind
    text: string
    start: number
    end: number
    /** A string, quoted identifier or block comment with no end. */
    open?: boolean
}

export const KEYWORDS = new Set(`
    ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT BEFORE BEGIN BETWEEN BY
    CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE
    CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP
    EACH ELSE END ESCAPE EXCEPT EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FILTER FIRST FOLLOWING FOR FOREIGN FROM
    FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY INNER INSERT
    INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH MATERIALIZED NATURAL NO NOT NOTHING
    NOTNULL NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY
    RAISE RANGE RECURSIVE REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK
    ROW ROWS SAVEPOINT SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER UNBOUNDED UNION UNIQUE
    UPDATE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT TRUE FALSE
`.trim().split(/\s+/))

/**
 * Words the grammar needs as keywords only where a clause begins; elsewhere
 * they are fair column names (the rules table has "from" and "to" quoted,
 * but "key", "value" and "kind" appear bare).
 */
const SOFT = new Set(["KEY", "ACTION", "NO", "FIRST", "LAST", "ROW", "ROWS", "RANGE", "PLAN", "QUERY", "TEMP", "ALWAYS", "OTHERS", "TIES", "DO", "NOTHING", "DATABASE", "COLUMN", "REPLACE", "IF", "FILTER", "GROUPS", "VIEW", "TRUE", "FALSE"])

export function tokenize(src: string): SqlToken[] {
    const out: SqlToken[] = []
    let i = 0
    const n = src.length
    const push = (kind: SqlTokenKind, start: number, end: number, open?: boolean) => out.push({ kind, text: src.slice(start, end), start, end, ...(open ? { open } : {}) })
    while (i < n) {
        const c = src[i]
        const s = i
        if (/\s/.test(c)) { while (i < n && /\s/.test(src[i])) i++; push("space", s, i); continue }
        if (c === "-" && src[i + 1] === "-") { while (i < n && src[i] !== "\n") i++; push("comment", s, i); continue }
        if (c === "/" && src[i + 1] === "*") {
            const e = src.indexOf("*/", i + 2)
            i = e < 0 ? n : e + 2
            push("comment", s, i, e < 0)
            continue
        }
        if (c === "'" || c === '"' || c === "`" || c === "[") {
            const close = c === "[" ? "]" : c
            i++
            let closed = false
            while (i < n) {
                if (src[i] === close) {
                    if (close !== "]" && src[i + 1] === close) { i += 2; continue }
                    i++; closed = true; break
                }
                i++
            }
            push(c === "'" ? "string" : "quoted", s, i, !closed)
            continue
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
            if (c === "0" && /[xX]/.test(src[i + 1] ?? "")) { i += 2; while (i < n && /[0-9a-fA-F]/.test(src[i])) i++ }
            else {
                while (i < n && /[0-9_]/.test(src[i])) i++
                if (src[i] === "." ) { i++; while (i < n && /[0-9_]/.test(src[i])) i++ }
                if (/[eE]/.test(src[i] ?? "") && /[-+0-9]/.test(src[i + 1] ?? "")) { i += 2; while (i < n && /[0-9]/.test(src[i])) i++ }
            }
            push("number", s, i)
            continue
        }
        if (/[A-Za-z_\u0080-￿]/.test(c)) {
            while (i < n && /[A-Za-z0-9_$\u0080-￿]/.test(src[i])) i++
            push(KEYWORDS.has(src.slice(s, i).toUpperCase()) ? "keyword" : "ident", s, i)
            continue
        }
        if (c === "?" || ((c === ":" || c === "@" || c === "$") && /[A-Za-z_]/.test(src[i + 1] ?? ""))) {
            i++
            while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++
            push("param", s, i)
            continue
        }
        const two = src.slice(i, i + 2)
        if (["||", "<=", ">=", "<>", "!=", "==", "<<", ">>", "->"].includes(two)) { i += 2; if (two === "->" && src[i] === ">") i++; push("op", s, i); continue }
        if ("+-*/%<>=&|~!".includes(c)) { i++; push("op", s, i); continue }
        i++
        push("punct", s, i)
    }
    return out
}

/** An identifier's name: unquoted, case kept. */
export function identName(t: SqlToken): string {
    if (t.kind !== "quoted") return t.text
    const inner = t.text.slice(1, t.open ? undefined : -1)
    const q = t.text[0]
    return q === "[" ? inner : inner.split(q + q).join(q)
}
const isName = (t: SqlToken | undefined) => !!t && (t.kind === "ident" || t.kind === "quoted" || (t.kind === "keyword" && SOFT.has(t.text.toUpperCase())))
const kw = (t: SqlToken | undefined, ...words: string[]) => !!t && t.kind === "keyword" && words.includes(t.text.toUpperCase())

// ── Schema ────────────────────────────────────────────────────────────────

export interface SqlColumn { name: string; type: string }
export interface SqlTable { name: string; columns: SqlColumn[]; view?: boolean }

export interface SqlSchema {
    tables: SqlTable[]
    /** A metric's name and definition, when the snapshot defines it. */
    describe?: (column: string) => { name: string; short: string } | null
}

/** Columns SQLite's table-valued functions yield. */
const TABLE_FUNCTIONS: Record<string, string[]> = {
    pragma_table_info: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
    json_each: ["key", "value", "type", "atom", "id", "parent", "fullkey", "path"],
    json_tree: ["key", "value", "type", "atom", "id", "parent", "fullkey", "path"],
}

// ── Functions ─────────────────────────────────────────────────────────────

export interface SqlFunction { name: string; args: string[]; doc: string; aggregate?: boolean; window?: boolean }

export const FUNCTIONS: SqlFunction[] = [
    { name: "count", args: ["X"], doc: "Rows in the group; count(X) skips nulls, count(*) counts every row, count(DISTINCT X) each value once.", aggregate: true },
    { name: "sum", args: ["X"], doc: "The sum of the non-null values; null when there are none.", aggregate: true },
    { name: "total", args: ["X"], doc: "The sum as a float; 0.0 when there are no values.", aggregate: true },
    { name: "avg", args: ["X"], doc: "The mean of the non-null values.", aggregate: true },
    { name: "min", args: ["X", "…"], doc: "With one argument, the smallest value in the group; with several, the smallest of them.", aggregate: true },
    { name: "max", args: ["X", "…"], doc: "With one argument, the largest value in the group; with several, the largest of them.", aggregate: true },
    { name: "group_concat", args: ["X", "separator"], doc: "The non-null values joined into one string, comma-separated unless told otherwise.", aggregate: true },
    { name: "coalesce", args: ["X", "Y", "…"], doc: "The first argument that is not null." },
    { name: "ifnull", args: ["X", "Y"], doc: "X, or Y when X is null." },
    { name: "nullif", args: ["X", "Y"], doc: "Null when X equals Y, otherwise X. nullif(x, 0) keeps a zero out of a division." },
    { name: "iif", args: ["condition", "then", "else"], doc: "then when the condition holds, else otherwise." },
    { name: "abs", args: ["X"], doc: "The absolute value." },
    { name: "round", args: ["X", "digits"], doc: "X rounded to so many digits after the point (0 by default)." },
    { name: "length", args: ["X"], doc: "Characters in a string, bytes in a blob." },
    { name: "lower", args: ["X"], doc: "The string in lower case." },
    { name: "upper", args: ["X"], doc: "The string in upper case." },
    { name: "substr", args: ["X", "start", "length"], doc: "Part of a string, from a 1-based start; a negative start counts from the end." },
    { name: "instr", args: ["X", "Y"], doc: "Where Y first appears in X, 1-based; 0 when it does not." },
    { name: "replace", args: ["X", "Y", "Z"], doc: "X with every Y replaced by Z." },
    { name: "trim", args: ["X", "characters"], doc: "X without leading and trailing spaces (or the characters given)." },
    { name: "ltrim", args: ["X", "characters"], doc: "X without leading spaces (or the characters given)." },
    { name: "rtrim", args: ["X", "characters"], doc: "X without trailing spaces (or the characters given)." },
    { name: "printf", args: ["format", "…"], doc: "A string built from a format, as in C: printf('%.1f%%', share * 100)." },
    { name: "typeof", args: ["X"], doc: "The storage class: null, integer, real, text or blob." },
    { name: "cast", args: ["X AS type"], doc: "X converted: CAST(x AS INTEGER), CAST(x AS REAL), CAST(x AS TEXT)." },
    { name: "date", args: ["time", "modifier", "…"], doc: "The date, YYYY-MM-DD: date(commit_time), date('now', '-90 days')." },
    { name: "datetime", args: ["time", "modifier", "…"], doc: "The date and time, YYYY-MM-DD HH:MM:SS." },
    { name: "julianday", args: ["time", "modifier", "…"], doc: "Days since noon, 24 November 4714 BC: subtract two to get days between." },
    { name: "strftime", args: ["format", "time", "modifier", "…"], doc: "A date formatted: strftime('%Y-%m', commit_time) for months." },
    { name: "unixepoch", args: ["time", "modifier", "…"], doc: "Seconds since 1970-01-01." },
    { name: "json_extract", args: ["json", "path"], doc: "A value from JSON text: json_extract(value, '$.name')." },
    { name: "random", args: [], doc: "A random 64-bit integer; ORDER BY random() shuffles." },
    { name: "row_number", args: [], doc: "The row's number in its window: row_number() OVER (PARTITION BY … ORDER BY …).", window: true },
    { name: "rank", args: [], doc: "The rank in the window, with gaps after ties.", window: true },
    { name: "dense_rank", args: [], doc: "The rank in the window, without gaps.", window: true },
    { name: "percent_rank", args: [], doc: "(rank − 1) / (rows − 1) in the window, from 0 to 1.", window: true },
    { name: "ntile", args: ["N"], doc: "Which of N near-equal buckets the row falls in.", window: true },
    { name: "lag", args: ["X", "offset", "default"], doc: "X from a row before, in the window's order.", window: true },
    { name: "lead", args: ["X", "offset", "default"], doc: "X from a row after, in the window's order.", window: true },
    { name: "first_value", args: ["X"], doc: "X at the first row of the window frame.", window: true },
    { name: "last_value", args: ["X"], doc: "X at the last row of the window frame.", window: true },
    { name: "pragma_table_info", args: ["table"], doc: "A table's columns as rows: cid, name, type, notnull, dflt_value, pk." },
    { name: "json_each", args: ["json", "path"], doc: "The elements of a JSON array or object, one row each." },
]
const FUNCTION_BY_NAME = new Map(FUNCTIONS.map(f => [f.name, f]))

// ── Structure ─────────────────────────────────────────────────────────────

/** Something a query reads from: a table, a CTE, a subquery or a table-valued function, by the name it goes by. */
export interface SqlSource {
    /** The name the query uses for it: its alias, or its own name. */
    name: string
    /** The schema table, when it is one. */
    table?: string
    /** Known columns; null when they cannot be told. */
    columns: string[] | null
    kind: "table" | "cte" | "subquery" | "function"
    /** The name as written, for diagnostics. */
    token?: SqlToken
}

interface Group { open: number; close: number; depth: number }

/** A token list without spaces and comments, with bracket pairs matched. */
function significant(tokens: SqlToken[]) {
    const sig = tokens.filter(t => t.kind !== "space" && t.kind !== "comment")
    const pair = new Map<number, number>()
    const depth: number[] = []
    const stack: number[] = []
    sig.forEach((t, i) => {
        if (t.text === "(") { depth.push(stack.length); stack.push(i); return }
        if (t.text === ")") { const o = stack.pop(); depth.push(stack.length); if (o !== undefined) { pair.set(o, i); pair.set(i, o) } return }
        depth.push(stack.length)
    })
    return { sig, pair, depth }
}

const CLAUSE_END = new Set(["WHERE", "GROUP", "ORDER", "LIMIT", "HAVING", "WINDOW", "UNION", "EXCEPT", "INTERSECT", "ON", "USING", "RETURNING", "OFFSET"])
const JOIN_WORDS = new Set(["JOIN", "LEFT", "RIGHT", "FULL", "INNER", "OUTER", "CROSS", "NATURAL"])

export interface SqlAnalysis {
    tokens: SqlToken[]
    ctes: SqlSource[]
    /** Sources of each query block, by the index of its SELECT. */
    blocks: Array<{ select: number; from: number; to: number; sources: SqlSource[]; projection: string[] }>
    sig: SqlToken[]
    depth: number[]
    pair: Map<number, number>
}

export function analyze(src: string, schema: SqlSchema): SqlAnalysis {
    const tokens = tokenize(src)
    const { sig, pair, depth } = significant(tokens)
    const tableByName = new Map(schema.tables.map(t => [t.name.toLowerCase(), t]))
    const ctes: SqlSource[] = []
    const blocks: SqlAnalysis["blocks"] = []

    // The end of the block a SELECT at index i starts: its closing bracket, a set operator at its depth, or the end.
    const blockEnd = (i: number) => {
        for (let j = i + 1; j < sig.length; j++) {
            if (depth[j] < depth[i]) return j - 1
            if (sig[j].text === ";" && depth[j] === depth[i]) return j - 1
        }
        return sig.length - 1
    }

    function projection(select: number, end: number, sources: SqlSource[]): string[] {
        const out: string[] = []
        let i = select + 1
        if (kw(sig[i], "DISTINCT", "ALL")) i++
        let itemStart = i
        const d = depth[select]
        const flush = (to: number) => {
            if (to < itemStart) return
            const item = sig.slice(itemStart, to + 1)
            const asAt = item.findIndex((t, k) => kw(t, "AS") && depth[itemStart + k] === d)
            const last = item[item.length - 1]
            if (asAt >= 0 && item[asAt + 1]) out.push(identName(item[asAt + 1]))
            else if (last?.text === "*") {
                const q = item.length >= 3 && item[item.length - 2].text === "." ? identName(item[item.length - 3]).toLowerCase() : null
                for (const s of sources) if (!q || s.name.toLowerCase() === q) out.push(...(s.columns ?? []))
            } else if (last && isName(last)) out.push(identName(last)) // a column, alias.column, or an alias without AS
        }
        for (; i <= end; i++) {
            if (depth[i] !== d) continue
            if (kw(sig[i], "FROM") || kw(sig[i], ...CLAUSE_END)) { flush(i - 1); return out }
            if (sig[i].text === ",") { flush(i - 1); itemStart = i + 1 }
        }
        flush(end)
        return out
    }

    function sourcesOf(select: number, end: number): SqlSource[] {
        const d = depth[select]
        const out: SqlSource[] = []
        let from = -1
        for (let j = select + 1; j <= end; j++) if (depth[j] === d && kw(sig[j], "FROM")) { from = j; break }
        if (from < 0) return out
        let expect = true
        for (let j = from + 1; j <= end; j++) {
            if (depth[j] !== d) continue
            const t = sig[j]
            if (kw(t, ...CLAUSE_END)) {
                if (kw(t, "ON", "USING")) { expect = false; continue } // a join condition; the next JOIN reopens
                break
            }
            if (t.text === "," || kw(t, "JOIN")) { expect = true; continue }
            if (kw(t, ...JOIN_WORDS)) continue
            if (!expect) continue
            let src: SqlSource | null = null
            let next = j + 1
            if (t.text === "(" && pair.has(j)) {
                const close = pair.get(j)!
                const inner = sig.findIndex((x, k) => k > j && k < close && kw(x, "SELECT"))
                const cols = inner >= 0 ? projection(inner, close - 1, sourcesOf(inner, close - 1)) : null
                src = { name: "", columns: cols, kind: "subquery" }
                next = close + 1
            } else if (isName(t)) {
                let name = identName(t)
                let tok = t
                if (sig[j + 1]?.text === "." && isName(sig[j + 2])) { name = identName(sig[j + 2]); tok = sig[j + 2]; next = j + 3 }
                const lower = name.toLowerCase()
                if (sig[next]?.text === "(" && pair.has(next)) {
                    src = { name, columns: TABLE_FUNCTIONS[lower] ?? null, kind: "function", token: tok }
                    next = pair.get(next)! + 1
                } else {
                    const cte = ctes.find(c => c.name.toLowerCase() === lower)
                    const table = tableByName.get(lower)
                    src = cte
                        ? { name, columns: cte.columns, kind: "cte", token: tok }
                        : { name, table: table?.name ?? name, columns: table ? table.columns.map(c => c.name) : null, kind: "table", token: tok }
                }
            }
            if (!src) continue
            // An alias, with or without AS.
            let a = next
            if (kw(sig[a], "AS")) a++
            if (sig[a] && isName(sig[a]) && depth[a] === d && !kw(sig[a], ...CLAUSE_END, ...JOIN_WORDS)) { src.name = identName(sig[a]); j = a } else j = next - 1
            out.push(src)
            expect = false
        }
        return out
    }

    // CTEs: WITH name [(columns)] AS ( ... ), ...
    for (let i = 0; i < sig.length; i++) {
        if (!kw(sig[i], "WITH")) continue
        let j = i + 1
        if (kw(sig[j], "RECURSIVE")) j++
        while (j < sig.length && isName(sig[j])) {
            const name = identName(sig[j])
            let cols: string[] | null = null
            j++
            if (sig[j]?.text === "(" && pair.has(j)) {
                const close = pair.get(j)!
                cols = sig.slice(j + 1, close).filter(isName).map(identName)
                j = close + 1
            }
            if (kw(sig[j], "AS")) j++
            if (kw(sig[j], "NOT")) j++
            if (kw(sig[j], "MATERIALIZED")) j++
            if (sig[j]?.text !== "(" || !pair.has(j)) break
            const close = pair.get(j)!
            const inner = sig.findIndex((x, k) => k > j && k < close && kw(x, "SELECT"))
            if (!cols && inner >= 0) cols = projection(inner, close - 1, sourcesOf(inner, close - 1))
            ctes.push({ name, columns: cols, kind: "cte", token: sig[i + 1] })
            j = close + 1
            if (sig[j]?.text !== ",") break
            j++
        }
    }

    sig.forEach((t, i) => {
        if (!kw(t, "SELECT")) return
        const end = blockEnd(i)
        const sources = sourcesOf(i, end)
        blocks.push({ select: i, from: t.start, to: sig[end]?.end ?? t.end, sources, projection: projection(i, end, sources) })
    })
    // Subqueries named in FROM get their alias through the parse above; blocks keep their own.
    return { tokens, ctes, blocks, sig, depth, pair }
}

/** The query block the offset is in: the innermost SELECT whose bracket holds it. */
function blockAt(a: SqlAnalysis, offset: number) {
    let best: SqlAnalysis["blocks"][number] | null = null
    for (const b of a.blocks) {
        const d = a.depth[b.select]
        // The block's extent is its bracket (or the statement) at its depth.
        let lo = 0, hi = Infinity
        for (let k = b.select; k >= 0; k--) if (a.depth[k] < d && a.sig[k].text === "(") { lo = a.sig[k].end; hi = a.pair.has(k) ? a.sig[a.pair.get(k)!].start : Infinity; break }
        const startsBefore = a.sig[b.select].start <= offset || lo <= offset
        if (offset >= lo && offset <= hi && startsBefore && (!best || a.depth[b.select] >= a.depth[best.select])) {
            if (best && a.depth[b.select] === a.depth[best.select] && a.sig[b.select].start > offset) continue
            best = b
        }
    }
    return best
}

/** Every source visible at the offset: its own block's, then the blocks around it (correlated), then CTEs. */
export function scopeAt(a: SqlAnalysis, offset: number): SqlSource[] {
    const own = blockAt(a, offset)
    const out: SqlSource[] = [...(own?.sources ?? [])]
    for (const b of a.blocks) {
        if (b === own || !own) continue
        if (a.depth[b.select] < a.depth[own.select] && b.from <= offset && b.to >= offset) out.push(...b.sources)
    }
    if (!own) for (const b of a.blocks) if (a.depth[b.select] === 0) out.push(...b.sources)
    return out.filter(s => s.name)
}

// ── Completion ────────────────────────────────────────────────────────────

export type CompletionKind = "table" | "column" | "metric" | "function" | "keyword" | "value" | "source" | "snippet"

export interface Completion {
    kind: CompletionKind
    label: string
    /** What goes in; the label when absent. */
    insert?: string
    /** Where the caret lands inside the insert, from its start; the end when absent. */
    caret?: number
    /** A short note beside the label: a type, a metric's name, the table. */
    detail?: string
    /** The documentation pane. */
    doc?: { title: string; body?: string; meta?: string[] }
    score: number
    /** Label positions the query matched, for emphasis. */
    matches?: number[]
}

export type Clause = "start" | "select" | "from" | "join-on" | "where" | "group" | "having" | "order" | "limit" | "with" | "other"

export interface CompletionContext {
    /** Where the typed word starts and ends: what a pick replaces. */
    from: number
    to: number
    prefix: string
    clause: Clause
    /** Inside a string that compares with a column: the column and the table it reads from. */
    value?: { column: string; table: string | null; closeQuote: boolean }
    /** After "alias.": that source. */
    qualifier?: SqlSource | null
    /** Right after FROM, JOIN or a comma in FROM: a table goes here. */
    wantsTable: boolean
    /** A comment, a number, or right after a table (where its alias goes). */
    quiet: boolean
    sources: SqlSource[]
    projection: string[]
}

const IDENT_CH = /[A-Za-z0-9_$]/

export function contextAt(src: string, caret: number, schema: SqlSchema, analysis?: SqlAnalysis): CompletionContext {
    const a = analysis ?? analyze(src, schema)
    const tok = a.tokens.find(t => t.start < caret && caret <= t.end) ?? null
    let from = caret, to = caret
    while (from > 0 && IDENT_CH.test(src[from - 1])) from--
    while (to < src.length && IDENT_CH.test(src[to])) to++
    const base: CompletionContext = { from, to, prefix: src.slice(from, caret), clause: "other", wantsTable: false, quiet: false, sources: scopeAt(a, caret), projection: blockAt(a, caret)?.projection ?? [] }

    if (tok && tok.kind === "comment") return { ...base, quiet: true }
    if (tok && tok.kind === "number") return { ...base, quiet: true }
    if (tok && tok.kind === "quoted" && caret < tok.end + (tok.open ? 1 : 0) && caret > tok.start) {
        // A quoted identifier being typed: complete inside the quotes.
        return { ...base, from: tok.start + 1, to: tok.open ? tok.end : tok.end - 1, prefix: src.slice(tok.start + 1, caret), clause: clauseAt(a, caret) }
    }
    if (tok && tok.kind === "string" && caret > tok.start && (tok.open || caret < tok.end)) {
        const sigIdx = a.sig.indexOf(tok)
        const column = comparedColumn(a, sigIdx)
        if (!column) return { ...base, quiet: true }
        const src2 = resolveColumn(column.name, column.qualifier, base.sources, schema)
        return {
            ...base, from: tok.start + 1, to: tok.open ? tok.end : tok.end - 1, prefix: src.slice(tok.start + 1, caret), clause: clauseAt(a, caret),
            value: { column: column.name, table: src2, closeQuote: !!tok.open },
        }
    }

    // The significant token before the word being typed.
    const before = a.sig.filter(t => t.end <= from)
    const prev = before[before.length - 1]
    const prev2 = before[before.length - 2]
    if (prev?.text === "." && prev.end === from && prev2 && isName(prev2)) {
        const q = identName(prev2).toLowerCase()
        const s = base.sources.find(x => x.name.toLowerCase() === q) ?? null
        const table = s ?? (() => { const t = schema.tables.find(x => x.name.toLowerCase() === q); return t ? { name: t.name, table: t.name, columns: t.columns.map(c => c.name), kind: "table" as const } : null })()
        return { ...base, clause: clauseAt(a, from), qualifier: table }
    }
    const clause = clauseAt(a, from)
    const wantsTable = kw(prev, "FROM", "JOIN") || (clause === "from" && prev?.text === ",")
    return { ...base, clause, wantsTable }
}

function clauseAt(a: SqlAnalysis, offset: number): Clause {
    const block = blockAt(a, offset)
    const idx = a.sig.findIndex(t => t.start >= offset)
    const upto = idx < 0 ? a.sig.length : idx
    const d = block ? a.depth[block.select] : 0
    // Brackets opened before the offset and still open put it at a deeper level.
    let level = 0
    for (let i = 0; i < upto; i++) if (a.sig[i].text === "(" && (!a.pair.has(i) || a.sig[a.pair.get(i)!].start >= offset)) level = a.depth[i] + 1
    for (let i = upto - 1; i >= 0; i--) {
        const t = a.sig[i]
        if (a.depth[i] !== d && a.depth[i] !== level) continue
        if (t.kind !== "keyword") continue
        const w = t.text.toUpperCase()
        if (w === "SELECT") return "select"
        if (w === "FROM" || JOIN_WORDS.has(w)) return "from"
        if (w === "ON" || w === "USING") return "join-on"
        if (w === "WHERE") return "where"
        if (w === "BY") { const p = a.sig[i - 1]?.text.toUpperCase(); if (p === "GROUP") return "group"; if (p === "ORDER") return "order"; if (p === "PARTITION") return "select" }
        if (w === "HAVING") return "having"
        if (w === "LIMIT" || w === "OFFSET") return "limit"
        if (w === "WITH") return "with"
    }
    return upto === 0 || !block ? "start" : "other"
}

/** The column a string at sig index i is compared with: col = '…', col LIKE '…', col IN ('…', '…'). */
function comparedColumn(a: SqlAnalysis, i: number): { name: string; qualifier: string | null } | null {
    let j = i - 1
    // Inside an IN list, walk back over earlier items to the IN.
    if (a.sig[j]?.text === "," || a.sig[j]?.text === "(") {
        let k = j
        while (k >= 0 && a.sig[k].text !== "(") k--
        if (k < 0 || !kw(a.sig[k - 1], "IN")) return null
        j = k - 2
        if (kw(a.sig[j], "NOT")) j--
    } else {
        const op = a.sig[j]
        if (!op || !(["=", "==", "!=", "<>", "<", ">", "<=", ">="].includes(op.text) || kw(op, "LIKE", "GLOB", "IS"))) return null
        j--
        if (kw(a.sig[j], "NOT")) j--
    }
    const col = a.sig[j]
    if (!col || !isName(col)) return null
    const qualifier = a.sig[j - 1]?.text === "." && a.sig[j - 2] ? identName(a.sig[j - 2]) : null
    return { name: identName(col), qualifier }
}

/** The schema table a column is read from, given the sources in scope. */
export function resolveColumn(column: string, qualifier: string | null, sources: SqlSource[], schema: SqlSchema): string | null {
    const lc = column.toLowerCase()
    const pool = qualifier ? sources.filter(s => s.name.toLowerCase() === qualifier.toLowerCase()) : sources
    for (const s of pool) if (s.kind === "table" && s.table && s.columns?.some(c => c.toLowerCase() === lc)) return s.table
    if (qualifier) { const t = schema.tables.find(x => x.name.toLowerCase() === qualifier.toLowerCase()); if (t) return t.name }
    if (!pool.length) {
        const t = schema.tables.find(x => x.columns.some(c => c.name.toLowerCase() === lc))
        return t?.name ?? null
    }
    return null
}

const needsQuotes = (name: string) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || (KEYWORDS.has(name.toUpperCase()) && !SOFT.has(name.toUpperCase()))
export const quoteIdent = (name: string) => (needsQuotes(name) ? `"${name.replace(/"/g, '""')}"` : name)

/** Where a query's letters fall in a label, for emphasis. */
export function matchPositions(query: string, label: string): number[] {
    const q = query.toLowerCase()
    const l = label.toLowerCase()
    if (!q) return []
    const at = l.indexOf(q)
    if (at >= 0) return Array.from({ length: q.length }, (_, k) => at + k)
    const out: number[] = []
    let qi = 0
    for (let i = 0; i < l.length && qi < q.length; i++) if (l[i] === q[qi]) { out.push(i); qi++ }
    return qi === q.length ? out : []
}

/** Separate stretches in a list of positions. */
const runs = (pos: number[]) => pos.reduce((n, p, i) => n + (i === 0 || p !== pos[i - 1] + 1 ? 1 : 0), 0)

const CLAUSE_KEYWORDS: Record<Clause, string[]> = {
    start: ["SELECT", "WITH", "EXPLAIN QUERY PLAN", "PRAGMA"],
    with: ["AS", "SELECT", "RECURSIVE"],
    select: ["DISTINCT", "FROM", "AS", "CASE", "WHEN", "THEN", "ELSE", "END", "CAST", "OVER", "PARTITION BY", "NULL"],
    from: ["WHERE", "JOIN", "LEFT JOIN", "CROSS JOIN", "ON", "USING", "AS", "GROUP BY", "ORDER BY", "LIMIT", "UNION", "UNION ALL"],
    "join-on": ["AND", "OR", "WHERE", "JOIN", "LEFT JOIN", "GROUP BY", "ORDER BY", "LIMIT"],
    where: ["AND", "OR", "NOT", "IN", "LIKE", "GLOB", "BETWEEN", "IS NULL", "IS NOT NULL", "EXISTS", "GROUP BY", "ORDER BY", "LIMIT", "CASE"],
    group: ["HAVING", "ORDER BY", "LIMIT"],
    having: ["AND", "OR", "ORDER BY", "LIMIT"],
    order: ["ASC", "DESC", "NULLS LAST", "NULLS FIRST", "LIMIT", "OFFSET"],
    limit: ["OFFSET"],
    other: ["SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY", "LIMIT"],
}

/** How much each kind weighs in a clause: what the writer most likely wants first. */
function weight(kind: CompletionKind, c: CompletionContext): number {
    if (c.wantsTable) return kind === "table" ? 40 : kind === "source" ? 35 : kind === "keyword" ? 0 : -100
    switch (c.clause) {
        case "start": return kind === "keyword" || kind === "snippet" ? 30 : -100
        case "from": return kind === "keyword" ? 30 : kind === "column" || kind === "metric" ? -10 : 0
        case "limit": return kind === "keyword" ? 10 : -100
        case "order": case "group": return kind === "source" ? 5 : kind === "column" || kind === "metric" ? 30 : kind === "keyword" ? 18 : 8
        default: return kind === "column" || kind === "metric" ? 30 : kind === "function" ? 12 : kind === "keyword" ? 10 : kind === "source" ? 20 : kind === "table" ? 2 : 0
    }
}

/** Completions for the caret, best first; values come from `values`, asked for separately. */
export function complete(src: string, caret: number, schema: SqlSchema, analysis?: SqlAnalysis): { context: CompletionContext; items: Completion[] } {
    const context = contextAt(src, caret, schema, analysis)
    const out: Completion[] = []
    if (context.quiet || context.value) return { context, items: out }
    const q = context.prefix
    const add = (c: Omit<Completion, "score" | "matches">, text = c.label) => {
        const s = fuzzyScore(q, text, -1)
        if (s === null) return
        // Letters scattered over many fragments are a coincidence, not an abbreviation.
        const whole = text.toLowerCase().includes(q.toLowerCase())
        if (!whole && q.length >= 3 && runs(matchPositions(q, text)) > Math.max(2, Math.ceil(q.length / 3))) return
        const exact = c.label.toLowerCase() === q.toLowerCase() ? 50 : c.label.toLowerCase().startsWith(q.toLowerCase()) ? 25 : whole ? 15 : 0
        out.push({ ...c, score: s + exact + weight(c.kind, context), matches: matchPositions(q, c.label) })
    }
    const describe = (col: string) => schema.describe?.(col) ?? null
    const tablesWith = (col: string) => schema.tables.filter(t => t.columns.some(x => x.name === col)).map(t => t.name)
    const columnItem = (name: string, table: string | null, type: string) => {
        const d = describe(name)
        const where = tablesWith(name)
        add({
            kind: d ? "metric" : "column",
            label: name,
            insert: quoteIdent(name),
            detail: d?.name && d.name !== name ? d.name : type.toLowerCase() || (table ?? ""),
            doc: { title: d?.name && d.name !== name ? d.name : name, body: d?.short || (!where.length && table ? `A column of ${table}, as this query names it.` : undefined), meta: [name, type ? type.toLowerCase() : "", where.length ? `in ${where.slice(0, 4).join(", ")}${where.length > 4 ? ` and ${where.length - 4} more` : ""}` : ""].filter(Boolean) },
        }, d?.name ? `${name} ${d.name}` : name)
    }

    if (context.qualifier !== undefined) {
        const s = context.qualifier
        const table = s?.table ? schema.tables.find(t => t.name === s.table) : null
        if (table) for (const c of table.columns) columnItem(c.name, table.name, c.type)
        else for (const c of s?.columns ?? []) columnItem(c, null, "")
        return { context, items: rank(out) }
    }

    if (context.wantsTable || context.clause === "from" || context.clause === "start") {
        for (const c of analysisCtes(src, schema, analysis)) add({ kind: "source", label: c.name, insert: quoteIdent(c.name), detail: "WITH", doc: { title: c.name, body: "A common table expression of this query.", meta: c.columns ? [`${c.columns.length} columns: ${c.columns.slice(0, 6).join(", ")}${c.columns.length > 6 ? ", …" : ""}`] : [] } })
        if (context.wantsTable || context.clause === "from") for (const t of schema.tables) {
            add({ kind: "table", label: t.name, insert: quoteIdent(t.name), detail: `${t.columns.length} columns${t.view ? " · view" : ""}`, doc: { title: t.name, body: tableDoc(t.name), meta: [`${t.columns.length} columns`, t.columns.slice(0, 8).map(c => c.name).join(", ") + (t.columns.length > 8 ? ", …" : "")] } })
        }
    }

    if (!context.wantsTable && context.clause !== "start" && context.clause !== "limit") {
        const seen = new Set<string>()
        const sources = context.sources
        const ambiguous = new Map<string, number>()
        for (const s of sources) for (const c of s.columns ?? []) ambiguous.set(c, (ambiguous.get(c) ?? 0) + 1)
        for (const s of sources) {
            const table = s.table ? schema.tables.find(t => t.name === s.table) : null
            const cols = table ? table.columns : (s.columns ?? []).map(name => ({ name, type: "" }))
            for (const c of cols) {
                const key = c.name
                if (seen.has(key)) continue
                seen.add(key)
                columnItem(c.name, table?.name ?? s.name, c.type)
                if ((ambiguous.get(c.name) ?? 0) > 1) out[out.length - 1] && (out[out.length - 1].detail = `in several · qualify as ${s.name}.${c.name}`)
            }
        }
        // Nothing in FROM yet: every column of every table, so a SELECT can be written first.
        if (!sources.length && context.clause !== "from") {
            for (const t of schema.tables) for (const c of t.columns) {
                if (seen.has(c.name)) continue
                seen.add(c.name)
                columnItem(c.name, t.name, c.type)
            }
        }
        // Aliases and output names.
        for (const s of sources) if (s.name && (s.kind !== "table" || s.name !== s.table)) add({ kind: "source", label: s.name, insert: quoteIdent(s.name), detail: s.table ? `alias of ${s.table}` : s.kind === "cte" ? "WITH" : "subquery" })
        if (context.clause === "order" || context.clause === "group" || context.clause === "having") for (const p of context.projection) if (!seen.has(p)) { seen.add(p); add({ kind: "column", label: p, insert: quoteIdent(p), detail: "output column" }) }
        if (context.clause !== "from") for (const f of FUNCTIONS) {
            if (f.name === "pragma_table_info" || f.name === "json_each") continue
            add({ kind: "function", label: f.name, insert: `${f.name}()`, caret: f.name.length + 1, detail: `${f.name}(${f.args.join(", ")})`, doc: { title: `${f.name}(${f.args.join(", ")})`, body: f.doc, meta: [f.aggregate ? "aggregate" : f.window ? "window function" : "scalar function"] } })
        }
    }
    if (context.clause === "from" && !context.wantsTable) for (const f of ["pragma_table_info", "json_each"]) {
        const fn = FUNCTION_BY_NAME.get(f)!
        add({ kind: "function", label: f, insert: `${f}('')`, caret: f.length + 2, detail: "table-valued", doc: { title: `${f}(${fn.args.join(", ")})`, body: fn.doc } })
    }
    if (q.length > 0 || context.clause === "start" || context.clause === "from") for (const k of CLAUSE_KEYWORDS[context.clause]) add({ kind: "keyword", label: k, insert: `${k} ` })
    if (context.clause === "start" && !q) {
        add({ kind: "snippet", label: "select … from …", insert: "SELECT \nFROM ", caret: 7, detail: "a query", doc: { title: "A query", body: "SELECT, then FROM on the next line; the caret lands after SELECT." } })
    }
    return { context, items: rank(out) }
}

function analysisCtes(src: string, schema: SqlSchema, a?: SqlAnalysis) { return (a ?? analyze(src, schema)).ctes }

const TABLE_DOCS: Record<string, string> = {
    components: "One row per component: its size, coupling, health, history and graph measures.",
    files: "One row per file: its component, role, size, health and history.",
    directories: "One row per directory, with its files' measures rolled up.",
    component_connections_direct: "Imports between components: one row per importing file and import, from → to.",
    component_connections_indirect: "Pairs of components where one reaches the other through imports.",
    component_strongly_connected_groups: "Tangles: components that can all reach each other, by group.",
    component_cycles_shortest: "The shortest import cycle through each component.",
    git_commits: "One row per file changed in each commit: author, time, lines added and deleted.",
    git_authors: "One row per author: commits, lines and files changed, over each period.",
    git_file_shared_commits: "Pairs of files changed in the same commits, and how often.",
    git_component_shared_commits: "Pairs of components changed in the same commits, and how often.",
    modules: "Build modules the scan read from manifests (Maven, Gradle, npm, Go, Composer, .NET, Django).",
    rules: "Dependency rules and each import they judge: status, from, to, file and line.",
    summary: "Whole-snapshot totals, one metric per row.",
    snippets: "Pieces of source the engine kept: imports, declarations, by type.",
    units: "Declared units: types, functions and modules, with their spans.",
    definitions: "What each metric means: its name and descriptions.",
    _snapshot: "How the snapshot was made: commit, branch, analysis revision, ignore patterns.",
}
const tableDoc = (name: string) => TABLE_DOCS[name] ?? undefined

function rank(items: Completion[]): Completion[] {
    const best = new Map<string, Completion>()
    for (const c of items) {
        const k = `${c.kind === "metric" ? "column" : c.kind}:${c.label}`
        const had = best.get(k)
        if (!had || had.score < c.score) best.set(k, c)
    }
    return [...best.values()].sort((a, b) => b.score - a.score || a.label.length - b.label.length || a.label.localeCompare(b.label)).slice(0, 80)
}

// ── Signature help ────────────────────────────────────────────────────────

/** The function whose brackets hold the caret, and which argument it is at. */
export function signatureAt(src: string, caret: number): { fn: SqlFunction; arg: number } | null {
    const tokens = tokenize(src).filter(t => t.kind !== "space" && t.kind !== "comment" && t.end <= caret)
    let depth = 0
    let commas = 0
    for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i]
        if (t.text === ")") depth++
        else if (t.text === "(") {
            if (depth === 0) {
                const name = tokens[i - 1]
                const fn = name && (name.kind === "ident" || name.kind === "keyword") ? FUNCTION_BY_NAME.get(name.text.toLowerCase()) : undefined
                return fn ? { fn, arg: commas } : null
            }
            depth--
        } else if (t.text === "," && depth === 0) commas++
    }
    return null
}

// ── Diagnostics ───────────────────────────────────────────────────────────

export interface SqlDiagnostic { from: number; to: number; message: string; severity: "error" | "warning" }

/** What can be told before running: tables that do not exist, columns a table does not have, an unfinished string. */
export function lint(src: string, schema: SqlSchema, analysis?: SqlAnalysis): SqlDiagnostic[] {
    if (!schema.tables.length) return []
    const a = analysis ?? analyze(src, schema)
    const out: SqlDiagnostic[] = []
    for (const t of a.tokens) {
        if (t.open && t.kind === "string") out.push({ from: t.start, to: t.end, message: "This string has no closing quote.", severity: "error" })
        if (t.open && t.kind === "comment") out.push({ from: t.start, to: t.end, message: "This comment has no closing */.", severity: "error" })
    }
    const known = new Set(schema.tables.map(t => t.name.toLowerCase()))
    const cteNames = new Set(a.ctes.map(c => c.name.toLowerCase()))
    for (const b of a.blocks) for (const s of b.sources) {
        if (s.kind === "table" && s.token && !known.has((s.table ?? "").toLowerCase()) && !cteNames.has((s.table ?? "").toLowerCase())) {
            const close = nearest(s.table ?? "", schema.tables.map(t => t.name))
            out.push({ from: s.token.start, to: s.token.end, message: `No table called ${s.table}${close ? `; did you mean ${close}?` : "."}`, severity: "error" })
        }
    }
    // alias.column where the alias is a schema table that lacks the column.
    for (let i = 2; i < a.sig.length; i++) {
        if (a.sig[i - 1].text !== "." || !isName(a.sig[i]) || !isName(a.sig[i - 2])) continue
        const q = identName(a.sig[i - 2]).toLowerCase()
        const scope = scopeAt(a, a.sig[i].start)
        const s = scope.find(x => x.name.toLowerCase() === q)
        if (!s || s.kind !== "table" || !s.columns) continue
        const col = identName(a.sig[i])
        if (!s.columns.some(c => c.toLowerCase() === col.toLowerCase())) {
            const close = nearest(col, s.columns)
            out.push({ from: a.sig[i].start, to: a.sig[i].end, message: `${s.table} has no column ${col}${close ? `; did you mean ${close}?` : "."}`, severity: "error" })
        }
    }
    return out
}

/** Where SQLite's own error points, when it names a token. */
export function locateError(src: string, message: string): SqlDiagnostic | null {
    const m = /no such (column|table|function): ([^\s,]+)|near "([^"]*)": syntax error|ambiguous column name: ([^\s,]+)/i.exec(message)
    if (!m) return null
    const needle = (m[2] ?? m[3] ?? m[4] ?? "").trim()
    if (!needle) return null
    const tokens = tokenize(src).filter(t => t.kind !== "space" && t.kind !== "comment" && t.kind !== "string")
    const last = needle.includes(".") ? needle.split(".").pop()! : needle
    const lower = last.toLowerCase()
    const hit = tokens.find(t => (t.kind === "quoted" ? identName(t) : t.text).toLowerCase() === lower)
    return hit ? { from: hit.start, to: hit.end, message: message.replace(/^.*?(no such|near|ambiguous)/i, "$1"), severity: "error" } : null
}

/** The candidate a mistyped name most likely meant, when one is close. */
function nearest(name: string, candidates: string[]): string | null {
    const n = name.toLowerCase()
    let best: string | null = null
    let bestD = Math.max(2, Math.floor(n.length / 4)) + 1
    for (const c of candidates) {
        const d = distance(n, c.toLowerCase())
        if (d < bestD) { bestD = d; best = c }
    }
    return best
}
function distance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 4) return 99
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0]
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j]
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
            prev = tmp
        }
    }
    return row[b.length]
}

// ── Highlighting ──────────────────────────────────────────────────────────

export type HighlightKind = SqlTokenKind | "function" | "table" | "column" | "metric" | "source"

/** Each token with what it is in this query: a table, a column, a metric, a function, an alias. */
export function classify(a: SqlAnalysis, schema: SqlSchema): Array<SqlToken & { role: HighlightKind }> {
    const tables = new Set(schema.tables.map(t => t.name.toLowerCase()))
    const columns = new Set<string>()
    for (const t of schema.tables) for (const c of t.columns) columns.add(c.name.toLowerCase())
    const sources = new Set<string>()
    for (const b of a.blocks) for (const s of b.sources) if (s.name) sources.add(s.name.toLowerCase())
    for (const c of a.ctes) sources.add(c.name.toLowerCase())
    const next = (i: number) => { for (let k = i + 1; k < a.tokens.length; k++) if (a.tokens[k].kind !== "space" && a.tokens[k].kind !== "comment") return a.tokens[k]; return undefined }
    return a.tokens.map((t, i) => {
        if (t.kind === "keyword" && next(i)?.text === "(" && FUNCTION_BY_NAME.has(t.text.toLowerCase())) return { ...t, role: "function" as const }
        if (t.kind !== "ident" && t.kind !== "quoted") return { ...t, role: t.kind }
        const name = identName(t).toLowerCase()
        if (next(i)?.text === "(" && t.kind === "ident") return { ...t, role: "function" as const }
        if (tables.has(name)) return { ...t, role: "table" as const }
        if (sources.has(name) && next(i)?.text === ".") return { ...t, role: "source" as const }
        if (columns.has(name)) return { ...t, role: (schema.describe?.(identName(t)) ? "metric" : "column") as HighlightKind }
        if (sources.has(name)) return { ...t, role: "source" as const }
        return { ...t, role: t.kind }
    })
}
