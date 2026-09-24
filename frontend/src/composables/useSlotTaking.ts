// Taking a report's slots from their views, one after another: open the view
// the slot names, set as it asks, wait for the figure to be drawn and to
// settle, and hand it to the import preview. The architect reviews each one
// there (the words around it, the trim, what was asked against what was
// taken) and fills it, skips it, or stops.

import { useRouter } from "vue-router"
import { pickFor } from "~/composables/useExportables"
import { useReportsStore } from "~/stores/reports"
import { runCommand } from "~/utils/commands"
import { cellNumbers, isCell } from "~/utils/reportDoc"

/** The newest take wins; an older one still waiting stops where it is. */
let token = 0
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** A force layout keeps moving for a while after its first frame. */
const SETTLE = { figure: 1400, table: 300 } as const
const PATIENCE = 15000

export function useSlotTaking() {
    const reports = useReportsStore()
    const router = useRouter()

    /** Starts taking these slots of the open report, in order. */
    async function start(ids: string[]) {
        if (!ids.length || !reports.currentId) return
        reports.flushSave()
        reports.takeQueue = { reportId: reports.currentId, ids, at: 0 }
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
        const route = reports.beginFill(id, cellNumbers(reports.doc.blocks).get(id) ?? "")
        if (!route) { q.at++; return takeCurrent() }
        const mine = ++token
        reports.taking = "waiting"
        await router.push(route)
        // The view left behind unregisters its figures a frame after the route changes.
        await sleep(250)
        const path = route.split("?")[0]
        const drawn = () => router.currentRoute.value.path === path && pickFor(kind)?.kind === kind
        const until = Date.now() + PATIENCE
        while (!drawn() && Date.now() < until && mine === token) await sleep(200)
        if (mine !== token) return
        if (!drawn()) { reports.taking = "failed"; return }
        await sleep(SETTLE[kind])
        if (mine !== token) return
        reports.taking = "idle"
        await runCommand("add-to-report")
    }

    /** After a slot was filled or skipped: the next one, or back to the report. */
    async function advance() {
        const q = reports.takeQueue
        if (!q) return
        q.at++
        await takeCurrent()
    }

    async function skip() {
        token++
        reports.importing = null
        reports.filling = null
        await advance()
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
        token++
        reports.importing = null
        if (reports.takeQueue) reports.taking = "paused"
    }

    function stop() {
        token++
        reports.takeQueue = null
        reports.filling = null
        reports.taking = "idle"
    }

    async function finish() {
        token++
        reports.takeQueue = null
        reports.filling = null
        reports.taking = "idle"
        await router.push("/views/evidence")
    }

    return { start, advance, skip, retake, pause, stop }
}
