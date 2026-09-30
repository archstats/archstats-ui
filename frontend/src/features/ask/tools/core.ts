// The tools offered on every turn: what is possible, names, one component,
// rankings, the cookbook, a view to open, and the two meta tools.

import { cycleCountsByComponent } from "~/features/cycles/cycles"
import { componentPath, filePath, VIEWS } from "~/features/navigation/routes"
import { CAPABILITIES, describeCapability } from "../knowledge/capabilities"
import { bindRecipe, recipe, RECIPES } from "../knowledge/cookbook"
import { hybridSearch } from "../knowledge/semantic"
import { findPlaybook, PLAYBOOKS } from "../knowledge/playbooks"
import type { Namespace, Tool } from "../engine/types"
import { fmt, metricName, metricShort, notFound, num, resolveComponent, resolveMetric, shortName } from "./shared"

const NAMESPACES: Record<Exclude<Namespace, "core">, string> = {
    graph: "graph, layers (what depends on what, paths, blast radius, the layering)",
    cycles: "tangles, cycles, untangle (what to cut)",
    files: "files_of, file_outline, file_read, code_search, mass (the code itself, where it lives)",
    history: "activity, cochange, knowledge, knowledge_map (git history and people)",
    query: "schema, sql, run_code (raw read-only SQL; a short script joining several lookups)",
    view: "on_screen, look_at_view (what the person was looking at; any view's real tables and figures)",
}

export const coreTools: Tool[] = [
    {
        name: "capabilities", namespace: "core",
        description: "What Archstats can answer about a question, how, with which tools and view, and when it cannot. Call it when unsure, and always before concluding something cannot be answered. Example: {\"question\": \"what is the smallest cycle\"}",
        params: { question: { type: "string", description: "The question, in plain words." } }, required: ["question"],
        label: a => `Checked what Archstats can answer about "${a.question}"`,
        async run(a, { world }) {
            const hits = (await hybridSearch(String(a.question ?? ""), CAPABILITIES, c => [...c.asks, c.id.replace(/-/g, " "), c.family, c.how].join(". "), { embed: world.embed?.bind(world), limit: 3 })).map(x => x.item)
            if (!hits.length) return { text: `No catalogue entry matches. Families: ${[...new Set(CAPABILITIES.map(c => c.family))].join(", ")}. Try other words, or the cookbook.` }
            const load = [...new Set(hits.flatMap(h => h.tools))]
            return { text: hits.map(describeCapability).join("\n"), load: ["graph", "cycles", "files", "history", "query"].filter(ns => load.some(t => toolNamespace(t) === ns)) as Namespace[] }
        },
    },
    {
        name: "find", namespace: "core",
        description: "Find components and files whose names contain some text (a feature word like \"invoice\" or a class name). Example: {\"text\": \"checkout\"}",
        params: { text: { type: "string", description: "Part of a name, any case." } }, required: ["text"],
        label: a => `Looked up names containing "${a.text}"`,
        async run(a, { world }) {
            const q = String(a.text ?? "").toLowerCase()
            const comps = world.components().map(c => String(c.name)).filter(n => n.toLowerCase().includes(q))
            const files = [...world.fileComponent().keys()].filter(f => f.toLowerCase().includes(q))
            const nothing = !comps.length && !files.length
            return {
                text: `Components (${comps.length}): ${comps.slice(0, 20).join(", ") || "none"}${comps.length > 20 ? " …" : ""}\nFiles (${files.length}): ${files.slice(0, 20).join(", ") || "none"}${files.length > 20 ? " …" : ""}${nothing ? "\nNot in any name. code_search looks inside the files." : ""}`,
                load: nothing ? ["files"] : undefined,
            }
        },
    },
    {
        name: "component", namespace: "core",
        description: "One component read in full: size, dependents and dependencies (component counts), instability, cycles it is in, history, health, centrality, and its strongest neighbours with import counts. Example: {\"name\": \"checkout\"}",
        params: { name: { type: "string", description: "Component name, or a distinctive part of it." } }, required: ["name"],
        label: a => `Read the component ${a.name}`,
        async run(a, { world, ranOn, nextId }) {
            const { name, also } = resolveComponent(world, a.name)
            if (!name) return { text: notFound("component", a.name, also) }
            const c = world.components().find(x => x.name === name)!
            const cycles = cycleCountsByComponent(world.cycles()).get(name) ?? 0
            const rows: Array<[string, string, number | null]> = [
                ["complexity__lines", "Lines of code", num(c.complexity__lines)],
                ["complexity__files", "Files", num(c.complexity__files)],
                ["modularity__coupling__dependents", "Components that depend on it", num(c.modularity__coupling__dependents)],
                ["modularity__coupling__dependencies", "Components it depends on", num(c.modularity__coupling__dependencies)],
                ["modularity__instability", "Instability (0 stable – 1 unstable)", num(c.modularity__instability)],
                ["modularity__abstractness", "Abstractness", num(c.modularity__abstractness)],
                ["cycles", "Cycles it is in", cycles],
                ["git__commits__total", "Commits, all time", num(c.git__commits__total)],
                ["git__commits__last_90_days", "Commits, last 90 days", num(c.git__commits__last_90_days)],
                ["git__authors__total", "Authors, all time", num(c.git__authors__total)],
                ["codesmells__code_health", "Code health (10 best)", num(c.codesmells__code_health)],
                ["codesmells__hotspot_score", "Hotspot score", num(c.codesmells__hotspot_score)],
                ["graph__page_rank", "PageRank (centrality)", num(c.graph__page_rank)],
            ].filter(([, , v]) => v !== null) as Array<[string, string, number | null]>
            const deps = new Map<string, number>()
            const users = new Map<string, number>()
            for (const r of world.connections()) {
                if (r.from === r.to) continue
                const k = Number(r.reference_count) || 1
                if (r.from === name) deps.set(r.to, (deps.get(r.to) ?? 0) + k)
                if (r.to === name) users.set(r.from, (users.get(r.from) ?? 0) + k)
            }
            const top = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([n, refs]) => ({ name: n, refs }))
            const id = nextId()
            const text = [
                `[${id}] Component ${name}`,
                ...rows.map(([, l, v]) => `- ${l}: ${fmt(v)}`),
                `- Depends most on: ${top(deps).slice(0, 6).map(d => `${d.name} (${fmt(d.refs)} import references)`).join(", ") || "nothing"}`,
                `- Used most by: ${top(users).slice(0, 6).map(d => `${d.name} (${fmt(d.refs)} import references)`).join(", ") || "nothing"}`,
                also.length ? `(Other matches: ${also.join(", ")})` : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{
                    id, kind: "component", title: `Component · ${shortName(name)}`, name, ranOn,
                    values: rows.map(([k, label, value]) => ({ id: k, label, value })),
                    dependents: top(users).slice(0, 8), dependencies: top(deps).slice(0, 8),
                    open: { route: componentPath(name), label: "Open component" },
                }],
                followUps: [
                    cycles ? `What would untangle ${shortName(name)}?` : `What depends on ${shortName(name)}, all the way up?`,
                    `Who knows ${shortName(name)} best?`,
                    `What are the biggest files in ${shortName(name)}?`,
                ],
            }
        },
    },
    {
        name: "rank", namespace: "core",
        description: "Rank components or files by one metric, drawn as a bar chart, optionally only those meeting a filter (\"the lowest health among components with more than 20 dependents\" = metric health, order asc, filter \"dependents > 20\"). Metric words: size, dependents, dependencies, instability, distance, cycles (components only), churn (all-time commits), recent churn (90 days), authors, health, hotspot, pagerank, betweenness, age, last change; or a column id. Example: {\"metric\": \"hotspot\", \"grain\": \"files\", \"limit\": 10}",
        params: {
            metric: { type: "string", description: "What to rank by." },
            grain: { type: "string", enum: ["components", "files"], description: "Components (default) or files." },
            order: { type: "string", enum: ["desc", "asc"], description: "desc = highest first (default)." },
            limit: { type: "number", description: "Rows, default 10, at most 30." },
            within: { type: "string", description: "Only names containing this text (a component or folder)." },
            filter: { type: "string", description: "Only rows meeting conditions, e.g. \"dependents > 20\" or \"lines >= 1000 and health < 5\" (metric words work)." },
        },
        required: ["metric"],
        label: a => `Ranked ${a.grain === "files" ? "files" : "components"} by ${a.metric}${a.within ? ` within ${a.within}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            const grain = a.grain === "files" ? "files" : "components"
            const m = resolveMetric(world, a.metric, grain)
            if (!m) return { text: `Unknown metric "${a.metric}" for ${grain}. Call schema with table "${grain}" to see the columns, or use a metric word.`, load: ["query"] }
            const limit = Math.max(3, Math.min(30, Number(a.limit) || 10))
            const asc = a.order === "asc"
            const within = String(a.within ?? "").trim()
            let items: Array<{ label: string; value: number; key: string }>
            let sql = ""
            if (m.id === "cycles") {
                items = [...cycleCountsByComponent(world.cycles())].filter(([n]) => !within || n.includes(within))
                    .map(([key, value]) => ({ key, label: shortName(key), value })).sort((x, y) => (asc ? x.value - y.value : y.value - x.value)).slice(0, limit)
            } else {
                // Conditions in words ("dependents > 20 and health < 5"), each metric resolved like the ranked one.
                const conds: string[] = []
                for (const part of String(a.filter ?? "").split(/\s+and\s+|,/i).map(x => x.trim()).filter(Boolean)) {
                    const fm = /^(.+?)\s*(>=|<=|!=|=|>|<)\s*(-?[\d.]+)$/.exec(part)
                    const fr = fm ? resolveMetric(world, fm[1], grain) : null
                    if (!fm || !fr || fr.id === "cycles") return { text: `The filter "${part}" did not read: write it as "<metric> <op> <number>", e.g. "dependents > 20".` }
                    conds.push(`${fr.id} ${fm[2]} ${Number(fm[3])}`)
                }
                const where = [`${m.id} IS NOT NULL`, m.id === "codesmells__code_health" ? `${m.id} > 0` : "", grain === "files" && (world.columns.files ?? []).includes("role") ? "coalesce(role, 'production') = 'production'" : grain === "components" ? "name != '.'" : "", within ? `name LIKE '%${within.replace(/'/g, "''").replace(/[%_]/g, "")}%'` : "", ...conds].filter(Boolean).join(" AND ")
                sql = `SELECT name, ${m.id} AS value FROM ${grain} WHERE ${where} ORDER BY ${m.id} ${asc ? "ASC" : "DESC"} LIMIT ${limit}`
                items = (await world.query(sql)).map((r: any) => ({ key: String(r.name), label: shortName(String(r.name)), value: Number(r.value) || 0 }))
            }
            const id = nextId()
            const name = metricName(world, m.id)
            const def = metricShort(world, m.id)
            const allZero = items.length > 0 && items.every(x => x.value === 0)
            const text = [
                m.note ? `Note: ${m.note}` : "",
                allZero ? "Warning: every value is 0, so this ranking says nothing. For history, the scanned commit may be old: use the all-time metric." : "",
                `[${id}] ${grain} by ${name} (${m.id})${def ? ` – ${def}` : ""}, ${asc ? "lowest" : "highest"} first${within ? `, names containing "${within}"` : ""}${a.filter ? `, only where ${a.filter}` : ""}:`,
                ...items.map((x, i) => `${i + 1}. ${x.key}: ${fmt(x.value)}`),
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{
                    id, kind: "bars", title: `${asc ? "Lowest" : "Highest"} ${name.toLowerCase()}${grain === "files" ? " (files)" : ""}${a.filter ? ` · ${a.filter}` : ""}`, metric: m.id, unit: name, items, note: def || undefined, sql: sql || undefined, ranOn,
                    open: { route: grain === "files" ? "/views/metrics?grain=files" : "/views/metrics", label: "Open in Metrics" },
                }],
                followUps: items[0] ? [grain === "files" ? `Outline ${shortName(items[0].key)}` : `Tell me about ${items[0].label}`] : [],
            }
        },
    },
    {
        name: "cookbook", namespace: "core",
        description: "Verified queries for common questions (languages, roles and tests, top-level areas, build modules, entry points, mutual pairs, which files import what, hotspot files, stale files, authors, commits per month, co-change pairs, largest classes, rule results). Call with a question to see matching recipes; call with an id (and params) to run one. Example: {\"question\": \"how much test code is there\"} then {\"id\": \"roles\"}",
        params: {
            question: { type: "string", description: "What you want to know, to find recipes." },
            id: { type: "string", description: "A recipe id to run." },
            params: { type: "string", description: "The recipe's parameters as JSON, e.g. {\"from\": \"a\", \"to\": \"b\"}." },
        },
        label: a => (a.id ? `Ran the verified query "${a.id}"` : `Looked for a verified query about "${a.question}"`),
        async run(a, { world, ranOn, nextId }) {
            if (!a.id) {
                const runnable = RECIPES.filter(r => r.needs.every(t => t in world.columns))
                const hits = (await hybridSearch(String(a.question ?? ""), runnable, r => [r.question, ...r.also, r.reading].join(". "), { embed: world.embed?.bind(world), limit: 4 })).map(x => x.item)
                if (!hits.length) return { text: "No recipe matches. Use the other tools, or schema + sql.", load: ["query"] }
                return { text: hits.map(r => `• id "${r.id}": ${r.question}${r.params.length ? ` — params: ${r.params.map(p => `${p.name} (${p.description}${p.default !== undefined ? `, default ${p.default}` : ""})`).join(", ")}` : ""}`).join("\n") + "\nRun one with {\"id\": \"…\"}." }
            }
            const r = recipe(String(a.id))
            if (!r) return { text: `No recipe "${a.id}". Search with a question first.` }
            let params: Record<string, unknown> = {}
            if (a.params) { try { params = typeof a.params === "string" ? JSON.parse(a.params) : a.params } catch { return { text: "params must be JSON, e.g. {\"from\": \"a\", \"to\": \"b\"}." } } }
            const sql = bindRecipe(r, params)
            const res = await world.console(sql)
            const id = nextId()
            const rows = res.rows.slice(0, 50)
            const text = `[${id}] Verified query "${r.id}": ${r.question}\n${r.reading}\n${res.columns.join(" | ")}\n${rows.slice(0, 25).map(x => x.map(v => fmt(v)).join(" | ")).join("\n")}${rows.length > 25 ? `\n… ${rows.length - 25} more rows` : ""}`
            const chartable = r.chart && rows.length > 1 && res.columns.includes(r.chart.label) && res.columns.includes(r.chart.value)
            const li = chartable ? res.columns.indexOf(r.chart!.label) : -1
            const vi = chartable ? res.columns.indexOf(r.chart!.value) : -1
            return {
                text,
                evidence: [chartable
                    ? { id, kind: "bars", title: r.question.replace(/\?$/, ""), metric: r.chart!.value, unit: r.chart!.value, items: rows.slice(0, 15).map(x => ({ label: shortName(String(x[li])), key: String(x[li]), value: Number(x[vi]) || 0 })), note: r.reading, sql, verified: true, ranOn }
                    : { id, kind: "table", title: r.question.replace(/\?$/, ""), columns: res.columns, rows, total: rows.length, note: r.reading, sql, verified: true, ranOn }],
            }
        },
    },
    {
        name: "show", namespace: "core",
        description: "Offer a view to open (the person clicks; the window does not move by itself). Views: overview, metrics, hotspots, connections, cycles, units, checks, changes, authors, activity, deployables, libraries, evidence, sql console. With a component: its page, or a tab (reading, connections, cycles, inside, history), or connections focused around it. With a file: its page. Example: {\"view\": \"cycles\", \"component\": \"checkout\"}",
        params: {
            view: { type: "string", description: "A view name, or a component tab." },
            component: { type: "string", description: "Optional component." },
            file: { type: "string", description: "Optional file path." },
        },
        required: ["view"],
        label: a => `Offered ${a.view}${a.component ? ` for ${a.component}` : a.file ? ` for ${a.file}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            const view = String(a.view ?? "").toLowerCase().trim()
            const id = nextId()
            const ev = (route: string, label: string, focus?: string) => ({ text: `[${id}] A preview of "${label.replace(/^Open /, "")}" is shown in the answer; nothing has opened. Describe what it shows only from other tool results, and say they can open it from the preview.`, evidence: [{ id, kind: "link" as const, title: label, ranOn, open: { route, label, focus } }] })
            if (a.file) {
                const f = [...world.fileComponent().keys()].find(x => x === a.file || x.endsWith(String(a.file)))
                if (f) return ev(filePath(f), `Open ${f}`)
            }
            if (a.component) {
                const { name, also } = resolveComponent(world, a.component)
                if (!name) return { text: notFound("component", a.component, also) }
                if (view.includes("connection") || view.includes("graph") || view.includes("around")) return ev("/views/connections", `Connections around ${shortName(name)}`, `around ${/[\s,"]/.test(name) ? `"${name}"` : name}`)
                if (view.includes("cycle") || view.includes("tangle")) return ev(`/views/components/cycles?component=${encodeURIComponent(name)}`, `Cycles view on ${shortName(name)}`)
                const tab = ["cycles", "inside", "history"].find(t => view.includes(t))
                return ev(componentPath(name, tab), `${shortName(name)}${tab ? ` · ${tab}` : ""}`)
            }
            const v = VIEWS.find(x => x.label.toLowerCase() === view) ?? VIEWS.find(x => x.label.toLowerCase().includes(view) || (x.also ?? "").includes(view))
            if (!v) return { text: `No view "${a.view}". Known: ${VIEWS.map(x => x.label).join(", ")}.` }
            const rev = Number(world.info.analysis_revision ?? 0)
            const needs = /deployables/i.test(v.label) && rev < 5 ? ` Note: this snapshot is analysis revision ${rev}; Deployables needs revision 5 or newer, so the view will be empty until the workspace is scanned again.` : ""
            const out = ev(v.to, `Open ${v.label}`)
            return { ...out, text: out.text + needs }
        },
    },
    {
        name: "playbook", namespace: "core",
        description: `How an architect goes about a big job, step by step, with the tools for each step. Load one before a broad investigation. Playbooks: ${PLAYBOOKS.map(p => `${p.id} (${p.title})`).join("; ")}. Example: {"name": "untangle"}`,
        params: { name: { type: "string", description: "A playbook id or the job in a few words." } }, required: ["name"],
        label: a => `Opened the ${a.name} playbook`,
        async run(a) {
            const p = findPlaybook(String(a.name ?? ""))
            if (!p) return { text: `No playbook for "${a.name}". Playbooks: ${PLAYBOOKS.map(x => x.id).join(", ")}.` }
            return { text: `Playbook: ${p.title}\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nFollow it, skipping steps that do not apply; say which ones the snapshot cannot support.`, load: ["graph", "cycles", "files", "history"] }
        },
    },
    {
        name: "ask_user", namespace: "core",
        description: "Ask the person to choose when the question could mean two or more different things and guessing would waste their time (which component, which of two readings). Give 2 to 4 short options. Do not use it for things a tool can find out. Example: {\"question\": \"Which checkout do you mean?\", \"options\": [\"core.checkout\", \"web.checkout\"]}",
        params: {
            question: { type: "string", description: "One short question." },
            options: { type: "string", description: "The options as a JSON array of strings." },
        },
        required: ["question", "options"],
        label: a => `Asked: ${a.question}`,
        async run(a) {
            let options: string[] = []
            try { options = Array.isArray(a.options) ? a.options : JSON.parse(String(a.options)) } catch { options = String(a.options ?? "").split(/\s*[,;|]\s*/) }
            options = options.map(String).filter(Boolean).slice(0, 4)
            return { text: "Asked the person; waiting for their choice.", askUser: { question: String(a.question ?? "Which do you mean?"), options } }
        },
    },
    {
        name: "load_tools", namespace: "core",
        description: `Offer more tools from the next step on. Namespaces: ${Object.entries(NAMESPACES).map(([k, v]) => `${k}: ${v}`).join("; ")}. Example: {"namespace": "files"}`,
        params: { namespace: { type: "string", enum: Object.keys(NAMESPACES), description: "Which tools to add." } }, required: ["namespace"],
        label: a => `Took out the ${a.namespace} tools`,
        async run(a) {
            const ns = String(a.namespace) as Namespace
            if (!(ns in NAMESPACES)) return { text: `Unknown namespace. One of: ${Object.keys(NAMESPACES).join(", ")}.` }
            return { text: `Loaded ${NAMESPACES[ns as Exclude<Namespace, "core">]}. They are available now.`, load: [ns] }
        },
    },
    {
        name: "recall", namespace: "core",
        description: "The full text of an earlier result, by its evidence id, when the conversation shortened it. Example: {\"id\": \"E4\"}",
        params: { id: { type: "string", description: "An evidence id like E4." } }, required: ["id"],
        label: a => `Recalled ${a.id}`,
        async run(a, { recall }) {
            return { text: recall(String(a.id)) ?? `Nothing stored under ${a.id}.` }
        },
    },
]

const TOOL_NS: Record<string, Namespace> = {
    graph: "graph", layers: "graph", mass: "files", knowledge_map: "history", tangles: "cycles", cycles: "cycles", untangle: "cycles",
    files_of: "files", file_outline: "files", file_read: "files", code_search: "files",
    activity: "history", cochange: "history", knowledge: "history",
    sql: "query", schema: "query", run_code: "query", on_screen: "view", look_at_view: "view",
}
function toolNamespace(name: string): Namespace { return TOOL_NS[name] ?? "core" }
