// Who knows a part of the code: its authors by share of its commits, and how
// concentrated that is (how many people made half the commits). The whole
// codebase when no part is named. Names follow the workspace's
// pseudonymisation.

import { componentPath } from "~/features/navigation/routes"
import { resolveScope } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { daysIn, plural, sq } from "~/features/exhibits/words"
import { IN_SNAPSHOT, NOT_BOT_SQL } from "~/features/git/authors"
import { t } from "~/shared/i18n"

export interface AuthorsData {
    of: string | null
    since: number | null
    total: number
    half: number
    authors: Array<{ name: string; commits: number; share: number; last: string; spellings?: number }>
}

export const authors = exhibit<AuthorsData>()({
    kind: "authors", v: 1,
    summary: t("git.exhibitsAuthors.authorsComponentWholeCodebase"),
    params: s.object({
        of: s.string().optional().describe(t("git.exhibitsAuthors.componentWholeCodebaseWhen")),
        since: s.string().optional().describe(t("git.exhibitsAuthors.onlyCommitsRecentPeriod")),
    }, { aliases: { component: "of" } }),

    title: (p, d) => t("git.exhibitsAuthors.who", { value: d?.since || p.since ? t("git.exhibitsAuthors.hasWorked") : t("git.exhibitsAuthors.knows"), value2: d?.of ?? p.of ?? t("git.exhibitsAuthors.code") }),

    async resolve(p, { snap }): Promise<AuthorsData | Absent> {
        if (!("git_commits" in snap.columns)) return { absent: t("git.exhibitsAuthors.snapshotHasNoGit") }
        let of: string | null = null
        let inScope = ""
        if (p.of) {
            const scope = resolveScope(snap.components().map(c => String(c.name)), p.of)
            if (!scope) return { absent: t("git.exhibitsAuthors.noComponentAreaMatches", { of: p.of }) }
            of = scope.kind === "area" ? `${scope.name} (${scope.members.length} components)` : scope.name
            inScope = scope.kind === "area" ? `component IN (${scope.members.map(sq).join(", ")})` : `component = ${sq(scope.name)}`
        }
        const days = daysIn(p.since)
        const last = days ? (await snap.query<{ t: string }>("SELECT max(commit_time) AS t FROM git_commits"))[0]?.t : null
        // Counted as the Authors view counts: commits to files still in the snapshot, bots left out.
        const where = [IN_SNAPSHOT, NOT_BOT_SQL, inScope, days && last ? `julianday(commit_time) >= julianday(${sq(last)}) - ${days}` : ""].filter(Boolean)
        const w = where.length ? `WHERE ${where.join(" AND ")}` : ""
        const raw = await snap.query<{ author: string; commits: number; last: string }>(`SELECT author_name AS author, count(DISTINCT commit_hash) AS commits, max(commit_time) AS last FROM git_commits ${w} GROUP BY author_name`)
        // One person under several spellings ("Jeff Fischer", "jefffischer") is one author: the workspace's
        // aliases first, then names that differ only in case, spaces and punctuation. Commits can then only
        // be summed per spelling, so a commit made under two spellings counts twice; that is rare.
        const aliases = snap.aliases?.() ?? {}
        const keyOf = (name: string) => (aliases[name] ?? name).toLowerCase().replace(/[^a-z0-9]/g, "")
        const merged = new Map<string, { names: Map<string, number>; commits: number; last: string }>()
        for (const r of raw) {
            const k = keyOf(String(r.author))
            const m = merged.get(k) ?? { names: new Map(), commits: 0, last: "" }
            m.names.set(String(aliases[r.author] ?? r.author), (m.names.get(String(aliases[r.author] ?? r.author)) ?? 0) + Number(r.commits))
            m.commits += Number(r.commits)
            if (String(r.last) > m.last) m.last = String(r.last)
            merged.set(k, m)
        }
        const rows = [...merged.values()].sort((a, b) => b.commits - a.commits).slice(0, 15)
            .map(m => ({ author: [...m.names].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0], commits: m.commits, last: m.last, spellings: m.names.size }))
        if (!rows.length) return { absent: t("git.exhibitsAuthors.noCommitsRecorded", { value: of ? t("git.exhibitsAuthors.for", { of }) : "", value2: days ? t("git.exhibitsAuthors.period") : "" }) }
        const total = Number((await snap.query<{ n: number }>(`SELECT count(DISTINCT commit_hash) AS n FROM git_commits ${w}`))[0]?.n) || rows.reduce((sum, r) => sum + Number(r.commits), 0)
        let acc = 0, half = 0
        for (const r of rows) { if (acc >= total / 2) break; acc += Number(r.commits); half++ }
        return {
            of, since: days, total, half,
            authors: rows.map(r => ({ name: snap.author(String(r.author)), commits: Number(r.commits), share: Math.round((100 * Number(r.commits)) / Math.max(1, total)), last: String(r.last).slice(0, 10), spellings: r.spellings })),
        }
    },

    facts(d) {
        const out: FactDraft[] = [
            { kind: "total", text: t("git.exhibitsAuthors.touchMadeHalfThem", { commits: t("common.count.commit", { count: d.total }), value: d.of ?? t("git.exhibitsAuthors.code"), value2: d.since ? t("git.exhibitsAuthors.lastHistory", { days: t("common.count.day", { count: d.since }) }) : "", authors: t("common.count.author", { count: d.half }) }), entities: d.of ? [d.of] : [], values: { commits: d.total, half: d.half } },
        ]
        d.authors.forEach((a, i) => out.push({ kind: "row", text: t("git.exhibitsAuthors.last", { value: i + 1, name: a.name, commits: t("common.count.commit", { count: a.commits }), share: a.share, last: a.last, value2: (a.spellings ?? 1) > 1 ? t("git.exhibitsAuthors.underSpellingsName", { spellings: a.spellings }) : "" }), entities: [a.name], values: { rank: i + 1, commits: a.commits, share: a.share }, element: `row:${a.name}` }))
        return out
    },

    elements: d => d.authors.map(a => ({ id: `row:${a.name}`, label: a.name })),

    table: d => ({
        columns: [{ id: "name", label: t("git.exhibitsAuthors.author") }, { id: "commits", label: t("git.exhibitsAuthors.commits"), numeric: true }, { id: "share", label: t("git.exhibitsAuthors.commits2"), numeric: true }, { id: "last", label: t("git.exhibitsAuthors.lastCommit") }],
        rows: d.authors.map(a => ({ name: a.name, commits: a.commits, share: a.share, last: a.last })),
    }),

    figure: {
        load: () => import("~/features/exhibits/components/ExBars.vue"),
        when: d => d.authors.length > 1,
        props: (d, _p, o) => ({ items: d.authors.map(a => ({ key: a.name, label: a.name, value: a.commits })), unit: "commits", note: t("git.exhibitsAuthors.madeHalf", { authors: t("common.count.author", { count: d.half }), commits: t("common.count.commit", { count: d.total }) }), highlight: o.highlight, density: o.density, ariaLabel: o.title }),
        height: d => 40 + Math.min(12, d.authors.length) * 22,
        picks: { select: (key: string) => `row:${key}` },
    },

    open: (p, d) => ({ route: d?.of && !d.of.includes(" (") ? componentPath(d.of, "history") : "/views/git/authors", label: d?.of ? t("git.exhibitsAuthors.openHistory") : t("git.exhibitsAuthors.openAuthors") }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.git__commits__total) || 0) - (Number(a.git__commits__total) || 0))[0]
        return [{ since: "a year" }, ...(big ? [{ of: String(big.name) }] : [])]
    },
})
