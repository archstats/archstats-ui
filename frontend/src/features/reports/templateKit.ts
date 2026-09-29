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
    slot(kind: "figure" | "table", title: string, view: string, route: string, hint: string, take?: string) {
        this.blocks.push(cellBlock({ type: "slot", kind, view, route, hint, ...(take ? { take } : {}) }, title))
        return this
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
    git: (f: SnapshotFacts): true | string => (f.commits ? true : "the scan has no git history"),
    rules: (f: SnapshotFacts): true | string => (f.rules.applicable ? true : "no dependency rules are set up for this codebase"),
    modules: (f: SnapshotFacts): true | string => (Object.keys(f.moduleKinds).length ? true : "the build defines no modules"),
    health: (f: SnapshotFacts): true | string => (f.fileColumns.has("codesmells__code_health") ? true : "the scan has no code health ratings"),
    tests: (f: SnapshotFacts): true | string => (f.fileColumns.has("role") ? true : "this scan did not sort files into production and test code; scan again to include it"),
    testFiles: (f: SnapshotFacts): true | string => {
        const tests = f.roles.test?.files ?? 0
        if (!tests) return "the code has no test files"
        // Few tests beside test folders the scan ignored: what is left says little about reach.
        return ignoredTestDirs(f) && tests * 20 < f.production.files ? "the scan left out most of the test folders" : true
    },
    snippets: (f: SnapshotFacts): true | string => (f.tables.has("snippets") ? true : "the scan did not keep the import lines"),
    tangles: (f: SnapshotFacts): true | string => (f.tangles ? true : "no components depend on each other in a circle"),
    coChange: (f: SnapshotFacts): true | string => (f.commits && f.tables.has("git_component_shared_commits") ? true : "the scan has no record of which components change together"),
    reach: (f: SnapshotFacts): true | string => (f.tables.has("component_connections_indirect") ? true : "the scan did not follow imports through other components"),
    recent: (f: SnapshotFacts): true | string => (!f.commits ? "the scan has no git history" : (f.summary.git__commits__last_30_days ?? 0) > 0 ? true : "no commit landed in the 30 days before the newest one"),
    age: (f: SnapshotFacts): true | string => (f.fileColumns.has("git__last_change_age_in_days") ? true : "this scan is older than the code-age measure; scan again to include it"),
    component: (c: string | undefined): true | string => (c ? true : "no component is chosen"),
    column: (f: SnapshotFacts, c: string, why: string): true | string => (f.componentColumns.has(c) ? true : why),
    all: (...xs: Array<true | string>): true | string => xs.find(x => x !== true) ?? true,
}

// Views a slot opens, set the way the figure needs them. Every one of them
// offers its figure or table to Add to report.
export const VIEWS: Record<string, ViewAsk | ((...a: any[]) => ViewAsk)> & Record<string, any> = {
    // The dependency graph: components while they stay legible, the lens's groups beyond that.
    structure: (f: SnapshotFacts) => (f.components <= 60
        ? { view: "Connections", route: "/views/connections?level=components", hint: "Graph, components" }
        : { view: "Connections", route: "/views/connections?level=groups", hint: "Graph, by group" }),
    // Without a lens its groups are the components, which past a few dozen print as a cloud.
    graph: { view: "Connections", route: "/views/connections?level=groups", hint: "Graph, by group; set a lens first" },
    focus: (c: string) => ({ view: "Connections", route: `/views/connections?level=components&sel=${encodeURIComponent(c)}`, hint: `Graph, components, ${c} selected` }),
    // facet=production: the same production pairs as the template's own table beside it.
    hidden: { view: "Connections", route: "/views/connections?source=git&rep=list&relation=no-import&facet=production", hint: "Co-change without an import, as a list, production code", take: "Connections list" },
    // A table: the matrix exports as rows and numbered columns, in dependency levels, up to 40 of them.
    // Components while they fit; beyond that it needs a lens whose groups do.
    matrix: (f: SnapshotFacts) => (f.components <= 40
        ? { view: "Connections", route: "/views/connections?rep=matrix&level=components&order=levels", hint: "Matrix, components, in levels", take: "Dependency matrix" }
        : { view: "Connections", route: "/views/connections?rep=matrix&level=groups&order=levels", hint: "Matrix, by group, in levels; needs a lens of 40 groups or fewer", take: "Dependency matrix" }),
    // Arcs by group: legible with a lens of a few dozen groups (for Django, its apps), a ring of clipped names without one.
    chord: { view: "Connections", route: "/views/connections?rep=chord&level=groups", hint: "Chord, by group; set a lens first" },
    combined: (c: string) => ({ view: "Connections", route: `/views/connections?source=combined&level=components&sel=${encodeURIComponent(c)}`, hint: `Imports and co-change, ${c} selected` }),
    plot: (preset: string, hint: string) => ({ view: "Metrics", route: `/views/metrics?view=plot&preset=${preset}`, hint }),
    // Files: production only, or licences, Markdown and lock files lead every ranking.
    treemap: (preset: string, grain: "components" | "files" | "directories", hint: string) => ({ view: "Hotspots", route: `/views/components/hotspots?preset=${preset}&grain=${grain}${grain === "files" ? "&facet=production" : ""}`, hint }),
    cyclesAround: (c: string) => ({ view: "Cycles", route: `/views/components/cycles?component=${encodeURIComponent(c)}`, hint: `The tangle ${c} sits in` }),
    activity: { view: "Activity", route: "/views/git/activity?tab=commits", hint: "Lines added and removed by month", take: "Lines added and removed by month" },
    // The Overview's year of commits by day: the grain a month's review reads at.
    calendar: { view: "Overview", route: "/", hint: "A year of commits, one square a day", take: "Commit calendar" },
    breadth: { view: "Activity", route: "/views/git/activity?tab=breadth", hint: "The share of commits by how many components they touched", take: "Components touched per commit" },
    workNow: { view: "Activity", route: "/views/git/activity?tab=now", hint: "Changed lines by component, against the two years before", take: "Where the changed lines went" },
    changes: { view: "Changes", route: "/views/changes", hint: "This snapshot against the one before", take: "Changes summary" },
    outline: { view: "Metrics", route: "/views/metrics?grain=directories", hint: "Directories, every number rolled up", take: "Metrics: directories" },
    // The Units view's boundary between two of the framework's roles; its lane overview when no reference crosses it.
    flow: (a: string, b: string, hint: string) => ({ view: "Units", route: `/views/units?flow=${a},${b}`, hint, take: "Boundary flow|How the layers lean" }),
    hotspots: { view: "Hotspots", route: "/views/components/hotspots", hint: "Components, packed" },
    cycles: { view: "Cycles", route: "/views/components/cycles", hint: "The largest tangle, in levels, with its cut plan" },
    knowledge: { view: "Authors", route: "/views/git/authors?grain=components", hint: "Knowledge: how much of each component was written by people still here", take: "Knowledge by component" },
    knowledgeMap: { view: "Authors", route: "/views/git/authors?grain=components", hint: "Knowledge: the code as tiles, coloured by how well someone still here knows it", take: "Code by active contributors" },
    // The Units view's pictures of the framework's roles; they need the classes the scan records (has units).
    layers: { view: "Units", route: "/views/units", hint: "The roles as floors, with the imports between them", take: "How the layers lean" },
    lanes: { view: "Units", route: "/views/units", hint: "Every folder, its files in their role's colour", take: "Where each lane lives" },
    reach: { view: "Units", route: "/views/units?colour=reach", hint: "Every file, coloured by whether an entry point reaches it", take: "What the entry points reach" },
    libraries: { view: "Libraries", route: "/views/libraries", hint: "Rolled up to two segments", take: "Libraries" },
    rules: { view: "Rules", route: "/views/rules", hint: "Findings by rule" },
    trends: { view: "Trends", route: "/views/trends", hint: "System shape across snapshots", take: "Over time" },
    dirs: { view: "Metrics", route: "/views/metrics?grain=directories", hint: "Directories grain", take: "Metrics: directories" },
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
    size: "*Production code* is the code that ships to users. Tests, generated files, third-party code copied into the repository, and files that are not code are counted separately.\n\nA *component* is a package, namespace or folder, depending on the language. Line counts include comments and blank lines.",
    history: "The git history shows how long people have worked on the code, how many changes (*commits*) they made, and how many people (*authors*) made them. It gives a sense of scale for the rest of the report.",
    structure: "Components depend on each other when code in one imports code in another. A *tangle* is a group of components that depend on each other in a circle: A uses B, B uses C, and C uses A again. None of them can be understood, tested or released without the others.\n\n*Propagation cost* says how far a change can spread: on average, how much of the codebase a change to one component can reach through imports. *Dependency levels* is the length of the longest chain of imports, with each tangle counted as one step.",
    coupling: "*Coupling* is how much components rely on each other. A component's *dependents* are the components that import it; its *dependencies* are the ones it imports.\n\nA component with many dependents is load-bearing. A change to it can affect every one of them, so it needs to be stable and well tested.",
    couplingTable: "In the table, *instability* runs from 0 to 1. At 0, others depend on the component and it depends on nothing; at 1, it depends on others and nothing depends on it. It is the dependencies divided by the dependents plus the dependencies.\n\n*Distance from the main sequence* is near 0 when a component is abstract and widely used, or concrete and little used. It is near 1 when a component is concrete but many others depend on it, which makes it hard to change, or abstract but unused.",
    rules: "*Dependency rules* write the intended architecture down as rules about which code may import which, for example “the domain may not import the web layer”. Every import that breaks one is counted below. A broken rule marks a place where the code has drifted from the design.",
    hotspots: "A *hotspot* is code that is both complicated and changed often. Complicated code that nobody touches costs little, and simple code is cheap to change. Code that is both is where most of the effort, and most of the bugs, tend to go.\n\nThe *hotspot score*, from 0 to 100, combines how complex the code is with how often it changed.",
    health: "*Code health* rates each file from 1 to 10 on how easy it is to read and change: 10 is simple, and below 4 is hard going. Very large files and deeply nested logic (conditions inside loops inside conditions) lower it.\n\nThe average is weighted by size, so a large file counts for more than a small one.",
    churn: "*Churn* is the number of lines added and deleted in a period, counted back from the newest commit in the scan. It shows where the team's effort actually went.\n\nEffort is usually concentrated. When half of all changed lines land in a few components, that is where the work is, and where people most often get in each other's way.",
    knowledge: "Knowledge of the code is often spread unevenly: some parts were written mostly by one person. The team then depends on that person to change those parts safely, and work slows down when they leave or are busy. This is often called the *bus factor*.\n\nThe paragraph names nobody. The figures and tables from the Authors view name people as that view shows them; switch it to *Author 1…N* before taking them when the report should not.",
    age: "*Code age* is how long ago each file last changed, counted back from the newest commit in the scan. Old code that works is not a problem in itself. It is often code nobody on the current team has worked in, though, which makes the first change to it slow.",
    tests: "Files are sorted into production code and test code by their folder and name. Below are the test code and the components no test reaches: no test file imports them, and none sits inside them.\n\nThis measures reach, not coverage. A component that a test reaches can still have paths that no test runs.",
    libraries: "*Libraries* are code the project uses but did not write: frameworks and packages from npm, Maven, PyPI, NuGet and the like. Each one needs keeping up to date, and each can bring security issues.\n\nNames are shortened to their first two parts, so `org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`. Modules of the language's own platform, such as `java.util`, are counted separately.",
    modules: "*Build modules* are the parts the build tool knows about: Maven modules, Gradle projects, npm packages, Go modules, .NET projects and the like. Each one declares which other modules it needs.\n\nThat is the structure the build enforces. How the code actually imports itself can differ from it.",
    trends: "A snapshot is kept each time the code is scanned. The Trends view lines the snapshots up, so you can see whether numbers such as tangles, hotspots and health move the way you want.\n\nEvery computed paragraph in this report also says what moved when you run it again on a newer snapshot.",
}

// ── How to read the figures several templates share ───────────────────────

export const SHOWS = {
    layers: "The drawing stacks the code's roles as floors, with the roles that others use lower down. Lines on the left are imports running down the stack, the usual direction. Dotted lines on the right are imports running back up, and a red one breaks the order: a lower floor using a higher one, a pair using each other, or a cycle.\n\nThe wider a line, the more imports it carries. The bar under each floor is its share of the code.",
    lanes: "The map shows every production file, sized by its lines and nested in the folders that hold it. Each file has the colour of its role, so the map shows where the controllers, the services or the data access actually live, and which folders mix them.",
    reach: "The map shows every production file, sized by its lines and nested in its folders. The colour says how the running program gets to it:\n\n- *Entry points* are called by the framework or a program's main.\n- *Reached* files are imported, directly or not, from an entry point.\n- *Only tests* reach some files.\n- *Reached by nothing* is the rest.\n\nThe red files are where unused code is most likely. Code a framework loads by name, such as templates or plugins, can show red and still be used.",
    knowledgeMap: "The map shows every component as a tile, sized by its lines and grouped by folder. The colour says how well people who still commit here know it: dark where they wrote most of it, light where they have only changed it since. Hatched tiles are code nobody active has worked on.",
    breadth: "Each column is a year of commits, split by how many components a commit touched: one, two or three, four to ten, or more. The line follows the share that touched four or more.\n\nWhen that line climbs, a typical change reaches further across the code each year. That is what coupling feels like in day-to-day work.",
    workNow: "The table lists the components the changed lines went into, most first, with each one's share of them now and in the two years before. A share that grew a lot marks where the work moved.",
}

// ── Topics several templates share ────────────────────────────────────────
// Each writes its explanation, then its evidence.

export function glance(w: Writer) {
    w.explain(ABOUT.size).reading("size")
    if (w.facts.commits) w.explain(ABOUT.history).reading("history")
}
/** Library names as each ecosystem writes them, for the libraries explanation. */
const LIBRARY_EXAMPLES: Partial<Record<EcosystemId, { from: string; two: string; platform: string }>> = {
    spring: { from: "Maven or Gradle", two: "`org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`", platform: "`java.util`" },
    jvm: { from: "Maven or Gradle", two: "`org.apache.commons.lang3` and `org.apache.commons.io` count as one library, `org.apache.commons`", platform: "`java.util`" },
    django: { from: "PyPI", two: "`django.db` and `django.contrib` count as one library, `django`, and `rest_framework.views` belongs to `rest_framework`", platform: "`os` or `json`" },
    python: { from: "PyPI", two: "`requests.adapters` belongs to `requests`, and `pydantic.fields` to `pydantic`", platform: "`os` or `json`" },
    node: { from: "npm", two: "`@mui/material/Button` and `@mui/material/styles` count as one library, `@mui/material`", platform: "`fs` or `node:path`" },
    react: { from: "npm", two: "`@tanstack/react-query` counts as one library however deep it is imported, and so does `react-router-dom`", platform: "`fs` or `node:path`" },
    go: { from: "Go modules", two: "`github.com/stretchr/testify/assert` and `github.com/stretchr/testify/require` count as one library, `github.com/stretchr/testify`", platform: "`net/http` or `fmt`" },
    dotnet: { from: "NuGet", two: "`Microsoft.EntityFrameworkCore.Design` and `Microsoft.EntityFrameworkCore.SqlServer` count as one library, `Microsoft.EntityFrameworkCore`", platform: "" },
    php: { from: "Composer", two: "`Symfony\\Component\\Form` and `Symfony\\Component\\Validator` count as one library, `Symfony\\Component`", platform: "" },
}
/** The libraries explanation, with examples from the report's own ecosystem. */
export function librariesAbout(eco: EcosystemId | ""): string {
    const e = eco ? LIBRARY_EXAMPLES[eco] : undefined
    if (!e) return ABOUT.libraries
    return `*Libraries* are code the project uses but did not write, here mostly packages from ${e.from}. Each one needs keeping up to date, and each can bring security issues.\n\nNames are shortened to their first two parts: ${e.two}.${e.platform ? ` Modules of the language's own platform, such as ${e.platform}, are counted separately.` : ""}`
}

/** Past this many components a drawing of the whole graph is a cloud of dots, whatever the grouping. */
export const GRAPH_LIMIT = 300
/** The scan recorded classes and functions, so the Units view can draw the roles. */
export const hasUnits = (f: SnapshotFacts) => f.tables.has("units")
/**
 * The structure, and a drawing of it: the roles as floors when the scan has
 * classes (legible at any size), else the graph while it stays legible.
 */
export function structure(w: Writer, withFigure = true) {
    w.explain(ABOUT.structure).reading("structure")
    if (!withFigure) return
    if (hasUnits(w.facts)) layers(w, "Dependency structure")
    else if (w.facts.components > GRAPH_LIMIT) w.p(`A drawing of the whole graph is left out: with ${w.facts.components.toLocaleString("en-US")} components it prints as a cloud of dots. The tangles above say more; in the app, Connections with a lens shows the graph by group.`)
    else slotOf(w, "figure", "Dependency structure", VIEWS.structure(w.facts))
}
/** The roles as floors, with how to read them; nothing without classes in the scan. */
export function layers(w: Writer, title = "How the layers lean") {
    if (!hasUnits(w.facts)) return false
    w.explainSlot(SHOWS.layers)
    slotOf(w, "figure", title, VIEWS.layers)
    return true
}
/** The codebase as a map of its roles; nothing without classes in the scan. */
export function lanes(w: Writer, title = "Where each role lives") {
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
    if (show.map) { w.explainSlot(SHOWS.knowledgeMap); slotOf(w, "figure", "Who still knows the code", VIEWS.knowledgeMap) }
    if (show.table) slotOf(w, "table", "Knowledge by component", VIEWS.knowledge)
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
    if (sql) w.sql("Build modules", sql, 40)
}
export function rules(w: Writer) {
    w.explain(ABOUT.rules).reading("rules")
    if (w.facts.rules.violations) w.sql("Imports that break a rule", SQL.violations, 20)
}
export const hasModules = (f: SnapshotFacts) => Object.keys(f.moduleKinds).length > 0
