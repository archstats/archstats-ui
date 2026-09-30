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

type Value = { label: string; value: number | string | null; key?: string }
type List = { title: string; items: Array<{ name: string; label?: string; note?: string | number }> }

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
    summary: "A component, a file or the whole codebase read in full: its measures and its strongest neighbours or parts.",
    params: s.object({
        of: s.string().optional().describe("A component or a file; the whole codebase when left out."),
    }, { aliases: { component: "of", file: "of", name: "of", path: "of" } }),

    title: (p, d) => (d ? (d.kind === "codebase" ? "The codebase" : `${d.kind === "file" ? "File" : "Component"} · ${d.name}`) : p.of ?? "The codebase"),

    async resolve(p, { snap }): Promise<ProfileData | Absent> {
        if (!p.of) return codebase(snap)
        const comps = snap.components().map(c => String(c.name)).filter(x => x !== ".")
        const files = [...snap.fileComponent().keys()]
        const asFile = () => { const f = candidates(files, p.of!)[0]; return f ? file(snap, f) : null }
        const asComponent = () => { const c = candidates(comps, p.of!)[0]; return c ? component(snap, c) : null }
        return (looksLikeFile(p.of) ? (await asFile()) ?? asComponent() : asComponent() ?? (await asFile())) ?? { absent: `Nothing is named "${p.of}": no component or file matches.` }
    },

    facts(d) {
        const out: FactDraft[] = []
        out.push({ kind: "total", text: `${d.kind === "codebase" ? "The codebase" : `${d.kind === "file" ? "File" : "Component"} ${d.name}`}: ${d.values.filter(v => v.value !== null).map(v => `${v.label.toLowerCase()} ${typeof v.value === "number" ? n(v.value) : v.value}`).join(", ")}.`, entities: d.kind === "codebase" ? [] : [d.name], values: Object.fromEntries(d.values.filter(v => typeof v.value === "number").map(v => [v.key ?? v.label, v.value as number])) })
        out.push(...d.notes)
        for (const l of d.lists) {
            if (!l.items.length) continue
            out.push({ kind: "row", text: `${l.title}: ${l.items.slice(0, 8).map(i => `${i.label && i.label !== i.name.split("/").pop() ? i.label : i.name}${i.note !== undefined && i.note !== "" ? ` (${typeof i.note === "number" ? n(i.note) : i.note})` : ""}`).join(", ")}${l.items.length > 8 ? `, and ${n(l.items.length - 8)} more` : ""}.`, entities: l.items.slice(0, 8).map(i => i.name), values: {} })
        }
        return out.slice(0, 25)
    },

    elements: d => [...d.values.map(v => ({ id: `measure:${v.label}`, label: v.label })), ...d.lists.flatMap(l => l.items.map(i => ({ id: `item:${i.name}`, label: i.name })))],

    table: d => ({ columns: [{ id: "measure", label: "Measure" }, { id: "value", label: "Value" }], rows: d.values.map(v => ({ measure: v.label, value: v.value })) }),

    figure: {
        load: () => import("~/features/exhibits/components/ExProfile.vue"),
        props: (d, _p, o) => ({ values: d.values, lists: d.lists, path: d.kind === "file" ? d.name : "", highlight: o.highlight, density: o.density }),
        height: (d, o) => 30 + Math.ceil(d.values.length / 2) * 24 + (d.lists.length ? (o.density === "inline" ? 6 : 14) * 20 + 30 : 0),
        picks: { select: (name: string) => `item:${name}` },
    },

    open: (_p, d) => (!d || d.kind === "codebase" ? { route: "/views/snapshot", label: "Open Snapshot" } : d.kind === "file" ? { route: filePath(d.name), label: "Open file" } : { route: componentPath(d.name), label: "Open component" }),

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
        v("lines", "Lines of code", c.complexity__lines), v("files", "Files", c.complexity__files),
        v("dependents", "Components that depend on it", c.modularity__coupling__dependents), v("dependencies", "Components it depends on", c.modularity__coupling__dependencies),
        v("instability", "Instability (0 stable – 1 unstable)", c.modularity__instability), { key: "cycles", label: "Cycles it is in", value: cycles },
        v("commits", "Commits, all time", c.git__commits__total), v("commits_90", "Commits, last 90 days", c.git__commits__last_90_days),
        v("authors", "Authors, all time", c.git__authors__total), v("health", "Code health (10 best)", c.codesmells__code_health),
        v("hotspot", "Hotspot score", c.codesmells__hotspot_score), v("pagerank", "Centrality (PageRank)", c.graph__page_rank),
    ].filter(x => x.value !== null)
    const deps = new Map<string, number>(), users = new Map<string, number>()
    for (const r of snap.connections()) {
        if (r.from === r.to) continue
        const k = Number(r.reference_count) || 1
        if (r.from === name) deps.set(r.to, (deps.get(r.to) ?? 0) + k)
        if (r.to === name) users.set(r.from, (users.get(r.from) ?? 0) + k)
    }
    const top = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([x, refs]) => ({ name: x, note: refs }))
    return { kind: "component", name, values, notes: [], lists: [{ title: "Depends most on (import references)", items: top(deps) }, { title: "Used most by (import references)", items: top(users) }] }
}

async function file(snap: import("~/features/snapshot/snapshot").Snapshot, path: string): Promise<ProfileData> {
    const cols = snap.columns.files ?? []
    const want = ["component", "role", "complexity__lines", "codesmells__code_health", "git__commits__total", "git__commits__last_90_days", "git__authors__total", "git__last_change_age_in_days"].filter(c => cols.includes(c))
    const row = (await snap.query(`SELECT ${want.join(", ")} FROM files WHERE name = ${sq(path)}`))[0] ?? {}
    const values: Value[] = ([
        ["component", "Component", row.component ?? snap.fileComponent().get(path) ?? null],
        ["role", "Role", row.role ?? snap.fileRole(path)],
        ["lines", "Lines", num(row.complexity__lines)], ["health", "Code health (10 best)", num(row.codesmells__code_health)],
        ["commits", "Commits, all time", num(row.git__commits__total)], ["commits_90", "Commits, last 90 days", num(row.git__commits__last_90_days)],
        ["authors", "Authors", num(row.git__authors__total)], ["age", "Days since last change", num(row.git__last_change_age_in_days)],
    ] as Array<[string, string, number | string | null]>).filter(([, , x]) => x !== null).map(([key, label, value]) => ({ key, label, value }))
    const lists: List[] = []
    if ("snippets" in snap.columns) {
        const snips = await snap.query<{ snippet_type: string; begin_position: string; content: string }>(`SELECT snippet_type, begin_position, content FROM snippets WHERE file = ${sq(path)}`)
        const decl = snips.filter(x => isDeclaration(x.snippet_type))
            .map(x => ({ line: Number(String(x.begin_position).split(":")[0]) || 0, text: String(x.content).replace(/\s+/g, " ").slice(0, 80) }))
            .sort((a, b) => a.line - b.line).filter((x, i, all) => i === 0 || x.line !== all[i - 1].line).slice(0, 40)
        lists.push({ title: "Declarations (line)", items: decl.map(x => ({ name: `${path}:${x.line}`, label: x.text, note: x.line })) })
    }
    if ("unit_connections" in snap.columns) {
        const by = (await snap.query<{ f: string }>(`SELECT DISTINCT from_file AS f FROM unit_connections WHERE to_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
        const uses = (await snap.query<{ f: string }>(`SELECT DISTINCT to_file AS f FROM unit_connections WHERE from_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
        lists.push({ title: "Uses files", items: uses.map(f => ({ name: f, label: f.split("/").pop() })) }, { title: "Used by files", items: by.map(f => ({ name: f, label: f.split("/").pop() })) })
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
    const git = "git_commit_info" in snap.columns ? (await snap.query<{ commits: number; first: string; last: string }>("SELECT count(DISTINCT commit_hash) AS commits, min(commit_time) AS first, max(commit_time) AS last FROM git_commit_info"))[0] : null
    const authors = "git_authors" in snap.columns ? Number((await snap.query<{ n: number }>("SELECT count(*) AS n FROM git_authors"))[0]?.n) || 0 : null
    const values: Value[] = [
        { key: "components", label: "Components", value: comps.length }, { key: "files", label: "Files", value: files }, { key: "lines", label: "Lines of code in components", value: lines },
        { key: "tangles", label: "Tangles", value: tangles.length }, { key: "largest_tangle", label: "Components in the largest tangle", value: tangles[0]?.length ?? 0 },
        { key: "cycles", label: "Distinct shortest cycles", value: snap.cycles().length },
        ...(git ? [{ key: "commits", label: "Commits", value: Number(git.commits) }] : []),
        ...(authors !== null ? [{ key: "authors", label: "Authors", value: authors }] : []),
    ]
    const notes: FactDraft[] = []
    if ((snap.columns.files ?? []).includes("role")) {
        const roles = await snap.query<{ role: string; files: number; lines: number }>("SELECT coalesce(role, 'unknown') AS role, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC")
        const total = roles.reduce((sum, r) => sum + (Number(r.lines) || 0), 0) || 1
        // Over every file the scan kept, which is more than the components' lines: say so, so the two totals are never mixed.
        notes.push({ kind: "row", text: `Lines by role, over all ${n(roles.reduce((sum, r) => sum + (Number(r.files) || 0), 0))} files (${n(total)} lines, including files outside components): ${roles.map(r => `${r.role} ${n(Number(r.lines) || 0)} (${Math.round((100 * (Number(r.lines) || 0)) / total)}%)`).join(", ")}.`, entities: [], values: { all_file_lines: total, ...Object.fromEntries(roles.map(r => [r.role, Number(r.lines) || 0])) } })
    } else notes.push({ kind: "absence", text: "This snapshot records no file roles, so production code and tests cannot be told apart.", entities: [], values: {} })
    if (git) notes.push({ kind: "row", text: `History from ${String(git.first).slice(0, 10)} to ${String(git.last).slice(0, 10)}.`, entities: [], values: {} })
    else notes.push({ kind: "absence", text: "This snapshot has no git history.", entities: [], values: {} })
    const lineOf = new Map(comps.map(c => [String(c.name), Number(c.complexity__lines) || 0]))
    const areas = areasOf(names, x => lineOf.get(x) ?? 0)
    const areaLines = areas.keys.map(k => ({ name: k, note: [...areas.of].filter(([, a]) => a === k).reduce((sum, [x]) => sum + (lineOf.get(x) ?? 0), 0) }))
    return {
        kind: "codebase", name: snap.workspace || "the codebase", values, notes,
        lists: [{ title: "Top-level areas (lines)", items: areaLines }, { title: "Largest components (lines)", items: [...comps].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0)).slice(0, 10).map(c => ({ name: String(c.name), note: Number(c.complexity__lines) || 0 })) }],
    }
}
