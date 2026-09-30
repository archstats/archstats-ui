// Commits per month, for the whole codebase or one component: is it active,
// when did the work happen. Months without commits are left out, as the
// history has none to count.

import { componentPath } from "~/features/navigation/routes"
import { resolveScope } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { daysIn, n, plural, sq } from "~/features/exhibits/words"

export interface ActivityData {
    of: string | null
    months: number
    points: Array<{ label: string; value: number }>
    total: number
}

export const activity = exhibit<ActivityData>()({
    kind: "activity", v: 1,
    summary: "Commits per month, for the whole codebase or one component.",
    params: s.object({
        of: s.string().optional().describe("A component; the whole codebase when left out."),
        since: s.string().optional().describe("How far back, in words: \"6 months\", \"2 years\". Default 18 months."),
    }, { aliases: { component: "of" } }),

    title: (p, d) => `Commits per month${(d?.of ?? p.of) ? ` touching ${d?.of ?? p.of}` : ""}`,

    async resolve(p, { snap }): Promise<ActivityData | Absent> {
        if (!("git_commit_info" in snap.columns) && !("git_commits" in snap.columns)) return { absent: "This snapshot has no git history." }
        const months = Math.max(3, Math.min(60, Math.round((daysIn(p.since) ?? 548) / 30.4)))
        let of: string | null = null
        let sql: string
        if (p.of) {
            const scope = resolveScope(snap.components().map(c => String(c.name)), p.of)
            if (!scope) return { absent: `No component or area matches "${p.of}".` }
            of = scope.kind === "area" ? `${scope.name} (${scope.members.length} components)` : scope.name
            const inScope = scope.kind === "area" ? `component IN (${scope.members.map(sq).join(", ")})` : `component = ${sq(scope.name)}`
            sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commits WHERE ${inScope} GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
        } else {
            sql = `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commit_info GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}`
        }
        const rows = (await snap.query<{ month: string; commits: number }>(sql)).reverse()
        if (!rows.length) return { absent: `No commits recorded${of ? ` for ${of}` : ""}.` }
        const points = rows.map(r => ({ label: String(r.month), value: Number(r.commits) }))
        return { of, months, points, total: points.reduce((sum, x) => sum + x.value, 0) }
    },

    facts(d) {
        const peak = [...d.points].sort((a, b) => b.value - a.value)[0]
        const recent = d.points.slice(-3)
        const out: FactDraft[] = [
            { kind: "total", text: `${plural(d.total, "commit")}${d.of ? ` touched ${d.of}` : ""} in the months with commits from ${d.points[0].label} to ${d.points[d.points.length - 1].label} (${plural(d.points.length, "month")} with commits).`, entities: d.of ? [d.of] : [], values: { commits: d.total, months: d.points.length } },
            { kind: "rank", text: `The busiest month was ${peak.label}, with ${plural(peak.value, "commit")}.`, entities: [], values: { commits: peak.value }, element: `period:${peak.label}` },
            { kind: "row", text: `The last ${plural(recent.length, "month")} with commits: ${recent.map(x => `${x.label} ${n(x.value)}`).join(", ")}.`, entities: [], values: Object.fromEntries(recent.map(x => [x.label, x.value])) },
        ]
        for (const x of d.points.slice(-18)) out.push({ kind: "row", text: `${x.label}: ${plural(x.value, "commit")}.`, entities: [], values: { commits: x.value }, element: `period:${x.label}` })
        return out
    },

    elements: d => d.points.map(x => ({ id: `period:${x.label}`, label: x.label })),

    table: d => ({ columns: [{ id: "month", label: "Month" }, { id: "commits", label: "Commits", numeric: true }], rows: d.points.map(x => ({ month: x.label, commits: x.value })), note: "Months without commits are left out." }),

    figure: {
        load: () => import("~/features/exhibits/components/ExTimeline.vue"),
        when: d => d.points.length > 1,
        props: (d, _p, o) => ({ points: d.points, unit: "commits", note: "months without commits left out", highlight: o.highlight, ariaLabel: o.title }),
        height: () => 170,
        picks: { select: (label: string) => `period:${label}` },
    },

    open: (p, d) => ({ route: d?.of && !d.of.includes(" (") ? componentPath(d.of, "history") : "/views/git/activity", label: d?.of ? "Open history" : "Open Activity" }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.git__commits__total) || 0) - (Number(a.git__commits__total) || 0))[0]
        return [{ since: "6 months" }, ...(big ? [{ of: String(big.name) }] : [])]
    },
})
