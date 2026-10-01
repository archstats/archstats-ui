// The codebase as a stack of floors: its top-level areas (or the parts of
// one area), ordered so imports run downward, with the imports that point
// back up, and what the floors hide (imports inside a floor, tangles within
// or across floors). Drawn by the Units view's StackDiagram.

import type { Floor, Flow } from "~/features/checks/components/StackDiagram.vue"
import { foldEdges, orderOf, tanglesOf, type WEdge } from "~/features/cycles/untangle"
import { areasOf } from "~/features/snapshot/areas"
import { candidates, separatorOf } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { t, intlLocale } from "~/shared/i18n"

export interface StackData {
    of: string | null
    floors: Floor[]
    flows: Flow[]
    grouping: string
    /** Import references between the stacked components, and how many stay inside one floor. */
    runtime: number
    insideFloor: number
    tangles: Array<{ size: number; floors: string[] }>
}

const n = (v: number) => v.toLocaleString(intlLocale)
const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`

export const stack = exhibit<StackData>()({
    kind: "stack", v: 1,
    summary: t("checks.stack.codebaseStackFloorsOrdered"),
    params: s.object({
        of: s.string().optional().describe(t("checks.stack.onlyPartsAreaComponent")),
    }, { aliases: { within: "of", component: "of", area: "of" } }),

    title: p => (p.of ? t("checks.stack.layersInside", { of: p.of }) : t("checks.stack.layersCodebase")),

    async resolve(p, { snap }): Promise<StackData | Absent> {
        let names = snap.components().map(c => String(c.name)).filter(x => x !== ".")
        let of: string | null = null
        if (p.of) {
            const base = candidates(names, p.of)[0] ?? String(p.of)
            const sep = separatorOf([base])
            names = names.filter(x => x === base || x.startsWith(base + sep) || x.startsWith(base + "/") || x.startsWith(base + "."))
            if (names.length < 2) return { absent: t("checks.stack.nothingStackUnderHas", { of: p.of, components: t("common.count.component", { count: names.length }) }) }
            of = base
        }
        const lines = new Map(snap.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        const areas = areasOf(names, x => lines.get(x) ?? 0)
        const inside = new Set(names)
        const floorOf = (x: string) => areas.of.get(x) ?? x
        const runtime = snap.connections().filter(r => inside.has(r.from) && inside.has(r.to) && r.from !== r.to)
        const edges: WEdge[] = foldEdges(runtime.map(r => ({ ...r, from: floorOf(r.from), to: floorOf(r.to) })), x => x === ".")
        const order = orderOf(areas.keys, edges)
        const pos = new Map(order.map((k, i) => [k, i]))
        const members = new Map<string, string[]>()
        for (const x of names) { const k = floorOf(x); (members.get(k) ?? members.set(k, []).get(k)!).push(x) }
        const size = (k: string) => (members.get(k) ?? []).reduce((sum, x) => sum + (lines.get(x) ?? 0), 0)
        const floors: Floor[] = order.map(k => ({ id: k, label: k, sub: t("checks.stack.lines", { t: t("common.count.component", { count: members.get(k)?.length ?? 0 }), k: n(size(k)) }), weight: size(k) }))
        const flows: Flow[] = edges.map(e => ({ key: `${e.from}>${e.to}`, from: e.from, to: e.to, count: e.imports, bad: pos.get(e.from)! > pos.get(e.to)! }))
        const tangles = tanglesOf(new Set(names), foldEdges(runtime))
            .sort((a, b) => b.length - a.length)
            .map(t => ({ size: t.length, floors: [...new Set(t.map(floorOf))] }))
        return { of, floors, flows, grouping: areas.how, runtime: runtime.length, insideFloor: runtime.filter(r => floorOf(r.from) === floorOf(r.to)).length, tangles }
    },

    facts(d) {
        const up = d.flows.filter(f => f.bad).sort((a, b) => b.count - a.count)
        const out: FactDraft[] = [
            { kind: "total", text: t("checks.stack.topBottomOrderedSo", { floors: t("common.count.floor", { count: d.floors.length }), value: d.of ? t("checks.stack.inside", { of: d.of }) : "", grouping: d.grouping }), entities: d.of ? [d.of] : [], values: { floors: d.floors.length } },
            ...d.floors.map((f, i): FactDraft => ({ kind: "row", text: t("checks.stack.floorTop", { value: i + 1, label: f.label, sub: f.sub }), entities: [f.id], values: { position: i + 1, lines: f.weight }, element: `floor:${f.id}` })),
        ]
        if (up.length) {
            const refs = up.reduce((sum, f) => sum + f.count, 0)
            out.push({ kind: "rank", text: t("checks.stack.betweenFloorsPointBack", { links: t("common.count.link", { count: up.length }), importReferences: t("common.count.importReference", { count: refs }) }), entities: [], values: { upward: up.length, references: refs } })
            for (const f of up.slice(0, 8)) out.push({ kind: "row", text: t("checks.stack.pointsBackUp", { from: f.from, to: f.to, importReferences: t("common.count.importReference", { count: f.count }) }), entities: [f.from, f.to], values: { references: f.count }, element: `flow:${f.key}` })
            if (up.length > 8) out.push({ kind: "note", text: t("checks.stack.smallerUpwardLinksNot", { value: n(up.length - 8) }), entities: [], values: { unlisted: up.length - 8 } })
        } else {
            out.push({ kind: "absence", text: t("checks.stack.noImportBetweenFloors"), entities: [], values: { upward: 0 } })
        }
        out.push({ kind: "note", text: t("checks.stack.importReferencesStayInside", { insideFloor: n(d.insideFloor), runtime: n(d.runtime) }), entities: [], values: { inside: d.insideFloor, references: d.runtime } })
        if (d.tangles.length) {
            for (const tangle of d.tangles.slice(0, 4)) out.push({ kind: "row", text: tangle.floors.length === 1 ? t("checks.stack.tangleSitsInsideFloor", { components: t("common.count.component", { count: tangle.size }), value: tangle.floors[0] }) : t("checks.stack.tangleCrossesFloors", { components: t("common.count.component", { count: tangle.size }), floorsLength: n(tangle.floors.length), value: tangle.floors.slice(0, 4).join(", ") }), entities: tangle.floors, values: { components: tangle.size, floors: tangle.floors.length } })
            out.push({ kind: "note", text: t("checks.stack.soOrderBetweenFloors"), entities: [], values: {} })
        } else {
            out.push({ kind: "absence", text: t("checks.stack.noTanglesAmongThese"), entities: [], values: { tangles: 0 } })
        }
        return out
    },

    elements: d => [
        ...d.floors.map(f => ({ id: `floor:${f.id}`, label: f.label })),
        ...d.flows.map(f => ({ id: `flow:${f.key}`, label: `${f.from} → ${f.to}` })),
    ],

    table: d => ({
        columns: [{ id: "floor", label: t("checks.stack.floorTopBottom") }, { id: "size", label: t("checks.stack.size") }, { id: "up", label: t("checks.stack.importReferencesPointingBack"), numeric: true }],
        rows: d.floors.map(f => ({ floor: f.label, size: f.sub, up: d.flows.filter(x => x.bad && x.from === f.id).reduce((sum, x) => sum + x.count, 0) })),
        total: d.floors.length,
        note: t("checks.stack.floors", { grouping: d.grouping }),
    }),

    figure: {
        load: () => import("~/features/checks/components/StackDiagram.vue"),
        // Its labels stay legible at a report page's width.
        exportWidth: 720,
        props: (d, _p, o) => {
            const h = o.highlight[0] ?? ""
            const selected = h.startsWith("floor:") ? { kind: "floor", id: h.slice(6) } : h.startsWith("flow:") ? { kind: "flow", id: h.slice(5) } : null
            return { floors: d.floors, flows: d.flows, selected, upLabel: t("checks.stack.pointsBackUp2"), ariaLabel: o.title, figure: o.title }
        },
        height: (d, o) => Math.min(o.density === "inline" ? 360 : 560, 90 + d.floors.length * 56),
        picks: { select: (sel: { kind: string; id: string } | null) => (sel ? `${sel.kind}:${sel.id}` : null) },
    },

    open: () => ({ route: "/views/units", label: t("checks.stack.openUnits") }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
        return big ? [{ of: String(big.name) }, { of: "no-such-area" }] : []
    },
})
