// What a component uses and what uses it: its direct neighbours with the
// import references between them, how far a change could ripple (everything
// that depends on it, all the way up), and, given a second component, the
// routes between the two and the files that make each import. Drawn as the
// Connections view's matrix.

import { foldEdges } from "~/features/cycles/untangle"
import { parseQuery, runQuery } from "~/features/groups/query"
import { candidates, detectSeparator } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { plural } from "~/features/exhibits/words"

export interface NeighboursData {
    of: string
    on: string | null
    direction: "both" | "uses" | "used by"
    uses: Array<{ name: string; references: number; files: string[] }>
    usedBy: Array<{ name: string; references: number; files: string[] }>
    /** Everything that depends on it through any chain of imports, and everything it depends on that way. */
    reachUp: number
    reachDown: number
    /** With `on`: the components on the shortest routes, and whether the route runs of → on or on → of. */
    route: { from: string; to: string; via: string[] } | null
    nodes: string[]
    edges: Array<{ from: string; to: string; references: number }>
    lines: Record<string, number>
    more: number
}

const quote = (x: string) => (/[\s,"]/.test(x) ? `"${x}"` : x)

export const neighbours = exhibit<NeighboursData>()({
    kind: "neighbours", v: 1,
    summary: "What a component uses and what uses it, how far a change ripples, and the route to a second component.",
    params: s.object({
        of: s.string().describe("The component."),
        direction: s.enum(["both", "uses", "used by"]).default("both").describe("What it uses, what uses it, or both (default)."),
        on: s.string().optional().describe("A second component: the route between the two, and the files that make each import."),
    }, { aliases: { component: "of", name: "of", to: "on", from: "of" } }),

    title: (p, d) => (d?.on ? `From ${d.route?.from ?? d.of} to ${d.route?.to ?? d.on}` : `${d?.direction === "uses" ? "What" : d?.direction === "used by" ? "What uses" : "Around"} ${d?.of ?? p.of}${d?.direction === "uses" ? " uses" : ""}`),

    async resolve(p, { snap }): Promise<NeighboursData | Absent> {
        const names = snap.components().map(c => String(c.name)).filter(x => x !== ".")
        const of = candidates(names, p.of)[0]
        if (!of) return { absent: `No component matches "${p.of}".` }
        const on = p.on ? candidates(names, p.on)[0] ?? null : null
        if (p.on && !on) return { absent: `No component matches "${p.on}".` }
        const direction = (p.direction ?? "both") as NeighboursData["direction"]
        const edges = foldEdges(snap.connections())
        const ctx = { components: names, files: [], componentSep: detectSeparator(names), edges: edges.map(e => ({ from: e.from, to: e.to })) }
        const run = (q: string) => runQuery(parseQuery(q), ctx).components

        // Which files make each import, most references first.
        const carriers = new Map<string, Map<string, number>>()
        for (const r of snap.connections()) {
            if (r.from === r.to || !r.file) continue
            const k = `${r.from}\u0000${r.to}`
            const m = carriers.get(k) ?? new Map<string, number>()
            m.set(String(r.file), (m.get(String(r.file)) ?? 0) + (Number(r.reference_count) || 1))
            carriers.set(k, m)
        }
        const filesFor = (from: string, to: string) => [...(carriers.get(`${from}\u0000${to}`) ?? new Map())].sort((x, y) => y[1] - x[1]).map(([f]) => f).slice(0, 4)
        const uses = edges.filter(e => e.from === of && e.to !== of).map(e => ({ name: e.to, references: e.imports, files: filesFor(of, e.to) })).sort((a, b) => b.references - a.references)
        const usedBy = edges.filter(e => e.to === of && e.from !== of).map(e => ({ name: e.from, references: e.imports, files: filesFor(e.from, of) })).sort((a, b) => b.references - a.references)
        const reachUp = run(`dependents of ${quote(of)} depth all`).filter(x => x !== of).length
        const reachDown = run(`dependencies of ${quote(of)} depth all`).filter(x => x !== of).length

        let route: NeighboursData["route"] = null
        let shown: string[]
        if (on) {
            let via = run(`path from ${quote(of)} to ${quote(on)}`)
            let from = of, to = on
            if (!via.length) { via = run(`path from ${quote(on)} to ${quote(of)}`); from = on; to = of }
            route = via.length ? { from, to, via } : null
            shown = via.length ? via : [of, on]
        } else {
            const side = direction === "uses" ? uses : direction === "used by" ? usedBy : [...uses, ...usedBy].sort((a, b) => b.references - a.references)
            shown = [of, ...new Set(side.map(x => x.name))]
        }
        const all = shown.length
        shown = shown.slice(0, 30)
        const inShown = new Set(shown)
        const lineOf = new Map(snap.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        return {
            of, on, direction, uses, usedBy, reachUp, reachDown, route,
            nodes: shown,
            edges: edges.filter(e => inShown.has(e.from) && inShown.has(e.to) && e.from !== e.to).map(e => ({ from: e.from, to: e.to, references: e.imports })),
            lines: Object.fromEntries(shown.map(x => [x, lineOf.get(x) ?? 0])),
            more: all - shown.length,
        }
    },

    facts(d) {
        const out: FactDraft[] = []
        if (d.on) {
            if (!d.route) out.push({ kind: "absence", text: `No chain of imports connects ${d.of} and ${d.on}, in either direction.`, entities: [d.of, d.on], values: { route: 0 } })
            else {
                const direct = d.route.via.length === 2
                out.push({ kind: "row", text: `${d.route.from} reaches ${d.route.to} through imports${direct ? " directly" : `, through ${plural(d.route.via.length - 2, "component")} in between on the shortest routes (${d.route.via.slice(0, 10).join(", ")})`}${d.route.from !== d.of ? `; ${d.of} does not reach ${d.on}` : ""}.`, entities: [d.route.from, d.route.to], values: { between: d.route.via.length - 2 } })
                const hop = [...d.uses, ...d.usedBy].find(x => x.name === (d.route!.from === d.of ? d.on : d.of))
                if (hop) out.push({ kind: "row", text: `The import ${d.route.from} → ${d.route.to} has ${plural(hop.references, "import reference")}${hop.files.length ? `, made in ${hop.files.join(", ")}` : ""}.`, entities: [d.route.from, d.route.to], values: { references: hop.references }, element: `edge:${d.route.from}>${d.route.to}` })
            }
            return out
        }
        out.push({ kind: "total", text: `${d.of} uses ${plural(d.uses.length, "component")} directly and is used by ${plural(d.usedBy.length, "component")} directly.`, entities: [d.of], values: { uses: d.uses.length, used_by: d.usedBy.length } })
        out.push({ kind: "total", text: `A change to ${d.of} can reach ${plural(d.reachUp, "component")} that depend on it through any chain of imports; it depends on ${plural(d.reachDown, "component")} that way.`, entities: [d.of], values: { reach_up: d.reachUp, reach_down: d.reachDown } })
        const side = (list: NeighboursData["uses"], verb: string, from: (x: string) => [string, string]) => list.slice(0, 8).map((x): FactDraft => {
            const [a, b] = from(x.name)
            return { kind: "row", text: `${verb}: ${x.name}, ${plural(x.references, "import reference")}${x.files.length ? ` (in ${x.files.slice(0, 2).join(", ")})` : ""}.`, entities: [x.name], values: { references: x.references }, element: `edge:${a}>${b}` }
        })
        if (d.direction !== "used by") out.push(...side(d.uses, `${d.of} uses`, x => [d.of, x]))
        if (d.direction !== "uses") out.push(...side(d.usedBy, `Used by`, x => [x, d.of]))
        if (!d.uses.length && d.direction !== "used by") out.push({ kind: "absence", text: `${d.of} imports no other component.`, entities: [d.of], values: { uses: 0 } })
        if (!d.usedBy.length && d.direction !== "uses") out.push({ kind: "absence", text: `No other component imports ${d.of}.`, entities: [d.of], values: { used_by: 0 } })
        return out
    },

    // Every direct import can be lit, drawn or not: a fact about the ninth neighbour still names a real import.
    elements: d => {
        const edges = new Map(d.edges.map(e => [`edge:${e.from}>${e.to}`, `${e.from} → ${e.to}`]))
        for (const x of d.uses) edges.set(`edge:${d.of}>${x.name}`, `${d.of} → ${x.name}`)
        for (const x of d.usedBy) edges.set(`edge:${x.name}>${d.of}`, `${x.name} → ${d.of}`)
        if (d.route) edges.set(`edge:${d.route.from}>${d.route.to}`, `${d.route.from} → ${d.route.to}`)
        return [...d.nodes.map(x => ({ id: `component:${x}`, label: x })), ...[...edges].map(([id, label]) => ({ id, label }))]
    },

    table: d => ({
        columns: [{ id: "name", label: "Component" }, { id: "direction", label: "Relation" }, { id: "references", label: "Import references", numeric: true }, { id: "files", label: "Made in" }],
        rows: [...d.uses.map(x => ({ name: x.name, direction: `${d.of} uses it`, references: x.references, files: x.files.join(", ") })), ...d.usedBy.map(x => ({ name: x.name, direction: `uses ${d.of}`, references: x.references, files: x.files.join(", ") }))],
    }),

    figure: {
        load: () => import("~/features/connections/components/MatrixExhibit.vue"),
        when: d => d.nodes.length > 1,
        props: (d, _p, o) => ({ nodes: d.nodes, edges: d.edges, lines: d.lines, anchors: [d.of, ...(d.on ? [d.on] : [])], highlight: o.highlight, more: d.more }),
        height: (d, o) => Math.min(o.density === "inline" ? 420 : 620, 150 + d.nodes.length * 20),
        fill: true,
        picks: { pick: (element: string) => element },
    },

    open: (_p, d) => (d ? { route: "/views/connections", focus: d.on ? `path from ${quote(d.of)} to ${quote(d.on)}` : `around ${quote(d.of)}`, label: "Open Connections" } : null),

    samples: snap => {
        const byDeps = [...snap.components()].filter(c => c.name !== ".").sort((a, b) => (Number(b.modularity__coupling__dependents) || 0) - (Number(a.modularity__coupling__dependents) || 0))
        const a = byDeps[0] ? String(byDeps[0].name) : null
        const b = byDeps[byDeps.length - 1] ? String(byDeps[byDeps.length - 1].name) : null
        return a ? [{ of: a }, { of: a, direction: "used by" }, ...(b ? [{ of: b, on: a }] : [])] : []
    },
})
