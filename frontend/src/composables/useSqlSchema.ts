// A snapshot's schema for the SQL editor: every table and view with its
// columns and types in one query, metrics described in the snapshot's own
// words, and the values a column holds, most common first, for completing
// what goes between quotes. Kept per snapshot for the session.

import { ref, watch, type Ref } from "vue"
import { QueryIn } from "wailsjs/go/app/QueryService"
import { useDataStore } from "~/stores/data"
import type { SqlSchema, SqlTable } from "~/utils/sqlLang"

const cache = new Map<string, Promise<SqlTable[]>>()

function load(scanId: string): Promise<SqlTable[]> {
    let p = cache.get(scanId)
    if (!p) {
        p = (async () => {
            const rows = (await QueryIn(scanId, `SELECT m.name AS t, m.type AS kind, p.name AS c, p.type AS ty FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, p.cid`)) as any[]
            const by = new Map<string, SqlTable>()
            for (const r of rows ?? []) {
                const name = String(r.t)
                let t = by.get(name)
                if (!t) by.set(name, (t = { name, columns: [], view: r.kind === "view" }))
                t.columns.push({ name: String(r.c), type: String(r.ty ?? "") })
            }
            return [...by.values()]
        })()
        p.catch(() => cache.delete(scanId))
        cache.set(scanId, p)
    }
    return p
}

export interface ValueHit { value: string; rows: number }

export function useSqlSchema(scanId: Ref<string | null | undefined>) {
    const data = useDataStore()
    const tables = ref<SqlTable[]>([])
    watch(scanId, async (id) => {
        tables.value = []
        if (!id) return
        try { const t = await load(id); if (scanId.value === id) tables.value = t } catch { /* an unreadable snapshot has no schema to offer */ }
    }, { immediate: true })

    const describe = (column: string) => {
        if (!column.includes("__")) return null
        const d: any = data.definitions.get(column)
        const name = data.statNiceName(column)
        const short = d?.short_description || d?.short || ""
        return name && name !== column ? { name, short } : short ? { name: column, short } : null
    }
    const schema = (): SqlSchema => ({ tables: tables.value, describe })

    /** Values of a column that contain the prefix, those starting with it first, then the most common. */
    async function values(table: string, column: string, prefix: string): Promise<ValueHit[]> {
        const id = scanId.value
        if (!id) return []
        const col = `"${column.replace(/"/g, '""')}"`
        const tab = `"${table.replace(/"/g, '""')}"`
        const lit = `'${prefix.replace(/'/g, "''").replace(/[\\%_]/g, m => "\\" + m)}'`
        const where = prefix ? `WHERE ${col} LIKE '%' || ${lit} || '%' ESCAPE '\\'` : `WHERE ${col} IS NOT NULL`
        const rows = (await QueryIn(id, `SELECT ${col} AS v, count(*) AS n FROM ${tab} ${where} GROUP BY 1 ORDER BY (lower(${col}) LIKE lower(${lit}) || '%' ESCAPE '\\') DESC, n DESC, 1 LIMIT 60`).catch(() => [])) as any[]
        return (rows ?? []).filter(r => r.v !== null && r.v !== undefined).map(r => ({ value: String(r.v), rows: Number(r.n) || 0 }))
    }

    return { tables, schema, values }
}
