import { computed } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { fileHealthSql } from "~/composables/useHealth"
import { useDataStore } from "~/stores/data"
import { useStateStore } from "~/stores/state"
import { fixPattern } from "~/utils/commitPattern"
import { effortLede, effortShares, effortSql, lowFileShareSql, share, type EffortCommit } from "~/utils/effort"
import { HISTORY_PERIODS, historyAnchor, type HistoryPeriodId } from "~/utils/history"
import { scopeWhere } from "~/utils/scopeSql"

// Where change effort goes, for Activity: its summary line and its Effort
// tab read the same rows. The window and the threshold are kept per
// workspace, like the history range.

export function useEffort() {
    const data = useDataStore()
    const state = useStateStore()

    const threshold = computed({
        get: () => { const v = Number(state.get<number>("effort.threshold", 5)); return Number.isFinite(v) && v > 0 ? v : 5 },
        set: (v: number) => state.set("effort.threshold", v === 5 ? null : v),
    })
    const windowId = computed<HistoryPeriodId>({
        get: () => { const v = state.get<string>("effort.window", "90"); return (HISTORY_PERIODS.some(p => p.id === v) ? v : "90") as HistoryPeriodId },
        set: (v) => state.set("effort.window", v === "90" ? null : v),
    })
    const days = computed(() => HISTORY_PERIODS.find(p => p.id === windowId.value)?.days ?? null)
    const available = computed(() => data.hasView("git_commits") && data.hasView("component_strongly_connected_groups"))

    const { data: rows, loading, error } = useAsyncQuery<EffortCommit[]>(
        () => (available.value ? data.query<EffortCommit>(effortSql(threshold.value, scopeWhere("c.file"), fileHealthSql("f.codesmells__code_health"))) : Promise.resolve([])),
        [() => data.datasetKey, () => threshold.value, () => scopeWhere("c.file"), () => available.value],
        { initial: [] },
    )
    const { data: fileShareRows } = useAsyncQuery<Array<{ low: number; rated: number }>>(
        () => (available.value ? data.query(lowFileShareSql(threshold.value, scopeWhere("name"), fileHealthSql())) : Promise.resolve([])),
        [() => data.datasetKey, () => threshold.value, () => scopeWhere("name"), () => available.value],
        { initial: [] },
    )
    const lowFiles = computed(() => { const r = fileShareRows.value[0]; return r && Number(r.rated) ? share(Number(r.low), Number(r.rated)) : null })

    const anchor = computed(() => { void data.datasetKey; return historyAnchor().date })
    const fix = computed(() => { void state.get("git.fixPattern", ""); return fixPattern() })
    const rangeOf = (d: number | null) => ({ from: d === null ? null : anchor.value.getTime() - d * 86400000, to: anchor.value.getTime() })
    const sharesFor = (d: number | null) => { const r = rangeOf(d); return effortShares(rows.value, r.from, r.to, fix.value) }
    const shares = computed(() => sharesFor(days.value))
    const lede = computed(() => (rows.value.length ? effortLede(shares.value, days.value, anchor.value, threshold.value, lowFiles.value) : ""))

    return { available, rows, loading, error, threshold, windowId, days, anchor, fix, lowFiles, shares, sharesFor, rangeOf, lede }
}
