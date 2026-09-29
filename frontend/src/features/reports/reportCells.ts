// Running a report's evidence cells, and turning a report into Markdown and
// into the PDF's blocks. A cell runs on one snapshot (the report's kernel)
// and keeps what it found there; running it again on a newer snapshot says
// what moved.

import { measurePin, pinStatus, type PinValues } from "./evidence"
import { prodComponents, prodFile, runReading, type ReadingContext } from "./readings"
import {
    blockMarkdown, cellNumbers, inlineRuns, isCell, readingBlocks, tableCells,
    type Block, type Cell, type CellBlock, type CellOutput, type CellSpec, type RanOn, type TableOutput, type TableSource, type TextBlock,
} from "./reportDoc"

// ── Table presets ─────────────────────────────────────────────────────────

export interface TablePreset {
    id: string
    label: string
    hint: string
    source: TableSource
    columns: string[]
    sort: string
    desc: boolean
    /** "production" leaves out tests, generated and third-party code. */
    scope?: "production"
}

/**
 * Ready-made tables, per grain. Component coupling is counted in components
 * (dependents, dependencies), never in files: afferent counts importing files.
 */
export const TABLE_PRESETS: TablePreset[] = [
    { id: "c-hotspots", label: "Hotspot components", hint: "Largest hotspot scores first", source: "components", columns: ["complexity__lines", "codesmells__code_health", "codesmells__hotspot_score", "git__commits__total"], sort: "codesmells__hotspot_score", desc: true, scope: "production" },
    { id: "c-coupling", label: "Most depended-on components", hint: "Components with the most dependents", source: "components", columns: ["modularity__coupling__dependents", "modularity__coupling__dependencies", "modularity__instability", "modularity__distance_main_sequence"], sort: "modularity__coupling__dependents", desc: true, scope: "production" },
    { id: "c-health", label: "Least healthy components", hint: "Lowest code health first", source: "components", columns: ["codesmells__code_health", "complexity__lines", "codesmells__hotspot_score"], sort: "codesmells__code_health", desc: false, scope: "production" },
    { id: "c-size", label: "Largest components", hint: "Most lines first", source: "components", columns: ["complexity__lines", "complexity__files", "modularity__coupling__dependents"], sort: "complexity__lines", desc: true, scope: "production" },
    { id: "f-hotspots", label: "Hotspot files", hint: "Files by hotspot score", source: "files", columns: ["complexity__lines", "codesmells__code_health", "codesmells__hotspot_score", "git__commits__total"], sort: "codesmells__hotspot_score", desc: true, scope: "production" },
    { id: "f-churn", label: "Most changed files", hint: "Files by commits", source: "files", columns: ["git__commits__total", "complexity__lines", "codesmells__code_health"], sort: "git__commits__total", desc: true, scope: "production" },
    { id: "f-health", label: "Least healthy files", hint: "Lowest code health first", source: "files", columns: ["codesmells__code_health", "complexity__lines", "codesmells__hotspot_score"], sort: "codesmells__code_health", desc: false, scope: "production" },
]

const ident = (c: string) => `"${c.replace(/"/g, '""')}"`

/**
 * The SQL of a table cell, against the columns this snapshot has. Health
 * reads 0 as no reading on snapshots before analysis revision 2.
 */
export function tableSql(spec: Extract<CellSpec, { type: "table" }>, has: (column: string) => boolean, revision: number, roles = false): string {
    const cols = spec.columns.filter(has)
    const expr = (c: string) => columnExpr(c, has, revision)
    const sort = has(spec.sort) ? expr(spec.sort) : "name"
    const where = tableWhere(spec, has, revision, roles)
    return `SELECT name${cols.map(c => `, ${expr(c)} AS ${ident(c)}`).join("")} FROM ${spec.source}${where} ORDER BY ${sort} ${spec.desc ? "DESC" : "ASC"} NULLS LAST, name LIMIT ${Math.max(1, Math.min(500, spec.limit))}`
}

/**
 * A column as the table reads it. Health reads 0 as no reading before
 * revision 2. Instability is counted from the dependents and dependencies the
 * table shows beside it (components), not the engine's file counts, so the
 * three columns agree; distance from the main sequence follows from it.
 */
function columnExpr(c: string, has: (column: string) => boolean, revision: number): string {
    if (c === "codesmells__code_health" && revision < 2) return `NULLIF(${ident(c)}, 0)`
    const d = "modularity__coupling__dependents", e = "modularity__coupling__dependencies"
    const inst = has(d) && has(e) ? `round(1.0 * coalesce(${ident(e)}, 0) / nullif(coalesce(${ident(d)}, 0) + coalesce(${ident(e)}, 0), 0), 3)` : ""
    if (c === "modularity__instability" && inst) return inst
    if (c === "modularity__distance_main_sequence" && inst && has("modularity__abstractness")) return `round(abs(coalesce(${ident("modularity__abstractness")}, 0) + coalesce(${inst}, 0) - 1), 3)`
    return ident(c)
}

/** The rows a table cell counts: its scope, and only rated rows when it sorts by health. */
export function tableWhere(spec: Extract<CellSpec, { type: "table" }>, has: (column: string) => boolean, revision: number, roles = false): string {
    const conds: string[] = []
    if (spec.scope === "production") {
        const files = { fileColumns: new Set(roles ? ["role"] : []) }
        conds.push(spec.source === "files" ? prodFile(files) : prodComponents(files))
    }
    if (spec.sort === "codesmells__code_health" && has(spec.sort)) conds.push(`${revision < 2 ? `NULLIF(${ident(spec.sort)}, 0)` : ident(spec.sort)} IS NOT NULL`)
    return conds.length ? ` WHERE ${conds.join(" AND ")}` : ""
}

/** What a scoped table says about its rows. */
export function scopeNote(spec: Extract<CellSpec, { type: "table" }>, roles: boolean): string | undefined {
    if (spec.scope !== "production") return undefined
    if (!roles) return "Production code only. This scan did not sort its files, so tests, vendored libraries and files that are not code are recognised by their path, as the Overview does."
    return spec.source === "files" ? "Production files only: tests, generated and third-party code are left out." : "Components that hold production code; tests, generated and third-party code are left out."
}

// ── Running ───────────────────────────────────────────────────────────────

export interface KernelScan {
    id: string
    /** The snapshot as the sidebar names it: its label, or when it was scanned. */
    label: string
    headCommit: string
    /** When the commit it read was made, "4 May, 23:57"; "" without git. */
    committed?: string
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
    /** A metric's name and short definition, for the note under a table. */
    define?: (metric: string) => { name: string; short: string } | null
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

/**
 * What the metric columns of a table mean, in the snapshot's own words:
 * "Code Health: A rating from 1.0 to 10.0 of structural maintainability."
 * A report's reader has no explorer to hover; the note under the table
 * is where a metric is explained.
 */
export function metricsNote(columns: string[], define?: (id: string) => { name: string; short: string } | null): string {
    if (!define) return ""
    const parts: string[] = []
    for (const c of new Set(columns)) {
        const d = define(c)
        const s = d?.short?.trim()
        if (!d || !s) continue
        parts.push(`${d.name}: ${s}${/[.!?]$/.test(s) ? "" : "."}`)
    }
    return parts.join(" ")
}

/** A query's column as a header, capitalised like the presets' ("entry points" reads "Entry points"). */
export const headerCase = (c: string) => (/^[a-z]/.test(c) ? c.charAt(0).toUpperCase() + c.slice(1) : c)

/** What an empty query table says in place of its rows. */
export const EMPTY_TABLE = "Nothing in this snapshot matches this table."

/** A query error as a reader can take it: a timeout says so in words. */
export function errorSentence(message: string): string {
    const m = /stopped after (\S+)/.exec(message)
    if (!m) return message
    return `This query took too long on this snapshot and was stopped after ${m[1].replace(/s$/, " seconds")}. A large codebase can need more time than a report allows; run it again, or narrow it in the Cell pane.`
}

/** Runs one cell on the kernel snapshot. A capture or a slot has nothing to run and comes back as it was. */
export async function runCell(cell: Cell, ctx: RunContext): Promise<Cell> {
    const ranOn: RanOn = { scanId: ctx.scan.id, label: ctx.scan.label, commit: ctx.scan.headCommit, committed: ctx.scan.committed, revision: ctx.scan.revision, at: new Date().toISOString(), ...ctx.context() }
    const spec = cell.spec
    let output: CellOutput
    try {
        if (spec.type === "capture" || spec.type === "slot") return cell
        if (spec.type === "reading") {
            output = { reading: await runReading(spec.reading, spec.params, ctx.readings) }
        } else if (spec.type === "table") {
            const has = await ctx.columns(spec.source)
            const roles = (spec.source === "files" ? has : await ctx.columns("files")).has("role")
            const rows = await ctx.query(tableSql(spec, c => has.has(c), ctx.scan.revision, roles))
            const [count] = await ctx.query(`SELECT count(*) AS n FROM ${spec.source}${tableWhere(spec, c => has.has(c), ctx.scan.revision, roles)}`)
            const shown = spec.columns.filter(c => has.has(c))
            const note = [scopeNote(spec, roles), metricsNote(shown, ctx.define)].filter(Boolean).join(" ")
            output = { table: { ...tableOf(rows, ["name", ...shown], ctx.label, Number(count?.n) || rows.length), ...(note ? { note } : {}) } }
        } else if (spec.type === "sql") {
            const r = await ctx.console(spec.sql)
            const rows = r.rows.slice(0, Math.max(1, spec.limit)).map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))
            // A metric column reads by its name, and the note under the table defines it.
            const note = metricsNote(r.columns, ctx.define)
            output = { table: { ...tableOf(rows, r.columns, c => ctx.define?.(c)?.name || headerCase(c), r.truncated ? -1 : r.rows.length), ...(note ? { note } : {}) } }
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
        output = { error: errorSentence(e instanceof Error ? e.message : String(e)) }
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

/**
 * The parent path every name in a column starts with, ending at a separator
 * ("org.broadleafcommerce.", "src/Sylius/Bundle/"), when there is one worth
 * saying once: at least two names, every one longer than it, and 6
 * characters or more. Names with spaces (sentences, import chains) never share one.
 */
export function sharedParent(values: string[]): string {
    const names = values.filter(v => v && v !== "—")
    if (names.length < 2 || names.some(v => /\s/.test(v))) return ""
    let prefix = names[0]
    for (const v of names) {
        let i = 0
        while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++
        prefix = prefix.slice(0, i)
    }
    // Cut back to the last separator, and keep a part of every name after it.
    const cut = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"))
    prefix = cut >= 0 ? prefix.slice(0, cut + 1) : ""
    if (prefix.length < 6 || names.some(v => v.length <= prefix.length)) return ""
    return prefix
}

/** The root folder's component "." reads "(root)", alone or in an import chain (". -> binding"). */
function rootNamed(v: unknown): string {
    if (v === ".") return "(root)"
    // A list the query joined without spaces ("ProductDaoImpl,OrderDaoImpl") gets them, so it wraps between names.
    if (typeof v === "string" && /[A-Za-z_)\]],[A-Za-z_]/.test(v)) return v.replace(/([A-Za-z_)\]]),(?=[A-Za-z_])/g, "$1, ")
    const s = fmtValue(v)
    return typeof v === "string" && /->|→/.test(s) ? s.replace(/(^|(?:->|→)\s*)\.(?=\s*(?:->|→)|$)/g, "$1(root)") : s
}

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
    return [workspace, `snapshot ${r.label}`, r.commit ? `commit ${r.commit.slice(0, 7)}${r.committed ? ` of ${r.committed}` : ""}` : "", `analysis r${r.revision}`, r.lens ? `lens ${r.lens}` : "", r.scope ? `scope ${r.scope}` : "", r.role && r.role !== "all" ? `${r.role} files` : ""].filter(Boolean).join(" · ")
}

/** The rows a cell shows: a pin as metric, pinned and now; a table as it is. */
export function displayTable(cell: Cell, label: (id: string) => string): { columns: string[]; align: string[]; rows: string[][]; full?: string[][] } | null {
    const o = cell.output
    if (!o) return null
    if (o.table) {
        const full = o.table.rows.map(r => o.table!.columns.map(c => rootNamed(r[c.id])))
        const columns = o.table.columns.map(c => c.label)
        const rows = full.map(r => [...r])
        // A parent every name in a column shares is said once, in the header.
        o.table.columns.forEach((c, j) => {
            if (c.numeric) return
            const parent = sharedParent(full.map(r => r[j]))
            if (!parent) return
            columns[j] = `${c.label} (all in ${parent.replace(/[./\\]$/, "")})`
            for (const r of rows) r[j] = r[j].slice(parent.length)
        })
        return { columns, align: o.table.columns.map(c => (c.numeric ? "r" : "")), rows, full }
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

/**
 * The blocks as they print, and the slots left out. An unfilled slot is left
 * out, and so is the paragraph that explains it (marked `beforeSlot`); a
 * reading that is an instruction to the writer never prints. Figures and
 * tables are numbered over what prints, so the numbers have no gaps.
 */
export function printedBlocks(blocks: Block[]): { blocks: Block[]; left: CellBlock[] } {
    const isOpenSlot = (b: Block | undefined) => !!b && isCell(b) && b.cell.spec.type === "slot"
    const left: CellBlock[] = []
    const out: Block[] = []
    blocks.forEach((b, i) => {
        if (isCell(b)) {
            if (b.cell.spec.type === "slot") { left.push(b); return }
            if (b.cell.output?.reading?.instruction) return
            out.push(b)
            return
        }
        if (b.beforeSlot) {
            // The block it explains is the next one that is not another explanation.
            let j = i + 1
            while (j < blocks.length && !isCell(blocks[j]) && (blocks[j] as TextBlock).beforeSlot) j++
            if (isOpenSlot(blocks[j])) return
        }
        out.push(b)
    })
    return { blocks: out, left }
}

/** "Not included: Table 3, Dependency matrix (from Connections)." or "". */
export function notIncludedLine(left: CellBlock[]): string {
    if (!left.length) return ""
    const items = left.map(b => {
        const s = b.cell.spec as Extract<CellSpec, { type: "slot" }>
        return `${b.cell.title || (s.kind === "figure" ? "a figure" : "a table")} (${s.kind}, from ${s.view})`
    })
    return `Not included: ${items.join("; ")}. The template asked for ${left.length === 1 ? "it" : "them"}, and ${left.length === 1 ? "it was" : "they were"} not added from ${left.length === 1 ? "its view" : "their views"}.`
}

/** "22 of 170 rows." when a table holds fewer rows than it found. */
function rowsNote(cell: Cell): string {
    const t = cell.output?.table
    if (!t) return ""
    const of = t.total < 0 ? `The first ${t.rows.length.toLocaleString("en-US")} rows; the query returned more.` : t.total > t.rows.length ? `${t.rows.length.toLocaleString("en-US")} of ${t.total.toLocaleString("en-US")} rows.` : ""
    return [of, t.note ?? ""].filter(Boolean).join(" ")
}

export function cellTitle(cell: Cell): string {
    return cell.title || cell.output?.pin?.title || ""
}

/**
 * The report as Markdown for reading elsewhere: cells written out as their
 * tables and figures, with numbering, captions and provenance.
 */
export function exportMarkdown(title: string, meta: string[], all: Block[], opts: { workspace: string; label: (id: string) => string; figureFile: (cellId: string) => string | null }): string {
    const { blocks, left } = printedBlocks(all)
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
        if (t && !t.rows.length && c.output?.table) out.push(EMPTY_TABLE, "")
        else if (t) {
            out.push(`| ${t.columns.join(" | ")} |`, `|${t.align.map(a => (a === "r" ? " ---: " : " --- ")).join("|")}|`)
            for (const r of t.rows) out.push(`| ${r.map(x => x.replace(/\|/g, "\\|")).join(" | ")} |`)
            out.push("")
        }
        if (c.output?.pin?.note) out.push(c.output.pin.note, "")
        if (c.output?.error) out.push(`> ${c.output.error}`, "")
        const note = rowsNote(c)
        if (c.caption || note) out.push(`_${[note, c.caption].filter(Boolean).join(" ")}_`, "")
        out.push(`<sub>${provenanceLine(c.ranOn, opts.workspace)}</sub>`)
    })
    const missing = notIncludedLine(left)
    if (missing) out.push("", `_${missing}_`)
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"
}

// The PDF document the Go renderer lays out (app/report/pdf.go).
export interface PdfRun { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean; link?: string }
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
    /** "soft": a template's explanation, set a shade lighter than the findings. */
    tone?: "soft"
}

const pdfRuns = (text: string): PdfRun[] => inlineRuns(text).map(r => ({ text: r.text, bold: r.bold, italic: r.italic, code: r.code, strike: r.strike, link: r.link && /^https?:/.test(r.link) ? r.link : undefined }))

/** The report flattened for the PDF renderer; figures come as base64 PNG by cell id. */
export function pdfBlocks(all: Block[], opts: { workspace: string; label: (id: string) => string; figure: (cellId: string) => string | null }): PdfBlock[] {
    const { blocks, left } = printedBlocks(all)
    const numbers = cellNumbers(blocks)
    const out: PdfBlock[] = []
    for (const b of blocks) {
        if (isCell(b)) {
            const c = b.cell
            // A computed paragraph prints as prose; an unfilled slot is left out.
            if (c.spec.type === "slot") continue
            if (c.spec.type === "reading") {
                if (c.output?.reading) for (const r of readingBlocks(c.output.reading.text)) out.push(r.kind === "ul" ? { kind: "ul", items: r.items.map(pdfRuns) } : { kind: "p", runs: pdfRuns(r.text) })
                continue
            }
            const title = [numbers.get(b.id), cellTitle(c)].filter(Boolean).join(". ")
            const caption = [rowsNote(c), c.output?.pin?.note, c.caption, c.output?.error].filter(Boolean).join(" ")
            const provenance = provenanceLine(c.ranOn, opts.workspace)
            const img = opts.figure(b.id)
            const shown = displayTable(c, opts.label)
            // A query that matched nothing prints its title and a sentence, not an empty grid of headers.
            if (shown && !shown.rows.length && c.output?.table) { out.push({ kind: "p", runs: [{ text: title, bold: true }, { text: ` ${EMPTY_TABLE}` }] }); continue }
            const t = shown
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
        out.push({ kind: b.kind, runs: pdfRuns(b.text), ...(b.kind === "p" && b.explain ? { tone: "soft" } : {}) })
    }
    const missing = notIncludedLine(left)
    if (missing) out.push({ kind: "p", runs: [{ text: missing, italic: true }], tone: "soft" })
    return out
}

/** Real author names a text mentions: with pseudonyms on, a report that names one does not leave the app. */
export function namesIn(text: string, names: string[]): string[] {
    const lower = text.toLowerCase()
    return names.filter(n => n.length > 2 && lower.includes(n.toLowerCase()))
}
