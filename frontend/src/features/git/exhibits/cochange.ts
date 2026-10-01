// What changes in the same commits, and whether an import explains it.
// Co-change without an import between the pair is hidden coupling: the code
// is tied together in a way the imports do not show.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural, sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface CochangeData {
    of: string | null
    hiddenOnly: boolean
    pairs: Array<{ a: string; b: string; shared: number; pa: number; pb: number; hidden: boolean }>
}

export const cochange = exhibit<CochangeData>()({
    kind: "cochange", v: 1,
    summary: t("git.exhibitsCochange.pairsChangeSameCommits"),
    params: s.object({
        of: s.string().optional().describe(t("git.exhibitsCochange.componentWhatChangesStrongest")),
        hidden: s.boolean().optional().describe(t("git.exhibitsCochange.onlyPairsNoImport")),
    }, { aliases: { component: "of", hidden_only: "hidden" } }),

    title: (p, d) => ((d?.of ?? p.of) ? t("git.exhibitsCochange.whatChanges", { value: d?.of ?? p.of }) : p.hidden ? t("git.exhibitsCochange.hiddenCouplingChangeTogether") : t("git.exhibitsCochange.whatChangesTogether")),

    async resolve(p, { snap }): Promise<CochangeData | Absent> {
        if (!("git_component_shared_commits" in snap.columns)) return { absent: t("git.exhibitsCochange.snapshotHasNoCo") }
        const linked = new Set<string>()
        for (const r of snap.connections()) if (r.from !== r.to) { linked.add(`${r.from}\u0000${r.to}`); linked.add(`${r.to}\u0000${r.from}`) }
        let of: string | null = null
        let pairs: CochangeData["pairs"]
        if (p.of) {
            of = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!of) return { absent: t("git.exhibitsCochange.noComponentMatches", { of: p.of }) }
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
        if (!pairs.length) return { absent: of ? t("git.exhibitsCochange.neverChangedTogetherAnother", { of, value: p.hidden ? t("git.exhibitsCochange.withoutImportBetweenThem") : "" }) : t("git.exhibitsCochange.noPairsChangedTogether") }
        return { of, hiddenOnly: !!p.hidden, pairs }
    },

    facts(d) {
        const hidden = d.pairs.filter(x => x.hidden).length
        const out: FactDraft[] = [{
            kind: "rank",
            text: t("git.exhibitsCochange.mostSharedCommitsFirst", { value: d.of ? t("git.exhibitsCochange.whatChanges2", { of: d.of }) : t("git.exhibitsCochange.pairsChangeSameCommits2", { value: d.hiddenOnly ? t("git.exhibitsCochange.onlyThoseNoImport") : "" }), hidden, pairsLength: d.pairs.length }),
            entities: d.of ? [d.of] : [], values: { pairs: d.pairs.length, hidden },
        }]
        d.pairs.forEach(x => out.push({
            kind: "row",
            text: t("git.exhibitsCochange.sS", { a: x.a, b: x.b, sharedCommits: t("common.count.sharedCommit", { count: x.shared }), pa: n(x.pa), a2: x.a, pb: n(x.pb), b2: x.b, value: x.hidden ? t("git.exhibitsCochange.noImportBetweenThem") : t("git.exhibitsCochange.importExplains") }),
            entities: [x.a, x.b], values: { shared: x.shared, percent: x.pa, other_percent: x.pb }, element: `pair:${x.a}|${x.b}`,
        }))
        return out
    },

    elements: d => d.pairs.map(x => ({ id: `pair:${x.a}|${x.b}`, label: `${x.a} ↔ ${x.b}` })),

    table: d => ({
        columns: [{ id: "a", label: t("git.exhibitsCochange.component") }, { id: "b", label: t("git.exhibitsCochange.changes") }, { id: "shared", label: t("git.exhibitsCochange.sharedCommits"), numeric: true }, { id: "pa", label: t("git.exhibitsCochange.first"), numeric: true }, { id: "pb", label: t("git.exhibitsCochange.second"), numeric: true }, { id: "import", label: t("git.exhibitsCochange.importBetweenThem") }],
        rows: d.pairs.map(x => ({ a: x.a, b: x.b, shared: x.shared, pa: x.pa, pb: x.pb, import: x.hidden ? t("git.exhibitsCochange.noHidden") : t("git.exhibitsCochange.yes") })),
    }),

    open: () => ({ route: "/views/connections", label: t("git.exhibitsCochange.openConnections") }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.git__commits__total) || 0) - (Number(a.git__commits__total) || 0))[0]
        return [{ hidden: true }, ...(big ? [{ of: String(big.name) }] : [])]
    },
})
