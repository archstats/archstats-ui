import { useDataStore } from "~/stores/data"
import { useWorkspacesStore } from "~/stores/workspaces"
import { formatDate } from "~/utils/time"

// What "the last 90 days" counts back from. From analysis revision 2 the
// engine anchors its windows at the newest commit scanned (git_based_on), so
// the same commit reads the same whenever it is scanned; older snapshots
// counted back from the moment of the scan, and their precomputed columns
// still do, so the UI anchors there for them. One snapshot never mixes the
// two.

export const HISTORY_PERIODS = [
    { id: "all", label: "All", title: "All history", days: null as number | null },
    { id: "1y", label: "1 y", title: "Last year", days: 365 },
    { id: "180", label: "180 d", title: "Last 180 days", days: 180 },
    { id: "90", label: "90 d", title: "Last 90 days", days: 90 },
    { id: "30", label: "30 d", title: "Last 30 days", days: 30 },
] as const

export type HistoryPeriodId = (typeof HISTORY_PERIODS)[number]["id"]

export interface HistoryAnchor {
    date: Date
    /** "commit": the newest commit scanned; "scan": when the scan ran. */
    source: "commit" | "scan"
    commit: string
}

export function historyAnchor(): HistoryAnchor {
    const data = useDataStore()
    const info = data.snapshotInfo ?? {}
    const commit = info.git_head_commit ?? ""
    if (info.git_based_on) {
        const d = new Date(info.git_based_on)
        if (!Number.isNaN(d.getTime())) return { date: d, source: "commit", commit }
    }
    const scan: any = useWorkspacesStore().openScan
    const d = scan?.startedAt ? new Date(scan.startedAt) : new Date()
    return { date: Number.isNaN(d.getTime()) ? new Date() : d, source: "scan", commit }
}

/** The anchor as an SQLite julianday expression, for window predicates. */
export function anchorSql(anchor: HistoryAnchor = historyAnchor()): string {
    return `julianday('${anchor.date.toISOString()}')`
}

/** "Last 90 days to 2 Jun 2026 (3f2a91c)", or "… to scan time" for older snapshots. */
export function anchorLabel(days: number | null, anchor: HistoryAnchor = historyAnchor()): string {
    if (days === null) return "All history"
    const span = days === 365 ? "Last year" : `Last ${days} days`
    if (anchor.source === "scan") return `${span} to scan time`
    return `${span} to ${formatDate(anchor.date)}${anchor.commit ? ` (${anchor.commit.slice(0, 7)})` : ""}`
}

/**
 * A note when the scanned commit is much older than the scan: "the last 30
 * days" then means the last 30 days of work, not of the calendar.
 */
export function anchorNote(anchor: HistoryAnchor = historyAnchor()): string {
    if (anchor.source !== "commit") return ""
    const scan: any = useWorkspacesStore().openScan
    if (!scan?.startedAt) return ""
    const gap = Math.round((new Date(scan.startedAt).getTime() - anchor.date.getTime()) / 86400000)
    return gap > 90 ? `Periods count back from the scanned commit, ${gap.toLocaleString("en-US")} days before the scan.` : ""
}
