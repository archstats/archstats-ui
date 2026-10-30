// The ways into the code: HTTP routes, pages, consumed messages and events,
// schedules, commands and programs, each with the unit that handles it.
// Architects think in use cases, and a use case starts at one of these.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { at, esc, needs, underSql, unitName } from "../landmarks"

export const ENTRY_KINDS = ["http", "page", "message", "event", "schedule", "cli", "main", "job"] as const

export interface Entry {
    kind: string
    method: string
    path: string
    framework: string
    handler: string
    unit: string
    component: string
    file: string
    line: number
}

export interface EntriesData {
    of: string | null
    kind: string | null
    find: string | null
    entries: Entry[]
    total: number
    byKind: Array<{ kind: string; count: number; frameworks: string[] }>
}

/** "GET /orders/{id}", "message order-events", "main cmd/server". */
export function entryLabel(e: Pick<Entry, "kind" | "method" | "path">): string {
    if (e.kind === "http") return `${e.method || "ANY"} ${e.path}`
    return `${t(`landmarks.entries.kind.${e.kind}`)} ${e.path}`.trim()
}

/** Who handles it: the function, or the unit when only that is known. */
export const handlerOf = (e: Pick<Entry, "handler" | "unit">) => e.handler || (e.unit ? unitName(e.unit) : "")

export const entries = exhibit<EntriesData>()({
    kind: "entries", v: 1,
    summary: t("landmarks.entries.summary"),
    params: s.object({
        kind: s.enum(["all", ...ENTRY_KINDS]).default("all").describe(t("landmarks.entries.paramKind")),
        of: s.string().optional().describe(t("landmarks.entries.paramOf")),
        find: s.string().optional().describe(t("landmarks.entries.paramFind")),
    }, { aliases: { component: "of", within: "of", text: "find", path: "find", route: "find" } }),

    title: (p, d) => {
        const kind = d?.kind ?? (p.kind && p.kind !== "all" ? p.kind : null)
        const what = kind ? t(`landmarks.entries.plural.${kind}`) : t("landmarks.entries.title")
        return (d?.of ?? p.of) ? t("landmarks.entries.titleOf", { what, of: d?.of ?? p.of ?? "" }) : what
    },

    async resolve(p, { snap }): Promise<EntriesData | Absent> {
        const missing = needs(snap, "entry_points")
        if (missing) return missing
        let of: string | null = null
        if (p.of) {
            of = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!of) return { absent: t("landmarks.common.noComponent", { name: p.of }) }
        }
        const kind = p.kind && p.kind !== "all" ? p.kind : null
        const find = p.find?.trim() || null
        const conds = [
            of ? underSql("component", of) : "1=1",
            kind ? `kind = ${esc(kind)}` : "1=1",
            find ? `(path LIKE ${esc(`%${find}%`)} OR handler LIKE ${esc(`%${find}%`)} OR unit LIKE ${esc(`%${find}%`)})` : "1=1",
        ].join(" AND ")
        const rows = await snap.query(`SELECT kind, method, path, framework, handler, unit, component, file, line FROM entry_points WHERE ${conds} ORDER BY kind, path, method LIMIT 400`)
        const counts = await snap.query(`SELECT kind, framework, COUNT(*) AS n FROM entry_points WHERE ${conds} GROUP BY kind, framework ORDER BY n DESC`)
        const byKind = new Map<string, { kind: string; count: number; frameworks: string[] }>()
        for (const c of counts) {
            const k = byKind.get(String(c.kind)) ?? { kind: String(c.kind), count: 0, frameworks: [] }
            k.count += Number(c.n) || 0
            k.frameworks.push(String(c.framework))
            byKind.set(k.kind, k)
        }
        const order = (k: string) => ENTRY_KINDS.indexOf(k as any)
        return {
            of, kind, find,
            entries: rows.map(r => ({ kind: String(r.kind), method: String(r.method ?? ""), path: String(r.path ?? ""), framework: String(r.framework ?? ""), handler: String(r.handler ?? ""), unit: String(r.unit ?? ""), component: String(r.component ?? ""), file: String(r.file ?? ""), line: Number(r.line) || 0 })),
            total: [...byKind.values()].reduce((sum, k) => sum + k.count, 0),
            byKind: [...byKind.values()].sort((a, b) => order(a.kind) - order(b.kind)),
        }
    },

    facts(d) {
        if (!d.total) return [{ kind: "absence", text: d.find ? t("landmarks.entries.noneMatch", { find: d.find }) : t("landmarks.entries.none"), entities: d.of ? [d.of] : [], values: { entries: 0 } }]
        const only = d.byKind.length === 1 ? d.byKind[0] : null
        const out: FactDraft[] = [{
            kind: "total",
            text: only
                ? t("landmarks.entries.totalOne", { count: only.count, kind: t(`landmarks.entries.plural.${only.kind}`), frameworks: only.frameworks.slice(0, 3).join(", ") })
                : t("landmarks.entries.total", { count: d.total, list: d.byKind.map(k => t("landmarks.entries.kindCount", { count: k.count, kind: t(`landmarks.entries.plural.${k.kind}`), frameworks: k.frameworks.slice(0, 3).join(", ") })).join("; ") }),
            entities: d.of ? [d.of] : [], values: Object.fromEntries([["entries", d.total], ...d.byKind.map(k => [k.kind, k.count])]),
        }]
        // The handlers' components, most entry points first: where the use cases start.
        const comps = new Map<string, number>()
        for (const e of d.entries) comps.set(e.component, (comps.get(e.component) ?? 0) + 1)
        const top = [...comps].filter(([c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 5)
        if (top.length > 1) out.push({ kind: "rank", text: t("landmarks.entries.where", { list: top.map(([c, k]) => `${c} (${k})`).join(", ") }), entities: top.map(([c]) => c), values: Object.fromEntries(top.map(([c, k]) => [c, k])) })
        for (const e of d.entries.slice(0, 20)) {
            out.push({
                kind: "row",
                text: t("landmarks.entries.row", { entry: entryLabel(e), handler: handlerOf(e) || t("landmarks.entries.unknownHandler"), component: e.component || "–", at: at(e.file, e.line), framework: e.framework }),
                entities: [handlerOf(e), e.component].filter(Boolean), values: {}, element: `entry:${e.file}:${e.line}`,
            })
        }
        if (d.total > 20) out.push({ kind: "note", text: t("landmarks.entries.more", { count: d.total - 20 }), entities: [], values: { more: d.total - 20 } })
        return out
    },

    elements: d => d.entries.map(e => ({ id: `entry:${e.file}:${e.line}`, label: entryLabel(e) })),

    table: d => ({
        columns: [
            { id: "entry", label: t("landmarks.entries.entry") }, { id: "handler", label: t("landmarks.entries.handler") }, { id: "component", label: t("landmarks.common.component") },
            { id: "framework", label: t("landmarks.entries.framework") }, { id: "at", label: t("landmarks.common.where") },
        ],
        rows: d.entries.map(e => ({ entry: entryLabel(e), handler: handlerOf(e), component: e.component, framework: e.framework, at: at(e.file, e.line) })),
        total: d.total,
    }),

    samples: () => [{}, { kind: "http" }, { find: "order" }],
})
