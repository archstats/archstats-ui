// The rules a codebase keeps without anyone having declared them, read from
// what it does: between two areas the imports run one way, all of them or
// nearly; stored data is touched from one area; entry points live in one.
// A rule kept by 98% names its exceptions, and those are where the design
// leaks. A rule kept without exception is one worth declaring, so it stays
// kept. The architect decides which are rules and which are accidents.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n } from "~/features/exhibits/words"
import { areasOf } from "~/features/snapshot/areas"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { isProduction, listOf, productionComponents, within } from "../landmarks"

/** Fewer references than this between two areas is too little to call a rule. */
const MIN_TRAFFIC = 10
/** A direction kept by at least this share, with exceptions, is a rule with leaks. */
const KEPT = 0.9

export interface Direction {
    /** Imports run from `upper` to `lower`; `lower` does not import `upper`. */
    upper: string
    lower: string
    references: number
    against: number
    exceptions: Array<{ from: string; to: string; files: string[]; references: number }>
}

export interface Concentration {
    what: "data" | "entries"
    area: string
    share: number
    total: number
    elsewhere: Array<{ area: string; count: number; example: string }>
}

export interface ConventionsData {
    of: string | null
    areas: string[]
    kept: Direction[]
    held: Direction[]
    concentrations: Concentration[]
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`

export const conventions = exhibit<ConventionsData>()({
    kind: "conventions", v: 1,
    summary: t("landmarks.conventions.summary"),
    params: s.object({
        of: s.string().optional().describe(t("landmarks.conventions.paramOf")),
    }, { aliases: { within: "of", area: "of", component: "of" } }),

    title: (p, d) => ((d?.of ?? p.of) ? t("landmarks.conventions.titleOf", { of: d?.of ?? p.of ?? "" }) : t("landmarks.conventions.title")),

    async resolve(p, { snap }): Promise<ConventionsData | Absent> {
        const production = productionComponents(snap)
        let names = snap.components().map(c => String(c.name)).filter(x => x !== "." && production.has(x))
        let of: string | null = null
        if (p.of) {
            of = candidates(names, p.of)[0] ?? null
            if (!of) return { absent: t("landmarks.common.noComponent", { name: p.of }) }
            names = within(names, of)
        }
        const lines = new Map(snap.components().map(c => [String(c.name), Number(c.complexity__lines) || 0]))
        const areas = areasOf(names, x => lines.get(x) ?? 0)
        const inside = new Set(names)
        const areaOf = (x: string) => areas.of.get(x) ?? x
        const areaNames = [...new Set(names.map(areaOf))].sort()
        if (areaNames.length < 2) return { absent: t("landmarks.conventions.oneArea", { of: of ?? "" }) }

        // Import references between areas, and the component pairs and files that make them.
        const refs = new Map<string, number>()
        const pairs = new Map<string, Map<string, { files: Set<string>; references: number }>>()
        for (const c of snap.connections()) {
            if (!inside.has(c.from) || !inside.has(c.to) || (c.file && !isProduction(snap, String(c.file)))) continue
            const a = areaOf(c.from), b = areaOf(c.to)
            if (a === b) continue
            const k = `${a}\u0000${b}`
            const w = Number(c.reference_count) || 1
            refs.set(k, (refs.get(k) ?? 0) + w)
            const m = pairs.get(k) ?? new Map()
            const pk = `${c.from}\u0000${c.to}`
            const e = m.get(pk) ?? { files: new Set<string>(), references: 0 }
            if (c.file) e.files.add(String(c.file))
            e.references += w
            m.set(pk, e)
            pairs.set(k, m)
        }
        const kept: Direction[] = [], held: Direction[] = []
        for (let i = 0; i < areaNames.length; i++) for (let j = i + 1; j < areaNames.length; j++) {
            const a = areaNames[i], b = areaNames[j]
            // The rest-of-the-code bucket is not an area anyone could declare a rule about.
            if (a.startsWith("(") || b.startsWith("(")) continue
            const ab = refs.get(`${a}\u0000${b}`) ?? 0, ba = refs.get(`${b}\u0000${a}`) ?? 0
            if (ab + ba < MIN_TRAFFIC) continue
            const [upper, lower, major, minor] = ab >= ba ? [a, b, ab, ba] : [b, a, ba, ab]
            if (major / (major + minor) < KEPT) continue
            const exceptions = [...(pairs.get(`${lower}\u0000${upper}`) ?? new Map())]
                .map(([pk, e]) => { const [from, to] = pk.split("\u0000"); return { from, to, files: [...e.files].sort().slice(0, 3), references: e.references } })
                .sort((x, y) => y.references - x.references)
            const dir: Direction = { upper, lower, references: major + minor, against: minor, exceptions }
            if (minor) kept.push(dir); else held.push(dir)
        }
        kept.sort((x, y) => y.references - x.references)
        held.sort((x, y) => y.references - x.references)

        // Where stored data is touched from, and where the entry points are.
        const concentrations: Concentration[] = []
        const concentrate = async (what: Concentration["what"], table: string) => {
            if (!snap.columns[table]) return
            const counts = new Map<string, { count: number; example: string }>()
            for (const r of await snap.query(`SELECT component, COUNT(*) AS n FROM ${table} WHERE component <> '' GROUP BY component`)) {
                const comp = String(r.component)
                if (!inside.has(comp)) continue
                const area = areaOf(comp)
                const e = counts.get(area) ?? { count: 0, example: comp }
                e.count += Number(r.n) || 0
                counts.set(area, e)
            }
            const total = [...counts.values()].reduce((sum, e) => sum + e.count, 0)
            const sorted = [...counts].sort((x, y) => y[1].count - x[1].count)
            if (total < MIN_TRAFFIC || !sorted.length || sorted[0][1].count / total < 0.8 || counts.size < 2 && areaNames.length < 3) return
            concentrations.push({ what, area: sorted[0][0], share: sorted[0][1].count / total, total, elsewhere: sorted.slice(1).map(([area, e]) => ({ area, count: e.count, example: e.example })) })
        }
        await concentrate("data", "data_access")
        await concentrate("entries", "entry_points")
        return { of, areas: areaNames, kept, held, concentrations }
    },

    facts(d) {
        const out: FactDraft[] = [{
            kind: "total",
            text: t("landmarks.conventions.total", { areas: d.areas.length, held: d.held.length, kept: d.kept.length }),
            entities: d.of ? [d.of] : [], values: { areas: d.areas.length, held: d.held.length, kept_with_exceptions: d.kept.length },
        }]
        for (const r of d.kept.slice(0, 10)) {
            const ex = r.exceptions.slice(0, 3).map(e => t("landmarks.conventions.exception", { from: e.from, to: e.to, files: e.files[0] ?? "" }))
            out.push({
                kind: "rank",
                text: t("landmarks.conventions.kept", { lower: r.lower, upper: r.upper, share: pct(1 - r.against / r.references), references: n(r.references), count: r.exceptions.length, list: ex.join("; ") }),
                entities: [r.lower, r.upper, ...r.exceptions.slice(0, 2).flatMap(e => [e.from, e.to])], values: { references: r.references, against: r.against, exceptions: r.exceptions.length }, element: `rule:${r.lower}>${r.upper}`,
            })
        }
        if (d.held.length) out.push({ kind: "row", text: t("landmarks.conventions.held", { count: d.held.length, list: listOf(d.held.slice(0, 8).map(r => t("landmarks.conventions.heldPair", { lower: r.lower, upper: r.upper, references: n(r.references) })), 8) }), entities: d.held.slice(0, 4).flatMap(r => [r.lower, r.upper]), values: { held: d.held.length } })
        for (const c of d.concentrations) {
            out.push({
                kind: "row",
                text: t(`landmarks.conventions.${c.what}`, { area: c.area, share: pct(c.share), total: n(c.total), elsewhere: c.elsewhere.length ? t("landmarks.conventions.elsewhere", { list: listOf(c.elsewhere.map(e => t("landmarks.conventions.elsewhereItem", { area: e.area, count: n(e.count), example: e.example })), 3) }) : "" }),
                entities: [c.area, ...c.elsewhere.slice(0, 2).map(e => e.example)], values: { share: Math.round(c.share * 1000) / 10, total: c.total },
            })
        }
        if (!d.kept.length && !d.held.length) out.push({ kind: "absence", text: t("landmarks.conventions.none"), entities: [], values: { rules: 0 } })
        out.push({ kind: "note", text: t("landmarks.conventions.declare"), entities: [], values: {} })
        return out
    },

    elements: d => [...d.kept, ...d.held].map(r => ({ id: `rule:${r.lower}>${r.upper}`, label: `${r.lower} ↛ ${r.upper}` })),

    table: d => ({
        columns: [{ id: "rule", label: t("landmarks.conventions.rule") }, { id: "kept", label: t("landmarks.conventions.keptCol") }, { id: "references", label: t("landmarks.conventions.references"), numeric: true }, { id: "exceptions", label: t("landmarks.conventions.exceptions") }],
        rows: [...d.kept, ...d.held].map(r => ({ rule: t("landmarks.conventions.ruleText", { lower: r.lower, upper: r.upper }), kept: pct(1 - r.against / r.references), references: r.references, exceptions: r.exceptions.slice(0, 4).map(e => `${e.from} → ${e.to}`).join("; ") })),
        total: d.kept.length + d.held.length,
    }),

    open: () => ({ route: "/views/rules", label: t("landmarks.conventions.openRules") }),

    samples: () => [{}],
})
