// What a component really exposes: the units other components use, and by
// whom, against the units used only inside it. The difference between the
// public interface it has and the one it meant to have; where a narrower one
// would break nothing, and what narrowing it would break.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { at, esc, isProduction, listOf, needs, rollUp, underSql, within } from "../landmarks"

export interface Exposed {
    id: string
    name: string
    signature: string
    at: string
    users: number
    components: string[]
    testsOnly: boolean
}

export interface SurfaceData {
    of: string
    units: number
    exposed: Exposed[]
    inside: Array<{ id: string; name: string; framework: boolean }>
}

export const surface = exhibit<SurfaceData>()({
    kind: "surface", v: 1,
    summary: t("landmarks.surface.summary"),
    params: s.object({
        of: s.string().describe(t("landmarks.surface.paramOf")),
    }, { aliases: { component: "of", name: "of" } }),

    title: (p, d) => t("landmarks.surface.title", { of: d?.of ?? p.of }),

    async resolve(p, { snap }): Promise<SurfaceData | Absent> {
        const missing = needs(snap, "units", "page_rank")
        if (missing) return missing
        const names = snap.components().map(c => String(c.name))
        const of = candidates(names, p.of)[0]
        if (!of) return { absent: t("landmarks.common.noComponent", { name: p.of }) }
        const inside = new Set(within(names, of))
        const own = await snap.query(`SELECT id, owner, name, signature, file, line, component FROM units WHERE ${underSql("component", of)}`)
        const owners = new Map<string, string>(own.map(u => [String(u.id), String(u.owner ?? "")]))
        const top = rollUp(owners)
        const tops = new Map(own.filter(u => top(String(u.id)) === String(u.id)).map(u => [String(u.id), u]))
        if (!tops.size) return { absent: t("landmarks.surface.noUnits", { of }) }

        const users = new Map<string, { units: Set<string>; components: Set<string>; production: boolean }>()
        for (const r of await snap.query(`SELECT "from", "to", from_component, from_file FROM unit_connections WHERE ${underSql("to_component", of)}`)) {
            if (inside.has(String(r.from_component))) continue
            const to = top(String(r.to))
            const u = users.get(to) ?? { units: new Set(), components: new Set(), production: false }
            u.units.add(String(r.from))
            u.components.add(String(r.from_component))
            if (isProduction(snap, String(r.from_file ?? ""))) u.production = true
            users.set(to, u)
        }
        // Reached by the framework rather than an import: entry handlers and bound implementations.
        const framework = new Set<string>()
        if (snap.columns.entry_points) for (const r of await snap.query(`SELECT DISTINCT unit FROM entry_points WHERE ${underSql("component", of)} AND unit <> ''`)) framework.add(top(String(r.unit)))
        if (snap.columns.bindings) for (const r of await snap.query(`SELECT DISTINCT implementation_unit FROM bindings WHERE implementation_unit IN (${[...tops.keys()].map(esc).join(", ")})`)) framework.add(top(String(r.implementation_unit)))

        const exposed: Exposed[] = [...users].filter(([id]) => tops.has(id)).map(([id, u]) => {
            const row = tops.get(id)!
            return { id, name: String(row.name), signature: String(row.signature ?? ""), at: at(String(row.file ?? ""), Number(row.line) || 0), users: u.units.size, components: [...u.components].sort(), testsOnly: !u.production }
        }).sort((a, b) => b.components.length - a.components.length || b.users - a.users || a.name.localeCompare(b.name))
        const exposedIds = new Set(exposed.map(x => x.id))
        const insideOnly = [...tops.values()].filter(u => !exposedIds.has(String(u.id)) && isProduction(snap, String(u.file ?? ""))).map(u => ({ id: String(u.id), name: String(u.name), framework: framework.has(String(u.id)) }))
        return { of, units: tops.size, exposed, inside: insideOnly }
    },

    facts(d) {
        const used = d.exposed.filter(x => !x.testsOnly)
        const testsOnly = d.exposed.filter(x => x.testsOnly)
        const byFramework = d.inside.filter(x => x.framework)
        const quiet = d.inside.filter(x => !x.framework)
        const reach = new Set(used.flatMap(x => x.components))
        const out: FactDraft[] = [{
            kind: "total",
            text: t("landmarks.surface.total", { of: d.of, units: d.units, exposed: used.length, components: reach.size, inside: quiet.length, framework: byFramework.length }),
            entities: [d.of], values: { units: d.units, exposed: used.length, used_by_components: reach.size, inside_only: quiet.length, framework: byFramework.length },
        }]
        for (const x of used.slice(0, 15)) out.push({ kind: "rank", text: t("landmarks.surface.row", { name: x.name, signature: x.signature || x.name, users: x.users, count: x.components.length, list: listOf(x.components, 4) }), entities: [x.name, ...x.components.slice(0, 3)], values: { users: x.users, components: x.components.length }, element: `unit:${x.id}` })
        if (testsOnly.length) out.push({ kind: "row", text: t("landmarks.surface.testsOnly", { count: testsOnly.length, list: listOf(testsOnly.map(x => x.name), 5) }), entities: testsOnly.slice(0, 5).map(x => x.name), values: { tests_only: testsOnly.length } })
        if (byFramework.length) out.push({ kind: "row", text: t("landmarks.surface.framework", { count: byFramework.length, list: listOf(byFramework.map(x => x.name), 5) }), entities: byFramework.slice(0, 5).map(x => x.name), values: { framework: byFramework.length } })
        if (quiet.length) out.push({ kind: "row", text: t("landmarks.surface.inside", { count: quiet.length, list: listOf(quiet.map(x => x.name), 6) }), entities: quiet.slice(0, 6).map(x => x.name), values: { inside_only: quiet.length } })
        out.push({ kind: "note", text: t("landmarks.surface.caveat"), entities: [], values: {} })
        return out
    },

    elements: d => d.exposed.map(x => ({ id: `unit:${x.id}`, label: x.name })),

    table: d => ({
        columns: [{ id: "name", label: t("landmarks.common.unit") }, { id: "signature", label: t("landmarks.common.signature") }, { id: "users", label: t("landmarks.surface.users"), numeric: true }, { id: "components", label: t("landmarks.surface.usedFrom") }, { id: "at", label: t("landmarks.common.where") }],
        rows: d.exposed.map(x => ({ name: x.name, signature: x.signature, users: x.users, components: x.testsOnly ? t("landmarks.surface.testsOnlyCell") : x.components.join(", "), at: x.at })),
        total: d.exposed.length,
    }),

    samples: snap => {
        const top = [...snap.components()].sort((a, b) => (Number(b.modularity__coupling__dependents) || 0) - (Number(a.modularity__coupling__dependents) || 0))[0]
        return top ? [{ of: String(top.name) }] : []
    },
})
