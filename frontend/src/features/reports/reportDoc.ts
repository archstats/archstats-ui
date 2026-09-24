// A report is a notebook: a column of blocks, prose and evidence cells.
// Prose is Markdown, one block per paragraph, heading, list item, quote or
// code fence; a cell is evidence frozen at the run that produced it. The
// whole document round-trips through Markdown: a cell is written as a fenced
// `archstats` block holding its spec, so the raw view shows it, moves it and
// deletes it like any other text, and its output is reattached by id.

export type TextKind = "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote" | "code" | "hr" | "table"

/**
 * A prose block. A prompt is what a template asks the writer to say there:
 * shown in place of the empty text, never printed.
 */
export interface TextBlock { id: string; kind: TextKind; text: string; lang?: string; prompt?: string }

export type TableSource = "components" | "files"

export type CellSpec =
    | { type: "pin"; pinId: string }
    | { type: "table"; source: TableSource; columns: string[]; sort: string; desc: boolean; limit: number; scope?: string }
    | { type: "sql"; sql: string; limit: number }
    /** Captured from a view as it was on screen: kept, not re-run here. */
    | { type: "capture"; kind: "table" | "figure"; route: string; view: string }
    /** Facts written out as a paragraph: computed on the snapshot, re-run like any cell. */
    | { type: "reading"; reading: string; params?: Record<string, string> }
    /** A figure or table a template asks for: which view, set how; filled by adding from that view. */
    | { type: "slot"; kind: "table" | "figure"; route: string; view: string; hint: string }

export interface TableOutput {
    columns: Array<{ id: string; label: string; numeric: boolean }>
    rows: Array<Record<string, unknown>>
    /** Rows the query had before the limit, when known. */
    total: number
}

export interface PinOutput {
    title: string
    kind: string
    note: string
    values: Record<string, number>
    now: Record<string, number> | null
    status: string
    route: string
}

export interface CellOutput {
    table?: TableOutput
    /** An evidence figure path (PNG), for captured figures. */
    figure?: string
    pin?: PinOutput
    reading?: ReadingOutput
    error?: string
}

/** A computed paragraph: Markdown text, and the numbers in it, to say what moved. */
export interface ReadingOutput {
    text: string
    values: Record<string, number>
    /** The snapshot lacks what the reading counts; the text says what. */
    absent?: boolean
}

/** What a cell ran on: the provenance a reader needs to trust it. */
export interface RanOn {
    scanId: string
    /** "22 Sep 2026, 12:00". */
    label: string
    commit: string
    revision: number
    at: string
    lens?: string
    scope?: string
    role?: string
}

export interface Cell {
    spec: CellSpec
    title: string
    caption: string
    output: CellOutput | null
    ranOn: RanOn | null
    /** The output before the latest run, kept for the session to say what changed. */
    previous?: CellOutput | null
}

export interface CellBlock { id: string; kind: "cell"; cell: Cell }

export type Block = TextBlock | CellBlock

export interface ReportDoc {
    version: 1
    blocks: Block[]
    /** Which snapshot cells run on: the newest complete one, or a fixed scan. */
    kernel: "newest" | string
}

export const isCell = (b: Block): b is CellBlock => b.kind === "cell"

/** Whether a cell runs on the snapshot; a capture keeps what a view showed, a slot waits to be filled. */
export const runnable = (spec: CellSpec) => spec.type !== "capture" && spec.type !== "slot"

let counter = 0
export function newId(): string {
    counter = (counter + 1) % 1e6
    return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function emptyDoc(): ReportDoc {
    return { version: 1, blocks: [{ id: newId(), kind: "p", text: "" }], kernel: "newest" }
}

export function parseDoc(body: string | null | undefined): ReportDoc {
    try {
        const d = JSON.parse(body || "{}")
        if (d && Array.isArray(d.blocks) && d.blocks.length) return { version: 1, blocks: d.blocks, kernel: d.kernel || "newest" }
    } catch { /* an unreadable body starts empty rather than failing the page */ }
    return emptyDoc()
}

// ── Markdown ──────────────────────────────────────────────────────────────

const LIST_KINDS = new Set<TextKind>(["ul", "ol"])

/** One block as Markdown. */
export function blockMarkdown(b: Block, n = 1): string {
    if (isCell(b)) {
        const { spec, title, caption } = b.cell
        return "```archstats\n" + JSON.stringify({ id: b.id, spec, title, caption }) + "\n```"
    }
    switch (b.kind) {
        case "h1": return `# ${b.text}`
        case "h2": return `## ${b.text}`
        case "h3": return `### ${b.text}`
        case "ul": return `- ${b.text}`
        case "ol": return `${n}. ${b.text}`
        case "quote": return b.text.split("\n").map(l => `> ${l}`).join("\n")
        case "code": return "```" + (b.lang ?? "") + "\n" + b.text + "\n```"
        case "hr": return "---"
        default: return !b.text && b.prompt ? `<!-- prompt: ${b.prompt.replace(/--/g, "–").replace(/\n/g, " ")} -->` : b.text
    }
}

/** The document as Markdown, cells as fenced archstats blocks. */
export function toMarkdown(blocks: Block[]): string {
    const out: string[] = []
    let n = 0
    blocks.forEach((b, i) => {
        const prev = blocks[i - 1]
        n = b.kind === "ol" ? (prev?.kind === "ol" ? n + 1 : 1) : 0
        // List items of one list sit on consecutive lines; everything else is a paragraph apart.
        if (i > 0) out.push(prev && prev.kind === b.kind && LIST_KINDS.has(b.kind as TextKind) ? "\n" : "\n\n")
        out.push(blockMarkdown(b, n))
    })
    return out.join("") + "\n"
}

/**
 * Markdown back into blocks. Cells come back from their fenced spec, with
 * the output of the cell that had the same id.
 */
export function fromMarkdown(md: string, cells: Map<string, Cell> = new Map()): Block[] {
    const lines = md.replace(/\r\n?/g, "\n").split("\n")
    const out: Block[] = []
    let para: string[] = []
    const flush = () => {
        if (para.length) out.push({ id: newId(), kind: "p", text: para.join("\n") })
        para = []
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const fence = /^```\s*([\w-]*)\s*$/.exec(line)
        if (fence) {
            flush()
            const body: string[] = []
            i++
            while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
            if (fence[1] === "archstats") {
                try {
                    const d = JSON.parse(body.join("\n"))
                    const id = typeof d.id === "string" && d.id ? d.id : newId()
                    const old = cells.get(id)
                    const same = old && JSON.stringify(old.spec) === JSON.stringify(d.spec)
                    out.push({ id, kind: "cell", cell: { spec: d.spec, title: String(d.title ?? ""), caption: String(d.caption ?? ""), output: same ? old!.output : null, ranOn: same ? old!.ranOn : null } })
                    continue
                } catch { /* an unreadable cell stays visible as code */ }
            }
            out.push({ id: newId(), kind: "code", text: body.join("\n"), lang: fence[1] || undefined })
            continue
        }
        if (!line.trim()) { flush(); continue }
        let m: RegExpExecArray | null
        if ((m = /^<!--\s*prompt:\s*(.*?)\s*-->\s*$/.exec(line))) {
            flush()
            out.push({ id: newId(), kind: "p", text: "", prompt: m[1] })
            continue
        }
        if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
            flush()
            const level = Math.min(3, m[1].length)
            out.push({ id: newId(), kind: (`h${level}`) as TextKind, text: m[2].trim() })
        } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
            flush()
            out.push({ id: newId(), kind: "hr", text: "" })
        } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
            flush()
            out.push({ id: newId(), kind: "ul", text: m[1] })
        } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
            flush()
            out.push({ id: newId(), kind: "ol", text: m[1] })
        } else if (/^>\s?/.test(line)) {
            flush()
            const q: string[] = []
            while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""))
            i--
            out.push({ id: newId(), kind: "quote", text: q.join("\n") })
        } else if (/^\s*\|.*\|\s*$/.test(line)) {
            flush()
            const t: string[] = []
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t.push(lines[i++].trim())
            i--
            out.push({ id: newId(), kind: "table", text: t.join("\n") })
        } else {
            para.push(line)
        }
    }
    flush()
    return out
}

/**
 * The shortcut a paragraph's opening characters stand for, as in Typora:
 * "## " becomes a heading, "- " a list item. Null when nothing matches.
 */
export function shortcutFor(text: string): { kind: TextKind; text: string; lang?: string } | null {
    let m: RegExpExecArray | null
    if ((m = /^(#{1,3}) (.*)$/s.exec(text))) return { kind: (`h${m[1].length}`) as TextKind, text: m[2] }
    if ((m = /^[-*+] (.*)$/s.exec(text))) return { kind: "ul", text: m[1] }
    if ((m = /^1[.)] (.*)$/s.exec(text))) return { kind: "ol", text: m[1] }
    if ((m = /^> (.*)$/s.exec(text))) return { kind: "quote", text: m[1] }
    if ((m = /^```([\w-]*)$/.exec(text))) return { kind: "code", text: "", lang: m[1] || undefined }
    if (/^(---|\*\*\*)$/.test(text)) return { kind: "hr", text: "" }
    return null
}

// ── Inline Markdown ───────────────────────────────────────────────────────

export interface Run { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean; link?: string }

/**
 * Inline Markdown into styled runs: `code`, **bold**, *italic* or _italic_,
 * ~~strike~~, [text](url). Unclosed markers stay as the characters typed.
 */
export function inlineRuns(src: string): Run[] {
    const out: Run[] = []
    const push = (r: Run) => {
        if (!r.text) return
        const last = out[out.length - 1]
        if (last && !last.code && !r.code && !!last.bold === !!r.bold && !!last.italic === !!r.italic && !!last.strike === !!r.strike && last.link === r.link) last.text += r.text
        else out.push(r)
    }
    const walk = (s: string, style: Omit<Run, "text">) => {
        let i = 0
        let plain = ""
        const emit = () => { if (plain) push({ ...style, text: plain }); plain = "" }
        while (i < s.length) {
            const rest = s.slice(i)
            let m: RegExpExecArray | null
            if (rest[0] === "\\" && rest.length > 1 && /[\\`*_[\]()~#>-]/.test(rest[1])) { plain += rest[1]; i += 2; continue }
            if ((m = /^`([^`]+)`/.exec(rest))) { emit(); push({ ...style, code: true, text: m[1] }); i += m[0].length; continue }
            if ((m = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest))) { emit(); walk(m[1], { ...style, link: m[2] }); i += m[0].length; continue }
            const em = emphasis(s, i)
            if (em) {
                emit()
                walk(s.slice(i + em.marker.length, em.close), { ...style, ...(em.marker === "~~" ? { strike: true } : em.marker.length === 2 ? { bold: true } : { italic: true }) })
                i = em.close + em.marker.length
                continue
            }
            plain += rest[0]
            i++
        }
        emit()
    }
    walk(src.replace(/\n/g, " "), {})
    return out
}

const WORD = /[\p{L}\p{N}]/u

/**
 * An emphasis span opening at i: its marker and where it closes. Underscores
 * never open or close inside a word (git__commits__total stays a name), and
 * a closing marker is taken only where the markers inside are balanced, so
 * **b *c*** reads as bold around an italic.
 */
function emphasis(s: string, i: number): { marker: string; close: number } | null {
    const two = s.slice(i, i + 2)
    const marker = two === "**" || two === "__" || two === "~~" ? two : s[i] === "*" || s[i] === "_" ? s[i] : null
    if (!marker || /\s/.test(s[i + marker.length] ?? " ")) return null
    const under = marker[0] === "_"
    if (under && WORD.test(s[i - 1] ?? "")) return null
    for (let j = i + marker.length + 1; j <= s.length - marker.length; j++) {
        if (s.slice(j, j + marker.length) !== marker) continue
        if (/\s/.test(s[j - 1])) continue
        if (under && WORD.test(s[j + marker.length] ?? "")) continue
        // A single marker must not be the first half of a double one.
        if (marker.length === 1 && s[j + 1] === marker && s[j - 1] !== marker && balancedSingles(s.slice(i + 1, j), marker)) {
            // "*a **b** c*": skip the inner double marker.
            if (s[j + 2] !== marker) { j++; continue }
        }
        if (!balancedSingles(s.slice(i + marker.length, j), marker[0] === "~" ? "*" : marker[0] === "*" ? "*" : "_")) continue
        return { marker, close: j }
    }
    return null
}

/** Whether the lone markers inside a span pair up (doubles count as a pair). */
function balancedSingles(inner: string, ch: string): boolean {
    let n = 0
    for (let k = 0; k < inner.length; k++) {
        if (inner[k] !== ch) continue
        if (inner[k + 1] === ch) { k++; continue }
        n++
    }
    return n % 2 === 0
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A link target that is safe to put in href: http(s), mailto, or an in-app route. */
export function safeHref(url: string): string | null {
    if (/^(https?:|mailto:)/i.test(url)) return url
    if (url.startsWith("/") || url.startsWith("#/")) return url.startsWith("#") ? url : `#${url}`
    return null
}

/** Inline Markdown as HTML, escaped; the only markup is what the runs say. */
export function inlineHtml(src: string): string {
    return inlineRuns(src).map(r => {
        let h = esc(r.text)
        if (r.code) return `<code>${h}</code>`
        if (r.strike) h = `<s>${h}</s>`
        if (r.italic) h = `<em>${h}</em>`
        if (r.bold) h = `<strong>${h}</strong>`
        if (r.link) {
            const href = safeHref(r.link)
            h = href ? `<a href="${esc(href)}" data-href="${esc(r.link)}">${h}</a>` : h
        }
        return h
    }).join("")
}

/** A Markdown table's rows of cells; the separator row is dropped. */
export function tableCells(text: string): string[][] {
    return text.split("\n")
        .map(l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()))
        .filter(r => !r.every(c => /^:?-+:?$/.test(c)))
}

// ── Numbering and outline ─────────────────────────────────────────────────

/** "Figure 2", "Table 3": numbered in reading order, each kind on its own count. */
export function cellNumbers(blocks: Block[]): Map<string, string> {
    const out = new Map<string, string>()
    let fig = 0, tab = 0
    for (const b of blocks) {
        if (!isCell(b)) continue
        const kind = cellKind(b.cell)
        if (kind === "reading") continue
        if (kind === "figure") out.set(b.id, `Figure ${++fig}`)
        else out.set(b.id, `Table ${++tab}`)
    }
    return out
}

export function cellKind(c: Cell): "figure" | "table" | "pin" | "reading" {
    if (c.spec.type === "reading") return "reading"
    if ((c.spec.type === "capture" || c.spec.type === "slot") && c.spec.kind === "figure") return "figure"
    if (c.spec.type === "pin") return c.output?.pin && c.output.figure ? "figure" : "pin"
    return "table"
}

export function plainText(src: string): string {
    return inlineRuns(src).map(r => r.text).join("")
}
