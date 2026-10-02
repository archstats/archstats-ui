// What is unusual here, against this codebase's own norms rather than a
// textbook's: a component many times the size of its siblings, an import
// against the grain its area otherwise keeps, two components that change
// together but never import each other, young code already leaned on from
// all sides, a unit half the system uses, stored data written from many
// places. An architect cannot ask about what they do not know is there;
// this is how it surfaces. Each one names its evidence.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, sq } from "~/features/exhibits/words"
import { areasOf } from "~/features/snapshot/areas"
import { t } from "~/shared/i18n"
import { listOf, productionComponents, unitName } from "../landmarks"
import { conventions, type ConventionsData } from "./conventions"
import { data, type DataData } from "./data"

export interface Surprise {
    kind: "size" | "grain" | "hidden" | "young" | "hub" | "shared"
    /** Higher is more surprising; comparable within a kind, roughly across kinds. */
    score: number
    text: string
    entities: string[]
}

export interface SurprisesData { items: Surprise[]; looked: string[] }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

export const surprises = exhibit<SurprisesData>()({
    kind: "surprises", v: 1,
    summary: t("landmarks.surprises.summary"),
    params: s.object({
        limit: s.integer({ min: 3, max: 20 }).default(8).describe(t("landmarks.surprises.paramLimit")),
    }),

    title: () => t("landmarks.surprises.title"),

    async resolve(p, ctx): Promise<SurprisesData | Absent> {
        const { snap } = ctx
        const items: Surprise[] = []
        const looked: string[] = []
        const production = productionComponents(snap)
        const comps = snap.components().filter(c => c.name !== "." && production.has(String(c.name)))
        const lines = new Map(comps.map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        const names = comps.map(c => String(c.name))
        const areas = areasOf(names, x => lines.get(x) ?? 0)

        // Size against siblings in the same area.
        looked.push("size")
        const byArea = new Map<string, string[]>()
        for (const x of names) { const a = areas.of.get(x) ?? x; (byArea.get(a) ?? byArea.set(a, []).get(a)!).push(x) }
        for (const [area, members] of byArea) {
            if (members.length < 4) continue
            const m = median(members.map(x => lines.get(x) ?? 0))
            for (const x of members) {
                const l = lines.get(x) ?? 0
                if (m > 0 && l >= 2000 && l >= 5 * m) items.push({ kind: "size", score: Math.log2(l / m), text: t("landmarks.surprises.size", { name: x, lines: n(l), times: Math.round(l / m), area, siblings: members.length - 1 }), entities: [x, area] })
            }
        }

        // Imports against a direction the area otherwise keeps.
        looked.push("grain")
        const conv = await conventions.resolve({}, ctx) as ConventionsData | Absent
        if (!("absent" in conv)) {
            for (const r of conv.kept.filter(r => r.against / r.references <= 0.05).slice(0, 4)) {
                const e = r.exceptions[0]
                if (e) items.push({ kind: "grain", score: 3 + Math.log10(r.references), text: t("landmarks.surprises.grain", { from: e.from, to: e.to, lower: r.lower, upper: r.upper, references: n(r.references), file: e.files[0] ?? "" }), entities: [e.from, e.to] })
            }
        }

        // Change together without importing each other.
        if (snap.columns.component_matrix) {
            looked.push("hidden")
            const rows = await snap.query(`SELECT "from", "to", git_co_changes FROM component_matrix WHERE path_distance = -1 AND git_co_changes >= 8 ORDER BY git_co_changes DESC LIMIT 40`)
            // The matrix holds each pair once, with the distance one way; the other way is in the reach table.
            const back = new Set<string>()
            if (rows.length && snap.columns.component_connections_indirect) {
                const asked = new Set(rows.map(r => `${r.to}\u0000${r.from}`))
                const tos = [...new Set(rows.map(r => String(r.from)))].map(sq).join(", ")
                for (const r of await snap.query(`SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "to" IN (${tos})`)) if (asked.has(`${r.from}\u0000${r.to}`)) back.add(`${r.to}\u0000${r.from}`)
            }
            for (const r of rows.filter(r => production.has(String(r.from)) && production.has(String(r.to)) && !back.has(`${r.from}\u0000${r.to}`) && (areas.of.get(String(r.from)) ?? r.from) !== (areas.of.get(String(r.to)) ?? r.to)).slice(0, 4)) {
                items.push({ kind: "hidden", score: 2 + Math.log2(Number(r.git_co_changes)), text: t("landmarks.surprises.hidden", { a: String(r.from), b: String(r.to), commits: n(Number(r.git_co_changes)) }), entities: [String(r.from), String(r.to)] })
            }
        }

        // Young but already leaned on.
        if (snap.columns.git_commits) {
            looked.push("young")
            const head = Date.parse(snap.info.git_head_time || snap.info.git_based_on || "") || 0
            if (head) {
                const born = await snap.query(`SELECT component, MIN(commit_time) AS first FROM git_commits WHERE component <> '' GROUP BY component`)
                for (const r of born) {
                    if (!production.has(String(r.component))) continue
                    const age = (head - Date.parse(String(r.first))) / 86_400_000
                    const c = comps.find(x => x.name === r.component)
                    const dependents = Number(c?.modularity__coupling__dependents) || 0
                    if (age >= 0 && age <= 180 && dependents >= 5) items.push({ kind: "young", score: 2 + Math.log2(dependents) - age / 180, text: t("landmarks.surprises.young", { name: String(r.component), days: Math.round(age), dependents }), entities: [String(r.component)] })
                }
            }
        }

        // A unit half the system uses.
        if (snap.columns.units?.includes("used_by_components")) {
            looked.push("hub")
            const floor = Math.max(5, Math.ceil(names.length * 0.25))
            for (const r of await snap.query(`SELECT id, name, component, used_by, used_by_components FROM units WHERE used_by_components >= ${floor} ORDER BY used_by_components DESC LIMIT 3`)) {
                items.push({ kind: "hub", score: 2 + 4 * Number(r.used_by_components) / names.length, text: t("landmarks.surprises.hub", { name: String(r.name), component: String(r.component), count: Number(r.used_by_components), of: names.length, users: n(Number(r.used_by)) }), entities: [String(r.name), String(r.component)] })
            }
        }

        // Stored data written from many places.
        if (snap.columns.data_access) {
            looked.push("shared")
            const d = await data.resolve({}, ctx) as DataData | Absent
            if (!("absent" in d)) for (const x of d.stored.filter(x => x.writers.length >= 3).slice(0, 3)) {
                items.push({ kind: "shared", score: 2 + x.writers.length / 2, text: t("landmarks.surprises.shared", { name: x.key, count: x.writers.length, list: listOf(x.writers, 4) }), entities: [x.key, ...x.writers.slice(0, 2)] })
            }
        }

        // The most surprising of each kind first, then the rest by score, so one
        // kind cannot crowd out the others.
        const limit = p.limit ?? 8
        const firsts = new Map<string, Surprise>()
        for (const x of [...items].sort((a, b) => b.score - a.score)) if (!firsts.has(x.kind)) firsts.set(x.kind, x)
        const rest = items.filter(x => ![...firsts.values()].includes(x)).sort((a, b) => b.score - a.score)
        return { items: [...[...firsts.values()].sort((a, b) => b.score - a.score), ...rest].slice(0, limit), looked }
    },

    facts(d) {
        if (!d.items.length) return [{ kind: "absence", text: t("landmarks.surprises.none", { list: d.looked.map(k => t(`landmarks.surprises.kinds.${k}`)).join(", ") }), entities: [], values: { surprises: 0 } }]
        return [
            { kind: "total", text: t("landmarks.surprises.total", { count: d.items.length, list: d.looked.map(k => t(`landmarks.surprises.kinds.${k}`)).join(", ") }), entities: [], values: { surprises: d.items.length } },
            ...d.items.map((x, i): FactDraft => ({ kind: "rank", text: `${i + 1}. ${x.text}`, entities: x.entities.map(e => (e.includes("#") ? unitName(e) : e)), values: { score: Math.round(x.score * 10) / 10 }, element: `surprise:${i}` })),
        ]
    },

    elements: d => d.items.map((x, i) => ({ id: `surprise:${i}`, label: x.entities[0] ?? x.kind })),

    table: d => ({
        columns: [{ id: "kind", label: t("landmarks.surprises.kind") }, { id: "text", label: t("landmarks.surprises.what") }],
        rows: d.items.map(x => ({ kind: t(`landmarks.surprises.kinds.${x.kind}`), text: x.text })),
        total: d.items.length,
    }),

    samples: () => [{}],
})
