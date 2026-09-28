// How a snapshot is named wherever a report or an export mentions it: the
// way the sidebar lists it, by its label or by when it was scanned. The commit
// it read is said beside it, with the commit's own date, so two scans of one
// commit stay apart and a reader can still tell how old the code was.

import { formatScanTime } from "~/shared/time"

interface Named { label?: string | null; startedAt?: unknown; headCommit?: string | null; headTime?: unknown }

/** "24 Sep, 16:12", or the snapshot's label when it has one. */
export function snapshotName(s: Named): string {
    const label = typeof s.label === "string" ? s.label.trim() : ""
    return label || (s.startedAt ? formatScanTime(s.startedAt as any) : "")
}

/** "8645873, committed 4 May, 23:57", or "" when the snapshot read no git history. */
export function commitNote(s: Named): string {
    const sha = s.headCommit ? String(s.headCommit).slice(0, 7) : ""
    if (!sha) return ""
    const when = s.headTime ? formatScanTime(s.headTime as any) : ""
    return when ? `${sha}, committed ${when}` : sha
}
