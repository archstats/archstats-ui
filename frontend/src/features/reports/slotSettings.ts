// What a template's slot asks of a view, in the view's own words: the route
// it opens is read back as settings ("Shown as: Graph", "Level: By group"),
// so the architect sees the ask at a glance and the import preview can check
// a capture against it.

import { t } from "~/shared/i18n"

export interface SettingDef {
    key: string
    label: string
    /** The value the view takes when the route does not say. */
    fallback: string
    values: Record<string, string>
    /** Shown even when the slot leaves it at the view's default. */
    always?: boolean
}

interface ViewDef { name: string; settings: SettingDef[] }

const VIEWS: Record<string, ViewDef> = {
    "/views/connections": {
        name: t("reports.slotSettings.connections"),
        settings: [
            { key: "rep", label: t("reports.slotSettings.shown"), fallback: "graph", always: true, values: { graph: t("reports.slotSettings.graph"), matrix: t("reports.slotSettings.matrix"), chord: t("reports.slotSettings.chord"), list: t("reports.slotSettings.list"), crosscut: t("reports.slotSettings.crosscut") } },
            { key: "level", label: t("reports.slotSettings.level"), fallback: "groups", always: true, values: { groups: t("reports.slotSettings.group"), components: t("reports.slotSettings.components"), files: t("reports.slotSettings.files") } },
            { key: "by", label: t("reports.slotSettings.rolledUp"), fallback: "", values: { "": t("reports.slotSettings.lens"), Folders: t("reports.slotSettings.folders"), none: t("reports.slotSettings.nothing") } },
            { key: "source", label: t("reports.slotSettings.connections"), fallback: "static", values: { static: t("reports.slotSettings.imports"), git: t("reports.slotSettings.changedTogether"), combined: t("reports.slotSettings.importsCoChange") } },
            { key: "order", label: t("reports.slotSettings.order"), fallback: "", values: { "": t("reports.slotSettings.laidOut"), levels: t("reports.slotSettings.levels"), name: t("reports.slotSettings.name") } },
            { key: "relation", label: t("reports.slotSettings.pairs"), fallback: "all", values: { all: t("reports.slotSettings.all"), "no-import": t("reports.slotSettings.withoutImport") } },
            { key: "sel", label: t("reports.slotSettings.selected"), fallback: "", values: {} },
        ],
    },
    "/views/components/hotspots": {
        name: t("reports.slotSettings.hotspots"),
        settings: [
            { key: "grain", label: t("reports.slotSettings.rows"), fallback: "components", always: true, values: { components: t("reports.slotSettings.components"), files: t("reports.slotSettings.files"), directories: t("reports.slotSettings.directories") } },
            { key: "layout", label: t("reports.slotSettings.layout"), fallback: "packed", values: { packed: t("reports.slotSettings.packed"), flat: t("reports.slotSettings.flat") } },
            { key: "preset", label: t("reports.slotSettings.preset"), fallback: "hotspots", values: { hotspots: t("reports.slotSettings.hotspots"), churn: t("reports.slotSettings.churnAgainstHealth"), instability: t("reports.slotSettings.instability"), age: t("reports.slotSettings.codeAge"), nesting: t("reports.slotSettings.nestingDepth") } },
        ],
    },
    "/views/components/cycles": { name: t("reports.slotSettings.cycles"), settings: [{ key: "component", label: t("reports.slotSettings.around"), fallback: "", values: {} }] },
    "/views/git/authors": {
        name: t("reports.slotSettings.authors"),
        settings: [{ key: "grain", label: t("reports.slotSettings.rows"), fallback: "components", always: true, values: { components: t("reports.slotSettings.knowledge"), authors: t("reports.slotSettings.people") } }],
    },
    "/views/git/activity": {
        name: t("reports.slotSettings.activity"),
        settings: [
            { key: "tab", label: t("reports.slotSettings.tab"), fallback: "now", always: true, values: { now: t("reports.slotSettings.workNow"), breadth: t("reports.slotSettings.breadth"), effort: t("reports.slotSettings.effort"), commits: t("reports.slotSettings.commits") } },
            { key: "window", label: t("reports.slotSettings.window"), fallback: "", values: { "": t("reports.slotSettings.lastChosen"), "30": "30 days", "90": "90 days", "180": "180 days", "365": "1 year" } },
        ],
    },
    "/views/metrics": {
        name: t("reports.slotSettings.metrics"),
        settings: [
            { key: "grain", label: t("reports.slotSettings.rows"), fallback: "components", always: true, values: { components: t("reports.slotSettings.components"), files: t("reports.slotSettings.files"), directories: t("reports.slotSettings.directories") } },
            { key: "view", label: t("reports.slotSettings.shown"), fallback: "summary", values: { summary: t("reports.slotSettings.summary"), table: "Table", plot: t("reports.slotSettings.plot"), matrix: t("reports.slotSettings.matrix"), strips: t("reports.slotSettings.strips"), profiles: t("reports.slotSettings.profiles") } },
            { key: "preset", label: t("reports.slotSettings.preset"), fallback: "", values: { dms: t("reports.slotSettings.distanceMainSequence"), "dms-changes": t("reports.slotSettings.dmsVsCodeChanges"), "churn-health": t("reports.slotSettings.churnAgainstHealth"), "churn-complexity": t("reports.slotSettings.churnAgainstComplexity"), "authors-churn": t("reports.slotSettings.authorsVsChurn"), "betweenness-churn": t("reports.slotSettings.betweennessVsChurn"), "age-churn-dms": t("reports.slotSettings.ageVsChurnVs") } },
        ],
    },
    "/views/units": {
        name: t("reports.slotSettings.units"),
        settings: [
            { key: "flow", label: t("reports.slotSettings.between"), fallback: "", values: {} },
            { key: "colour", label: t("reports.slotSettings.mapColoured"), fallback: "lane", values: { lane: t("reports.slotSettings.lane"), reach: t("reports.slotSettings.reach"), dupes: t("reports.slotSettings.duplicates") } },
        ],
    },
    "/views/changes": { name: t("reports.slotSettings.changes"), settings: [] },
    "/": { name: t("reports.slotSettings.overview"), settings: [] },
    "/views/libraries": { name: t("reports.slotSettings.libraries"), settings: [] },
    "/views/rules": { name: t("reports.slotSettings.rules"), settings: [] },
    "/views/trends": { name: t("reports.slotSettings.trends"), settings: [] },
}

function parse(route: string): { path: string; query: URLSearchParams } {
    const [path, q = ""] = route.replace(/^#/, "").split("?")
    return { path: path || "/", query: new URLSearchParams(q) }
}

export interface SettingRow {
    label: string
    asked: string
    /** What the capture was taken with; undefined when there is no capture to compare. */
    got?: string
    ok: boolean
}

const show = (d: SettingDef, v: string) => d.values[v] ?? (v || "none")

/** The settings a slot asks for, in words. */
export function askedSettings(route: string): SettingRow[] {
    return compareSettings(route, null)
}

/**
 * The slot's ask beside what a capture was taken with. The view comes first;
 * a setting the slot leaves at the view's default is listed only when the
 * view marks it as always worth saying, or when the capture differs from it.
 */
export function compareSettings(asked: string, got: string | null): SettingRow[] {
    const a = parse(asked)
    const g = got === null ? null : parse(got)
    const view = VIEWS[a.path]
    const rows: SettingRow[] = []
    const viewName = view?.name ?? a.path.split("/").filter(Boolean).pop() ?? t("reports.slotSettings.view")
    const gotView = g ? VIEWS[g.path]?.name ?? g.path.split("/").filter(Boolean).pop() ?? "" : undefined
    rows.push({ label: t("reports.slotSettings.view2"), asked: viewName, got: gotView, ok: !g || g.path === a.path })
    if (!view) return rows
    for (const d of view.settings) {
        const av = a.query.get(d.key) ?? d.fallback
        const gv = g && g.path === a.path ? g.query.get(d.key) ?? d.fallback : undefined
        const differs = gv !== undefined && gv !== av
        if (!d.always && !a.query.has(d.key) && !differs) continue
        rows.push({ label: d.label, asked: show(d, av), got: gv === undefined ? undefined : show(d, gv), ok: !differs })
    }
    // The Files facet is a setting the run applies, not part of the view's address.
    const facet = a.query.get("facet")
    if (facet) rows.push({ label: t("reports.slotSettings.files"), asked: facet === "test" ? t("reports.slotSettings.tests") : facet === "production" ? t("reports.slotSettings.production") : t("reports.slotSettings.all"), ok: true })
    return rows
}

/** The view a route opens, by its toolbar name. */
export function viewName(route: string): string {
    const p = parse(route).path
    return VIEWS[p]?.name ?? p.split("/").filter(Boolean).pop() ?? t("reports.slotSettings.view")
}
