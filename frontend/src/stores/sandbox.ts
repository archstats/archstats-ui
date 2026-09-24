import { acceptHMRUpdate, defineStore } from "pinia"
import { markRaw } from "vue"
import { useDataStore } from "~/stores/data"
import { loadSandboxBase, project, type Edit, type Projection, type SandboxBase } from "~/utils/sandbox"

// A what-if plan for the open snapshot: a list of edits with undo and redo,
// projected on demand. Plans live for the session; a new snapshot starts clean.

export const useSandboxStore = defineStore("sandbox", {
    state: () => ({
        edits: [] as Edit[],
        redo: [] as Edit[][],
        undo: [] as Edit[][],
        base: null as SandboxBase | null,
        baseFor: "" as string,
        loading: false,
    }),
    getters: {
        before(): Projection | null { return this.base ? markRaw(project(this.base, [])) : null },
        after(): Projection | null { return this.base ? markRaw(project(this.base, this.edits)) : null },
        canUndo: (s) => s.undo.length > 0,
        canRedo: (s) => s.redo.length > 0,
    },
    actions: {
        async load() {
            const data = useDataStore()
            const key = String(data.datasetKey ?? "")
            if (this.baseFor === key && this.base) return
            this.loading = true
            try {
                this.base = markRaw(await loadSandboxBase(sql => data.query(sql), (t, c) => data.hasColumn(t, c)))
                this.baseFor = key
                this.edits = []; this.undo = []; this.redo = []
            } finally {
                this.loading = false
            }
        },
        apply(next: Edit[]) {
            this.undo.push(this.edits)
            this.redo = []
            this.edits = next
        },
        add(edit: Edit) { this.apply([...this.edits, edit]) },
        remove(i: number) { this.apply(this.edits.filter((_, j) => j !== i)) },
        clear() { if (this.edits.length) this.apply([]) },
        stepBack() { const prev = this.undo.pop(); if (prev) { this.redo.push(this.edits); this.edits = prev } },
        stepForward() { const next = this.redo.pop(); if (next) { this.undo.push(this.edits); this.edits = next } },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useSandboxStore, import.meta.hot))
