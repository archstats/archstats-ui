// One tangle and the plan that breaks it: the components that all reach each
// other, in levels, the imports against the levels, and the cuts in the order
// that untangles most first, each with the files that carry it. The Cycles
// view's own layout and plan; drawn by its TangleGraph (or TangleMatrix when
// large).

import { foldEdges, layoutTangle, planCuts, tanglesOf, type WEdge } from "~/features/cycles/untangle"
import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { t, intlLocale } from "~/shared/i18n"

/** `freed` counts every component out of the tangle after this cut and the ones before it; `frees` what this cut adds. */
export interface TangleStep { from: string; to: string; imports: number; files: number; freed: number; frees: number; tangled: number; carriers: string[] }

export interface TangleData {
    /** How many tangles the codebase has, and how many components they hold. */
    count: number
    held: number
    /** Which tangle this is, largest first. */
    rank: number
    anchor: string | null
    members: string[]
    edges: WEdge[]
    lines: Record<string, number>
    levels: number
    against: number
    steps: TangleStep[]
    cuts: number
}

const n = (v: number) => v.toLocaleString(intlLocale)
const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`

export const tangle = exhibit<TangleData>()({
    kind: "tangle", v: 1,
    summary: t("cycles.tangle.oneTangleComponentsAll"),
    params: s.object({
        of: s.string().optional().describe(t("cycles.tangle.componentTangleLargestTangle")),
    }, { aliases: { component: "of", around: "of" } }),

    title: (p, d) => (d ? t("cycles.tangle.tangle", { components: t("common.count.component", { count: d.members.length }), value: d.anchor ? t("cycles.tangle.around", { anchor: d.anchor }) : "" }) : p.of ? t("cycles.tangle.tangleAround", { of: p.of }) : t("cycles.tangle.largestTangle")),

    async resolve(p, { snap }): Promise<TangleData | Absent> {
        const edges = foldEdges(snap.connections())
        const names = snap.components().map(c => String(c.name)).filter(x => x !== ".")
        const all = tanglesOf(new Set([...names, ...edges.flatMap(e => [e.from, e.to])]), edges)
            .map(t => [...t].sort())
            .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
        if (!all.length) return { absent: t("cycles.tangle.thereNoTanglesImport") }
        let anchor: string | null = null
        let rank = 1
        if (p.of) {
            anchor = candidates(names, p.of)[0] ?? null
            if (!anchor) return { absent: t("cycles.tangle.noComponentMatches", { of: p.of }) }
            rank = all.findIndex(t => t.includes(anchor!)) + 1
            if (!rank) return { absent: t("cycles.tangle.noTangleNothingImports", { anchor }) }
        }
        const members = all[rank - 1]
        const inside = new Set(members)
        const own = edges.filter(e => inside.has(e.from) && inside.has(e.to))
        const layout = layoutTangle(members, own)
        const plan = planCuts(members, layout)
        const carriers = new Map<string, Map<string, number>>()
        for (const r of snap.connections()) {
            if (!inside.has(r.from) || !inside.has(r.to) || !r.file) continue
            const k = `${r.from}\u0000${r.to}`
            const m = carriers.get(k) ?? new Map<string, number>()
            m.set(String(r.file), (m.get(String(r.file)) ?? 0) + (Number(r.reference_count) || 1))
            carriers.set(k, m)
        }
        const filesFor = (from: string, to: string) => [...(carriers.get(`${from}\u0000${to}`) ?? new Map())].sort((x, y) => y[1] - x[1]).map(([f]) => f)
        const lineOf = new Map(snap.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        return {
            count: all.length, held: all.reduce((sum, t) => sum + t.length, 0), rank, anchor, members, edges: own,
            lines: Object.fromEntries(members.map(m => [m, lineOf.get(m) ?? 0])),
            levels: layout.layers.length, against: layout.against.length,
            steps: plan.slice(0, 12).map((x, i) => ({ from: x.from, to: x.to, imports: x.imports, files: x.files, freed: x.freed, frees: x.freed - (i ? plan[i - 1].freed : 0), tangled: x.tangled, carriers: filesFor(x.from, x.to).slice(0, 4) })),
            cuts: plan.length,
        }
    },

    facts(d) {
        const out: FactDraft[] = [
            { kind: "total", text: t("cycles.tangle.codebaseHolding", { tangles: t("common.count.tangle", { count: d.count }), components: t("common.count.component", { count: d.held }), value: d.rank === 1 ? t("cycles.tangle.largest") : t("cycles.tangle.numberSize", { rank: d.rank }) }), entities: [], values: { tangles: d.count, components: d.held, rank: d.rank } },
            { kind: "row", text: t("cycles.tangle.tangleHasRunAgainst", { components: t("common.count.component", { count: d.members.length }), levels: t("common.count.level", { count: d.levels }), imports: t("common.count.import", { count: d.against }), value: d.cuts === 1 ? t("cycles.tangle.it") : t("cycles.tangle.all", { cuts: n(d.cuts) }) }), entities: d.anchor ? [d.anchor] : [], values: { components: d.members.length, levels: d.levels, against: d.against, cuts: d.cuts } },
            ...d.steps.slice(0, 8).map((x, i): FactDraft => ({
                kind: "row",
                text: t("cycles.tangle.cutCutFreesCuts", { value: i + 1, from: x.from, to: x.to, importReferences: t("common.count.importReference", { count: x.imports }), files: t("common.count.file", { count: x.files }), value2: x.carriers.length ? ` (${x.carriers.slice(0, 2).join(", ")})` : "", components: t("common.count.component", { count: x.frees ?? 0 }), freed: n(x.freed), tangled: n(x.tangled) }),
                entities: [x.from, x.to], values: { step: i + 1, references: x.imports, files: x.files, frees: x.frees ?? 0, freed: x.freed, tangled: x.tangled }, element: `edge:${x.from}>${x.to}`,
            })),
            { kind: "note", text: t("cycles.tangle.members", { value: d.members.slice(0, 12).join(", "), value2: d.members.length > 12 ? t("cycles.tangle.more", { value: n(d.members.length - 12) }) : "" }), entities: d.members.slice(0, 12), values: {} },
        ]
        if (d.cuts > 8) out.push({ kind: "note", text: t("cycles.tangle.furtherCutsCyclesView", { value: n(d.cuts - 8) }), entities: [], values: { more: d.cuts - 8 } })
        return out
    },

    elements: d => [
        ...d.members.map(m => ({ id: `component:${m}`, label: m })),
        ...d.edges.map(e => ({ id: `edge:${e.from}>${e.to}`, label: `${e.from} → ${e.to}` })),
    ],

    table: d => ({
        columns: [{ id: "cut", label: t("cycles.tangle.importCut") }, { id: "imports", label: t("cycles.tangle.importReferences"), numeric: true }, { id: "frees", label: t("cycles.tangle.cutFrees"), numeric: true }, { id: "freed", label: t("cycles.tangle.outSoFar"), numeric: true }, { id: "tangled", label: t("cycles.tangle.stillTangled"), numeric: true }, { id: "files", label: t("cycles.tangle.carried") }],
        rows: d.steps.map(x => ({ cut: `${x.from} → ${x.to}`, imports: x.imports, frees: x.frees ?? 0, freed: x.freed, tangled: x.tangled, files: x.carriers.join(", ") })),
        total: d.cuts,
        note: t("cycles.tangle.tangleCutsOrderUntangles", { components: t("common.count.component", { count: d.members.length }) }),
    }),

    figure: {
        load: () => import("~/features/cycles/components/TangleExhibit.vue"),
        props: (d, _p, o) => ({ members: d.members, edges: d.edges, steps: d.steps, lines: d.lines, anchor: d.anchor, highlight: o.highlight, title: o.title, density: o.density }),
        // Tall enough to draw every level near full size (labels stay legible), plus the cut list under it.
        height: (d, o) => {
            const cuts = Math.min(8, d.steps.length) * 21 + (d.steps.length > 8 ? 20 : 0) + 8
            const levels = layoutTangle(d.members, d.edges).layers
            const graph = d.members.length <= 40 && Math.max(0, ...levels.map(l => l.length)) <= 10
            // A full matrix gets rows of 10px at least, so its row labels are drawn (they are left out below 9px).
            const drawing = graph ? 52 + levels.length * 84 + 40 : o.density === "inline" ? 440 : Math.max(560, Math.round((26 + d.members.length * 10.5 + 90) / 0.92))
            return Math.min(o.density === "inline" ? 680 : 1600, Math.round(drawing * 0.92) + cuts)
        },
        fill: true,
        // Past forty members it is a matrix whose names print too small to read; the cut plan prints instead.
        printable: d => d.members.length <= 40,
        picks: { "select-node": (id: string) => `component:${id}`, "select-edge": (from: string, to: string) => `edge:${from}>${to}` },
    },

    open: (_p, d) => ({ route: d?.anchor ? `/views/components/cycles?component=${encodeURIComponent(d.anchor)}` : "/views/components/cycles", label: t("cycles.tangle.openCycles") }),

    samples: snap => {
        const c = snap.cycles()[0]?.nodes[0]
        return c ? [{ of: c }] : []
    },
})
