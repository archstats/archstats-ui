// The workspace's notes in the app, through the Go store: what a person or
// Ask learned about part of the codebase, read back into every later
// conversation so understanding builds up instead of starting over.

import { List, Save } from "wailsjs/go/app/NotesService"
import type { Notes, WorkspaceNote } from "~/features/snapshot/snapshot"

export function toNote(n: any): WorkspaceNote {
    return {
        id: String(n.id), subjectKind: n.subjectKind || "codebase", subject: String(n.subject ?? ""), text: String(n.text ?? ""),
        author: n.author === "model" ? "model" : "person", headCommit: String(n.headCommit ?? ""), updatedAt: String(n.updatedAt ?? ""),
    }
}

/** Notes for one workspace, stamped with the scan and commit they were written against. */
export function appNotes(workspaceId: string, scanId: string, headCommit: string): Notes {
    return {
        async list() { return ((await List(workspaceId)) ?? []).map(toNote) },
        async save(note) {
            const saved = await Save({ id: note.id ?? "", workspaceId, subjectKind: note.subjectKind, subject: note.subject, text: note.text, author: note.author, scanId: scanId || undefined, headCommit } as any)
            return toNote(saved)
        },
    }
}
