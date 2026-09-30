// What a piece of evidence can do in the rest of Archstats: open the view it
// came from (with the focus and selection it names), go into the pool as a
// pin, into this conversation's report, or into the SQL console. One place,
// so every card and the inspector behave the same.

import { useScopeStore } from "~/features/groups/scope.store"
import { useConsoleStore } from "~/features/sql/console.store"
import type { Evidence } from "../engine/types"
import { useAskStore } from "./ask.store"

export function useAskActions() {
    const ask = useAskStore()
    const router = useRouter()
    const scope = useScopeStore()

    async function open(e: Evidence) {
        if (!e.open) return
        if (e.open.focus) scope.setFocus(e.open.focus)
        const hl = e.open.hl?.length ? `${e.open.route.includes("?") ? "&" : "?"}hl=${encodeURIComponent(JSON.stringify(e.open.hl))}` : ""
        await router.push(`${e.open.route}${hl}`)
    }

    /** Opens the view an exhibit points at, with the graph focus it names. */
    async function openTo(to: { route: string; focus?: string }) {
        if (to.focus) scope.setFocus(to.focus)
        await router.push(to.route)
    }

    async function add(e: Evidence) {
        const title = await ask.addToReport(e)
        ask.flash(title ? `${e.id} added to “${title}”.` : "Could not add it to a report.")
    }

    async function pin(e: Evidence) {
        const ok = await ask.pin(e)
        ask.flash(ok ? `${e.id} pinned to Evidence; it is re-checked on every scan.` : "Only components and files can be pinned.")
    }

    async function sql(e: Evidence) {
        if (!e.sql) return
        useConsoleStore().open({ sql: e.sql, name: e.title.slice(0, 40) })
        await router.push("/views/query")
    }

    async function writeUp() {
        const r = await ask.writeUp()
        if (!r) { ask.flash("Could not make the report."); return }
        await router.push("/views/evidence")
        ask.flash(r.sections ? `“${r.title}”: ${r.sections} section${r.sections === 1 ? "" : "s"} drafted.` : `“${r.title}” is up to date.`)
    }

    return { open, openTo, add, pin, sql, writeUp }
}
