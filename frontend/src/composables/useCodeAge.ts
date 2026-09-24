import { computed, type ComputedRef, type Ref } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useDataStore } from "~/stores/data"
import { anchorSql } from "~/utils/history"

// How long since each file last changed, counted back from the scan's anchor
// (the head commit from revision 2). A pure rename is not a change: a moved
// file keeps its age. Revision 2 records the number per file; older snapshots
// are counted here from git_commits the same way.

export const LAST_CHANGED = "app__last_changed_days"

/** Line-weighted shares of code untouched for more than one, two and five years. */
export interface AgeShares { over1: number; over2: number; over5: number; lines: number }

export function ageShares(files: Array<{ lines: number; days: number | null | undefined }>): AgeShares {
    let lines = 0, o1 = 0, o2 = 0, o5 = 0
    for (const f of files) {
        if (f.days === null || f.days === undefined || !Number.isFinite(f.days)) continue
        const l = Number(f.lines) || 0
        lines += l
        if (f.days > 365) o1 += l
        if (f.days > 730) o2 += l
        if (f.days > 1825) o5 += l
    }
    return lines ? { over1: o1 / lines, over2: o2 / lines, over5: o5 / lines, lines } : { over1: 0, over2: 0, over5: 0, lines: 0 }
}

export function lastChangedSql(): string {
    const data = useDataStore()
    if (data.hasColumn("files", "git__last_change_age_in_days")) {
        return "SELECT name AS file, git__last_change_age_in_days AS days FROM files WHERE git__last_change_age_in_days IS NOT NULL"
    }
    return `SELECT file, ${anchorSql()} - julianday(max(commit_time)) AS days FROM git_commits
      WHERE file IN (SELECT name FROM files) AND coalesce(file_additions, 0) + coalesce(file_deletions, 0) > 0 GROUP BY file`
}

export function useCodeAge(): { available: ComputedRef<boolean>; byFile: Ref<Map<string, number>>; byComponent: ComputedRef<Map<string, number>>; loading: Ref<boolean> } {
    const data = useDataStore()
    const available = computed(() => data.hasData && data.hasView("git_commits"))
    const { data: byFile, loading } = useAsyncQuery<Map<string, number>>(
        async () => {
            if (!available.value) return new Map()
            const rows = await data.query<{ file: string; days: number }>(lastChangedSql())
            return new Map(rows.map(r => [r.file, Math.max(0, Number(r.days))]))
        },
        [() => data.datasetKey],
        { initial: new Map() },
    )
    // A component is as recently changed as its most recently changed file.
    const byComponent = computed(() => {
        const out = new Map<string, number>()
        const idx = data.fileComponentIndex
        for (const [file, days] of byFile.value) {
            const c = idx.get(file)
            if (!c) continue
            const prev = out.get(c)
            if (prev === undefined || days < prev) out.set(c, days)
        }
        return out
    })
    return { available, byFile, byComponent, loading }
}
