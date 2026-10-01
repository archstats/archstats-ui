// What the engine's declared rules report: each rule, whether it holds, and
// the imports that break it. Only rules the workspace declares are checked;
// with none declared there is nothing to break.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { plural } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface RulesData {
    of: string | null
    rules: Array<{ rule: string; status: string; broken: number }>
    breaks: Array<{ rule: string; from: string; to: string; file: string; line: number | null }>
}

/** "rules__go__internal_must_not_be_imported_from_outside" → "go: internal must not be imported from outside". */
export const ruleName = (id: string) => {
    const parts = String(id).replace(/^rules__/, "").split("__")
    return parts.length > 1 ? `${parts[0]}: ${parts.slice(1).join(" ").replace(/_/g, " ")}` : parts[0].replace(/_/g, " ")
}

export const rules = exhibit<RulesData>()({
    kind: "rules", v: 1,
    summary: t("rules.rules.declaredRulesWhatBreaks"),
    params: s.object({
        of: s.string().optional().describe(t("rules.rules.onlyBreaksInvolvingComponent")),
    }, { aliases: { component: "of" } }),

    title: (p, d) => t("rules.rules.declaredRules", { value: (d?.of ?? p.of) ? ` · ${d?.of ?? p.of}` : "" }),

    async resolve(p, { snap }): Promise<RulesData | Absent> {
        if (!("rules" in snap.columns)) return { absent: t("rules.rules.snapshotHasNoRule") }
        const all = await snap.query<{ rule: string; status: string; from: string; to: string; file: string; line: number }>(`SELECT rule, status, "from", "to", file, line FROM rules`)
        // The engine's own rules are for particular layouts (.NET, Go, Symfony…); those that do not fit this code say so.
        const applying = all.filter(r => String(r.status) !== "not_applicable")
        if (!applying.length) return { absent: all.length ? t("rules.rules.noneRulesEngineChecks", { count: all.length, names: [...new Set(all.map(r => ruleName(r.rule)))].join("; ") }) : t("rules.rules.noRulesEngineChecks") }
        const of = p.of ? candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null : null
        if (p.of && !of) return { absent: t("rules.rules.noComponentMatches", { of: p.of }) }
        const byRule = new Map<string, { status: string; broken: number }>()
        for (const r of applying) {
            const e = byRule.get(r.rule) ?? { status: "holds", broken: 0 }
            if (r.status === "violation") { e.broken++; e.status = "broken" }
            byRule.set(r.rule, e)
        }
        const breaks = applying.filter(r => r.status === "violation" && (!of || r.from === of || r.to === of))
            .slice(0, 40).map(r => ({ rule: ruleName(r.rule), from: String(r.from ?? ""), to: String(r.to ?? ""), file: String(r.file ?? ""), line: r.line ? Number(r.line) : null }))
        return { of, rules: [...byRule].map(([rule, e]) => ({ rule: ruleName(rule), ...e })), breaks }
    },

    facts(d) {
        const broken = d.rules.filter(r => r.broken > 0)
        const out: FactDraft[] = [{ kind: "total", text: t("rules.rules.applyCodebase", { rules: t("common.count.rule", { count: d.rules.length }), value: broken.length ? t("rules.rules.broken", { are: t("common.count.is", { count: broken.length }) }) : t("rules.rules.everyOneHolds") }), entities: [], values: { rules: d.rules.length, broken: broken.length } }]
        for (const r of d.rules) out.push({ kind: "row", text: t("rules.rules.rule", { rule: r.rule, value: r.broken ? t("rules.rules.broken2", { imports: t("common.count.import", { count: r.broken }) }) : "holds" }), entities: [], values: { broken: r.broken }, element: `rule:${r.rule}` })
        for (const b of d.breaks.slice(0, 12)) out.push({ kind: "row", text: t("rules.rules.breaks", { from: b.from, to: b.to, rule: b.rule, value: b.file ? ` (${b.file}${b.line ? `:${b.line}` : ""})` : "" }), entities: [b.from, b.to].filter(Boolean), values: {} })
        return out
    },

    elements: d => d.rules.map(r => ({ id: `rule:${r.rule}`, label: r.rule })),

    table: d => ({
        columns: [{ id: "rule", label: t("rules.rules.rule2") }, { id: "from", label: t("rules.rules.from") }, { id: "to", label: t("rules.rules.to") }, { id: "where", label: t("rules.rules.where") }],
        rows: d.breaks.length ? d.breaks.map(b => ({ rule: b.rule, from: b.from, to: b.to, where: b.file ? `${b.file}${b.line ? `:${b.line}` : ""}` : "" })) : d.rules.map(r => ({ rule: r.rule, from: r.status, to: "", where: "" })),
    }),

    open: () => ({ route: "/views/rules", label: t("rules.rules.openRules") }),
})
