import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { isTestPath } from "~/features/snapshot/fileRole"
import { loadFileGraph, type FileGraph } from "./fileGraph"

// The open snapshot's file import graph, shared by the structure checks and
// the restructure planner, loaded once per snapshot. Changes and drift load
// other snapshots' graphs the same way (fileGraph.ts).

const EMPTY: FileGraph = {
    data: { files: [], tests: new Set(), production: new Set(), lines: new Map(), edges: [], markers: new Map(), units: [], seen: new Set(), component: new Map() },
    code: [], production: new Set(), edges: [], blind: [], blindExt: [], coverageShare: 1, inferred: [],
}
const cache = new Map<string, Promise<FileGraph>>()

export function useFileGraph() {
    const store = useDataStore()
    const key = () => String(store.datasetKey ?? "")
    const { data: graph, loading, error } = useAsyncQuery<FileGraph>(() => {
        const k = key()
        if (!cache.has(k)) cache.set(k, loadFileGraph(sql => store.query<any>(sql), isTestPath).catch(e => { cache.delete(k); throw e }))
        return cache.get(k)!
    }, [key], { initial: EMPTY })

    return {
        data: computed(() => graph.value.data),
        loading,
        error,
        /** Code files, tests included: a .vue file the engine never parsed is unseen, not dead. */
        codeFiles: computed(() => graph.value.code),
        production: computed(() => graph.value.production),
        blindExt: computed(() => graph.value.blindExt),
        coverageShare: computed(() => graph.value.coverageShare),
        inferred: computed(() => graph.value.inferred),
        edges: computed(() => graph.value.edges),
    }
}
