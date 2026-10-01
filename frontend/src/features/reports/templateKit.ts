// What report templates are written with: the writer, what a section needs
// from the snapshot, the views a figure is taken from, the explanations of
// terms, and the sections several templates share. The templates themselves
// are in reportTemplates.ts (general and quick wins) and
// ecosystemTemplates.ts (one framework or build tool each).
//
// Readers are not all architects. A section can open with a paragraph that
// says, in plain words, what its terms mean and how to read its numbers; the
// gallery can leave these out for readers who know them.

import { TABLE_PRESETS } from "./reportCells"
import { newId, type Block, type CellSpec, type TextKind } from "./reportDoc"
import { ignoredTestDirs, prodComponents, realModule, type Ecosystem, type EcosystemId, type SnapshotFacts } from "./readings"
import { t } from "~/shared/i18n"

export interface TemplateParam { id: string; label: string; kind: "component" }

export interface TemplateContext {
    facts: SnapshotFacts
    ecosystems: Ecosystem[]
    params: Record<string, string>
    /** Write the paragraphs that explain each section's terms; on unless turned off. */
    explain?: boolean
}

export interface ReportTemplate {
    id: string
    name: string
    /** Who reads it, in a few words. */
    audience: string
    /** What the report holds and what it is for, in plain words. */
    summary: string
    /** The situation it is made for, as "Use it when …". */
    when: string
    ecosystem?: EcosystemId
    /** The gallery's icon, when the template has its own. */
    icon?: string
    params?: TemplateParam[]
    /** The report's name for a workspace. */
    title: (workspace: string, params: Record<string, string>) => string
    build: (w: Writer, ctx: TemplateContext) => void
}

// ── Writing a template ────────────────────────────────────────────────────

const cellBlock = (spec: CellSpec, title = ""): Block => ({ id: newId(), kind: "cell", cell: { spec, title, caption: "", output: null, ranOn: null } })

const paragraphs = (t: string) => t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)

/** The builder a template writes with; sections the snapshot cannot fill are skipped and named. */
export class Writer {
    blocks: Block[] = []
    skipped: Array<{ section: string; why: string }> = []
    /** The ecosystem the report is about, so shared explanations use its own examples; "" when none leads. */
    eco: EcosystemId | "" = ""
    constructor(readonly facts: SnapshotFacts, readonly explains = true) {}

    text(kind: TextKind, text: string) { this.blocks.push({ id: newId(), kind, text }); return this }
    h2(t: string) { return this.text("h2", t) }
    h3(t: string) { return this.text("h3", t) }
    p(t: string) { return this.text("p", t) }
    /** A paragraph that explains a section's terms to a reader new to them; left out when explanations are off. */
    /** A plain-words explanation of the section's terms; a blank line in it starts a new paragraph. */
    explain(t: string) {
        if (this.explains) for (const part of paragraphs(t)) this.blocks.push({ id: newId(), kind: "p", text: part, explain: true })
        return this
    }
    /** An explanation of the figure or table right after it: printed only once that slot is filled. */
    explainSlot(t: string) {
        if (this.explains) for (const part of paragraphs(t)) this.blocks.push({ id: newId(), kind: "p", text: part, explain: true, beforeSlot: true })
        return this
    }
    /** A paragraph for the writer: the prompt shows where the text goes, and never prints. */
    prompt(t: string) { this.blocks.push({ id: newId(), kind: "p", text: "", prompt: t }); return this }
    reading(id: string, params?: Record<string, string>) { this.blocks.push(cellBlock({ type: "reading", reading: id, ...(params ? { params } : {}) })); return this }
    table(preset: string, limit = 10, title?: string) {
        const p = TABLE_PRESETS.find(x => x.id === preset)
        if (p) this.blocks.push(cellBlock({ type: "table", source: p.source, columns: p.columns, sort: p.sort, desc: p.desc, limit, ...(p.scope ? { scope: p.scope } : {}) }, title ?? p.label))
        return this
    }
    sql(title: string, sql: string, limit = 20) { this.blocks.push(cellBlock({ type: "sql", sql: sql.replace(/\s+/g, " ").trim(), limit }, title)); return this }
    /**
     * An exhibit (features/exhibits): computed and drawn when the report runs,
     * with no view to visit, as a figure where it has one and a table where not.
     */
    exhibit(kind: string, params: Record<string, unknown>, title: string) {
        this.blocks.push(cellBlock({ type: "exhibit", kind, v: 1, params }, title))
        this.used.add(`exhibit:${kind}:${JSON.stringify(params)}`)
        return this
    }
    slot(kind: "figure" | "table", title: string, view: string, route: string, hint: string, take?: string) {
        this.blocks.push(cellBlock({ type: "slot", kind, view, route, hint, ...(take ? { take } : {}) }, title))
        this.used.add(`slot:${route}#${take ?? ""}`)
        return this
    }
    /** Figures this report already shows, so a shared section picks another picture rather than repeat one. */
    used = new Set<string>()
    /** Whether this report already has this slot (by route and take) or exhibit. */
    has(v: ViewAsk | { kind: string; params: Record<string, unknown> }): boolean {
        return "route" in v ? this.used.has(`slot:${v.route}#${v.take ?? ""}`) : this.used.has(`exhibit:${v.kind}:${JSON.stringify(v.params)}`)
    }
    /** A section, written only when the snapshot has what it needs; `need` is true or the reason it has not. */
    section(title: string, need: true | string, body: () => void) {
        if (need !== true) { this.skipped.push({ section: title, why: need }); return this }
        this.h2(title)
        body()
        return this
    }
}

// What a section needs, as true or the reason the snapshot falls short. The
// reasons are shown in the gallery, so they say what is missing in plain words.
export const needs = {
    git: (f: SnapshotFacts): true | string => (f.commits ? true : t("reports.templateKit.scanHasNoGit")),
    rules: (f: SnapshotFacts): true | string => (f.rules.applicable ? true : t("reports.templateKit.noDependencyRulesSet")),
    modules: (f: SnapshotFacts): true | string => (Object.keys(f.moduleKinds).length ? true : t("reports.templateKit.buildDefinesNoModules")),
    health: (f: SnapshotFacts): true | string => (f.fileColumns.has("codesmells__code_health") ? true : t("reports.templateKit.scanHasNoCode")),
    tests: (f: SnapshotFacts): true | string => (f.fileColumns.has("role") ? true : t("reports.templateKit.scanDidNotSort")),
    testFiles: (f: SnapshotFacts): true | string => {
        const tests = f.roles.test?.files ?? 0
        if (!tests) return t("reports.templateKit.codeHasNoTest")
        // Few tests beside test folders the scan ignored: what is left says little about reach.
        return ignoredTestDirs(f) && tests * 20 < f.production.files ? t("reports.templateKit.scanLeftOutMost") : true
    },
    snippets: (f: SnapshotFacts): true | string => (f.tables.has("snippets") ? true : t("reports.templateKit.scanDidNotKeep")),
    tangles: (f: SnapshotFacts): true | string => (f.tangles ? true : t("reports.templateKit.noComponentsDependEach")),
    coChange: (f: SnapshotFacts): true | string => (f.commits && f.tables.has("git_component_shared_commits") ? true : t("reports.templateKit.scanHasNoRecord")),
    reach: (f: SnapshotFacts): true | string => (f.tables.has("component_connections_indirect") ? true : t("reports.templateKit.scanDidNotFollow")),
    recent: (f: SnapshotFacts): true | string => (!f.commits ? t("reports.templateKit.scanHasNoGit") : (f.summary.git__commits__last_30_days ?? 0) > 0 ? true : t("reports.templateKit.noCommitLanded30")),
    age: (f: SnapshotFacts): true | string => (f.fileColumns.has("git__last_change_age_in_days") ? true : t("reports.templateKit.scanOlderThanCode")),
    component: (c: string | undefined): true | string => (c ? true : t("reports.templateKit.noComponentChosen")),
    column: (f: SnapshotFacts, c: string, why: string): true | string => (f.componentColumns.has(c) ? true : why),
    all: (...xs: Array<true | string>): true | string => xs.find(x => x !== true) ?? true,
}

// Views a slot opens, set the way the figure needs them. Every one of them
// offers its figure or table to Add to report.
export const VIEWS: Record<string, ViewAsk | ((...a: any[]) => ViewAsk)> & Record<string, any> = {
    // The dependency graph: components while they stay legible, rolled up into the code's own folders beyond that.
    structure: (f: SnapshotFacts) => (f.components <= 60
        ? { view: t("reports.templateKit.connections"), route: "/views/connections?level=components&by=none", hint: t("reports.templateKit.graphComponents") }
        : { view: t("reports.templateKit.connections"), route: "/views/connections?level=groups&by=Folders", hint: t("reports.templateKit.graphRolledUpFolder") }),
    // Folders need no lens, so the graph reads at any size.
    graph: { view: t("reports.templateKit.connections"), route: "/views/connections?level=groups&by=Folders", hint: t("reports.templateKit.graphRolledUpFolder") },
    focus: (c: string) => ({ view: t("reports.templateKit.connections"), route: `/views/connections?level=components&sel=${encodeURIComponent(c)}`, hint: t("reports.templateKit.graphComponentsSelected", { c }) }),
    // facet=production: the same production pairs as the template's own table beside it.
    hidden: { view: t("reports.templateKit.connections"), route: "/views/connections?source=git&rep=list&relation=no-import&facet=production", hint: t("reports.templateKit.coChangeWithoutImport"), take: "Connections list" },
    // A table: the matrix exports as rows and numbered columns, in dependency levels, up to 40 of them.
    // Components while they fit; beyond that it needs a lens whose groups do.
    matrix: (f: SnapshotFacts) => (f.components <= 40
        ? { view: t("reports.templateKit.connections"), route: "/views/connections?rep=matrix&level=components&order=levels&by=none", hint: t("reports.templateKit.matrixComponentsLevels"), take: "Dependency matrix" }
        : { view: t("reports.templateKit.connections"), route: "/views/connections?rep=matrix&level=groups&order=levels&by=Folders", hint: t("reports.templateKit.matrixRolledUpFolder"), take: "Dependency matrix" }),
    // Arcs between folders: how much each part of the tree leans on each other part.
    chord: { view: t("reports.templateKit.connections"), route: "/views/connections?rep=chord&level=groups&by=Folders", hint: t("reports.templateKit.chordRolledUpFolder"), take: "Connections chord" },
    combined: (c: string) => ({ view: t("reports.templateKit.connections"), route: `/views/connections?source=combined&level=components&sel=${encodeURIComponent(c)}`, hint: t("reports.templateKit.importsCoChangeSelected", { c }) }),
    plot: (preset: string, hint: string) => ({ view: t("reports.templateKit.metrics"), route: `/views/metrics?view=plot&preset=${preset}`, hint }),
    // Files: production only, or licences, Markdown and lock files lead every ranking.
    treemap: (preset: string, grain: "components" | "files" | "directories", hint: string) => ({ view: t("reports.templateKit.hotspots"), route: `/views/components/hotspots?preset=${preset}&grain=${grain}${grain === "files" ? "&facet=production" : ""}`, hint }),
    cyclesAround: (c: string) => ({ view: t("reports.templateKit.cycles"), route: `/views/components/cycles?component=${encodeURIComponent(c)}`, hint: t("reports.templateKit.tangleSits", { c }) }),
    activity: { view: t("reports.templateKit.activity"), route: "/views/git/activity?tab=commits", hint: t("reports.templateKit.linesAddedRemovedMonth"), take: "Lines added and removed by month" },
    // Where the work moved: each component's share of the changed lines now against the two years before.
    workMoved: (window: "30" | "90" | "180" | "365" = "365") => ({ view: t("reports.templateKit.activity"), route: `/views/git/activity?tab=now&window=${window}`, hint: t("reports.templateKit.whereWorkMovedAgainst", { value: window === "365" ? t("reports.templateKit.lastYear") : t("reports.templateKit.lastDays", { window }) }), take: "Where the work moved" }),
    // Each month's changed lines split by the health of the files they went into.
    effort: { view: t("reports.templateKit.activity"), route: "/views/git/activity?tab=effort", hint: t("reports.templateKit.eachMonthSChanged"), take: "Where each month's changed lines went" },
    // Co-change between folders: which parts of the tree keep changing together.
    cochangeGraph: { view: t("reports.templateKit.connections"), route: "/views/connections?source=git&level=groups&by=Folders", hint: t("reports.templateKit.changedTogetherRolledUp") },
    // The Overview's year of commits by day: the grain a month's review reads at.
    calendar: { view: t("reports.templateKit.overview"), route: "/", hint: t("reports.templateKit.yearCommitsOneSquare"), take: "Commit calendar" },
    breadth: { view: t("reports.templateKit.activity"), route: "/views/git/activity?tab=breadth", hint: t("reports.templateKit.shareCommitsHowMany"), take: "Components touched per commit" },
    workNow: { view: t("reports.templateKit.activity"), route: "/views/git/activity?tab=now", hint: t("reports.templateKit.changedLinesComponentAgainst"), take: "Where the changed lines went" },
    changes: { view: t("reports.templateKit.changes"), route: "/views/changes", hint: t("reports.templateKit.snapshotAgainstOneBefore"), take: "Changes summary" },
    outline: { view: t("reports.templateKit.metrics"), route: "/views/metrics?grain=directories", hint: t("reports.templateKit.directoriesEveryNumberRolled"), take: "Metrics: directories" },
    // The Units view's boundary between two of the framework's roles; its lane overview when no reference crosses it.
    flow: (a: string, b: string, hint: string) => ({ view: t("reports.templateKit.units"), route: `/views/units?flow=${a},${b}`, hint, take: "Boundary flow|How the layers lean" }),
    hotspots: { view: t("reports.templateKit.hotspots"), route: "/views/components/hotspots", hint: t("reports.templateKit.componentsPacked") },
    cycles: { view: t("reports.templateKit.cycles"), route: "/views/components/cycles", hint: t("reports.templateKit.largestTangleLevelsCut") },
    knowledge: { view: t("reports.templateKit.authors"), route: "/views/git/authors?grain=components", hint: t("reports.templateKit.knowledgeHowMuchEach"), take: "Knowledge by component" },
    knowledgeMap: { view: t("reports.templateKit.authors"), route: "/views/git/authors?grain=components", hint: t("reports.templateKit.knowledgeCodeTilesColoured"), take: "Code by active contributors" },
    // The Units view's pictures of the framework's roles; they need the classes the scan records (has units).
    layers: { view: t("reports.templateKit.units"), route: "/views/units", hint: t("reports.templateKit.rolesFloorsImportsBetween"), take: "How the layers lean" },
    lanes: { view: t("reports.templateKit.units"), route: "/views/units", hint: t("reports.templateKit.everyFolderFilesTheir"), take: "Where each lane lives" },
    reach: { view: t("reports.templateKit.units"), route: "/views/units?colour=reach", hint: t("reports.templateKit.everyFileColouredWhether"), take: "What the entry points reach" },
    libraries: { view: t("reports.templateKit.libraries"), route: "/views/libraries", hint: t("reports.templateKit.rolledUpTwoSegments"), take: "Libraries" },
    rules: { view: t("reports.templateKit.rules"), route: "/views/rules", hint: t("reports.templateKit.findingsRule") },
    trends: { view: t("reports.templateKit.trends"), route: "/views/trends", hint: t("reports.templateKit.systemShapeAcrossSnapshots"), take: "Over time" },
    dirs: { view: t("reports.templateKit.metrics"), route: "/views/metrics?grain=directories", hint: t("reports.templateKit.directoriesGrain"), take: "Metrics: directories" },
}
/** A view to take from, and optionally which of its exportables (by the start of its title). */
export interface ViewAsk { view: string; route: string; hint: string; take?: string }
export const slotOf = (w: Writer, kind: "figure" | "table", title: string, v: ViewAsk) => w.slot(kind, title, v.view, v.route, v.hint, v.take)

export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
/** Components with production code, the root folder's "." among them; every component when files have no roles. */
export const prod = (f: SnapshotFacts, col: string) => prodComponents(f, col)
/** Components a test reaches: one sits inside it or imports it. */
export const REACHED = `(SELECT component FROM files WHERE role = 'test' AND component IS NOT NULL UNION SELECT d."to" FROM component_connections_direct d JOIN files t ON t.name = d.file WHERE t.role = 'test')`
/** A column when the snapshot has it. */
export const opt = (f: SnapshotFacts, col: string, expr: string) => (f.componentColumns.has(col) ? `, ${expr}` : "")

export const SQL = {
    violations: `SELECT rule, "from", "to", count(*) AS imports FROM rules WHERE status = 'violation' GROUP BY 1, 2, 3 ORDER BY imports DESC`,
    tangles: `SELECT min(component) AS tangle, count(*) AS components FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1 ORDER BY components DESC`,
    modules: `SELECT name, kind, files, internal_dependencies AS "depends on (internal)", declared_dependencies AS "declared dependencies" FROM modules WHERE ${realModule()} ORDER BY files DESC`,
    churn: (d: string) => `SELECT name, coalesce(git__additions__last_${d}_days, 0) + coalesce(git__deletions__last_${d}_days, 0) AS "changed lines", git__commits__last_${d}_days AS commits, git__authors__last_${d}_days AS authors FROM components ORDER BY 2 DESC, name`,
    filesOf: (c: string) => `SELECT name, complexity__lines AS lines, codesmells__code_health AS health, codesmells__hotspot_score AS hotspot, git__commits__last_180_days AS "commits, 180 days" FROM files WHERE component = ${lit(c)} ORDER BY hotspot DESC NULLS LAST, name`,
    dependentsOf: (c: string) => `SELECT "from" AS component, count(*) AS imports, count(DISTINCT file) AS files FROM component_connections_direct WHERE "to" = ${lit(c)} AND "from" <> ${lit(c)} GROUP BY 1 ORDER BY imports DESC`,
    dependenciesOf: (c: string) => `SELECT "to" AS component, count(*) AS imports FROM component_connections_direct WHERE "from" = ${lit(c)} AND "to" <> ${lit(c)} GROUP BY 1 ORDER BY imports DESC`,
    modulesOf: (kind: string) => `SELECT name, directory, files, internal_dependencies AS "depends on (internal)", depends_on AS "internal dependencies" FROM modules WHERE kind = ${lit(kind)} AND ${realModule()} ORDER BY files DESC`,
    largest: (f: SnapshotFacts) => `SELECT name, complexity__files AS files, complexity__lines AS lines, modularity__coupling__dependents AS dependents FROM components WHERE ${prod(f, "name")} ORDER BY lines DESC`,
}

// ── Explanations ──────────────────────────────────────────────────────────
// What a section's terms mean, for a reader who has not met them. They
// define and describe; the reading, and any verdict, stays the writer's.

export const ABOUT = {
    size: t("reports.templateKit.productionCodeCodeShips"),
    history: t("reports.templateKit.gitHistoryShowsHow"),
    structure: t("reports.templateKit.componentsDependEachOther"),
    coupling: t("reports.templateKit.couplingHowMuchComponents"),
    couplingTable: t("reports.templateKit.tableInstabilityRuns0"),
    rules: t("reports.templateKit.dependencyRulesWriteIntended"),
    hotspots: t("reports.templateKit.hotspotCodeBothComplicated"),
    health: t("reports.templateKit.codeHealthRatesEach"),
    churn: t("reports.templateKit.churnNumberLinesAdded"),
    knowledge: t("reports.templateKit.knowledgeCodeOftenSpread"),
    age: t("reports.templateKit.codeAgeHowLong"),
    tests: t("reports.templateKit.filesSortedProductionCode"),
    libraries: t("reports.templateKit.librariesCodeProjectUses"),
    modules: t("reports.templateKit.buildModulesPartsBuild"),
    trends: t("reports.templateKit.snapshotKeptEachTime"),
}

// ── How to read the figures several templates share ───────────────────────

export const SHOWS = {
    layers: t("reports.templateKit.drawingStacksCodeS"),
    lanes: t("reports.templateKit.mapShowsEveryProduction"),
    reach: t("reports.templateKit.mapShowsEveryProduction2"),
    knowledgeMap: t("reports.templateKit.mapShowsEveryComponent"),
    breadth: t("reports.templateKit.eachColumnYearCommits"),
    workNow: t("reports.templateKit.tableListsComponentsChanged"),
    stack: t("reports.templateKit.drawingStacksCodeFloors"),
    graphFolders: t("reports.templateKit.graphRollsComponentsUp"),
    chord: t("reports.templateKit.eachArcAroundCircle"),
    workMoved: t("reports.templateKit.eachRowComponentS"),
    modulesDeps: t("reports.templateKit.eachBarBuildModule"),
}

// ── Topics several templates share ────────────────────────────────────────
// Each writes its explanation, then its evidence.

export function glance(w: Writer) {
    w.explain(ABOUT.size).reading("size")
    if (w.facts.commits) w.explain(ABOUT.history).reading("history")
}
/** Library names as each ecosystem writes them, for the libraries explanation. */
const LIBRARY_EXAMPLES: Partial<Record<EcosystemId, { from: string; two: string; platform: string }>> = {
    spring: { from: "Maven or Gradle", two: t("reports.templateKit.orgSpringframeworkWebOrg"), platform: "`java.util`" },
    jvm: { from: "Maven or Gradle", two: t("reports.templateKit.orgApacheCommonsLang3"), platform: "`java.util`" },
    django: { from: "PyPI", two: t("reports.templateKit.djangoDbDjangoContrib"), platform: t("reports.templateKit.osJson") },
    python: { from: "PyPI", two: t("reports.templateKit.requestsAdaptersBelongsRequests"), platform: t("reports.templateKit.osJson") },
    node: { from: "npm", two: t("reports.templateKit.muiMaterialButtonMui"), platform: t("reports.templateKit.fsNodePath") },
    react: { from: "npm", two: t("reports.templateKit.tanstackReactQueryCounts"), platform: t("reports.templateKit.fsNodePath") },
    vue: { from: "npm", two: t("reports.templateKit.vueuseCoreCountsOne"), platform: t("reports.templateKit.fsNodePath") },
    go: { from: "Go modules", two: t("reports.templateKit.githubComStretchrTestify"), platform: t("reports.templateKit.netHttpFmt") },
    dotnet: { from: "NuGet", two: t("reports.templateKit.microsoftEntityframeworkcoreDesignMicrosoft"), platform: "" },
    php: { from: "Composer", two: t("reports.templateKit.symfonyComponentFormSymfony"), platform: "" },
}
/** The libraries explanation, with examples from the report's own ecosystem. */
export function librariesAbout(eco: EcosystemId | ""): string {
    const e = eco ? LIBRARY_EXAMPLES[eco] : undefined
    if (!e) return ABOUT.libraries
    return t("reports.templateKit.librariesCodeProjectUses2", { from: e.from, two: e.two, value: e.platform ? t("reports.templateKit.modulesLanguageSOwn", { platform: e.platform }) : "" })
}

/** The scan recorded classes and functions, so the Units view can draw the roles. */
export const hasUnits = (f: SnapshotFacts) => f.tables.has("units")
/**
 * The structure, and a drawing of it: the roles as floors when the scan has
 * classes (legible at any size), else the graph, rolled up by folder past a
 * few dozen components.
 */
export function structure(w: Writer, withFigure: boolean | "stack" | "graph" | "chord" = true) {
    w.explain(ABOUT.structure).reading("structure")
    if (!withFigure) return
    if (withFigure === "stack") { w.explainSlot(SHOWS.stack); w.exhibit("stack", {}, t("reports.templateKit.codebaseFloors")); return }
    if (withFigure === "graph" || withFigure === "chord") { folderPicture(w, withFigure, withFigure === "chord" ? t("reports.templateKit.howFoldersLeanEach") : t("reports.templateKit.foldersTheirImports")); return }
    if (hasUnits(w.facts)) layers(w, t("reports.templateKit.dependencyStructure"))
    else slotOf(w, "figure", t("reports.templateKit.dependencyStructure"), VIEWS.structure(w.facts))
}
/** The folders as a graph or a chord: legible at any size, needing no lens. */
export function folderPicture(w: Writer, how: "graph" | "chord", title: string) {
    if (how === "chord") { w.explainSlot(SHOWS.chord); slotOf(w, "figure", title, VIEWS.chord) }
    else { w.explainSlot(SHOWS.graphFolders); slotOf(w, "figure", title, VIEWS.graph) }
}
/** The roles as floors, with how to read them; nothing without classes in the scan. */
export function layers(w: Writer, title = t("reports.templateKit.howLayersLean")) {
    if (!hasUnits(w.facts)) return false
    w.explainSlot(SHOWS.layers)
    slotOf(w, "figure", title, VIEWS.layers)
    return true
}
/** The codebase as a map of its roles; nothing without classes in the scan. */
export function lanes(w: Writer, title = t("reports.templateKit.whereEachRoleLives")) {
    if (!hasUnits(w.facts)) return
    w.explainSlot(SHOWS.lanes)
    slotOf(w, "figure", title, VIEWS.lanes)
}
export function coupling(w: Writer, rows = 0, ext?: string) {
    w.explain(rows ? `${ABOUT.coupling} ${ABOUT.couplingTable}` : ABOUT.coupling).reading("coupling", ext ? { ext } : undefined)
    if (rows) w.table("c-coupling", rows)
}
export function hotspots(w: Writer, grain: "components" | "files" = "components", rows = 10) {
    w.explain(ABOUT.hotspots).reading("hotspots", grain === "files" ? { grain } : undefined)
    w.table(grain === "files" ? "f-hotspots" : "c-hotspots", rows)
}
export function health(w: Writer, grain: "components" | "files" | null = "files", rows = 10) {
    w.explain(ABOUT.health).reading("health")
    if (grain) w.table(grain === "files" ? "f-health" : "c-health", rows)
}
export function churn(w: Writer, days: "30" | "90" | "180") { w.explain(ABOUT.churn).reading("churn", { days }) }
/** The knowledge paragraph, then the map of who still knows the code, the table of it, both or neither. */
export function knowledge(w: Writer, show: { map?: boolean; table?: boolean } = { table: true }) {
    w.explain(ABOUT.knowledge).reading("knowledge")
    if (show.map) { w.explainSlot(SHOWS.knowledgeMap); slotOf(w, "figure", t("reports.templateKit.whoStillKnowsCode"), VIEWS.knowledgeMap) }
    if (show.table) slotOf(w, "table", t("reports.templateKit.knowledgeComponent"), VIEWS.knowledge)
}
export function age(w: Writer) { if (w.facts.fileColumns.has("git__last_change_age_in_days")) w.explain(ABOUT.age).reading("age") }
export function tests(w: Writer) { w.explain(ABOUT.tests).reading("tests") }
/** With a language (libraries.ts languageOf: "go", "javascript"…), only imports written in it. */
export function libraries(w: Writer, withTable = true, language?: string) {
    w.explain(librariesAbout(w.eco)).reading("libraries", language ? { language } : undefined)
    if (withTable) slotOf(w, "table", "Libraries", VIEWS.libraries)
}
export function modules(w: Writer, sql?: string) {
    w.explain(ABOUT.modules).reading("modules")
    if (sql) w.sql(t("reports.templateKit.buildModules"), sql, 40)
}
export function rules(w: Writer) {
    w.explain(ABOUT.rules).reading("rules")
    if (w.facts.rules.violations) w.sql(t("reports.templateKit.importsBreakRule"), SQL.violations, 20)
}
export const hasModules = (f: SnapshotFacts) => Object.keys(f.moduleKinds).length > 0
