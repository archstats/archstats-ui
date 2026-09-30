// An exhibit's figure as a PNG, with nothing on screen: for a report cell, a
// PDF, an export. The figure's own component draws it off-screen inside the
// real app (ExhibitRenderHost, mounted in the layout), registers its figure
// as it always does (into a scope of its own, never the page's Export menu),
// and the app's export pipeline turns it into a PNG with its legend.

import { shallowReactive } from "vue"
import { figurePng } from "~/features/export/figureActions"
import type { FigureExportable } from "~/features/export/useExportables"
import { defOf, resolve } from "~/features/exhibits/engine"
import { snapshotFor } from "./app"
import "./catalog"
import { isAbsent, type ExhibitSpec } from "~/features/exhibits/types"

export interface RenderJob {
    key: number
    spec: ExhibitSpec
    data: unknown
    highlight: string[]
    /** Called by the host with the figure its component registered. */
    done: (fig: FigureExportable | null) => void
}

export const renderJobs = shallowReactive(new Map<number, RenderJob>())
let nextKey = 1

/** Waits until the figure says it is drawn, or gives up. */
async function whenReady(fig: FigureExportable, ms: number): Promise<boolean> {
    const until = Date.now() + ms
    while (Date.now() < until) {
        if (fig.ready()) return true
        await new Promise(r => requestAnimationFrame(() => r(null)))
    }
    return fig.ready()
}

/**
 * The exhibit's figure as base64 PNG (no prefix), or null when it has none
 * (a table-only exhibit, a figure that never drew). Light, with its legend,
 * as a report page wants it.
 */
export async function renderExhibitPng(spec: ExhibitSpec, scanId: string, o: { highlight?: string[]; light?: boolean; legend?: boolean; timeoutMs?: number } = {}): Promise<string | null> {
    const def = defOf(spec.kind)
    if (!def?.figure) return null
    const data = await resolve(spec, { snap: await snapshotFor(scanId) })
    if (isAbsent(data) || !(def.figure.when?.(data) ?? true)) return null
    const key = nextKey++
    const fig = await new Promise<FigureExportable | null>(res => {
        const timer = setTimeout(() => res(null), o.timeoutMs ?? 8000)
        renderJobs.set(key, { key, spec, data, highlight: o.highlight ?? [], done: f => { clearTimeout(timer); res(f) } })
    })
    try {
        if (!fig || !(await whenReady(fig, 4000))) return null
        return await figurePng(fig, { light: o.light ?? true, legend: o.legend ?? true }, false)
    } finally {
        renderJobs.delete(key)
    }
}
