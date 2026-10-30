// What a piece of evidence can do in the rest of Archstats: open the view it
// came from (with the focus and selection it names), go into the pool as a
// pin, into this conversation's report, or into the SQL console. One place,
// so every card and the inspector behave the same.

import { useScopeStore } from "~/features/groups/scope.store"
import { useConsoleStore } from "~/features/sql/console.store"
import type { Evidence } from "../engine/types"
import { useAskStore } from "./ask.store"
import { t } from "~/shared/i18n"

export function useAskActions() {
    const ask = useAskStore()
    const router = useRouter()
    const scope = useScopeStore()

    async function open(e: Evidence) {
        if (!e.open) return
        if (e.open.focus) scope.setFocus(e.open.focus)
        // A line anchor ("#L12-L40") stays last: a query after it would be read as part of the anchor.
        const at = e.open.route.indexOf("#")
        const [path, anchor] = at >= 0 ? [e.open.route.slice(0, at), e.open.route.slice(at)] : [e.open.route, ""]
        const hl = e.open.hl?.length ? `${path.includes("?") ? "&" : "?"}hl=${encodeURIComponent(JSON.stringify(e.open.hl))}` : ""
        await router.push(`${path}${hl}${anchor}`)
    }

    /** Opens the view an exhibit points at, with the graph focus it names. */
    async function openTo(to: { route: string; focus?: string }) {
        if (to.focus) scope.setFocus(to.focus)
        await router.push(to.route)
    }

    async function add(e: Evidence) {
        const title = await ask.addToReport(e)
        ask.flash(title ? t("ask.useAskActions.added", { id: e.id, title }) : t("ask.useAskActions.couldNotAddReport"))
    }

    async function pin(e: Evidence) {
        const ok = await ask.pin(e)
        ask.flash(ok ? t("ask.useAskActions.pinnedEvidenceReChecked", { id: e.id }) : t("ask.useAskActions.onlyComponentsFilesCan"))
    }

    async function sql(e: Evidence) {
        if (!e.sql) return
        useConsoleStore().open({ sql: e.sql, name: e.title.slice(0, 40) })
        await router.push("/views/query")
    }

    async function writeUp() {
        const r = await ask.writeUp()
        if (!r) { ask.flash(t("ask.useAskActions.couldNotMakeReport")); return }
        await router.push("/views/evidence")
        ask.flash(r.sections ? t("ask.useAskActions.drafted", { title: r.title, sections: t("common.count.section", { count: r.sections }) }) : t("ask.useAskActions.upDate", { title: r.title }))
    }

    return { open, openTo, add, pin, sql, writeUp }
}
