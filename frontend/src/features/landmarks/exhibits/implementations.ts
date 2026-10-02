// What implements a type and where it is wired. The interface lives in one
// place, the implementations in others, and a container binds them in a
// third, so the import graph shows them as unrelated. And who reaches past
// the interface to an implementation directly, which is what quietly undoes
// the indirection the interface was there for.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { t } from "~/shared/i18n"
import { at, esc, isProduction, listOf, needs, unitName } from "../landmarks"

export interface Impl {
    id: string
    name: string
    component: string
    at: string
    direct: boolean
    /** Units outside the implementation's own component that use it by name. */
    bypassers: Array<{ name: string; component: string }>
}

export interface ImplementationsData {
    type: { id: string; name: string; component: string; at: string; interface: boolean }
    supertypes: string[]
    impls: Impl[]
    wiring: Array<{ implementation: string; mechanism: string; at: string }>
    users: { units: number; components: string[] }
    also: string[]
}

export const implementations = exhibit<ImplementationsData>()({
    kind: "implementations", v: 1,
    summary: t("landmarks.implementations.summary"),
    params: s.object({
        of: s.string().describe(t("landmarks.implementations.paramOf")),
    }, { aliases: { type: "of", interface: "of", name: "of", class: "of" } }),

    title: (p, d) => t("landmarks.implementations.title", { of: d?.type.name ?? p.of }),

    async resolve(p, { snap }): Promise<ImplementationsData | Absent> {
        const missing = needs(snap, "unit_supertypes")
        if (missing) return missing
        const asked = p.of.trim()
        const short = asked.includes(".") ? asked.slice(asked.lastIndexOf(".") + 1) : asked
        const found = await snap.query(`SELECT id, name, component, file, line, markers FROM units WHERE kind = 'type' AND (id = ${esc(asked)} OR name = ${esc(asked)} OR name = ${esc(short)}) ORDER BY (id = ${esc(asked)}) DESC, used_by DESC LIMIT 6`)
        if (!found.length) return { absent: t("landmarks.implementations.noType", { of: asked }) }
        const tp = found[0]
        const id = String(tp.id)
        const type = { id, name: String(tp.name), component: String(tp.component ?? ""), at: at(String(tp.file ?? ""), Number(tp.line) || 0), interface: /supertype:(interface|protocol)\b/.test(String(tp.markers ?? "")) }

        const supers = await snap.query(`SELECT supertype, name FROM unit_supertypes WHERE unit = ${esc(id)}`)
        // Implementations, and theirs, a few levels down.
        const direct = new Set<string>()
        const all = new Set<string>()
        let frontier = [id]
        for (let level = 0; level < 4 && frontier.length; level++) {
            const rows = await snap.query(`SELECT unit FROM unit_supertypes WHERE supertype IN (${frontier.map(esc).join(", ")})`)
            frontier = []
            for (const r of rows) {
                const u = String(r.unit)
                if (all.has(u) || u === id) continue
                all.add(u)
                if (level === 0) direct.add(u)
                frontier.push(u)
            }
        }
        const wiring = snap.columns.bindings
            ? (await snap.query(`SELECT implementation, implementation_unit, mechanism, file, line FROM bindings WHERE interface_unit = ${esc(id)} OR (interface_unit = '' AND interface = ${esc(type.name)})`)).map(r => {
                if (r.implementation_unit) all.add(String(r.implementation_unit))
                return { implementation: r.implementation_unit ? unitName(String(r.implementation_unit)) : String(r.implementation), mechanism: String(r.mechanism), at: at(String(r.file ?? ""), Number(r.line) || 0) }
            })
            : []
        const ids = [...all]
        const info = ids.length ? await snap.query(`SELECT id, name, component, file, line FROM units WHERE id IN (${ids.map(esc).join(", ")})`) : []
        const impls: Impl[] = info.filter(r => isProduction(snap, String(r.file ?? ""))).map(r => ({ id: String(r.id), name: String(r.name), component: String(r.component ?? ""), at: at(String(r.file ?? ""), Number(r.line) || 0), direct: direct.has(String(r.id)), bypassers: [] }))
        if (impls.length) {
            const byId = new Map(impls.map(x => [x.id, x]))
            // A wiring class names the implementation to bind it; that is not bypassing.
            const wiringFiles = new Set(wiring.map(w => w.at.replace(/:\d+$/, "")))
            for (const r of await snap.query(`SELECT "from", "to", from_component, from_file FROM unit_connections WHERE "to" IN (${impls.map(x => esc(x.id)).join(", ")})`)) {
                const impl = byId.get(String(r.to))!
                if (String(r.from_component) === impl.component || !isProduction(snap, String(r.from_file ?? "")) || wiringFiles.has(String(r.from_file)) || all.has(String(r.from))) continue
                if (!impl.bypassers.some(b => b.name === unitName(String(r.from)))) impl.bypassers.push({ name: unitName(String(r.from)), component: String(r.from_component) })
            }
        }
        const usersRows = await snap.query(`SELECT DISTINCT "from", from_component, from_file FROM unit_connections WHERE "to" = ${esc(id)}`)
        const prodUsers = usersRows.filter(r => isProduction(snap, String(r.from_file ?? "")) && !all.has(String(r.from)))
        return {
            type,
            supertypes: supers.map(r => String(r.supertype ? unitName(String(r.supertype)) : r.name)),
            impls: impls.sort((a, b) => Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name)),
            wiring,
            users: { units: prodUsers.length, components: [...new Set(prodUsers.map(r => String(r.from_component)))].sort() },
            also: found.slice(1).map(r => String(r.id)),
        }
    },

    facts(d) {
        const out: FactDraft[] = [{
            kind: d.impls.length ? "total" : "absence",
            text: t("landmarks.implementations.total", { name: d.type.name, kind: d.type.interface ? t("landmarks.implementations.anInterface") : t("landmarks.implementations.aType"), component: d.type.component, count: d.impls.length, list: d.impls.length ? `: ${listOf(d.impls.map(x => `${x.name} (${x.component})`), 5)}` : "" }),
            entities: [d.type.name, ...d.impls.slice(0, 4).map(x => x.name)], values: { implementations: d.impls.length },
        }]
        if (d.supertypes.length) out.push({ kind: "row", text: t("landmarks.implementations.extends", { name: d.type.name, list: listOf(d.supertypes, 4) }), entities: [d.type.name], values: {} })
        for (const w of d.wiring.slice(0, 10)) out.push({ kind: "row", text: t("landmarks.implementations.wired", { impl: w.implementation, name: d.type.name, mechanism: t(`landmarks.mechanism.${w.mechanism}`), at: w.at }), entities: [w.implementation, d.type.name], values: {} })
        if (!d.wiring.length && d.impls.length) out.push({ kind: "absence", text: t("landmarks.implementations.noWiring", { name: d.type.name }), entities: [d.type.name], values: { wiring: 0 } })
        out.push({ kind: "total", text: t("landmarks.implementations.users", { name: d.type.name, units: d.users.units, list: d.users.components.length ? listOf(d.users.components, 5) : "–" }), entities: [d.type.name, ...d.users.components.slice(0, 3)], values: { users: d.users.units, user_components: d.users.components.length } })
        for (const x of d.impls.filter(x => x.bypassers.length).slice(0, 6)) out.push({ kind: "row", text: t("landmarks.implementations.bypass", { impl: x.name, name: d.type.name, count: x.bypassers.length, list: listOf(x.bypassers.map(b => `${b.name} (${b.component})`), 4) }), entities: [x.name, ...x.bypassers.slice(0, 3).map(b => b.name)], values: { bypassers: x.bypassers.length }, element: `unit:${x.id}` })
        if (d.also.length) out.push({ kind: "note", text: t("landmarks.implementations.also", { list: listOf(d.also, 4) }), entities: [], values: {} })
        return out
    },

    elements: d => d.impls.map(x => ({ id: `unit:${x.id}`, label: x.name })),

    table: d => ({
        columns: [{ id: "name", label: t("landmarks.implementations.implementation") }, { id: "component", label: t("landmarks.common.component") }, { id: "how", label: t("landmarks.implementations.how") }, { id: "bypass", label: t("landmarks.implementations.usedDirectly") }, { id: "at", label: t("landmarks.common.where") }],
        rows: d.impls.map(x => ({ name: x.name, component: x.component, how: x.direct ? t("landmarks.implementations.directly") : t("landmarks.implementations.throughSubtype"), bypass: x.bypassers.map(b => b.name).join(", "), at: x.at })),
        total: d.impls.length,
    }),

    samples: () => [{ of: "nothing-matches-this" }],
})
