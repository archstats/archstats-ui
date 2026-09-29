// Named parameters in a console query (:component, @since, $author): what
// the query asks for, which column each one is compared with (so the input
// can offer that column's values), and the query with the values written in
// as literals. The console binds nothing server-side; a query that ran is
// the SQL with its values, so history and reports can run it again as it is.

import { analyze, identName, resolveColumn, scopeAt, tokenize, type SqlSchema, type SqlToken } from "./sqlLang"
import { sqlLiteral } from "~/shared/sql"

export interface SqlParam {
    /** Without its sigil: "component". */
    name: string
    /** As written the first time: ":component". */
    written: string
    /** Offset of the first use, for finding the column it is compared with. */
    at: number
}

const named = (t: SqlToken) => t.kind === "param" && t.text.length > 1 && t.text[0] !== "?"

/** The named parameters in order of first use; each name once. */
export function paramsIn(sql: string): SqlParam[] {
    const seen = new Map<string, SqlParam>()
    for (const t of tokenize(sql)) {
        if (!named(t)) continue
        const name = t.text.slice(1)
        if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, written: t.text, at: t.start })
    }
    return [...seen.values()]
}

/** A value as SQL: a number stays a number, anything else is quoted. */
export function paramLiteral(value: string): string {
    const v = value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    if (/^null$/i.test(v)) return "NULL"
    return sqlLiteral(value)
}

/** The SQL with every named parameter replaced by its value; the names still empty come back as missing. */
export function bindParams(sql: string, values: Record<string, string>): { sql: string; missing: string[] } {
    const missing = new Set<string>()
    let out = ""
    let last = 0
    for (const t of tokenize(sql)) {
        if (!named(t)) continue
        const name = t.text.slice(1)
        const key = Object.keys(values).find(k => k.toLowerCase() === name.toLowerCase())
        const v = key !== undefined ? values[key] : ""
        if (!v.trim()) { missing.add(name); continue }
        out += sql.slice(last, t.start) + paramLiteral(v)
        last = t.end
    }
    return { sql: out + sql.slice(last), missing: [...missing] }
}

/**
 * The table and column a parameter is compared with (`c.name = :component`,
 * `:author = author_name`, `component IN (:a)`, `name LIKE :q`), resolved
 * against the tables the query reads; null when it stands alone.
 */
export function paramColumn(sql: string, p: SqlParam, schema: SqlSchema): { table: string; column: string } | null {
    const toks = tokenize(sql).filter(t => t.kind !== "space" && t.kind !== "comment")
    const i = toks.findIndex(t => t.start === p.at)
    if (i < 0) return null
    const isCmp = (t?: SqlToken) => !!t && (["=", "==", "!=", "<>", "<", ">", "<=", ">="].includes(t.text) || (t.kind === "keyword" && ["LIKE", "GLOB", "IN", "IS"].includes(t.text.toUpperCase())))
    const colAt = (j: number): { name: string; qualifier: string | null } | null => {
        const t = toks[j]
        if (!t || (t.kind !== "ident" && t.kind !== "quoted")) return null
        const dot = toks[j - 1]?.text === "." ? toks[j - 2] : null
        return { name: identName(t), qualifier: dot ? identName(dot) : null }
    }
    // Before it: col = :p, col IN (:p, …), col LIKE :p
    let j = i - 1
    while (toks[j] && (toks[j].text === "(" || toks[j].text === "," || (toks[j].kind === "param"))) j--
    let col = isCmp(toks[j]) ? colAt(j - 1) : null
    if (!col && toks[j]?.kind === "keyword" && toks[j].text.toUpperCase() === "IN" && toks[j - 1]?.text.toUpperCase() === "NOT") col = colAt(j - 2)
    // After it: :p = col
    if (!col && isCmp(toks[i + 1])) col = colAt(toks[i + 3]?.text === "." ? i + 4 : i + 2)
    if (!col) return null
    const table = resolveColumn(col.name, col.qualifier, scopeAt(analyze(sql, schema), p.at), schema)
    return table ? { table, column: col.name } : null
}
