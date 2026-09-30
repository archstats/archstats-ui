// Inside the stage: open a route, wait for its figures and tables to be
// drawn and settle, and hand them over as plain data (images as data URLs,
// rows as strings), so the window that asked never touches this document's
// objects.

import type { Router } from "vue-router"
import { exportables, usable } from "~/features/export/useExportables"
import { pngBase64, svgDocument, type FigureLegend } from "~/features/export/figure"
import { useScopeStore } from "~/features/groups/scope.store"
import { useDataStore } from "~/features/snapshot/data.store"

export interface StageFigure { title: string; src: string; png?: string; reportPng?: string; width: number; height: number; legend: string }
export interface StageTable { title: string; columns: string[]; rows: string[][]; total: number }
export interface StageTake { route: string; figures: StageFigure[]; tables: StageTable[]; error?: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A slot's take may name alternatives ("Boundary flow|How the layers lean"): any of them fits, the first best. */
function takeRank(title: string, take?: string): number {
    if (!take) return 0
    const alts = take.toLowerCase().split("|").map(x => x.trim()).filter(Boolean)
    const i = alts.findIndex(a => title.toLowerCase().startsWith(a))
    return i < 0 ? 99 : i
}

function legendText(l: FigureLegend | null | undefined): string {
    if (!l) return ""
    return [...(l.items ?? []).map(i => `${i.label}${i.count !== undefined ? ` (${i.count})` : ""}`), ...(l.ramps ?? []).map(r => `${r.label}: ${r.low} → ${r.high}`), ...(l.notes ?? [])].join("; ")
}

function cell(v: unknown): string {
    if (v === null || v === undefined) return ""
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2)
    return String(v).slice(0, 80)
}

export async function stageTake(router: Router, route: string, opts: { focus?: string; take?: string; figures?: number; vision?: boolean; report?: boolean } = {}): Promise<StageTake> {
    const data = useDataStore()
    const scope = useScopeStore()
    for (let i = 0; i < 100 && !data.hasData; i++) await sleep(100)
    scope.setFocus(opts.focus ?? "")
    const facet = new URLSearchParams(route.split("?")[1] ?? "").get("facet")
    if (facet) scope.setFacet(facet as any)
    await router.push(route)
    // Wait for something to be ready; a figure's force layout keeps moving after its first frame.
    const t0 = Date.now()
    while (Date.now() - t0 < 15000) {
        const ready = exportables.value.filter(usable)
        if (ready.some(e => takeRank(e.title, opts.take) < 99 && (e.kind === "figure" || opts.take)) || (ready.length && Date.now() - t0 > (opts.take ? 6000 : 3500))) break
        await sleep(200)
    }
    await sleep(1400)
    const out: StageTake = { route, figures: [], tables: [] }
    const ready = exportables.value.filter(usable)
    const figs = ready.filter(e => e.kind === "figure")
    const ordered = [...figs].sort((a, b) => takeRank(a.title, opts.take) - takeRank(b.title, opts.take))
    for (const f of ordered.slice(0, opts.figures ?? 2)) {
        if (f.kind !== "figure") continue
        try {
            const drawn = await f.render({ light: false })
            if (!drawn) continue
            const legend = f.legend()
            let src: string, width = 0, height = 0
            if (drawn.kind === "svg") {
                const doc = svgDocument(drawn, f.title, { light: false, legend })
                src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`
                const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(doc) ?? /width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(doc)
                if (m) { width = Number(m[1]); height = Number(m[2]) }
            } else {
                src = await pngBase64(drawn, f.title, { light: false, legend }, 2)
            }
            const png = opts.vision && !out.figures.length ? (await pngBase64(drawn, f.title, { light: true, legend }, 1)).replace(/^data:image\/png;base64,/, "") : undefined
            // For a report: the light page's PNG, at print resolution.
            const reportPng = opts.report ? (await pngBase64(drawn, f.title, { light: true, legend }, 2)).replace(/^data:image\/png;base64,/, "") : undefined
            out.figures.push({ title: f.title, src: opts.report ? "" : src, png, reportPng, width, height, legend: legendText(legend) })
        } catch (e: any) { out.error = String(e?.message ?? e) }
    }
    const tablesAll = ready.filter(e => e.kind === "table")
    const tables = [...tablesAll].sort((a, b) => takeRank(a.title, opts.take) - takeRank(b.title, opts.take))
    for (const t of tables.slice(0, 3)) {
        if (t.kind !== "table") continue
        try {
            const cols = t.columns()
            const rows = t.rows()
            out.tables.push({ title: t.title, columns: cols.map(c => c.label), rows: rows.slice(0, 25).map(r => cols.map(c => cell(r[c.id]))), total: rows.length })
        } catch { /* a table mid-update: left out */ }
    }
    return out
}
