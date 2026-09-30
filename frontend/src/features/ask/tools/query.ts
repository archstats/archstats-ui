// Raw access, for what no other tool answers: the schema, searched rather
// than dumped, and read-only SQL. And what the person was looking at.

import type { Tool } from "../engine/types"
import { VIEWS, componentPath } from "~/features/navigation/routes"
import { resolveComponent } from "./shared"
import { describeScreen } from "../engine/prompt"
import { fmt } from "./shared"

export const queryTools: Tool[] = [
    {
        name: "schema", namespace: "query",
        description: "The snapshot's SQLite tables and columns, searched by a word, with what each metric means. Call before sql. Example: {\"term\": \"commit\"} or {\"table\": \"files\"}",
        params: {
            term: { type: "string", description: "A word to find tables and columns by." },
            table: { type: "string", description: "One table, all its columns." },
        },
        label: a => (a.table ? `Read the columns of ${a.table}` : `Searched the schema for ${a.term ?? "tables"}`),
        async run(a, { world }) {
            const cols = world.columns
            const defs = world.definitions()
            const describe = (c: string) => { const d = defs.get(c); return d ? `${c} — ${d.name}: ${d.short}` : c }
            if (a.table) {
                const c = cols[String(a.table)]
                if (!c) return { text: `No table "${a.table}". Tables: ${Object.keys(cols).join(", ")}` }
                return { text: `${a.table}:\n${c.filter(x => !["report_id", "timestamp"].includes(x)).map(describe).join("\n")}` }
            }
            const term = String(a.term ?? "").toLowerCase()
            if (!term) return { text: Object.entries(cols).map(([t, c]) => `${t} (${c.length} columns)`).join("\n") }
            const hits: string[] = []
            for (const [t, c] of Object.entries(cols)) {
                const m = c.filter(x => x.includes(term) || (defs.get(x)?.name ?? "").toLowerCase().includes(term))
                if (t.includes(term) || m.length) hits.push(`${t}: ${(t.includes(term) && !m.length ? c.slice(0, 12) : m.slice(0, 12)).map(describe).join("; ")}`)
            }
            return { text: hits.length ? hits.join("\n") : `Nothing matches "${term}". Tables: ${Object.keys(cols).join(", ")}` }
        },
    },
    {
        name: "sql", namespace: "query",
        description: "One read-only SQLite SELECT on the snapshot (rows capped). Last resort: prefer the other tools and the cookbook. Quote \"from\" and \"to\" columns. Example: {\"query\": \"SELECT role, count(*) FROM files GROUP BY role\", \"title\": \"Files by role\"}",
        params: {
            query: { type: "string", description: "One SELECT statement." },
            title: { type: "string", description: "A short title for the result." },
        },
        required: ["query"],
        label: a => `Ran SQL: ${String(a.title || a.query).slice(0, 60)}`,
        async run(a, { world, ranOn, nextId }) {
            const sql = String(a.query ?? "").trim().replace(/;\s*$/, "")
            try {
                const res = await world.console(sql)
                const rows = res.rows.slice(0, 200)
                const id = nextId()
                return {
                    text: `[${id}] ${rows.length}${res.truncated ? "+" : ""} rows\n${res.columns.join(" | ")}\n${rows.slice(0, 25).map(r => r.map(v => fmt(v)).join(" | ")).join("\n")}${rows.length > 25 ? `\n… ${rows.length - 25} more rows` : ""}`,
                    evidence: [{ id, kind: "table", title: String(a.title || "Query result"), columns: res.columns, rows, total: rows.length, sql, ranOn }],
                }
            } catch (e: any) {
                return { text: `SQL error: ${String(e?.message ?? e)}. Check names with schema; quote "from" and "to".` }
            }
        },
    },
    {
        name: "look_at_view", namespace: "view",
        description: "Open one of the app's views out of sight and read it: its tables (rows) and figures (with legends), exactly as the view shows them. Use it for what only a view computes (Units findings, Deployables, Checks, Activity, Knowledge) or to show the person a view's real figure. Example: {\"view\": \"units\"} or {\"view\": \"cycles\", \"component\": \"checkout\"}",
        params: {
            view: { type: "string", description: "A view name (units, checks, deployables, activity, authors, hotspots, connections, cycles, metrics, overview…) or a component tab (reading, connections, cycles, inside, history)." },
            component: { type: "string", description: "Optional component the view is about." },
        },
        required: ["view"],
        label: a => `Looked at the ${a.view} view${a.component ? ` for ${a.component}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            if (!world.readView) return { text: "Views can only be looked at inside the app." }
            const view = String(a.view ?? "").toLowerCase()
            let route = "", focus: string | undefined, label = ""
            if (a.component) {
                const { name } = resolveComponent(world, a.component)
                if (name) {
                    if (view.includes("connection")) { route = "/views/connections"; focus = `around ${/[\s,"]/.test(name) ? `"${name}"` : name}`; label = `Connections around ${name}` }
                    else if (view.includes("cycle") && !view.includes("tab")) { route = `/views/components/cycles?component=${encodeURIComponent(name)}`; label = `Cycles · ${name}` }
                    else { const tab = ["cycles", "inside", "history", "connections"].find(t => view.includes(t)); route = componentPath(name, tab); label = `${name}${tab ? ` · ${tab}` : ""}` }
                }
            }
            if (!route) {
                const v = VIEWS.find(x => x.label.toLowerCase() === view) ?? VIEWS.find(x => x.label.toLowerCase().includes(view) || (x.also ?? "").includes(view))
                if (!v) return { text: `No view "${a.view}". Known: ${VIEWS.map(x => x.label).join(", ")}.` }
                route = v.to; label = v.label
            }
            const got = await world.readView(route, { focus })
            const id = nextId()
            const text = [
                `[${id}] The ${label} view shows:`,
                ...got.figures.map(f => `Figure "${f.title}"${f.legend ? ` — legend: ${f.legend}` : ""}`),
                ...got.tables.map(t => `Table "${t.title}" (${t.total} rows; first ${Math.min(12, t.rows.length)}):\n${[t.columns.join(" | "), ...t.rows.slice(0, 12).map(r => r.join(" | "))].join("\n")}`),
                !got.figures.length && !got.tables.length ? `Nothing drawn. This snapshot was read with analysis revision ${world.info.analysis_revision ?? "?"}; views added later (Deployables needs 5 or newer, Units and Checks need units) stay empty until the workspace is scanned again. Say that, not a guess about the code.` : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{ id, kind: "view", title: label, route, focus, figures: got.figures.map(({ png: _png, ...f }) => f), tables: got.tables, ranOn, open: { route, focus, label: `Open ${label}` } }],
            }
        },
    },
    {
        name: "on_screen", namespace: "view",
        description: "What the person was looking at when they came to Ask: the view, its subject, focus, selection, and the tables and figures on it with their rows. Use when the question says this, here, these. Example: {}",
        params: {},
        label: () => "Looked at the view they came from",
        async run(_a, { world }) {
            const v = world.onScreen?.()
            if (!v) return { text: "They did not come from a view; nothing was on screen." }
            return { text: describeScreen(v) }
        },
    },
]
