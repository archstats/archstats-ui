// One thing read in full: a component (its measures and its strongest
// neighbours), a file (its measures, declarations and imports both ways), or
// the whole codebase (size, roles, areas, tangles, history) when nothing is
// named.

import { cycleCountsByComponent } from "~/features/cycles/cycles"
import { foldEdges, tanglesOf } from "~/features/cycles/untangle"
import { componentPath, filePath } from "~/features/navigation/routes"
import { areasOf } from "~/features/snapshot/areas"
import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num, plural, sq } from "~/features/exhibits/words"
import { ROLE_LABELS, type FileRole } from "~/features/snapshot/languages"
import { t } from "~/shared/i18n"

type Value = { label: string; value: number | string | null; key?: string }
type List = { title: string; items: Array<{ name: string; label?: string; note?: string | number }>; /** The note is a line number: it leads the row. */ lead?: boolean }

export interface ProfileData {
    kind: "codebase" | "component" | "file"
    name: string
    values: Value[]
    lists: List[]
    /** Extra statements that are not a measure (roles, areas, what is missing). */
    notes: FactDraft[]
}

const looksLikeFile = (x: string) => /\/|\.[a-z0-9]{1,6}$/i.test(x.trim())

function isDeclaration(type: string): boolean {
    if (/import|modularity__/.test(type)) return false
    return /declaration|definition|span|function|method|class|interface|struct|enum|type|trait|protocol|annotation|route|endpoint/.test(type)
}

export const profile = exhibit<ProfileData>()({
    kind: "profile", v: 1,
    summary: t("exhibit-catalog.profile.componentFileWholeCodebase"),
    params: s.object({
        of: s.string().optional().describe(t("exhibit-catalog.profile.componentFileWholeCodebase2")),
    }, { aliases: { component: "of", file: "of", name: "of", path: "of" } }),

    title: (p, d) => (d ? (d.kind === "codebase" ? t("exhibit-catalog.profile.codebase") : `${d.kind === "file" ? t("exhibit-catalog.profile.file") : t("exhibit-catalog.profile.component")} · ${d.kind === "file" ? d.name.split("/").pop() : d.name}`) : p.of ?? t("exhibit-catalog.profile.codebase")),

    async resolve(p, { snap }): Promise<ProfileData | Absent> {
        if (!p.of) return codebase(snap)
        const comps = snap.components().map(c => String(c.name)).filter(x => x !== ".")
        const files = [...snap.fileComponent().keys()]
        const asFile = () => { const f = candidates(files, p.of!)[0]; return f ? file(snap, f) : null }
        const asComponent = () => { const c = candidates(comps, p.of!)[0]; return c ? component(snap, c) : null }
        return (looksLikeFile(p.of) ? (await asFile()) ?? asComponent() : asComponent() ?? (await asFile())) ?? { absent: t("exhibit-catalog.profile.nothingNamedNoComponent", { of: p.of }) }
    },

    facts(d) {
        const out: FactDraft[] = []
        out.push({ kind: "total", text: `${d.kind === "codebase" ? t("exhibit-catalog.profile.codebase") : `${d.kind === "file" ? t("exhibit-catalog.profile.file") : t("exhibit-catalog.profile.component")} ${d.name}`}: ${d.values.filter(v => v.value !== null).map(v => `${v.label.toLowerCase()} ${typeof v.value === "number" ? n(v.value) : v.value}`).join(", ")}.`, entities: d.kind === "codebase" ? [] : [d.name], values: Object.fromEntries(d.values.filter(v => typeof v.value === "number").map(v => [v.key ?? v.label, v.value as number])) })
        out.push(...d.notes)
        for (const l of d.lists) {
            if (!l.items.length) continue
            out.push({ kind: "row", text: `${l.title}: ${l.items.slice(0, 8).map(i => `${i.label && i.label !== i.name.split("/").pop() ? i.label : i.name}${i.note !== undefined && i.note !== "" ? ` (${typeof i.note === "number" ? n(i.note) : i.note})` : ""}`).join(", ")}${l.items.length > 8 ? t("exhibit-catalog.profile.more", { value: n(l.items.length - 8) }) : ""}.`, entities: l.items.slice(0, 8).map(i => i.name), values: {} })
        }
        return out.slice(0, 25)
    },

    elements: d => [...d.values.map(v => ({ id: `measure:${v.label}`, label: v.label })), ...d.lists.flatMap(l => l.items.map(i => ({ id: `item:${i.name}`, label: i.name })))],

    table: d => ({ columns: [{ id: "measure", label: t("exhibit-catalog.profile.measure") }, { id: "value", label: t("exhibit-catalog.profile.value") }], rows: d.values.map(v => ({ measure: v.label, value: v.value })) }),

    figure: {
        load: () => import("~/features/exhibits/components/ExProfile.vue"),
        props: (d, _p, o) => ({ values: d.values.map(v => (v.key === "role" && typeof v.value === "string" ? { ...v, value: ROLE_LABELS[v.value as FileRole] ?? v.value } : v)), lists: d.lists, path: d.kind === "file" ? d.name : "", subject: d.kind === "component" ? d.name : "", highlight: o.highlight, density: o.density }),
        height: (d, o) => 40 + Math.ceil(d.values.filter(v => typeof v.value === "number").length / 2) * 26 + (d.lists.length ? (o.density === "inline" ? 6 : 14) * 22 + 30 : 0),
        picks: { select: (name: string) => `item:${name}` },
    },

    open: (_p, d) => (!d || d.kind === "codebase" ? { route: "/views/snapshot", label: t("exhibit-catalog.profile.openSnapshot") } : d.kind === "file" ? { route: filePath(d.name), label: t("exhibit-catalog.profile.openFile") } : { route: componentPath(d.name), label: t("exhibit-catalog.profile.openComponent") }),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
        const f = [...snap.fileComponent().keys()].sort()[0]
        return [...(big ? [{ of: String(big.name) }] : []), ...(f ? [{ of: f }] : []), { of: "zz-nothing-zz" }]
    },
})

function component(snap: import("~/features/snapshot/snapshot").Snapshot, name: string): ProfileData {
    const c = snap.components().find(x => x.name === name)!
    const cycles = cycleCountsByComponent(snap.cycles()).get(name) ?? 0
    const v = (key: string, label: string, value: unknown): Value => ({ key, label, value: num(value) })
    const values = [
        v("lines", t("exhibit-catalog.profile.linesCode"), c.complexity__lines), v("files", t("exhibit-catalog.profile.files"), c.complexity__files),
        v("dependents", t("exhibit-catalog.profile.componentsDepend"), c.modularity__coupling__dependents), v("dependencies", t("exhibit-catalog.profile.componentsDepends"), c.modularity__coupling__dependencies),
        v("instability", t("exhibit-catalog.profile.instability0Stable1"), c.modularity__instability), { key: "cycles", label: t("exhibit-catalog.profile.cycles"), value: cycles },
        v("commits", t("exhibit-catalog.profile.commitsAllTime"), c.git__commits__total), v("commits_90", t("exhibit-catalog.profile.commitsLast90Days"), c.git__commits__last_90_days),
        v("authors", t("exhibit-catalog.profile.authorsAllTime"), c.git__authors__total), v("health", t("exhibit-catalog.profile.codeHealth10Best"), c.codesmells__code_health),
        v("hotspot", t("exhibit-catalog.profile.hotspotScore"), c.codesmells__hotspot_score), v("pagerank", t("exhibit-catalog.profile.centralityPagerank"), c.graph__page_rank),
    ].filter(x => x.value !== null)
    const deps = new Map<string, number>(), users = new Map<string, number>()
    for (const r of snap.connections()) {
        if (r.from === r.to) continue
        const k = Number(r.reference_count) || 1
        if (r.from === name) deps.set(r.to, (deps.get(r.to) ?? 0) + k)
        if (r.to === name) users.set(r.from, (users.get(r.from) ?? 0) + k)
    }
    const top = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([x, refs]) => ({ name: x, note: refs }))
    return { kind: "component", name, values, notes: [], lists: [{ title: t("exhibit-catalog.profile.dependsMostImportReferences"), items: top(deps) }, { title: t("exhibit-catalog.profile.usedMostImportReferences"), items: top(users) }] }
}

async function file(snap: import("~/features/snapshot/snapshot").Snapshot, path: string): Promise<ProfileData> {
    const cols = snap.columns.files ?? []
    const want = ["component", "role", "complexity__lines", "codesmells__code_health", "git__commits__total", "git__commits__last_90_days", "git__authors__total", "git__last_change_age_in_days"].filter(c => cols.includes(c))
    const row = (await snap.query(`SELECT ${want.join(", ")} FROM files WHERE name = ${sq(path)}`))[0] ?? {}
    const values: Value[] = ([
        ["component", t("exhibit-catalog.profile.component"), row.component ?? snap.fileComponent().get(path) ?? null],
        ["role", t("exhibit-catalog.profile.role"), row.role ?? snap.fileRole(path)],
        ["lines", t("exhibit-catalog.profile.lines"), num(row.complexity__lines)], ["health", t("exhibit-catalog.profile.codeHealth10Best"), num(row.codesmells__code_health)],
        ["commits", t("exhibit-catalog.profile.commitsAllTime"), num(row.git__commits__total)], ["commits_90", t("exhibit-catalog.profile.commitsLast90Days"), num(row.git__commits__last_90_days)],
        ["authors", t("exhibit-catalog.profile.authors"), num(row.git__authors__total)], ["age", t("exhibit-catalog.profile.daysSinceLastChange"), num(row.git__last_change_age_in_days)],
    ] as Array<[string, string, number | string | null]>).filter(([, , x]) => x !== null).map(([key, label, value]) => ({ key, label, value }))
    const lists: List[] = []
    if ("snippets" in snap.columns) {
        const snips = await snap.query<{ snippet_type: string; begin_position: string; content: string }>(`SELECT snippet_type, begin_position, content FROM snippets WHERE file = ${sq(path)}`)
        const decl = snips.filter(x => isDeclaration(x.snippet_type))
            .map(x => ({ line: Number(String(x.begin_position).split(":")[0]) || 0, text: String(x.content).replace(/\s+/g, " ").slice(0, 80) }))
            .sort((a, b) => a.line - b.line).filter((x, i, all) => i === 0 || x.line !== all[i - 1].line).slice(0, 40)
        lists.push({ title: t("exhibit-catalog.profile.declarationsLine"), items: decl.map(x => ({ name: `${path}:${x.line}`, label: x.text, note: x.line })), lead: true })
    }
    if ("unit_connections" in snap.columns) {
        const by = (await snap.query<{ f: string }>(`SELECT DISTINCT from_file AS f FROM unit_connections WHERE to_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
        const uses = (await snap.query<{ f: string }>(`SELECT DISTINCT to_file AS f FROM unit_connections WHERE from_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
        lists.push({ title: t("exhibit-catalog.profile.usesFiles"), items: uses.map(f => ({ name: f, label: f.split("/").pop() })) }, { title: t("exhibit-catalog.profile.usedFiles"), items: by.map(f => ({ name: f, label: f.split("/").pop() })) })
    }
    return { kind: "file", name: path, values, lists, notes: [] }
}

async function codebase(snap: import("~/features/snapshot/snapshot").Snapshot): Promise<ProfileData> {
    const comps = snap.components().filter(c => c.name !== ".")
    const names = comps.map(c => String(c.name))
    const lines = comps.reduce((sum, c) => sum + (Number(c.complexity__lines) || 0), 0)
    const files = Number((await snap.query<{ n: number }>("SELECT count(*) AS n FROM files"))[0]?.n) || 0
    const edges = foldEdges(snap.connections())
    const tangles = tanglesOf(new Set([...names, ...edges.flatMap(e => [e.from, e.to])]), edges).sort((a, b) => b.length - a.length)
    // Listed is not always there: an older snapshot can name the table and not hold it. History is then left out, not the profile.
    const git = "git_commit_info" in snap.columns ? await snap.query<{ commits: number; first: string; last: string }>("SELECT count(DISTINCT commit_hash) AS commits, min(commit_time) AS first, max(commit_time) AS last FROM git_commit_info").then(r => r[0] ?? null, () => null) : null
    const authors = "git_authors" in snap.columns ? Number((await snap.query<{ n: number }>("SELECT count(*) AS n FROM git_authors"))[0]?.n) || 0 : null
    const values: Value[] = [
        { key: "components", label: t("exhibit-catalog.profile.components"), value: comps.length }, { key: "files", label: t("exhibit-catalog.profile.files"), value: files }, { key: "lines", label: t("exhibit-catalog.profile.linesCodeComponents"), value: lines },
        { key: "tangles", label: t("exhibit-catalog.profile.tangles"), value: tangles.length }, { key: "largest_tangle", label: t("exhibit-catalog.profile.componentsLargestTangle"), value: tangles[0]?.length ?? 0 },
        { key: "cycles", label: t("exhibit-catalog.profile.distinctShortestCycles"), value: snap.cycles().length },
        ...(git ? [{ key: "commits", label: t("exhibit-catalog.profile.commits"), value: Number(git.commits) }] : []),
        ...(authors !== null ? [{ key: "authors", label: t("exhibit-catalog.profile.authors"), value: authors }] : []),
    ]
    const notes: FactDraft[] = []
    if ((snap.columns.files ?? []).includes("role")) {
        const roles = await snap.query<{ role: string; files: number; lines: number }>("SELECT coalesce(role, 'unknown') AS role, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC")
        const total = roles.reduce((sum, r) => sum + (Number(r.lines) || 0), 0) || 1
        // Over every file the scan kept, which is more than the components' lines: say so, so the two totals are never mixed.
        notes.push({ kind: "row", text: t("exhibit-catalog.profile.linesRoleOverAll", { reduce: n(roles.reduce((sum, r) => sum + (Number(r.files) || 0), 0)), total: n(total), value: roles.map(r => `${r.role} ${n(Number(r.lines) || 0)} (${Math.round((100 * (Number(r.lines) || 0)) / total)}%)`).join(", ") }), entities: [], values: { all_file_lines: total, ...Object.fromEntries(roles.map(r => [r.role, Number(r.lines) || 0])) } })
    } else notes.push({ kind: "absence", text: t("exhibit-catalog.profile.snapshotRecordsNoFile"), entities: [], values: {} })
    if (git) notes.push({ kind: "row", text: t("exhibit-catalog.profile.history", { slice: String(git.first).slice(0, 10), slice2: String(git.last).slice(0, 10) }), entities: [], values: {} })
    else notes.push({ kind: "absence", text: t("exhibit-catalog.profile.snapshotHasNoGit"), entities: [], values: {} })
    const lineOf = new Map(comps.map(c => [String(c.name), Number(c.complexity__lines) || 0]))
    const areas = areasOf(names, x => lineOf.get(x) ?? 0)
    const areaLines = areas.keys.map(k => ({ name: k, note: [...areas.of].filter(([, a]) => a === k).reduce((sum, [x]) => sum + (lineOf.get(x) ?? 0), 0) }))
    return {
        kind: "codebase", name: snap.workspace || t("exhibit-catalog.profile.codebase2"), values, notes,
        lists: [{ title: t("exhibit-catalog.profile.topLevelAreasLines"), items: areaLines }, { title: t("exhibit-catalog.profile.largestComponentsLines"), items: [...comps].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0)).slice(0, 10).map(c => ({ name: String(c.name), note: Number(c.complexity__lines) || 0 })) }],
    }
}
