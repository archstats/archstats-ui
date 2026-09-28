// The report as the web view prints it. The editor's page and the PDF are one
// setting of type: prose, headings and lists carry the editor's classes
// (index.css, "The report page"), and the web view's own print layout breaks
// the pages. Figures and tables print as figures, without the editor's cards.
import { CanPrintPDF, PrintPDF } from "wailsjs/go/app/EvidenceService"
import { runsHtml } from "./reportDoc"
import type { PdfBlock, PdfRun } from "./reportCells"

export interface PrintDoc { title: string; meta: string[]; blocks: PdfBlock[] }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const runs = (rs: PdfRun[] | undefined) => runsHtml(rs ?? [])

/** A path or dotted name: set in mono, broken anywhere rather than cut. */
function identifier(v: string): boolean {
    return v.length > 24 && !v.includes(" ") && /[./\\]/.test(v)
}

/** Wide tables set smaller, so every column stays on the page. */
function tableSize(cols: number): string {
    return cols >= 9 ? "doc-data-xs" : cols >= 7 ? "doc-data-sm" : ""
}

function tableHtml(t: NonNullable<PdfBlock["table"]>, cls: string): string {
    const right = (i: number) => t.align[i] === "r"
    const head = t.columns.map((c, i) => {
        // "Package (all in org.example)": the label, and the parent every row shares.
        const m = /^(.*) \(all in (.+)\)$/.exec(c)
        const label = m ? `${esc(m[1])} <span class="doc-data-all">all in ${esc(m[2])}</span>` : esc(c)
        return `<th class="${right(i) ? "doc-r" : ""}">${label}</th>`
    }).join("")
    const body = t.rows.map(r => `<tr>${r.map((v, j) => {
        const cls = right(j) ? "doc-r doc-num" : j === 0 || identifier(v) ? "doc-ident" : ""
        return `<td class="${cls}">${esc(v)}</td>`
    }).join("")}</tr>`).join("")
    return `<table${cls ? ` class="${cls}"` : ""}><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function evidenceHtml(b: PdfBlock, inner: string): string {
    const title = b.title ? `<p class="doc-fig-title">${esc(b.title)}</p>` : ""
    const caption = b.caption ? `<p class="doc-caption">${esc(b.caption)}</p>` : ""
    const provenance = b.provenance ? `<p class="doc-provenance">${esc(b.provenance)}</p>` : ""
    return `<figure class="doc-figure doc-figure-${b.kind}">${title}${inner}${caption}${provenance}</figure>`
}

/** The printed page's HTML: the head, then every block in reading order. */
export function printHtml(doc: PrintDoc): string {
    const out: string[] = [
        `<header class="doc-head"><h1 class="doc-title">${esc(doc.title)}</h1><div class="doc-rule"></div>`,
        ...doc.meta.map(m => `<p class="doc-meta">${esc(m)}</p>`),
        `</header><div class="doc-body nb-rendered">`,
    ]
    for (const b of doc.blocks) {
        switch (b.kind) {
            case "h1": case "h2": case "h3":
                out.push(`<${b.kind} class="nb-${b.kind}">${runs(b.runs)}</${b.kind}>`)
                break
            case "p":
                out.push(`<p class="nb-p doc-prose${b.tone === "soft" ? " nb-explain" : ""}">${runs(b.runs)}</p>`)
                break
            case "quote":
                out.push(`<blockquote class="nb-quote doc-prose">${runs(b.runs)}</blockquote>`)
                break
            case "ul": case "ol": {
                const start = b.start ?? 1
                const items = (b.items ?? []).map((item, i) => `<li class="nb-li nb-${b.kind} doc-prose"><span class="nb-marker">${b.kind === "ol" ? `${start + i}.` : "•"}</span>${runs(item)}</li>`)
                out.push(`<${b.kind} class="doc-list">${items.join("")}</${b.kind}>`)
                break
            }
            case "code":
                out.push(`<div class="nb-code"><pre><code>${esc(b.code ?? "")}</code></pre></div>`)
                break
            case "hr":
                out.push(`<hr class="doc-hr">`)
                break
            case "table":
                if (!b.table) break
                // A table written in the text reads as the editor sets it; one from a cell prints as a figure.
                if (!b.title && !b.provenance && !b.caption) out.push(`<div class="nb-table">${tableHtml(b.table, "")}</div>`)
                else out.push(evidenceHtml(b, tableHtml(b.table, `doc-data ${tableSize(b.table.columns.length)}`)))
                break
            case "image":
                if (b.image) out.push(evidenceHtml(b, `<img class="doc-img" src="data:image/png;base64,${b.image}" alt="${esc(b.title ?? "")}">`))
                break
        }
    }
    out.push(`</div>`)
    return out.join("")
}

// Every face the page sets; the print must not start before they are loaded.
const FACES = [
    `12pt "Source Serif 4"`, `italic 12pt "Source Serif 4"`, `600 12pt "Source Serif 4"`, `italic 600 12pt "Source Serif 4"`,
    `400 12pt "Inter"`, `600 12pt "Inter"`, `italic 400 12pt "Inter"`, `12pt "JetBrains Mono"`,
]

let supported: Promise<boolean> | null = null
/** Whether the web view prints here (macOS); elsewhere the PDF is laid out in Go. */
export function canPrint(): Promise<boolean> {
    return (supported ??= CanPrintPDF().catch(() => false))
}

// The page the web view prints on (app/evidence_service.go): the text column and its height, in mm.
const PAGE = { A4: { w: 210, h: 297 }, Letter: { w: 215.9, h: 279.4 } }
const MARGIN = { top: 22, bottom: 24, side: 27 }
const MM = 96 / 25.4

// ── Keeping things together ───────────────────────────────────────────────
// WebKit keeps a list item, a figure or a table row whole, but ignores
// break-after: avoid. So a heading, a sentence leading into a list or figure,
// and a table's title are checked here: the page is measured as it will
// print, WebKit's own breaks are followed, and where such a start would end
// its page without the start of what follows, the page breaks before it.

interface Atom {
    el: HTMLElement
    top: number
    bottom: number
    /** Prose: breaks between lines, two at least on either side. */
    line?: number
    pad?: number
    /** A table row: after a break the header repeats above it. */
    head?: number
    /** Starts something that keeps the start of what follows on its page. */
    keeps?: "heading" | "lead" | "title"
    /** Where a forced break goes: the heading, the sentence, the figure. */
    breakAt?: HTMLElement
}

function atoms(root: HTMLElement): Atom[] {
    const base = root.getBoundingClientRect().top
    const out: Atom[] = []
    const add = (el: HTMLElement, extra: Partial<Atom> = {}) => {
        const r = el.getBoundingClientRect()
        out.push({ el, top: r.top - base, bottom: r.bottom - base, ...extra })
    }
    const rows = (table: HTMLTableElement) => {
        const head = table.tHead?.getBoundingClientRect().height ?? 0
        if (table.tHead) add(table.tHead)
        for (const tr of Array.from(table.tBodies[0]?.rows ?? [])) add(tr, { head })
    }
    const prose = (el: HTMLElement, extra: Partial<Atom> = {}) => {
        const cs = getComputedStyle(el)
        add(el, { line: parseFloat(cs.lineHeight) || 16, pad: parseFloat(cs.paddingTop) || 0, ...extra })
    }
    for (const el of Array.from(root.children) as HTMLElement[]) {
        if (!el.classList.contains("doc-body")) { add(el); continue }
        for (const b of Array.from(el.children) as HTMLElement[]) {
            const next = b.nextElementSibling as HTMLElement | null
            if (/^H[1-3]$/.test(b.tagName)) add(b, { keeps: "heading", breakAt: b })
            else if (b.tagName === "P" || b.tagName === "BLOCKQUOTE") {
                const lead = !!next && (next.classList.contains("doc-list") || next.tagName === "FIGURE" || next.classList.contains("nb-table"))
                prose(b, lead ? { keeps: "lead", breakAt: b } : {})
            } else if (b.classList.contains("doc-list")) for (const li of Array.from(b.children) as HTMLElement[]) add(li)
            else if (b.classList.contains("doc-figure-table")) {
                for (const part of Array.from(b.children) as HTMLElement[]) {
                    if (part.tagName === "TABLE") rows(part as HTMLTableElement)
                    else add(part, part.classList.contains("doc-fig-title") ? { keeps: "title", breakAt: b } : {})
                }
            } else if (b.classList.contains("nb-table")) {
                const t = b.querySelector("table")
                if (t) rows(t)
            } else add(b)
        }
    }
    return out
}

/** How far down the start of what follows atom i reaches: a few lines, a list item, a header and four rows, a whole figure. */
function startEnd(list: Atom[], i: number): number {
    let end = list[i].bottom
    let rows = 0
    for (let j = i + 1; j < list.length; j++) {
        const a = list[j]
        if (a.keeps === "heading" || a.keeps === "title" || a.el.tagName === "THEAD") { end = a.bottom; continue }
        if (a.head !== undefined) { end = a.bottom; if (++rows >= 4) break; continue }
        if (rows) break
        end = a.line ? Math.min(a.bottom, a.top + (a.pad ?? 0) + 3 * a.line) : a.bottom
        break
    }
    return end
}

/** Forces page breaks where a start would be left at the foot of a page; returns the pages it expects. */
export function keepTogether(root: HTMLElement, pageHeight: number): number {
    const list = atoms(root)
    const H = pageHeight
    let shift = 0
    const next = (y: number) => (Math.floor(y / H + 1e-6) + 1) * H
    for (let i = 0; i < list.length; i++) {
        const a = list[i]
        const top = a.top + shift, bottom = a.bottom + shift
        const edge = next(top)
        const atTop = top - (edge - H) < 2
        if (a.keeps && !atTop) {
            const end = startEnd(list, i) + shift
            const room = edge - top
            // A lead-in sentence moves only when that leaves a short gap.
            if (end > edge && end - top < H * 0.9 && (a.keeps !== "lead" || room < H * 0.3)) {
                a.breakAt!.style.breakBefore = "page"
                const at = a.breakAt!.getBoundingClientRect().top - root.getBoundingClientRect().top + shift
                shift += edge - at
                continue
            }
        }
        if (bottom <= edge + 0.5 || atTop) continue
        if (a.line) {
            // Prose breaks between lines, two at least on either side of the break.
            const lines = Math.round((a.bottom - a.top - 2 * (a.pad ?? 0)) / a.line)
            let fit = Math.floor((edge - top - (a.pad ?? 0)) / a.line)
            if (lines - fit < 2) fit = lines - 2
            shift += fit >= 2 ? edge - (top + (a.pad ?? 0) + fit * a.line) : edge - top
        } else if (bottom - top < H) {
            shift += edge - top + (a.head ?? 0)
        }
    }
    const last = list.length ? list[list.length - 1].bottom + shift : 0
    return Math.max(1, Math.ceil(last / H - 1e-6))
}

/**
 * Sets the report out beside the app, hidden on screen and alone in print
 * media, prints the web view and takes the page away again.
 */
export async function printReport(doc: PrintDoc, pageSize: "A4" | "Letter"): Promise<{ pdf: string; pages: number }> {
    document.getElementById("report-print")?.remove()
    const page = PAGE[pageSize]
    const root = document.createElement("div")
    root.id = "report-print"
    root.className = "paper"
    // Laid out at the text column's width, out of sight, so it can be measured before it prints.
    root.style.setProperty("--print-width", `${page.w - 2 * MARGIN.side}mm`)
    root.innerHTML = printHtml(doc)
    document.body.appendChild(root)
    try {
        // Figures were captured at twice their size on screen; they print at that size.
        await Promise.all(Array.from(root.querySelectorAll("img")).map(async img => {
            await img.decode().catch(() => undefined)
            if (img.naturalWidth) img.style.width = `${img.naturalWidth / 2}px`
        }))
        await Promise.all(FACES.map(f => document.fonts.load(f).catch(() => [])))
        await document.fonts.ready
        keepTogether(root, (page.h - MARGIN.top - MARGIN.bottom) * MM)
        const out = await PrintPDF(doc.title, pageSize)
        return { pdf: out.pdf, pages: out.pages }
    } finally {
        root.remove()
    }
}
