// Tables as they leave the app: every row in scope (never the page on screen),
// headed by metric ids in CSV so a spreadsheet can join on them, and by metric
// names in Markdown so a report reads. Both carry where the numbers came from.

export interface ExportColumn {
    /** The key in each row, and the CSV header: the metric id. */
    id: string
    /** The Markdown header: the metric's name. */
    label: string
}

export type ExportRow = Record<string, unknown>

/** Markdown tables past this many rows ask first: they stop being readable. */
export const MARKDOWN_ROW_WARNING = 1000

function cellText(v: unknown): string {
    if (v === null || v === undefined) return ""
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
    if (typeof v === "boolean") return v ? "true" : "false"
    if (Array.isArray(v)) return v.map(cellText).join("; ")
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
}

function csvCell(v: unknown): string {
    const s = cellText(v)
    return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV with a provenance preamble of `# key: value` lines. Most readers skip
 * them with a comment option; the values never start a data row.
 */
export function toCsv(columns: ExportColumn[], rows: ExportRow[], preamble: Array<[string, string]> = []): string {
    const lines: string[] = preamble.map(([k, v]) => `# ${k}: ${v.replace(/[\r\n]+/g, " ")}`)
    lines.push(columns.map(c => csvCell(c.id)).join(","))
    for (const r of rows) lines.push(columns.map(c => csvCell(r[c.id])).join(","))
    return lines.join("\n") + "\n"
}

function mdCell(v: unknown): string {
    return cellText(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ")
}

function isNumericColumn(rows: ExportRow[], id: string): boolean {
    let seen = false
    for (const r of rows) {
        const v = r[id]
        if (v === null || v === undefined || v === "") continue
        if (typeof v !== "number") return false
        seen = true
    }
    return seen
}

/** Formats a number the way the tables read: grouped, at most two decimals. */
export function formatExportNumber(v: number): string {
    if (!Number.isFinite(v)) return ""
    return v.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 })
}

/** A GitHub-flavoured table with numbers right-aligned, then the caption in italics. */
export function toMarkdownTable(columns: ExportColumn[], rows: ExportRow[], caption = ""): string {
    const numeric = columns.map(c => isNumericColumn(rows, c.id))
    const head = `| ${columns.map(c => mdCell(c.label)).join(" | ")} |`
    const rule = `|${numeric.map(n => (n ? " ---: " : " --- ")).join("|")}|`
    const body = rows.map(r => `| ${columns.map((c, i) => {
        const v = r[c.id]
        return numeric[i] && typeof v === "number" ? formatExportNumber(v) : mdCell(v)
    }).join(" | ")} |`)
    const out = [head, rule, ...body].join("\n")
    return caption ? `${out}\n\n_${caption.replace(/_/g, "\\_")}_\n` : `${out}\n`
}

/** A file name from a title: lower case, dashes, no path characters, dated. */
export function exportFileName(title: string, ext: string, date = new Date()): string {
    const slug = title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export"
    const d = date.toISOString().slice(0, 10)
    return `${slug}-${d}.${ext}`
}
