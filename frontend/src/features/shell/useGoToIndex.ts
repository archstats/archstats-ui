import { shallowRef } from "vue"
import { useAuthorsStore } from "~/features/git/authors.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useReportsStore } from "~/features/reports/reports.store"
import { useConsoleStore } from "~/features/sql/console.store"
import { useStateStore } from "~/platform/state.store"
import { hasCommand, runCommand } from "~/platform/commands"
import { canonicalAuthor, isBotAuthor } from "~/features/git/authors"
import { referenceEntries } from "~/features/snapshot/definition"
import { componentLabel, componentPath, filePath, groupPath, VIEWS } from "~/features/navigation/routes"
import { useAIStore } from "~/features/ai/ai.store"
import { detectSeparator } from "~/features/snapshot/names"
import { SHORTCUTS } from "./shortcuts"
import { GoIndex, type GoItem, type GoKind, type GoTab } from "./goToSearch"
import { t, intlLocale } from "~/shared/i18n"

export type { GoItem, GoKind, GoTab }

// What Go to anything searches, read into one index:
// - the snapshot's parts (components, files, units, functions), read once per
//   snapshot and warmed in the background as soon as it opens, so the first
//   ⇧⇧ is as quick as the tenth;
// - authors, read once per snapshot and named afresh each time (merges and
//   pseudonyms change the label, not the rows);
// - the workspace's own things (views, metrics, groups, lenses, reports,
//   saved queries, actions, workspaces), small and read on every open
//   because they change under a snapshot.

export const KIND_LABEL: Record<GoKind, string> = {
    view: t("shell.useGoToIndex.view"), metric: t("shell.useGoToIndex.metric"), component: t("shell.useGoToIndex.component"),
    file: t("shell.useGoToIndex.file"), unit: t("shell.useGoToIndex.unit"), function: t("shell.useGoToIndex.function"),
    author: t("shell.useGoToIndex.author"), group: t("shell.useGoToIndex.group"), lens: t("shell.useGoToIndex.lens"),
    report: t("shell.useGoToIndex.report"), query: t("shell.useGoToIndex.query"), action: t("shell.useGoToIndex.action"),
    workspace: t("shell.useGoToIndex.workspace"),
}

export const KIND_HEADING: Record<GoKind, string> = {
    view: t("shell.useGoToIndex.views"), metric: t("shell.useGoToIndex.metricReference"), component: t("shell.useGoToIndex.components"),
    file: t("shell.useGoToIndex.files"), unit: t("shell.useGoToIndex.units"), function: t("shell.useGoToIndex.functions"),
    author: t("shell.useGoToIndex.authors"), group: t("shell.useGoToIndex.groups"), lens: t("shell.useGoToIndex.lenses"),
    report: t("shell.useGoToIndex.reports"), query: t("shell.useGoToIndex.savedQueries"), action: t("shell.useGoToIndex.actions"),
    workspace: t("shell.useGoToIndex.workspaces"),
}

export const KIND_ICON: Record<GoKind, string> = {
    view: "layout-list", metric: "info", component: "boxes", file: "file-code", unit: "braces", function: "code",
    author: "user", group: "layers", lens: "eye", report: "file-text", query: "terminal", action: "arrow-right", workspace: "folder",
}

export const TAB_LABEL: Record<GoTab, string> = {
    all: t("shell.useGoToIndex.tabAll"), views: t("shell.useGoToIndex.views"), components: t("shell.useGoToIndex.components"),
    files: t("shell.useGoToIndex.files"), symbols: t("shell.useGoToIndex.tabSymbols"), reports: t("shell.useGoToIndex.reports"),
    actions: t("shell.useGoToIndex.actions"),
}

interface SnapshotPart { key: string; items: GoItem[]; authorRows: AuthorRow[] }
interface AuthorRow { author_name: string; author_email: string | null; n: number }

const snapshot = shallowRef<SnapshotPart | null>(null)
let loading: { key: string; promise: Promise<void> } | null = null

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1)

async function readSnapshot(key: string): Promise<void> {
    const data = useDataStore()
    const items: GoItem[] = []
    const names = data.allComponents.map(c => c.name)
    const sep = detectSeparator(names)
    const project = useWorkspacesStore().active?.name ?? ""
    for (const name of names) {
        items.push({ kind: "component", key: name, label: componentLabel(name, project), tail: sep ? name.lastIndexOf(sep) : -1, to: componentPath(name) })
    }
    const roles = data.fileRoleIndex
    for (const f of data._fileComponents) {
        const slash = f.name.lastIndexOf("/")
        items.push({ kind: "file", key: f.name, label: f.name.slice(slash + 1), text: f.name, detail: slash > 0 ? f.name.slice(0, slash) : undefined, to: filePath(f.name), file: f.name, test: roles.get(f.name) === "test" })
    }
    try {
        const units = await data.query<{ name: string; kind: string; owner: string | null; file: string | null }>(
            `SELECT name, kind, owner, file FROM units WHERE file IS NOT NULL AND file != '' LIMIT 50000`)
        for (const u of units) {
            // A Java type is its file: the file row already answers "OrderServiceImpl".
            if (!u.owner && base(u.file!).replace(/\.[^.]+$/, "") === u.name) continue
            const owner = u.owner ? `${u.owner}.` : ""
            items.push({ kind: "unit", key: `${u.file}#${owner}${u.name}`, label: `${owner}${u.name}`, tail: owner.length - 1, detail: `${u.kind} · ${base(u.file!)}`, to: filePath(u.file!), file: u.file!, test: roles.get(u.file!) === "test" })
        }
    } catch { /* snapshots from before units */ }
    try {
        // Functions carry their owner in the name ("Address.getCity"); the
        // part after the last dot is what a person types first. A class copied
        // across modules repeats its functions, so the component is named too.
        const fns = await data.query<{ file: string; name: string; begin_line: number; end_line: number; component: string | null }>(
            `SELECT file, name, begin_line, end_line, component FROM functions WHERE name != '' LIMIT 200000`)
        for (const f of fns) {
            const range = f.end_line > f.begin_line ? `#L${f.begin_line}-L${f.end_line}` : `#L${f.begin_line}`
            items.push({ kind: "function", key: `${f.file}#${f.name}@${f.begin_line}`, label: f.name, tail: f.name.lastIndexOf("."), detail: f.component ? `${base(f.file)}:${f.begin_line} · ${componentLabel(f.component, project)}` : `${base(f.file)}:${f.begin_line}`, to: filePath(f.file, "source") + range, file: f.file, test: roles.get(f.file) === "test" })
        }
    } catch { /* snapshots from before functions */ }
    let authorRows: AuthorRow[] = []
    try { authorRows = await data.query(`SELECT author_name, author_email, git__commits__total AS n FROM git_authors`) } catch { /* no git */ }
    // A snapshot opened meanwhile has its own read under way; this one is stale.
    if (String(useDataStore().datasetKey ?? "") !== key) return
    snapshot.value = { key, items, authorRows }
}

/**
 * Reads the open snapshot's part of the index unless it is read already.
 * Called when a snapshot opens (in the background) and when the palette opens.
 */
export function warmGoToIndex(): Promise<void> {
    const data = useDataStore()
    if (!data.hasData) return Promise.resolve()
    const key = String(data.datasetKey ?? "")
    if (snapshot.value?.key === key) return Promise.resolve()
    if (loading?.key !== key) {
        const promise = readSnapshot(key).finally(() => { if (loading?.promise === promise) loading = null })
        loading = { key, promise }
    }
    return loading.promise
}

/** Whether the open snapshot's part is read. */
export function goToIndexReady(): boolean {
    return !!snapshot.value && snapshot.value.key === String(useDataStore().datasetKey ?? "")
}

function authorItems(rows: AuthorRow[]): GoItem[] {
    const authors = useAuthorsStore()
    const byName = new Map<string, number>()
    for (const r of rows) {
        if (!r.author_name || (!authors.showBots && isBotAuthor(r.author_name, r.author_email))) continue
        const c = canonicalAuthor(authors.aliases, r.author_name)
        byName.set(c, (byName.get(c) ?? 0) + Number(r.n || 0))
    }
    // Pseudonymised, the label is all there is to match: real names are not searchable.
    return [...byName].map(([name, n]) => {
        const label = authors.display(name)
        return { kind: "author" as const, key: label, label, detail: t("shell.useGoToIndex.commits", { value: n.toLocaleString(intlLocale) }), to: authors.authorPath(name) }
    })
}

/** Commands the palette offers besides those with a shortcut. */
const MORE_ACTIONS: Array<{ id: string; label: string }> = [
    { id: "add-to-report", label: t("shell.useGoToIndex.addToReport") },
    { id: "snapshot:reveal", label: t("shell.useGoToIndex.revealSnapshot") },
    { id: "snapshot:save", label: t("shell.useGoToIndex.saveSnapshotCopy") },
]

interface Navigation { push(to: string): unknown }

function liveItems(router: Navigation): GoItem[] {
    const data = useDataStore()
    const groups = useGroupsStore()
    const workspaces = useWorkspacesStore()
    const reports = useReportsStore()
    const state = useStateStore()
    // Ask is a view only while AI features are on.
    const ai = useAIStore()
    const out: GoItem[] = VIEWS.filter(v => ai.enabled || v.to !== "/views/ask").map(v => ({ kind: "view" as const, key: v.to, label: v.label, text: v.also ? `${v.label} ${v.also}` : v.label, tail: -1, to: v.to }))
    for (const e of referenceEntries(data.definitions.values())) {
        out.push({ kind: "metric", key: e.id, label: e.name, text: `${e.name} ${e.id}`, tail: -1, detail: e.category, to: `/views/reference?m=${encodeURIComponent(e.id)}` })
    }
    for (const d of groups.dimensions) out.push({ kind: "lens", key: d, label: d, tail: -1, detail: t("shell.useGoToIndex.colourEveryViewLens"), lens: d })
    for (const g of groups.groups) out.push({ kind: "group", key: g.id, label: g.name, tail: -1, detail: g.dimension, group: g.id, to: groupPath(g.id) })

    const ws = workspaces.active
    if (ws && reports.workspace === ws.id) {
        for (const r of reports.list) {
            const title = r.title || t("reports.reportsStore.untitledReport")
            out.push({ kind: "report", key: r.id, label: title, tail: -1, run: () => { reports.open(r.id); return router.push("/views/evidence") } })
        }
    }
    const saved = state.get<Array<{ id: string; name: string; sql: string }>>("queries.saved", []) ?? []
    for (const q of saved) {
        if (!q?.id || !q.name) continue
        out.push({ kind: "query", key: q.id, label: q.name, tail: -1, detail: q.sql.replace(/\s+/g, " ").slice(0, 80), run: () => { const c = useConsoleStore(); c.ensure(); c.openSaved(q); return router.push("/views/query") } })
    }

    for (const s of SHORTCUTS) {
        if (!s.command || s.command === "goto" || !hasCommand(s.command)) continue
        out.push({ kind: "action", key: s.command, label: s.label, tail: -1, keys: s.keys, run: () => { void runCommand(s.command!) } })
    }
    for (const a of MORE_ACTIONS) {
        if (!hasCommand(a.id)) continue
        out.push({ kind: "action", key: a.id, label: a.label, tail: -1, run: () => { void runCommand(a.id) } })
    }
    if (ws) {
        out.push({ kind: "action", key: "report:new", label: t("shell.useGoToIndex.newReport"), tail: -1, run: async () => { if (reports.workspace !== ws.id) await reports.load(ws.id); await reports.create(); await router.push("/views/evidence") } })
        out.push({ kind: "action", key: "console:new", label: t("shell.useGoToIndex.newQuery"), tail: -1, run: () => { const c = useConsoleStore(); c.ensure(); c.open({ sql: "" }); return router.push("/views/query") } })
    }
    for (const w of workspaces.workspaces) {
        if (w.id === workspaces.activeWorkspaceId) continue
        out.push({ kind: "workspace", key: w.id, label: w.name, tail: -1, detail: t("shell.useGoToIndex.switchWorkspace"), run: async () => { await workspaces.select(w.id); await router.push("/") } })
    }
    return out
}

/**
 * The index the palette searches. `prepare` builds it from what is read now
 * (instantly, from the warmed snapshot part); `refresh` rebuilds it once the
 * snapshot part arrives, for a palette opened before it did.
 */
export function useGoToIndex(router: Navigation) {
    const index = shallowRef<GoIndex>(new GoIndex([]))

    function build() {
        const part = goToIndexReady() ? snapshot.value : null
        index.value = new GoIndex([...liveItems(router), ...(part?.items ?? []), ...authorItems(part?.authorRows ?? [])])
    }

    /** Builds from what is at hand, then again once the snapshot part is read. */
    async function prepare(): Promise<void> {
        const ws = useWorkspacesStore().active
        const reports = useReportsStore()
        if (ws && reports.workspace !== ws.id) void reports.load(ws.id).then(() => build()).catch(() => {})
        build()
        if (!goToIndexReady()) {
            await warmGoToIndex()
            build()
        }
    }

    return { index, prepare }
}
