// One query's result on two snapshots, row by row. Rows are matched by
// their text columns (a name, a pair of names, an author and a component);
// the numbers are what is compared. A result with no text column is matched
// by position. Rows only the baseline has are listed after the rest.

export type DiffStatus = "added" | "removed" | "changed" | "same"

export interface DiffEntry {
    /** Values in the current result's columns; for a removed row, the baseline's. */
    row: unknown[]
    /** The baseline's values in the same columns; null for an added row. */
    before: unknown[] | null
    status: DiffStatus
}

export interface ResultDiff {
    entries: DiffEntry[]
    counts: Record<DiffStatus, number>
    /** The columns rows were matched on; empty when matched by position. */
    key: string[]
    /** Columns the baseline's result does not have. */
    missing: string[]
    /** The key repeats within a result, so repeats were matched in order. */
    ambiguous: boolean
}

interface Result { columns: string[]; rows: unknown[][] }

const isNum = (v: unknown) => typeof v === "number"
const blank = (v: unknown) => v === null || v === undefined

export function same(a: unknown, b: unknown): boolean {
    if (blank(a) || blank(b)) return blank(a) && blank(b)
    if (isNum(a) && isNum(b)) return Math.abs((a as number) - (b as number)) <= 1e-9 * Math.max(1, Math.abs(a as number))
    return String(a) === String(b)
}

/** The columns that name a row: those holding text (or nothing) in every sampled row. */
export function keyColumns(r: Result): number[] {
    const out: number[] = []
    for (let j = 0; j < r.columns.length; j++) {
        let text = false, num = false
        for (const row of r.rows.slice(0, 500)) {
            const v = row[j]
            if (isNum(v)) { num = true; break }
            if (!blank(v)) text = true
        }
        if (text && !num) out.push(j)
    }
    return out
}

export function diffResults(now: Result, then: Result): ResultDiff {
    const at = now.columns.map(c => then.columns.indexOf(c))
    const align = (row: unknown[]) => at.map(i => (i < 0 ? null : row[i]))
    const keys = keyColumns(now).filter(j => at[j] >= 0)
    let ambiguous = false
    const keyOf = (row: unknown[], seen: Map<string, number>, pos: number) => {
        const base = keys.length ? JSON.stringify(keys.map(j => (blank(row[j]) ? null : String(row[j])))) : String(pos)
        const n = seen.get(base) ?? 0
        seen.set(base, n + 1)
        if (n) ambiguous = true
        return n ? `${base}#${n}` : base
    }

    const before = new Map<string, unknown[]>()
    const seenThen = new Map<string, number>()
    then.rows.forEach((r, i) => before.set(keyOf(align(r), seenThen, i), align(r)))

    const entries: DiffEntry[] = []
    const counts: Record<DiffStatus, number> = { added: 0, removed: 0, changed: 0, same: 0 }
    const seenNow = new Map<string, number>()
    const matched = new Set<string>()
    now.rows.forEach((row, i) => {
        const k = keyOf(row, seenNow, i)
        const b = before.get(k) ?? null
        if (b) matched.add(k)
        const status: DiffStatus = !b ? "added" : row.every((v, j) => at[j] < 0 || same(v, b[j])) ? "same" : "changed"
        counts[status]++
        entries.push({ row, before: b, status })
    })
    for (const [k, b] of before) {
        if (matched.has(k)) continue
        counts.removed++
        entries.push({ row: b, before: b, status: "removed" })
    }
    return { entries, counts, key: keys.map(j => now.columns[j]), missing: now.columns.filter((_, j) => at[j] < 0), ambiguous }
}
