import { acceptHMRUpdate, defineStore } from "pinia"
import { markRaw } from "vue"
import { DeleteReport, Figure, RenderPDF, ReorderReports, Reports, SaveFigure, SaveReport } from "wailsjs/go/app/EvidenceService"
import { Console, QueryIn } from "wailsjs/go/app/QueryService"
import { useDataStore } from "~/stores/data"
import { useEvidenceStore } from "~/stores/evidence"
import { useWorkspacesStore } from "~/stores/workspaces"
import { buildProvenance } from "~/utils/provenance"
import { useAuthorsStore } from "~/stores/authors"
import { useStateStore } from "~/stores/state"
import type { ReadingContext } from "~/utils/readings"
import { exportMarkdown, pdfBlocks, runCell, type KernelScan, type RunContext } from "~/utils/reportCells"
import { emptyDoc, fromMarkdown, isCell, newId, parseDoc, runnable, toMarkdown, type Block, type Cell, type CellBlock, type ReportDoc, type TableSource } from "~/utils/reportDoc"
import { SAVED_TEMPLATES_KEY, type SavedTemplate } from "~/utils/reportTemplates"
import { newestFirst } from "~/utils/scanOrder"
import { formatScanTime } from "~/utils/time"

// The workspace's reports: notebooks of prose and evidence cells drawn from
// the pool of pins. One is open at a time; edits save themselves a moment
// after the typing stops, and every edit can be undone.

/** Something a view hands over, held while the Add to report sheet is open. */
export interface ImportDraft {
    kind: "figure" | "table" | "document"
    title: string
    view: string
    route: string
    ranOn: import("~/utils/reportDoc").RanOn
    /** A figure, as PNG base64, and how to draw it again in the other appearance. */
    figure?: string
    renderFigure?: (light: boolean) => Promise<string>
    table?: import("~/utils/reportDoc").TableOutput
    markdown?: string
}

/** A template's slot being filled: the view it opened, waiting for Add to report. */
export interface SlotFill {
    reportId: string
    cellId: string
    kind: "figure" | "table"
    view: string
    route: string
    hint: string
    title: string
    /** "Figure 2". */
    number: string
    reportTitle: string
}

export interface ReportRecord {
    id: string
    workspaceId: string
    position: number
    title: string
    body: string
    createdAt: string
    updatedAt: string
}

const HISTORY = 200

export const useReportsStore = defineStore("reports", {
    state: () => ({
        workspace: "" as string,
        list: [] as ReportRecord[],
        currentId: null as string | null,
        doc: emptyDoc() as ReportDoc,
        undoStack: [] as string[],
        redoStack: [] as string[],
        /** A burst of typing is one undo step: the key of the burst in progress. */
        burst: "" as string,
        running: [] as string[],
        figures: {} as Record<string, string>,
        /** Figure paths that could not be read: shown as missing, not as loading. */
        missingFigures: [] as string[],
        saving: false,
        loaded: false,
        importing: null as ImportDraft | null,
        filling: null as SlotFill | null,
        /** The template gallery is open. */
        choosingTemplate: false,
    }),
    getters: {
        current(s): ReportRecord | null { return s.list.find(r => r.id === s.currentId) ?? null },
        cells(s): CellBlock[] { return s.doc.blocks.filter(isCell) },
        /** The snapshot cells run on. */
        kernel(s): KernelScan | null {
            const ws = useWorkspacesStore()
            const complete = ws.scans.filter((x: any) => x.status === "complete")
            const scan: any = s.doc.kernel === "newest" ? newestFirst(complete)[0] : complete.find((x: any) => x.id === s.doc.kernel) ?? newestFirst(complete)[0]
            if (!scan) return null
            return { id: scan.id, label: formatScanTime(scan.headTime ?? scan.startedAt), headCommit: scan.headCommit ?? "", revision: Number(scan.analysisRevision) || 0 }
        },
        /** Cells that ran on another snapshot than the kernel, or never ran. */
        stale(): CellBlock[] {
            const k = this.kernel
            return this.cells.filter(c => runnable(c.cell.spec) && (!c.cell.ranOn || (k && c.cell.ranOn.scanId !== k.id)))
        },
        /** Where each pin is used: pin id → report titles. */
        pinUsage(s): Map<string, string[]> {
            const out = new Map<string, string[]>()
            for (const r of s.list) {
                const doc = r.id === s.currentId ? s.doc : parseDoc(r.body)
                for (const b of doc.blocks) {
                    if (isCell(b) && b.cell.spec.type === "pin") {
                        const t = out.get(b.cell.spec.pinId) ?? []
                        if (!t.includes(r.title)) t.push(r.title || "Untitled report")
                        out.set(b.cell.spec.pinId, t)
                    }
                }
            }
            return out
        },
        canUndo: (s) => s.undoStack.length > 0,
        canRedo: (s) => s.redoStack.length > 0,
    },
    actions: {
        async load(workspaceId: string, force = false) {
            if (this.workspace === workspaceId && this.loaded && !force) return
            this.workspace = workspaceId
            try { this.list = ((await Reports(workspaceId)) ?? []) as any } catch { this.list = [] }
            // The first visit after the board became notebooks: the board's order
            // becomes the first report, so nothing arranged by hand is lost.
            if (!this.list.length) {
                const evidence = useEvidenceStore()
                await evidence.load(workspaceId)
                if (evidence.pins.length && !this.list.length) {
                    const doc: ReportDoc = { version: 1, blocks: boardBlocks(evidence.pins), kernel: "newest" }
                    const saved = (await SaveReport({ id: "", workspaceId, position: 0, title: "Evidence", body: JSON.stringify(doc), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any)) as any as ReportRecord
                    this.list = [...this.list, saved]
                }
            }
            this.loaded = true
            // A report opened while this was loading stays open.
            if (this.currentId && this.list.some(r => r.id === this.currentId)) return
            this.open(this.list[0]?.id ?? null)
        },
        open(id: string | null) {
            this.flushSave()
            this.currentId = id
            const r = this.list.find(x => x.id === id)
            this.doc = r ? parseDoc(r.body) : emptyDoc()
            this.undoStack = []
            this.redoStack = []
            this.burst = ""
            void this.loadFigures()
        },
        async create(title = "Untitled report", blocks?: Block[]): Promise<ReportRecord | null> {
            if (!this.workspace) return null
            const doc: ReportDoc = { version: 1, blocks: blocks?.length ? blocks : [{ id: newId(), kind: "p", text: "" }], kernel: "newest" }
            const saved = (await SaveReport({ id: "", workspaceId: this.workspace, position: 0, title, body: JSON.stringify(doc), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any)) as any as ReportRecord
            this.list = [...this.list, saved]
            this.open(saved.id)
            return saved
        },
        async duplicate(id: string) {
            const r = this.list.find(x => x.id === id)
            if (!r) return
            const doc = parseDoc(r.id === this.currentId ? JSON.stringify(this.doc) : r.body)
            await this.create(`${r.title} (copy)`, doc.blocks.map(b => ({ ...b, id: newId() })))
        },
        async rename(id: string, title: string) {
            const r = this.list.find(x => x.id === id)
            if (!r) return
            r.title = title.trim() || "Untitled report"
            await SaveReport({ ...r, body: r.id === this.currentId ? JSON.stringify(this.doc) : r.body } as any)
        },
        async remove(id: string) {
            await DeleteReport(id)
            this.list = this.list.filter(r => r.id !== id)
            if (this.currentId === id) this.open(this.list[0]?.id ?? null)
        },
        async reorder(ids: string[]) {
            const by = new Map(this.list.map(r => [r.id, r]))
            this.list = ids.map(id => by.get(id)!).filter(Boolean)
            await ReorderReports(this.workspace, ids)
        },

        // ── Editing ─────────────────────────────────────────────────────────
        /** Records the document before a change; a burst (typing in one block) records once. */
        checkpoint(burst = "") {
            if (burst && burst === this.burst) return
            this.burst = burst
            this.undoStack.push(JSON.stringify(this.doc.blocks))
            if (this.undoStack.length > HISTORY) this.undoStack.shift()
            this.redoStack = []
        },
        changed() {
            this.scheduleSave()
        },
        setText(id: string, text: string) {
            const b = this.doc.blocks.find(x => x.id === id)
            if (!b || isCell(b)) return
            this.checkpoint(`text:${id}`)
            b.text = text
            this.changed()
        },
        replaceBlock(id: string, next: Block) {
            const i = this.doc.blocks.findIndex(x => x.id === id)
            if (i < 0) return
            this.checkpoint()
            this.doc.blocks.splice(i, 1, next)
            this.changed()
        },
        /** Inserts after the block with this id (at the top when null); returns the first inserted id. */
        insert(after: string | null, blocks: Block[]): string | null {
            if (!blocks.length) return null
            this.checkpoint()
            const i = after === null ? -1 : this.doc.blocks.findIndex(x => x.id === after)
            this.doc.blocks.splice(i + 1, 0, ...blocks)
            // An empty paragraph an insertion lands on is replaced, not kept above it.
            const host = i >= 0 ? this.doc.blocks[i] : null
            if (host && !isCell(host) && host.kind === "p" && !host.text.trim() && isCell(blocks[0])) this.doc.blocks.splice(i, 1)
            // A notebook never ends on a cell: there is always a line to type after it.
            const last = this.doc.blocks[this.doc.blocks.length - 1]
            if (!last || isCell(last)) this.doc.blocks.push({ id: newId(), kind: "p", text: "" })
            this.changed()
            return blocks[0].id
        },
        removeBlock(id: string) {
            const i = this.doc.blocks.findIndex(x => x.id === id)
            if (i < 0) return
            this.checkpoint()
            this.doc.blocks.splice(i, 1)
            if (!this.doc.blocks.length) this.doc.blocks.push({ id: newId(), kind: "p", text: "" })
            this.changed()
        },
        move(id: string, toIndex: number) {
            const i = this.doc.blocks.findIndex(x => x.id === id)
            if (i < 0) return
            this.checkpoint()
            const [b] = this.doc.blocks.splice(i, 1)
            this.doc.blocks.splice(Math.max(0, Math.min(this.doc.blocks.length, toIndex > i ? toIndex - 1 : toIndex)), 0, b)
            this.changed()
        },
        setCell(id: string, patch: Partial<Cell>) {
            const b = this.doc.blocks.find(x => x.id === id)
            if (!b || !isCell(b)) return
            this.checkpoint(`cell:${id}:${Object.keys(patch).join()}`)
            b.cell = { ...b.cell, ...patch }
            this.changed()
        },
        setKernel(kernel: string) {
            this.checkpoint()
            this.doc.kernel = kernel
            this.changed()
        },
        /** The whole document from Markdown (the raw view); cells keep their output by id. */
        setMarkdown(md: string) {
            this.checkpoint("raw")
            const cells = new Map(this.cells.map(c => [c.id, c.cell]))
            const blocks = fromMarkdown(md, cells)
            this.doc.blocks = blocks.length ? blocks : [{ id: newId(), kind: "p", text: "" }]
            this.changed()
        },
        markdown(): string { return toMarkdown(this.doc.blocks) },
        undo() {
            const prev = this.undoStack.pop()
            if (!prev) return
            this.redoStack.push(JSON.stringify(this.doc.blocks))
            this.doc.blocks = JSON.parse(prev)
            this.burst = ""
            this.changed()
        },
        redo() {
            const next = this.redoStack.pop()
            if (!next) return
            this.undoStack.push(JSON.stringify(this.doc.blocks))
            this.doc.blocks = JSON.parse(next)
            this.burst = ""
            this.changed()
        },

        // ── Saving ──────────────────────────────────────────────────────────
        scheduleSave() {
            if (saveTimer) clearTimeout(saveTimer)
            saveTimer = setTimeout(() => { void this.save() }, 600)
        },
        flushSave() {
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; void this.save() }
        },
        async save() {
            saveTimer = null
            const r = this.current
            if (!r) return
            // An untitled report takes the name of its first heading.
            const h = this.doc.blocks.find(b => !isCell(b) && b.kind === "h1" && b.text.trim()) as any
            if (r.title === "Untitled report" && h) r.title = h.text.trim().slice(0, 80)
            const body = JSON.stringify({ version: 1, blocks: this.doc.blocks.map(stripSession), kernel: this.doc.kernel })
            this.saving = true
            try {
                const saved = (await SaveReport({ ...r, body } as any)) as any
                r.body = body
                r.updatedAt = saved?.updatedAt ?? new Date().toISOString()
            } finally {
                this.saving = false
            }
        },

        // ── Running ─────────────────────────────────────────────────────────
        /** What readings run with on the kernel; kept per snapshot so it is probed once. */
        readingContext(): ReadingContext | null {
            const k = this.kernel
            if (!k) return null
            const aliases = useAuthorsStore().aliases
            const key = `${k.id}:${JSON.stringify(aliases)}`
            if (readingCache?.key !== key) {
                const data = useDataStore()
                readingCache = { key, ctx: { query: sql => QueryIn(k.id, sql) as Promise<any[]>, revision: k.revision, label: id => data.statNiceName(id) || id, aliases } }
            }
            return readingCache.ctx
        },
        runContext(): RunContext | null {
            const k = this.kernel
            if (!k) return null
            const data = useDataStore()
            const evidence = useEvidenceStore()
            const columnCache = new Map<string, Set<string>>()
            return {
                scan: k,
                query: sql => QueryIn(k.id, sql) as Promise<any[]>,
                console: async sql => {
                    const r: any = await Console(k.id, sql)
                    return { columns: r.columns ?? [], rows: r.rows ?? [], truncated: !!r.truncated }
                },
                columns: async (t: TableSource) => {
                    if (!columnCache.has(t)) columnCache.set(t, new Set(((await QueryIn(k.id, `SELECT name FROM pragma_table_info('${t}')`)) as any[]).map(r => String(r.name))))
                    return columnCache.get(t)!
                },
                pin: id => {
                    const p = evidence.pins.find(x => x.id === id)
                    return p ? { title: p.title, kind: p.kind, entityKey: p.entityKey, note: p.note, values: evidence.valuesOf(p), route: p.route, figurePath: p.figurePath } : null
                },
                label: id => data.statNiceName(id) || id,
                context: () => {
                    const p = buildProvenance()
                    return { lens: p.lens ?? undefined, scope: p.scope ?? undefined, role: p.role ?? undefined }
                },
                readings: this.readingContext()!,
            }
        },
        async run(id: string) {
            const ctx = this.runContext()
            const b = this.doc.blocks.find(x => x.id === id)
            if (!ctx || !b || !isCell(b) || this.running.includes(id)) return
            this.running = [...this.running, id]
            try {
                const next = await runCell(b.cell, ctx)
                const now = this.doc.blocks.find(x => x.id === id)
                if (now && isCell(now)) {
                    this.checkpoint()
                    now.cell = markRaw(next) as Cell
                    this.changed()
                    void this.loadFigures()
                }
            } finally {
                this.running = this.running.filter(x => x !== id)
            }
        },
        async runAll() {
            for (const c of this.stale) await this.run(c.id)
        },

        // ── Figures ─────────────────────────────────────────────────────────
        async loadFigures() {
            for (const c of this.cells) {
                const path = c.cell.output?.figure
                if (!path || this.figures[path] || this.missingFigures.includes(path)) continue
                let b64 = ""
                try { b64 = await Figure(path) } catch { b64 = "" }
                if (b64) this.figures = { ...this.figures, [path]: `data:image/png;base64,${b64}` }
                else this.missingFigures = [...this.missingFigures, path]
            }
        },
        /**
         * A PNG kept with the workspace's evidence, for a captured figure. The
         * image is cached as it is written, so the cell shows it at once.
         */
        async keepFigure(pngBase64: string): Promise<string> {
            const path = await SaveFigure(this.workspace, `cell-${newId()}`, pngBase64)
            if (path) this.figures = { ...this.figures, [path]: `data:image/png;base64,${pngBase64}` }
            return path
        },

        // ── Adding from elsewhere ───────────────────────────────────────────
        /** Appends blocks to a report, opening it; used by "Add to report" in every view. */
        async append(reportId: string | null, blocks: Block[], newTitle = "Untitled report") {
            if (!reportId) {
                await this.create(newTitle, [...blocks, { id: newId(), kind: "p", text: "" }])
                return
            }
            if (reportId !== this.currentId) this.open(reportId)
            const last = this.doc.blocks[this.doc.blocks.length - 1]
            const after = last && !isCell(last) && last.kind === "p" && !last.text.trim() ? this.doc.blocks[this.doc.blocks.length - 2]?.id ?? null : last?.id ?? null
            this.insert(after, blocks)
            this.flushSave()
        },

        /** Opens the Add to report sheet with what a view handed over. */
        async beginImport(draft: ImportDraft) {
            const ws = useWorkspacesStore()
            if (ws.active) await this.load(ws.active.id)
            this.importing = markRaw(draft) as ImportDraft
        },
        /**
         * Inserts blocks into a report after a block (null: at the top; "end":
         * at the end), creating the report when no id is given.
         */
        async insertInto(reportId: string | null, after: string | null | "end", blocks: Block[], newTitle = "Untitled report") {
            if (!reportId) {
                await this.create(newTitle, [...blocks, { id: newId(), kind: "p", text: "" }])
                return
            }
            if (reportId !== this.currentId) this.open(reportId)
            let at = after
            if (at === "end") {
                const last = this.doc.blocks[this.doc.blocks.length - 1]
                at = last && !isCell(last) && last.kind === "p" && !last.text.trim() ? this.doc.blocks[this.doc.blocks.length - 2]?.id ?? null : last?.id ?? null
            }
            this.insert(at, blocks)
            this.flushSave()
            void this.loadFigures()
        },

        // ── Templates ───────────────────────────────────────────────────────
        /** A report from a template: created, opened, and its cells run on the kernel. */
        async createFrom(title: string, blocks: Block[]) {
            await this.create(title, blocks)
            await this.runAll()
        },
        /** A block a template left open, written as the writer's own: a computed paragraph becomes plain text. */
        adoptReading(id: string) {
            const b = this.doc.blocks.find(x => x.id === id)
            if (!b || !isCell(b) || !b.cell.output?.reading) return
            this.replaceBlock(id, { id, kind: "p", text: b.cell.output.reading.text })
        },
        savedTemplates(): SavedTemplate[] {
            return useStateStore().setting<SavedTemplate[]>(SAVED_TEMPLATES_KEY, []) ?? []
        },
        async saveTemplate(t: SavedTemplate) {
            const state = useStateStore()
            await state.loadSettings()
            const rest = this.savedTemplates().filter(x => x.id !== t.id)
            await state.setSetting(SAVED_TEMPLATES_KEY, [...rest, t] as any)
        },
        async removeTemplate(id: string) {
            const state = useStateStore()
            const rest = this.savedTemplates().filter(x => x.id !== id)
            await state.setSetting(SAVED_TEMPLATES_KEY, rest.length ? (rest as any) : null)
        },

        // ── Filling a slot ──────────────────────────────────────────────────
        /** Starts filling a slot: remembered while the writer is in the view it names. */
        beginFill(cellId: string, number: string) {
            const b = this.doc.blocks.find(x => x.id === cellId)
            if (!b || !isCell(b) || b.cell.spec.type !== "slot" || !this.currentId) return null
            const s = b.cell.spec
            this.flushSave()
            this.filling = { reportId: this.currentId, cellId, kind: s.kind, view: s.view, route: s.route, hint: s.hint, title: b.cell.title, number, reportTitle: this.current?.title || "Untitled report" }
            return s.route
        },
        /** Puts what was added where the slot was. */
        async fillSlot(reportId: string, cellId: string, blocks: Block[]) {
            if (reportId !== this.currentId) this.open(reportId)
            const i = this.doc.blocks.findIndex(x => x.id === cellId)
            if (i < 0) { this.insert(this.doc.blocks[this.doc.blocks.length - 1]?.id ?? null, blocks) }
            else {
                this.checkpoint()
                this.doc.blocks.splice(i, 1, ...blocks)
                this.changed()
            }
            this.filling = null
            this.flushSave()
            void this.loadFigures()
        },

        // ── Export ──────────────────────────────────────────────────────────
        exportMeta(): string[] {
            const p = buildProvenance()
            const k = this.kernel
            return [
                [p.workspace, k ? `snapshot ${k.label}` : "", k?.headCommit ? k.headCommit.slice(0, 7) : "", k ? `analysis r${k.revision}` : ""].filter(Boolean).join(" · "),
                `Written with Archstats Desktop ${p.appVersion}${p.pseudonymised ? " · authors pseudonymised" : ""} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
            ]
        },
        async pdfBase64(opts: { pageSize?: "A4" | "Letter" } = {}): Promise<string> {
            const data = useDataStore()
            const figs = new Map<string, string>()
            for (const c of this.cells) {
                const path = c.cell.output?.figure
                if (!path) continue
                const b64 = (this.figures[path] ?? "").replace(/^data:image\/png;base64,/, "") || (await Figure(path).catch(() => ""))
                if (b64) figs.set(c.id, b64)
            }
            const workspace = buildProvenance().workspace
            const title = this.current?.title || "Report"
            return RenderPDF({ title, pageSize: opts.pageSize ?? "A4", meta: this.exportMeta(), blocks: pdfBlocks(this.doc.blocks, { workspace, label: id => data.statNiceName(id) || id, figure: id => figs.get(id) ?? null }) } as any)
        },
        exportMarkdown(figureDir: string | null): string {
            const data = useDataStore()
            const figIndex = new Map<string, number>()
            let n = 0
            for (const c of this.cells) if (c.cell.output?.figure) figIndex.set(c.id, ++n)
            return exportMarkdown(this.current?.title || "Report", this.exportMeta(), this.doc.blocks, {
                workspace: buildProvenance().workspace,
                label: id => data.statNiceName(id) || id,
                figureFile: id => (figureDir && figIndex.has(id) ? `${figureDir}/figure-${String(figIndex.get(id)).padStart(2, "0")}.png` : null),
            })
        },
    },
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let readingCache: { key: string; ctx: ReadingContext } | null = null

/** The session's comparison output is not saved. */
function stripSession(b: Block): Block {
    if (!isCell(b)) return b
    const { previous: _previous, ...cell } = b.cell
    return { ...b, cell }
}

/** The old board, in its order: headings stay headings, pins become cells. */
function boardBlocks(pins: Array<{ id: string; kind: string; title: string }>): Block[] {
    const out: Block[] = []
    for (const p of pins) {
        if (p.kind === "heading") out.push({ id: newId(), kind: "h2", text: p.title })
        else out.push({ id: newId(), kind: "cell", cell: { spec: { type: "pin", pinId: p.id }, title: "", caption: "", output: null, ranOn: null } })
    }
    out.push({ id: newId(), kind: "p", text: "" })
    return out
}

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useReportsStore, import.meta.hot))
