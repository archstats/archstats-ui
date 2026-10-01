// Figures as they leave the app: an SVG with its styles inlined (so it looks
// the same outside the app), or a PNG at twice the pixel density, each with a
// footer band holding the legend and the provenance caption. Light by default,
// whatever the app's appearance: a report page is white.

import { t, intlLocale } from "~/shared/i18n"

/** How a legend entry is drawn: the mark the chart itself uses for it. */
export type LegendMark = "swatch" | "dot" | "ring" | "line" | "dashed" | "hatch"

export interface LegendItem {
    label: string
    color: string
    /** A filled square unless the chart draws the thing another way. */
    mark?: LegendMark
    /** A number after the label (files in the lane, pairs in the group). */
    count?: number
    /** A longer explanation, shown on hover in the app. */
    title?: string
}

/** A continuous scale: its colours low to high, with the words at each end. */
export interface LegendRamp {
    label: string
    colors: string[]
    low: string
    high: string
}

/**
 * What a figure's marks mean. Every figure declares one (see useExportables):
 * the app shows it under the figure where it helps, and every export carries
 * it, because a picture pasted into a report has no view around it to explain
 * the colours. Notes say what size, width or position encode, in a sentence.
 */
export interface FigureLegend {
    items?: LegendItem[]
    ramps?: LegendRamp[]
    notes?: string[]
}

export const isEmptyLegend = (l: FigureLegend | null | undefined) => !l || (!l.items?.length && !l.ramps?.length && !l.notes?.length)

/** What a chart hands over when asked for its figure. */
export type FigureOutput =
    /** `light`: drawn in the light appearance already, so its colours are not remapped. */
    /** `filled`: tiles of data colour cover the chart, so its most common colour says nothing about the ground. */
    | { kind: "svg"; svg: SVGSVGElement; width: number; height: number; light?: boolean; filled?: boolean }
    | { kind: "canvas"; canvas: HTMLCanvasElement; width: number; height: number; scale: number }

export interface FigureOptions {
    /** Render in the light appearance even when the app is dark. */
    light: boolean
}

/** How a figure leaves the app: the appearance, and the legend drawn under it (none when left out). */
export interface ExportOptions extends FigureOptions {
    legend?: FigureLegend | null
}

// ── Appearance ─────────────────────────────────────────────────────────

interface TokenSets { light: Record<string, string>; dark: Record<string, string> }
let tokenSets: TokenSets | null = null

/** The token values the stylesheet declares for each appearance, read once. */
function readTokenSets(): TokenSets {
    if (tokenSets) return tokenSets
    const light: Record<string, string> = {}
    const dark: Record<string, string> = {}
    const take = (rule: CSSStyleRule, into: Record<string, string>) => {
        for (let i = 0; i < rule.style.length; i++) {
            const name = rule.style[i]
            if (name.startsWith("--c-")) into[name] = rule.style.getPropertyValue(name).trim()
        }
    }
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule && rule.selectorText === ":root") take(rule, light)
            else if (rule instanceof CSSMediaRule && /prefers-color-scheme:\s*dark/.test(rule.conditionText)) {
                for (const inner of Array.from(rule.cssRules)) if (inner instanceof CSSStyleRule && inner.selectorText === ":root") take(inner, dark)
            }
        }
    }
    tokenSets = { light, dark }
    return tokenSets
}

export function isDarkAppearance(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

const rgbOf = (spaced: string) => spaced.split(/\s+/).join(", ")

/**
 * Rewrites every dark token colour in a serialized SVG to its light value.
 * Charts bake colours into attributes when they draw, so the swap is done on
 * the text: each token has one value per appearance.
 */
export function remapToLight(svgText: string): string {
    const { light, dark } = readTokenSets()
    const map = lightPairs(light, dark)
    if (map.size === 0) return svgText
    return svgText.replace(/(rgba?\()(\d+),\s*(\d+),\s*(\d+)/g, (m, pre, r, g, b) => {
        const hit = map.get(`${r}, ${g}, ${b}`)
        return hit ? pre + hit : m
    })
}

/**
 * Tokens that win when two dark tokens share one colour and the light theme
 * gives them different ones. A chart paints its ground in the surface far
 * more often than it sets text on the accent, and a wrong guess turns a light
 * figure's background to ink (the tangle drawing did, 2026-09-24).
 */
export const REMAP_PREFERRED = ["--c-surface"]

/**
 * Dark colour → light colour, as "r, g, b" strings. The swap works on values,
 * so a dark value used by several tokens needs one answer: the preferred
 * token's, else the first declared. `ambiguous` collects the rest, for the
 * test that keeps the palette honest.
 */
export function lightPairs(light: Record<string, string>, dark: Record<string, string>, ambiguous?: string[]): Map<string, string> {
    const map = new Map<string, string>()
    const owner = new Map<string, string>()
    for (const [name, d] of Object.entries(dark)) {
        const l = light[name]
        if (!l || l === d || !/^\d+\s+\d+\s+\d+$/.test(d)) continue
        const key = rgbOf(d), val = rgbOf(l)
        const had = map.get(key)
        if (had === undefined) { map.set(key, val); owner.set(key, name); continue }
        if (had === val) continue
        const prev = owner.get(key)!
        if (REMAP_PREFERRED.includes(name) && !REMAP_PREFERRED.includes(prev)) { map.set(key, val); owner.set(key, name) }
        else if (!REMAP_PREFERRED.includes(prev)) ambiguous?.push(`${prev} / ${name}`)
    }
    return map
}

/**
 * Runs `fn` with the light tokens forced on :root, synchronously, so a canvas
 * can redraw offscreen in the light appearance without the window repainting.
 */
export function withLightTokens<T>(fn: () => T): T {
    if (!isDarkAppearance()) return fn()
    const { light } = readTokenSets()
    const style = document.createElement("style")
    style.textContent = `:root:root{${Object.entries(light).map(([k, v]) => `${k}:${v}`).join(";")}}`
    document.head.appendChild(style)
    try { return fn() } finally { style.remove() }
}

// ── SVG ────────────────────────────────────────────────────────────────

const STYLE_PROPS = [
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
    "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing",
    "visibility", "display", "paint-order",
]

/** A detached copy of an SVG with its computed styles written inline. */
export function inlineStyles(svg: SVGSVGElement): SVGSVGElement {
    const clone = svg.cloneNode(true) as SVGSVGElement
    // A detached SVG (drawn for export) carries its styles as attributes already.
    if (!svg.isConnected) return clone
    const src = [svg, ...Array.from(svg.querySelectorAll("*"))]
    const dst = [clone, ...Array.from(clone.querySelectorAll("*"))]
    for (let i = 0; i < src.length; i++) {
        const cs = getComputedStyle(src[i] as Element)
        const el = dst[i] as SVGElement
        const decl = STYLE_PROPS.map(p => {
            const v = cs.getPropertyValue(p)
            return v ? `${p}:${v}` : ""
        }).filter(Boolean).join(";")
        el.setAttribute("style", decl)
        el.removeAttribute("class")
        // A mark placed by a CSS transform (the metrics plot moves its marks that way, so they
        // can animate) keeps its place as an SVG transform; the style above no longer carries it.
        if ((src[i] as SVGElement).style?.transform && cs.transform && cs.transform !== "none") el.setAttribute("transform", cs.transform)
    }
    return clone
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// ── The footer: legend and provenance under the chart ─────────────────
// Laid out once as drawing operations, then written as SVG or painted on a
// canvas, so the two formats cannot drift apart.

const FOOTER_FONT = 11
const FOOTER_PAD = 14
const SANS = t("export.figure.interSystemUiSans")
const MONO = t("export.figure.jetbrainsMonoUiMonospace")

type Op =
    | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string }
    | { t: "circle"; x: number; y: number; r: number; fill?: string; stroke?: string }
    | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: number[] }
    | { t: "text"; x: number; y: number; text: string; mono?: boolean; fill: string; anchor?: "start" | "end" }
    | { t: "ramp"; x: number; y: number; w: number; h: number; colors: string[] }

interface Footer { height: number; ops: Op[] }

function measureText(text: string, font: string): number {
    const c = document.createElement("canvas").getContext("2d")
    if (!c) return text.length * 6
    c.font = font
    return c.measureText(text).width
}

interface FooterColors { surface: string; ink: string; muted: string; hairline: string }

function footerColors(light: boolean): FooterColors {
    const { light: l, dark: d } = readTokenSets()
    const set = !light && isDarkAppearance() ? { ...l, ...d } : l
    const c = (n: string, fb: string) => (set[n] ? `rgb(${rgbOf(set[n])})` : fb)
    return {
        surface: c("--c-surface", "#ffffff"),
        ink: c("--c-neutral-700", "#404040"),
        muted: c("--c-neutral-500", "#737373"),
        hairline: c("--c-neutral-200", "#e5e5e5"),
    }
}

function fitText(text: string, width: number, font: string): string {
    if (measureText(text, font) <= width) return text
    let s = text
    while (s.length > 8 && measureText(s + "…", font) > width) s = s.slice(0, -1)
    return s + "…"
}

/** Words broken into lines no wider than `width`. */
function wrap(text: string, width: number, font: string): string[] {
    const lines: string[] = []
    let line = ""
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word
        if (line && measureText(next, font) > width) { lines.push(line); line = word } else line = next
    }
    if (line) lines.push(line)
    return lines
}

/** The legend mark, drawn in a 12 by 10 box whose baseline is `y`. */
function markOps(mark: LegendMark, color: string, x: number, y: number, ground: string): Op[] {
    const mid = y - 4
    switch (mark) {
        case "line": return [{ t: "line", x1: x, y1: mid, x2: x + 12, y2: mid, stroke: color, width: 2 }]
        case "dashed": return [{ t: "line", x1: x, y1: mid, x2: x + 12, y2: mid, stroke: color, width: 2, dash: [3, 2] }]
        case "dot": return [{ t: "circle", x: x + 5, y: mid, r: 4, fill: color }]
        case "ring": return [{ t: "circle", x: x + 5, y: mid, r: 3.5, fill: ground, stroke: color }]
        case "hatch": return [
            { t: "rect", x, y: y - 9, w: 10, h: 10, rx: 2, fill: ground, stroke: color },
            { t: "line", x1: x + 1, y1: y - 1, x2: x + 9, y2: y - 9, stroke: color, width: 1 },
            { t: "line", x1: x + 1, y1: y - 5, x2: x + 5, y2: y - 9, stroke: color, width: 1 },
            { t: "line", x1: x + 5, y1: y - 1, x2: x + 9, y2: y - 5, stroke: color, width: 1 },
        ]
        default: return [{ t: "rect", x, y: y - 9, w: 10, h: 10, rx: 2, fill: color }]
    }
}

function layoutFooter(width: number, legend: FigureLegend | null | undefined, caption: string, colors: FooterColors, recolor: (c: string) => string): Footer {
    const sans = `${FOOTER_FONT}px ${SANS}`, mono = `${FOOTER_FONT}px ${MONO}`
    const inner = width - 2 * FOOTER_PAD
    const ops: Op[] = []
    const LINE = FOOTER_FONT + 8
    let y = FOOTER_PAD + FOOTER_FONT
    let any = false

    const items = legend?.items ?? []
    if (items.length) {
        let x = FOOTER_PAD
        for (const item of items) {
            const label = item.count != null ? `${item.label} ${item.count.toLocaleString(intlLocale)}` : item.label
            const text = fitText(label, inner - 18, sans)
            const w = 18 + measureText(text, sans) + 16
            if (x + w > width - FOOTER_PAD && x > FOOTER_PAD) { x = FOOTER_PAD; y += LINE }
            ops.push(...markOps(item.mark ?? "swatch", recolor(item.color), x, y, colors.surface))
            ops.push({ t: "text", x: x + 18, y, text, fill: colors.ink })
            x += w
        }
        y += LINE
        any = true
    }
    for (const ramp of legend?.ramps ?? []) {
        let x = FOOTER_PAD
        const lead = `${ramp.label}  `
        ops.push({ t: "text", x, y, text: lead, fill: colors.ink })
        x += measureText(lead, sans) + 4
        ops.push({ t: "text", x, y, text: ramp.low, fill: colors.muted })
        x += measureText(ramp.low, sans) + 6
        ops.push({ t: "ramp", x, y: y - 9, w: 96, h: 10, colors: ramp.colors.map(recolor) })
        x += 96 + 6
        ops.push({ t: "text", x, y, text: ramp.high, fill: colors.muted })
        y += LINE
        any = true
    }
    for (const note of legend?.notes ?? []) {
        for (const line of wrap(note, inner, sans)) { ops.push({ t: "text", x: FOOTER_PAD, y, text: line, fill: colors.muted }); y += FOOTER_FONT + 5 }
        y += 3
        any = true
    }
    if (caption) {
        if (any) y += 2
        ops.push({ t: "text", x: FOOTER_PAD, y, text: fitText(caption, inner, mono), mono: true, fill: colors.muted })
        y += LINE
        any = true
    }
    if (!any) return { height: 0, ops: [] }
    ops.unshift({ t: "line", x1: 0, y1: 0.5, x2: width, y2: 0.5, stroke: colors.hairline, width: 1 })
    return { height: y - LINE + FOOTER_PAD, ops }
}

let rampIds = 0

function footerSvg(ops: Op[]): string {
    const defs: string[] = []
    const body = ops.map(op => {
        switch (op.t) {
            case "rect": return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}"${op.rx ? ` rx="${op.rx}"` : ""} fill="${esc(op.fill ?? "none")}"${op.stroke ? ` stroke="${esc(op.stroke)}"` : ""}/>`
            case "circle": return `<circle cx="${op.x}" cy="${op.y}" r="${op.r}" fill="${esc(op.fill ?? "none")}"${op.stroke ? ` stroke="${esc(op.stroke)}" stroke-width="1.5"` : ""}/>`
            case "line": return `<line x1="${op.x1}" y1="${op.y1}" x2="${op.x2}" y2="${op.y2}" stroke="${esc(op.stroke)}" stroke-width="${op.width}"${op.dash ? ` stroke-dasharray="${op.dash.join(" ")}"` : ""}/>`
            case "text": return `<text x="${op.x}" y="${op.y}" font-family="${esc(op.mono ? MONO : SANS)}" font-size="${FOOTER_FONT}" fill="${esc(op.fill)}"${op.anchor === "end" ? ' text-anchor="end"' : ""}>${esc(op.text)}</text>`
            case "ramp": {
                const id = `legend-ramp-${++rampIds}`
                const stops = op.colors.map((c, i) => `<stop offset="${op.colors.length > 1 ? (i / (op.colors.length - 1)) * 100 : 0}%" stop-color="${esc(c)}"/>`).join("")
                defs.push(`<linearGradient id="${id}">${stops}</linearGradient>`)
                return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" rx="2" fill="url(#${id})"/>`
            }
        }
    }).join("")
    return (defs.length ? `<defs>${defs.join("")}</defs>` : "") + body
}

function paintFooter(g: CanvasRenderingContext2D, ops: Op[]): void {
    for (const op of ops) {
        g.setLineDash([])
        switch (op.t) {
            case "rect":
                g.beginPath()
                g.roundRect(op.x, op.y, op.w, op.h, op.rx ?? 0)
                if (op.fill) { g.fillStyle = op.fill; g.fill() }
                if (op.stroke) { g.strokeStyle = op.stroke; g.lineWidth = 1; g.stroke() }
                break
            case "circle":
                g.beginPath()
                g.arc(op.x, op.y, op.r, 0, Math.PI * 2)
                if (op.fill) { g.fillStyle = op.fill; g.fill() }
                if (op.stroke) { g.strokeStyle = op.stroke; g.lineWidth = 1.5; g.stroke() }
                break
            case "line":
                g.strokeStyle = op.stroke; g.lineWidth = op.width; g.setLineDash(op.dash ?? [])
                g.beginPath(); g.moveTo(op.x1, op.y1); g.lineTo(op.x2, op.y2); g.stroke()
                break
            case "text":
                g.font = `${FOOTER_FONT}px ${op.mono ? MONO : SANS}`
                g.fillStyle = op.fill
                g.textAlign = op.anchor === "end" ? "right" : "left"
                g.fillText(op.text, op.x, op.y)
                break
            case "ramp": {
                const grad = g.createLinearGradient(op.x, 0, op.x + op.w, 0)
                op.colors.forEach((c, i) => grad.addColorStop(op.colors.length > 1 ? i / (op.colors.length - 1) : 0, c))
                g.fillStyle = grad
                g.beginPath(); g.roundRect(op.x, op.y, op.w, op.h, 2); g.fill()
                break
            }
        }
    }
    g.textAlign = "left"
}

/**
 * The footer for this export. A legend is written in the window's colours
 * (the app shows the same legend), so a light rendering of a dark window
 * remaps it, whichever way the chart itself was made light.
 */
function footerFor(width: number, caption: string, opts: ExportOptions): Footer {
    const colors = footerColors(opts.light)
    const remap = opts.light && isDarkAppearance()
    const recolor = (c: string) => resolveTokens(remap ? remapToLight(c) : c, opts.light)
    return layoutFooter(width, opts.legend, caption, colors, recolor)
}

/**
 * A colour written as `rgb(var(--c-red-500))` with the token's value in it:
 * a saved SVG has no stylesheet to look the token up in.
 */
export function resolveTokens(color: string, light: boolean): string {
    if (!color.includes("var(--c-")) return color
    const { light: l, dark: d } = readTokenSets()
    const set = !light && isDarkAppearance() ? { ...l, ...d } : l
    return color.replace(/var\((--c-[\w-]+)\)/g, (m, name) => (set[name] ? rgbOf(set[name]) : m))
}

/** The figure as SVG text: background, the chart, and the footer band. */
export function svgDocument(out: Extract<FigureOutput, { kind: "svg" }>, caption: string, opts: ExportOptions): string {
    checkFigure(out)
    const chart = inlineStyles(out.svg)
    chart.setAttribute("x", "0")
    chart.setAttribute("y", "0")
    chart.setAttribute("width", String(out.width))
    chart.setAttribute("height", String(out.height))
    if (!chart.getAttribute("viewBox")) chart.setAttribute("viewBox", `0 0 ${out.width} ${out.height}`)
    const f = footerFor(out.width, caption, opts)
    const colors = footerColors(opts.light)
    const light = opts.light && isDarkAppearance() && !out.light
    const total = out.height + f.height
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${total}" viewBox="0 0 ${out.width} ${total}">`
        + `<rect width="100%" height="100%" fill="${colors.surface}"/>`
        // Only the chart is drawn in the window's colours; the ground and the footer below are
        // written in the light ones already, and the two palettes share values (the light
        // surface is a dark-theme ink), so remapping them too turned a white ground to ink.
        + (light ? remapToLight(new XMLSerializer().serializeToString(chart)) : new XMLSerializer().serializeToString(chart))
        + (f.height ? `<g transform="translate(0 ${out.height})">${footerSvg(f.ops)}</g>` : "")
        + `</svg>`
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(t("export.figure.figureCouldNotDrawn")))
        img.src = src
    })
}

// ── The contract every figure keeps ────────────────────────────────────
// A report, a pin or a saved PNG must never hold a blank: a figure that
// cannot be captured says so, in words, where the capture was asked for.

/** Why a figure cannot be handed over. Its message is shown as it is. */
export class FigureError extends Error {}

// For scripts/figure-check.mjs, in development only: the pipeline the app itself uses.
if (import.meta.env?.DEV && typeof window !== "undefined") queueMicrotask(() => { (window as any).__archstatsFigure = { pngBase64, svgDocument } })

const DRAWN = "path, rect, circle, ellipse, line, polyline, polygon, text, image, use"

/** Before drawing: the chart has a size and something in it. */
export function checkFigure(out: FigureOutput): void {
    if (!(out.width >= 16 && out.height >= 16)) {
        throw new FigureError(t("export.figure.chartHasNoSize", { value: Math.round(out.width) || 0, value2: Math.round(out.height) || 0 }))
    }
    if (out.kind === "svg" && !out.svg.querySelector(DRAWN)) throw new FigureError(t("export.figure.chartHasNothingDrawn"))
}

/**
 * After drawing: the chart's part of the image is not one flat colour, and a
 * light rendering has a light ground. Samples a grid of about 4,000 points;
 * the most common colour stands for the ground, except in a chart `filled`
 * with data colours, where the ground is not checked.
 */
export function checkDrawn(g: CanvasRenderingContext2D, width: number, chartHeight: number, light: boolean, filled = false): void {
    const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(chartHeight))
    const data = g.getImageData(0, 0, w, h).data
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4096)))
    const counts = new Map<number, number>()
    let total = 0
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4
        // Quantised, so anti-aliasing noise does not count as drawing.
        const q = ((data[i] >> 4) << 12) | ((data[i + 1] >> 4) << 8) | ((data[i + 2] >> 4) << 4) | (data[i + 3] >> 4)
        counts.set(q, (counts.get(q) ?? 0) + 1)
        total++
    }
    let ground = 0, most = -1
    for (const [q, c] of counts) if (c > most) { most = c; ground = q }
    if (total - most < Math.max(3, total * 0.002)) throw new FigureError(t("export.figure.figureCameOutBlank"))
    if (light && !filled) {
        const r = (ground >> 12) & 15, gr = (ground >> 8) & 15, b = (ground >> 4) & 15, a = ground & 15
        const luminance = (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 15
        if (a >= 8 && luminance < 0.6) throw new FigureError(t("export.figure.lightRenderingCameOut"))
    }
}

/** The figure as a PNG at `scale` (2 by default), base64 without the data: prefix. */
export async function pngBase64(out: FigureOutput, caption: string, opts: ExportOptions, scale = 2): Promise<string> {
    checkFigure(out)
    if (out.kind === "svg") {
        const text = svgDocument(out, caption, opts)
        const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const g = canvas.getContext("2d")!
        g.scale(scale, scale)
        g.drawImage(img, 0, 0)
        checkDrawn(g, canvas.width, Math.round(out.height * scale), opts.light, out.filled)
        return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "")
    }
    const f = footerFor(out.width, caption, opts)
    const colors = footerColors(opts.light)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(out.width * out.scale)
    canvas.height = Math.round((out.height + f.height) * out.scale)
    const g = canvas.getContext("2d")!
    g.fillStyle = colors.surface
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(out.canvas, 0, 0)
    checkDrawn(g, canvas.width, Math.round(out.height * out.scale), opts.light)
    g.scale(out.scale, out.scale)
    g.translate(0, out.height)
    paintFooter(g, f.ops)
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "")
}

// ── HTML grids ─────────────────────────────────────────────────────────

/**
 * An SVG drawn from laid-out HTML: each matched cell becomes a rect in its
 * background colour and each label a text at its place. For charts built from
 * divs (the commit calendar), which have no SVG to serialize.
 */
export function svgFromHtml(root: HTMLElement, cellSelector: string, labelSelector: string): { svg: SVGSVGElement; width: number; height: number } {
    const box = root.getBoundingClientRect()
    const ns = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(ns, "svg") as SVGSVGElement
    const width = Math.ceil(box.width), height = Math.ceil(box.height)
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
    for (const cell of Array.from(root.querySelectorAll<HTMLElement>(cellSelector))) {
        const r = cell.getBoundingClientRect()
        const cs = getComputedStyle(cell)
        const rect = document.createElementNS(ns, "rect")
        rect.setAttribute("x", String(r.left - box.left))
        rect.setAttribute("y", String(r.top - box.top))
        rect.setAttribute("width", String(r.width))
        rect.setAttribute("height", String(r.height))
        rect.setAttribute("rx", String(parseFloat(cs.borderTopLeftRadius) || 0))
        rect.setAttribute("fill", cs.backgroundColor)
        svg.appendChild(rect)
    }
    for (const label of Array.from(root.querySelectorAll<HTMLElement>(labelSelector))) {
        const r = label.getBoundingClientRect()
        const cs = getComputedStyle(label)
        const text = document.createElementNS(ns, "text")
        text.setAttribute("x", String(r.left - box.left))
        text.setAttribute("y", String(r.top - box.top + r.height * 0.78))
        text.setAttribute("font-size", cs.fontSize)
        text.setAttribute("font-family", cs.fontFamily)
        text.setAttribute("fill", cs.color)
        text.textContent = label.textContent?.trim() ?? ""
        svg.appendChild(text)
    }
    return { svg, width, height }
}
