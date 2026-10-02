// What a person or Ask wrote down about part of the codebase in an earlier
// session, read back so understanding builds up. A note says which commit it
// was written against; one written against older code is flagged, since the
// code it describes may have moved on.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import type { WorkspaceNote } from "~/features/snapshot/snapshot"
import { t } from "~/shared/i18n"

export interface NotesData {
    of: string | null
    notes: Array<WorkspaceNote & { older: boolean }>
}

/** A note is about a subject when it names it, or something under it. */
export function about(note: WorkspaceNote, of: string): boolean {
    const a = note.subject.toLowerCase(), b = of.toLowerCase()
    return a === b || a.startsWith(`${b}.`) || a.startsWith(`${b}/`) || a.endsWith(`.${b}`) || a.endsWith(`/${b}`) || note.text.toLowerCase().includes(b)
}

export const notes = exhibit<NotesData>()({
    kind: "notes", v: 1,
    summary: t("landmarks.notes.summary"),
    params: s.object({
        of: s.string().optional().describe(t("landmarks.notes.paramOf")),
    }, { aliases: { subject: "of", component: "of" } }),

    title: (p, d) => ((d?.of ?? p.of) ? t("landmarks.notes.titleOf", { of: d?.of ?? p.of ?? "" }) : t("landmarks.notes.title")),

    async resolve(p, { snap }): Promise<NotesData | Absent> {
        if (!snap.notes) return { absent: t("landmarks.notes.noWorkspace") }
        const commit = String(snap.info.git_head_commit ?? "")
        const all = await snap.notes.list()
        const of = p.of?.trim() || null
        return { of, notes: all.filter(n => !of || about(n, of)).map(n => ({ ...n, older: !!commit && !!n.headCommit && n.headCommit !== commit })) }
    },

    facts(d) {
        if (!d.notes.length) return [{ kind: "absence", text: d.of ? t("landmarks.notes.noneAbout", { of: d.of }) : t("landmarks.notes.none"), entities: d.of ? [d.of] : [], values: { notes: 0 } }]
        const out: FactDraft[] = [{ kind: "total", text: t("landmarks.notes.total", { count: d.notes.length, of: d.of ? t("landmarks.docs.about", { of: d.of }) : "" }), entities: d.of ? [d.of] : [], values: { notes: d.notes.length } }]
        for (const n of d.notes.slice(0, 20)) {
            out.push({
                kind: "row",
                text: t("landmarks.notes.row", { subject: n.subject || t("landmarks.notes.codebase"), text: n.text, author: t(`landmarks.notes.by.${n.author}`), older: n.older ? t("landmarks.notes.older", { commit: n.headCommit.slice(0, 7) }) : "" }),
                entities: n.subject ? [n.subject] : [], values: {}, element: `note:${n.id}`,
            })
        }
        return out
    },

    elements: d => d.notes.map(n => ({ id: `note:${n.id}`, label: n.subject || n.text.slice(0, 40) })),

    table: d => ({
        columns: [{ id: "subject", label: t("landmarks.notes.subject") }, { id: "text", label: t("landmarks.notes.text") }, { id: "author", label: t("landmarks.notes.author") }, { id: "commit", label: t("landmarks.notes.commit") }],
        rows: d.notes.map(n => ({ subject: n.subject || t("landmarks.notes.codebase"), text: n.text, author: t(`landmarks.notes.by.${n.author}`), commit: n.headCommit.slice(0, 7) + (n.older ? " *" : "") })),
        total: d.notes.length,
    }),

    samples: () => [{}],
})
