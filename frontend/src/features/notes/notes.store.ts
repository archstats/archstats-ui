// The workspace's notes, for the Evidence board: what a person or Ask wrote
// down about part of the codebase, to read, add and remove.

import { defineStore } from "pinia"
import { Delete, List, Save } from "wailsjs/go/app/NotesService"
import type { WorkspaceNote } from "~/features/snapshot/snapshot"
import { toNote } from "./appNotes"

export const useNotesStore = defineStore("notes", {
    state: () => ({ workspaceId: "", notes: [] as WorkspaceNote[], loading: false }),
    actions: {
        async load(workspaceId: string) {
            this.workspaceId = workspaceId
            this.loading = true
            try { this.notes = ((await List(workspaceId)) ?? []).map(toNote) } finally { this.loading = false }
        },
        async add(subject: string, text: string, headCommit: string) {
            if (!this.workspaceId || !text.trim()) return
            const subjectKind = subject.trim() ? (subject.includes("/") || /\.[a-z0-9]{1,6}$/i.test(subject) ? "file" : "component") : "codebase"
            const saved = await Save({ id: "", workspaceId: this.workspaceId, subjectKind, subject: subject.trim(), text: text.trim(), author: "person", headCommit } as any)
            this.notes = [toNote(saved), ...this.notes]
        },
        async remove(id: string) {
            await Delete(id)
            this.notes = this.notes.filter(n => n.id !== id)
        },
    },
})
