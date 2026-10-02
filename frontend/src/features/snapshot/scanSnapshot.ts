// A Snapshot of any scan, read with SQL by its id, for exhibits drawn from a
// scan that is not the one open in the window (an older conversation, a
// report cell). Loaded once per scan and kept; the open scan comes from the
// stores instead, so what a view shows and what an exhibit shows are one read.

import type { CyclePath } from "./snapshot"
import { localized } from "./definition"
import type { ConnectionRow, Definition, History, Notes, Snapshot } from "./snapshot"

type Query = <T = any>(sql: string) => Promise<T[]>

const loaded = new Map<string, Promise<Snapshot>>()

export function scanSnapshot(scanId: string, query: Query, o: { workspace: string; author: (name: string) => string; aliases?: () => Record<string, string>; history?: History; notes?: Notes }): Promise<Snapshot> {
    let hit = loaded.get(scanId)
    if (!hit) {
        hit = load(scanId, query, o)
        hit.catch(() => loaded.delete(scanId))
        loaded.set(scanId, hit)
        if (loaded.size > 6) loaded.delete(loaded.keys().next().value!)
    }
    return hit
}

async function load(scanId: string, query: Query, o: { workspace: string; author: (name: string) => string; aliases?: () => Record<string, string>; history?: History; notes?: Notes }): Promise<Snapshot> {
    const tables = (await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")).map(r => String(r.name))
    const columns: Record<string, string[]> = {}
    await Promise.all(tables.map(async t => { columns[t] = (await query<{ name: string }>(`SELECT name FROM pragma_table_info('${t.replace(/'/g, "''")}')`)).map(r => String(r.name)) }))
    const info: Record<string, string> = {}
    if (columns._snapshot) for (const r of await query<{ key: string; value: unknown }>("SELECT key, value FROM _snapshot")) info[r.key] = String(r.value ?? "")
    const components = await query("SELECT * FROM components")
    const direct = columns.component_connections_direct
    const connections: ConnectionRow[] = direct
        ? (await query<ConnectionRow>(`SELECT "from", "to", file, reference_count${direct.includes("kind") ? ", kind" : ""} FROM component_connections_direct`)).filter(r => r.kind !== "type_only")
        : []
    const cycles: CyclePath[] = columns.component_cycles_shortest
        ? (await query<{ cycle: string }>("SELECT DISTINCT cycle FROM component_cycles_shortest")).map((c, i) => {
            const nodes = String(c.cycle).split("->").map(x => x.trim())
            if (nodes.length > 1 && nodes[nodes.length - 1] === nodes[0]) nodes.pop()
            return { id: i + 1, nodes, size: nodes.length, sharedCommits: 0, severity: 0 } as CyclePath
        })
        : []
    const defs = new Map<string, Definition>()
    const defTable = columns._metric_definitions ? "_metric_definitions" : columns.definitions ? "definitions" : ""
    if (defTable) for (const d of await query(`SELECT id, name, short_description, long_description FROM ${defTable}`)) defs.set(d.id, localized({ id: d.id, name: d.name ?? d.id, short: d.short_description ?? "", long: d.long_description ?? "" }))
    const files = await query(`SELECT name, component${columns.files?.includes("role") ? ", role" : ""} FROM files`)
    const fileComponent = new Map(files.map(f => [String(f.name), String(f.component ?? "")]))
    const roles = new Map(files.map(f => [String(f.name), String(f.role ?? "production")]))
    return {
        scanId, info, workspace: o.workspace, columns,
        components: () => components,
        connections: () => connections,
        cycles: () => cycles,
        definitions: () => defs,
        fileComponent: () => fileComponent,
        fileRole: f => roles.get(f) ?? "production",
        query,
        author: o.author,
        aliases: o.aliases,
        history: o.history,
        notes: o.notes,
    }
}
