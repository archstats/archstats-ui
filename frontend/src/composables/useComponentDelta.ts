import { computed, ref, watch, type Ref } from "vue"
import { useDataStore } from "~/stores/data"
import { useWorkspacesStore } from "~/stores/workspaces"
import { sqlLiteral } from "~/utils/sql"
import { deltaFrom, NO_DELTA, type Delta } from "~/utils/delta"

// Reading the same component in an earlier snapshot.
//
// Every scan is kept, so the question "what changed since last time" is
// answerable without storing anything new — it is two rows of the same table
// in two files. The baseline defaults to the scan taken just before the open
// one and can be pointed at any older complete scan.

export function useComponentDelta(name: Ref<string>) {
    const store = useDataStore()
    const workspaces = useWorkspacesStore()

    // Complete scans older than the open one, newest first.
    const candidates = computed(() => {
        const scans = workspaces.scans.filter(s => s.status === "complete")
        const openIndex = scans.findIndex(s => s.id === workspaces.openScanId)
        return openIndex === -1 ? [] : scans.slice(openIndex + 1)
    })

    const chosenId = ref<string | null>(null)
    const baselineScan = computed(() => {
        const list = candidates.value
        if (list.length === 0) return null
        return list.find(s => s.id === chosenId.value) ?? list[0]
    })

    const row = ref<Record<string, any> | null>(null)
    const present = ref(false)
    const loading = ref(false)
    let token = 0

    async function load() {
        const mine = ++token
        const scan = baselineScan.value
        row.value = null
        present.value = false
        if (!scan || !name.value || !store.hasData) return
        loading.value = true
        try {
            const rows = await store.queryIn<Record<string, any>>(
                scan.id,
                `SELECT * FROM components WHERE name = ${sqlLiteral(name.value)} LIMIT 1`,
            )
            if (mine !== token) return
            row.value = rows[0] ?? null
            present.value = rows.length > 0
        } catch {
            // An unreadable baseline is a missing comparison, not an error the
            // reader needs: the deltas simply do not appear.
            if (mine === token) row.value = null
        } finally {
            if (mine === token) loading.value = false
        }
    }

    watch([name, baselineScan, () => store.datasetKey], () => { void load() }, { immediate: true })

    function deltaFor(key: string, current: number | null): Delta {
        if (!baselineScan.value) return NO_DELTA
        return deltaFrom(current, row.value?.[key], true, present.value)
    }

    return {
        /** Older complete scans, newest first. */
        candidates,
        baselineScan,
        chosenId,
        hasBaseline: computed(() => baselineScan.value !== null),
        isNew: computed(() => baselineScan.value !== null && !present.value && !loading.value),
        loading,
        deltaFor,
    }
}
