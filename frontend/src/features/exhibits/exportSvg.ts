// Exhibit figures that are drawn as HTML on screen (bars, columns) as an SVG
// for a report, a pin or a PNG. Detached, with every colour written on its
// marks, so the export pipeline takes them as they are.

import { chartTheme } from "~/shared/ui/useChartTheme"
import { intlLocale } from "~/shared/i18n"

const NS = "http://www.w3.org/2000/svg"

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
    if (text !== undefined) e.textContent = text
    return e
}

const fmt = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

export interface Drawn { svg: SVGSVGElement; width: number; height: number }

/** A ranking as horizontal bars: a label, a bar as long as the value, the value. */
export function barsSvg(items: Array<{ label: string; value: number }>, o: { width?: number; lit?: Set<number> } = {}): Drawn {
    const t = chartTheme()
    const width = o.width ?? 680
    const ROW = 22, TOP = 6, LABEL = Math.min(300, Math.max(120, Math.max(...items.map(i => i.label.length)) * 6.6 + 12)), VALUE = 72
    const height = TOP * 2 + items.length * ROW
    const max = Math.max(1e-9, ...items.map(i => Math.abs(i.value)))
    const track = width - LABEL - VALUE - 12
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height })
    items.forEach((it, i) => {
        const y = TOP + i * ROW
        const on = o.lit?.has(i)
        svg.appendChild(el("text", { x: 0, y: y + 15, "font-size": 12, "font-family": t.fontSans, fill: t.ink }, clip(it.label, Math.floor((LABEL - 12) / 6.6))))
        svg.appendChild(el("rect", { x: LABEL, y: y + 5, width: track, height: 11, rx: 3, fill: t.hairline }))
        svg.appendChild(el("rect", { x: LABEL, y: y + 5, width: Math.max(2, (Math.abs(it.value) / max) * track), height: 11, rx: 2, fill: on ? t.accent : t.blue }))
        svg.appendChild(el("text", { x: width, y: y + 15, "font-size": 12, "font-family": t.fontMono, fill: t.ink, "text-anchor": "end" }, fmt(it.value)))
    })
    return { svg, width, height }
}

/** A count per period as columns, oldest left, with the first and last period named and the peak marked. */
export function columnsSvg(points: Array<{ label: string; value: number }>, o: { width?: number; height?: number } = {}): Drawn {
    const t = chartTheme()
    const width = o.width ?? 680, height = o.height ?? 170
    const LEFT = 44, BOTTOM = 22, TOP = 14
    const innerH = height - BOTTOM - TOP, innerW = width - LEFT
    const max = Math.max(1, ...points.map(p => p.value))
    const step = innerW / Math.max(1, points.length)
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height })
    for (const f of [0, 0.5, 1]) {
        const y = TOP + innerH * (1 - f)
        svg.appendChild(el("line", { x1: LEFT, x2: width, y1: y, y2: y, stroke: t.hairline, "stroke-dasharray": f ? "2 3" : "" }))
        svg.appendChild(el("text", { x: LEFT - 6, y: y + 4, "font-size": 10, "font-family": t.fontMono, fill: t.inkSecondary, "text-anchor": "end" }, fmt(Math.round(max * f))))
    }
    let peak = 0
    points.forEach((p, i) => {
        if (p.value > points[peak].value) peak = i
        const h = Math.max(1, (p.value / max) * innerH)
        svg.appendChild(el("rect", { x: LEFT + i * step + 0.5, y: TOP + innerH - h, width: Math.max(1, step - 1), height: h, fill: t.blue, rx: 1 }))
    })
    // A label about every 80px, always the first and the last.
    const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 80))))
    points.forEach((p, i) => {
        if (i % every !== 0 && i !== points.length - 1) return
        if (i !== points.length - 1 && points.length - 1 - i < every / 2) return
        const last = i === points.length - 1, first = i === 0
        svg.appendChild(el("text", { x: last ? width : first ? LEFT : LEFT + i * step + step / 2, y: height - 6, "font-size": 10, "font-family": t.fontMono, fill: t.inkSecondary, "text-anchor": last ? "end" : first ? "start" : "middle" }, p.label))
    })
    if (points.length) {
        const p = points[peak]
        svg.appendChild(el("text", { x: Math.min(width - 4, LEFT + peak * step + step / 2), y: TOP - 3, "font-size": 10, "font-family": t.fontMono, fill: t.ink, "text-anchor": peak > points.length * 0.8 ? "end" : "middle" }, `${p.label}: ${fmt(p.value)}`))
    }
    return { svg, width, height }
}
