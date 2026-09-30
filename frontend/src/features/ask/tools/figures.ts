// Three pictures the views draw, as tools: the layers of the codebase (the
// stack diagram), where its code lives (the folder map), and who still knows
// each part (the knowledge map). Each computes its numbers the way its view
// does and hands the drawing its data.

import { buildKnowledge, knowledgePairsSql, peopleToAsk, STATES, summarise, type KnowledgePair } from "~/features/git/knowledgeLeft"
import type { Tool } from "../engine/types"
import { show } from "../intents/show"
import { fmt, resolveComponent, shortName } from "./shared"

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`

export const figureTools: Tool[] = [
    {
        name: "layers", namespace: "graph",
        description: "The codebase as a stack of layers: its top-level areas (or the parts of one area) ordered so imports run downward, with the imports that point back up. Shows whether it is layered and where the layering breaks. Example: {} or {\"within\": \"core\", \"depth\": 1}",
        params: {
            within: { type: "string", description: "Only the parts of this area or component." },
            depth: { type: "number", description: "How many name segments make an area, default 1." },
        },
        label: a => `Stacked the layers${a.within ? ` of ${a.within}` : ""}`,
        async run(a, ctx) {
            // The stack exhibit: its facts are what the model reads, its figure is drawn in the answer.
            const shown = await show("stack", { of: a.within }, ctx)
            if ("absent" in shown) return { text: shown.absent }
            const up = shown.part.facts.find(f => f.kind === "row" && /points back up/.test(f.text))
            return { text: shown.text, exhibits: [shown.part], followUps: up ? [`Why does ${up.entities[0]} import ${up.entities[1]}?`] : [] }
        },
    },
    {
        name: "mass", namespace: "files",
        description: "Where the code lives: every file drawn by size in its folders, coloured by role, health, churn or component. Answers \"where is the mass\", \"where are the tests\", \"where is the unhealthy code\". Example: {\"color\": \"health\"} or {\"within\": \"src/main\", \"color\": \"churn\"}",
        params: {
            within: { type: "string", description: "Only files whose path contains this." },
            color: { type: "string", enum: ["role", "health", "churn", "component"], description: "What the colour shows, default role." },
        },
        label: a => `Mapped where the code lives${a.within ? ` in ${a.within}` : ""}, coloured by ${a.color ?? "role"}`,
        async run(a, { world, ranOn, nextId }) {
            const cols = world.columns.files ?? []
            let colorBy = (["role", "health", "churn", "component"].includes(a.color) ? a.color : "role") as "role" | "health" | "churn" | "component"
            let note = ""
            // Older snapshots have no file roles: colour by component instead, and say so.
            if (colorBy === "role" && !cols.includes("role")) { colorBy = "component"; note = "This snapshot records no file roles (it predates them), so the map is coloured by component instead; tests cannot be told apart here." }
            const valueCol = colorBy === "health" ? "codesmells__code_health" : colorBy === "churn" ? "git__commits__total" : colorBy === "component" ? "component" : "role"
            if (!cols.includes(valueCol)) return { text: `This snapshot has no ${colorBy} for files.` }
            const where = [`complexity__lines > 0`, a.within ? `name LIKE ${sq(`%${String(a.within).replace(/[%_]/g, "")}%`)}` : ""].filter(Boolean).join(" AND ")
            const rows = await world.query<{ name: string; lines: number; v: any }>(`SELECT name, complexity__lines AS lines, ${valueCol} AS v FROM files WHERE ${where} ORDER BY lines DESC LIMIT 4000`)
            if (!rows.length) return { text: `No files${a.within ? ` under "${a.within}"` : ""}.` }
            const folders = new Map<string, number>()
            for (const r of rows) { const f = r.name.split("/").slice(0, 2).join("/"); folders.set(f, (folders.get(f) ?? 0) + Number(r.lines)) }
            const total = rows.reduce((s, r) => s + Number(r.lines), 0)
            const byValue = new Map<string, number>()
            if (colorBy === "role" || colorBy === "component") for (const r of rows) byValue.set(String(r.v ?? "unknown"), (byValue.get(String(r.v ?? "unknown")) ?? 0) + Number(r.lines))
            const id = nextId()
            const pct = (x: number) => `${Math.round((100 * x) / Math.max(1, total))}%`
            const text = [
                `[${id}] ${fmt(rows.length)} files, ${fmt(total)} lines${a.within ? ` under "${a.within}"` : ""}. Largest folders: ${[...folders].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([f, l]) => `${f} (${fmt(l)} lines, ${pct(l)})`).join(", ")}.`,
                byValue.size ? `Lines by ${colorBy}: ${[...byValue].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, l]) => `${k} ${fmt(l)} (${pct(l)})`).join(", ")}.` : "",
                note,
                colorBy === "health" ? `Lines in files with health below 5: ${fmt(rows.filter(r => Number(r.v) > 0 && Number(r.v) < 5).reduce((s, r) => s + Number(r.lines), 0))}.` : "",
                colorBy === "churn" ? `Most-changed files: ${[...rows].sort((x, y) => Number(y.v) - Number(x.v)).slice(0, 5).map(r => `${r.name} (${fmt(r.v)} commits)`).join(", ")}.` : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{ id, kind: "folders", title: `Where the code lives${a.within ? ` · ${a.within}` : ""} · by ${colorBy}`, files: rows.map(r => r.name), lines: rows.map(r => Number(r.lines)), values: rows.map(r => (r.v === null || r.v === undefined ? null : typeof r.v === "number" ? r.v : String(r.v))), colorBy, ranOn, open: { route: "/views/metrics?grain=files", label: "Open Metrics" } }],
            }
        },
    },
    {
        name: "knowledge_map", namespace: "history",
        description: "Who still knows each part of the codebase: every component marked written by active contributors, changed by them, changed once, or with no active contributor, and the person to ask. The Authors view's knowledge map. Example: {} or {\"within\": \"checkout\"}",
        params: { within: { type: "string", description: "Only components whose name contains this." } },
        label: a => `Mapped who still knows the code${a.within ? ` in ${a.within}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            if (!("git_commits" in world.columns)) return { text: "This snapshot has no git history." }
            const last = (await world.query<{ t: string }>("SELECT max(commit_time) AS t FROM git_commits"))[0]?.t
            if (!last) return { text: "No commits recorded." }
            const anchor = `julianday('${new Date(last).toISOString()}')`
            const pairs = await world.query<KnowledgePair>(knowledgePairsSql({ aliases: world.aliases?.() ?? {}, includeBots: false, anchor }))
            const lines = new Map(world.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
            let rows = buildKnowledge(pairs, lines, 365)
            if (a.within) rows = rows.filter(r => r.component.toLowerCase().includes(String(a.within).toLowerCase()))
            if (!rows.length) return { text: "No components with history match." }
            const sum = summarise(rows)
            const people = peopleToAsk(rows).people.slice(0, 5)
            const nobody = rows.filter(r => r.state === "nobody").sort((x, y) => y.lines - x.lines).slice(0, 6)
            const id = nextId()
            const text = [
                `[${id}] ${fmt(sum.components)} components, ${fmt(sum.lines)} lines; the last year of history, to ${String(last).slice(0, 10)}. ${fmt(sum.peopleHere)} of ${fmt(sum.people)} authors are still active.`,
                ...STATES.map(s => `${s.label}: ${fmt(sum.byState[s.id].components)} components, ${fmt(sum.byState[s.id].lines)} lines`),
                people.length ? `People to ask: ${people.map(p => `${world.author(p.author)} (${p.components.length} components, ${fmt(p.lines)} lines${p.only ? `, ${p.only} only they know` : ""})`).join("; ")}` : "",
                nobody.length ? `Largest parts with no active contributor: ${nobody.map(r => `${r.component} (${fmt(r.lines)} lines)`).join(", ")}` : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{
                    id, kind: "knowledge", title: `Who still knows the code${a.within ? ` · ${a.within}` : ""}`, windowWords: "the last year",
                    rows: rows.slice(0, 600).map(r => ({ component: r.component, lines: r.lines, state: r.state, hereShare: r.hereShare, hereCommits: r.hereCommits, ask: r.ask ? world.author(r.ask.author) : null, main: r.main ? world.author(r.main.author) : null })),
                    ranOn, open: { route: "/views/git/authors", label: "Open Authors" },
                }],
                followUps: nobody[0] ? [`What is in ${shortName(nobody[0].component)}, and is it still used?`] : [],
            }
        },
    },
]
