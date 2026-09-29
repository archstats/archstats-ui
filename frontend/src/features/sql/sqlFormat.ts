// A console's text as statements, and a statement laid out the way an IDE
// reformats it: one clause per line, long select lists one column per line,
// AND and OR under WHERE, subqueries indented. Strings, quoted names and
// comments are kept as written; keywords take the case most of them had.

import { tokenize, type SqlToken } from "./sqlLang"

export interface StatementRange {
    from: number
    /** Exclusive; the semicolon and surrounding whitespace are outside. */
    to: number
    text: string
}

/** The statements in a console, split on semicolons outside strings, comments and brackets. */
export function statements(src: string): StatementRange[] {
    const out: StatementRange[] = []
    let depth = 0, start = 0, code = false
    const flush = (end: number) => {
        let a = start, b = end
        while (a < b && /\s/.test(src[a])) a++
        while (b > a && /\s/.test(src[b - 1])) b--
        if (code && b > a) out.push({ from: a, to: b, text: src.slice(a, b) })
    }
    for (const t of tokenize(src)) {
        if (t.kind === "space" || t.kind === "comment") continue
        if (t.text === "(") depth++
        else if (t.text === ")") depth = Math.max(0, depth - 1)
        else if (t.text === ";" && depth === 0) { flush(t.start); start = t.end; code = false; continue }
        code = true
    }
    flush(src.length)
    return out
}

/**
 * The statement the caret is in; after a semicolon or in the blank lines
 * after a statement, the one just written; before the first, the first.
 */
export function statementAt(src: string, caret: number): StatementRange | null {
    const all = statements(src)
    if (!all.length) return null
    const inside = all.find(s => caret >= s.from && caret <= s.to)
    if (inside) return inside
    const before = [...all].reverse().find(s => s.to <= caret)
    return before ?? all[0]
}

// ── Formatting ───────────────────────────────────────────────────────────

const PHRASES = [
    ["GROUP", "BY"], ["ORDER", "BY"], ["PARTITION", "BY"], ["UNION", "ALL"],
    ["LEFT", "OUTER", "JOIN"], ["RIGHT", "OUTER", "JOIN"], ["FULL", "OUTER", "JOIN"],
    ["LEFT", "JOIN"], ["RIGHT", "JOIN"], ["FULL", "JOIN"], ["INNER", "JOIN"], ["CROSS", "JOIN"], ["NATURAL", "JOIN"],
]
const CLAUSES = new Set(["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "WINDOW", "VALUES", "WITH", "UNION", "UNION ALL", "EXCEPT", "INTERSECT"])
const SET_OPS = new Set(["UNION", "UNION ALL", "EXCEPT", "INTERSECT"])
const LISTS = new Set(["SELECT", "GROUP BY", "ORDER BY"])
const CASED = new Set(`SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT FULL INNER OUTER CROSS NATURAL GROUP BY ORDER
    HAVING LIMIT OFFSET UNION ALL DISTINCT CASE WHEN THEN ELSE END ASC DESC LIKE GLOB BETWEEN EXISTS WITH RECURSIVE
    VALUES CAST OVER PARTITION WINDOW EXCEPT INTERSECT NULLS COLLATE ESCAPE USING`.split(/\s+/))

interface Word { text: string; up: string; tok: SqlToken; kind: SqlToken["kind"] }
interface Level { indent: number; sub: boolean; clause: string; list: number | null; between: boolean; cases: number }

/** Reformats SQL; text that does not tokenize cleanly still comes back whole. */
export function formatSql(src: string): string {
    const toks = tokenize(src).filter(t => t.kind !== "space")
    const kws = toks.filter(t => t.kind === "keyword" && CASED.has(t.text.toUpperCase()))
    const upper = kws.filter(t => t.text === t.text.toUpperCase()).length > kws.length / 2
    const cased = (t: SqlToken) => (t.kind === "keyword" && CASED.has(t.text.toUpperCase()) ? (upper ? t.text.toUpperCase() : t.text.toLowerCase()) : t.text)

    // Words, with the keyword phrases that act as one ("group by", "left join") joined.
    const words: Word[] = []
    for (let i = 0; i < toks.length; i++) {
        const t = toks[i]
        if (t.kind === "keyword") {
            const hit = PHRASES.find(p => p.every((w, k) => toks[i + k]?.kind === "keyword" && toks[i + k].text.toUpperCase() === w))
            if (hit) {
                const up = hit.join(" ")
                words.push({ text: toks.slice(i, i + hit.length).map(cased).join(" "), up, tok: t, kind: "keyword" })
                i += hit.length - 1
                continue
            }
        }
        words.push({ text: cased(t), up: t.kind === "keyword" ? t.text.toUpperCase() : t.text, tok: t, kind: t.kind })
    }

    const lines: string[] = []
    let cur = ""
    const atStart = () => !cur.trim()
    const newline = (indent: number) => {
        if (!atStart()) lines.push(cur.trimEnd())
        cur = " ".repeat(indent)
    }
    const base = (): Level => ({ indent: 0, sub: false, clause: "", list: null, between: false, cases: 0 })
    let levels: Level[] = [base()]
    const top = () => levels[levels.length - 1]

    /** How long a clause's list runs, and how many items it has, up to the next clause at its depth. */
    const listShape = (from: number) => {
        let depth = 0, commas = 0, len = 0
        for (let j = from + 1; j < words.length; j++) {
            const w = words[j]
            if (w.text === "(") depth++
            else if (w.text === ")") { if (depth === 0) break; depth-- }
            else if (depth === 0 && (w.text === ";" || (w.kind === "keyword" && (CLAUSES.has(w.up) || w.up.endsWith("JOIN"))))) break
            else if (depth === 0 && w.text === ",") commas++
            len += w.text.length + 1
        }
        return { commas, len }
    }

    const spaceBefore = (i: number): boolean => {
        const w = words[i], prev = words[i - 1], prev2 = words[i - 2]
        if (!prev || atStart()) return false
        if ([",", ")", ";", "."].includes(w.text)) return false
        if (prev.text === "(" || prev.text === ".") return false
        if (w.text === "(" && (prev.kind === "ident" || prev.kind === "quoted" || ["CAST", "REPLACE", "LIKE", "GLOB"].includes(prev.up))) return false
        // A sign, not a minus: "= -1", "(-1", ", -1".
        if ((prev.text === "-" || prev.text === "+") && (!prev2 || prev2.kind === "op" || prev2.text === "(" || prev2.text === "," || (prev2.kind === "keyword" && prev2.up !== "END"))) return false
        return true
    }
    const put = (i: number) => { cur += (spaceBefore(i) ? " " : "") + words[i].text }

    for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const L = top()
        if (w.kind === "comment") {
            if (w.text.startsWith("--")) {
                cur += atStart() ? w.text : ` ${w.text}`
                newline(L.list ?? L.indent)
            } else put(i)
            continue
        }
        if (w.text === ";") {
            cur += ";"
            lines.push(cur.trimEnd())
            if (i < words.length - 1) lines.push("")
            cur = ""
            levels = [base()]
            continue
        }
        if (w.kind === "keyword" && L.cases === 0 && CLAUSES.has(w.up)) {
            if (SET_OPS.has(w.up)) { newline(L.indent); cur += w.text; newline(L.indent); L.clause = ""; L.list = null; continue }
            newline(L.indent)
            cur += w.text
            L.clause = w.up
            L.between = false
            const shape = LISTS.has(w.up) ? listShape(i) : null
            L.list = shape && (shape.commas >= 2 || shape.len > 72) ? L.indent + w.text.length + 1 : null
            continue
        }
        if (w.kind === "keyword" && L.cases === 0 && w.up.endsWith("JOIN")) {
            newline(L.indent)
            cur += w.text
            L.clause = "JOIN"
            L.list = null
            continue
        }
        if (w.up === "ON" && L.clause === "JOIN") L.clause = "ON"
        if (w.up === "CASE") L.cases++
        if (w.up === "END" && L.cases > 0) L.cases--
        if (w.up === "BETWEEN") L.between = true
        if ((w.up === "AND" || w.up === "OR") && w.kind === "keyword" && L.cases === 0 && ["WHERE", "HAVING", "ON"].includes(L.clause)) {
            if (w.up === "AND" && L.between) { L.between = false; put(i); continue }
            newline(L.indent + 2)
            cur += w.text
            continue
        }
        if (w.text === "(") {
            const next = words[i + 1]
            const sub = next?.kind === "keyword" && (next.up === "SELECT" || next.up === "WITH")
            put(i)
            levels.push({ indent: sub ? L.indent + 2 : L.indent, sub, clause: "", list: null, between: false, cases: 0 })
            if (sub) newline(L.indent + 2)
            continue
        }
        if (w.text === ")") {
            const was = levels.length > 1 ? levels.pop()! : L
            if (was.sub) newline(top().indent)
            put(i)
            continue
        }
        if (w.text === ",") {
            cur += ","
            if (L.cases === 0 && L.list !== null && LISTS.has(L.clause)) newline(L.list)
            else if (L.clause === "WITH") newline(L.indent)
            continue
        }
        put(i)
    }
    if (!atStart()) lines.push(cur.trimEnd())
    const out = lines.join("\n").trim()
    return out || src
}
