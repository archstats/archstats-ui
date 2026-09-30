// History: when the code changed, what changes together (and whether an
// import explains it), and who knows it. People are named as the app names
// them: pseudonymised when the workspace asks.

import { componentPath } from "~/features/navigation/routes"
import type { Tool, World } from "../engine/types"
import { fmt, notFound, resolveComponent, shortName } from "./shared"

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`
const noGit = (world: World) => !("git_commit_info" in world.columns) && !("git_commits" in world.columns)

export const historyTools: Tool[] = [
    {
        name: "activity", namespace: "history",
        description: "Commits per month, for the whole codebase or one component: is it active, when did work happen. Example: {} or {\"component\": \"checkout\", \"months\": 24}",
        params: {
            component: { type: "string", description: "Optional component." },
            months: { type: "number", description: "How many recent months, default 18." },
        },
        label: a => `Charted commits per month${a.component ? ` for ${a.component}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            if (noGit(world)) return { text: "This snapshot has no git history." }
            const months = Math.max(3, Math.min(60, Number(a.months) || 18))
            let sql: string
            let name = ""
            if (a.component) {
                const r = resolveComponent(world, a.component)
                if (!r.name) return { text: notFound("component", a.component, r.also) }
                name = r.name
                sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commits WHERE component = ${sq(name)} GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
            } else {
                sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commit_info GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
            }
            const rows = (await world.query<{ month: string; commits: number }>(sql)).reverse()
            if (!rows.length) return { text: `No commits recorded${name ? ` for ${name}` : ""}.` }
            const total = rows.reduce((s, r) => s + Number(r.commits), 0)
            const id = nextId()
            return {
                text: `[${id}] Commits per month${name ? ` touching ${name}` : ""}, ${rows[0].month} to ${rows[rows.length - 1].month} (months with commits only): ${rows.map(r => `${r.month} ${r.commits}`).join(", ")}. Total ${fmt(total)}.`,
                evidence: [{ id, kind: "timeline", title: `Commits per month${name ? ` · ${shortName(name)}` : ""}`, points: rows.map(r => ({ label: r.month, value: Number(r.commits) })), unit: "commits", sql, ranOn, open: { route: name ? componentPath(name, "history") : "/views/git/activity", label: name ? "Open history" : "Open Activity" } }],
            }
        },
    },
    {
        name: "cochange", namespace: "history",
        description: "What changes in the same commits, and whether an import explains it. Co-change without an import is hidden coupling. With a component: its partners. Without one: the strongest pairs in the whole codebase, hidden ones marked. Example: {\"component\": \"checkout\"} or {} or {\"hidden_only\": true}",
        params: {
            component: { type: "string", description: "Optional component; leave out for the whole codebase." },
            hidden_only: { type: "boolean", description: "Only pairs with no import between them." },
        },
        label: a => (a.component ? `Found what changes with ${a.component}` : "Found what changes together across the codebase"),
        async run(a, { world, ranOn, nextId }) {
            if (!("git_component_shared_commits" in world.columns)) return { text: "This snapshot has no co-change data (no git history)." }
            if (!a.component) {
                const linked = new Set<string>()
                for (const r of world.connections()) { linked.add(`${r.from}\u0000${r.to}`); linked.add(`${r.to}\u0000${r.from}`) }
                const sql = `SELECT pair_1 AS a, pair_2 AS b, shared_commits, round(percentage_of_all_commits_pair_1, 1) AS pa, round(percentage_of_all_commits_pair_2, 1) AS pb FROM git_component_shared_commits WHERE pair_1 != pair_2 AND pair_1 < pair_2 ORDER BY shared_commits DESC LIMIT 200`
                let rows = (await world.query<{ a: string; b: string; shared_commits: number; pa: number; pb: number }>(sql)).map(r => ({ ...r, hidden: !linked.has(`${r.a}\u0000${r.b}`) }))
                if (a.hidden_only) rows = rows.filter(r => r.hidden)
                rows = rows.slice(0, 20)
                const id = nextId()
                return {
                    text: [`[${id}] Pairs that change in the same commits, most shared first${a.hidden_only ? " (only those with no import between them)" : ""}; % = share of each side's own commits:`,
                        ...rows.map(r => `${r.a} ↔ ${r.b}: ${fmt(r.shared_commits)} shared (${fmt(r.pa)}% / ${fmt(r.pb)}%) · ${r.hidden ? "NO import (hidden coupling)" : "import"}`)].join("\n"),
                    evidence: [{ id, kind: "table", title: a.hidden_only ? "Hidden coupling: change together, no import" : "What changes together", columns: ["Component", "Component", "Shared commits", "% of first", "% of second", "Import between them"], rows: rows.map(r => [r.a, r.b, r.shared_commits, r.pa, r.pb, r.hidden ? "no — hidden" : "yes"]), total: rows.length, ranOn, open: { route: "/views/connections", label: "Open Connections" } }],
                }
            }
            const { name, also } = resolveComponent(world, a.component)
            if (!name) return { text: notFound("component", a.component, also) }
            const sql = `SELECT CASE WHEN pair_1 = ${sq(name)} THEN pair_2 ELSE pair_1 END AS other, shared_commits,
                round(CASE WHEN pair_1 = ${sq(name)} THEN percentage_of_all_commits_pair_1 ELSE percentage_of_all_commits_pair_2 END, 1) AS pct
                FROM git_component_shared_commits WHERE (pair_1 = ${sq(name)} OR pair_2 = ${sq(name)}) AND pair_1 != pair_2 ORDER BY shared_commits DESC LIMIT 15`
            const rows = await world.query<{ other: string; shared_commits: number; pct: number }>(sql)
            if (!rows.length) return { text: `${name} never changed together with another component.` }
            const linked = new Set<string>()
            for (const r of world.connections()) {
                if (r.from === name) linked.add(r.to)
                if (r.to === name) linked.add(r.from)
            }
            const id = nextId()
            const hidden = rows.filter(r => !linked.has(r.other))
            return {
                text: [`[${id}] What changes with ${name} (shared commits; % of ${name}'s own commits; import between them?):`,
                    ...rows.map(r => `${r.other}: ${fmt(r.shared_commits)} shared (${fmt(r.pct)}%) · ${linked.has(r.other) ? "import" : "NO import (hidden coupling)"}`),
                    hidden.length ? `${hidden.length} of ${rows.length} have no import between them.` : "An import explains every pair."].join("\n"),
                evidence: [{ id, kind: "table", title: `What changes with ${shortName(name)}`, columns: ["Component", "Shared commits", `% of its commits`, "Import between them"], rows: rows.map(r => [r.other, r.shared_commits, r.pct, linked.has(r.other) ? "yes" : "no — hidden"]), total: rows.length, sql, ranOn, open: { route: "/views/connections", focus: `around ${/[\s,"]/.test(name) ? `"${name}"` : name}`, label: "Open in Connections" } }],
            }
        },
    },
    {
        name: "knowledge", namespace: "history",
        description: "Who knows a component: authors by share of its commits, and how concentrated that is (a bus factor). Names follow the workspace's pseudonymisation. Example: {\"component\": \"checkout\"}",
        params: { component: { type: "string", description: "Component name." } }, required: ["component"],
        label: a => `Looked at who knows ${a.component}`,
        async run(a, { world, ranOn, nextId }) {
            if (!("git_commits" in world.columns)) return { text: "This snapshot has no git history." }
            const { name, also } = resolveComponent(world, a.component)
            if (!name) return { text: notFound("component", a.component, also) }
            const sql = `SELECT author_name AS author, count(DISTINCT commit_hash) AS commits, max(commit_time) AS last FROM git_commits WHERE component = ${sq(name)} GROUP BY author_name ORDER BY commits DESC LIMIT 12`
            const rows = await world.query<{ author: string; commits: number; last: string }>(sql)
            if (!rows.length) return { text: `No commits recorded for ${name}.` }
            const total = (await world.query<{ n: number }>(`SELECT count(DISTINCT commit_hash) AS n FROM git_commits WHERE component = ${sq(name)}`))[0]?.n ?? rows.reduce((s, r) => s + r.commits, 0)
            let acc = 0, bus = 0
            for (const r of rows) { if (acc >= total / 2) break; acc += r.commits; bus++ }
            const id = nextId()
            const share = (c: number) => Math.round((100 * c) / Math.max(1, total))
            return {
                text: [`[${id}] ${fmt(total)} commits touch ${name}. Authors by share:`,
                    ...rows.map(r => `${world.author(r.author)}: ${fmt(r.commits)} commits (${share(r.commits)}%), last ${String(r.last).slice(0, 10)}`),
                    `${bus} author${bus === 1 ? "" : "s"} made half of the commits.`].join("\n"),
                evidence: [{ id, kind: "bars", title: `Who knows ${shortName(name)}`, metric: "commits", unit: "commits", items: rows.map(r => ({ label: world.author(r.author), value: Number(r.commits) })), note: `${bus} author${bus === 1 ? "" : "s"} made half of the ${fmt(total)} commits.`, ranOn, open: { route: componentPath(name, "history"), label: "Open history" } }],
            }
        },
    },
]
