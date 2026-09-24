// Where change effort goes: of the lines changed in a window, what share went
// into files below a health threshold, into tangle members, into commits
// matching the fix pattern, and into files the snapshot no longer has. One
// quotable sentence, and the table it comes from.
//
// Changed lines are additions plus deletions, per file, as git reports them.
// The top-hotspot share is left out on purpose: the hotspot score is built
// from churn, so "churn goes into hotspots" would only restate its own input.

import { NOT_BOT_SQL } from "~/utils/authors"
import { formatDate } from "~/utils/time"

export interface EffortCommit {
    hash: string
    t: string
    msg: string | null
    lines: number
    low: number
    tangle: number
    gone: number
    noHealth: number
}

export interface EffortShares {
    commits: number
    lines: number
    low: number
    tangle: number
    fix: number
    gone: number
    noHealth: number
}

/**
 * One row per commit, lines split by where they went. `where` narrows the
 * files (the scope), written against c.file: scopeWhere("c.file").
 */
export function effortSql(threshold: number, where: string | null): string {
    const ln = "(coalesce(c.file_additions, 0) + coalesce(c.file_deletions, 0))"
    return `
    WITH tangle AS (
      SELECT component FROM component_strongly_connected_groups
      WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1)
    )
    SELECT c.commit_hash AS hash, max(c.commit_time) AS t, max(c.commit_message) AS msg,
      sum(${ln}) AS lines,
      sum(CASE WHEN f.codesmells__code_health < ${Number(threshold)} THEN ${ln} ELSE 0 END) AS low,
      sum(CASE WHEN f.component IN (SELECT component FROM tangle) THEN ${ln} ELSE 0 END) AS tangle,
      sum(CASE WHEN f.name IS NULL THEN ${ln} ELSE 0 END) AS gone,
      sum(CASE WHEN f.name IS NOT NULL AND f.codesmells__code_health IS NULL THEN ${ln} ELSE 0 END) AS noHealth
    FROM git_commits c LEFT JOIN files f ON f.name = c.file
    WHERE ${NOT_BOT_SQL}${where ? ` AND ${where}` : ""}
    GROUP BY c.commit_hash`
}

/** Files below the threshold among files with a health reading, for "(34% of files)"; `where` on name. */
export function lowFileShareSql(threshold: number, where: string | null): string {
    return `SELECT sum(CASE WHEN codesmells__code_health < ${Number(threshold)} THEN 1 ELSE 0 END) AS low, count(codesmells__code_health) AS rated
    FROM files${where ? ` WHERE ${where}` : ""}`
}

/** The commits in [from, to], summed; `fix` decides which commits count as fix work. */
export function effortShares(rows: EffortCommit[], from: number | null, to: number, fix: RegExp): EffortShares {
    const out: EffortShares = { commits: 0, lines: 0, low: 0, tangle: 0, fix: 0, gone: 0, noHealth: 0 }
    for (const r of rows) {
        const t = new Date(r.t).getTime()
        if (Number.isNaN(t) || t > to || (from !== null && t < from)) continue
        const lines = Number(r.lines) || 0
        out.commits++
        out.lines += lines
        out.low += Number(r.low) || 0
        out.tangle += Number(r.tangle) || 0
        out.gone += Number(r.gone) || 0
        out.noHealth += Number(r.noHealth) || 0
        if (fix.test((r.msg ?? "").split("\n")[0])) out.fix += lines
    }
    return out
}

export const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
export const pctText = (x: number) => `${Math.round(x * 100)}%`

/** "In the 90 days to 18 Sep 2026, 16% of changed lines went into files with health below 5 (34% of files)." */
export function effortLede(s: EffortShares, days: number | null, anchor: Date, threshold: number, lowFiles: number | null): string {
    const when = days === null ? `Over the whole history to ${formatDate(anchor)}` : `In the ${days === 365 ? "year" : `${days} days`} to ${formatDate(anchor)}`
    if (!s.lines) return `${when}, no lines changed.`
    const files = lowFiles === null ? "" : ` (${pctText(lowFiles)} of files)`
    return `${when}, ${pctText(share(s.low, s.lines))} of changed lines went into files with health below ${threshold}${files}.`
}

/** The low-health share by calendar month, oldest first, months without changes kept as gaps. */
export function monthlyLowShare(rows: EffortCommit[], from: number | null, to: number): Array<{ month: string; lines: number; share: number }> {
    const by = new Map<string, { lines: number; low: number }>()
    let first = Infinity
    for (const r of rows) {
        const t = new Date(r.t).getTime()
        if (Number.isNaN(t) || t > to || (from !== null && t < from)) continue
        first = Math.min(first, t)
        const d = new Date(t)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
        const e = by.get(key) ?? { lines: 0, low: 0 }
        e.lines += Number(r.lines) || 0
        e.low += Number(r.low) || 0
        by.set(key, e)
    }
    if (!by.size) return []
    const out: Array<{ month: string; lines: number; share: number }> = []
    const cur = new Date(first)
    cur.setUTCDate(1)
    const end = new Date(to)
    while (cur <= end) {
        const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`
        const e = by.get(key)
        out.push({ month: key, lines: e?.lines ?? 0, share: e ? share(e.low, e.lines) : 0 })
        cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
    return out
}
