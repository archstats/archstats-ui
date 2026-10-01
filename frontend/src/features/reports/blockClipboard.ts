// Blocks on the clipboard. Inside the app a copy keeps every block as it is,
// cells with their output and figures, so a section moves from one report to
// another whole. Other apps get what a reader would: Markdown with the
// findings, tables and figure titles, and HTML with the figures themselves.

import { cellNumbers, cellKind, inlineHtml, isCell, newId, tableCells, type Block } from "./reportDoc"
import { cellTitle, displayTable, printedBlocks, readableMarkdown } from "./reportCells"

export const BLOCKS_TYPE = "application/x-archstats-blocks"

export interface ClipboardContext {
    workspace: string
    label: (id: string) => string
    /** A figure path as a data: URL, when it is loaded. */
    figure: (path: string) => string | null
}

/**
 * The blocks last copied, with the text they went out as. WebKit can drop a
 * custom type on the way back in; a paste of the very same text then still
 * brings the cells.
 */
let last: { text: string; json: string } | null = null

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Blocks as HTML a word processor takes: prose, numbered tables, figures as images. */
export function blocksHtml(all: Block[], ctx: ClipboardContext): string {
    const { blocks } = printedBlocks(all)
    const numbers = cellNumbers(blocks)
    const out: string[] = []
    let list: "ul" | "ol" | null = null
    const close = () => { if (list) { out.push(`</${list}>`); list = null } }
    for (const b of blocks) {
        if (!isCell(b)) {
            if (b.kind === "ul" || b.kind === "ol") {
                if (list !== b.kind) { close(); out.push(`<${b.kind}>`); list = b.kind }
                out.push(`<li>${inlineHtml(b.text)}</li>`)
                continue
            }
            close()
            if (!b.text.trim() && b.kind !== "hr") continue
            switch (b.kind) {
                case "h1": case "h2": case "h3": out.push(`<${b.kind}>${inlineHtml(b.text)}</${b.kind}>`); break
                case "quote": out.push(`<blockquote>${b.text.split("\n").map(inlineHtml).join("<br>")}</blockquote>`); break
                case "code": out.push(`<pre><code>${esc(b.text)}</code></pre>`); break
                case "hr": out.push("<hr>"); break
                case "table": {
                    const [head, ...rows] = tableCells(b.text)
                    if (head) out.push(`<table><thead><tr>${head.map(c => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`)
                    break
                }
                default: out.push(`<p>${b.text.split("\n").map(inlineHtml).join("<br>")}</p>`)
            }
            continue
        }
        close()
        const c = b.cell
        if (c.spec.type === "slot") continue
        if (c.output?.reading) {
            for (const para of c.output.reading.text.split(/\n\s*\n/)) {
                const items = para.split("\n").filter(l => /^\s*[-*]\s+/.test(l))
                if (items.length && items.length === para.split("\n").filter(Boolean).length) out.push(`<ul>${items.map(l => `<li>${inlineHtml(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`)
                else out.push(`<p>${inlineHtml(para.replace(/\n/g, " "))}</p>`)
            }
            continue
        }
        const head = [numbers.get(b.id), cellTitle(c)].filter(Boolean).join(". ")
        if (head) out.push(`<p><strong>${esc(head)}</strong></p>`)
        const src = c.output?.figure ? ctx.figure(c.output.figure) : null
        if (src && cellKind(c) === "figure") out.push(`<p><img src="${src}" alt="${esc(cellTitle(c) || head)}" style="max-width:100%"></p>`)
        const t = displayTable(c, ctx.label)
        if (t && t.rows.length) {
            out.push(`<table><thead><tr>${t.columns.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((x, i) => `<td${t.align[i] === "r" ? ' style="text-align:right"' : ""}>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`)
        }
        if (c.caption) out.push(`<p><em>${esc(c.caption)}</em></p>`)
    }
    close()
    return out.join("\n")
}

/** Writes blocks to a copy or cut event's clipboard. */
export function writeBlocks(data: DataTransfer, blocks: Block[], ctx: ClipboardContext): void {
    const json = JSON.stringify(blocks)
    const text = readableMarkdown(blocks, { workspace: ctx.workspace, label: ctx.label, figureFile: () => null }).trim()
    data.setData("text/plain", text)
    data.setData("text/html", blocksHtml(blocks, ctx))
    data.setData(BLOCKS_TYPE, json)
    last = { text, json }
}

/** Blocks copied in the app, with fresh ids; null when the clipboard holds anything else. */
export function readBlocks(data: DataTransfer | null): Block[] | null {
    if (!data) return null
    let json = data.getData(BLOCKS_TYPE)
    if (!json && last && data.getData("text/plain").trim() === last.text) json = last.json
    if (!json) return null
    try {
        const blocks = JSON.parse(json) as Block[]
        if (!Array.isArray(blocks) || !blocks.length) return null
        return freshIds(blocks)
    } catch { return null }
}

/** The same blocks under new ids, so a second paste never shares an id with the first. */
export function freshIds(blocks: Block[]): Block[] {
    return blocks.map(b => ({ ...JSON.parse(JSON.stringify(b)), id: newId() }))
}
