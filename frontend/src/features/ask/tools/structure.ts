// Structure: the import graph in the app's own query language, tangles and
// cycles, and the cut plan the Cycles view makes. Every number here comes
// from the same functions the views call.

import { foldEdges, layoutTangle, planCuts, tanglesOf, type WEdge } from "~/features/cycles/untangle"
import { parseQuery, runQuery } from "~/features/groups/query"
import { detectSeparator } from "~/features/snapshot/names"
import type { Tool, World } from "../engine/types"
import { fmt, notFound, resolveComponent, shortName } from "./shared"

function edgesOf(world: World): WEdge[] {
    return foldEdges(world.connections())
}

function sortedTangles(world: World): string[][] {
    const edges = edgesOf(world)
    const nodes = new Set([...world.components().map(c => String(c.name)).filter(n => n !== "."), ...edges.flatMap(e => [e.from, e.to])])
    return tanglesOf(nodes, edges).map(t => [...t].sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

function linesOf(world: World): Map<string, number> {
    return new Map(world.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
}

export const structureTools: Tool[] = [
    {
        name: "graph", namespace: "graph",
        description: "Walk the import graph with the app's query language. Lines: `around X` (neighbours; add `depth 2` or `depth all`), `dependents of X depth all` (everything that could break if X changes), `dependencies of X`, `path from A to B` (shortest routes), `between A and B` (every route), `tangle of X`. Names may be globs (`*.web.*`). Example: {\"query\": \"dependents of checkout depth all\"}",
        params: { query: { type: "string", description: "One line of the query language." } }, required: ["query"],
        label: a => `Walked the graph: ${a.query}`,
        async run(a, { world, ranOn, nextId }) {
            const text = String(a.query ?? "").trim()
            const names = world.components().map(c => String(c.name)).filter(n => n !== ".")
            // Resolve loosely typed names to real ones, so "checkout" finds "org.shop.checkout".
            const fixed = text.replace(/\b(around|of|from|to|between|and)\s+("[^"]+"|[^\s,]+)/gi, (all, kw: string, n: string) => {
                const bare = n.replace(/^"|"$/g, "")
                if (/[*?]/.test(bare) || names.includes(bare) || /^(depth|all)$/i.test(bare)) return all
                const { name } = resolveComponent(world, bare)
                return name ? `${kw} ${/[\s,"]/.test(name) ? `"${name}"` : name}` : all
            })
            const q = parseQuery(fixed)
            if (q.errors?.length) return { text: `The query did not parse: ${q.errors.map((e: any) => e.message ?? String(e)).join("; ")}. Forms: around X [depth N|all] · dependents of X · dependencies of X · path from A to B · between A and B · tangle of X.` }
            const edges = edgesOf(world)
            const res = runQuery(q, { components: names, files: [], componentSep: detectSeparator(names), edges: edges.map(e => ({ from: e.from, to: e.to })) })
            const set = new Set(res.components)
            if (!set.size) {
                const route = fixed.match(/^\s*(path from|between)\s+(.+?)\s+(to|and)\s+(.+?)\s*$/i)
                if (route) {
                    const back = runQuery(parseQuery(`${route[1]} ${route[4]} ${route[3]} ${route[2]}`), { components: names, files: [], componentSep: detectSeparator(names), edges: edges.map(e => ({ from: e.from, to: e.to })) })
                    return { text: `No route: following imports from ${route[2]} never reaches ${route[4]}.${back.components.length ? ` The other way round there is one: ${route[4]} reaches ${route[2]} through ${back.components.length} components (${back.components.slice(0, 8).join(", ")}).` : " Not the other way round either: they are not connected by imports."}` }
                }
                return { text: `"${fixed}" matched nothing.${res.empty.length ? " Check the names with find." : ""}` }
            }
            const lines = linesOf(world)
            const anchors = [...fixed.matchAll(/\b(?:around|of|from|to|between|and)\s+("[^"]+"|[^\s,]+)/gi)].map(m => m[1].replace(/^"|"$/g, "")).filter(n => set.has(n))
            const shown = [...set].sort((x, y) => (anchors.includes(y) ? 1 : 0) - (anchors.includes(x) ? 1 : 0) || (lines.get(y) ?? 0) - (lines.get(x) ?? 0)).slice(0, 36)
            const inShown = new Set(shown)
            const sub = edges.filter(e => inShown.has(e.from) && inShown.has(e.to)).map(e => ({ from: e.from, to: e.to, weight: e.imports }))
            const id = nextId()
            const listed = [...set].sort()
            const body = [
                `[${id}] "${fixed}": ${fmt(set.size)} component${set.size === 1 ? "" : "s"}, ${fmt(edges.filter(e => set.has(e.from) && set.has(e.to)).length)} import edges among them.`,
                listed.slice(0, 60).join(", ") + (listed.length > 60 ? ` … and ${listed.length - 60} more` : ""),
            ].join("\n")
            return {
                text: body,
                evidence: [{ id, kind: "graph", title: fixed, query: fixed, nodes: shown, edges: sub, anchors, ranOn, open: { route: "/views/connections", focus: fixed, label: "Open in Connections" } }],
            }
        },
    },
    {
        name: "tangles", namespace: "cycles",
        description: "Every tangle: a set of components that can all reach each other through imports (a strongly connected set). Largest first, with members and how many imports run against the layering. Example: {\"limit\": 5}",
        params: { limit: { type: "number", description: "How many tangles, default 8." } },
        label: () => "Listed the tangles",
        async run(a, { world, ranOn, nextId }) {
            const all = sortedTangles(world)
            if (!all.length) return { text: "There are no tangles: the import graph has no cycles." }
            const edges = edgesOf(world)
            const limit = Math.max(1, Math.min(20, Number(a.limit) || 8))
            const rows = all.slice(0, limit).map((t, i) => {
                const inside = new Set(t)
                const own = edges.filter(e => inside.has(e.from) && inside.has(e.to))
                const layout = layoutTangle(t, own)
                return { n: i + 1, size: t.length, against: layout.against.length, members: t }
            })
            const id = nextId()
            return {
                text: [`[${id}] ${fmt(all.length)} tangles holding ${fmt(all.reduce((s, t) => s + t.length, 0))} components. Largest first:`,
                    ...rows.map(r => `Tangle ${r.n}: ${r.size} components, ${r.against} imports against the layering — ${r.members.slice(0, 8).join(", ")}${r.size > 8 ? " …" : ""}`)].join("\n"),
                evidence: [{
                    id, kind: "table", title: "Tangles, largest first", ranOn,
                    columns: ["Tangle", "Components", "Imports against the layering", "Members"],
                    rows: rows.map(r => [r.n, r.size, r.against, r.members.map(shortName).slice(0, 6).join(", ") + (r.size > 6 ? " …" : "")]),
                    total: all.length, note: "A tangle has no layers until the imports against the order are cut.",
                    open: { route: "/views/components/cycles", label: "Open Cycles" },
                }],
                followUps: [`What would untangle tangle 1?`],
            }
        },
    },
    {
        name: "cycles", namespace: "cycles",
        description: "Individual shortest cycles, as paths. Sort by size ascending for the smallest (2 = a mutual pair) or descending for the longest; optionally only those through one component. Example: {\"sort\": \"asc\", \"limit\": 5} or {\"involving\": \"web\"}",
        params: {
            sort: { type: "string", enum: ["asc", "desc"], description: "By cycle length: asc = smallest first (default)." },
            involving: { type: "string", description: "Only cycles through this component." },
            limit: { type: "number", description: "How many, default 10." },
        },
        label: a => `Listed the ${a.sort === "desc" ? "longest" : "smallest"} cycles${a.involving ? ` through ${a.involving}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            let list = world.cycles()
            let through = ""
            if (a.involving) {
                const { name, also } = resolveComponent(world, a.involving)
                if (!name) return { text: notFound("component", a.involving, also) }
                through = name
                list = list.filter(c => c.nodes.includes(name))
            }
            if (!list.length) return { text: through ? `${through} is in no cycle.` : "There are no cycles." }
            const desc = a.sort === "desc"
            const limit = Math.max(1, Math.min(30, Number(a.limit) || 10))
            const sorted = [...list].sort((x, y) => (desc ? y.nodes.length - x.nodes.length : x.nodes.length - y.nodes.length) || y.sharedCommits - x.sharedCommits)
            const pick = sorted.slice(0, limit)
            const sizes = new Map<number, number>()
            for (const c of list) sizes.set(c.nodes.length, (sizes.get(c.nodes.length) ?? 0) + 1)
            const id = nextId()
            const path = (nodes: string[]) => [...nodes, nodes[0]].join(" → ")
            return {
                text: [
                    `[${id}] ${fmt(list.length)} distinct shortest cycles${through ? ` through ${through}` : ""}. By length: ${[...sizes].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${v} of length ${k}`).join(", ")}.`,
                    `${desc ? "Longest" : "Smallest"} first:`,
                    ...pick.map((c, i) => `${i + 1}. (${c.nodes.length}) ${path(c.nodes)}${c.sharedCommits ? ` · ${c.sharedCommits} shared commits` : ""}`),
                ].join("\n"),
                evidence: [{
                    id, kind: "table", title: `${desc ? "Longest" : "Smallest"} cycles${through ? ` through ${shortName(through)}` : ""}`, ranOn,
                    columns: ["Length", "Cycle", "Shared commits"],
                    rows: pick.map(c => [c.nodes.length, [...c.nodes, c.nodes[0]].map(shortName).join(" → "), c.sharedCommits]),
                    total: list.length,
                    open: { route: through ? `/views/components/cycles?component=${encodeURIComponent(through)}` : "/views/components/cycles", label: "Open Cycles" },
                }],
                followUps: pick[0] ? [`Why does ${shortName(pick[0].nodes[0])} depend on ${shortName(pick[0].nodes[1] ?? pick[0].nodes[0])}?`, `What would untangle ${shortName(pick[0].nodes[0])}?`] : [],
            }
        },
    },
    {
        name: "untangle", namespace: "cycles",
        description: "How to break a tangle: the imports to cut, most untangling first, each with the files that carry it — the Cycles view's own plan. Give a component (its tangle) or a tangle number from tangles. Example: {\"component\": \"web\"} or {\"tangle\": 1}",
        params: {
            component: { type: "string", description: "A component in the tangle." },
            tangle: { type: "number", description: "A tangle number from the tangles tool (1 = largest)." },
        },
        label: a => `Planned the cuts for ${a.component ? a.component : `tangle ${a.tangle}`}`,
        async run(a, { world, ranOn, nextId }) {
            const all = sortedTangles(world)
            let members: string[] | undefined
            let anchor: string | undefined
            if (a.component) {
                const { name, also } = resolveComponent(world, a.component)
                if (!name) return { text: notFound("component", a.component, also) }
                anchor = name
                members = all.find(t => t.includes(name))
                if (!members) return { text: `${name} is in no tangle: nothing it imports leads back to it.` }
            } else {
                const i = Math.max(1, Number(a.tangle) || 1)
                members = all[i - 1]
                if (!members) return { text: `There ${all.length === 1 ? "is 1 tangle" : `are ${all.length} tangles`}; no tangle ${i}.` }
            }
            const inside = new Set(members)
            const own = edgesOf(world).filter(e => inside.has(e.from) && inside.has(e.to))
            const layout = layoutTangle(members, own)
            const plan = planCuts(members, layout)
            const carriers = new Map<string, Map<string, number>>()
            for (const r of world.connections()) {
                if (!inside.has(r.from) || !inside.has(r.to) || !r.file) continue
                const k = `${r.from}\u0000${r.to}`
                const m = carriers.get(k) ?? new Map<string, number>()
                m.set(String(r.file), (m.get(String(r.file)) ?? 0) + (Number(r.reference_count) || 1))
                carriers.set(k, m)
            }
            const filesFor = (from: string, to: string) => [...(carriers.get(`${from}\u0000${to}`) ?? new Map())].sort((x, y) => y[1] - x[1]).map(([f]) => f)
            const steps = plan.slice(0, 12).map(s => ({ from: s.from, to: s.to, imports: s.imports, files: s.files, freed: s.freed, tangled: s.tangled, carriers: filesFor(s.from, s.to).slice(0, 4) }))
            const id = nextId()
            const whole = plan.length
            const text = [
                `[${id}] Tangle of ${members.length} components${anchor ? ` containing ${anchor}` : ""}, in ${layout.layers.length} levels; ${layout.against.length} imports run against the order. Cutting them all (${whole} cuts) leaves no tangle. Most untangling first:`,
                ...steps.map((s, i) => `${i + 1}. cut ${s.from} → ${s.to} (${s.imports} import references in ${s.files} file${s.files === 1 ? "" : "s"}${s.carriers.length ? `: ${s.carriers.join(", ")}` : ""}) → ${s.freed} components freed, ${s.tangled} still tangled`),
                whole > steps.length ? `… ${whole - steps.length} more cuts in the Cycles view.` : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{
                    id, kind: "tangle", title: `Untangling ${members.length} components${anchor ? ` around ${shortName(anchor)}` : ""}`, members, anchor, ranOn,
                    edges: own.map(e => ({ from: e.from, to: e.to, imports: e.imports, files: e.files })), steps,
                    open: { route: `/views/components/cycles${anchor ? `?component=${encodeURIComponent(anchor)}` : ""}`, label: "Open in Cycles" },
                }],
                followUps: steps[0]?.carriers[0] ? [`Outline ${steps[0].carriers[0]}`] : [],
            }
        },
    },
]
