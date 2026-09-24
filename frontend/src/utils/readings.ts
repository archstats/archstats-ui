// Readings: facts about a snapshot written out as a paragraph. A template's
// prose is made of these; each is a cell, so it runs again on a newer
// snapshot and says what moved. A reading states what the snapshot holds,
// counted the way the views count it, and stops there: no verdicts, no
// advice. The interpretation is the writer's, prompted, never generated.

import { knowledgeSql, type AliasMap } from "~/utils/authors"
import { languageOfPath } from "~/utils/languages"
import { libraries, ownPrefixes, type ImportRow } from "~/utils/libraries"
import type { ReadingOutput } from "~/utils/reportDoc"

export interface ReadingContext {
    query: (sql: string) => Promise<any[]>
    revision: number
    label: (id: string) => string
    aliases: AliasMap
}

export interface ReadingDef {
    id: string
    label: string
    /** What it counts and from where, for the cell pane. */
    describe: string
    /** Parameters it takes, with their choices; the first is the default. */
    params?: Array<{ id: string; label: string; choices?: Array<{ value: string; label: string }>; kind?: "component" }>
    run: (ctx: ReadingContext, params: Record<string, string>) => Promise<ReadingOutput>
}

// ── Formatting ────────────────────────────────────────────────────────────

const n = (v: number) => Math.round(v).toLocaleString("en-US")
const pct = (part: number, whole: number) => {
    if (!whole) return "0%"
    const p = (100 * part) / whole
    return p > 0 && p < 1 ? "under 1%" : `${Math.round(p)}%`
}
const code = (s: string) => `\`${s.replace(/`/g, "'")}\``
const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`
const b = (s: string) => `**${s}**`
/** "a, b and c". */
export function listOf(items: string[]): string {
    if (items.length <= 1) return items.join("")
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}
const years = (days: number) => (days >= 730 ? `${(days / 365.25).toFixed(1)} years` : days >= 60 ? `${Math.round(days / 30.4)} months` : plural(days, "day"))
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
/** Per 100, as a reader says it: "under 1", "3", "56". */
const ratio = (part: number, whole: number) => { const r = (100 * part) / Math.max(1, whole); return r > 0 && r < 1 ? "under 1" : n(r) }
const absent = (text: string): ReadingOutput => ({ text, values: {}, absent: true })

// ── What the snapshot holds ───────────────────────────────────────────────

export interface SnapshotFacts {
    tables: Set<string>
    fileColumns: Set<string>
    componentColumns: Set<string>
    summary: Record<string, number>
    snapshot: Record<string, string>
    /** Files and lines by role; every file is production when the snapshot has no roles. */
    roles: Record<string, { files: number; lines: number }>
    production: { files: number; lines: number }
    /** Production lines by language, largest first. */
    languages: Array<{ language: string; files: number; lines: number }>
    components: number
    moduleKinds: Record<string, number>
    commits: number
    authors: number
    rules: { applicable: number; violations: number }
    tangles: number
    /** Files that import react; the engine's component count alone also counts plain functions. */
    reactImporters: number
}

const probes = new WeakMap<ReadingContext, Promise<SnapshotFacts>>()

/** What the snapshot has, read once per run context. */
export function probe(ctx: ReadingContext): Promise<SnapshotFacts> {
    let p = probes.get(ctx)
    if (!p) { p = readFacts(ctx); probes.set(ctx, p) }
    return p
}

async function readFacts(ctx: ReadingContext): Promise<SnapshotFacts> {
    const q = async (sql: string) => { try { return await ctx.query(sql) } catch { return [] } }
    const tables = new Set((await q(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view')`)).map(r => String(r.name)))
    const cols = async (t: string) => (tables.has(t) ? new Set((await q(`SELECT name FROM pragma_table_info('${t}')`)).map(r => String(r.name))) : new Set<string>())
    const fileColumns = await cols("files")
    const componentColumns = await cols("components")
    const summary: Record<string, number> = {}
    for (const r of tables.has("summary") ? await q(`SELECT name, value FROM summary`) : []) {
        const v = Number(r.value)
        if (Number.isFinite(v)) summary[String(r.name)] = v
    }
    const snapshot: Record<string, string> = {}
    for (const r of tables.has("_snapshot") ? await q(`SELECT key, value FROM _snapshot`) : []) snapshot[String(r.key)] = String(r.value ?? "")

    const hasRole = fileColumns.has("role")
    const files = tables.has("files") ? await q(`SELECT name, coalesce(complexity__lines, 0) AS lines${hasRole ? ", role" : ""} FROM files`) : []
    const roles: SnapshotFacts["roles"] = {}
    const langs = new Map<string, { files: number; lines: number }>()
    for (const f of files) {
        const role = hasRole ? String(f.role || "production") : "production"
        const lines = Number(f.lines) || 0
        const r = (roles[role] ??= { files: 0, lines: 0 })
        r.files++
        r.lines += lines
        if (role !== "production") continue
        const l = languageOfPath(String(f.name))
        const e = langs.get(l) ?? { files: 0, lines: 0 }
        e.files++
        e.lines += lines
        langs.set(l, e)
    }
    const moduleKinds: Record<string, number> = {}
    for (const r of tables.has("modules") ? await q(`SELECT kind, count(*) AS c FROM modules GROUP BY kind`) : []) moduleKinds[String(r.kind)] = Number(r.c) || 0
    const [rules] = tables.has("rules") ? await q(`SELECT coalesce(sum(status <> 'not_applicable'), 0) AS applicable, coalesce(sum(status = 'violation'), 0) AS violations FROM rules`) : [null]
    const [t] = tables.has("component_strongly_connected_groups") ? await q(`SELECT count(*) AS c FROM (SELECT "group" FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1)`) : [null]
    const [c] = tables.has("components") ? await q(`SELECT count(*) AS c FROM components WHERE name <> '.'`) : [null]
    const [react] = tables.has("snippets") ? await q(`SELECT count(DISTINCT file) AS c FROM snippets WHERE snippet_type = 'modularity__component__imports' AND (content = 'react' OR content LIKE 'react/%')`) : [null]
    return {
        tables, fileColumns, componentColumns, summary, snapshot, roles,
        production: roles.production ?? { files: 0, lines: 0 },
        languages: [...langs].map(([language, v]) => ({ language, ...v })).sort((a, b) => b.lines - a.lines),
        components: Number(c?.c) || 0,
        moduleKinds,
        commits: summary.git__commits__total ?? 0,
        authors: summary.git__authors__total ?? 0,
        rules: { applicable: Number(rules?.applicable) || 0, violations: Number(rules?.violations) || 0 },
        tangles: Number(t?.c) || 0,
        reactImporters: Number(react?.c) || 0,
    }
}

// ── Ecosystems ────────────────────────────────────────────────────────────

export type EcosystemId = "spring" | "jvm" | "django" | "python" | "node" | "react" | "go" | "dotnet" | "php"

export interface Ecosystem { id: EcosystemId; label: string; why: string }

const MODULE_WORDS: Record<string, [string, string]> = {
    maven: ["Maven module", "Maven modules"], gradle: ["Gradle project", "Gradle projects"],
    node: ["npm package", "npm packages"], go: ["Go module", "Go modules"],
    composer: ["Composer package", "Composer packages"], dotnet: [".NET project", ".NET projects"],
    django: ["Django app", "Django apps"],
}
export const modulesPhrase = (kind: string, count: number) => {
    const w = MODULE_WORDS[kind] ?? [`${kind} module`, `${kind} modules`]
    return `${n(count)} ${count === 1 ? w[0] : w[1]}`
}

/** A language's share of the production lines, 0 to 1. */
export function languageShare(f: SnapshotFacts, ...names: string[]): number {
    const total = f.production.lines
    if (!total) return 0
    return f.languages.filter(l => names.some(x => l.language.startsWith(x))).reduce((s, l) => s + l.lines, 0) / total
}

/** The ecosystems a snapshot shows, each with the evidence it was read from. */
export function ecosystems(f: SnapshotFacts): Ecosystem[] {
    const out: Ecosystem[] = []
    const s = f.summary
    const mk = f.moduleKinds
    const share = (...names: string[]) => languageShare(f, ...names)
    const langWhy = (label: string, ...names: string[]) => `${label}, ${Math.round(100 * share(...names))}% of production lines`
    if ((s.java__spring__beans ?? 0) > 0) out.push({ id: "spring", label: "Spring application", why: `${plural(s.java__spring__beans, "Spring bean")}${s.java__jpa__entities ? `, ${plural(s.java__jpa__entities, "JPA entity", "JPA entities")}` : ""}` })
    const jvm = (mk.maven ?? 0) + (mk.gradle ?? 0)
    if (jvm > 1) out.push({ id: "jvm", label: "Multi-module build", why: [mk.maven ? modulesPhrase("maven", mk.maven) : "", mk.gradle ? modulesPhrase("gradle", mk.gradle) : ""].filter(Boolean).join(", ") })
    if ((mk.django ?? 0) > 0) out.push({ id: "django", label: "Django project", why: modulesPhrase("django", mk.django) })
    else if (share("Python") >= 0.2) out.push({ id: "python", label: "Python codebase", why: langWhy("Python", "Python") })
    const react = (s.ts__react__components ?? 0) + (s.js__react__components ?? 0)
    // Bundled JavaScript beside a Java or Python back end is not a JavaScript workspace: it needs a package or most of the lines.
    const node = (mk.node ?? 0) > 0 || share("TypeScript", "JavaScript") >= 0.5
    if (node) out.push({ id: "node", label: "JavaScript/TypeScript workspace", why: mk.node ? modulesPhrase("node", mk.node) : langWhy("JavaScript and TypeScript", "TypeScript", "JavaScript") })
    if (node && react >= 20 && f.reactImporters >= 10) out.push({ id: "react", label: "React front end", why: `${plural(react, "React component")}, react imported in ${plural(f.reactImporters, "file")}` })
    if ((mk.go ?? 0) > 0 || share("Go") >= 0.2) out.push({ id: "go", label: "Go module", why: mk.go ? modulesPhrase("go", mk.go) : langWhy("Go", "Go") })
    if ((mk.dotnet ?? 0) > 0 || share("C#") >= 0.2) out.push({ id: "dotnet", label: ".NET solution", why: mk.dotnet ? modulesPhrase("dotnet", mk.dotnet) : langWhy("C#", "C#") })
    if ((mk.composer ?? 0) > 0 || share("PHP") >= 0.2) out.push({ id: "php", label: "PHP application", why: mk.composer ? modulesPhrase("composer", mk.composer) : langWhy("PHP", "PHP") })
    return out
}

// ── Graph helpers ─────────────────────────────────────────────────────────

/**
 * Nodes on the longest import chain once each tangle is one node: the
 * dependency levels, as the Overview counts them.
 */
export function dependencyLevels(edges: Array<[string, string]>, groupOf: Map<string, string>): number {
    const node = (c: string) => groupOf.get(c) ?? c
    const out = new Map<string, Set<string>>()
    const nodes = new Set<string>()
    for (const [a, z] of edges) {
        const x = node(a), y = node(z)
        nodes.add(x); nodes.add(y)
        if (x === y) continue
        let s = out.get(x)
        if (!s) out.set(x, (s = new Set()))
        s.add(y)
    }
    const depth = new Map<string, number>()
    const visiting = new Set<string>()
    const walk = (v: string): number => {
        const known = depth.get(v)
        if (known !== undefined) return known
        if (visiting.has(v)) return 0 // a cycle the groups missed counts once
        visiting.add(v)
        let best = 0
        for (const w of out.get(v) ?? []) best = Math.max(best, walk(w))
        visiting.delete(v)
        depth.set(v, best + 1)
        return best + 1
    }
    let max = 0
    for (const v of nodes) max = Math.max(max, walk(v))
    return max
}

const median = (xs: number[]) => {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor((s.length - 1) / 2)]
}

/** Health reads 0 as no reading on snapshots before analysis revision 2. */
const healthCol = (revision: number, alias = "") => (revision < 2 ? `NULLIF(${alias}codesmells__code_health, 0)` : `${alias}codesmells__code_health`)

// ── The readings ──────────────────────────────────────────────────────────

const PERIODS = [{ value: "90", label: "90 days" }, { value: "30", label: "30 days" }, { value: "180", label: "180 days" }]

export const READINGS: ReadingDef[] = [
    {
        id: "size",
        label: "Size and languages",
        describe: "Production files and lines from the files table, grouped by extension; components and modules as the scan found them.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.production.files) return absent("The snapshot holds no production files.")
            const kinds = Object.entries(f.moduleKinds).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
            const mods = kinds.length ? `; the scan found ${listOf(kinds.map(([k, c]) => modulesPhrase(k, c)))}` : ""
            // TSX is TypeScript and JSX is JavaScript, for a sentence about languages.
            const merged = new Map<string, number>()
            for (const l of f.languages) { const k = l.language.replace(/ \((TSX|JSX)\)$/, ""); merged.set(k, (merged.get(k) ?? 0) + l.lines) }
            const top = [...merged].map(([language, lines]) => ({ language, lines })).filter(l => l.lines >= f.production.lines / 100 && !l.language.startsWith(".") && l.language !== "No extension").sort((a, b) => b.lines - a.lines).slice(0, 3)
            const langs = top.length
                ? ` ${top[0].language} carries ${pct(top[0].lines, f.production.lines)} of those lines${top.length > 1 ? `, then ${listOf(top.slice(1).map(l => `${l.language} (${pct(l.lines, f.production.lines)})`))}` : ""}.`
                : ""
            const other = Object.entries(f.roles).filter(([r, v]) => r !== "production" && v.files > 0)
            const ROLE: Record<string, [string, string]> = { test: ["test file", "test files"], third_party: ["third-party file", "third-party files"], generated: ["generated file", "generated files"], non_code: ["file that is not code", "files that are not code"] }
            const rest = other.length ? ` Outside them: ${listOf(other.map(([r, v]) => `${n(v.files)} ${v.files === 1 ? ROLE[r]?.[0] ?? r : ROLE[r]?.[1] ?? r}`))}.` : ""
            return {
                text: `The snapshot holds ${b(plural(f.production.files, "production file"))} with ${b(`${n(f.production.lines)} lines`)} of code, grouped into ${b(plural(f.components, "component"))}${mods}.${langs}${rest}`,
                values: { "production files": f.production.files, "production lines": f.production.lines, components: f.components },
            }
        },
    },
    {
        id: "history",
        label: "History",
        describe: "The git totals the scan recorded (summary table): commits, authors, age, and the last 90 days.",
        async run(ctx) {
            const f = await probe(ctx)
            const s = f.summary
            if (!f.commits) return absent("The snapshot has no git history.")
            const age = s.git__age_in_days ?? 0
            const recent = s.git__commits__last_90_days ?? 0
            return {
                text: `The history reaches back ${b(years(age))}: ${b(plural(f.commits, "commit"))} by ${b(plural(f.authors, "author"))}. In the last 90 days, ${recent ? `${b(plural(recent, "commit"))} by ${plural(s.git__authors__last_90_days ?? 0, "author")} changed ${plural(s.git__unique_file_changes__last_90_days ?? 0, "file")}` : "no commit landed"}.`,
                values: { commits: f.commits, authors: f.authors, "commits, last 90 days": recent },
            }
        },
    },
    {
        id: "structure",
        label: "Tangles, levels and propagation",
        describe: "Strongly connected groups of two or more components (tangles), the longest import chain with tangles collapsed, and MacCormack's propagation cost from component_connections_indirect.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.components || !f.tables.has("component_connections_direct")) return absent("The snapshot has no component dependencies.")
            const groups = f.tables.has("component_strongly_connected_groups")
                ? await ctx.query(`SELECT "group" AS g, component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1) AND component <> '.'`)
                : []
            const groupOf = new Map<string, string>(groups.map(r => [String(r.component), `#${r.g}`]))
            const sizes = new Map<string, number>()
            for (const g of groupOf.values()) sizes.set(g, (sizes.get(g) ?? 0) + 1)
            const largest = Math.max(0, ...sizes.values())
            const members = groupOf.size
            const [lines] = members
                ? await ctx.query(`SELECT sum(CASE WHEN name IN (${[...groupOf.keys()].map(lit).join(",")}) THEN coalesce(complexity__lines, 0) ELSE 0 END) AS inside, sum(coalesce(complexity__lines, 0)) AS total FROM components WHERE name <> '.'`)
                : [{ inside: 0, total: 0 }]
            const edges = (await ctx.query(`SELECT DISTINCT "from" AS a, "to" AS z FROM component_connections_direct WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.'`)).map(r => [String(r.a), String(r.z)] as [string, string])
            const levels = dependencyLevels(edges, groupOf)
            let cost: number | null = null
            if (f.tables.has("component_connections_indirect")) {
                const [r] = await ctx.query(`SELECT count(*) AS c FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')`)
                cost = (Number(r?.c ?? 0) + f.components) / (f.components * f.components)
            }
            const tangleText = members
                ? `${b(`${n(members)} of ${n(f.components)} components`)} (${pct(Number(lines?.inside) || 0, Number(lines?.total) || 0)} of the lines) sit in ${b(plural(sizes.size, "tangle"))}${sizes.size > 1 ? `, the largest of ${plural(largest, "component")}` : ""}: each can reach every other in its tangle by following imports.`
                : `No component sits in a tangle: every import chain runs one way.`
            const costText = cost === null ? "" : ` Propagation cost is ${b(`${Math.round(cost * 100)}%`)}: of all ordered pairs of components, that share are linked by a chain of imports.`
            return {
                text: `${tangleText}${costText} With each tangle taken as one node, the longest import chain is ${b(plural(levels, "level"))} deep.`,
                values: { "components in tangles": members, tangles: sizes.size, "largest tangle": largest, "propagation cost %": cost === null ? 0 : Math.round(cost * 1000) / 10, "dependency levels": levels },
            }
        },
    },
    {
        id: "hotspots",
        label: "Hotspots",
        describe: "The highest codesmells__hotspot_score (change frequency by complexity), with the share of lines and of commits in the last 180 days they hold.",
        params: [{ id: "grain", label: "Rows of", choices: [{ value: "components", label: "Components" }, { value: "files", label: "Files" }] }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const grain = p.grain === "files" ? "files" : "components"
            const cols = grain === "files" ? f.fileColumns : f.componentColumns
            if (!cols.has("codesmells__hotspot_score") || !f.commits) return absent("The snapshot has no hotspot scores; they need git history.")
            const where = grain === "files" ? (f.fileColumns.has("role") ? `role = 'production'` : "1") : `name <> '.'`
            const top = await ctx.query(`SELECT name, codesmells__hotspot_score AS score FROM ${grain} WHERE ${where} AND codesmells__hotspot_score > 0 ORDER BY score DESC, name LIMIT 5`)
            if (!top.length) return absent("No hotspot scores above zero in this snapshot.")
            const names = top.map(r => String(r.name))
            const [t] = await ctx.query(`SELECT sum(CASE WHEN name IN (${names.map(lit).join(",")}) THEN coalesce(complexity__lines, 0) ELSE 0 END) AS l, sum(coalesce(complexity__lines, 0)) AS lt, sum(CASE WHEN name IN (${names.map(lit).join(",")}) THEN coalesce(git__commits__last_180_days, 0) ELSE 0 END) AS c, sum(coalesce(git__commits__last_180_days, 0)) AS ct FROM ${grain} WHERE ${where}`)
            const commits = Number(t?.ct) || 0
            return {
                text: `The highest hotspot scores are in ${listOf(names.map(code))}. These ${top.length} ${grain} hold ${pct(Number(t?.l) || 0, Number(t?.lt) || 0)} of the lines${commits ? `; in the last 180 days they saw ${pct(Number(t?.c) || 0, commits)} of the commits, counted per ${grain === "files" ? "file" : "component"}` : ""}.`,
                values: Object.fromEntries(top.map(r => [String(r.name), Math.round(Number(r.score) * 100) / 100])),
            }
        },
    },
    {
        id: "health",
        label: "Code health",
        describe: "codesmells__code_health (1 to 10, higher is simpler to change) over production files, weighted by lines; files rated below 4; the lowest-rated components.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("codesmells__code_health")) return absent("The snapshot has no code health ratings.")
            const h = healthCol(ctx.revision)
            const where = f.fileColumns.has("role") ? `role = 'production'` : "1"
            const [r] = await ctx.query(`SELECT sum(${h} * complexity__lines) / nullif(sum(CASE WHEN ${h} IS NOT NULL THEN complexity__lines END), 0) AS avg, sum(CASE WHEN ${h} < 4 THEN 1 ELSE 0 END) AS low, sum(CASE WHEN ${h} < 4 THEN complexity__lines ELSE 0 END) AS lowLines, sum(CASE WHEN ${h} IS NOT NULL THEN complexity__lines END) AS rated FROM files WHERE ${where}`)
            const worst = f.componentColumns.has("codesmells__code_health")
                ? await ctx.query(`SELECT name, ${h} AS health FROM components WHERE name <> '.' AND ${h} IS NOT NULL AND complexity__lines >= 200 ORDER BY health ASC, name LIMIT 3`)
                : []
            if (r?.avg === null || r?.avg === undefined) return absent("No production file has a code health rating.")
            const low = Number(r.low) || 0
            return {
                text: `Code health, rated from 1 to 10 per file, averages ${b((Number(r.avg)).toFixed(1))} across the production code, weighted by lines. ${low ? `${b(plural(low, "file"))} rate below 4, holding ${pct(Number(r.lowLines) || 0, Number(r.rated) || 0)} of the rated lines.` : "No file rates below 4."}${worst.length ? ` Among components of 200 lines or more, the lowest rated are ${listOf(worst.map(w => `${code(String(w.name))} (${Number(w.health).toFixed(1)})`))}.` : ""}`,
                values: { "average health": Math.round(Number(r.avg) * 10) / 10, "files below 4": low },
            }
        },
    },
    {
        id: "churn",
        label: "Where change lands",
        describe: "Lines added and deleted per component in a period (git__additions and git__deletions), and how few components took half of them.",
        params: [{ id: "days", label: "Period", choices: PERIODS }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const d = ["30", "90", "180"].includes(p.days) ? p.days : "90"
            const add = `git__additions__last_${d}_days`, del = `git__deletions__last_${d}_days`
            if (!f.commits || !f.componentColumns.has(add)) return absent("The snapshot has no git history per component.")
            const rows = await ctx.query(`SELECT name, coalesce(${add}, 0) + coalesce(${del}, 0) AS churn FROM components WHERE name <> '.' AND coalesce(${add}, 0) + coalesce(${del}, 0) > 0 ORDER BY churn DESC, name`)
            const commits = f.summary[`git__commits__last_${d}_days`] ?? 0
            if (!rows.length) return { text: `No lines changed in the last ${d} days.`, values: { "changed lines": 0 } }
            const total = rows.reduce((s, r) => s + Number(r.churn), 0)
            let cum = 0, k = 0
            for (const r of rows) { cum += Number(r.churn); k++; if (cum >= total / 2) break }
            const top = rows.slice(0, Math.min(3, rows.length))
            return {
                text: `In the last ${d} days, ${b(plural(commits, "commit"))} changed ${b(`${n(total)} lines`)} across ${plural(rows.length, "component")}. Half of those lines went into ${b(plural(k, "component"))}; the most into ${listOf(top.map(r => `${code(String(r.name))} (${pct(Number(r.churn), total)})`))}.`,
                values: { commits, "changed lines": total, "components changed": rows.length, "components with half": k },
            }
        },
    },
    {
        id: "knowledge",
        label: "Who knows what",
        describe: "Per component, how few authors added half and four fifths of the lines (from git_commits, bots left out, aliases merged). No names are written.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.commits || !f.tables.has("git_commits")) return absent("The snapshot has no git history.")
            const rows = await ctx.query(knowledgeSql(ctx.aliases))
            const kept = rows.filter(r => Number(r.added) >= 500)
            if (!kept.length) return absent("No component has 500 or more lines added in its history.")
            const one50 = kept.filter(r => Number(r.cover50) === 1).length
            const one80 = kept.filter(r => Number(r.cover80) === 1).length
            const biggest = [...kept].sort((a, b) => Number(b.added) - Number(a.added)).slice(0, 10)
            const bigOne = biggest.filter(r => Number(r.cover50) === 1).length
            return {
                text: `Of the ${b(plural(kept.length, "component"))} with 500 or more lines added in their history, ${b(n(one50))} have one author who added half or more of those lines, and in ${b(n(one80))} one author added four fifths or more. Among the ten with the most lines added, ${n(bigOne)} have one author covering half.`,
                values: { components: kept.length, "one author covers half": one50, "one author covers 80%": one80 },
            }
        },
    },
    {
        id: "coupling",
        label: "Most depended on",
        describe: "modularity__coupling__dependents and __dependencies: components counted in components, not files.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.componentColumns.has("modularity__coupling__dependents")) return absent("The snapshot has no component coupling.")
            const top = await ctx.query(`SELECT name, modularity__coupling__dependents AS d FROM components WHERE name <> '.' AND modularity__coupling__dependents > 0 ORDER BY d DESC, name LIMIT 3`)
            const all = await ctx.query(`SELECT coalesce(modularity__coupling__dependents, 0) AS d, coalesce(modularity__coupling__dependencies, 0) AS e FROM components WHERE name <> '.'`)
            if (!top.length) return absent("No component depends on another.")
            return {
                text: `The most depended-on components are ${listOf(top.map((r, i) => `${code(String(r.name))} (${i === 0 ? `${plural(Number(r.d), "component")} depend on it` : n(Number(r.d))})`))}. The middle component has ${plural(median(all.map(r => Number(r.d))), "dependent")} and depends on ${plural(median(all.map(r => Number(r.e))), "other")}.`,
                values: Object.fromEntries(top.map(r => [String(r.name), Number(r.d)])),
            }
        },
    },
    {
        id: "rules",
        label: "Dependency rules",
        describe: "The rules table: imports a configured rule forbids, by rule.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.rules.applicable) return absent("No dependency rule applies to this snapshot.")
            const by = await ctx.query(`SELECT rule, sum(status = 'violation') AS v, count(*) AS c FROM rules WHERE status <> 'not_applicable' GROUP BY rule ORDER BY v DESC, rule`)
            const broken = by.filter(r => Number(r.v) > 0)
            const name = (r: any) => ctx.label(String(r.rule))
            return {
                text: broken.length
                    ? `${b(plural(f.rules.violations, "import"))} break ${plural(broken.length, "rule")} of the ${n(by.length)} that apply; the most break ${code(name(broken[0]))} (${n(Number(broken[0].v))}).${by.length > broken.length ? ` The other ${plural(by.length - broken.length, "rule")} hold.` : ""}`
                    : `All ${plural(by.length, "rule")} that apply hold: no import breaks them.`,
                values: { violations: f.rules.violations, "rules broken": broken.length },
            }
        },
    },
    {
        id: "modules",
        label: "Build modules",
        describe: "The modules table: each module's manifest and the modules in the codebase it declares a dependency on.",
        async run(ctx) {
            const f = await probe(ctx)
            const total = Object.values(f.moduleKinds).reduce((s, c) => s + c, 0)
            if (!total) return absent("The scan found no build modules.")
            const rows = await ctx.query(`SELECT name, coalesce(depends_on, '') AS deps FROM modules`)
            const into = new Map<string, number>()
            let depending = 0
            for (const r of rows) {
                const deps = String(r.deps).split(",").map(s => s.trim()).filter(Boolean)
                if (deps.length) depending++
                for (const d of deps) into.set(d, (into.get(d) ?? 0) + 1)
            }
            const top = [...into].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
            const kinds = Object.entries(f.moduleKinds).sort((a, b) => b[1] - a[1])
            return {
                text: `The scan found ${b(listOf(kinds.map(([k, c]) => modulesPhrase(k, c))))}. ${depending ? `${n(depending)} of them depend on another module in the codebase${top ? `; the most depended on is ${code(top[0])}, by ${plural(top[1], "module")}` : ""}, and ${n(total - depending)} on none.` : "None of them declares a dependency on another module in the codebase."}`,
                values: { modules: total, "depend on another": depending },
            }
        },
    },
    {
        id: "age",
        label: "Code age",
        describe: "git__last_change_age_in_days per file, counted back from the head commit; renames are not changes.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("git__last_change_age_in_days")) return absent("Code age needs a snapshot at analysis revision 2 or later.")
            const where = f.fileColumns.has("role") ? `role = 'production'` : "1"
            const [r] = await ctx.query(`SELECT sum(CASE WHEN git__last_change_age_in_days > 365 THEN complexity__lines ELSE 0 END) AS old, sum(CASE WHEN git__last_change_age_in_days <= 90 THEN complexity__lines ELSE 0 END) AS fresh, sum(CASE WHEN git__last_change_age_in_days IS NOT NULL THEN complexity__lines END) AS total FROM files WHERE ${where}`)
            const total = Number(r?.total) || 0
            if (!total) return absent("No production file has a recorded last change.")
            return {
                text: `Counted back from the head commit, ${b(pct(Number(r.old) || 0, total))} of the production lines sit in files unchanged for more than a year, and ${b(pct(Number(r.fresh) || 0, total))} in files changed in the last 90 days.`,
                values: { "% older than a year": Math.round((100 * (Number(r.old) || 0)) / total), "% changed in 90 days": Math.round((100 * (Number(r.fresh) || 0)) / total) },
            }
        },
    },
    {
        id: "tests",
        label: "Tests",
        describe: "Files with role 'test', and components no test file imports (component_connections_direct).",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("role")) return absent("Test files need a snapshot that gives files a role.")
            const t = f.roles.test ?? { files: 0, lines: 0 }
            const ignored = (() => { try { return (JSON.parse(f.snapshot.walker_ignored_top || "[]") as string[]).filter(p => /(^|\/)(tests?|spec|__tests__)\//.test(p)).length } catch { return 0 } })()
            const left = ignored ? ` The scan left out ${plural(ignored, "test directory", "test directories")} by its ignore patterns.` : ""
            if (!t.files) return { text: `The snapshot has no files marked as tests.${left}`, values: { "test files": 0 } }
            const [r] = await ctx.query(`SELECT count(*) AS c FROM components WHERE name <> '.' AND name NOT IN (SELECT DISTINCT d."to" FROM component_connections_direct d JOIN files f ON f.name = d.file WHERE f.role = 'test')`)
            const untested = Number(r?.c) || 0
            return {
                text: `${b(plural(t.files, "test file"))} ${t.files === 1 ? "holds" : "hold"} ${n(t.lines)} lines, ${ratio(t.lines, f.production.lines)} for every 100 lines of production code. ${b(`${n(untested)} of ${n(f.components)} components`)} ${untested === 1 ? "is" : "are"} imported by no test file.${left}`,
                values: { "test files": t.files, "components no test imports": untested },
            }
        },
    },
    {
        id: "libraries",
        label: "Libraries",
        describe: "Imports that name none of the code's own components (snippets), rolled up to two segments; platform modules tagged by rule.",
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.tables.has("snippets")) return absent("The snapshot keeps no import snippets.")
            const rows = (await ctx.query(`SELECT content, file, component FROM snippets WHERE snippet_type = 'modularity__component__imports' AND content NOT IN (SELECT name FROM components)`)) as ImportRow[]
            const comps = (await ctx.query(`SELECT name FROM components`)).map(r => String(r.name))
            const libs = libraries(rows, 2, ownPrefixes(comps)).filter(l => !l.internal)
            if (!libs.length) return absent("The code imports nothing outside its own components.")
            const outside = libs.filter(l => !l.platform)
            const platform = libs.length - outside.length
            const top = [...outside].sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)).slice(0, 3)
            return {
                text: `The code imports ${b(plural(outside.length, "library", "libraries"))} from outside its own components, rolled up to two segments${platform ? `, besides ${plural(platform, "platform module")}` : ""}.${top.length ? ` The most widely imported are ${listOf(top.map(l => `${code(l.name)} (in ${plural(l.files, "file")})`))}.` : ""}`,
                values: { libraries: outside.length, "platform modules": libs.length - outside.length },
            }
        },
    },
    {
        id: "focus",
        label: "One component",
        describe: "One component's size, coupling, health and recent history, as the component page shows them.",
        params: [{ id: "component", label: "Component", kind: "component" }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const name = p.component
            if (!name) return absent("Choose a component for this paragraph.")
            const h = f.componentColumns.has("codesmells__code_health") ? `, ${healthCol(ctx.revision)} AS health` : ""
            const git = f.componentColumns.has("git__commits__last_180_days") ? ", git__commits__last_180_days AS commits, git__authors__last_180_days AS authors" : ""
            const [r] = await ctx.query(`SELECT complexity__files AS files, complexity__lines AS lines, modularity__coupling__dependents AS d, modularity__coupling__dependencies AS e${h}${git} FROM components WHERE name = ${lit(name)}`)
            if (!r) return absent(`${code(name)} is not in this snapshot.`)
            const [t] = f.tables.has("component_strongly_connected_groups") ? await ctx.query(`SELECT count(*) AS c FROM component_strongly_connected_groups WHERE "group" = (SELECT "group" FROM component_strongly_connected_groups WHERE component = ${lit(name)} LIMIT 1)`) : [null]
            const tangle = Number(t?.c) || 0
            const parts = [
                `${code(name)} holds ${plural(Number(r.files) || 0, "file")} and ${n(Number(r.lines) || 0)} lines.`,
                ` ${plural(Number(r.d) || 0, "component")} depend on it, and it depends on ${plural(Number(r.e) || 0, "other")}.`,
                tangle > 1 ? ` It sits in a tangle of ${plural(tangle, "component")}.` : "",
                r.health !== undefined && r.health !== null ? ` Its code health is ${Number(r.health).toFixed(1)}.` : "",
                r.commits !== undefined ? ` In the last 180 days, ${plural(Number(r.commits) || 0, "commit")} by ${plural(Number(r.authors) || 0, "author")} changed it.` : "",
            ]
            return { text: parts.join(""), values: { lines: Number(r.lines) || 0, dependents: Number(r.d) || 0, dependencies: Number(r.e) || 0, "tangle size": tangle } }
        },
    },

    // ── Ecosystems ────────────────────────────────────────────────────────
    {
        id: "spring",
        label: "Spring",
        describe: "The engine's Spring and JPA counts (java__spring__*, java__jpa__entities) from the summary.",
        async run(ctx) {
            const s = (await probe(ctx)).summary
            if (!s.java__spring__beans) return absent("The snapshot has no Spring beans.")
            const kinds = [["java__spring__services", "service"], ["java__spring__repositories", "repository", "repositories"], ["java__spring__controllers", "controller"], ["java__spring__configurations", "configuration"], ["java__spring__components", "@Component class", "@Component classes"]] as const
            const verbs = [["get", "GET"], ["post", "POST"], ["put", "PUT"], ["patch", "PATCH"], ["delete", "DELETE"]].map(([k, l]) => [s[`java__spring__request_mappings__${k}`] ?? 0, l] as const).filter(([c]) => c > 0)
            return {
                text: `The code declares ${b(plural(s.java__spring__beans, "Spring bean"))}: ${listOf(kinds.filter(([k]) => s[k]).map(([k, one, many]) => plural(s[k], one, many)))}.${s.java__spring__request_mappings__total ? ` Controllers map ${b(plural(s.java__spring__request_mappings__total, "request"))} (${listOf(verbs.map(([c, l]) => `${n(c)} ${l}`))}).` : ""}${s.java__jpa__entities ? ` ${b(plural(s.java__jpa__entities, "JPA entity", "JPA entities"))} map to tables.` : ""}`,
                values: { beans: s.java__spring__beans, controllers: s.java__spring__controllers ?? 0, "request mappings": s.java__spring__request_mappings__total ?? 0, "JPA entities": s.java__jpa__entities ?? 0 },
            }
        },
    },
    {
        id: "django",
        label: "Django",
        describe: "Django apps from the modules table, and the views, models and forms the scan marked by file name.",
        async run(ctx) {
            const f = await probe(ctx)
            const apps = f.moduleKinds.django ?? 0
            if (!apps) return absent("The scan found no Django apps.")
            const marks = f.tables.has("unit_markers") ? await ctx.query(`SELECT kind, key, count(*) AS c FROM unit_markers WHERE source = 'filename' AND key IN ('views', 'models', 'abstract_models', 'forms', 'admin', 'serializers') GROUP BY 1, 2`) : []
            const count = (kind: string, ...keys: string[]) => marks.filter(m => m.kind === kind && keys.includes(String(m.key))).reduce((s, m) => s + Number(m.c), 0)
            const models = count("type", "models", "abstract_models"), views = count("function", "views") + count("type", "views"), forms = count("type", "forms")
            const found = [models ? plural(models, "class", "classes") + " in model modules" : "", views ? `${n(views)} functions and classes in view modules` : "", forms ? `${plural(forms, "class", "classes")} in form modules` : ""].filter(Boolean)
            const [dash] = await ctx.query(`SELECT count(*) AS c FROM modules WHERE kind = 'django' AND (name LIKE 'tests.%' OR name LIKE '%.tests.%')`)
            return {
                text: `The project holds ${b(modulesPhrase("django", apps))}${Number(dash?.c) ? `, ${n(Number(dash.c))} of them under tests` : ""}.${found.length ? ` Across them, the scan finds ${listOf(found)}.` : ""}`,
                values: { apps, "model classes": models, views },
            }
        },
    },
    {
        id: "node",
        label: "JavaScript and TypeScript",
        describe: "npm packages from the modules table, the TypeScript share of JavaScript and TypeScript lines, and React components the engine counted.",
        async run(ctx) {
            const f = await probe(ctx)
            const pkgs = f.moduleKinds.node ?? 0
            const ts = languageShare(f, "TypeScript"), js = languageShare(f, "JavaScript")
            if (!pkgs && ts + js === 0) return absent("The snapshot has no JavaScript or TypeScript.")
            const s = f.summary
            const react = (s.ts__react__components ?? 0) + (s.js__react__components ?? 0)
            const names = pkgs ? (await ctx.query(`SELECT name FROM modules WHERE kind = 'node' ORDER BY files DESC LIMIT 3`)).map(r => code(String(r.name))) : []
            return {
                text: `${pkgs ? `The workspace holds ${b(modulesPhrase("node", pkgs))}, the largest ${listOf(names)}. ` : ""}TypeScript is ${b(`${Math.round(100 * ts / Math.max(1e-9, ts + js))}%`)} of the JavaScript and TypeScript lines.${react ? ` The engine counts ${b(plural(react, "React component"))}.` : ""}`,
                values: { packages: pkgs, "TypeScript %": Math.round(100 * ts / Math.max(1e-9, ts + js)), "React components": react },
            }
        },
    },
    {
        id: "go",
        label: "Go",
        describe: "Go modules from the modules table, packages as components, internal packages by path, and the internal-import rule.",
        async run(ctx) {
            const f = await probe(ctx)
            const mods = f.moduleKinds.go ?? 0
            if (!mods && languageShare(f, "Go") === 0) return absent("The snapshot has no Go.")
            const [i] = await ctx.query(`SELECT count(*) AS c FROM components WHERE name LIKE '%/internal' OR name LIKE '%/internal/%' OR name = 'internal' OR name LIKE 'internal/%'`)
            const [v] = f.tables.has("rules") ? await ctx.query(`SELECT coalesce(sum(status = 'violation'), 0) AS v, count(*) AS c FROM rules WHERE rule LIKE '%go__internal%' AND status <> 'not_applicable'`) : [null]
            const internal = Number(i?.c) || 0
            return {
                text: `${mods ? `The code builds as ${b(modulesPhrase("go", mods))} with ` : "The code has "}${b(plural(f.components, "package"))}, ${n(internal)} of them internal.${Number(v?.c) ? ` ${Number(v.v) ? `${b(plural(Number(v.v), "import"))} reach an internal package from outside its parent.` : "No import reaches an internal package from outside its parent."}` : ""}`,
                values: { modules: mods, packages: f.components, internal, "internal imports from outside": Number(v?.v) || 0 },
            }
        },
    },
    {
        id: "dotnet",
        label: ".NET",
        describe: ".NET projects from the modules table and the C# share of the code.",
        async run(ctx) {
            const f = await probe(ctx)
            const projects = f.moduleKinds.dotnet ?? 0
            if (!projects && languageShare(f, "C#") === 0) return absent("The snapshot has no C#.")
            const [dep] = projects ? await ctx.query(`SELECT count(*) AS c FROM modules WHERE kind = 'dotnet' AND coalesce(depends_on, '') <> ''`) : [null]
            return {
                text: `${projects ? `The solution holds ${b(modulesPhrase("dotnet", projects))}, ${n(Number(dep?.c) || 0)} of them referencing another project. ` : ""}C# is ${b(`${Math.round(100 * languageShare(f, "C#"))}%`)} of the production lines, across ${plural(f.components, "namespace")}.`,
                values: { projects, namespaces: f.components },
            }
        },
    },
    {
        id: "php",
        label: "PHP",
        describe: "Composer packages from the modules table, and components and modules whose names end in Bundle.",
        async run(ctx) {
            const f = await probe(ctx)
            const pkgs = f.moduleKinds.composer ?? 0
            if (!pkgs && languageShare(f, "PHP") === 0) return absent("The snapshot has no PHP.")
            const [bundles] = await ctx.query(`SELECT count(*) AS c FROM components WHERE name LIKE '%Bundle' OR name LIKE '%Bundle/%' OR name LIKE '%Bundle\\%'`)
            const nb = Number(bundles?.c) || 0
            return {
                text: `${pkgs ? `Composer declares ${b(modulesPhrase("composer", pkgs))}. ` : ""}PHP is ${b(`${Math.round(100 * languageShare(f, "PHP"))}%`)} of the production lines, in ${plural(f.components, "namespace")}${nb ? `, ${n(nb)} of them inside a bundle` : ""}.`,
                values: { packages: pkgs, namespaces: f.components, "bundle namespaces": nb },
            }
        },
    },
]

const byId = new Map(READINGS.map(r => [r.id, r]))
export const readingDef = (id: string) => byId.get(id)

/** Runs one reading; a failure comes back as its message, not a thrown error. */
export async function runReading(id: string, params: Record<string, string> | undefined, ctx: ReadingContext): Promise<ReadingOutput> {
    const def = byId.get(id)
    if (!def) return absent(`No reading called ${id}.`)
    const defaults = Object.fromEntries((def.params ?? []).map(p => [p.id, p.choices?.[0]?.value ?? ""]))
    return def.run(ctx, { ...defaults, ...(params ?? {}) })
}
