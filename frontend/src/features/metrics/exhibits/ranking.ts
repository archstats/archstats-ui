// A ranking: components or files by one measure, in plain words ("most
// depended on", "least healthy", "churn"), optionally only those in part of
// the code or meeting a condition ("dependents > 5"). The Metrics view's
// numbers, drawn as bars.

import { cycleCountsByComponent } from "~/features/cycles/cycles"
import { METRIC_WORDS, metricName, metricShort, resolveMetric } from "~/features/snapshot/measures"
import { shortName } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural, sq } from "~/features/exhibits/words"
import { metricsPath } from "~/features/metrics/link"

export interface RankingData {
    among: "components" | "files"
    metric: string
    name: string
    definition: string
    ascending: boolean
    of: string
    where: string
    items: Array<{ key: string; label: string; value: number }>
    note: string
}

const LOW = /^(least|lowest|fewest|smallest|worst|unhealthiest|min(imum)?)\b\s*/
const HIGH = /^(most|highest|largest|biggest|best|healthiest|max(imum)?|top)\b\s*/

/** "dependents > 5", "more than 5 dependents", "at most 3 authors" → measure, operator, number. */
export function readCondition(part: string): { measure: string; op: string; value: number } | null {
    let m = /^(.+?)\s*(>=|<=|!=|=|>|<)\s*(-?[\d.]+)$/.exec(part)
    if (m) return { measure: m[1], op: m[2], value: Number(m[3]) }
    m = /^(more than|over|above|at least)\s+(-?[\d.]+)\s+(.+)$/i.exec(part)
    if (m) return { measure: m[3], op: /at least/i.test(m[1]) ? ">=" : ">", value: Number(m[2]) }
    m = /^(fewer than|less than|under|below|at most)\s+(-?[\d.]+)\s+(.+)$/i.exec(part)
    if (m) return { measure: m[3], op: /at most/i.test(m[1]) ? "<=" : "<", value: Number(m[2]) }
    return null
}

/** "least healthy" → health, lowest first; "most depended on" → dependents, highest first. */
export function readMeasure(words: string): { measure: string; ascending: boolean } {
    let w = words.toLowerCase().trim().replace(/\s+/g, " ")
    let ascending: boolean | null = null
    if (LOW.test(w)) { ascending = true; w = w.replace(LOW, "") }
    else if (HIGH.test(w)) { ascending = false; w = w.replace(HIGH, "") }
    w = w.replace(/^(depended on|used)$/, "dependents").replace(/^(healthy|health)$/, "health").replace(/^(changed|changing)$/, "churn").replace(/^(coupled)$/, "dependents").replace(/^(central)$/, "centrality").replace(/^(complex)$/, "complexity").replace(/^(unstable)$/, "instability").replace(/^(tangled)$/, "cycles").replace(/^(tested)$/, "tests")
    // Health reads best worst-first unless asked otherwise: "rank by health" wants the unhealthy ones.
    if (ascending === null) ascending = /^(health|code health)$/.test(w)
    return { measure: w, ascending }
}

export const ranking = exhibit<RankingData>()({
    kind: "ranking", v: 1,
    summary: "Components or files ranked by one measure, drawn as bars.",
    params: s.object({
        measure: s.string().describe(`What to rank by, in plain words, optionally with most/least: ${[...new Set(Object.keys(METRIC_WORDS))].filter(k => !k.includes("__") && !k.includes("_")).slice(0, 22).join(", ")}.`),
        among: s.enum(["components", "files"]).default("components").describe("Rank components (default) or files."),
        of: s.string().optional().describe("Only names containing this (a component, area or folder)."),
        where: s.string().optional().describe("Only those meeting a condition, e.g. \"dependents > 5\" or \"lines >= 1000 and health < 5\"."),
    }, { aliases: { metric: "measure", by: "measure", grain: "among", within: "of", filter: "where" } }),

    title: (p, d) => {
        const r = d ?? { ascending: readMeasure(p.measure).ascending, name: readMeasure(p.measure).measure, among: p.among ?? "components" }
        return `${r.ascending ? "Lowest" : "Highest"} ${r.name.toLowerCase()}${r.among === "files" ? " (files)" : ""}${p.of ? ` in ${p.of}` : ""}${p.where ? ` · ${p.where}` : ""}`
    },

    async resolve(p, { snap }): Promise<RankingData | Absent> {
        const among = p.among === "files" ? "files" : "components"
        const { measure, ascending } = readMeasure(p.measure)
        const m = resolveMetric(snap, measure, among)
        // A name, a path or a role is not a measure: ranked, it would read "Highest name".
        if (m && /(^|__)(name|path|file|component|role|language|kind|type)$/.test(m.id)) return { absent: `"${p.measure}" is not a measure: rank by one, such as ${[...new Set(Object.keys(METRIC_WORDS))].filter(k => !k.includes("_")).slice(0, 8).join(", ")}.` }
        if (!m) return { absent: `"${p.measure}" is not a measure of ${among} here. Measures: ${[...new Set(Object.keys(METRIC_WORDS))].filter(k => !k.includes("_")).slice(0, 24).join(", ")}.` }
        const of = String(p.of ?? "").trim()
        let items: RankingData["items"]
        if (m.id === "cycles") {
            items = [...cycleCountsByComponent(snap.cycles())].filter(([k]) => !of || k.includes(of))
                .map(([key, value]) => ({ key, label: shortName(key), value })).sort((x, y) => (ascending ? x.value - y.value : y.value - x.value)).slice(0, 15)
        } else {
            const conds: string[] = []
            for (const part of String(p.where ?? "").split(/\s+and\s+|,/i).map(x => x.trim()).filter(Boolean)) {
                const c = readCondition(part)
                const fr = c ? resolveMetric(snap, c.measure, among) : null
                if (!c || !fr || fr.id === "cycles") return { absent: `The condition "${part}" did not read: write it as "<measure> <op> <number>", e.g. "dependents > 5".` }
                conds.push(`${fr.id} ${c.op} ${c.value}`)
            }
            const role = among === "files" && (snap.columns.files ?? []).includes("role") ? "coalesce(role, 'production') = 'production'" : among === "components" ? "name != '.'" : ""
            const where = [`${m.id} IS NOT NULL`, m.id === "codesmells__code_health" ? `${m.id} > 0` : "", role, of ? `name LIKE ${sq(`%${of.replace(/[%_]/g, "")}%`)}` : "", ...conds].filter(Boolean).join(" AND ")
            items = (await snap.query(`SELECT name, ${m.id} AS value FROM ${among} WHERE ${where} ORDER BY ${m.id} ${ascending ? "ASC" : "DESC"}${among === "components" && (snap.columns.components ?? []).includes("complexity__lines") && m.id !== "complexity__lines" ? ", complexity__lines DESC" : ""} LIMIT 15`))
                .map((r: any) => ({ key: String(r.name), label: shortName(String(r.name)), value: Number(r.value) || 0 }))
        }
        if (!items.length) return { absent: `No ${among} ${of ? `in "${of}" ` : ""}${p.where ? `meet "${p.where}"` : "have this measure"}.` }
        // Highest-first and all zero says nothing; lowest-first and all zero is the answer (nothing imports these).
        const allZero = !ascending && items.every(x => x.value === 0)
        return {
            among, metric: m.id, name: metricName(snap, m.id), definition: metricShort(snap, m.id), ascending, of, where: String(p.where ?? ""), items,
            note: [m.note ?? "", allZero ? "Every value is 0, so this ranking says nothing; for history the scanned commit may be old." : ""].filter(Boolean).join(" "),
        }
    },

    facts(d) {
        const out: FactDraft[] = [{
            kind: "rank",
            text: `${d.among === "files" ? "Production files" : "Components"} by ${d.name}${d.definition ? ` (${d.definition.replace(/\.$/, "")})` : ""}, ${d.ascending ? "lowest" : "highest"} first${d.of ? `, names containing "${d.of}"` : ""}${d.where ? `, only where ${d.where}` : ""}; ${plural(d.items.length, "shown")}.`,
            entities: [], values: { shown: d.items.length },
        }]
        if (d.note) out.push({ kind: "note", text: d.note, entities: [], values: {} })
        d.items.forEach((x, i) => out.push({ kind: "row", text: `${i + 1}. ${x.key}: ${n(x.value)}.`, entities: [x.key], values: { rank: i + 1, value: x.value }, element: `${d.among === "files" ? "file" : "component"}:${x.key}` }))
        return out
    },

    // A bar is the component or file it ranks: picking it selects that thing, ready to group.
    elements: d => d.items.map(x => ({ id: `${d.among === "files" ? "file" : "component"}:${x.key}`, label: x.key })),

    table: d => ({
        columns: [{ id: "rank", label: "#", numeric: true }, { id: "name", label: d.among === "files" ? "File" : "Component" }, { id: "value", label: d.name, numeric: true }],
        rows: d.items.map((x, i) => ({ rank: i + 1, name: x.key, value: x.value })),
        note: d.definition || undefined,
    }),

    figure: {
        load: () => import("~/features/exhibits/components/ExBars.vue"),
        when: d => d.items.length > 1,
        props: (d, _p, o) => ({ items: d.items, unit: d.name.toLowerCase(), note: d.definition, highlight: o.highlight, density: o.density, ariaLabel: o.title, pickAs: d.among === "files" ? "file" : "component" }),
        height: (d, o) => 40 + Math.min(o.density === "inline" ? 12 : 30, d.items.length) * 22,
        picks: { select: (id: string) => id },
    },

    // Metrics as the ranking was: the same grain, sorted by the same measure, the ranked rows selected.
    open: (p, d) => ({
        route: d && d.metric !== "cycles"
            ? metricsPath({ grain: d.among, view: "table", sort: d.metric, selected: d.items.map(x => x.key) })
            : p.among === "files" ? "/views/metrics?grain=files" : "/views/metrics",
        label: "Open Metrics",
    }),

    samples: () => [{ measure: "most depended on" }, { measure: "least healthy", among: "files" }, { measure: "health", where: "dependents > 2" }, { measure: "cycles" }, { measure: "no such measure" }],
})
