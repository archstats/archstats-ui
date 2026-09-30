// A World over a snapshot file, for tests and evaluations: the same shape
// the app gives the engine, read straight from SQLite in Node. Never
// imported by the app.

import { createRequire } from "node:module"
import type { CyclePath } from "~/features/cycles/cycles"
import type { ConnectionRow, Definition, World } from "../engine/types"

export function sqliteWorld(path: string, opts: { onScreen?: World["onScreen"] } = {}): World {
    // Through require: Vite would resolve "node:sqlite" as a package called sqlite.
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")
    const db = new DatabaseSync(path, { readOnly: true })
    const all = (sql: string) => db.prepare(sql).all() as any[]

    const tables = all("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").map(r => String(r.name))
    const columns: Record<string, string[]> = {}
    for (const t of tables) columns[t] = all(`PRAGMA table_info("${t}")`).map(r => String(r.name))
    const info: Record<string, string> = {}
    if (columns._snapshot) for (const r of all("SELECT key, value FROM _snapshot")) info[r.key] = String(r.value ?? "")
    const components = all("SELECT * FROM components")
    const connections: ConnectionRow[] = columns.component_connections_direct
        ? all(`SELECT "from", "to", file, reference_count${columns.component_connections_direct.includes("kind") ? ", kind" : ""} FROM component_connections_direct`).filter(r => r.kind !== "type_only")
        : []
    const cycles: CyclePath[] = columns.component_cycles_shortest
        ? all("SELECT DISTINCT cycle, cycle_size FROM component_cycles_shortest").map((c, i) => {
            const nodes = String(c.cycle).split("->").map(s => s.trim())
            if (nodes.length > 1 && nodes[nodes.length - 1] === nodes[0]) nodes.pop()
            return { id: i + 1, nodes, size: nodes.length, sharedCommits: 0, severity: 0 }
        })
        : []
    const defs = new Map<string, Definition>()
    const defTable = columns._metric_definitions ? "_metric_definitions" : columns.definitions ? "definitions" : ""
    if (defTable) for (const d of all(`SELECT id, name, short_description, long_description FROM ${defTable}`)) defs.set(d.id, { id: d.id, name: d.name ?? d.id, short: d.short_description ?? "", long: d.long_description ?? "" })
    const files = all(`SELECT name, component${columns.files?.includes("role") ? ", role" : ""} FROM files`)
    const fileComponent = new Map(files.map(f => [String(f.name), String(f.component ?? "")]))
    const roles = new Map(files.map(f => [String(f.name), String(f.role ?? "production")]))

    return {
        scanId: path,
        info,
        workspace: info.report_id ?? "test",
        columns,
        components: () => components,
        connections: () => connections,
        cycles: () => cycles,
        definitions: () => defs,
        fileComponent: () => fileComponent,
        fileRole: f => roles.get(f) ?? "production",
        query: async <T = any>(sql: string) => all(sql) as T[],
        console: async sql => {
            if (!/^\s*(with|select|pragma|explain)\b/i.test(sql)) throw new Error("read-only: SELECT only")
            const stmt = db.prepare(sql)
            const rows = stmt.all() as any[]
            const cols = rows.length ? Object.keys(rows[0]) : (stmt.columns?.() ?? []).map((c: any) => c.name)
            return { columns: cols, rows: rows.slice(0, 5000).map(r => cols.map((c: string) => r[c])), truncated: rows.length > 5000 }
        },
        findInCode: async (needle, o) => {
            if (!columns.file_contents) return { files: [], totalHits: 0, searched: 0, truncated: false }
            const re = o.regex ? new RegExp(needle, o.caseSensitive ? "g" : "gi") : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.caseSensitive ? "g" : "gi")
            const out: Array<{ file: string; hits: number }> = []
            let searched = 0
            for (const r of all("SELECT file, content FROM file_contents")) {
                searched++
                const hits = (String(r.content ?? "").match(re) ?? []).length
                if (hits) out.push({ file: r.file, hits })
            }
            out.sort((a, b) => b.hits - a.hits)
            return { files: out, totalHits: out.reduce((s, f) => s + f.hits, 0), searched, truncated: false }
        },
        findLines: async (file, needle, o) => {
            const row = all(`SELECT content FROM file_contents WHERE file = '${file.replace(/'/g, "''")}'`)[0]
            const re = o.regex ? new RegExp(needle, o.caseSensitive ? "" : "i") : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.caseSensitive ? "" : "i")
            return String(row?.content ?? "").split(/\r?\n/).map((text, i) => ({ line: i + 1, text, context: false })).filter(l => re.test(l.text))
        },
        author: name => name,
        aliases: () => ({}),
        runCode: async (code, api) => {
            const vm = createRequire(import.meta.url)("node:vm")
            const logs: string[] = []
            const sandbox: Record<string, unknown> = { ...api, console: { log: (...a: unknown[]) => logs.push(a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")) } }
            try {
                const fn = vm.runInNewContext(`(async () => {${code}\n})`, sandbox, { timeout: 5000 })
                const value = await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("the script ran longer than 20 s")), 20000))])
                return { value: JSON.parse(JSON.stringify(value ?? null)), logs }
            } catch (e: any) { return { value: null, logs, error: String(e?.message ?? e) } }
        },
        embed: process.env.ASK_EMBED === "0" ? undefined : async texts => {
            const base = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"
            const res = await fetch(`${base.startsWith("http") ? base : `http://${base}`}/api/embed`, { method: "POST", body: JSON.stringify({ model: "nomic-embed-text", input: texts, keep_alive: "30m" }), headers: { "Content-Type": "application/json" } })
            if (!res.ok) throw new Error(`embed ${res.status}`)
            return ((await res.json()) as any).embeddings
        },
        onScreen: opts.onScreen,
    }
}
