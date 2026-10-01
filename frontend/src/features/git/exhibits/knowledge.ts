// Who still knows each part of the codebase: every component marked written
// by active contributors, changed by them, changed once, or with no active
// contributor, and the person to ask. The Authors view's knowledge map, over
// the last year of history.

import { buildKnowledge, knowledgePairsSql, peopleToAsk, STATES, summarise, type KnowledgePair } from "~/features/git/knowledgeLeft"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

type Row = { component: string; lines: number; state: string; hereShare: number; hereCommits: number; ask: string | null; main: string | null }

export interface KnowledgeData {
    of: string
    last: string
    rows: Row[]
    summary: ReturnType<typeof summarise>
    people: Array<{ name: string; components: number; lines: number; only: number }>
    nobody: Array<{ component: string; lines: number }>
}

export const knowledge = exhibit<KnowledgeData>()({
    kind: "knowledge", v: 1,
    summary: t("git.knowledge.whoStillKnowsEach"),
    params: s.object({
        of: s.string().optional().describe(t("git.knowledge.onlyComponentsWhoseName")),
    }, { aliases: { within: "of", component: "of" } }),

    title: (p, d) => t("git.knowledge.whoStillKnowsCode", { value: (d?.of || p.of) ? ` · ${d?.of || p.of}` : "" }),

    async resolve(p, { snap }): Promise<KnowledgeData | Absent> {
        if (!("git_commits" in snap.columns)) return { absent: t("git.knowledge.snapshotHasNoGit") }
        const newest = (await snap.query<{ t: string }>("SELECT max(commit_time) AS t FROM git_commits"))[0]?.t
        if (!newest) return { absent: t("git.knowledge.noCommitsRecorded") }
        // Counted back from where the Authors view counts: the newest commit scanned (git_based_on), else the scan's time.
        const at = [snap.info.git_based_on, snap.info.scanned_at, newest].map(x => new Date(String(x ?? ""))).find(d => !Number.isNaN(d.getTime()))!
        const last = at.toISOString()
        const anchor = `julianday('${last}')`
        const pairs = await snap.query<KnowledgePair>(knowledgePairsSql({ aliases: snap.aliases?.() ?? {}, includeBots: false, anchor }))
        const lines = new Map(snap.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        // As the view: components with code today; a component whose files are all gone has nothing to know.
        let rows = buildKnowledge(pairs, lines, 365).filter(r => r.lines > 0)
        const of = String(p.of ?? "").trim()
        if (of) rows = rows.filter(r => r.component.toLowerCase().includes(of.toLowerCase()))
        if (!rows.length) return { absent: t("git.knowledge.noComponentsHistoryMatch") }
        return {
            of, last: String(last).slice(0, 10),
            rows: rows.slice(0, 600).map(r => ({ component: r.component, lines: r.lines, state: r.state, hereShare: r.hereShare, hereCommits: r.hereCommits, ask: r.ask ? snap.author(r.ask.author) : null, main: r.main ? snap.author(r.main.author) : null })),
            summary: summarise(rows),
            people: peopleToAsk(rows).people.slice(0, 6).map(x => ({ name: snap.author(x.author), components: x.components.length, lines: x.lines, only: x.only })),
            nobody: rows.filter(r => r.state === "nobody").sort((a, b) => b.lines - a.lines).slice(0, 6).map(r => ({ component: r.component, lines: r.lines })),
        }
    },

    facts(d) {
        const sum = d.summary
        const out: FactDraft[] = [{ kind: "total", text: t("git.knowledge.codeCommitsPeopleCount", { components: t("common.count.component", { count: sum.components }), lines: t("common.count.line", { count: sum.lines }), last: d.last, peopleHere: n(sum.peopleHere), authors: t("common.count.author", { count: sum.people }) }), entities: [], values: { components: sum.components, lines: sum.lines, active: sum.peopleHere, authors: sum.people } }]
        for (const st of STATES) out.push({ kind: "row", text: `${st.label}: ${t("common.count.component", { count: sum.byState[st.id].components })}, ${t("common.count.line", { count: sum.byState[st.id].lines })}.`, entities: [], values: { components: sum.byState[st.id].components, lines: sum.byState[st.id].lines } })
        for (const x of d.people) out.push({ kind: "row", text: t("git.knowledge.personAskLines", { name: x.name, components: t("common.count.component", { count: x.components }), lines: n(x.lines), value: x.only ? t("git.knowledge.themKnownOnlyThem", { only: n(x.only) }) : "" }), entities: [x.name], values: { components: x.components, lines: x.lines, only: x.only } })
        for (const r of d.nobody) out.push({ kind: "row", text: t("git.knowledge.noActiveContributorKnows", { component: r.component, lines: n(r.lines) }), entities: [r.component], values: { lines: r.lines }, element: `component:${r.component}` })
        return out
    },

    elements: d => d.rows.map(r => ({ id: `component:${r.component}`, label: r.component })),

    table: d => ({
        columns: [{ id: "component", label: t("git.knowledge.component") }, { id: "lines", label: t("git.knowledge.lines"), numeric: true }, { id: "state", label: t("git.knowledge.knowledge") }, { id: "ask", label: t("git.knowledge.personAsk") }],
        rows: [...d.rows].sort((a, b) => b.lines - a.lines).slice(0, 40).map(r => ({ component: r.component, lines: r.lines, state: r.state, ask: r.ask ?? "" })),
        total: d.rows.length,
    }),

    figure: {
        load: () => import("~/features/git/components/KnowledgeExhibit.vue"),
        props: (d, _p, o) => ({ rows: d.rows, windowWords: t("git.knowledge.lastYear"), highlight: o.highlight }),
        height: (_d, o) => (o.density === "inline" ? 380 : 560),
        fill: true,
        picks: { pick: (element: string) => element },
    },

    open: () => ({ route: "/views/git/authors", label: t("git.knowledge.openAuthors") }),
})
