import { comparability, type ComparableScan } from "./comparability"
import { compareScans, newestFirst, type OrderedScan } from "~/features/workspace/scanOrder"

// Changes: what the code did since a point in its history.
//
// The question an architect asks is "since the last release" or "in the last
// three months", not "between scan 7 and scan 9". Most workspaces hold several
// scans of one commit (a rescan after every engine upgrade), so picking two
// scans compares the analysis with itself. A point in history resolves to a
// commit; a snapshot of that commit read the same way as the open one is
// used when it exists, and scanned in a clone when it does not.

export type Since =
    /** A scan picked by hand (or the previous one): its commit is the point. */
    | { kind: "scan"; id: string }
    /** The commit HEAD was at this many months before the open snapshot's code. */
    | { kind: "ago"; months: number }
    /** A tag, branch or commit the git history knows. */
    | { kind: "ref"; ref: string }

export const AGO_MONTHS = [1, 3, 6, 12] as const

export function parseSince(q: unknown): Since | null {
    if (typeof q !== "string" || !q) return null
    const m = /^(\d{1,2})m$/.exec(q)
    if (m) return { kind: "ago", months: Number(m[1]) }
    if (q.startsWith("ref:") && q.length > 4) return { kind: "ref", ref: q.slice(4) }
    if (q.startsWith("scan:") && q.length > 5) return { kind: "scan", id: q.slice(5) }
    return null
}

export function sinceKey(s: Since): string {
    return s.kind === "ago" ? `${s.months}m` : s.kind === "ref" ? `ref:${s.ref}` : `scan:${s.id}`
}

/** The same calendar day `months` earlier (the 31st falls back to the month's last day). */
export function monthsBefore(when: Date, months: number): Date {
    const d = new Date(when)
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - months)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
    return d
}

export interface CommitScan extends OrderedScan, ComparableScan {
    headCommit?: string
    label?: string
}

/** Two ways of writing one commit: a full hash and its short form. */
export function sameCommit(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false
    const n = Math.min(a.length, b.length)
    return n >= 7 && a.slice(0, n).toLowerCase() === b.slice(0, n).toLowerCase()
}

/**
 * The complete snapshots of one commit, apart from head itself: the ones read
 * the same way as head first (newest scan first), then the rest.
 */
export function snapshotsOf<T extends CommitScan>(scans: T[], sha: string, head: T): { comparable: T[]; other: T[] } {
    const of = scans.filter(s => s.id !== head.id && (s.status ?? "complete") === "complete" && sameCommit(s.headCommit, sha))
    const byRun = (a: T, b: T) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    const ok = (s: T) => comparability(s, head).ok
    return { comparable: of.filter(ok).sort(byRun), other: of.filter(s => !ok(s)).sort(byRun) }
}

/**
 * The newest snapshot of older code than head, of another commit, read the
 * same way: what "previous" means. A rescan of head's own commit is not
 * previous code; comparing it finds only what the engine changed.
 */
export function previousComparable<T extends CommitScan>(scans: T[], head: T): T | null {
    const older = newestFirst(scans.filter(s => s.id !== head.id && (s.status ?? "complete") === "complete" && compareScans(s, head) < 0))
    return older.find(s => !(head.headCommit && sameCommit(s.headCommit, head.headCommit)) && comparability(s, head).ok) ?? null
}

/**
 * Where Changes starts when nothing is asked: the pinned baseline, when it is
 * another commit read alike; else the previous comparable snapshot; else three
 * months back, which is one scan away.
 */
export function defaultSince<T extends CommitScan>(scans: T[], head: T, baselineId?: string | null): Since {
    const pinned = baselineId ? scans.find(s => s.id === baselineId && (s.status ?? "complete") === "complete") : null
    if (pinned && pinned.id !== head.id && !sameCommit(pinned.headCommit, head.headCommit) && comparability(pinned, head).ok) return { kind: "scan", id: pinned.id }
    const prev = previousComparable(scans, head)
    if (prev) return { kind: "scan", id: prev.id }
    return { kind: "ago", months: 3 }
}

export interface ResolvedCommit { sha: string; time: string; subject: string }

/**
 * Where a resolved point stands:
 * - `same`: it is head's own commit, so the code did not change;
 * - `ready`: a snapshot of it reads alike with head;
 * - `outdated`: head was read by an older analysis than this build, so a new
 *   scan of the point would not compare with it either;
 * - `scan`: it needs a scan (`other` holds snapshots of it read another way).
 */
export type Readiness<T> =
    | { state: "same" }
    | { state: "ready"; base: T }
    | { state: "outdated"; other: T[] }
    | { state: "scan"; other: T[] }

export function readiness<T extends CommitScan>(scans: T[], head: T, commit: ResolvedCommit, engineRevision: number | null | undefined): Readiness<T> {
    if (head.headCommit && sameCommit(commit.sha, head.headCommit)) return { state: "same" }
    const { comparable, other } = snapshotsOf(scans, commit.sha, head)
    if (comparable.length) return { state: "ready", base: comparable[0] }
    if (engineRevision && (head.analysisRevision ?? 0) !== engineRevision) return { state: "outdated", other }
    return { state: "scan", other }
}
