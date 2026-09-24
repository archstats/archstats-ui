// What a template's slot asks of a view, in the view's own words: the route
// it opens is read back as settings ("Shown as: Graph", "Level: By group"),
// so the architect sees the ask at a glance and the import preview can check
// a capture against it.

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
        name: "Connections",
        settings: [
            { key: "rep", label: "Shown as", fallback: "graph", always: true, values: { graph: "Graph", matrix: "Matrix", chord: "Chord", list: "List", crosscut: "Crosscut" } },
            { key: "level", label: "Level", fallback: "groups", always: true, values: { groups: "By group", components: "Components", files: "Files" } },
            { key: "source", label: "Connections", fallback: "static", values: { static: "Imports", git: "Changed together", combined: "Imports and co-change" } },
            { key: "order", label: "Order", fallback: "", values: { "": "As laid out", levels: "By levels", name: "By name" } },
            { key: "sel", label: "Selected", fallback: "", values: {} },
        ],
    },
    "/views/components/hotspots": {
        name: "Hotspots",
        settings: [
            { key: "grain", label: "Rows of", fallback: "components", always: true, values: { components: "Components", files: "Files", directories: "Directories" } },
            { key: "layout", label: "Layout", fallback: "packed", values: { packed: "Packed", flat: "Flat" } },
        ],
    },
    "/views/components/cycles": { name: "Cycles", settings: [{ key: "component", label: "Around", fallback: "", values: {} }] },
    "/views/git/authors": {
        name: "Authors",
        settings: [{ key: "grain", label: "Rows of", fallback: "authors", always: true, values: { authors: "Authors", components: "Components" } }],
    },
    "/views/git/activity": {
        name: "Activity",
        settings: [{ key: "tab", label: "Tab", fallback: "commits", always: true, values: { commits: "Commits", effort: "Effort" } }],
    },
    "/views/metrics": {
        name: "Metrics",
        settings: [{ key: "grain", label: "Rows of", fallback: "components", always: true, values: { components: "Components", files: "Files", directories: "Directories" } }],
    },
    "/views/libraries": { name: "Libraries", settings: [] },
    "/views/rules": { name: "Rules", settings: [] },
    "/views/trends": { name: "Trends", settings: [] },
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
    const viewName = view?.name ?? a.path.split("/").filter(Boolean).pop() ?? "the view"
    const gotView = g ? VIEWS[g.path]?.name ?? g.path.split("/").filter(Boolean).pop() ?? "" : undefined
    rows.push({ label: "View", asked: viewName, got: gotView, ok: !g || g.path === a.path })
    if (!view) return rows
    for (const d of view.settings) {
        const av = a.query.get(d.key) ?? d.fallback
        const gv = g && g.path === a.path ? g.query.get(d.key) ?? d.fallback : undefined
        const differs = gv !== undefined && gv !== av
        if (!d.always && !a.query.has(d.key) && !differs) continue
        rows.push({ label: d.label, asked: show(d, av), got: gv === undefined ? undefined : show(d, gv), ok: !differs })
    }
    return rows
}

/** The view a route opens, by its toolbar name. */
export function viewName(route: string): string {
    const p = parse(route).path
    return VIEWS[p]?.name ?? p.split("/").filter(Boolean).pop() ?? "the view"
}
