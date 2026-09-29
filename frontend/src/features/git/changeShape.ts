// Where work is going now, and how wide a change is. Both read git_commits
// against the snapshot's current components, without bots and without merge
// commits (a merge lists the files it resolved, not work done), counted back
// from the snapshot's anchor.

import { NOT_BOT_SQL, canonicalAuthorSql, type AliasMap } from "./authors"

export const MERGE_SQL = "c.commit_message LIKE 'Merge %'"

/** Commits touching more files than this are renames, reformats and imports, not changes. */
export const SWEEP_FILES = 100

export const NOW_WINDOWS = [
    { id: "30", label: "30 d", days: 30 },
    { id: "90", label: "90 d", days: 90 },
    { id: "180", label: "180 d", days: 180 },
    { id: "365", label: "1 y", days: 365 },
] as const
export type NowWindowId = (typeof NOW_WINDOWS)[number]["id"]

/** What "now" is compared with: the two years before the window. */
export const BEFORE_DAYS = 730

function base(opts: { includeBots: boolean; where?: string | null }): string {
    return [
        "f.component IS NOT NULL AND f.component <> ''",
        `NOT (${MERGE_SQL})`,
        opts.includeBots ? "" : NOT_BOT_SQL,
        opts.where ? `(${opts.where})` : "",
    ].filter(Boolean).join(" AND ")
}

// ── Work now ────────────────────────────────────────────────────────────

/** Per component: changed lines, commits and people in the window, and changed lines in the two years before it. */
export function workNowSql(opts: { days: number; anchor: string; aliases: AliasMap; includeBots: boolean; where?: string | null }): string {
    const inNow = `julianday(c.commit_time) > ${opts.anchor} - ${opts.days}`
    const inBefore = `julianday(c.commit_time) <= ${opts.anchor} - ${opts.days} AND julianday(c.commit_time) > ${opts.anchor} - ${opts.days + BEFORE_DAYS}`
    const lines = "coalesce(c.file_additions, 0) + coalesce(c.file_deletions, 0)"
    return `
    SELECT f.component AS component,
      sum(CASE WHEN ${inNow} THEN ${lines} ELSE 0 END) AS now_lines,
      count(DISTINCT CASE WHEN ${inNow} THEN c.commit_hash END) AS now_commits,
      count(DISTINCT CASE WHEN ${inNow} THEN ${canonicalAuthorSql(opts.aliases, "c.author_name")} END) AS now_people,
      sum(CASE WHEN ${inBefore} THEN ${lines} ELSE 0 END) AS before_lines
    FROM git_commits c JOIN files f ON f.name = c.file
    WHERE ${base(opts)} AND julianday(c.commit_time) > ${opts.anchor} - ${opts.days + BEFORE_DAYS}
    GROUP BY 1`
}

export interface WorkNowInput { component: string; now_lines: number; now_commits: number; now_people: number; before_lines: number }

export interface WorkNowRow {
    component: string
    lines: number
    commits: number
    people: number
    beforeLines: number
    /** Share of the window's changed lines. */
    share: number
    /** Share of the changed lines in the two years before. */
    beforeShare: number
}

export interface WorkNow {
    rows: WorkNowRow[]
    lines: number
    beforeLines: number
    /** How few components took half of the window's changed lines. */
    half: number
    /** Components with work in the window that took under a quarter of their share before. */
    rising: WorkNowRow[]
    /** Components that took at least 1% before and under a fifth of that now. */
    quiet: WorkNowRow[]
}

export function buildWorkNow(input: WorkNowInput[]): WorkNow {
    const clean = input.map(r => ({
        component: r.component,
        lines: Number(r.now_lines) || 0,
        commits: Number(r.now_commits) || 0,
        people: Number(r.now_people) || 0,
        beforeLines: Number(r.before_lines) || 0,
    }))
    const lines = clean.reduce((s, r) => s + r.lines, 0)
    const beforeLines = clean.reduce((s, r) => s + r.beforeLines, 0)
    const rows = clean.map(r => ({ ...r, share: lines ? r.lines / lines : 0, beforeShare: beforeLines ? r.beforeLines / beforeLines : 0 }))
    const byNow = rows.filter(r => r.lines > 0).sort((a, b) => b.lines - a.lines || a.component.localeCompare(b.component))
    let half = 0, sum = 0
    for (const r of byNow) { if (sum >= lines / 2) break; sum += r.lines; half++ }
    return {
        rows: byNow,
        lines,
        beforeLines,
        half,
        rising: byNow.filter(r => r.share >= 0.02 && r.beforeShare < r.share / 4),
        quiet: rows
            .filter(r => r.beforeShare >= 0.01 && r.share < r.beforeShare / 5)
            .sort((a, b) => b.beforeShare - a.beforeShare || a.component.localeCompare(b.component)),
    }
}

// ── Breadth ─────────────────────────────────────────────────────────────

/** One row per commit: when, how many of today's components and files it touched. */
export function commitBreadthSql(opts: { includeBots: boolean; where?: string | null }): string {
    return `
    SELECT c.commit_hash AS h, max(c.commit_time) AS t, count(DISTINCT f.component) AS n, count(DISTINCT c.file) AS files
    FROM git_commits c JOIN files f ON f.name = c.file
    WHERE ${base(opts)}
    GROUP BY 1`
}

/** One row per commit and component in the window, for "changes alone". */
export function commitComponentsSql(opts: { days: number | null; anchor: string; includeBots: boolean; where?: string | null }): string {
    const since = opts.days === null ? "" : ` AND julianday(c.commit_time) > ${opts.anchor} - ${opts.days}`
    return `
    SELECT c.commit_hash AS h, f.component AS component, count(DISTINCT c.file) AS files
    FROM git_commits c JOIN files f ON f.name = c.file
    WHERE ${base(opts)}${since}
    GROUP BY 1, 2`
}

export const BANDS = [
    { id: "1", label: "1 component", min: 1, max: 1 },
    { id: "2", label: "2–3", min: 2, max: 3 },
    { id: "4", label: "4–10", min: 4, max: 10 },
    { id: "11", label: "11 or more", min: 11, max: Infinity },
] as const

export interface CommitBreadth { h: string; t: string; n: number; files: number }

export interface BreadthPeriod {
    key: string
    label: string
    start: Date
    commits: number
    /** Commits per band, in BANDS order. */
    bands: number[]
    /** Share of commits touching more than one component. */
    wide: number
    /** Share touching four or more. */
    wider: number
}

export function bandOf(n: number): number {
    return BANDS.findIndex(b => n >= b.min && n <= b.max)
}

/** Buckets commits by year, or by quarter when the history spans under six years. */
export function breadthPeriods(commits: CommitBreadth[]): { periods: BreadthPeriod[]; unit: "year" | "quarter" } {
    const dated = commits.map(c => ({ ...c, d: new Date(c.t) })).filter(c => !Number.isNaN(c.d.getTime()))
    if (!dated.length) return { periods: [], unit: "year" }
    const first = dated.reduce((m, c) => (c.d < m ? c.d : m), dated[0].d)
    const last = dated.reduce((m, c) => (c.d > m ? c.d : m), dated[0].d)
    const unit = last.getFullYear() - first.getFullYear() < 6 ? "quarter" : "year"
    const keyOf = (d: Date) => (unit === "year" ? `${d.getFullYear()}` : `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`)
    const map = new Map<string, BreadthPeriod>()
    // Every period between the first and last commit gets a slot.
    const cur = unit === "year" ? new Date(first.getFullYear(), 0, 1) : new Date(first.getFullYear(), Math.floor(first.getMonth() / 3) * 3, 1)
    while (cur <= last) {
        const key = keyOf(cur)
        map.set(key, { key, label: unit === "year" ? key : `Q${Math.floor(cur.getMonth() / 3) + 1} ’${String(cur.getFullYear()).slice(2)}`, start: new Date(cur), commits: 0, bands: BANDS.map(() => 0), wide: 0, wider: 0 })
        if (unit === "year") cur.setFullYear(cur.getFullYear() + 1); else cur.setMonth(cur.getMonth() + 3)
    }
    for (const c of dated) {
        const p = map.get(keyOf(c.d))
        if (!p) continue
        p.commits++
        p.bands[bandOf(Number(c.n))]++
    }
    const periods = [...map.values()]
    for (const p of periods) {
        p.wide = p.commits ? (p.commits - p.bands[0]) / p.commits : 0
        p.wider = p.commits ? (p.bands[2] + p.bands[3]) / p.commits : 0
    }
    return { periods, unit }
}

export interface BreadthCompare { recent: { commits: number; wide: number; wider: number }; before: { commits: number; wide: number; wider: number } }

/** The last year against the three years before it. */
export function breadthCompare(commits: CommitBreadth[], anchor: Date): BreadthCompare {
    const day = 86400000
    const tally = (from: number, to: number) => {
        let n = 0, wide = 0, wider = 0
        for (const c of commits) {
            const age = (anchor.getTime() - new Date(c.t).getTime()) / day
            if (!(age >= from && age < to)) continue
            n++
            if (c.n > 1) wide++
            if (c.n >= 4) wider++
        }
        return { commits: n, wide: n ? wide / n : 0, wider: n ? wider / n : 0 }
    }
    return { recent: tally(0, 365), before: tally(365, 365 * 4) }
}

export interface AloneRow {
    component: string
    commits: number
    /** Commits that changed no other component. */
    alone: number
    /** The component it most often changed with, and how often. */
    partner: string | null
    partnerCommits: number
    /** Distinct components it changed with. */
    partners: number
}

/** Per component: how often its commits changed it alone, and what it changes with. */
export function changesAlone(pairs: Array<{ h: string; component: string }>): AloneRow[] {
    const byCommit = new Map<string, string[]>()
    for (const p of pairs) {
        const list = byCommit.get(p.h) ?? []
        list.push(p.component)
        byCommit.set(p.h, list)
    }
    const acc = new Map<string, { commits: number; alone: number; with: Map<string, number> }>()
    for (const comps of byCommit.values()) {
        for (const c of comps) {
            const a = acc.get(c) ?? { commits: 0, alone: 0, with: new Map() }
            a.commits++
            if (comps.length === 1) a.alone++
            else for (const o of comps) if (o !== c) a.with.set(o, (a.with.get(o) ?? 0) + 1)
            acc.set(c, a)
        }
    }
    return [...acc.entries()].map(([component, a]) => {
        let partner: string | null = null, partnerCommits = 0
        for (const [o, n] of a.with) if (n > partnerCommits || (n === partnerCommits && partner !== null && o < partner)) { partner = o; partnerCommits = n }
        return { component, commits: a.commits, alone: a.alone, partner, partnerCommits, partners: a.with.size }
    })
}

// ── Labels ──────────────────────────────────────────────────────────────

/**
 * The shortest tail of each component name that no other name in the set
 * shares: `Grid` alone when it is unique, `AdminBundle\Grid` when two
 * components end in the same segment.
 */
export function shortTails(names: string[]): Map<string, string> {
    const parts = new Map(names.map(n => [n, n.split(/[./\\:]/).filter(Boolean)] as const))
    const out = new Map<string, string>()
    for (const n of names) {
        const p = parts.get(n)!
        let depth = 1
        const tail = (d: number) => p.slice(-d).join(n.includes("\\") ? "\\" : n.includes("/") ? "/" : ".")
        while (depth < p.length && names.some(o => o !== n && (parts.get(o)!.slice(-depth).join("\u0000") === p.slice(-depth).join("\u0000")))) depth++
        out.set(n, tail(depth) || n)
    }
    return out
}
