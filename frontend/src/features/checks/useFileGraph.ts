import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { isTestPath } from "~/features/snapshot/fileRole"
import { CODE_EXTENSIONS, extensionOf } from "~/features/snapshot/coverage"
import { inferEdges, loadChecks, loadUnseenContents, type ChecksData } from "./checks"

// The file import graph the structure checks and the restructure planner
// share: the engine's imports, plus imports read from the text of file types
// the engine did not parse. Loaded once per snapshot.

const EMPTY: ChecksData = { files: [], tests: new Set(), production: new Set(), lines: new Map(), edges: [], markers: new Map(), units: [], seen: new Set(), component: new Map() }
const cache = new Map<string, Promise<ChecksData>>()
const contentCache = new Map<string, Promise<Array<{ file: string; content: string }>>>()

export function useFileGraph() {
    const store = useDataStore()
    const key = () => String(store.datasetKey ?? "")
    const { data, loading, error } = useAsyncQuery<ChecksData>(() => {
        const k = key()
        if (!cache.has(k)) cache.set(k, loadChecks(sql => store.query<any>(sql), (t, c) => (c ? store.hasColumn(t, c) : store.hasView(t)), isTestPath).catch(e => { cache.delete(k); throw e }))
        return cache.get(k)!
    }, [key], { initial: EMPTY })

    // Only code files: a .vue file the engine never parsed is unseen, not dead.
    const codeFiles = computed(() => data.value.files.filter(f => CODE_EXTENSIONS.has(extensionOf(f))))
    const production = computed(() => new Set(codeFiles.value.filter(f => data.value.production.has(f))))
    const extSeen = computed(() => {
        const m = new Map<string, { files: number; seen: number }>()
        for (const f of codeFiles.value) {
            if (data.value.tests.has(f)) continue
            const e = extensionOf(f), c = m.get(e) ?? { files: 0, seen: 0 }
            c.files++
            if (data.value.seen.has(f)) c.seen++
            m.set(e, c)
        }
        return m
    })
    /** File types with three or more production files and no import data at all. */
    const blindExt = computed(() => [...extSeen.value].filter(([, c]) => c.seen === 0 && c.files >= 3).map(([ext, c]) => ({ ext, files: c.files })).sort((a, b) => b.files - a.files))
    const coverageShare = computed(() => { let f = 0, s = 0; for (const c of extSeen.value.values()) { f += c.files; s += c.seen } return f ? s / f : 1 })

    const unseenFiles = computed(() => { const blind = new Set(blindExt.value.map(b => b.ext)); return codeFiles.value.filter(f => blind.has(extensionOf(f))) })
    const { data: unseenContents } = useAsyncQuery<Array<{ file: string; content: string }>>(() => {
        if (!unseenFiles.value.length || !store.hasView("file_contents")) return Promise.resolve([])
        const k = key()
        if (!contentCache.has(k)) contentCache.set(k, loadUnseenContents(sql => store.query<any>(sql), unseenFiles.value).catch(e => { contentCache.delete(k); throw e }))
        return contentCache.get(k)!
    }, [() => unseenFiles.value.length, key], { initial: [] })
    const declared = computed(() => {
        const m = new Map<string, string[]>()
        for (const u of data.value.units) m.set(u.file, [...(m.get(u.file) ?? []), u.name])
        return m
    })
    const inferred = computed(() => inferEdges(unseenContents.value, codeFiles.value, declared.value))
    const edges = computed(() => (inferred.value.length ? [...data.value.edges, ...inferred.value] : data.value.edges))

    return { data, loading, error, codeFiles, production, blindExt, coverageShare, inferred, edges }
}
