import { isDarkAppearance, withLightTokens } from "~/features/export/figure"
import { chartTheme, readChartTheme, type ChartTheme } from "~/shared/ui/useChartTheme"

// The metrics overviews draw on a canvas sized to the window, with their
// labels in HTML over it. Neither survives a report: the labels are not in
// the pixels, and a tall window prints a tall empty figure. Each overview
// therefore also draws a figure for the page, at a fixed width, with its
// labels painted in. These are its tools.

/** The print width in CSS pixels; drawn at twice the density. */
export const PRINT_W = 760

export function printCanvas(width: number, height: number, scale = 2) {
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const g = canvas.getContext("2d")!
    g.scale(scale, scale)
    return { canvas, g, scale }
}

/** The theme a print figure is drawn in: light for a report, else the window's. */
export function printTheme(light: boolean): ChartTheme {
    return light && isDarkAppearance() ? withLightTokens(readChartTheme) : chartTheme()
}

/** Words in at most `maxLines` lines of `width`, the last cut with an ellipsis. */
export function wrapText(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
    const lines: string[] = []
    let line = ""
    const words = text.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i++) {
        const next = line ? `${line} ${words[i]}` : words[i]
        if (!line || g.measureText(next).width <= width) { line = next; continue }
        lines.push(line)
        line = words[i]
        if (lines.length === maxLines - 1) { line = words.slice(i).join(" "); break }
    }
    if (line) lines.push(line)
    const last = lines.length - 1
    if (last >= 0 && g.measureText(lines[last]).width > width) {
        let s = lines[last]
        while (s.length > 1 && g.measureText(s + "…").width > width) s = s.slice(0, -1)
        lines[last] = s + "…"
    }
    return lines.slice(0, maxLines)
}
