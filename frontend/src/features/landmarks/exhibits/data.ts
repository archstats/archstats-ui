// What the code stores and who touches it. A table two components both write
// is coupling no import shows, and it is what sinks most extractions: the
// two cannot be split apart without deciding who owns it. Without a subject,
// the stored things shared most widely; with an entity or table, who reads
// and writes it; with a component, what it touches and who else does.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { at, listOf, needs, unitName, within } from "../landmarks"

export interface Stored {
    key: string
    /** The entity's unit, when one declares it. */
    entity: string
    table: string
    framework: string
    declaredAt: string
    readers: string[]
    writers: string[]
    touches: number
}

export interface Touch {
    key: string
    component: string
    unit: string
    function: string
    access: string
    via: string
    file: string
    line: number
}

export interface DataData {
    mode: "overview" | "stored" | "component"
    of: string | null
    stored: Stored[]
    touches: Touch[]
    entities: number
    tablesOnly: number
}

const keyOf = (r: { entity?: unknown; target?: unknown }) => (r.entity ? unitName(String(r.entity)) : String(r.target ?? ""))

export const data = exhibit<DataData>()({
    kind: "data", v: 1,
    summary: t("landmarks.data.summary"),
    params: s.object({
        of: s.string().optional().describe(t("landmarks.data.paramOf")),
    }, { aliases: { entity: "of", table: "of", component: "of", name: "of" } }),

    title: (p, d) => (d?.mode === "stored" ? t("landmarks.data.titleStored", { of: d.of ?? "" }) : d?.mode === "component" ? t("landmarks.data.titleComponent", { of: d.of ?? "" }) : t("landmarks.data.title")),

    async resolve(p, { snap }): Promise<DataData | Absent> {
        const missing = needs(snap, "data_access")
        if (missing) return missing
        const rows = await snap.query(`SELECT unit, function, component, target, entity, access, via, file, line FROM data_access`)
        const entities = await snap.query(`SELECT entity, name, "table", framework, file, line FROM data_entities`)
        const touches: Touch[] = rows.map(r => ({ key: keyOf(r), component: String(r.component ?? ""), unit: String(r.unit ?? ""), function: String(r.function ?? ""), access: String(r.access), via: String(r.via), file: String(r.file ?? ""), line: Number(r.line) || 0 }))
        const declared = new Map<string, { entity: string; table: string; framework: string; at: string }>()
        for (const e of entities) declared.set(e.entity ? unitName(String(e.entity)) : String(e.name), { entity: String(e.entity ?? ""), table: String(e.table ?? ""), framework: String(e.framework ?? ""), at: at(String(e.file ?? ""), Number(e.line) || 0) })

        const stored = new Map<string, Stored>()
        const add = (key: string) => {
            let x = stored.get(key)
            if (!x) {
                const d = declared.get(key)
                x = { key, entity: d?.entity ?? "", table: d?.table ?? "", framework: d?.framework ?? "", declaredAt: d?.at ?? "", readers: [], writers: [], touches: 0 }
                stored.set(key, x)
            }
            return x
        }
        for (const k of declared.keys()) add(k)
        for (const tc of touches) {
            const x = add(tc.key)
            x.touches++
            if (tc.access !== "write" && !x.readers.includes(tc.component)) x.readers.push(tc.component)
            if (tc.access !== "read" && !x.writers.includes(tc.component)) x.writers.push(tc.component)
        }
        const spread = (x: Stored) => new Set([...x.readers, ...x.writers]).size * 2 + x.writers.length * 3
        const all = [...stored.values()].sort((a, b) => spread(b) - spread(a) || b.touches - a.touches || a.key.localeCompare(b.key))
        const counts = { entities: [...declared.values()].length, tablesOnly: all.filter(x => !declared.has(x.key)).length }

        if (!p.of) return { mode: "overview", of: null, stored: all, touches: [], ...counts }
        const asked = p.of.trim()
        const lower = asked.toLowerCase()
        const hit = all.find(x => x.key === asked) ?? all.find(x => x.key.toLowerCase() === lower || x.table.toLowerCase() === lower) ?? all.find(x => x.key.toLowerCase().endsWith(lower))
        if (hit) return { mode: "stored", of: hit.key, stored: [hit], touches: touches.filter(x => x.key === hit.key), ...counts }
        const comp = candidates(snap.components().map(c => String(c.name)), asked)[0]
        if (!comp) return { absent: t("landmarks.data.nothingNamed", { of: asked }) }
        const inside = new Set(within(snap.components().map(c => String(c.name)), comp))
        const mine = touches.filter(x => inside.has(x.component))
        const keys = new Set(mine.map(x => x.key))
        return { mode: "component", of: comp, stored: all.filter(x => keys.has(x.key)), touches: mine, ...counts }
    },

    facts(d) {
        const out: FactDraft[] = []
        const both = (x: Stored) => [x.writers.length ? t("landmarks.data.writtenBy", { count: x.writers.length, list: listOf(x.writers, 4) }) : "", x.readers.length ? t("landmarks.data.readBy", { count: x.readers.length, list: listOf(x.readers, 4) }) : ""].filter(Boolean).join("; ")
        if (d.mode === "overview") {
            const touched = d.stored.filter(x => x.touches)
            out.push({ kind: "total", text: t("landmarks.data.total", { stored: d.stored.length, entities: d.entities, tables: d.tablesOnly }), entities: [], values: { stored: d.stored.length, entities: d.entities, tables_only: d.tablesOnly } })
            const shared = touched.filter(x => new Set([...x.readers, ...x.writers]).size > 1)
            out.push({ kind: shared.length ? "total" : "absence", text: t("landmarks.data.shared", { count: shared.length }), entities: [], values: { shared: shared.length } })
            for (const x of touched.slice(0, 15)) out.push({ kind: "rank", text: `${x.key}${x.table && x.table !== x.key ? ` (${x.table})` : ""}: ${both(x)}.`, entities: [x.key, ...x.writers.slice(0, 2)], values: { writers: x.writers.length, readers: x.readers.length }, element: `stored:${x.key}` })
            return out
        }
        if (d.mode === "stored") {
            const x = d.stored[0]
            out.push({ kind: "total", text: t("landmarks.data.one", { key: x.key, table: x.table ? t("landmarks.data.table", { table: x.table }) : "", declared: x.declaredAt ? t("landmarks.data.declared", { framework: x.framework, at: x.declaredAt }) : t("landmarks.data.undeclared"), both: both(x) || t("landmarks.data.untouched") }), entities: [x.key, ...x.writers, ...x.readers].slice(0, 8), values: { writers: x.writers.length, readers: x.readers.length } })
            for (const tc of d.touches.slice(0, 20)) out.push({ kind: "row", text: t("landmarks.data.touch", { component: tc.component, who: tc.function || unitName(tc.unit), access: t(`landmarks.access.${tc.access}`), via: t(`landmarks.via.${tc.via}`), at: at(tc.file, tc.line) }), entities: [tc.component], values: {}, element: `stored:${x.key}` })
            return out
        }
        out.push({ kind: d.stored.length ? "total" : "absence", text: t("landmarks.data.mine", { of: d.of ?? "", count: d.stored.length }), entities: d.of ? [d.of] : [], values: { stored: d.stored.length } })
        for (const x of d.stored.slice(0, 15)) {
            const mine = d.touches.filter(tc => tc.key === x.key)
            const access = [...new Set(mine.map(tc => t(`landmarks.access.${tc.access}`)))].join(", ")
            const others = [...new Set([...x.readers, ...x.writers])].filter(c => !mine.some(tc => tc.component === c))
            out.push({ kind: "row", text: t("landmarks.data.mineRow", { key: x.key, access, others: others.length ? t("landmarks.data.alsoTouched", { list: listOf(others, 4) }) : t("landmarks.data.onlyHere") }), entities: [x.key, ...others.slice(0, 3)], values: { others: others.length }, element: `stored:${x.key}` })
        }
        return out
    },

    elements: d => d.stored.map(x => ({ id: `stored:${x.key}`, label: x.key })),

    table: d => (d.mode === "stored"
        ? {
            columns: [{ id: "component", label: t("landmarks.common.component") }, { id: "who", label: t("landmarks.common.unit") }, { id: "access", label: t("landmarks.data.access") }, { id: "via", label: t("landmarks.data.via") }, { id: "at", label: t("landmarks.common.where") }],
            rows: d.touches.map(tc => ({ component: tc.component, who: tc.function || unitName(tc.unit), access: t(`landmarks.access.${tc.access}`), via: t(`landmarks.via.${tc.via}`), at: at(tc.file, tc.line) })),
            total: d.touches.length,
        }
        : {
            columns: [{ id: "key", label: t("landmarks.data.stored") }, { id: "table", label: t("landmarks.data.tableCol") }, { id: "writers", label: t("landmarks.data.writers") }, { id: "readers", label: t("landmarks.data.readers") }, { id: "touches", label: t("landmarks.data.touches"), numeric: true }],
            rows: d.stored.slice(0, 200).map(x => ({ key: x.key, table: x.table, writers: x.writers.join(", "), readers: x.readers.join(", "), touches: x.touches })),
            total: d.stored.length,
        }),

    samples: () => [{}, { of: "nothing-matches-this" }],
})
