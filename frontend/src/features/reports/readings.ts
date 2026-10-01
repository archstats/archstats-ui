// Readings: facts about a snapshot written out as a paragraph. A template's
// prose is made of these; each is a cell, so it runs again on a newer
// snapshot and says what moved. A reading states what the snapshot holds,
// counted the way the views count it, and stops there: no verdicts, no
// advice. The interpretation is the writer's, prompted, never generated.

import { knowledgeSql, type AliasMap } from "~/features/git/authors"
import { languageOfPath } from "~/features/snapshot/languages"
import { displayName, languageOf as importLanguage, libraries, ownPrefixes, type ImportRow } from "~/features/libraries/libraries"
import { ANATOMY_READINGS } from "./anatomy"
import { guessRole, NON_PRODUCTION_GLOBS, TEST_GLOBS } from "~/features/snapshot/fileRole"
import { proseName, proseNames, type ReadingOutput } from "./reportDoc"
import { t, intlLocale } from "~/shared/i18n"

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

const n = (v: number) => Math.round(v).toLocaleString(intlLocale)
const pct = (part: number, whole: number) => {
    if (!whole) return "0%"
    const p = (100 * part) / whole
    return p > 0 && p < 1 ? "under 1%" : `${Math.round(p)}%`
}
/** A name set as code, shortened for prose (proseName); the root folder's component "." reads as "(root)". */
const code = (s: string) => `\`${proseName(s).replace(/`/g, "'")}\``
/** Several names in one sentence, each set as code and kept apart when shortened. */
const codes = (names: string[]) => proseNames(names).map(s => `\`${s.replace(/`/g, "'")}\``)
const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`
const b = (s: string) => `**${s}**`
/** "a, b and c". */
export function listOf(items: string[]): string {
    if (items.length <= 1) return items.join("")
    return t("reports.readings.and2", { items: items.slice(0, -1).join(", "), value: items[items.length - 1] })
}
const years = (days: number) => (days >= 730 ? t("reports.readings.years", { value: (days / 365.25).toFixed(1) }) : days >= 60 ? t("reports.readings.months", { value: Math.round(days / 30.4) }) : t("common.count.day", { count: days }))
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
// Snapshots from before files had a role are sorted by path, the way the
// Overview and the Production | Tests switch sort them (snapshot/fileRole.ts).
/** A file's role: the scan's, or for a scan without roles, what its path reads as (the Overview's rule). */
export function roleOf(name: string, role?: unknown): string {
    if (role !== undefined) return String(role || "production")
    return guessRole(name)
}
/**
 * SQL: a build module outside test folders. A test fixture's composer.json
 * or package.json (Sylius has 30 copies of example/test-application) is not
 * one of the codebase's modules.
 */
export const realModule = (a = "") => `NOT ((coalesce(${a}directory, '') || '/x') GLOB '${TEST_GLOBS.filter(g => g.endsWith("/*")).join(`' OR (coalesce(${a}directory, '') || '/x') GLOB '`)}')`
/** SQL: the file row (alias a, or files itself) is production code. */
export function prodFile(f: Pick<SnapshotFacts, "fileColumns">, a = ""): string {
    const col = (c: string) => (a ? `${a}.${c}` : c)
    return f.fileColumns.has("role") ? `${col("role")} = 'production'` : `NOT (${[...TEST_GLOBS, ...NON_PRODUCTION_GLOBS].map(g => `${col("name")} GLOB '${g}'`).join(" OR ")})`
}
/** SQL: the unit u is a React component, as the React profile counts one (isReactComponent). */
export const reactComponent = (f: Pick<SnapshotFacts, "tables">) => `(u.name GLOB '[A-Z]*' AND (u.file LIKE '%.tsx' OR u.file LIKE '%.jsx') AND coalesce(u.owner, '') = '' AND u.kind <> 'module'${f.tables.has("unit_markers") ? ` AND u.id NOT IN (SELECT unit FROM unit_markers WHERE source = 'supertype' AND key = 'interface')` : ""})`
/** SQL: the component holds production code, the root among them. */
export const prodComponents = (f: Pick<SnapshotFacts, "fileColumns">, col = "name") => `${col} IN (SELECT component FROM files WHERE ${prodFile(f)})`
/** Per 100, as a reader says it: "under 1", "3", "56". */
const ratio = (part: number, whole: number) => { const r = (100 * part) / Math.max(1, whole); return r > 0 && r < 1 ? "under 1" : n(r) }
const absent = (text: string): ReadingOutput => ({ text, values: {}, absent: true })

// ── What the snapshot holds ───────────────────────────────────────────────

export interface SnapshotFacts {
    /** The analysis revision that wrote the snapshot. */
    revision: number
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
    /** Vue single-file components in production files: the engine marks each .vue file's unit. */
    vueComponents: number
    /** The markers the scan put on classes and functions, as "source:key" ("annotation:Entity", "filename:views"). */
    markers: Set<string>
    /** Columns of component_connections_indirect; analysis revision 4 keeps the next hop instead of the whole chain. */
    indirectColumns: Set<string>
    /** Modules by what they build (android-application, ios-application, flutter-app, kotlin-multiplatform…), from revision 7. */
    moduleTypes: Record<string, number>
    /** The mobile apps the scan found as deployables, from revision 7. */
    mobileApps: Array<{ name: string; platform: string }>
    /** Components with any abstractness (interfaces, abstract classes); undefined when the scan has no such column. */
    abstractComponents?: number
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
    const indirectColumns = await cols("component_connections_indirect")
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
        const role = roleOf(String(f.name), hasRole ? f.role : undefined)
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
    for (const r of tables.has("modules") ? await q(`SELECT kind, count(DISTINCT name) AS c FROM modules WHERE ${realModule()} GROUP BY kind`) : []) moduleKinds[String(r.kind)] = Number(r.c) || 0
    const [rules] = tables.has("rules") ? await q(`SELECT coalesce(sum(status <> 'not_applicable'), 0) AS applicable, coalesce(sum(status = 'violation'), 0) AS violations FROM rules`) : [null]
    const [t] = tables.has("component_strongly_connected_groups") ? await q(`SELECT count(*) AS c FROM (SELECT "group" FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1)`) : [null]
    const [c] = tables.has("components") ? await q(`SELECT count(*) AS c FROM components`) : [null]
    const [abs] = componentColumns.has("modularity__abstractness") ? await q(`SELECT count(*) AS c FROM components WHERE modularity__abstractness > 0`) : [null]
    const markers = new Set((tables.has("unit_markers") ? await q(`SELECT DISTINCT source || ':' || key AS k FROM unit_markers`) : []).map(r => String(r.k)))
    const moduleTypes: Record<string, number> = {}
    if (tables.has("modules") && (await cols("modules")).has("type")) {
        for (const r of await q(`SELECT type, count(*) AS c FROM modules WHERE coalesce(type, '') <> '' GROUP BY type`)) moduleTypes[String(r.type)] = Number(r.c) || 0
    }
    const mobileApps = tables.has("deployables") && (await cols("deployables")).has("platform")
        ? (await q(`SELECT name, platform FROM deployables WHERE kind = 'mobile_app' ORDER BY name`)).map(r => ({ name: String(r.name), platform: String(r.platform) }))
        : []
    const [react] = tables.has("snippets") ? await q(`SELECT count(DISTINCT file) AS c FROM snippets WHERE snippet_type = 'modularity__component__imports' AND (content = 'react' OR content LIKE 'react/%')`) : [null]
    const [vue] = tables.has("unit_markers") && tables.has("units") ? await q(`SELECT count(DISTINCT u.id) AS c FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'filename' AND m.key = 'vue_component' AND u.file IN (SELECT name FROM files WHERE ${prodFile({ fileColumns })})`) : [null]
    return {
        revision: ctx.revision, tables, fileColumns, componentColumns, summary, snapshot, roles,
        production: roles.production ?? { files: 0, lines: 0 },
        languages: [...langs].map(([language, v]) => ({ language, ...v })).sort((a, b) => b.lines - a.lines),
        components: Number(c?.c) || 0,
        moduleKinds,
        commits: summary.git__commits__total ?? 0,
        authors: summary.git__authors__total ?? 0,
        rules: { applicable: Number(rules?.applicable) || 0, violations: Number(rules?.violations) || 0 },
        tangles: Number(t?.c) || 0,
        ...(abs ? { abstractComponents: Number(abs.c) || 0 } : {}),
        reactImporters: Number(react?.c) || 0,
        vueComponents: Number(vue?.c) || 0,
        markers,
        indirectColumns,
        moduleTypes,
        mobileApps,
    }
}

/** Test folders the scan's ignore patterns left out. */
export function ignoredTestDirs(f: SnapshotFacts): number {
    try { return (JSON.parse(f.snapshot.walker_ignored_top || "[]") as string[]).filter(p => /(^|\/)(tests?|spec|__tests__)\//.test(p)).length } catch { return 0 }
}

// ── Ecosystems ────────────────────────────────────────────────────────────

export type EcosystemId = "spring" | "jvm" | "django" | "python" | "node" | "react" | "vue" | "go" | "dotnet" | "php" | "android" | "ios" | "flutter" | "react-native" | "kmp"

export interface Ecosystem { id: EcosystemId; label: string; why: string }

const MODULE_WORDS: Record<string, [string, string]> = {
    maven: [t("reports.readings.mavenModule"), t("reports.readings.mavenModules")], gradle: [t("reports.readings.gradleProject"), t("reports.readings.gradleProjects")],
    node: [t("reports.readings.npmPackage"), t("reports.readings.npmPackages")], go: [t("reports.readings.goModule"), t("reports.readings.goModules")],
    composer: [t("reports.readings.composerPackage"), t("reports.readings.composerPackages")], dotnet: [t("reports.readings.netProject"), t("reports.readings.netProjects")],
    django: [t("reports.readings.djangoApp"), t("reports.readings.djangoApps")],
    swiftpm: [t("reports.readings.swiftPackageTarget"), t("reports.readings.swiftPackageTargets")], xcode: [t("reports.readings.xcodeTarget"), t("reports.readings.xcodeTargets")], pub: [t("reports.readings.dartPackage"), t("reports.readings.dartPackages")],
}
export const modulesPhrase = (kind: string, count: number) => {
    const w = MODULE_WORDS[kind] ?? [t("reports.readings.module", { kind }), t("reports.readings.modules", { kind })]
    return `${n(count)} ${count === 1 ? w[0] : w[1]}`
}

/** A language's share of the production lines, 0 to 1. */
export function languageShare(f: SnapshotFacts, ...names: string[]): number {
    const total = f.production.lines
    if (!total) return 0
    return f.languages.filter(l => names.some(x => l.language.startsWith(x))).reduce((s, l) => s + l.lines, 0) / total
}

/**
 * An app built to show or try the real one: Signal ships fourteen demo:*
 * apps beside its own, isowords a preview app per feature. Real apps come
 * first wherever apps are listed.
 */
export const isSampleApp = (name: string) => /demo|sample|example|preview|catalog|playground|benchmark|showcase/i.test(name)

/** The ecosystems a snapshot shows, each with the evidence it was read from. */
export function ecosystems(f: SnapshotFacts): Ecosystem[] {
    const out: Ecosystem[] = []
    const s = f.summary
    const mk = f.moduleKinds
    const share = (...names: string[]) => languageShare(f, ...names)
    const langWhy = (label: string, ...names: string[]) => t("reports.readings.productionLines", { label, value: Math.round(100 * share(...names)) })
    if ((s.java__spring__beans ?? 0) > 0) out.push({ id: "spring", label: t("reports.readings.springApplication"), why: `${t("common.count.springBean", { count: s.java__spring__beans })}${s.java__jpa__entities ? `, ${t("common.count.jpaEntity", { count: s.java__jpa__entities })}` : ""}` })
    const jvm = (mk.maven ?? 0) + (mk.gradle ?? 0)
    if (jvm > 1) out.push({ id: "jvm", label: t("reports.readings.multiModuleBuild"), why: [mk.maven ? modulesPhrase("maven", mk.maven) : "", mk.gradle ? modulesPhrase("gradle", mk.gradle) : ""].filter(Boolean).join(", ") })
    if ((mk.django ?? 0) > 0) out.push({ id: "django", label: t("reports.readings.djangoProject"), why: modulesPhrase("django", mk.django) })
    else if (share("Python") >= 0.2) out.push({ id: "python", label: t("reports.readings.pythonCodebase"), why: langWhy("Python", "Python") })
    const react = (s.ts__react__components ?? 0) + (s.js__react__components ?? 0)
    // Bundled JavaScript beside a Java or Python back end is not a JavaScript workspace: it needs a package or most of the lines.
    // A .vue or .svelte file is a script block in markup: its lines are the front end's too.
    const node = (mk.node ?? 0) > 0 || share("TypeScript", "JavaScript", "Vue", "Svelte") >= 0.5
    if (node) out.push({ id: "node", label: t("reports.readings.javascriptTypescriptWorkspace"), why: mk.node ? modulesPhrase("node", mk.node) : langWhy(t("reports.readings.javascriptTypescript"), "TypeScript", "JavaScript", "Vue", "Svelte") })
    if (node && react >= 20 && f.reactImporters >= 10) out.push({ id: "react", label: t("reports.readings.reactFrontEnd"), why: t("reports.readings.reactImported", { reactComponents: t("common.count.reactComponent", { count: react }), files: t("common.count.file", { count: f.reactImporters }) }) })
    if (f.vueComponents >= 10) out.push({ id: "vue", label: t("reports.readings.vueFrontEnd"), why: t("common.count.vueComponent", { count: f.vueComponents }) })
    if ((mk.go ?? 0) > 0 || share("Go") >= 0.2) out.push({ id: "go", label: t("reports.readings.goModule"), why: mk.go ? modulesPhrase("go", mk.go) : langWhy("Go", "Go") })
    if ((mk.dotnet ?? 0) > 0 || share("C#") >= 0.2) out.push({ id: "dotnet", label: t("reports.readings.netSolution"), why: mk.dotnet ? modulesPhrase("dotnet", mk.dotnet) : langWhy("C#", "C#") })
    if ((mk.composer ?? 0) > 0 || share("PHP") >= 0.2) out.push({ id: "php", label: t("reports.readings.phpApplication"), why: mk.composer ? modulesPhrase("composer", mk.composer) : langWhy("PHP", "PHP") })
    // Mobile, from the apps the scan found, or failing that the modules that build them.
    const mt = f.moduleTypes
    const apps = (platform: string) => f.mobileApps.filter(a => a.platform === platform)
    const appsWhy = (platform: string, fallback: string) => {
        const all = apps(platform)
        if (!all.length) return fallback
        const real = all.filter(a => !isSampleApp(a.name)), samples = all.length - real.length
        const main = real.length ? `${real.length === 1 ? t("reports.readings.app") : t("common.count.app", { count: real.length })} ${listOf(real.map(x => x.name))}` : ""
        return listOf([main, samples ? plural(samples, real.length ? t("reports.readings.sampleApp") : t("reports.readings.samplePreviewApp")) : ""].filter(Boolean))
    }
    if (apps("android").length || (!f.mobileApps.length && (mt["android-application"] ?? 0) > 0)) out.push({ id: "android", label: t("reports.readings.androidApp"), why: appsWhy("android", t("common.count.androidApplicationModule", { count: mt["android-application"] ?? 0 })) })
    if (apps("ios").length || (!f.mobileApps.length && (mt["ios-application"] ?? 0) > 0) || share("Swift", "Objective-C") >= 0.3) out.push({ id: "ios", label: t("reports.readings.iosApp"), why: appsWhy("ios", langWhy(t("reports.readings.swiftObjectiveC"), "Swift", "Objective-C")) })
    if (apps("flutter").length || (mt["flutter-app"] ?? 0) > 0 || share("Dart") >= 0.3) out.push({ id: "flutter", label: t("reports.readings.flutterApp"), why: appsWhy("flutter", langWhy("Dart", "Dart")) })
    if (apps("react-native").length) out.push({ id: "react-native", label: t("reports.readings.reactNativeApp"), why: appsWhy("react-native", "") })
    if ((mt["kotlin-multiplatform"] ?? 0) > 0) out.push({ id: "kmp", label: t("reports.readings.kotlinMultiplatform"), why: t("common.count.multiplatformModule", { count: mt["kotlin-multiplatform"] }) })
    // A Flutter or React Native app's android/ runner is a Gradle build of two
    // or three projects; that is not a multi-module build worth reviewing.
    const crossPlatform = out.some(e => e.id === "flutter" || e.id === "react-native")
    if (crossPlatform && !(mk.maven ?? 0) && (mk.gradle ?? 0) <= 3) return out.filter(e => e.id !== "jvm")
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

const PERIODS = [{ value: "90", label: t("reports.readings.text90Days") }, { value: "30", label: t("reports.readings.text30Days") }, { value: "180", label: t("reports.readings.text180Days") }]

export const READINGS: ReadingDef[] = [
    {
        id: "size",
        label: t("reports.readings.sizeLanguages"),
        describe: t("reports.readings.productionFilesLinesFiles"),
        async run(ctx, p) {
            const f = await probe(ctx)
            if (!f.production.files) return absent(t("reports.readings.thereNoProductionCode"))
            // With a language, how many components hold its production code: what a per-language package table lists.
            let inLanguage = 0
            if (p.language) {
                const rows = await ctx.query(`SELECT name, component FROM files WHERE ${prodFile(f)} AND coalesce(component, '') <> ''`)
                inLanguage = new Set(rows.filter(r => languageOfPath(String(r.name)) === p.language).map(r => String(r.component))).size
            }
            const kinds = Object.entries(f.moduleKinds).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
            const mods = kinds.length ? t("reports.readings.builds", { value: listOf(kinds.map(([k, c]) => modulesPhrase(k, c))) }) : ""
            // TSX is TypeScript and JSX is JavaScript, for a sentence about languages.
            const merged = new Map<string, number>()
            for (const l of f.languages) { const k = l.language.replace(/ \((TSX|JSX)\)$/, ""); merged.set(k, (merged.get(k) ?? 0) + l.lines) }
            const top = [...merged].map(([language, lines]) => ({ language, lines })).filter(l => l.lines >= f.production.lines / 100 && !l.language.startsWith(".") && l.language !== "No extension").sort((a, b) => b.lines - a.lines).slice(0, 3)
            const lead = top[0] ? top[0].lines / f.production.lines : 0
            const langs = top.length
                ? ` ${lead >= 0.5 ? t("reports.readings.most", { language: top[0].language }) : t("reports.readings.largestShare", { language: top[0].language })} (${pct(top[0].lines, f.production.lines)})${top.length > 1 ? t("reports.readings.then", { value: listOf(top.slice(1).map(l => `${l.language} (${pct(l.lines, f.production.lines)})`)) }) : ""}.`
                : ""
            const other = Object.entries(f.roles).filter(([r, v]) => r !== "production" && v.files > 0)
            const ROLE: Record<string, [string, string]> = { test: [t("reports.readings.testFile"), t("reports.readings.testFiles")], third_party: [t("reports.readings.thirdPartyFile"), t("reports.readings.thirdPartyFiles")], generated: [t("reports.readings.generatedFile"), t("reports.readings.generatedFiles")], non_code: [t("reports.readings.fileNotCode"), t("reports.readings.filesNotCode")] }
            const rest = other.length ? t("reports.readings.testsOtherFilesCounted", { value: listOf(other.map(([r, v]) => `${n(v.files)} ${v.files === 1 ? ROLE[r]?.[0] ?? r : ROLE[r]?.[1] ?? r}`)) }) : ""
            return {
                text: t("reports.readings.productionCodeGrouped", { value: b(t("reports.readings.lines", { lines: n(f.production.lines) })), files: b(t("common.count.file", { count: f.production.files })), components: b(t("common.count.component", { count: f.components })), value2: p.language ? t("reports.readings.themHoldCode", { inLanguage: n(inLanguage), language: p.language }) : "", langs, mods, rest }),
                values: { "production files": f.production.files, "production lines": f.production.lines, components: f.components },
            }
        },
    },
    {
        id: "history",
        label: t("reports.readings.history"),
        describe: t("reports.readings.gitTotalsScanRecorded"),
        async run(ctx) {
            const f = await probe(ctx)
            const s = f.summary
            if (!f.commits) return absent(t("reports.readings.scanHasNoGit"))
            const age = s.git__age_in_days ?? 0
            const recent = s.git__commits__last_90_days ?? 0
            return {
                text: t("reports.readings.peopleHaveWorkedCode", { age: b(years(age)), commits: b(t("common.count.commit", { count: f.commits })), authors: b(t("common.count.author", { count: f.authors })), value: recent ? t("reports.readings.last90DaysChanged", { commits: b(t("common.count.commit", { count: recent })), authors: t("common.count.author", { count: s.git__authors__last_90_days ?? 0 }), files: t("common.count.file", { count: s.git__unique_file_changes__last_90_days ?? 0 }) }) : t("reports.readings.noCommitLandedLast") }),
                values: { commits: f.commits, authors: f.authors, "commits, last 90 days": recent },
            }
        },
    },
    {
        id: "structure",
        label: t("reports.readings.tanglesLevelsPropagation"),
        describe: t("reports.readings.stronglyConnectedGroupsTwo"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.components || !f.tables.has("component_connections_direct")) return absent(t("reports.readings.scanDidNotRecord"))
            const groups = f.tables.has("component_strongly_connected_groups")
                ? await ctx.query(`SELECT "group" AS g, component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1)`)
                : []
            const groupOf = new Map<string, string>(groups.map(r => [String(r.component), `#${r.g}`]))
            const sizes = new Map<string, number>()
            for (const g of groupOf.values()) sizes.set(g, (sizes.get(g) ?? 0) + 1)
            const largest = Math.max(0, ...sizes.values())
            const members = groupOf.size
            const [lines] = members
                ? await ctx.query(`SELECT sum(CASE WHEN name IN (${[...groupOf.keys()].map(lit).join(",")}) THEN coalesce(complexity__lines, 0) ELSE 0 END) AS inside, sum(coalesce(complexity__lines, 0)) AS total FROM components`)
                : [{ inside: 0, total: 0 }]
            const edges = (await ctx.query(`SELECT DISTINCT "from" AS a, "to" AS z FROM component_connections_direct WHERE "from" <> "to"`)).map(r => [String(r.a), String(r.z)] as [string, string])
            const levels = dependencyLevels(edges, groupOf)
            let cost: number | null = null
            if (f.tables.has("component_connections_indirect")) {
                const [r] = await ctx.query(`SELECT count(*) AS c FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to")`)
                cost = (Number(r?.c ?? 0) + f.components) / (f.components * f.components)
            }
            const tangleText = members
                ? t("reports.readings.sitHoldCodeInside", { value: b(t("reports.readings.components", { members: n(members), components: n(f.components) })), tangles: b(t("common.count.tangle", { count: sizes.size })), value2: pct(Number(lines?.inside) || 0, Number(lines?.total) || 0), value3: sizes.size > 1 ? t("reports.readings.largestTangleHas", { components: t("common.count.component", { count: largest }) }) : "" })
                : t("reports.readings.noComponentSitsTangle")
            const costText = cost === null ? "" : t("reports.readings.propagationCostAverageChange", { value: b(`${Math.round(cost * 100)}%`), value2: Math.round(cost * 100) })
            return {
                text: t("reports.readings.countingEachTangleOne", { tangleText, costText, levels: b(t("common.count.level", { count: levels })) }),
                values: { "components in tangles": members, tangles: sizes.size, "largest tangle": largest, "propagation cost %": cost === null ? 0 : Math.round(cost * 1000) / 10, "dependency levels": levels },
            }
        },
    },
    {
        id: "hotspots",
        label: t("reports.readings.hotspots"),
        describe: t("reports.readings.highestCodesmellsHotspotScore"),
        params: [{ id: "grain", label: t("reports.readings.rows"), choices: [{ value: "components", label: t("reports.readings.components2") }, { value: "files", label: t("reports.readings.files") }] }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const grain = p.grain === "files" ? "files" : "components"
            const cols = grain === "files" ? f.fileColumns : f.componentColumns
            if (!cols.has("codesmells__hotspot_score") || !f.commits) return absent(t("reports.readings.hotspotScoresNeedGit"))
            const where = grain === "files" ? prodFile(f) : prodComponents(f)
            const top = await ctx.query(`SELECT name, codesmells__hotspot_score AS score FROM ${grain} WHERE ${where} AND codesmells__hotspot_score > 0 ORDER BY score DESC, name LIMIT 5`)
            if (!top.length) return absent(t("reports.readings.noCodeScoresAbove"))
            const names = top.map(r => String(r.name))
            const [item] = await ctx.query(`SELECT sum(CASE WHEN name IN (${names.map(lit).join(",")}) THEN coalesce(complexity__lines, 0) ELSE 0 END) AS l, sum(coalesce(complexity__lines, 0)) AS lt, sum(CASE WHEN name IN (${names.map(lit).join(",")}) THEN coalesce(git__commits__last_180_days, 0) ELSE 0 END) AS c, sum(coalesce(git__commits__last_180_days, 0)) AS ct FROM ${grain} WHERE ${where}`)
            const commits = Number(item?.ct) || 0
            return {
                text: t("reports.readings.highestHotspotScoresTogether", { names: listOf(codes(names)), topLength: top.length, grain, value: pct(Number(item?.l) || 0, Number(item?.lt) || 0), value2: commits ? t("reports.readings.yetSawChangesLast", { value: pct(Number(item?.c) || 0, commits) }) : "" }),
                values: Object.fromEntries(top.map(r => [String(r.name), Math.round(Number(r.score) * 100) / 100])),
            }
        },
    },
    {
        id: "health",
        label: t("reports.readings.codeHealth"),
        describe: t("reports.readings.codesmellsCodeHealth1"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("codesmells__code_health")) return absent(t("reports.readings.scanHasNoCode"))
            const h = healthCol(ctx.revision)
            const where = prodFile(f)
            const [r] = await ctx.query(`SELECT sum(${h} * complexity__lines) / nullif(sum(CASE WHEN ${h} IS NOT NULL THEN complexity__lines END), 0) AS avg, sum(CASE WHEN ${h} < 4 THEN 1 ELSE 0 END) AS low, sum(CASE WHEN ${h} < 4 THEN complexity__lines ELSE 0 END) AS lowLines, sum(CASE WHEN ${h} IS NOT NULL THEN complexity__lines END) AS rated FROM files WHERE ${where}`)
            const worst = f.componentColumns.has("codesmells__code_health")
                ? await ctx.query(`SELECT name, ${h} AS health FROM components WHERE ${prodComponents(f)} AND ${h} IS NOT NULL AND complexity__lines >= 200 ORDER BY health ASC, name LIMIT 3`)
                : []
            if (r?.avg === null || r?.avg === undefined) return absent(t("reports.readings.noProductionFileHas"))
            const low = Number(r.low) || 0
            return {
                text: t("reports.readings.codeHealthAveragesOut", { value: b((Number(r.avg)).toFixed(1)), value2: low ? t("reports.readings.code", { files: b(t("common.count.file", { count: low })), rateBelow4TogetherTheyHold: t("common.noun.ratesBelow4ItHolds", { count: low }), value: pct(Number(r.lowLines) || 0, Number(r.rated) || 0) }) : t("reports.readings.noFileRatesBelow"), value3: worst.length ? t("reports.readings.amongLargerComponents200", { value: listOf(codes(worst.map(w => String(w.name))).map((c, i) => `${c} (${Number(worst[i].health).toFixed(1)})`)) }) : "" }),
                values: { "average health": Math.round(Number(r.avg) * 10) / 10, "files below 4": low },
            }
        },
    },
    {
        id: "churn",
        label: t("reports.readings.whereChangeLands"),
        describe: t("reports.readings.linesAddedDeletedPer"),
        params: [{ id: "days", label: t("reports.readings.period"), choices: PERIODS }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const d = ["30", "90", "180"].includes(p.days) ? p.days : "90"
            const add = `git__additions__last_${d}_days`, del = `git__deletions__last_${d}_days`
            if (!f.commits || !f.componentColumns.has(add)) return absent(t("reports.readings.scanHasNoGit2"))
            const rows = await ctx.query(`SELECT name, coalesce(${add}, 0) + coalesce(${del}, 0) AS churn FROM components WHERE coalesce(${add}, 0) + coalesce(${del}, 0) > 0 ORDER BY churn DESC, name`)
            const commits = f.summary[`git__commits__last_${d}_days`] ?? 0
            if (!rows.length) return { text: t("reports.readings.noLinesChangedLast", { d }), values: { "changed lines": 0 } }
            const total = rows.reduce((s, r) => s + Number(r.churn), 0)
            let cum = 0, k = 0
            for (const r of rows) { cum += Number(r.churn); k++; if (cum >= total / 2) break }
            const top = rows.slice(0, Math.min(3, rows.length))
            return {
                text: t("reports.readings.lastDaysChangedAcross", { d, commits: b(t("common.count.commit", { count: commits })), value: b(t("reports.readings.lines2", { total: n(total) })), components: t("common.count.component", { count: rows.length }), value2: k <= Math.max(3, rows.length / 10) ? t("reports.readings.workWasConcentratedHalf", { components: b(t("common.count.component", { count: k })) }) : t("reports.readings.halfThoseLinesWent", { components: b(t("common.count.component", { count: k })) }), value3: listOf(codes(top.map(r => String(r.name))).map((c, i) => `${c} (${pct(Number(top[i].churn), total)})`)) }),
                values: { commits, "changed lines": total, "components changed": rows.length, "components with half": k },
            }
        },
    },
    {
        id: "knowledge",
        label: t("reports.readings.whoKnowsWhat"),
        describe: t("reports.readings.perComponentHowFew"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.commits || !f.tables.has("git_commits")) return absent(t("reports.readings.scanHasNoGit"))
            const rows = await ctx.query(knowledgeSql(ctx.aliases))
            const kept = rows.filter(r => Number(r.added) >= 500)
            if (!kept.length) return absent(t("reports.readings.noComponentHasGrown"))
            const one50 = kept.filter(r => Number(r.cover50) === 1).length
            const one80 = kept.filter(r => Number(r.cover80) === 1).length
            const biggest = [...kept].sort((a, b) => Number(b.added) - Number(a.added)).slice(0, 10)
            const bigOne = biggest.filter(r => Number(r.cover50) === 1).length
            return {
                text: t("reports.readings.grew500LinesMore", { components: b(t("common.count.component", { count: kept.length })), one50: b(n(one50)), one80: b(n(one80)), value: bigOne === 0 ? t("reports.readings.noneTenGrewMost") : bigOne === 1 ? t("reports.readings.oneTenGrewMost") : t("reports.readings.tenGrewMostHave", { bigOne: n(bigOne) }), their: t("common.noun.its", { count: bigOne }) }),
                values: { components: kept.length, "one author covers half": one50, "one author covers 80%": one80 },
            }
        },
    },
    {
        id: "coupling",
        label: t("reports.readings.mostDepended"),
        describe: t("reports.readings.modularityCouplingDependentsDependencies"),
        async run(ctx, p) {
            const f = await probe(ctx)
            if (!f.componentColumns.has("modularity__coupling__dependents")) return absent(t("reports.readings.scanDidNotCount"))
            // ext ("go"): the components of one language, as the language's own tables beside it count them.
            const ext = /^[a-z0-9]{1,6}$/.test(p.ext ?? "") ? ` AND name IN (SELECT component FROM files WHERE name LIKE '%.${p.ext}')` : ""
            const top = await ctx.query(`SELECT name, modularity__coupling__dependents AS d FROM components WHERE ${prodComponents(f)}${ext} AND modularity__coupling__dependents > 0 ORDER BY d DESC, name LIMIT 3`)
            const all = await ctx.query(`SELECT coalesce(modularity__coupling__dependents, 0) AS d, coalesce(modularity__coupling__dependencies, 0) AS e FROM components WHERE ${prodComponents(f)}${ext}`)
            if (!top.length) return absent(t("reports.readings.noComponentDependsAnother"))
            return {
                text: t("reports.readings.mostDependedComponentOther", { name: code(String(top[0].name)), d: b(n(Number(top[0].d))), componentsImport: t("common.noun.componentImports", { count: Number(top[0].d) }), value: top.length > 1 ? t("reports.readings.nextCome", { value: listOf(top.slice(1).map(r => `${code(String(r.name))} (${n(Number(r.d))})`)) }) : "", others: t("common.count.other", { count: median(all.map(r => Number(r.d))) }), value2: median(all.map(r => Number(r.e))) === 0 ? t("reports.readings.none") : n(median(all.map(r => Number(r.e)))) }),
                values: Object.fromEntries(top.map(r => [String(r.name), Number(r.d)])),
            }
        },
    },
    {
        id: "rules",
        label: t("reports.readings.dependencyRules"),
        describe: t("reports.readings.rulesTableImportsConfigured"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.rules.applicable) return absent(t("reports.readings.noDependencyRuleApplies"))
            const by = await ctx.query(`SELECT rule, sum(status = 'violation') AS v, count(*) AS c FROM rules WHERE status <> 'not_applicable' GROUP BY rule ORDER BY v DESC, rule`)
            const broken = by.filter(r => Number(r.v) > 0)
            const name = (r: any) => ctx.label(String(r.rule))
            return {
                text: broken.length
                    ? `${t("reports.readings.importsBreak", { count: f.rules.violations, imports: b(t("common.count.import", { count: f.rules.violations })) })} ${by.length === 1 ? t("reports.readings.onlyRuleApplies", { value: code(name(broken[0])) }) : t("reports.readings.apply", { value: b(t("reports.readings.rules", { brokenLength: n(broken.length), byLength: n(by.length) })), value2: broken.length > 1 ? t("reports.readings.mostThemBreak", { value: code(name(broken[0])), v: n(Number(broken[0].v)) }) : t("reports.readings.allThemBreak", { value: code(name(broken[0])) }) })}${by.length > broken.length ? t("reports.readings.other", { value: by.length - broken.length === 1 ? t("reports.readings.ruleHolds") : t("reports.readings.rulesHold", { value: n(by.length - broken.length) }) }) : ""}`
                    : by.length === 1 ? t("reports.readings.onlyRuleAppliesHolds") : t("reports.readings.allRulesApplyHold", { byLength: n(by.length) }),
                values: { violations: f.rules.violations, "rules broken": broken.length },
            }
        },
    },
    {
        id: "modules",
        label: t("reports.readings.buildModules"),
        describe: t("reports.readings.modulesTableEachModule"),
        async run(ctx) {
            const f = await probe(ctx)
            const total = Object.values(f.moduleKinds).reduce((s, c) => s + c, 0)
            if (!total) return absent(t("reports.readings.buildDefinesNoModules"))
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
                text: t("reports.readings.buildDefines", { value: b(listOf(kinds.map(([k, c]) => modulesPhrase(k, c)))), value2: depending ? t("reports.readings.themDependAnotherModule", { depending: n(depending), value: n(total - depending), value2: top ? t("reports.readings.oneMostDependedNeeded", { value: code(top[0]), modules: t("common.count.module", { count: top[1] }) }) : "" }) : t("reports.readings.noneThemDeclaresDependency") }),
                values: { modules: total, "depend on another": depending },
            }
        },
    },
    {
        id: "age",
        label: t("reports.readings.codeAge"),
        describe: t("reports.readings.gitLastChangeAge"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("git__last_change_age_in_days")) return absent(t("reports.readings.scanTooOldSay"))
            const where = prodFile(f)
            const [r] = await ctx.query(`SELECT sum(CASE WHEN git__last_change_age_in_days > 365 THEN complexity__lines ELSE 0 END) AS old, sum(CASE WHEN git__last_change_age_in_days <= 90 THEN complexity__lines ELSE 0 END) AS fresh, sum(CASE WHEN git__last_change_age_in_days IS NOT NULL THEN complexity__lines END) AS total FROM files WHERE ${where}`)
            const total = Number(r?.total) || 0
            if (!total) return absent(t("reports.readings.noProductionFileHas2"))
            return {
                text: t("reports.readings.productionCodeHasNot", { value: b(pct(Number(r.old) || 0, total)), value2: b(pct(Number(r.fresh) || 0, total)) }),
                values: { "% older than a year": Math.round((100 * (Number(r.old) || 0)) / total), "% changed in 90 days": Math.round((100 * (Number(r.fresh) || 0)) / total) },
            }
        },
    },
    {
        id: "tests",
        label: t("reports.readings.tests"),
        describe: t("reports.readings.filesRoleTestProduction"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.fileColumns.has("role")) return absent(t("reports.readings.scanDidNotSort"))
            const ratio2 = f.roles.test ?? { files: 0, lines: 0 }
            const ignored = ignoredTestDirs(f)
            const left = ignored ? t("reports.readings.scanSIgnorePatterns", { testFolders: t("common.count.testFolder", { count: ignored }) }) : ""
            if (!ratio2.files) return { text: t("reports.readings.noFileCodeTest", { left }), values: { "test files": 0 } }
            // A test reaches a component by importing it, or by sitting inside it as Java and Go tests share their package.
            const [r] = await ctx.query(`SELECT count(*) AS c, sum(name NOT IN (SELECT component FROM files WHERE role = 'test' AND component IS NOT NULL UNION SELECT d."to" FROM component_connections_direct d JOIN files t ON t.name = d.file WHERE t.role = 'test')) AS u FROM components WHERE name IN (SELECT component FROM files WHERE role = 'production')`)
            const untested = Number(r?.u) || 0
            return {
                text: t("reports.readings.testsLinesLinesTest", { files: b(t("common.count.file", { count: ratio2.files })), lines: n(ratio2.lines), ratio: ratio(ratio2.lines, f.production.lines), value: b(t("reports.readings.ofThe", { untested: n(untested), productionComponents: t("common.count.productionComponent", { count: Number(r?.c) || 0 }) })), are: t("common.noun.is", { count: untested }), them: t("common.noun.it", { count: untested }), them2: t("common.noun.it", { count: untested }), left }),
                values: { "test files": ratio2.files, "components no test reaches": untested },
            }
        },
    },
    {
        id: "libraries",
        label: t("reports.readings.libraries"),
        describe: t("reports.readings.importsNameNoneCode"),
        async run(ctx, p) {
            const f = await probe(ctx)
            if (!f.tables.has("snippets")) return absent(t("reports.readings.scanDidNotKeep"))
            const rows = (await ctx.query(`SELECT content, file, component FROM snippets WHERE snippet_type = 'modularity__component__imports' AND content NOT IN (SELECT name FROM components)`)) as ImportRow[]
            const comps = (await ctx.query(`SELECT name FROM components`)).map(r => String(r.name))
            const libs = libraries(p.language ? rows.filter(r => importLanguage(r.file) === p.language) : rows, 2, ownPrefixes(comps)).filter(l => !l.internal)
            if (!libs.length) return absent(t("reports.readings.codeUsesNoLibraries"))
            const outside = libs.filter(l => !l.platform)
            const platform = libs.length - outside.length
            const top = [...outside].sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)).slice(0, 3)
            return {
                text: t("reports.readings.codeUses", { libraries: b(t("common.count.library", { count: outside.length })), value: platform ? t("reports.readings.notCountingLanguageS", { modules: t("common.count.module", { count: platform }) }) : "", value2: top.length ? t("reports.readings.mostWidelyUsed", { are: t("common.noun.is", { count: top.length }), value: listOf(top.map((l, i) => `\`${displayName(l.name, l.language)}\` (${i === 0 ? t("reports.readings.in", { t: t("common.count.file", { count: l.files }) }) : n(l.files)})`)) }) : "" }),
                values: { libraries: outside.length, "platform modules": libs.length - outside.length },
            }
        },
    },
    {
        id: "focus",
        label: t("reports.readings.oneComponent"),
        describe: t("reports.readings.oneComponentSSize"),
        params: [{ id: "component", label: t("reports.readings.component"), kind: "component" }],
        async run(ctx, p) {
            const f = await probe(ctx)
            const name = p.component
            if (!name) return { ...absent(t("reports.readings.chooseComponentParagraph")), instruction: true }
            const h = f.componentColumns.has("codesmells__code_health") ? `, ${healthCol(ctx.revision)} AS health` : ""
            const git = f.componentColumns.has("git__commits__last_180_days") ? ", git__commits__last_180_days AS commits, git__authors__last_180_days AS authors" : ""
            const [r] = await ctx.query(`SELECT complexity__files AS files, complexity__lines AS lines, modularity__coupling__dependents AS d, modularity__coupling__dependencies AS e${h}${git} FROM components WHERE name = ${lit(name)}`)
            if (!r) return absent(t("reports.readings.notSnapshot", { name: code(name) }))
            const [item] = f.tables.has("component_strongly_connected_groups") ? await ctx.query(`SELECT count(*) AS c FROM component_strongly_connected_groups WHERE "group" = (SELECT "group" FROM component_strongly_connected_groups WHERE component = ${lit(name)} LIMIT 1)`) : [null]
            const tangle = Number(item?.c) || 0
            // Counted like the report's dependents table: production components that import it.
            const [dep] = f.tables.has("component_connections_direct") ? await ctx.query(`SELECT count(DISTINCT "from") AS c FROM component_connections_direct WHERE "to" = ${lit(name)} AND "from" <> ${lit(name)} AND ${prodComponents(f, `"from"`)}`) : [null]
            const d = dep ? Number(dep.c) || 0 : Number(r.d) || 0
            const parts = [
                t("reports.readings.has", { name: code(name), files: b(t("common.count.file", { count: Number(r.files) || 0 })), value: b(t("reports.readings.lines3", { value: n(Number(r.lines) || 0) })) }),
                t("reports.readings.directlyImports", { d: b(n(d)), value: dep ? t("reports.readings.production") : "", componentsImport: t("common.noun.componentImports", { count: d }), otherComponents: t("common.count.otherComponent", { count: Number(r.e) || 0 }) }),
                tangle > 1 ? t("reports.readings.sitsTangleSoCannot", { components: t("common.count.component", { count: tangle }) }) : "",
                r.health !== undefined && r.health !== null ? t("reports.readings.codeHealthOut10", { value: Number(r.health).toFixed(1) }) : "",
                r.commits !== undefined ? t("reports.readings.last180DaysChanged", { people: t("common.count.person", { count: Number(r.authors) || 0 }), commits: t("common.count.commit", { count: Number(r.commits) || 0 }) }) : "",
            ]
            return { text: parts.join(""), values: { lines: Number(r.lines) || 0, dependents: d, dependencies: Number(r.e) || 0, "tangle size": tangle } }
        },
    },

    // ── Ecosystems ────────────────────────────────────────────────────────
    {
        id: "spring",
        label: t("reports.readings.spring"),
        describe: t("reports.readings.engineSSpringJpa"),
        async run(ctx) {
            const f = await probe(ctx)
            const s = f.summary
            if (!s.java__spring__beans) return absent(t("reports.readings.thereNoSpringBeans"))
            // JAX-RS resources answer requests too, but Spring's own counts leave them out.
            const [jr] = f.tables.has("unit_markers") ? await ctx.query(`SELECT count(DISTINCT m.unit) AS c FROM unit_markers m JOIN units u ON u.id = m.unit WHERE m.source = 'annotation' AND m.key = 'Path' AND coalesce(u.owner, '') = '' AND u.file IN (SELECT name FROM files WHERE ${prodFile(f)})`) : [null]
            const jaxrs = Number(jr?.c) || 0
            const kinds = [["java__spring__services", "service"], ["java__spring__repositories", "repository", "repositories"], ["java__spring__controllers", "controller"], ["java__spring__configurations", t("reports.readings.configurationClass"), t("reports.readings.configurationClasses")], ["java__spring__components", t("reports.readings.otherComponentClass"), t("reports.readings.otherComponentClasses")]] as const
            const verbs = [["get", "GET"], ["post", "POST"], ["put", "PUT"], ["patch", "PATCH"], ["delete", "DELETE"]].map(([k, l]) => [s[`java__spring__request_mappings__${k}`] ?? 0, l] as const).filter(([c]) => c > 0)
            return {
                text: t("reports.readings.springCreatesWiresCode", { beans: b(t("common.count.bean", { count: s.java__spring__beans })), value: kinds.filter(([k]) => s[k]).map(([k, one, many]) => `- ${plural(s[k], one, many)}${k === "java__spring__controllers" && s.java__spring__request_mappings__total ? `, mapping ${t("common.count.request", { count: s.java__spring__request_mappings__total })} (${listOf(verbs.map(([c, l]) => `${n(c)} ${l}`))})` : ""}`).join("\n"), value2: jaxrs || s.java__jpa__entities ? "\n\n" : "", value3: jaxrs ? t("reports.readings.classesMarkedPathAlso", { jaxRsResources: b(t("common.count.jaxRsResource", { count: jaxrs })), answer: t("common.noun.answers", { count: jaxrs }) }) : "", value4: jaxrs && s.java__jpa__entities ? " " : "", value5: s.java__jpa__entities ? t("reports.readings.mapDatabaseTables", { jpaEntities: b(t("common.count.jpaEntity", { count: s.java__jpa__entities })) }) : "" }),
                values: { beans: s.java__spring__beans, controllers: s.java__spring__controllers ?? 0, "JAX-RS resources": jaxrs, "request mappings": s.java__spring__request_mappings__total ?? 0, "JPA entities": s.java__jpa__entities ?? 0 },
            }
        },
    },
    {
        id: "django",
        label: t("reports.readings.django"),
        describe: t("reports.readings.djangoAppsModulesTable"),
        async run(ctx) {
            const f = await probe(ctx)
            const apps = f.moduleKinds.django ?? 0
            if (!apps) return absent(t("reports.readings.thereNoDjangoApps"))
            const marks = f.tables.has("unit_markers") ? await ctx.query(`SELECT kind, key, count(*) AS c FROM unit_markers WHERE source = 'filename' AND key IN ('views', 'models', 'abstract_models', 'forms', 'admin', 'serializers') GROUP BY 1, 2`) : []
            const count = (kind: string, ...keys: string[]) => marks.filter(m => m.kind === kind && keys.includes(String(m.key))).reduce((s, m) => s + Number(m.c), 0)
            const models = count("type", "models", "abstract_models"), views = count("function", "views") + count("type", "views"), forms = count("type", "forms")
            const found = [models ? t("common.count.modelClass", { count: models }) : "", views ? t("common.count.view", { count: views }) : "", forms ? t("common.count.form", { count: forms }) : ""].filter(Boolean)
            const [dash] = await ctx.query(`SELECT count(*) AS c FROM modules WHERE kind = 'django' AND (name LIKE 'tests.%' OR name LIKE '%.tests.%')`)
            return {
                text: t("reports.readings.projectHas", { modulesPhrase: b(modulesPhrase("django", apps)), value: Number(dash?.c) ? t("reports.readings.themOnlyTests", { dash: n(Number(dash.c)) }) : "", value2: found.length ? t("reports.readings.betweenThemTheyHold", { found: listOf(found) }) : "" }),
                values: { apps, "model classes": models, views },
            }
        },
    },
    {
        id: "node",
        label: t("reports.readings.javascriptTypescript"),
        describe: t("reports.readings.npmPackagesModulesTable"),
        async run(ctx) {
            const f = await probe(ctx)
            const pkgs = f.moduleKinds.node ?? 0
            const ts = languageShare(f, "TypeScript"), js = languageShare(f, "JavaScript")
            if (!pkgs && ts + js === 0) return absent(t("reports.readings.thereNoJavascriptTypescript"))
            // Counted as the React review's tables and roles count them, and only where react is imported.
            const [rc] = f.reactImporters && f.tables.has("units") ? await ctx.query(`SELECT count(DISTINCT u.id) AS c FROM units u WHERE ${reactComponent(f)} AND u.file IN (SELECT name FROM files WHERE ${prodFile(f)})`) : [null]
            const react = Number(rc?.c) || 0
            const names = pkgs ? (await ctx.query(`SELECT name FROM modules WHERE kind = 'node' ORDER BY files DESC LIMIT 3`)).map(r => code(String(r.name))) : []
            return {
                text: t("reports.readings.javascriptTypescriptTypescript", { value: pkgs ? t("reports.readings.workspaceHasLargest", { modulesPhrase: b(modulesPhrase("node", pkgs)), are: t("common.noun.is", { count: pkgs }), names: listOf(names) }) : "", value2: b(`${Math.round(100 * ts / Math.max(1e-9, ts + js))}%`), value3: react ? t("reports.readings.hasFunctionsNamedPascal", { reactComponents: b(t("common.count.reactComponent", { count: react })) }) : "", value4: f.vueComponents ? t("reports.readings.hasOnePerVue", { vueComponents: b(t("common.count.vueComponent", { count: f.vueComponents })) }) : "" }),
                values: { packages: pkgs, "TypeScript %": Math.round(100 * ts / Math.max(1e-9, ts + js)), "React components": react, "Vue components": f.vueComponents },
            }
        },
    },
    {
        id: "go",
        label: t("reports.readings.go"),
        describe: t("reports.readings.goModulesModulesTable"),
        async run(ctx) {
            const f = await probe(ctx)
            const mods = f.moduleKinds.go ?? 0
            if (!mods && languageShare(f, "Go") === 0) return absent(t("reports.readings.thereNoGoCode"))
            // Packages are the components declaring Go production code, as the package table counts them.
            const goPkgs = f.tables.has("units")
                ? `SELECT DISTINCT u.component AS c FROM units u WHERE u.file LIKE '%.go' AND u.file IN (SELECT name FROM files WHERE ${prodFile(f)})`
                : `SELECT DISTINCT component AS c FROM files WHERE name LIKE '%.go' AND ${prodFile(f)}`
            const [pk] = await ctx.query(`SELECT count(*) AS c FROM (${goPkgs})`)
            const packages = Number(pk?.c) || f.components
            const [i] = await ctx.query(`SELECT count(*) AS c FROM (${goPkgs}) WHERE c LIKE '%/internal' OR c LIKE '%/internal/%' OR c = 'internal' OR c LIKE 'internal/%'`)
            const [v] = f.tables.has("rules") ? await ctx.query(`SELECT coalesce(sum(status = 'violation'), 0) AS v, count(*) AS c FROM rules WHERE rule LIKE '%go__internal%' AND status <> 'not_applicable'`) : [null]
            const internal = Number(i?.c) || 0
            const INTERNAL = `("to" LIKE '%/internal' OR "to" LIKE '%/internal/%' OR "to" = 'internal' OR "to" LIKE 'internal/%')`
            const reached = internal ? await ctx.query(`SELECT "to" AS p, count(DISTINCT "from") AS c FROM component_connections_direct WHERE ${INTERNAL} AND "from" <> "to" GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3`) : []
            return {
                text: t("reports.readings.themInternal", { value: mods ? t("reports.readings.codeBuilds", { modulesPhrase: b(modulesPhrase("go", mods)) }) : t("reports.readings.codeHas"), packages: b(t("common.count.package", { count: packages })), internal: n(internal), value2: reached.length ? t("reports.readings.internalPackagesUsedMost", { value: listOf(reached.map((r, i) => `${code(String(r.p))} (${i === 0 ? t("reports.readings.by", { t: t("common.count.package", { count: Number(r.c) }) }) : n(Number(r.c))})`)) }) : "", value3: Number(v?.c) ? ` ${Number(v.v) ? t("reports.readings.goSRuleInternal", { imports: b(t("common.count.import", { count: Number(v.v) })), break: t("common.noun.breaks", { count: Number(v.v) }) }) : t("reports.readings.goSRuleInternal2")}` : "" }),
                values: { modules: mods, packages, internal, "internal imports from outside": Number(v?.v) || 0 },
            }
        },
    },
    {
        id: "dotnet",
        label: t("reports.readings.net"),
        describe: t("reports.readings.netProjectsModulesTable"),
        async run(ctx) {
            const f = await probe(ctx)
            const projects = f.moduleKinds.dotnet ?? 0
            if (!projects && languageShare(f, "C#") === 0) return absent(t("reports.readings.thereNoCCode"))
            const [dep] = projects ? await ctx.query(`SELECT count(*) AS c FROM modules WHERE kind = 'dotnet' AND coalesce(depends_on, '') <> ''`) : [null]
            return {
                text: t("reports.readings.cProductionCodeSpread", { value: projects ? t("reports.readings.solutionHasThemReference", { modulesPhrase: b(modulesPhrase("dotnet", projects)), value: n(Number(dep?.c) || 0) }) : "", value2: b(`${Math.round(100 * languageShare(f, "C#"))}%`), namespaces: t("common.count.namespace", { count: f.components }) }),
                values: { projects, namespaces: f.components },
            }
        },
    },
    {
        id: "php",
        label: t("reports.readings.php"),
        describe: t("reports.readings.composerPackagesModulesTable"),
        async run(ctx) {
            const f = await probe(ctx)
            const pkgs = f.moduleKinds.composer ?? 0
            if (!pkgs && languageShare(f, "PHP") === 0) return absent(t("reports.readings.thereNoPhpCode"))
            const [bundles] = await ctx.query(`SELECT count(*) AS c FROM components WHERE name LIKE '%Bundle' OR name LIKE '%Bundle/%' OR name LIKE '%Bundle\\%'`)
            const nb = Number(bundles?.c) || 0
            return {
                text: t("reports.readings.phpProductionCode", { value: pkgs ? t("reports.readings.codeSplit", { modulesPhrase: b(modulesPhrase("composer", pkgs)) }) : "", value2: b(`${Math.round(100 * languageShare(f, "PHP"))}%`), namespaces: t("common.count.namespace", { count: f.components }), value3: nb ? t("reports.readings.thoseSitInsideSymfony", { nb: n(nb) }) : "" }),
                values: { packages: pkgs, namespaces: f.components, "bundle namespaces": nb },
            }
        },
    },

    // ── Mobile ────────────────────────────────────────────────────────────
    {
        id: "mobile-apps",
        label: t("reports.readings.mobileApps"),
        describe: t("reports.readings.mobileAppsScanFound"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!f.mobileApps.length) return absent(t("reports.readings.scanFoundNoMobile"))
            const deps = await ctx.query(`SELECT d.name AS app, dd.role, dd.name, dd.version FROM deployable_dependencies dd JOIN deployables d ON d.id = dd.deployable WHERE d.kind = 'mobile_app' AND dd.role IN ('framework', 'runtime')`)
            const libs = await ctx.query(`SELECT d.name AS app, count(*) AS c FROM deployable_dependencies dd JOIN deployables d ON d.id = dd.deployable WHERE d.kind = 'mobile_app' AND dd.role = 'library' GROUP BY 1`)
            const PLATFORM: Record<string, string> = { android: t("reports.readings.android"), ios: "iOS", flutter: t("reports.readings.flutter"), "react-native": t("reports.readings.reactNative") }
            const real = f.mobileApps.filter(a => !isSampleApp(a.name))
            const samples = f.mobileApps.filter(a => isSampleApp(a.name))
            const described = real.length ? real : f.mobileApps.slice(0, 1)
            const RUNTIME: Record<string, string> = { minSdk: t("reports.readings.minimumSdk"), targetSdk: t("reports.readings.targetSdk"), compileSdk: t("reports.readings.compileSdk"), "deployment-target": t("reports.readings.deploymentTarget"), swift: t("reports.readings.swift"), "swift-tools": t("reports.readings.swiftTools"), dart: t("reports.readings.dart"), node: t("reports.readings.node"), java: t("reports.readings.java") }
            const sentences = described.map(a => {
                const mine = deps.filter(d => d.app === a.name)
                const fw = mine.filter(d => d.role === "framework").map(d => String(d.name))
                const rt = mine.filter(d => d.role === "runtime" && d.version).map(d => `${RUNTIME[String(d.name)] ?? d.name} ${d.version}`)
                const count = Number(libs.find(l => l.app === a.name)?.c) || 0
                return `${b(a.name)} (${PLATFORM[a.platform] ?? a.platform})${fw.length ? t("reports.readings.built", { fw: listOf(fw) }) : ""}${rt.length ? `${fw.length ? "," : ""} ${listOf(rt)}` : ""}${count ? t("reports.readings.declared", { libraries: t("common.count.library", { count: count }) }) : ""}.`
            })
            const rest = f.mobileApps.filter(a => !described.includes(a))
            const sampleNote = rest.length ? t("reports.readings.besideThem", { count: described.length, apps: samples.length === rest.length ? t("common.count.sampleApp", { count: rest.length }) : t("common.count.otherApp", { count: rest.length }), names: `${listOf(rest.slice(0, 6).map(a => a.name))}${rest.length > 6 ? t("reports.readings.more") : ""}` }) : ""
            return {
                text: t("reports.readings.workspaceShips", { mobileApps: t("common.count.mobileApp", { count: real.length || f.mobileApps.length }), value: sentences.join(" "), sampleNote }),
                values: { apps: f.mobileApps.length },
            }
        },
    },
    {
        id: "android",
        label: t("reports.readings.android"),
        describe: t("reports.readings.androidModulesTypeModules"),
        async run(ctx) {
            const f = await probe(ctx)
            const apps = f.moduleTypes["android-application"] ?? 0, libraries = f.moduleTypes["android-library"] ?? 0
            if (!apps && !libraries) return absent(t("reports.readings.scanFoundNoAndroid"))
            const decl = f.tables.has("app_declarations") ? await ctx.query(`SELECT kind, count(*) AS c, sum(exported IN ('true', 'implied')) AS exported FROM app_declarations WHERE platform = 'android' GROUP BY kind`) : []
            const d = (k: string) => decl.find(r => r.kind === k)
            const [ui] = f.tables.has("unit_markers") ? await ctx.query(`SELECT count(DISTINCT CASE WHEN key = 'Composable' THEN unit END) AS composables, count(DISTINCT CASE WHEN source = 'supertype' AND key IN ('Fragment', 'DialogFragment', 'BottomSheetDialogFragment') THEN unit END) AS fragments, count(DISTINCT CASE WHEN source = 'manifest' AND key = 'activity' THEN unit END) AS activities FROM unit_markers`) : [null]
            const components = ["activity", "service", "receiver", "provider"].map(k => [k, Number(d(k)?.c) || 0, Number(d(k)?.exported) || 0] as const).filter(([, c]) => c)
            const exported = components.reduce((s, [, , e]) => s + e, 0)
            return {
                text: t("reports.readings.and", { applicationModules: t("common.count.applicationModule", { count: apps }), libraryModules: t("common.count.libraryModule", { count: libraries }), value: components.length ? t("reports.readings.manifestsDeclareOtherApps", { value: listOf(components.map(([k, c]) => plural(c, k, k === "activity" ? "activities" : `${k}s`))), value2: b(t("reports.readings.themExported", { exported: n(exported) })) }) : "", value2: d("permission") ? t("reports.readings.ask", { permissions: b(t("common.count.permission", { count: Number(d("permission").c) })) }) : "", value3: components.length ? "." : "", value4: ui && Number(ui.composables) ? t("reports.readings.uiAgainst", { composables: b(t("common.count.composable", { count: Number(ui.composables) })), fragments: t("common.count.fragment", { count: Number(ui.fragments) || 0 }) }) : "" }),
                values: { "application modules": apps, "library modules": libraries, composables: Number(ui?.composables) || 0, fragments: Number(ui?.fragments) || 0, "exported components": exported },
            }
        },
    },
    {
        id: "ios",
        label: "iOS",
        describe: t("reports.readings.swiftPackageXcodeTargets"),
        async run(ctx) {
            const f = await probe(ctx)
            const swift = f.languages.find(l => l.language === "Swift")?.lines ?? 0, objc = f.languages.find(l => l.language === "Objective-C")?.lines ?? 0
            if (!swift && !objc) return absent(t("reports.readings.snapshotHoldsNoSwift"))
            const [ui] = f.tables.has("unit_markers") ? await ctx.query(`SELECT count(DISTINCT CASE WHEN key = 'View' THEN unit END) AS swiftui, count(DISTINCT CASE WHEN key IN ('UIViewController', 'UITableViewController', 'UICollectionViewController') THEN unit END) AS controllers, count(DISTINCT CASE WHEN key IN ('UIView', 'UITableViewCell', 'UICollectionViewCell') THEN unit END) AS uiviews FROM unit_markers WHERE source = 'supertype'`) : [null]
            const targets = (f.moduleKinds.swiftpm ?? 0) + (f.moduleKinds.xcode ?? 0)
            const sw = Number(ui?.swiftui) || 0, uk = (Number(ui?.controllers) || 0) + (Number(ui?.uiviews) || 0)
            return {
                text: `${targets ? t("reports.readings.codeBuilt", { Boolean: listOf([f.moduleKinds.xcode ? modulesPhrase("xcode", f.moduleKinds.xcode) : "", f.moduleKinds.swiftpm ? modulesPhrase("swiftpm", f.moduleKinds.swiftpm) : ""].filter(Boolean)) }) : ""}${sw + uk ? t("reports.readings.uiSwiftui", { swiftuiViews: b(t("common.count.swiftuiView", { count: sw })), value: b(t("reports.readings.uikitViewsViewControllers", { uk: n(uk) })), sw: pct(sw, sw + uk) }) : ""}${objc ? t("reports.readings.objectiveCSwiftObjective", { objc: b(pct(objc, swift + objc)) }) : ""}`,
                values: { "SwiftUI views": sw, "UIKit views and controllers": uk, "Objective-C lines": objc, "Swift lines": swift },
            }
        },
    },
    {
        id: "flutter",
        label: t("reports.readings.flutter"),
        describe: t("reports.readings.dartPackagesModulesWidgets"),
        async run(ctx) {
            const f = await probe(ctx)
            if (!(f.moduleKinds.pub ?? 0) && !f.languages.some(l => l.language === "Dart")) return absent(t("reports.readings.snapshotHoldsNoDart"))
            const rows = f.tables.has("unit_markers") ? await ctx.query(`SELECT key, count(DISTINCT unit) AS c FROM unit_markers WHERE (source = 'supertype' AND key IN ('StatelessWidget', 'StatefulWidget', 'ConsumerWidget', 'ConsumerStatefulWidget', 'HookWidget', 'HookConsumerWidget', 'Bloc', 'Cubit', 'ChangeNotifier', 'StateNotifier', 'Notifier', 'AsyncNotifier', 'GetxController')) OR (source = 'annotation' AND key IN ('riverpod', 'Riverpod', 'freezed')) GROUP BY key`) : []
            const c = (...keys: string[]) => rows.filter(r => keys.includes(String(r.key))).reduce((s, r) => s + Number(r.c), 0)
            const widgets = c("StatelessWidget", "StatefulWidget", "ConsumerWidget", "ConsumerStatefulWidget", "HookWidget", "HookConsumerWidget")
            const state = [["Bloc", c("Bloc", "Cubit")], ["Riverpod", c("ConsumerWidget", "ConsumerStatefulWidget", "HookConsumerWidget", "StateNotifier", "Notifier", "AsyncNotifier", "riverpod", "Riverpod")], ["Provider", c("ChangeNotifier")], ["GetX", c("GetxController")]] as const
            const used = state.filter(([, k]) => k > 0)
            return {
                text: `${f.moduleKinds.pub ? `${modulesPhrase("pub", f.moduleKinds.pub)}. ` : ""}${b(t("common.count.widget", { count: widgets }))}.${used.length ? t("reports.readings.stateManaged", { value: listOf(used.map(([name, k]) => `${name} (${n(k)} classes)`)), value2: used.length > 1 ? `: ${b(t("reports.readings.moreThanOneApproach"))}` : "" }) : ""}${c("freezed") ? t("reports.readings.generatedFreezed", { classes: t("common.count.class", { count: c("freezed") }) }) : ""}`,
                values: { widgets, ...Object.fromEntries(state.map(([k, v]) => [k, v])) },
            }
        },
    },
    {
        id: "kmp",
        label: t("reports.readings.kotlinMultiplatform"),
        describe: "Kotlin lines by source set (the src/<name>Main folders), and expect declarations with the platforms that provide an actual (unit_markers).",
        async run(ctx) {
            const f = await probe(ctx)
            if (!(f.moduleTypes["kotlin-multiplatform"] ?? 0)) return absent(t("reports.readings.scanFoundNoKotlin"))
            const sets = await ctx.query(`SELECT substr(name, instr(name, '/src/') + 5, instr(substr(name, instr(name, '/src/') + 5), '/') - 1) AS source_set, sum(coalesce(complexity__lines, 0)) AS lines FROM files WHERE name GLOB '*/src/*Main/*.kt' GROUP BY 1 ORDER BY 2 DESC`)
            const total = sets.reduce((s, r) => s + Number(r.lines), 0)
            const common = Number(sets.find(r => r.source_set === "commonMain")?.lines) || 0
            const [ea] = f.tables.has("unit_markers") ? await ctx.query(`SELECT count(DISTINCT CASE WHEN key = 'expect' THEN unit END) AS expects FROM unit_markers WHERE source = 'keyword'`) : [null]
            return {
                text: `${t("common.count.multiplatformModule", { count: f.moduleTypes["kotlin-multiplatform"] })}. ${total ? t("reports.readings.kotlinSourceSetsShared", { common: b(pct(common, total)), value: listOf(sets.filter(r => r.source_set !== "commonMain").slice(0, 4).map(r => `${r.source_set} (${pct(Number(r.lines), total)})`)) }) : ""}${Number(ea?.expects) ? t("reports.readings.commonCodeDeclaresPlatforms", { expectDeclarations: b(t("common.count.expectDeclaration", { count: Number(ea.expects) })) }) : ""}`,
                values: { "shared lines": common, "source-set lines": total, expects: Number(ea?.expects) || 0 },
            }
        },
    },
    // The framework's roles and layers; "role" takes a role to describe, so only templates write it.
    ...ANATOMY_READINGS.filter(r => r.id !== "role"),
]

const byId = new Map([...READINGS, ...ANATOMY_READINGS].map(r => [r.id, r]))
export const readingDef = (id: string) => byId.get(id)

/** Runs one reading; a failure comes back as its message, not a thrown error. */
export async function runReading(id: string, params: Record<string, string> | undefined, ctx: ReadingContext): Promise<ReadingOutput> {
    const def = byId.get(id)
    if (!def) return absent(t("reports.readings.noReadingCalled", { id }))
    const defaults = Object.fromEntries((def.params ?? []).map(p => [p.id, p.choices?.[0]?.value ?? ""]))
    const out = await def.run(ctx, { ...defaults, ...(params ?? {}) })
    // plain: for readers outside engineering, a name reads as its last two parts, not as code.
    return params?.plain === "1" ? { ...out, text: out.text.replace(/`([^`]+)`/g, (_, name: string) => plainName(name)) } : out
}

/** `org.apache.fineract.portfolio.loanaccount` reads "portfolio loanaccount"; "(root)" and short names stay. */
export function plainName(name: string): string {
    const parts = name.split(/[./\\]+/).filter(Boolean)
    return parts.length <= 2 ? name : parts.slice(-2).join(" ")
}
