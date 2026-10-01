// Commits per month, for the whole codebase or one component: is it active,
// when did the work happen. Months without commits are left out, as the
// history has none to count.

import { componentPath } from "~/features/navigation/routes"
import { resolveScope } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { daysIn, n, plural, sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface ActivityData {
    of: string | null
    months: number
    points: Array<{ label: string; value: number }>
    total: number
}

export const activity = exhibit<ActivityData>()({
    kind: "activity", v: 1,
    summary: t("git.activity.commitsPerMonthWhole"),
    params: s.object({
        of: s.string().optional().describe(t("git.activity.componentWholeCodebaseWhen")),
        since: s.string().optional().describe(t("git.activity.howFarBackWords")),
    }, { aliases: { component: "of" } }),

    title: (p, d) => t("git.activity.commitsPerMonth", { value: (d?.of ?? p.of) ? t("git.activity.touching", { value: d?.of ?? p.of }) : "" }),

    async resolve(p, { snap }): Promise<ActivityData | Absent> {
        if (!("git_commit_info" in snap.columns) && !("git_commits" in snap.columns)) return { absent: t("git.activity.snapshotHasNoGit") }
        const months = Math.max(3, Math.min(60, Math.round((daysIn(p.since) ?? 548) / 30.4)))
        let of: string | null = null
        let sql: string
        if (p.of) {
            const scope = resolveScope(snap.components().map(c => String(c.name)), p.of)
            if (!scope) return { absent: t("git.activity.noComponentAreaMatches", { of: p.of }) }
            of = scope.kind === "area" ? `${scope.name} (${scope.members.length} components)` : scope.name
            const inScope = scope.kind === "area" ? `component IN (${scope.members.map(sq).join(", ")})` : `component = ${sq(scope.name)}`
            sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commits WHERE ${inScope} GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
        } else {
            sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commit_info GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
        }
        const rows = (await snap.query<{ month: string; commits: number }>(sql)).reverse()
        if (!rows.length) return { absent: t("git.activity.noCommitsRecorded", { value: of ? t("git.activity.for", { of }) : "" }) }
        const points = rows.map(r => ({ label: String(r.month), value: Number(r.commits) }))
        return { of, months, points, total: points.reduce((sum, x) => sum + x.value, 0) }
    },

    facts(d) {
        const peak = [...d.points].sort((a, b) => b.value - a.value)[0]
        const recent = d.points.slice(-3)
        const out: FactDraft[] = [
            { kind: "total", text: t("git.activity.monthsCommitsCommits", { commits: t("common.count.commit", { count: d.total }), value: d.of ? t("git.activity.touched", { of: d.of }) : "", label: d.points[0].label, pointsLabel: d.points[d.points.length - 1].label, months: t("common.count.month", { count: d.points.length }) }), entities: d.of ? [d.of] : [], values: { commits: d.total, months: d.points.length } },
            { kind: "rank", text: t("git.activity.busiestMonthWas", { peakLabel: peak.label, commits: t("common.count.commit", { count: peak.value }) }), entities: [], values: { commits: peak.value }, element: `period:${peak.label}` },
            { kind: "row", text: t("git.activity.lastCommits", { months: t("common.count.month", { count: recent.length }), value: recent.map(x => `${x.label} ${n(x.value)}`).join(", ") }), entities: [], values: Object.fromEntries(recent.map(x => [x.label, x.value])) },
        ]
        for (const x of d.points.slice(-18)) out.push({ kind: "row", text: `${x.label}: ${t("common.count.commit", { count: x.value })}.`, entities: [], values: { commits: x.value }, element: `period:${x.label}` })
        return out
    },

    elements: d => d.points.map(x => ({ id: `period:${x.label}`, label: x.label })),

    table: d => ({ columns: [{ id: "month", label: t("git.activity.month") }, { id: "commits", label: t("git.activity.commits"), numeric: true }], rows: d.points.map(x => ({ month: x.label, commits: x.value })), note: t("git.activity.monthsWithoutCommitsLeft") }),

    figure: {
        load: () => import("~/features/exhibits/components/ExTimeline.vue"),
        when: d => d.points.length > 1,
        props: (d, _p, o) => ({ points: d.points, unit: "commits", note: t("git.activity.monthsWithoutCommitsLeft2"), highlight: o.highlight, ariaLabel: o.title }),
        height: () => 170,
        picks: { select: (label: string) => `period:${label}` },
    },

    open: (p, d) => ({ route: d?.of && !d.of.includes(" (") ? componentPath(d.of, "history") : "/views/git/activity", label: d?.of ? t("git.activity.openHistory") : t("git.activity.openActivity") }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.git__commits__total) || 0) - (Number(a.git__commits__total) || 0))[0]
        return [{ since: "6 months" }, ...(big ? [{ of: String(big.name) }] : [])]
    },
})
