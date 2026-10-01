// Taking a report's slots from their views, one after another: open the view
// the slot names, set as it asks, wait for the figure to be drawn and to
// settle, and hand it to the import preview. The architect reviews each one
// there (the words around it, the trim, what was asked against what was
// taken) and fills it, skips it, or stops.

import { useRouter } from "vue-router"
import { exportables, pickFor } from "~/features/export/useExportables"
import { useReportsStore } from "./reports.store"
import { runCommand } from "~/platform/commands"
import { cellNumbers, isCell } from "./reportDoc"
import { useScopeStore } from "~/features/groups/scope.store"
import type { RoleFacet } from "~/features/snapshot/fileRole"

/** The newest take wins; an older one still waiting stops where it is. */
let token = 0
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** A force layout keeps moving for a while after its first frame. */
const SETTLE = { figure: 1400, table: 300 } as const
const PATIENCE = 15000
/** A view still saying it is loading (a long history on a big codebase) is waited on this much longer. */
const LOADING_PATIENCE = 90000
const stillLoading = () => !!document.querySelector("[data-loading]")
/** How long a slot's first choice of exportable may take before an alternative is accepted. */
const FALLBACK_AFTER = 3000

/**
 * A slot may ask for the Files facet (facet=production in its route): the
 * facet is a setting, not part of a view's address, so the run sets it for
 * the take and gives the viewer's own back when the run ends.
 */
let facetBefore: RoleFacet | null = null
function applyFacet(route: string) {
    const scope = useScopeStore()
    const asked = new URLSearchParams(route.split("?")[1] ?? "").get("facet") as RoleFacet | null
    if (asked && asked !== scope.facet) {
        if (facetBefore === null) facetBefore = scope.facet
        scope.setFacet(asked)
    } else if (!asked && facetBefore !== null) restoreFacet()
}
function restoreFacet() {
    if (facetBefore === null) return
    useScopeStore().setFacet(facetBefore)
    facetBefore = null
}

/** While a figure is taken the view draws at a page's width (index.css, html.figure-capture). */
function capturing(on: boolean) {
    if (typeof document !== "undefined") document.documentElement.classList.toggle("figure-capture", on)
}

export function useSlotTaking() {
    const reports = useReportsStore()
    const router = useRouter()

    /** Starts taking these slots of the open report, in order. */
    async function start(ids: string[]) {
        if (!ids.length || !reports.currentId) return
        reports.flushSave()
        reports.takeQueue = { reportId: reports.currentId, ids, at: 0 }
        reports.takeLog = { reportId: reports.currentId, asked: [...ids], filled: [], skipped: [], stopped: false, done: false }
        await takeCurrent()
    }

    async function takeCurrent() {
        const q = reports.takeQueue
        if (!q) return
        if (q.at >= q.ids.length) { await finish(); return }
        if (reports.currentId !== q.reportId) reports.open(q.reportId)
        const id = q.ids[q.at]
        const b = reports.doc.blocks.find(x => x.id === id)
        // Filled or removed since: on to the next.
        if (!b || !isCell(b) || b.cell.spec.type !== "slot") { q.at++; return takeCurrent() }
        const kind = b.cell.spec.kind
        const take = b.cell.spec.take
        const route = reports.beginFill(id, cellNumbers(reports.doc.blocks).get(id) ?? "")
        if (!route) { q.at++; return takeCurrent() }
        applyFacet(route)
        capturing(kind === "figure")
        const mine = ++token
        reports.taking = "waiting"
        reports.takeWhy = ""
        await router.push(route)
        // The view left behind unregisters its figures a frame after the route changes.
        await sleep(250)
        const path = route.split("?")[0]
        // With alternatives ("Boundary flow|How the layers lean"), the first choice gets
        // a head start; a later one is taken only once the first has had time to draw.
        const first = take?.split("|")[0]
        const began = Date.now()
        const drawn = () => router.currentRoute.value.path === path &&
            (pickFor(kind, first)?.kind === kind || (Date.now() - began > FALLBACK_AFTER && pickFor(kind, take)?.kind === kind))
        // A view that says why it has nothing to hand over is not waited on.
        const blocked = () => router.currentRoute.value.path === path ? reasonOf(kind) : null
        let blockedSince = 0
        const until = Date.now() + PATIENCE, longest = Date.now() + LOADING_PATIENCE
        while (!drawn() && (Date.now() < until || (stillLoading() && Date.now() < longest)) && mine === token) {
            if (blocked() && !stillLoading()) { blockedSince ||= Date.now(); if (Date.now() - blockedSince > 1200) break } else blockedSince = 0
            await sleep(200)
        }
        if (mine !== token) return
        if (!drawn()) {
            const why = blocked()
            reports.takeWhy = why ? `${b.cell.spec.view} has nothing to take: ${why}` : `${b.cell.spec.view} drew nothing to take${stillLoading() ? ` in ${LOADING_PATIENCE / 1000} seconds; it is still loading` : ` in ${PATIENCE / 1000} seconds`}. Set the view so it draws something and add it, or skip this one.`
            reports.taking = "failed"
            return
        }
        await sleep(SETTLE[kind])
        if (mine !== token) return
        // Still on the slot's view: a run stopped or moved on meanwhile takes nothing.
        if (router.currentRoute.value.path !== path || reports.takeQueue?.ids[reports.takeQueue.at] !== id) return
        reports.taking = "idle"
        await runCommand("add-to-report")
    }

    /** After a slot was filled or skipped: the next one, or back to the report. */
    async function advance(outcome: "filled" | "skipped" = "filled", why = "") {
        capturing(false)
        const q = reports.takeQueue
        if (!q) return
        const id = q.ids[q.at]
        const log = reports.takeLog
        if (log && id) {
            if (outcome === "filled") log.filled.push(id)
            else log.skipped.push({ id, why })
        }
        q.at++
        await takeCurrent()
    }

    async function skip() {
        token++
        const why = reports.taking === "failed" ? reports.takeWhy : "skipped"
        reports.importing = null
        reports.adjusting = false
        reports.filling = null
        await advance("skipped", why)
    }

    /** Takes what the view handed over into the slot in hand, then goes on. */
    async function take() {
        if (!(await reports.takeDraft())) { reports.adjusting = true; return }
        await advance("filled")
    }

    /** The view again, set as the slot asks, and a fresh take. */
    async function retake(slotId?: string) {
        token++
        reports.importing = null
        const q = reports.takeQueue
        if (q && (!slotId || q.ids[q.at] === slotId)) { await takeCurrent(); return }
        const id = slotId ?? reports.filling?.cellId
        if (id) await start([id])
    }

    /** Holds the run where it is: the slot stays asked for, the bar offers the way on. */
    function pause() {
        capturing(false)
        token++
        reports.importing = null
        if (reports.takeQueue) reports.taking = "paused"
    }

    /** Ends the run and goes back to the report; the slots left stay asked for. */
    async function stop() {
        capturing(false)
        restoreFacet()
        token++
        if (reports.takeLog && reports.takeQueue) { reports.takeLog.stopped = true; reports.takeLog.done = true }
        reports.takeQueue = null
        reports.importing = null
        reports.adjusting = false
        reports.filling = null
        reports.taking = "idle"
        if (!router.currentRoute.value.path.startsWith("/views/evidence")) await router.push("/views/evidence")
    }

    async function finish() {
        capturing(false)
        restoreFacet()
        token++
        if (reports.takeLog) reports.takeLog.done = true
        reports.takeQueue = null
        reports.filling = null
        reports.taking = "idle"
        await router.push("/views/evidence")
    }

    return { start, advance, skip, take, retake, pause, stop }
}

/** Why the open view cannot hand over something of this kind, when it says so. */
function reasonOf(kind: "figure" | "table"): string | null {
    const all = exportables.value
    return all.filter(i => i.kind === kind).map(i => i.disabledReason?.() ?? null).find(Boolean)
        ?? all.map(i => i.disabledReason?.() ?? null).find(Boolean)
        // A view that registered nothing may still say why on the page, in its empty state.
        ?? (!all.some(i => i.kind === kind) ? document.querySelector("[data-view-reason]")?.getAttribute("data-view-reason") || null : null)
        ?? null
}
