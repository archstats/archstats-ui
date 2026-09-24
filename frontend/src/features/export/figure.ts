// Figures as they leave the app: an SVG with its styles inlined (so it looks
// the same outside the app), or a PNG at twice the pixel density, each with a
// footer band holding the legend and the provenance caption. Light by default,
// whatever the app's appearance: a report page is white.

export interface LegendItem {
    label: string
    color: string
    /** Drawn as a dashed line rather than a swatch. */
    dashed?: boolean
    /** Drawn as a line rather than a swatch. */
    line?: boolean
}

/** What a chart hands over when asked for its figure. */
export type FigureOutput =
    | { kind: "svg"; svg: SVGSVGElement; width: number; height: number; legend?: LegendItem[] }
    | { kind: "canvas"; canvas: HTMLCanvasElement; width: number; height: number; scale: number; legend?: LegendItem[] }

export interface FigureOptions {
    /** Render in the light appearance even when the app is dark. */
    light: boolean
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
    const pairs: Array<[string, string]> = []
    for (const [name, d] of Object.entries(dark)) {
        const l = light[name]
        if (l && l !== d && /^\d+\s+\d+\s+\d+$/.test(d)) pairs.push([rgbOf(d), rgbOf(l)])
    }
    if (pairs.length === 0) return svgText
    const map = new Map(pairs)
    return svgText.replace(/(rgba?\()(\d+),\s*(\d+),\s*(\d+)/g, (m, pre, r, g, b) => {
        const hit = map.get(`${r}, ${g}, ${b}`)
        return hit ? pre + hit : m
    })
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
    }
    return clone
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

interface FooterLayout { height: number; legend: Array<{ item: LegendItem; x: number; y: number }>; captionY: number }

const FOOTER_FONT = 11
const FOOTER_PAD = 14

function measureText(text: string, font: string): number {
    const c = document.createElement("canvas").getContext("2d")
    if (!c) return text.length * 6
    c.font = font
    return c.measureText(text).width
}

function layoutFooter(width: number, legend: LegendItem[] = []): FooterLayout {
    const font = `${FOOTER_FONT}px Inter, system-ui, sans-serif`
    let x = FOOTER_PAD, y = FOOTER_PAD + FOOTER_FONT
    const placed: FooterLayout["legend"] = []
    for (const item of legend) {
        const w = 18 + measureText(item.label, font) + 16
        if (x + w > width - FOOTER_PAD && x > FOOTER_PAD) { x = FOOTER_PAD; y += FOOTER_FONT + 8 }
        placed.push({ item, x, y })
        x += w
    }
    const captionY = (legend.length ? y + FOOTER_FONT + 10 : FOOTER_PAD + FOOTER_FONT)
    return { height: captionY + FOOTER_PAD, legend: placed, captionY }
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

function fitCaption(caption: string, width: number): string {
    const font = `${FOOTER_FONT}px "JetBrains Mono", ui-monospace, monospace`
    if (measureText(caption, font) <= width - 2 * FOOTER_PAD) return caption
    let s = caption
    while (s.length > 8 && measureText(s + "…", font) > width - 2 * FOOTER_PAD) s = s.slice(0, -1)
    return s + "…"
}

/** The figure as SVG text: background, the chart, and the footer band. */
export function svgDocument(out: Extract<FigureOutput, { kind: "svg" }>, caption: string, opts: FigureOptions): string {
    const chart = inlineStyles(out.svg)
    chart.setAttribute("x", "0")
    chart.setAttribute("y", "0")
    chart.setAttribute("width", String(out.width))
    chart.setAttribute("height", String(out.height))
    if (!chart.getAttribute("viewBox")) chart.setAttribute("viewBox", `0 0 ${out.width} ${out.height}`)
    const f = layoutFooter(out.width, out.legend)
    const colors = footerColors(opts.light)
    const total = out.height + f.height
    const legend = f.legend.map(({ item, x, y }) => {
        const mark = item.line || item.dashed
            ? `<line x1="${x}" y1="${y - 4}" x2="${x + 12}" y2="${y - 4}" stroke="${esc(item.color)}" stroke-width="2"${item.dashed ? ' stroke-dasharray="3 2"' : ""}/>`
            : `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${esc(item.color)}"/>`
        return `${mark}<text x="${x + 18}" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="${FOOTER_FONT}" fill="${colors.ink}">${esc(item.label)}</text>`
    }).join("")
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${total}" viewBox="0 0 ${out.width} ${total}">`
        + `<rect width="100%" height="100%" fill="${colors.surface}"/>`
        + new XMLSerializer().serializeToString(chart)
        + `<g transform="translate(0 ${out.height})">`
        + `<line x1="0" y1="0.5" x2="${out.width}" y2="0.5" stroke="${colors.hairline}"/>`
        + legend
        + `<text x="${FOOTER_PAD}" y="${f.captionY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="${FOOTER_FONT}" fill="${colors.muted}">${esc(fitCaption(caption, out.width))}</text>`
        + `</g></svg>`
    return opts.light && isDarkAppearance() ? remapToLight(doc) : doc
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error("The figure could not be drawn as an image."))
        img.src = src
    })
}

/** The figure as a PNG at `scale` (2 by default), base64 without the data: prefix. */
export async function pngBase64(out: FigureOutput, caption: string, opts: FigureOptions, scale = 2): Promise<string> {
    if (out.kind === "svg") {
        const text = svgDocument(out, caption, opts)
        const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const g = canvas.getContext("2d")!
        g.scale(scale, scale)
        g.drawImage(img, 0, 0)
        return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "")
    }
    const f = layoutFooter(out.width, out.legend)
    const colors = footerColors(opts.light)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(out.width * out.scale)
    canvas.height = Math.round((out.height + f.height) * out.scale)
    const g = canvas.getContext("2d")!
    g.fillStyle = colors.surface
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(out.canvas, 0, 0)
    g.scale(out.scale, out.scale)
    g.translate(0, out.height)
    g.strokeStyle = colors.hairline
    g.beginPath(); g.moveTo(0, 0.5); g.lineTo(out.width, 0.5); g.stroke()
    g.font = `${FOOTER_FONT}px Inter, system-ui, sans-serif`
    for (const { item, x, y } of f.legend) {
        if (item.line || item.dashed) {
            g.strokeStyle = item.color; g.lineWidth = 2; g.setLineDash(item.dashed ? [3, 2] : [])
            g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 12, y - 4); g.stroke(); g.setLineDash([])
        } else {
            g.fillStyle = item.color; g.fillRect(x, y - 9, 10, 10)
        }
        g.fillStyle = colors.ink
        g.fillText(item.label, x + 18, y)
    }
    g.fillStyle = colors.muted
    g.font = `${FOOTER_FONT}px "JetBrains Mono", ui-monospace, monospace`
    g.fillText(fitCaption(caption, out.width), FOOTER_PAD, f.captionY)
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
