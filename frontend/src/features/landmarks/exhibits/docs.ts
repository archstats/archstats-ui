// The written intent: decision records, architecture notes, READMEs and
// guides, and which code each is about. "Why is it like this?" has a written
// answer more often than anyone checks, usually in a file nobody opened.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { listOf, needs, underSql } from "../landmarks"

export interface Doc {
    file: string
    kind: string
    title: string
    status: string
    date: string
    words: number
    about: Array<{ component: string; how: string; mentions: number }>
}

export interface DocsData {
    of: string | null
    docs: Doc[]
    kinds: Array<{ kind: string; count: number }>
}

const KIND_ORDER = ["adr", "architecture", "readme", "guide", "contributing", "note", "changelog"]

export const docs = exhibit<DocsData>()({
    kind: "docs", v: 1,
    summary: t("landmarks.docs.summary"),
    params: s.object({
        of: s.string().optional().describe(t("landmarks.docs.paramOf")),
    }, { aliases: { component: "of", about: "of" } }),

    title: (p, d) => ((d?.of ?? p.of) ? t("landmarks.docs.titleOf", { of: d?.of ?? p.of ?? "" }) : t("landmarks.docs.title")),

    async resolve(p, { snap }): Promise<DocsData | Absent> {
        const missing = needs(snap, "docs")
        if (missing) return missing
        let of: string | null = null
        if (p.of) {
            of = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
            if (!of) return { absent: t("landmarks.common.noComponent", { name: p.of }) }
        }
        const links = await snap.query(`SELECT doc, component, how, mentions FROM doc_links${of ? ` WHERE ${underSql("component", of)}` : ""}`)
        const about = new Map<string, Doc["about"]>()
        for (const l of links) {
            const list = about.get(String(l.doc)) ?? []
            list.push({ component: String(l.component), how: String(l.how), mentions: Number(l.mentions) || 0 })
            about.set(String(l.doc), list)
        }
        const rows = await snap.query(`SELECT file, kind, title, status, date, words FROM docs`)
        const all: Doc[] = rows
            .filter(r => !of || about.has(String(r.file)))
            .map(r => ({ file: String(r.file), kind: String(r.kind), title: String(r.title ?? ""), status: String(r.status ?? ""), date: String(r.date ?? ""), words: Number(r.words) || 0, about: (about.get(String(r.file)) ?? []).sort((a, b) => b.mentions - a.mentions) }))
        // The ones most about the subject first: located in it, then most mentions; decisions before guides.
        const weight = (d: Doc) => d.about.reduce((sum, a) => sum + (a.how === "located_in" ? 5 : a.mentions), 0)
        all.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (of ? weight(b) - weight(a) : 0) || a.file.localeCompare(b.file))
        const kinds = KIND_ORDER.map(k => ({ kind: k, count: all.filter(d => d.kind === k).length })).filter(k => k.count)
        return { of, docs: all, kinds }
    },

    facts(d) {
        if (!d.docs.length) return [{ kind: "absence", text: d.of ? t("landmarks.docs.noneAbout", { of: d.of }) : t("landmarks.docs.none"), entities: d.of ? [d.of] : [], values: { docs: 0 } }]
        const out: FactDraft[] = [{
            kind: "total",
            text: t("landmarks.docs.total", { count: d.docs.length, of: d.of ? t("landmarks.docs.about", { of: d.of }) : "", list: d.kinds.map(k => t(`landmarks.docs.kinds.${k.kind}`, { count: k.count })).join(", ") }),
            entities: d.of ? [d.of] : [], values: Object.fromEntries([["docs", d.docs.length], ...d.kinds.map(k => [k.kind, k.count])]),
        }]
        const shown = d.docs.filter(x => x.kind !== "changelog").slice(0, 20)
        for (const x of shown) {
            const meta = [x.status, x.date].filter(Boolean).join(", ")
            const about = x.about.length ? t("landmarks.docs.aboutList", { list: listOf(x.about.map(a => a.component), 3) }) : ""
            out.push({ kind: "row", text: t("landmarks.docs.row", { kind: t(`landmarks.docs.kind.${x.kind}`), title: x.title, meta: meta ? ` (${meta})` : "", file: x.file, about }), entities: [x.title, ...x.about.slice(0, 2).map(a => a.component)], values: { words: x.words }, element: `doc:${x.file}` })
        }
        out.push({ kind: "note", text: t("landmarks.docs.read"), entities: [], values: {} })
        return out
    },

    elements: d => d.docs.map(x => ({ id: `doc:${x.file}`, label: x.title })),

    table: d => ({
        columns: [{ id: "kind", label: t("landmarks.docs.kindCol") }, { id: "title", label: t("landmarks.docs.titleCol") }, { id: "status", label: t("landmarks.docs.status") }, { id: "date", label: t("landmarks.docs.date") }, { id: "about", label: t("landmarks.docs.aboutCol") }, { id: "file", label: t("landmarks.common.where") }],
        rows: d.docs.map(x => ({ kind: t(`landmarks.docs.kind.${x.kind}`), title: x.title, status: x.status, date: x.date, about: x.about.map(a => a.component).slice(0, 4).join(", "), file: x.file })),
        total: d.docs.length,
    }),

    samples: () => [{}],
})
