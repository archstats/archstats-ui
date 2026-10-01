// A verified query from the cookbook, run on the snapshot: languages, roles,
// libraries, rule results, stale files… The tools pick the recipe; the model
// never writes this SQL. Drawn as bars when the recipe names what to chart.

import { bindRecipe, recipe as recipeOf } from "~/features/snapshot/recipes"
import { shortName } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface RecipeData {
    id: string
    question: string
    reading: string
    columns: string[]
    rows: Array<Record<string, unknown>>
    chart: { label: string; value: string } | null
}

const cell = (v: unknown) => (typeof v === "number" ? n(v) : v === null || v === undefined || v === "" ? "–" : String(v))

export const recipeExhibit = exhibit<RecipeData>()({
    kind: "recipe", v: 1,
    summary: t("exhibit-catalog.recipe.verifiedQueryCookbookRun"),
    params: s.object({
        recipe: s.string().describe(t("exhibit-catalog.recipe.recipeSId")),
        args: s.string().optional().describe(t("exhibit-catalog.recipe.recipeSParametersJson")),
    }),

    title: (p, d) => (d?.question ?? recipeOf(p.recipe)?.question ?? p.recipe).replace(/\?$/, ""),

    async resolve(p, { snap }): Promise<RecipeData | Absent> {
        const r = recipeOf(p.recipe)
        if (!r) return { absent: t("exhibit-catalog.recipe.noRecipe", { recipe: p.recipe }) }
        const missing = r.needs.filter(t => !(t in snap.columns))
        if (missing.length) return { absent: t("exhibit-catalog.recipe.snapshotHasNoSo", { value: missing.join(", "), question: r.question }) }
        let args: Record<string, unknown> = {}
        if (p.args) { try { args = JSON.parse(p.args) } catch { return { absent: t("exhibit-catalog.recipe.recipeSParametersNot") } } }
        const rows = (await snap.query(bindRecipe(r, args))).slice(0, 50)
        const columns = rows.length ? Object.keys(rows[0]) : []
        const chart = r.chart && columns.includes(r.chart.label) && columns.includes(r.chart.value) && rows.length > 1 ? r.chart : null
        return { id: r.id, question: r.question, reading: r.reading, columns, rows, chart }
    },

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: `${d.question} ${d.rows.length ? `${n(d.rows.length)} row${d.rows.length === 1 ? "" : "s"}${d.rows.length === 50 ? t("exhibit-catalog.recipe.first50") : ""}. ${d.reading}` : t("exhibit-catalog.recipe.noRowsSnapshotHas")}`, entities: [], values: { rows: d.rows.length } }]
        if (!d.rows.length) out[0].kind = "absence"
        d.rows.slice(0, 12).forEach((r, i) => {
            const first = String(r[d.columns[0]] ?? "")
            const values = Object.fromEntries(d.columns.map(c => [c, num(r[c])]).filter(([, v]) => v !== null)) as Record<string, number>
            out.push({ kind: "row", text: `${i + 1}. ${d.columns.map(c => `${c}: ${cell(r[c])}`).join(" · ")}`, entities: first && !/^\d/.test(first) ? [first] : [], values, element: `row:${first || i}` })
        })
        if (d.rows.length > 12) out.push({ kind: "note", text: t("exhibit-catalog.recipe.moreRowsTable", { value: n(d.rows.length - 12) }), entities: [], values: { more: d.rows.length - 12 } })
        return out
    },

    elements: d => d.rows.map((r, i) => ({ id: `row:${String(r[d.columns[0]] ?? "") || i}`, label: String(r[d.columns[0]] ?? i) })),

    table: d => ({
        columns: d.columns.map(c => ({ id: c, label: c.replace(/_/g, " "), numeric: d.rows.some(r => typeof r[c] === "number") })),
        rows: d.rows, total: d.rows.length, note: d.reading,
    }),

    figure: {
        load: () => import("~/features/exhibits/components/ExBars.vue"),
        when: d => !!d.chart,
        props: (d, _p, o) => ({
            items: d.rows.slice(0, 15).map(r => ({ key: String(r[d.chart!.label]), label: shortName(String(r[d.chart!.label])), value: Number(r[d.chart!.value]) || 0 })),
            unit: d.chart!.value.replace(/_/g, " "), note: "", highlight: o.highlight, density: o.density, ariaLabel: o.title,
        }),
        height: d => 40 + Math.min(15, d.rows.length) * 22,
        picks: { select: (key: string) => `row:${key}` },
    },

    samples: () => [{ recipe: "roles" }, { recipe: "size-by-extension" }, { recipe: "rule-results" }, { recipe: "external-imports" }, { recipe: "no-such-recipe" }],
})
