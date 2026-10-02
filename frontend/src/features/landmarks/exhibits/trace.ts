// The slice of the codebase one use case runs on: from an entry point (a
// route, a consumer, a command) or any unit, what it uses, step by step,
// through interfaces to the implementations bound to them (or, with no
// binding, that implement them), down to the stored data each step reads or
// writes. Static: a call made by reflection
// or by a name in a string is not seen, and the trace says so.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { t } from "~/shared/i18n"
import { at, esc, isProduction, listOf, needs, rollUp, unitName } from "../landmarks"
import { entryLabel, type Entry } from "./entries"

export interface TraceStep {
    id: string
    name: string
    component: string
    depth: number
    from: string | null
    /** How it was reached: used by the unit before it, or bound to the interface before it. */
    how: "start" | "uses" | "implements"
    mechanism: string
}

export interface TraceData {
    start: { label: string; unit: string; entry: Entry | null }
    also: string[]
    steps: TraceStep[]
    data: Array<{ unit: string; target: string; access: string; via: string }>
    depth: number
    cut: boolean
    components: string[]
}

const MAX_UNITS = 60

export const trace = exhibit<TraceData>()({
    kind: "trace", v: 1,
    summary: t("landmarks.trace.summary"),
    params: s.object({
        from: s.string().describe(t("landmarks.trace.paramFrom")),
        depth: s.integer({ min: 1, max: 8 }).default(5).describe(t("landmarks.trace.paramDepth")),
    }, { aliases: { of: "from", entry: "from", route: "from", unit: "from", start: "from" } }),

    title: (p, d) => t("landmarks.trace.title", { from: d?.start.label ?? p.from }),

    async resolve(p, { snap }): Promise<TraceData | Absent> {
        const missing = needs(snap, "units", "page_rank")
        if (missing) return missing
        const asked = p.from.trim()
        const depthLimit = Math.min(8, Math.max(1, p.depth ?? 5))

        // The start: an entry point by its route or handler, else a unit by name.
        let entry: Entry | null = null
        const also: string[] = []
        if (snap.columns.entry_points) {
            const m = asked.match(/^([A-Z]+(?:,[A-Z]+)*)\s+(\S.*)$/)
            const path = m ? m[2] : asked
            const columns = "SELECT kind, method, path, framework, handler, unit, component, file, line FROM entry_points"
            let rows = m
                ? await snap.query(`${columns} WHERE unit <> '' AND ((method = ${esc(m[1])} AND path = ${esc(path)}) OR path = ${esc(path)}) ORDER BY (method = ${esc(m[1])}) DESC, kind, path LIMIT 8`)
                : await snap.query(`${columns} WHERE unit <> '' AND (path = ${esc(asked)} OR handler = ${esc(asked)} OR function = ${esc(asked)}) ORDER BY kind, path LIMIT 8`)
            if (!rows.length) rows = await snap.query(`${columns} WHERE unit <> '' AND (path LIKE ${esc(`%${path}%`)} OR handler LIKE ${esc(`%${asked}%`)}) ORDER BY length(path), path LIMIT 8`)
            if (rows.length) {
                const r = rows[0]
                entry = { kind: String(r.kind), method: String(r.method ?? ""), path: String(r.path ?? ""), framework: String(r.framework ?? ""), handler: String(r.handler ?? ""), unit: String(r.unit), component: String(r.component ?? ""), file: String(r.file ?? ""), line: Number(r.line) || 0 }
                for (const x of rows.slice(1)) also.push(entryLabel({ kind: String(x.kind), method: String(x.method ?? ""), path: String(x.path ?? "") }))
            }
        }
        let startUnit = entry?.unit ?? ""
        if (!startUnit) {
            const short = asked.includes(".") && !asked.includes("/") ? asked.slice(asked.lastIndexOf(".") + 1) : asked
            const rows = await snap.query(`SELECT id FROM units WHERE id = ${esc(asked)} OR name = ${esc(asked)} OR name = ${esc(short)} ORDER BY (id = ${esc(asked)}) DESC, (kind = 'type') DESC, page_rank DESC LIMIT 5`)
            if (!rows.length) return { absent: t("landmarks.trace.noStart", { from: asked }) }
            startUnit = String(rows[0].id)
            for (const x of rows.slice(1)) also.push(String(x.id))
        }

        const units = await snap.query(`SELECT id, owner, name, component, file, markers FROM units`)
        // Calling an interface runs an implementation; calling a class does not run its subclasses.
        const interfaces = new Set(units.filter(u => /supertype:(interface|protocol)\b/.test(String(u.markers ?? ""))).map(u => String(u.id)))
        const owners = new Map<string, string>(units.map(u => [String(u.id), String(u.owner ?? "")]))
        const info = new Map(units.map(u => [String(u.id), { name: String(u.name), component: String(u.component ?? ""), file: String(u.file ?? "") }]))
        const top = rollUp(owners)
        const counted = (id: string) => { const u = info.get(id); return !!u && isProduction(snap, u.file) }

        const out = new Map<string, Set<string>>()
        for (const c of await snap.query(`SELECT "from", "to" FROM unit_connections`)) {
            const a = top(String(c.from)), b = top(String(c.to))
            if (a === b || !counted(a) || !counted(b)) continue
            const set = out.get(a) ?? new Set<string>()
            set.add(b)
            out.set(a, set)
        }
        // An interface leads on to what is bound to it, or failing a binding, what implements it.
        const impls = new Map<string, Map<string, string>>()
        const bind = (iface: string, impl: string, mechanism: string) => {
            const a = top(iface), b = top(impl)
            if (a === b || !counted(b)) return
            const m = impls.get(a) ?? new Map<string, string>()
            if (!m.has(b) || m.get(b) === "implements") m.set(b, mechanism)
            impls.set(a, m)
        }
        if (snap.columns.unit_supertypes) for (const r of await snap.query(`SELECT unit, supertype FROM unit_supertypes WHERE supertype <> ''`)) if (interfaces.has(String(r.supertype))) bind(String(r.supertype), String(r.unit), "implements")
        if (snap.columns.bindings) for (const r of await snap.query(`SELECT interface_unit, implementation_unit, mechanism FROM bindings WHERE interface_unit <> '' AND implementation_unit <> ''`)) bind(String(r.interface_unit), String(r.implementation_unit), String(r.mechanism))

        const start = top(startUnit)
        const steps: TraceStep[] = [{ id: start, name: info.get(start)?.name ?? unitName(start), component: info.get(start)?.component ?? "", depth: 0, from: null, how: "start", mechanism: "" }]
        const seen = new Set([start])
        let cut = false
        for (let i = 0; i < steps.length; i++) {
            const cur = steps[i]
            if (cur.depth >= depthLimit) continue
            const next: Array<[string, TraceStep["how"], string]> = [
                ...[...(impls.get(cur.id) ?? new Map())].map(([id, mech]) => [id, "implements", mech] as [string, TraceStep["how"], string]),
                ...[...(out.get(cur.id) ?? [])].sort().map(id => [id, "uses", ""] as [string, TraceStep["how"], string]),
            ]
            for (const [id, how, mechanism] of next) {
                if (seen.has(id)) continue
                if (steps.length >= MAX_UNITS) { cut = true; break }
                seen.add(id)
                steps.push({ id, name: info.get(id)?.name ?? unitName(id), component: info.get(id)?.component ?? "", depth: cur.depth + (how === "implements" ? 0 : 1), from: cur.id, how, mechanism })
            }
        }

        const data: TraceData["data"] = []
        if (snap.columns.data_access) {
            const ids = new Set(steps.map(x => x.id))
            const seenData = new Set<string>()
            for (const r of await snap.query(`SELECT unit, target, entity, access, via FROM data_access WHERE unit <> ''`)) {
                const u = top(String(r.unit))
                if (!ids.has(u)) continue
                const target = String(r.entity ? unitName(String(r.entity)) : r.target)
                const key = `${u}\u0000${target}\u0000${r.access}`
                if (seenData.has(key)) continue
                seenData.add(key)
                data.push({ unit: u, target, access: String(r.access), via: String(r.via) })
            }
        }
        const components: string[] = []
        for (const x of [...steps].sort((a, b) => a.depth - b.depth)) if (x.component && !components.includes(x.component)) components.push(x.component)
        return {
            start: { label: entry ? entryLabel(entry) : unitName(start), unit: start, entry },
            also, steps, data, cut,
            depth: Math.max(0, ...steps.map(x => x.depth)),
            components,
        }
    },

    facts(d) {
        const name = (id: string) => d.steps.find(x => x.id === id)?.name ?? unitName(id)
        const startName = name(d.start.unit)
        const out: FactDraft[] = [{
            kind: "total",
            text: t("landmarks.trace.total", { from: d.start.label, handler: startName, units: d.steps.length - 1, components: d.components.length, depth: d.depth }),
            entities: [startName, ...d.components.slice(0, 3)], values: { units: d.steps.length - 1, components: d.components.length, depth: d.depth },
        }]
        if (d.start.entry) out.push({ kind: "row", text: t("landmarks.trace.handledBy", { from: d.start.label, handler: d.start.entry.handler || startName, at: at(d.start.entry.file, d.start.entry.line) }), entities: [startName], values: {} })
        if (d.components.length > 1) out.push({ kind: "row", text: t("landmarks.trace.order", { list: d.components.join(" → ") }), entities: d.components, values: { components: d.components.length } })
        for (let depth = 1; depth <= d.depth; depth++) {
            const at = d.steps.filter(x => x.depth === depth && x.how === "uses")
            if (!at.length) continue
            out.push({ kind: "row", text: t("landmarks.trace.step", { depth, list: listOf(at.map(x => `${x.name} (${x.component})`), 6) }), entities: at.slice(0, 6).map(x => x.name), values: { units: at.length } })
        }
        for (const x of d.steps.filter(x => x.how === "implements").slice(0, 6)) {
            out.push({ kind: "row", text: t("landmarks.trace.bound", { iface: name(x.from!), impl: x.name, component: x.component, mechanism: t(`landmarks.mechanism.${x.mechanism}`) }), entities: [name(x.from!), x.name], values: {}, element: `unit:${x.id}` })
        }
        if (d.data.length) {
            const byTarget = new Map<string, { reads: string[]; writes: string[] }>()
            for (const r of d.data) {
                const e = byTarget.get(r.target) ?? { reads: [], writes: [] }
                if (r.access !== "write" && !e.reads.includes(name(r.unit))) e.reads.push(name(r.unit))
                if (r.access !== "read" && !e.writes.includes(name(r.unit))) e.writes.push(name(r.unit))
                byTarget.set(r.target, e)
            }
            out.push({ kind: "total", text: t("landmarks.trace.data", { count: byTarget.size, list: listOf([...byTarget.keys()], 8) }), entities: [...byTarget.keys()].slice(0, 8), values: { stored: byTarget.size } })
            for (const [target, e] of [...byTarget].slice(0, 8)) {
                const parts = [e.reads.length ? t("landmarks.trace.readBy", { list: listOf(e.reads, 3) }) : "", e.writes.length ? t("landmarks.trace.writtenBy", { list: listOf(e.writes, 3) }) : ""].filter(Boolean).join("; ")
                out.push({ kind: "row", text: `${target}: ${parts}.`, entities: [target], values: {} })
            }
        } else out.push({ kind: "absence", text: t("landmarks.trace.noData"), entities: [], values: { stored: 0 } })
        if (d.cut) out.push({ kind: "note", text: t("landmarks.trace.cut", { count: d.steps.length }), entities: [], values: {} })
        if (d.also.length) out.push({ kind: "note", text: t("landmarks.trace.also", { list: listOf(d.also, 4) }), entities: [], values: {} })
        out.push({ kind: "note", text: t("landmarks.trace.static"), entities: [], values: {} })
        return out
    },

    elements: d => d.steps.map(x => ({ id: `unit:${x.id}`, label: x.name })),

    table: d => ({
        columns: [
            { id: "depth", label: t("landmarks.trace.stepCol"), numeric: true }, { id: "name", label: t("landmarks.common.unit") }, { id: "component", label: t("landmarks.common.component") },
            { id: "via", label: t("landmarks.trace.reachedFrom") }, { id: "data", label: t("landmarks.trace.dataCol") },
        ],
        rows: d.steps.map(x => ({
            depth: x.depth, name: x.name, component: x.component,
            via: x.from ? (x.how === "implements" ? t("landmarks.trace.boundTo", { name: d.steps.find(y => y.id === x.from)?.name ?? unitName(x.from) }) : d.steps.find(y => y.id === x.from)?.name ?? unitName(x.from)) : "",
            data: d.data.filter(r => r.unit === x.id).map(r => `${r.target} (${t(`landmarks.access.${r.access}`)})`).join(", "),
        })),
        total: d.steps.length,
    }),

    samples: () => [{ from: "/" }, { from: "nothing-matches-this" }],
})
