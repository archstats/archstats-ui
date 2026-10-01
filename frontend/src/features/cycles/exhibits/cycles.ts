// The individual cycles: distinct shortest cycles as paths, how many of each
// length, the smallest first (a length of 2 is a mutual pair). Through one
// component when named.

import { candidates, shortName } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface CyclesData {
    through: string | null
    count: number
    byLength: Array<{ length: number; count: number }>
    smallest: string[][]
}

export const cycles = exhibit<CyclesData>()({
    kind: "cycles", v: 1,
    summary: t("cycles.cycles.distinctShortestCyclesHow"),
    params: s.object({
        of: s.string().optional().describe(t("cycles.cycles.onlyCyclesThroughComponent")),
    }, { aliases: { component: "of", involving: "of" } }),

    title: (p, d) => t("cycles.cycles.smallestCycles", { value: (d?.through ?? p.of) ? t("cycles.cycles.through", { value: d?.through ?? p.of }) : "" }),

    async resolve(p, { snap }): Promise<CyclesData | Absent> {
        let list = snap.cycles()
        let through: string | null = null
        if (p.of) {
            through = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!through) return { absent: t("cycles.cycles.noComponentMatches", { of: p.of }) }
            list = list.filter(c => c.nodes.includes(through!))
        }
        if (!list.length) return { absent: through ? t("cycles.cycles.noCycle", { through }) : t("cycles.cycles.thereNoCyclesImport") }
        const sizes = new Map<number, number>()
        for (const c of list) sizes.set(c.nodes.length, (sizes.get(c.nodes.length) ?? 0) + 1)
        return {
            through, count: list.length,
            byLength: [...sizes].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count })),
            smallest: [...list].sort((a, b) => a.nodes.length - b.nodes.length).slice(0, 12).map(c => c.nodes),
        }
    },

    facts(d) {
        const out: FactDraft[] = [
            { kind: "total", text: t("cycles.cycles.length", { distinctShortestCycles: t("common.count.distinctShortestCycle", { count: d.count }), value: d.through ? t("cycles.cycles.runThrough", { through: d.through }) : "", value2: d.byLength.map(x => t("cycles.cycles.length2", { count: n(x.count), length: x.length })).join(", ") }), entities: d.through ? [d.through] : [], values: { cycles: d.count, ...Object.fromEntries(d.byLength.map(x => [`length_${x.length}`, x.count])) } },
            { kind: "rank", text: t("cycles.cycles.smallestHasSmallestFirst", { components: t("common.count.component", { count: d.smallest[0].length }), value: d.smallest[0].length === 2 ? t("cycles.cycles.mutualPairEachImports") : "" }), entities: d.smallest[0], values: { smallest: d.smallest[0].length } },
        ]
        d.smallest.slice(0, 8).forEach((c, i) => out.push({ kind: "row", text: `${i + 1}. (${c.length}) ${[...c, c[0]].join(" → ")}.`, entities: c, values: { length: c.length } }))
        return out
    },

    table: d => ({
        columns: [{ id: "length", label: t("cycles.cycles.length3"), numeric: true }, { id: "cycle", label: t("cycles.cycles.cycle") }],
        rows: d.smallest.map(c => ({ length: c.length, cycle: [...c, c[0]].map(shortName).join(" → ") })),
        total: d.count,
    }),

    open: (_p, d) => ({ route: d?.through ? `/views/components/cycles?component=${encodeURIComponent(d.through)}` : "/views/components/cycles", label: t("cycles.cycles.openCycles") }),

    samples: snap => {
        const c = snap.cycles()[0]?.nodes[0]
        return c ? [{ of: c }] : []
    },
})
