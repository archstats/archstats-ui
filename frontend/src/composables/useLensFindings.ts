import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useDataStore } from "~/stores/data"
import { useGroupsStore, type Declaration } from "~/stores/groups"
import { useScopeStore } from "~/stores/scope"
import { resolveGroupEdges, targetKey, type EdgeRow, type GroupEdgeResult, type LensGroup, type TargetFiles } from "~/utils/groupEdges"
import { crossingCount, crossings, type Crossing } from "~/utils/lensRules"
import { sqlLiteral } from "~/utils/sql"

// A lens's declared dependencies checked against a snapshot's imports. The
// loader takes a query function so Changes can run the same check on the
// baseline snapshot; the view composable runs it on the open one.

export type Query = (sql: string) => Promise<any[]>

export interface LensCheck {
    crossings: Crossing[]
    count: number
    unplacedFrom: number
    unplacedTo: number
    ambiguous: number
}

const EMPTY: LensCheck = { crossings: [], count: 0, unplacedFrom: 0, unplacedTo: 0, ambiguous: 0 }

async function tables(q: Query): Promise<Set<string>> {
    const rows = await q(`SELECT name FROM sqlite_master WHERE type IN ('table','view')`)
    return new Set(rows.map(r => String(r.name)))
}

/** Every import of a snapshot, read at a lens's group level. */
export async function resolveLensEdges(q: Query, groups: LensGroup[], keepFile: (file: string, component: string) => boolean = () => true): Promise<{ result: GroupEdgeResult; have: Set<string> } | null> {
    const have = await tables(q)
    if (!have.has("component_connections_direct")) return null
    const cols = new Set((await q(`SELECT name FROM pragma_table_info('component_connections_direct')`)).map(r => String(r.name)))
    const kind = cols.has("kind") ? "coalesce(kind, 'import')" : "'import'"
    const rows: EdgeRow[] = (await q(`SELECT "from", "to", file, sum(reference_count) AS refs, ${kind} AS kind FROM component_connections_direct WHERE "from" <> "to" GROUP BY 1, 2, 3, 5`))
        .filter(r => keepFile(String(r.file), String(r.from)))
        .map(r => ({ from: String(r.from), to: String(r.to), file: String(r.file), refs: Number(r.refs) || 0, kind: String(r.kind) }))
    const targets: TargetFiles = new Map()
    if (have.has("unit_connections")) {
        for (const r of await q(`SELECT DISTINCT from_file, to_component, to_file FROM unit_connections WHERE from_component <> to_component`)) {
            const k = targetKey(String(r.from_file), String(r.to_component))
            targets.set(k, [...(targets.get(k) ?? []), String(r.to_file)])
        }
    }
    return { result: resolveGroupEdges(rows, groups, targets), have }
}

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
    return { crossings: cs, count: crossingCount(cs), unplacedFrom: resolved.unplacedFrom, unplacedTo: resolved.unplacedTo, ambiguous: resolved.ambiguous }
}

/** The groups of a lens as groupEdges reads them. */
export function lensGroups(dimension: string): LensGroup[] {
    const groups = useGroupsStore()
    return groups.groups.filter(g => g.dimension === dimension).map(g => ({
        id: g.id,
        name: g.name,
        files: groups.filesOf(g),
        components: new Map([...groups.componentsOf(g)].map(([c, cov]) => [c, { whole: cov.full }])),
    }))
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
