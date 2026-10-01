// What a view has on screen, taken the moment the person leaves it for Ask:
// its route and subject, the focus and selection, and every table and
// figure it registered for export (rows capped, legends in words). Taken
// then, because a view's exhibits unmount as soon as it is left.

import type { RouteLocationNormalizedLoaded } from "vue-router"
import { exportables } from "~/features/export/useExportables"
import { pngBase64 } from "~/features/export/figure"
import type { FigureLegend } from "~/features/export/figure"
import { VIEWS } from "~/features/navigation/routes"
import type { ViewContext } from "../engine/types"
import { t } from "~/shared/i18n"

function legendText(l: FigureLegend | null | undefined): string {
    if (!l) return ""
    return [
        ...(l.items ?? []).map(i => `${i.label}${i.count !== undefined ? ` (${i.count})` : ""}`),
        ...(l.ramps ?? []).map(r => `${r.label}: ${r.low} → ${r.high}`),
        ...(l.notes ?? []),
    ].join("; ")
}

function viewLabel(route: RouteLocationNormalizedLoaded): string {
    const path = route.path
    const exact = VIEWS.find(v => v.to === path)
    if (exact) return exact.label
    if (path.startsWith("/views/components/") && route.params.name) return t("ask.viewContext.component", { paramsName: decodeURIComponent(String(route.params.name)) })
    if (path.startsWith("/views/files/")) return t("ask.viewContext.file", { replace: path.replace("/views/files/", "") })
    if (path.startsWith("/views/groups/")) return t("ask.viewContext.group")
    const near = VIEWS.filter(v => v.to !== "/" && path.startsWith(v.to)).sort((a, b) => b.to.length - a.to.length)[0]
    return near?.label ?? (path === "/" ? t("ask.viewContext.overview") : path.replace(/^\/views\//, ""))
}

export function captureView(route: RouteLocationNormalizedLoaded, scope: { focus?: string }): ViewContext {
    let subject: ViewContext["subject"]
    if (route.path.startsWith("/views/components/") && typeof route.params.name === "string" && !["hotspots", "cycles", "matrix", "chord", "table"].includes(route.params.name)) {
        subject = { kind: "component", name: decodeURIComponent(route.params.name) }
    } else if (route.path.startsWith("/views/files/")) {
        const name = Array.isArray(route.params.name) ? route.params.name.join("/") : String(route.params.name ?? "")
        subject = { kind: "file", name: decodeURIComponent(name.replace(/\/(contents|git|imports|java|source)$/, "")) }
    }
    let selection: string[] | undefined
    try { const hl = route.query.hl; if (typeof hl === "string") selection = JSON.parse(hl) } catch { /* not a list */ }
    const exhibits: ViewContext["exhibits"] = []
    for (const e of exportables.value) {
        try {
            if (e.kind === "table") {
                if (e.disabledReason?.() || (e.ready && !e.ready())) continue
                const cols = e.columns()
                const rows = e.rows()
                if (!rows.length) continue
                exhibits.push({ kind: "table", title: e.title, columns: cols.map(c => c.label), rows: rows.slice(0, 20).map(r => cols.map(c => cellText(r[c.id]))), total: rows.length })
            } else if (e.kind === "figure") {
                exhibits.push({ kind: "figure", title: e.title, legend: legendText(e.legend()) })
            }
        } catch { /* an exhibit mid-update: leave it out */ }
        if (exhibits.length >= 6) break
    }
    return { route: route.fullPath, label: viewLabel(route), subject, focus: scope.focus || undefined, selection, exhibits, capturedAt: new Date().toISOString() }
}

function cellText(v: unknown): string {
    if (v === null || v === undefined) return ""
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2)
    return String(v).slice(0, 80)
}

/**
 * The view's figures as pictures, drawn in the light appearance with their
 * legends, for a model that can see. Taken before the view unmounts; a figure
 * that will not draw in time is left out rather than holding the person up.
 */
export async function captureImages(limit = 2, budgetMs = 2500): Promise<Array<{ title: string; png: string }>> {
    const out: Array<{ title: string; png: string }> = []
    const figs = exportables.value.filter(e => e.kind === "figure").slice(0, limit)
    const work = (async () => {
        for (const f of figs) {
            if (f.kind !== "figure" || !f.ready()) continue
            try {
                const drawn = await f.render({ light: true })
                if (!drawn) continue
                const b64 = await pngBase64(drawn, f.title, { light: true, legend: f.legend() }, 1)
                out.push({ title: f.title, png: b64.replace(/^data:image\/png;base64,/, "") })
            } catch { /* a figure that will not draw: leave it out */ }
        }
    })()
    await Promise.race([work, new Promise(r => setTimeout(r, budgetMs))])
    return out
}
