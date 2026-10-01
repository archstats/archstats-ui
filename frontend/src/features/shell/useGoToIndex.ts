import { shallowRef } from "vue"
import { useAuthorsStore } from "~/features/git/authors.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { canonicalAuthor, isBotAuthor } from "~/features/git/authors"
import { referenceEntries } from "~/features/snapshot/definition"
import { fuzzyScore } from "~/shared/fuzzy"
import { componentLabel, componentPath, filePath, groupPath, VIEWS } from "~/features/navigation/routes"
import { useAIStore } from "~/features/ai/ai.store"
import { detectSeparator } from "~/features/snapshot/names"
import { t, intlLocale } from "~/shared/i18n"

// What Go to anything searches: views, metric definitions, components, files,
// units, authors, groups and lenses. The snapshot's parts are read once per
// snapshot, on first open; groups, lenses and author names are read each time,
// because they change under a snapshot (a merge, a new group, pseudonyms).

export type GoKind = "view" | "metric" | "component" | "file" | "unit" | "author" | "group" | "lens"

export interface GoItem {
    kind: GoKind
    /** Stable within a workspace, for recents. */
    key: string
    label: string
    /** What the label is matched as, when it differs (a unit's owner, a view's other names). */
    text?: string
    /** Where the last segment of `text` starts. */
    tail?: number
    detail?: string
    to?: string
    /** Scope to a group, or switch lens, instead of navigating. */
    group?: string
    lens?: string
    /** Test code ranks below the code it tests. */
    test?: boolean
}

export const KIND_LABEL: Record<GoKind, string> = {
    view: t("shell.useGoToIndex.view"), metric: "Metric", component: t("shell.useGoToIndex.component"), file: "File",
    unit: "Unit", author: t("shell.useGoToIndex.author"), group: "Group", lens: t("shell.useGoToIndex.lens"),
}

export const KIND_HEADING: Record<GoKind, string> = {
    view: t("shell.useGoToIndex.views"), metric: "Metric reference", component: t("shell.useGoToIndex.components"), file: "Files",
    unit: "Units", author: t("shell.useGoToIndex.authors"), group: "Groups", lens: t("shell.useGoToIndex.lenses"),
}

interface SnapshotIndex { key: string; items: GoItem[] }
const cache = shallowRef<SnapshotIndex | null>(null)
let loading: Promise<void> | null = null

async function loadSnapshotItems(): Promise<void> {
    const data = useDataStore()
    const key = String(data.datasetKey ?? "")
    if (cache.value?.key === key) return
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
        items.push({ kind: "file", key: f.name, label: f.name.slice(slash + 1), text: f.name, detail: slash > 0 ? f.name.slice(0, slash) : undefined, to: filePath(f.name), test: roles.get(f.name) === "test" })
    }
    try {
        const units = await data.query<{ name: string; kind: string; owner: string | null; file: string | null; }>(
            `SELECT name, kind, owner, file FROM units WHERE file IS NOT NULL AND file != '' LIMIT 50000`)
        for (const u of units) {
            // A Java type is its file: the file row already answers "OrderServiceImpl".
            if (!u.owner && u.file!.slice(u.file!.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "") === u.name) continue
            const owner = u.owner ? `${u.owner}.` : ""
            items.push({ kind: "unit", key: `${u.file}#${owner}${u.name}`, label: `${owner}${u.name}`, tail: owner.length - 1, detail: `${u.kind} · ${u.file!.slice(u.file!.lastIndexOf("/") + 1)}`, to: filePath(u.file!), test: roles.get(u.file!) === "test" })
        }
    } catch { /* snapshots from before units */ }
    cache.value = { key, items }
}

async function authorItems(): Promise<GoItem[]> {
    const data = useDataStore()
    const authors = useAuthorsStore()
    let rows: Array<{ author_name: string; author_email: string | null; n: number }> = []
    try { rows = await data.query(`SELECT author_name, author_email, git__commits__total AS n FROM git_authors`) } catch { return [] }
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

function liveItems(): GoItem[] {
    const data = useDataStore()
    const groups = useGroupsStore()
    // Ask is a view only while AI features are on.
    const ai = useAIStore()
    const out: GoItem[] = VIEWS.filter(v => ai.enabled || v.to !== "/views/ask").map(v => ({ kind: "view" as const, key: v.to, label: v.label, text: v.also ? `${v.label} ${v.also}` : v.label, tail: -1, to: v.to }))
    for (const e of referenceEntries(data.definitions.values())) {
        out.push({ kind: "metric", key: e.id, label: e.name, text: `${e.name} ${e.id}`, tail: -1, detail: e.category, to: `/views/reference?m=${encodeURIComponent(e.id)}` })
    }
    for (const d of groups.dimensions) out.push({ kind: "lens", key: d, label: d, tail: -1, detail: t("shell.useGoToIndex.colourEveryViewLens"), lens: d })
    for (const g of groups.groups) out.push({ kind: "group", key: g.id, label: g.name, tail: -1, detail: g.dimension, group: g.id, to: groupPath(g.id) })
    return out
}

export function useGoToIndex() {
    let authors: GoItem[] = []
    let all: GoItem[] = []

    /** Reads what the index needs; the snapshot's part only once per snapshot. */
    async function prepare(): Promise<void> {
        loading ??= loadSnapshotItems().finally(() => { loading = null })
        await loading
        authors = await authorItems()
        all = [...liveItems(), ...(cache.value?.items ?? []), ...authors]
    }

    function search(query: string, limit = 50): GoItem[] {
        const q = query.trim()
        if (!q) return []
        const scored: Array<{ item: GoItem; score: number }> = []
        for (const item of all) {
            const s = fuzzyScore(q, item.text ?? item.label, item.tail)
            if (s === null) continue
            // Views and definitions are few and named on purpose: a small lift keeps them above a file that merely contains the letters.
            scored.push({ item, score: s + (item.kind === "view" || item.kind === "lens" || item.kind === "group" ? 2 : 0) - (item.test ? 4 : 0) })
        }
        return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.item)
    }

    function find(kind: GoKind, key: string): GoItem | undefined {
        return all.find(i => i.kind === kind && i.key === key)
    }

    return { prepare, search, find }
}
