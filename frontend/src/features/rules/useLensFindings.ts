import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore, type Declaration } from "~/features/groups/groups.store"
import { useScopeStore } from "~/features/groups/scope.store"
import { type LensGroup } from "~/features/groups/groupEdges"
import { lensGroups, resolveLensEdges, type Query } from "~/features/groups/lensEdges"
import { crossingCount, crossings, silentCycles, type Crossing, type SilentCycle } from "./lensRules"
import { sqlLiteral } from "~/shared/sql"

// A lens's declared dependencies checked against a snapshot's imports. The
// loader takes a query function so Changes can run the same check on the
// baseline snapshot; the view composable runs it on the open one.

export interface LensCheck {
    crossings: Crossing[]
    count: number
    unplacedFrom: number
    unplacedTo: number
    ambiguous: number
    /** Cycles between groups that cross nothing declared. */
    silent: SilentCycle[]
}

const EMPTY: LensCheck = { crossings: [], count: 0, unplacedFrom: 0, unplacedTo: 0, ambiguous: 0, silent: [] }

export async function checkLens(q: Query, groups: LensGroup[], declared: Declaration, keepFile: (file: string, component: string) => boolean = () => true): Promise<LensCheck> {
    if (groups.length < 2) return EMPTY
    const loaded = await resolveLensEdges(q, groups, keepFile)
    if (!loaded) return EMPTY
    const { result: resolved, have } = loaded
    const cs = crossings(resolved.edges, declared)
    // Lines for the crossing imports: the import snippet in the file that
    // names the target. A runtime lookup has no import line; it keeps its file.
    const staticEdges = cs.flatMap(c => c.edges).filter(e => e.kind !== "dynamic")
    if (staticEdges.length && have.has("snippets")) {
        const files = [...new Set(staticEdges.map(e => e.file))]
        const lines = new Map<string, number>()
        for (let i = 0; i < files.length; i += 400) {
            const chunk = files.slice(i, i + 400).map(sqlLiteral).join(", ")
            for (const r of await q(`SELECT file, content, begin_position FROM snippets WHERE snippet_type = 'modularity__component__imports' AND file IN (${chunk})`)) {
                const line = parseInt(String(r.begin_position).split(":")[0], 10)
                const k = `${r.file}|${r.content}`
                if (Number.isFinite(line) && (!lines.has(k) || line < lines.get(k)!)) lines.set(k, line)
            }
        }
        for (const e of staticEdges) e.line = lines.get(`${e.file}|${e.toComponent}`) ?? null
    }
    for (const c of cs) for (const e of c.edges) if (e.kind === "dynamic") e.line = null
    return { crossings: cs, count: crossingCount(cs), unplacedFrom: resolved.unplacedFrom, unplacedTo: resolved.unplacedTo, ambiguous: resolved.ambiguous, silent: silentCycles(resolved.edges, declared) }
}

/** The open snapshot checked against a lens's declaration, following the Production/Tests switch. */
export function useLensFindings(dimension: Ref<string | null>) {
    const data = useDataStore()
    const groups = useGroupsStore()
    const scope = useScopeStore()
    const declared = computed(() => (dimension.value ? groups.dimensionRecords.find(d => d.name === dimension.value)?.declared ?? null : null))
    const { data: check, loading, error } = useAsyncQuery<LensCheck>(
        async () => {
            if (!dimension.value || !declared.value) return EMPTY
            const facet = scope.facet
            const roles = data.fileRoleIndex
            const keep = facet === "all" ? undefined : (file: string) => (facet === "test") === (roles.get(file) === "test")
            return checkLens(sql => data.query(sql), lensGroups(dimension.value), declared.value, keep)
        },
        [dimension, declared, () => groups.groups, () => scope.facet],
        { initial: EMPTY },
    )
    return { declared, check, loading, error }
}
