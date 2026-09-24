// A lens read at its own grain: every import of a snapshot re-read as an
// edge between the lens's groups. The loader takes a query function so a
// view can read the open snapshot and Changes can read the baseline.
import { useGroupsStore } from "./groups.store"
import { resolveGroupEdges, targetKey, type EdgeRow, type GroupEdgeResult, type LensGroup, type TargetFiles } from "./groupEdges"

export type Query = (sql: string) => Promise<any[]>

export async function tables(q: Query): Promise<Set<string>> {
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
