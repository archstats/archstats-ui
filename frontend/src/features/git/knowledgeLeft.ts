// Can you still ask someone about this code? Per component, one answer on a
// four-step ladder, from people who are still here:
//
//   wrote   they wrote a quarter or more of its lines
//   works   they made two or more commits to it in the window
//   once    one of them made one commit to it in the window
//   nobody  none of the above
//
// "Still here" is a commit anywhere in the repository within the window,
// counted back from the snapshot's anchor. Bots, merges and sweeping commits
// (renames, reformats: more than SWEEP_FILES files) never count as working on
// something. Lines are lines added, not blame, as everywhere authors are counted.

import { canonicalAuthorSql, NOT_BOT_SQL, type AliasMap } from "./authors"
import { t } from "~/shared/i18n"

export const HERE_WINDOWS = [
    { id: "180", label: "180 d", days: 180 },
    { id: "365", label: "1 y", days: 365 },
    { id: "730", label: "2 y", days: 730 },
] as const
export type HereWindowId = (typeof HERE_WINDOWS)[number]["id"]

/** A quarter of the lines written by people still here is "they wrote it". */
export const WROTE = 0.25
const SWEEP_FILES = 100

export const STATES = [
    { id: "wrote", label: t("git.knowledgeLeft.writtenActiveContributors"), short: t("git.knowledgeLeft.written") },
    { id: "works", label: t("git.knowledgeLeft.changedActiveContributors"), short: t("git.knowledgeLeft.changed") },
    { id: "once", label: t("git.knowledgeLeft.changedOnce"), short: t("git.knowledgeLeft.changedOnce") },
    { id: "nobody", label: t("git.knowledgeLeft.noActiveContributor"), short: t("git.knowledgeLeft.none") },
] as const
export type StateId = (typeof STATES)[number]["id"]

/**
 * One row per component and author: lines added to the component's current
 * files, their last commit to it, their commits to it in each window, and how
 * many days before the anchor they last committed anywhere.
 */
export function knowledgePairsSql(opts: { aliases: AliasMap; includeBots: boolean; anchor: string; where?: string | null }): string {
    const bots = opts.includeBots ? "" : ` AND ${NOT_BOT_SQL}`
    const recent = (d: number) => `count(DISTINCT CASE WHEN c.real AND c.t > ${opts.anchor} - ${d} THEN c.commit_hash END) AS recent_${d}`
    return `
    WITH seen AS (
      SELECT ${canonicalAuthorSql(opts.aliases, "author_name")} AS author, max(julianday(commit_time)) AS t
      FROM git_commits WHERE 1${bots} GROUP BY 1
    ), sweep AS (
      SELECT commit_hash FROM git_commits GROUP BY 1 HAVING count(DISTINCT file) > ${SWEEP_FILES}
    ), c AS (
      SELECT ${canonicalAuthorSql(opts.aliases, "c.author_name")} AS author, f.component AS component, c.commit_hash AS commit_hash,
             CASE WHEN c.commit_message LIKE 'Merge %' THEN 0 ELSE coalesce(c.file_additions, 0) END AS a, c.commit_time AS commit_time, julianday(c.commit_time) AS t,
             (c.commit_message NOT LIKE 'Merge %' AND c.commit_hash NOT IN (SELECT commit_hash FROM sweep)) AS real
      FROM git_commits c JOIN files f ON f.name = c.file
      WHERE f.component IS NOT NULL AND f.component <> ''${bots}${opts.where ? ` AND (${opts.where})` : ""}
    )
    SELECT c.component AS component, c.author AS author, sum(c.a) AS added, max(c.commit_time) AS last,
           ${opts.anchor} - max(seen.t) AS idle, ${HERE_WINDOWS.map(w => recent(w.days)).join(", ")}
    FROM c JOIN seen ON seen.author = c.author
    GROUP BY 1, 2`
}

export interface KnowledgePair {
    component: string; author: string; added: number; last: string; idle: number
    recent_180: number; recent_365: number; recent_730: number
}

export interface Holder {
    author: string
    added: number
    /** Share of the component's lines added. */
    share: number
    /** Commits to it in the window (not merges, not sweeps). */
    recent: number
    /** Last commit to this component. */
    last: string
    /** Days before the anchor this person last committed anywhere. */
    idle: number
    here: boolean
}

export interface KnowledgeRow {
    component: string
    /** Lines of code now; the area on the map. */
    lines: number
    added: number
    state: StateId
    /** Share of the lines added that people still here wrote. */
    hereShare: number
    /** Commits to it in the window by people still here. */
    hereCommits: number
    /** The person still here to ask: most commits in the window, then most lines. */
    ask: Holder | null
    /** Everyone who added lines or committed, most lines first. */
    holders: Holder[]
    /** Whoever added the most of its lines, here or not. */
    main: Holder | null
}

export function stateOf(hereShare: number, hereCommits: number): StateId {
    if (hereShare >= WROTE) return "wrote"
    if (hereCommits >= 2) return "works"
    if (hereCommits === 1) return "once"
    return "nobody"
}

export function buildKnowledge(pairs: KnowledgePair[], lines: Map<string, number>, windowDays: number): KnowledgeRow[] {
    const key = `recent_${windowDays}` as "recent_180" | "recent_365" | "recent_730"
    const byComponent = new Map<string, KnowledgePair[]>()
    for (const p of pairs) {
        if (!p.component) continue
        const list = byComponent.get(p.component) ?? []
        list.push(p)
        byComponent.set(p.component, list)
    }
    const rows: KnowledgeRow[] = []
    for (const [component, list] of byComponent) {
        const total = list.reduce((s, p) => s + (Number(p.added) || 0), 0)
        const holders: Holder[] = list.map(p => {
            const idle = Number(p.idle)
            return {
                author: p.author, added: Number(p.added) || 0, share: total ? (Number(p.added) || 0) / total : 0,
                recent: Number(p[key]) || 0, last: p.last, idle, here: Number.isFinite(idle) && idle <= windowDays,
            }
        }).sort((a, b) => b.added - a.added || b.recent - a.recent || a.author.localeCompare(b.author))
        const here = holders.filter(h => h.here)
        const hereShare = here.reduce((s, h) => s + h.share, 0)
        const hereCommits = here.reduce((s, h) => s + h.recent, 0)
        const ask = [...here].sort((a, b) => b.recent - a.recent || b.added - a.added)[0] ?? null
        const state = stateOf(hereShare, hereCommits)
        rows.push({
            component, lines: lines.get(component) || total, added: total, state, hereShare, hereCommits,
            // Nobody to ask about code nobody here wrote or worked on.
            ask: state === "nobody" ? null : ask,
            holders, main: holders[0]?.added ? holders[0] : null,
        })
    }
    return rows
}

export interface KnowledgeSummary {
    components: number
    lines: number
    /** Lines and components per state. */
    byState: Record<StateId, { components: number; lines: number }>
    peopleHere: number
    people: number
}

export function summarise(rows: KnowledgeRow[]): KnowledgeSummary {
    const byState = Object.fromEntries(STATES.map(s => [s.id, { components: 0, lines: 0 }])) as KnowledgeSummary["byState"]
    const people = new Set<string>(), here = new Set<string>()
    let lines = 0
    for (const r of rows) {
        byState[r.state].components++
        byState[r.state].lines += r.lines
        lines += r.lines
        for (const h of r.holders) { people.add(h.author); if (h.here) here.add(h.author) }
    }
    return { components: rows.length, lines, byState, peopleHere: here.size, people: people.size }
}

export interface PersonHoldings {
    /** Components they are the one to ask about. */
    keeps: number
    /** Of those, the ones only they, of the people here, worked on or wrote. */
    only: number
}

export function holdingsByPerson(rows: KnowledgeRow[]): Map<string, PersonHoldings> {
    const out = new Map<string, PersonHoldings>()
    for (const r of rows) {
        if (!r.ask) continue
        const h = out.get(r.ask.author) ?? { keeps: 0, only: 0 }
        h.keeps++
        if (r.holders.filter(x => x.here && (x.recent > 0 || x.share >= 0.1)).length === 1) h.only++
        out.set(r.ask.author, h)
    }
    return out
}

// ── The map's hierarchy ─────────────────────────────────────────────────
// Components nest by name (`src/oscar/apps/dashboard/offers`). The map groups
// them by the first split that means something: a prefix nearly everything
// shares (`src/oscar/`) is folded away, single-child chains are joined, and a
// component that also has children keeps its own files as a child of itself.

export interface TreeNode {
    /** The path from the root, as written in the component names. */
    path: string
    /** The part of the path this node adds. */
    label: string
    children: TreeNode[]
    row?: KnowledgeRow
}

export function knowledgeTree(rows: KnowledgeRow[]): TreeNode {
    // path: the name up to and including this segment; from: where this node's own label starts in it.
    type Build = { path: string; from: number; kids: Map<string, Build>; row?: KnowledgeRow }
    const root: Build = { path: "", from: 0, kids: new Map() }
    for (const r of rows) {
        const segs = r.component === "." ? ["."] : r.component.split(/[./\\:]/)
        let node = root, at = 0
        for (const seg of segs) {
            const from = node === root ? 0 : at + 1
            at = from + seg.length
            let next = node.kids.get(seg)
            if (!next) { next = { path: r.component.slice(0, at), from, kids: new Map() }; node.kids.set(seg, next) }
            node = next
        }
        node.row = r
    }
    const weight = new Map<Build, number>()
    const w = (b: Build): number => {
        if (weight.has(b)) return weight.get(b)!
        let s = b.row ? Math.max(1, b.row.lines) : 0
        for (const k of b.kids.values()) s += w(k)
        weight.set(b, s)
        return s
    }
    const finish = (b: Build, from = b.from): TreeNode => {
        // Join a chain of single children with no component of their own.
        let cur = b
        while (!cur.row && cur.kids.size === 1) cur = [...cur.kids.values()][0]
        const kids = [...cur.kids.values()].map(k => finish(k))
        if (cur.row && kids.length) kids.unshift({ path: cur.path, label: t("git.knowledgeLeft.ownFiles"), children: [], row: cur.row })
        return { path: cur.path, label: cur.path.slice(from), children: kids, row: kids.length ? undefined : cur.row }
    }
    // Fold away a prefix that holds four fifths of the code or more.
    let top: Build = root
    const others: Build[] = []
    for (;;) {
        const kids = [...top.kids.values()]
        const big = kids.find(k => w(k) >= 0.8 * w(top) && k.kids.size > 0 && !k.row)
        if (!big) break
        others.push(...kids.filter(k => k !== big))
        top = big
    }
    const groups = [...top.kids.values()].map(k => finish(k)).concat(others.map(k => finish(k, 0)))
    if (top.row) groups.unshift({ path: top.path, label: t("git.knowledgeLeft.ownFiles"), children: [], row: top.row })
    return { path: top.path, label: top.path, children: groups }
}

// ── The people to ask ───────────────────────────────────────────────────

export interface PersonToAsk {
    author: string
    /** Components they are the one to ask about, largest first. */
    components: KnowledgeRow[]
    lines: number
    /** Lines per state across those components. */
    byState: Record<Exclude<StateId, "nobody">, number>
    /** Of those, the ones no other person still here wrote a tenth of or committed to. */
    only: number
}

/** Everyone still here who is the one to ask about something, most code first. */
export function peopleToAsk(rows: KnowledgeRow[]): { people: PersonToAsk[]; known: number; half: number } {
    const map = new Map<string, PersonToAsk>()
    let known = 0
    for (const r of rows) {
        if (!r.ask || r.state === "nobody") continue
        const p = map.get(r.ask.author) ?? { author: r.ask.author, components: [], lines: 0, byState: { wrote: 0, works: 0, once: 0 }, only: 0 }
        p.components.push(r)
        p.lines += r.lines
        p.byState[r.state] += r.lines
        if (r.holders.filter(h => h.here && (h.recent > 0 || h.share >= 0.1)).length <= 1) p.only++
        map.set(r.ask.author, p)
        known += r.lines
    }
    const people = [...map.values()].sort((a, b) => b.lines - a.lines || a.author.localeCompare(b.author))
    for (const p of people) p.components.sort((a, b) => b.lines - a.lines)
    // How few people are the one to ask about half of the code someone here knows.
    let half = 0, sum = 0
    for (const p of people) { if (sum >= known / 2) break; sum += p.lines; half++ }
    return { people, known, half }
}
