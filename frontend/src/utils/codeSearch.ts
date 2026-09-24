import { shallowRef } from "vue"
import { FindInCode, FindLines } from "wailsjs/go/app/QueryService"
import { useDataStore } from "~/stores/data"
import { provideContains } from "~/utils/query"

// Searching the source a snapshot keeps. Results are cached per snapshot,
// needle and toggles: the page asks as a person types, and `contains` lines
// in live groups ask every time a view resolves its lens.

export interface FindOptions { regex: boolean; caseSensitive: boolean; word: boolean }
export interface FileHits { file: string; hits: number }
export interface FindResult { files: FileHits[]; totalHits: number; searched: number; truncated: boolean; elapsedMs: number }
export interface HitLine { line: number; text: string; context: boolean; ranges: Array<[number, number]> | null }

export const PLAIN: FindOptions = { regex: false, caseSensitive: false, word: false }

const results = new Map<string, Promise<FindResult>>()
const keyOf = (scanId: string, needle: string, o: FindOptions) => `${scanId}\u0000${needle}\u0000${+o.regex}${+o.caseSensitive}${+o.word}`

export function findInCode(scanId: string, needle: string, opts: FindOptions = PLAIN): Promise<FindResult> {
    const key = keyOf(scanId, needle, opts)
    let p = results.get(key)
    if (!p) {
        p = (FindInCode(scanId, needle, opts as any) as Promise<any>).then(r => ({ ...r, files: r.files ?? [] }))
        // A failure (a bad pattern) is not worth keeping: the next keystroke asks again.
        p.catch(() => results.delete(key))
        if (results.size > 200) results.delete(results.keys().next().value!)
        results.set(key, p)
    }
    return p
}

export async function findLines(scanId: string, file: string, needle: string, opts: FindOptions = PLAIN): Promise<HitLine[]> {
    return ((await FindLines(scanId, file, needle, opts as any)) ?? []) as any
}

// ── `contains` lines ─────────────────────────────────────────────────────
// runQuery is synchronous and views resolve groups in computeds, so the
// lookup answers from what it has and starts a search for what it has not;
// `answered` is read inside, so every computed that asked recomputes when
// the answer lands.

const answered = shallowRef(0)
const containsCache = new Map<string, { components: Set<string>; files: Set<string> } | null>()

function containsLookup(needle: string) {
    void answered.value
    const data = useDataStore()
    const scanId = String(data._openScanId ?? "")
    if (!scanId) return undefined
    const key = `${scanId}\u0000${needle}`
    if (containsCache.has(key)) return containsCache.get(key) ?? undefined
    containsCache.set(key, null)
    findInCode(scanId, needle).then(r => {
        const files = new Set(r.files.map(f => f.file))
        const components = new Set<string>()
        for (const f of files) { const c = data.fileComponentIndex.get(f); if (c) components.add(c) }
        containsCache.set(key, { components, files })
    }, () => containsCache.set(key, { components: new Set(), files: new Set() })).finally(() => { answered.value++ })
    return undefined
}

provideContains(containsLookup)
