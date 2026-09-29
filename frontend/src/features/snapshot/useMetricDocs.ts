import { computed } from "vue"
import { useDataStore } from "./data.store"
import { referenceEntries, type ReferenceEntry } from "./definition"

// A metric's definition by its column id, the same entry the metric
// reference shows: the snapshot's own definitions, and the numbers the app
// computes. Wherever a metric column is shown, this is what explains it.

export type MetricDoc = ReferenceEntry

export function useMetricDocs() {
    const data = useDataStore()
    const byId = computed(() => new Map(referenceEntries(data.definitions.values()).map(e => [e.id, e])))
    const define = (id: string): MetricDoc | null => byId.value.get(id) ?? null
    /** Where the reference opens on a metric. */
    const referenceRoute = (id: string) => ({ path: "/views/reference", query: { m: id } })
    return { define, referenceRoute }
}
