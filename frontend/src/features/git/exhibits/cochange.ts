// What changes in the same commits, and whether an import explains it.
// Co-change without an import between the pair is hidden coupling: the code
// is tied together in a way the imports do not show.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural, sq } from "~/features/exhibits/words"

export interface CochangeData {
    of: string | null
    hiddenOnly: boolean
    pairs: Array<{ a: string; b: string; shared: number; pa: number; pb: number; hidden: boolean }>
}

export const cochange = exhibit<CochangeData>()({
    kind: "cochange", v: 1,
    summary: "Pairs that change in the same commits, with whether an import explains each (hidden coupling when none does).",
    params: s.object({
        of: s.string().optional().describe("A component: what changes with it. The strongest pairs of the whole codebase when left out."),
        hidden: s.boolean().optional().describe("Only pairs with no import between them."),
    }, { aliases: { component: "of", hidden_only: "hidden" } }),

    title: (p, d) => ((d?.of ?? p.of) ? `What changes with ${d?.of ?? p.of}` : p.hidden ? "Hidden coupling: change together, no import" : "What changes together"),

    async resolve(p, { snap }): Promise<CochangeData | Absent> {
        if (!("git_component_shared_commits" in snap.columns)) return { absent: "This snapshot has no co-change data (no git history)." }
        const linked = new Set<string>()
        for (const r of snap.connections()) if (r.from !== r.to) { linked.add(`${r.from}\u0000${r.to}`); linked.add(`${r.to}\u0000${r.from}`) }
        let of: string | null = null
        let pairs: CochangeData["pairs"]
        if (p.of) {
            of = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!of) return { absent: `No component matches "${p.of}".` }
            const rows = await snap.query<{ other: string; shared_commits: number; pct: number; opct: number }>(`SELECT CASE WHEN pair_1 = ${sq(of)} THEN pair_2 ELSE pair_1 END AS other, shared_commits,
                round(CASE WHEN pair_1 = ${sq(of)} THEN percentage_of_all_commits_pair_1 ELSE percentage_of_all_commits_pair_2 END, 1) AS pct,
                round(CASE WHEN pair_1 = ${sq(of)} THEN percentage_of_all_commits_pair_2 ELSE percentage_of_all_commits_pair_1 END, 1) AS opct
                FROM git_component_shared_commits WHERE (pair_1 = ${sq(of)} OR pair_2 = ${sq(of)}) AND pair_1 != pair_2 ORDER BY shared_commits DESC LIMIT 60`)
            // The table can hold a pair in both directions: one row per partner.
            const seen = new Set<string>()
            pairs = rows.filter(r => !seen.has(String(r.other)) && !!seen.add(String(r.other))).map(r => ({ a: of!, b: String(r.other), shared: Number(r.shared_commits), pa: Number(r.pct), pb: Number(r.opct), hidden: !linked.has(`${of}\u0000${r.other}`) }))
        } else {
            const rows = await snap.query<{ a: string; b: string; shared_commits: number; pa: number; pb: number }>(`SELECT pair_1 AS a, pair_2 AS b, shared_commits, round(percentage_of_all_commits_pair_1, 1) AS pa, round(percentage_of_all_commits_pair_2, 1) AS pb FROM git_component_shared_commits WHERE pair_1 != pair_2 AND pair_1 < pair_2 ORDER BY shared_commits DESC LIMIT 200`)
            pairs = rows.map(r => ({ a: String(r.a), b: String(r.b), shared: Number(r.shared_commits), pa: Number(r.pa), pb: Number(r.pb), hidden: !linked.has(`${r.a}\u0000${r.b}`) }))
        }
        if (p.hidden) pairs = pairs.filter(x => x.hidden)
        pairs = pairs.slice(0, 15)
        if (!pairs.length) return { absent: of ? `${of} never changed together with another component${p.hidden ? " without an import between them" : ""}.` : "No pairs changed together." }
        return { of, hiddenOnly: !!p.hidden, pairs }
    },

    facts(d) {
        const hidden = d.pairs.filter(x => x.hidden).length
        const out: FactDraft[] = [{
            kind: "rank",
            text: `${d.of ? `What changes with ${d.of}` : `Pairs that change in the same commits${d.hiddenOnly ? ", only those with no import between them" : ""}`}, most shared commits first; % = share of each side's own commits. ${hidden} of ${d.pairs.length} have no import between them.`,
            entities: d.of ? [d.of] : [], values: { pairs: d.pairs.length, hidden },
        }]
        d.pairs.forEach(x => out.push({
            kind: "row",
            text: `${x.a} ↔ ${x.b}: ${plural(x.shared, "shared commit")} (${n(x.pa)}% of ${x.a}'s, ${n(x.pb)}% of ${x.b}'s); ${x.hidden ? "no import between them (hidden coupling)" : "an import explains it"}.`,
            entities: [x.a, x.b], values: { shared: x.shared, percent: x.pa, other_percent: x.pb }, element: `pair:${x.a}|${x.b}`,
        }))
        return out
    },

    elements: d => d.pairs.map(x => ({ id: `pair:${x.a}|${x.b}`, label: `${x.a} ↔ ${x.b}` })),

    table: d => ({
        columns: [{ id: "a", label: "Component" }, { id: "b", label: "Changes with" }, { id: "shared", label: "Shared commits", numeric: true }, { id: "pa", label: "% of first", numeric: true }, { id: "pb", label: "% of second", numeric: true }, { id: "import", label: "Import between them" }],
        rows: d.pairs.map(x => ({ a: x.a, b: x.b, shared: x.shared, pa: x.pa, pb: x.pb, import: x.hidden ? "no — hidden" : "yes" })),
    }),

    open: () => ({ route: "/views/connections", label: "Open Connections" }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.git__commits__total) || 0) - (Number(a.git__commits__total) || 0))[0]
        return [{ hidden: true }, ...(big ? [{ of: String(big.name) }] : [])]
    },
})
