// Code mode: for questions that need several lookups joined and filtered
// ("the component with more than 10 dependents and the lowest health"), the
// model writes one short read-only script against this API instead of a
// chain of tool calls. The script runs sandboxed (a Worker with no network in
// the app, a vm context in Node); only its return value reaches the model.

import { cycleCountsByComponent } from "~/features/cycles/cycles"
import { foldEdges } from "~/features/cycles/untangle"
import { parseQuery, runQuery } from "~/features/groups/query"
import { detectSeparator } from "~/features/snapshot/names"
import type { Tool, World } from "../engine/types"

/** The API a script sees, as TypeScript declarations for the model. */
export const API_TYPES = `// All functions are async and read-only.
declare function sql(query: string): Promise<Array<Record<string, unknown>>>   // one SELECT on the snapshot (see schema tool); at most 5000 rows
declare function components(): Promise<Array<{ name: string; lines: number; files: number; dependents: number; dependencies: number; instability: number | null; cycles: number; commits: number | null; commits90: number | null; authors: number | null; health: number | null; hotspot: number | null; pagerank: number | null }>>
declare function edges(): Promise<Array<{ from: string; to: string; imports: number; files: number }>>   // runtime imports between components
declare function cycles(): Promise<Array<{ nodes: string[] }>>   // distinct shortest cycles
declare function graph(query: string): Promise<string[]>   // the query language: "dependents of X depth all", "path from A to B", "tangle of X"
declare function files(component?: string): Promise<Array<{ name: string; component: string; lines: number; role: string; commits: number | null; health: number | null }>>
// Return a small JSON value (a number, a few rows): it is all the model sees. console.log also shows.`

type Api = Record<string, (...args: any[]) => Promise<unknown>>

export function codeApi(world: World): Api {
    const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))
    return {
        sql: async (q: string) => {
            const r = await world.console(String(q))
            return r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))
        },
        components: async () => {
            const cyc = cycleCountsByComponent(world.cycles())
            return world.components().filter(c => c.name !== ".").map(c => ({
                name: String(c.name), lines: Number(c.complexity__lines) || 0, files: Number(c.complexity__files) || 0,
                dependents: Number(c.modularity__coupling__dependents) || 0, dependencies: Number(c.modularity__coupling__dependencies) || 0,
                instability: n(c.modularity__instability), cycles: cyc.get(String(c.name)) ?? 0, commits: n(c.git__commits__total), commits90: n(c.git__commits__last_90_days),
                authors: n(c.git__authors__total), health: n(c.codesmells__code_health), hotspot: n(c.codesmells__hotspot_score), pagerank: n(c.graph__page_rank),
            }))
        },
        edges: async () => foldEdges(world.connections()).map(e => ({ from: e.from, to: e.to, imports: e.imports, files: e.files })),
        cycles: async () => world.cycles().map(c => ({ nodes: c.nodes })),
        graph: async (q: string) => {
            const names = world.components().map(c => String(c.name)).filter(x => x !== ".")
            return runQuery(parseQuery(String(q)), { components: names, files: [], componentSep: detectSeparator(names), edges: foldEdges(world.connections()).map(e => ({ from: e.from, to: e.to })) }).components
        },
        files: async (component?: string) => {
            const cols = world.columns.files ?? []
            const has = (c: string) => cols.includes(c)
            const rows = await world.query(`SELECT name, component, complexity__lines AS lines, ${has("role") ? "role" : "'production' AS role"}, ${has("git__commits__total") ? "git__commits__total" : "NULL"} AS commits, ${has("codesmells__code_health") ? "codesmells__code_health" : "NULL"} AS health FROM files${component ? ` WHERE component = '${String(component).replace(/'/g, "''")}'` : ""} LIMIT 20000`)
            return rows
        },
    }
}

export const codeModeTool: Tool = {
    name: "run_code", namespace: "query",
    description: `Run a short read-only JavaScript script against the snapshot when a question needs several lookups joined, filtered or counted (one step instead of many tool calls). The script body may use await and must return a small JSON value. API:\n${API_TYPES}\nExample: {"code": "const cs = await components(); return cs.filter(c => c.dependents > 10).sort((a, b) => (a.health ?? 99) - (b.health ?? 99)).slice(0, 5).map(c => ({ name: c.name, dependents: c.dependents, health: c.health }))"}`,
    params: { code: { type: "string", description: "The body of an async function: statements ending in a return." } },
    required: ["code"],
    label: () => "Ran a script over the snapshot",
    async run(a, { world, ranOn, nextId }) {
        if (!world.runCode) return { text: "Scripts cannot run here; use the other tools." }
        const code = String(a.code ?? "")
        const res = await world.runCode(code, codeApi(world))
        const id = nextId()
        const value = JSON.stringify(res.value, null, 1) ?? "undefined"
        const shown = value.length > 5000 ? `${value.slice(0, 5000)}…` : value
        if (res.error) return { text: `The script failed: ${res.error}${res.logs.length ? `\nLogs:\n${res.logs.join("\n")}` : ""}\nFix it and run again.` }
        const rows = Array.isArray(res.value) && res.value.every(r => r && typeof r === "object" && !Array.isArray(r)) ? (res.value as Array<Record<string, unknown>>) : null
        const columns = rows?.length ? Object.keys(rows[0]) : []
        return {
            text: `[${id}] Script result:\n${shown}${res.logs.length ? `\nLogs:\n${res.logs.slice(0, 20).join("\n")}` : ""}`,
            evidence: rows?.length ? [{ id, kind: "table", title: "Script result", columns, rows: rows.slice(0, 60).map(r => columns.map(c => r[c] as any)), total: rows.length, note: `Computed by this script:\n${code.slice(0, 1200)}`, ranOn }] : [],
        }
    },
}
