import { acceptHMRUpdate, defineStore } from "pinia"
import { markRaw } from "vue"
import { useStateStore } from "~/platform/state.store"

// The SQL console's working set: its tabs and what each last returned, and
// the history of every run. Tabs and history are the workspace's, kept across
// launches like an IDE's open editors; results live for the session.

/** A report's SQL cell a tab was opened from: Update cell writes the tab back into it. */
export interface CellLink {
    reportId: string
    cellId: string
    /** The report's title and the cell's number ("Table 3") when the tab was opened. */
    report: string
    label: string
    /** The cell's SQL as it was, to tell whether the tab has changed it. */
    sql: string
}

export interface ConsoleTab {
    id: string
    name: string
    sql: string
    /** A saved query this tab opened; the tab shows when its SQL has moved away from it. */
    savedId?: string
    cell?: CellLink
    /** Values for the query's :parameters, kept with the tab. */
    params?: Record<string, string>
}

export interface ConsoleResult {
    columns: string[]
    rows: unknown[][]
    truncated: boolean
    elapsedMs: number
    /** The statement that ran, and where. */
    sql: string
    scanId: string
    scan: string
    at: string
}

export interface PlanRow { id: number; parent: number; detail: string }

export interface TabRun {
    running: boolean
    error: string
    result: ConsoleResult | null
    plan: { sql: string; rows: PlanRow[]; error: string } | null
    /** The same statement on the baseline snapshot, when comparing. */
    baseline: { result: ConsoleResult | null; error: string; running: boolean } | null
}

export interface HistoryEntry {
    id: string
    sql: string
    at: string
    scanId: string
    scan: string
    rows: number | null
    ms: number | null
    error?: string
}

const HISTORY = 200
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const useConsoleStore = defineStore("sqlConsole", {
    state: () => ({
        workspace: "" as string,
        tabs: [] as ConsoleTab[],
        activeId: "" as string,
        history: [] as HistoryEntry[],
        runs: {} as Record<string, TabRun>,
    }),
    getters: {
        active(s): ConsoleTab | null { return s.tabs.find(t => t.id === s.activeId) ?? s.tabs[0] ?? null },
    },
    actions: {
        /** Loads the workspace's tabs and history once it is the one open. */
        ensure() {
            const state = useStateStore()
            if (!state.workspace || state.workspace === this.workspace) return
            this.workspace = state.workspace
            const kept = state.get<{ tabs: ConsoleTab[]; active: string } | null>("console.tabs", null)
            this.tabs = kept?.tabs?.length ? kept.tabs : [{ id: newId(), name: "Query 1", sql: "" }]
            this.activeId = kept?.active && this.tabs.some(t => t.id === kept.active) ? kept.active : this.tabs[0].id
            this.history = state.get<HistoryEntry[]>("console.history", []) ?? []
            this.runs = {}
        },
        persist() {
            useStateStore().set("console.tabs", { tabs: this.tabs, active: this.activeId })
        },
        run(id: string): TabRun {
            let r = this.runs[id]
            if (!r) { r = { running: false, error: "", result: null, plan: null, baseline: null }; this.runs = { ...this.runs, [id]: r } }
            return this.runs[id]
        },
        activate(id: string) {
            if (!this.tabs.some(t => t.id === id)) return
            this.activeId = id
            this.persist()
        },
        /** A name no open tab has: "Query 3". */
        freshName(stem = "Query") {
            const taken = new Set(this.tabs.map(t => t.name))
            let n = 1
            while (taken.has(`${stem} ${n}`)) n++
            return `${stem} ${n}`
        },
        open(tab: Omit<ConsoleTab, "id" | "name"> & { name?: string }): string {
            const t: ConsoleTab = { id: newId(), name: tab.name?.trim() || this.freshName(), sql: tab.sql, ...(tab.savedId ? { savedId: tab.savedId } : {}), ...(tab.cell ? { cell: tab.cell } : {}) }
            const at = this.tabs.findIndex(x => x.id === this.activeId)
            this.tabs.splice(at < 0 ? this.tabs.length : at + 1, 0, t)
            this.activeId = t.id
            this.persist()
            return t.id
        },
        /** A saved query in its own tab; the tab already holding it comes forward instead. */
        openSaved(q: { id: string; name: string; sql: string }) {
            const had = this.tabs.find(t => t.savedId === q.id)
            if (had) { this.activate(had.id); return had.id }
            // An empty scratch tab is reused rather than left behind.
            const blank = this.active && !this.active.sql.trim() && !this.active.cell && !this.active.savedId ? this.active : null
            if (blank) { Object.assign(blank, { name: q.name, sql: q.sql, savedId: q.id }); this.persist(); return blank.id }
            return this.open({ name: q.name, sql: q.sql, savedId: q.id })
        },
        /** A report's SQL cell, linked back to it. Opened again, the tab keeps its edits. */
        openCell(link: CellLink, title: string) {
            this.ensure()
            const had = this.tabs.find(t => t.cell?.reportId === link.reportId && t.cell.cellId === link.cellId)
            if (had) {
                if (had.sql === had.cell!.sql) had.sql = link.sql
                had.cell = link
                this.activate(had.id)
                return had.id
            }
            return this.open({ name: title || `${link.label} · ${link.report}`, sql: link.sql, cell: link })
        },
        setSql(id: string, sql: string) {
            const t = this.tabs.find(x => x.id === id)
            if (!t || t.sql === sql) return
            t.sql = sql
            this.persist()
        },
        rename(id: string, name: string) {
            const t = this.tabs.find(x => x.id === id)
            if (!t || !name.trim()) return
            t.name = name.trim().slice(0, 80)
            this.persist()
        },
        patch(id: string, patch: Partial<ConsoleTab>) {
            const t = this.tabs.find(x => x.id === id)
            if (!t) return
            Object.assign(t, patch)
            for (const k of Object.keys(patch) as Array<keyof ConsoleTab>) if (patch[k] === undefined) delete t[k]
            this.persist()
        },
        close(id: string) {
            const i = this.tabs.findIndex(t => t.id === id)
            if (i < 0) return
            this.tabs.splice(i, 1)
            const { [id]: _gone, ...rest } = this.runs
            this.runs = rest
            if (!this.tabs.length) this.tabs.push({ id: newId(), name: "Query 1", sql: "" })
            if (this.activeId === id) this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)].id
            this.persist()
        },
        closeOthers(id: string) {
            for (const t of [...this.tabs]) if (t.id !== id) this.close(t.id)
        },
        move(id: string, to: number) {
            const i = this.tabs.findIndex(t => t.id === id)
            if (i < 0 || i === to) return
            const [t] = this.tabs.splice(i, 1)
            this.tabs.splice(Math.max(0, Math.min(this.tabs.length, to)), 0, t)
            this.persist()
        },
        setParam(id: string, name: string, value: string) {
            const t = this.tabs.find(x => x.id === id)
            if (!t) return
            t.params = { ...(t.params ?? {}), [name]: value }
            this.persist()
        },
        setResult(id: string, result: ConsoleResult | null, error = "") {
            const r = this.run(id)
            r.result = result ? markRaw(result) : null
            r.error = error
        },
        record(e: Omit<HistoryEntry, "id" | "at">) {
            // Running the same statement again moves it up rather than adding a line.
            const rest = this.history.filter(h => !(h.sql.trim() === e.sql.trim() && h.scanId === e.scanId))
            this.history = [{ ...e, id: newId(), at: new Date().toISOString() }, ...rest].slice(0, HISTORY)
            useStateStore().set("console.history", this.history)
        },
        clearHistory() {
            this.history = []
            useStateStore().set("console.history", null)
        },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useConsoleStore, import.meta.hot))
