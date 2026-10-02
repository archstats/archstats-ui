// The map: the units the rest of the code leans on most, with their
// signatures and their most used members, as many as fit a budget. It is the
// first thing a model needs and the one thing it cannot build by reading
// files one at a time: which hundred names out of thousands matter.
//
// Ordered by how many other components use a unit, then by how many units
// do, then by page rank. Page rank alone puts a type used by nine units
// above one used from eighty components, because rank flows down chains;
// for finding your way, reach across the codebase is what counts.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { at, needs, underSql, esc } from "../landmarks"

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export interface MapUnit {
    id: string
    name: string
    kind: string
    component: string
    file: string
    line: number
    signature: string
    rank: number
    usedBy: number
    usedByComponents: number
    members: Array<{ name: string; signature: string; usedBy: number }>
}

export interface MapData {
    of: string | null
    units: MapUnit[]
    ranked: number
}

export const map = exhibit<MapData>()({
    kind: "map", v: 1,
    summary: t("landmarks.map.summary"),
    params: s.object({
        of: s.string().optional().describe(t("landmarks.map.paramOf")),
        limit: s.integer({ min: 5, max: 150 }).default(40).describe(t("landmarks.map.paramLimit")),
        kind: s.enum(["all", "types", "functions"]).default("all").describe(t("landmarks.map.paramKind")),
    }, { aliases: { component: "of", within: "of", budget: "limit", top: "limit" } }),

    title: (p, d) => ((d?.of ?? p.of) ? t("landmarks.map.titleOf", { of: d?.of ?? p.of ?? "" }) : t("landmarks.map.title")),

    async resolve(p, { snap }): Promise<MapData | Absent> {
        const missing = needs(snap, "units", "page_rank")
        if (missing) return missing
        let of: string | null = null
        if (p.of) {
            of = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!of) return { absent: t("landmarks.common.noComponent", { name: p.of }) }
        }
        const where = [`page_rank > 0`, of ? underSql("component", of) : "1=1", p.kind === "types" ? `kind = 'type'` : p.kind === "functions" ? `kind = 'function'` : "1=1"].join(" AND ")
        const limit = Math.min(150, Math.max(5, p.limit ?? 40))
        const rows = await snap.query(`SELECT id, name, kind, component, file, line, signature, page_rank, used_by, used_by_components FROM units WHERE ${where} ORDER BY used_by_components DESC, used_by DESC, page_rank DESC, id LIMIT ${limit}`)
        const [{ total }] = await snap.query<{ total: number }>(`SELECT COUNT(*) AS total FROM units WHERE ${where}`)
        const ids = rows.map(r => String(r.id))
        const members = new Map<string, MapUnit["members"]>()
        if (ids.length) {
            for (const m of await snap.query(`SELECT owner, name, signature, used_by FROM units WHERE owner IN (${ids.map(esc).join(", ")}) AND used_by > 0 ORDER BY used_by DESC, name`)) {
                const list = members.get(String(m.owner)) ?? []
                if (list.length < 3) list.push({ name: String(m.name), signature: String(m.signature ?? ""), usedBy: Number(m.used_by) || 0 })
                members.set(String(m.owner), list)
            }
        }
        return {
            of,
            ranked: Number(total) || 0,
            units: rows.map(r => ({
                id: String(r.id), name: String(r.name), kind: String(r.kind), component: String(r.component ?? ""), file: String(r.file ?? ""), line: Number(r.line) || 0,
                signature: String(r.signature ?? ""), rank: Number(r.page_rank) || 0, usedBy: Number(r.used_by) || 0, usedByComponents: Number(r.used_by_components) || 0,
                members: members.get(String(r.id)) ?? [],
            })),
        }
    },

    // A map is read whole: every unit is a fact, up to the budget asked for.
    maxFacts: 151,
    facts(d) {
        const out: FactDraft[] = [{
            kind: "total",
            text: t("landmarks.map.total", { shown: d.units.length, ranked: d.ranked, of: d.of ? t("landmarks.map.inOf", { of: d.of }) : "" }),
            entities: d.of ? [d.of] : [], values: { shown: d.units.length, ranked: d.ranked },
        }]
        if (!d.units.length) out[0].kind = "absence"
        d.units.forEach((u, i) => {
            // Members by name: their signatures are in the table, and three of them would double the line.
            const members = u.members.length ? t("landmarks.map.members", { list: u.members.map(m => m.name).join(", ") }) : ""
            out.push({
                kind: "rank",
                text: t("landmarks.map.row", { i: i + 1, name: u.name, signature: clip(u.signature || u.name, 140), component: u.component, at: at(u.file, u.line), usedBy: u.usedBy, usedByComponents: u.usedByComponents, rank: u.rank.toFixed(1), members }),
                entities: [u.name, u.component], values: { rank: u.rank, used_by: u.usedBy, used_by_components: u.usedByComponents }, element: `unit:${u.id}`,
            })
        })
        return out
    },

    elements: d => d.units.map(u => ({ id: `unit:${u.id}`, label: u.name })),

    table: d => ({
        columns: [
            { id: "name", label: t("landmarks.common.unit") }, { id: "signature", label: t("landmarks.common.signature") }, { id: "component", label: t("landmarks.common.component") },
            { id: "at", label: t("landmarks.common.where") }, { id: "usedBy", label: t("landmarks.map.usedBy"), numeric: true }, { id: "usedByComponents", label: t("landmarks.map.usedByComponents"), numeric: true }, { id: "rank", label: t("landmarks.map.rank"), numeric: true },
        ],
        rows: d.units.map(u => ({ name: u.name, signature: u.signature, component: u.component, at: at(u.file, u.line), usedBy: u.usedBy, usedByComponents: u.usedByComponents, rank: Number(u.rank.toFixed(2)) })),
        total: d.ranked,
        note: t("landmarks.map.note"),
    }),

    note: () => t("landmarks.map.note"),

    open: () => ({ route: "/views/units", label: t("landmarks.common.openUnits") }),

    samples: snap => {
        const top = [...snap.components()].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
        return [{ limit: 10 }, { kind: "types", limit: 5 }, ...(top ? [{ of: String(top.name), limit: 5 }] : [])]
    },
})
