// Running a report's evidence cells, and turning a report into Markdown and
// into the PDF's blocks. A cell runs on one snapshot (the report's kernel)
// and keeps what it found there; running it again on a newer snapshot says
// what moved.

import { measurePin, pinStatus, type PinValues } from "~/utils/evidence"
import { runReading, type ReadingContext } from "~/utils/readings"
import {
    blockMarkdown, cellNumbers, inlineRuns, isCell, tableCells,
    type Block, type Cell, type CellOutput, type CellSpec, type RanOn, type TableOutput, type TableSource,
} from "~/utils/reportDoc"

// ── Table presets ─────────────────────────────────────────────────────────

export interface TablePreset {
    id: string
    label: string
    hint: string
    source: TableSource
    columns: string[]
    sort: string
    desc: boolean
}

/**
 * Ready-made tables, per grain. Component coupling is counted in components
 * (dependents, dependencies), never in files: afferent counts importing files.
 */
export const TABLE_PRESETS: TablePreset[] = [
    { id: "c-hotspots", label: "Hotspot components", hint: "Largest hotspot scores first", source: "components", columns: ["complexity__lines", "codesmells__code_health", "codesmells__hotspot_score", "git__commits__total"], sort: "codesmells__hotspot_score", desc: true },
    { id: "c-coupling", label: "Most depended-on components", hint: "Components with the most dependents", source: "components", columns: ["modularity__coupling__dependents", "modularity__coupling__dependencies", "modularity__instability", "modularity__distance_main_sequence"], sort: "modularity__coupling__dependents", desc: true },
    { id: "c-health", label: "Least healthy components", hint: "Lowest code health first", source: "components", columns: ["codesmells__code_health", "complexity__lines", "codesmells__hotspot_score"], sort: "codesmells__code_health", desc: false },
    { id: "c-size", label: "Largest components", hint: "Most lines first", source: "components", columns: ["complexity__lines", "complexity__files", "modularity__coupling__dependents"], sort: "complexity__lines", desc: true },
    { id: "f-hotspots", label: "Hotspot files", hint: "Files by hotspot score", source: "files", columns: ["complexity__lines", "codesmells__code_health", "codesmells__hotspot_score", "git__commits__total"], sort: "codesmells__hotspot_score", desc: true },
    { id: "f-churn", label: "Most changed files", hint: "Files by commits", source: "files", columns: ["git__commits__total", "complexity__lines", "codesmells__code_health"], sort: "git__commits__total", desc: true },
    { id: "f-health", label: "Least healthy files", hint: "Lowest code health first", source: "files", columns: ["codesmells__code_health", "complexity__lines", "codesmells__hotspot_score"], sort: "codesmells__code_health", desc: false },
]

const ident = (c: string) => `"${c.replace(/"/g, '""')}"`

/**
 * The SQL of a table cell, against the columns this snapshot has. Health
 * reads 0 as no reading on snapshots before analysis revision 2.
 */
export function tableSql(spec: Extract<CellSpec, { type: "table" }>, has: (column: string) => boolean, revision: number): string {
    const health = (c: string) => (c === "codesmells__code_health" && revision < 2 ? `NULLIF(${ident(c)}, 0)` : ident(c))
    const cols = spec.columns.filter(has)
    const sort = has(spec.sort) ? health(spec.sort) : "name"
    const where = spec.sort === "codesmells__code_health" && has(spec.sort) ? ` WHERE ${health(spec.sort)} IS NOT NULL` : ""
    return `SELECT name${cols.map(c => `, ${health(c)} AS ${ident(c)}`).join("")} FROM ${spec.source}${where} ORDER BY ${sort} ${spec.desc ? "DESC" : "ASC"} NULLS LAST, name LIMIT ${Math.max(1, Math.min(500, spec.limit))}`
}

// ── Running ───────────────────────────────────────────────────────────────

export interface KernelScan {
    id: string
    label: string
    headCommit: string
    revision: number
}

export interface RunContext {
    scan: KernelScan
    /** Reads the kernel snapshot. */
    query: (sql: string) => Promise<any[]>
    /** The read-only console, for SQL a person wrote. */
    console: (sql: string) => Promise<{ columns: string[]; rows: unknown[][]; truncated: boolean }>
    columns: (table: TableSource) => Promise<Set<string>>
    pin: (id: string) => { title: string; kind: string; entityKey: string; note: string; values: PinValues; route: string; figurePath: string } | null
    label: (metric: string) => string
    /** Lens, scope and role facet at the time of the run. */
    context: () => { lens?: string; scope?: string; role?: string }
    /** What readings run with; one per snapshot, so the snapshot is probed once. */
    readings: ReadingContext
}

const isNumeric = (rows: Array<Record<string, unknown>>, id: string) => {
    let seen = false
    for (const r of rows) {
        const v = r[id]
        if (v === null || v === undefined || v === "") continue
        if (typeof v !== "number") return false
        seen = true
    }
    return seen
}

function tableOf(rows: Array<Record<string, unknown>>, ids: string[], label: (id: string) => string, total: number): TableOutput {
    return { columns: ids.map(id => ({ id, label: id === "name" ? "Name" : label(id), numeric: isNumeric(rows, id) })), rows, total }
}

/** Runs one cell on the kernel snapshot. A capture or a slot has nothing to run and comes back as it was. */
export async function runCell(cell: Cell, ctx: RunContext): Promise<Cell> {
    const ranOn: RanOn = { scanId: ctx.scan.id, label: ctx.scan.label, commit: ctx.scan.headCommit, revision: ctx.scan.revision, at: new Date().toISOString(), ...ctx.context() }
    const spec = cell.spec
    let output: CellOutput
    try {
        if (spec.type === "capture" || spec.type === "slot") return cell
        if (spec.type === "reading") {
            output = { reading: await runReading(spec.reading, spec.params, ctx.readings) }
        } else if (spec.type === "table") {
            const has = await ctx.columns(spec.source)
            const rows = await ctx.query(tableSql(spec, c => has.has(c), ctx.scan.revision))
            const [count] = await ctx.query(`SELECT count(*) AS n FROM ${spec.source}`)
            output = { table: tableOf(rows, ["name", ...spec.columns.filter(c => has.has(c))], ctx.label, Number(count?.n) || rows.length) }
        } else if (spec.type === "sql") {
            const r = await ctx.console(spec.sql)
            const rows = r.rows.slice(0, Math.max(1, spec.limit)).map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))
            output = { table: tableOf(rows, r.columns, c => c, r.truncated ? -1 : r.rows.length) }
        } else {
            const pin = ctx.pin(spec.pinId)
            if (!pin) {
                output = { error: "This pin was removed from the pool." }
            } else {
                const now = pin.kind === "view" || pin.kind === "heading" ? null : await measurePin({ kind: pin.kind as any, entityKey: pin.entityKey }, ctx.query)
                const status = pin.kind === "view" ? { text: "" } : pinStatus({ pinned: pin.values, now, blocked: null, deleted: false, label: ctx.label })
                output = { pin: { title: pin.title, kind: pin.kind, note: pin.note, values: pin.values, now, status: status.text, route: pin.route }, figure: pin.figurePath || undefined }
            }
        }
    } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) }
    }
    return { ...cell, output, ranOn, previous: cell.output }
}

/** What moved between two runs of a cell, in words; "" when nothing did. */
export function describeChange(prev: CellOutput | null | undefined, next: CellOutput | null | undefined, label: (id: string) => string = x => x): string {
    if (!prev || !next) return ""
    if (prev.table && next.table) {
        const key = next.table.columns[0]?.id
        if (!key) return ""
        const before = new Map(prev.table.rows.map(r => [String(r[key]), r]))
        const after = new Map(next.table.rows.map(r => [String(r[key]), r]))
        const entered = [...after.keys()].filter(k => !before.has(k)).length
        const left = [...before.keys()].filter(k => !after.has(k)).length
        let changed = 0
        for (const [k, r] of after) {
            const b = before.get(k)
            if (b && next.table.columns.some(c => String(b[c.id] ?? "") !== String(r[c.id] ?? ""))) changed++
        }
        const moved = [...after.keys()].filter((k, i) => before.has(k) && [...before.keys()].indexOf(k) !== i).length
        const parts = [
            entered ? `${entered} new` : "", left ? `${left} gone` : "",
            changed ? `${changed} changed` : "", !entered && !left && !changed && moved ? `${moved} reordered` : "",
        ].filter(Boolean)
        return parts.length ? `Since the last run: ${parts.join(", ")}.` : "Unchanged since the last run."
    }
    if (prev.reading && next.reading) {
        const a = prev.reading.values, b = next.reading.values
        const moved = Object.keys(b).filter(k => a[k] !== undefined && Math.abs(a[k] - b[k]) > 1e-9)
        const fresh = Object.keys(b).filter(k => a[k] === undefined).length + Object.keys(a).filter(k => b[k] === undefined).length
        if (!moved.length && !fresh) return prev.reading.text === next.reading.text ? "Unchanged since the last run." : "Reworded since the last run; the numbers held."
        return `Since the last run: ${[...moved.map(k => `${k} ${fmtValue(a[k])} → ${fmtValue(b[k])}`), fresh ? `${fresh} named ${fresh === 1 ? "item" : "items"} changed` : ""].filter(Boolean).join(", ")}.`
    }
    if (prev.pin && next.pin) {
        const a = prev.pin.now ?? prev.pin.values, b = next.pin.now
        if (!b) return "What this pin names is gone."
        const moved = Object.keys(b).filter(k => a[k] !== undefined && Math.abs(a[k] - b[k]) > 1e-9)
        return moved.length ? `Since the last run: ${moved.map(k => `${label(k)} ${fmtValue(a[k])} → ${fmtValue(b[k])}`).join(", ")}.` : "Unchanged since the last run."
    }
    return ""
}

// ── Values ────────────────────────────────────────────────────────────────

export function fmtValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—"
    if (typeof v === "number") {
        if (!Number.isFinite(v)) return "—"
        if (Number.isInteger(v)) return v.toLocaleString("en-US")
        return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 1 ? 3 : 2 })
    }
    return String(v)
}

export function provenanceLine(r: RanOn | null, workspace: string): string {
    if (!r) return "Not run yet."
    return [workspace, `snapshot ${r.label}`, r.commit ? r.commit.slice(0, 7) : "", `analysis r${r.revision}`, r.lens ? `lens ${r.lens}` : "", r.scope ? `scope ${r.scope}` : "", r.role && r.role !== "all" ? `${r.role} files` : ""].filter(Boolean).join(" · ")
}

/** The rows a cell shows: a pin as metric, pinned and now; a table as it is. */
export function displayTable(cell: Cell, label: (id: string) => string): { columns: string[]; align: string[]; rows: string[][] } | null {
    const o = cell.output
    if (!o) return null
    if (o.table) {
        return {
            columns: o.table.columns.map(c => c.label),
            align: o.table.columns.map(c => (c.numeric ? "r" : "")),
            rows: o.table.rows.map(r => o.table!.columns.map(c => fmtValue(r[c.id]))),
        }
    }
    if (o.pin && Object.keys(o.pin.values).length) {
        const keys = Object.keys(o.pin.values)
        return {
            columns: ["Metric", "Pinned", "Now"],
            align: ["", "r", "r"],
            rows: keys.map(k => [label(k), fmtValue(o.pin!.values[k]), o.pin!.now ? fmtValue(o.pin!.now[k]) : "gone"]),
        }
    }
    return null
}

// ── Export ────────────────────────────────────────────────────────────────

export function cellTitle(cell: Cell): string {
    return cell.title || cell.output?.pin?.title || ""
}

/**
 * The report as Markdown for reading elsewhere: cells written out as their
 * tables and figures, with numbering, captions and provenance.
 */
export function exportMarkdown(title: string, meta: string[], blocks: Block[], opts: { workspace: string; label: (id: string) => string; figureFile: (cellId: string) => string | null }): string {
    const numbers = cellNumbers(blocks)
    const out: string[] = [`# ${title}`, "", ...meta.map(m => `_${m}_  `), ""]
    let n = 0
    blocks.forEach((b, i) => {
        const prev = blocks[i - 1]
        n = b.kind === "ol" ? (prev?.kind === "ol" ? n + 1 : 1) : 0
        const tight = prev && prev.kind === b.kind && (b.kind === "ul" || b.kind === "ol")
        if (!isCell(b) && !b.text.trim() && b.kind !== "hr") return
        if (isCell(b) && b.cell.spec.type === "slot") return
        if (i > 0 && !tight) out.push("")
        if (!isCell(b)) { out.push(blockMarkdown(b, n)); return }
        const c = b.cell
        if (c.output?.reading) { out.push(c.output.reading.text); return }
        const head = [numbers.get(b.id), cellTitle(c)].filter(Boolean).join(". ")
        out.push(`**${head}**`, "")
        const fig = opts.figureFile(b.id)
        if (fig) out.push(`![${cellTitle(c) || head}](${fig})`, "")
        const t = displayTable(c, opts.label)
        if (t) {
            out.push(`| ${t.columns.join(" | ")} |`, `|${t.align.map(a => (a === "r" ? " ---: " : " --- ")).join("|")}|`)
            for (const r of t.rows) out.push(`| ${r.map(x => x.replace(/\|/g, "\\|")).join(" | ")} |`)
            out.push("")
        }
        if (c.output?.pin?.note) out.push(c.output.pin.note, "")
        if (c.output?.error) out.push(`> ${c.output.error}`, "")
        if (c.caption) out.push(`_${c.caption}_`, "")
        out.push(`<sub>${provenanceLine(c.ranOn, opts.workspace)}</sub>`)
    })
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"
}

// The PDF document the Go renderer lays out (app/report/pdf.go).
export interface PdfRun { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string }
export interface PdfBlock {
    kind: string
    runs?: PdfRun[]
    items?: PdfRun[][]
    start?: number
    code?: string
    table?: { columns: string[]; align: string[]; rows: string[][] }
    image?: string
    title?: string
    caption?: string
    provenance?: string
}

const pdfRuns = (text: string): PdfRun[] => inlineRuns(text).map(r => ({ text: r.text, bold: r.bold, italic: r.italic, code: r.code, link: r.link && /^https?:/.test(r.link) ? r.link : undefined }))

/** The report flattened for the PDF renderer; figures come as base64 PNG by cell id. */
export function pdfBlocks(blocks: Block[], opts: { workspace: string; label: (id: string) => string; figure: (cellId: string) => string | null }): PdfBlock[] {
    const numbers = cellNumbers(blocks)
    const out: PdfBlock[] = []
    for (const b of blocks) {
        if (isCell(b)) {
            const c = b.cell
            // A computed paragraph prints as prose; an unfilled slot is left out.
            if (c.spec.type === "slot") continue
            if (c.spec.type === "reading") { if (c.output?.reading) out.push({ kind: "p", runs: pdfRuns(c.output.reading.text) }); continue }
            const title = [numbers.get(b.id), cellTitle(c)].filter(Boolean).join(". ")
            const caption = [c.output?.pin?.note, c.caption, c.output?.error].filter(Boolean).join(" ")
            const provenance = provenanceLine(c.ranOn, opts.workspace)
            const img = opts.figure(b.id)
            const t = displayTable(c, opts.label)
            if (img) out.push({ kind: "image", image: img, title, caption: t ? "" : caption, provenance: t ? "" : provenance })
            if (t) out.push({ kind: "table", table: t, title: img ? "" : title, caption, provenance })
            if (!img && !t) out.push({ kind: "p", runs: [{ text: title, bold: true }, { text: caption ? ` ${caption}` : " (no output)" }] })
            continue
        }
        if (b.kind === "ul" || b.kind === "ol") {
            const last = out[out.length - 1]
            if (last && last.kind === b.kind && last.items) last.items.push(pdfRuns(b.text))
            else out.push({ kind: b.kind, items: [pdfRuns(b.text)], start: 1 })
            continue
        }
        if (b.kind === "code") { out.push({ kind: "code", code: b.text }); continue }
        if (b.kind === "hr") { out.push({ kind: "hr" }); continue }
        if (b.kind === "table") {
            const [head, ...rows] = tableCells(b.text)
            if (head) out.push({ kind: "table", table: { columns: head.map(c => inlineRuns(c).map(r => r.text).join("")), align: head.map(() => ""), rows: rows.map(r => r.map(c => inlineRuns(c).map(x => x.text).join(""))) } })
            continue
        }
        if (!b.text.trim()) continue
        out.push({ kind: b.kind, runs: pdfRuns(b.text) })
    }
    return out
}

/** Real author names a text mentions: with pseudonyms on, a report that names one does not leave the app. */
export function namesIn(text: string, names: string[]): string[] {
    const lower = text.toLowerCase()
    return names.filter(n => n.length > 2 && lower.includes(n.toLowerCase()))
}
