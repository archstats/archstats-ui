// Report templates: the outline of a kind of report, written for one
// codebase. A template is built against what the snapshot holds: a section
// whose evidence the snapshot lacks is left out and named, never shown
// empty. Facts come in as readings (computed paragraphs), evidence as table
// and query cells, figures as slots the writer fills from a view, and the
// interpretation as prompts. Nothing in a template is a verdict.

import { TABLE_PRESETS } from "~/utils/reportCells"
import { isCell, newId, plainText, type Block, type Cell, type CellSpec, type TextBlock, type TextKind } from "~/utils/reportDoc"
import type { Ecosystem, EcosystemId, SnapshotFacts } from "~/utils/readings"

export interface TemplateParam { id: string; label: string; kind: "component" }

export interface TemplateContext {
    facts: SnapshotFacts
    ecosystems: Ecosystem[]
    params: Record<string, string>
}

export interface ReportTemplate {
    id: string
    name: string
    /** Who reads it, in a few words. */
    audience: string
    summary: string
    ecosystem?: EcosystemId
    params?: TemplateParam[]
    /** The report's name for a workspace. */
    title: (workspace: string, params: Record<string, string>) => string
    build: (w: Writer, ctx: TemplateContext) => void
}

// ── Writing a template ────────────────────────────────────────────────────

const cellBlock = (spec: CellSpec, title = ""): Block => ({ id: newId(), kind: "cell", cell: { spec, title, caption: "", output: null, ranOn: null } })

/** The builder a template writes with; sections the snapshot cannot fill are skipped and named. */
export class Writer {
    blocks: Block[] = []
    skipped: Array<{ section: string; why: string }> = []
    constructor(readonly facts: SnapshotFacts) {}

    text(kind: TextKind, text: string) { this.blocks.push({ id: newId(), kind, text }); return this }
    h2(t: string) { return this.text("h2", t) }
    h3(t: string) { return this.text("h3", t) }
    p(t: string) { return this.text("p", t) }
    /** A paragraph for the writer: the prompt shows where the text goes, and never prints. */
    prompt(t: string) { this.blocks.push({ id: newId(), kind: "p", text: "", prompt: t }); return this }
    reading(id: string, params?: Record<string, string>) { this.blocks.push(cellBlock({ type: "reading", reading: id, ...(params ? { params } : {}) })); return this }
    table(preset: string, limit = 10, title?: string) {
        const p = TABLE_PRESETS.find(x => x.id === preset)
        if (p) this.blocks.push(cellBlock({ type: "table", source: p.source, columns: p.columns, sort: p.sort, desc: p.desc, limit }, title ?? p.label))
        return this
    }
    sql(title: string, sql: string, limit = 20) { this.blocks.push(cellBlock({ type: "sql", sql: sql.replace(/\s+/g, " ").trim(), limit }, title)); return this }
    slot(kind: "figure" | "table", title: string, view: string, route: string, hint: string) {
        this.blocks.push(cellBlock({ type: "slot", kind, view, route, hint }, title))
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

// What a section needs, as true or the reason the snapshot falls short.
const needs = {
    git: (f: SnapshotFacts): true | string => (f.commits ? true : "no git history"),
    rules: (f: SnapshotFacts): true | string => (f.rules.applicable ? true : "no rule applies"),
    modules: (f: SnapshotFacts): true | string => (Object.keys(f.moduleKinds).length ? true : "no build modules"),
    health: (f: SnapshotFacts): true | string => (f.fileColumns.has("codesmells__code_health") ? true : "no code health ratings"),
    tests: (f: SnapshotFacts): true | string => (f.fileColumns.has("role") ? true : "files have no roles"),
    snippets: (f: SnapshotFacts): true | string => (f.tables.has("snippets") ? true : "no import snippets"),
    column: (f: SnapshotFacts, c: string, why: string): true | string => (f.componentColumns.has(c) ? true : why),
    all: (...xs: Array<true | string>): true | string => xs.find(x => x !== true) ?? true,
}

// Views a slot opens, set the way the figure needs them. Every one of them
// offers its figure or table to Add to report.
const VIEWS = {
    // The dependency graph: components while they stay legible, the lens's groups beyond that.
    structure: (f: SnapshotFacts) => (f.components <= 60
        ? { view: "Connections", route: "/views/connections?level=components", hint: "Graph, components" }
        : { view: "Connections", route: "/views/connections?level=groups", hint: "Graph, by group" }),
    graph: { view: "Connections", route: "/views/connections?level=groups", hint: "Graph, groups" },
    focus: (c: string) => ({ view: "Connections", route: `/views/connections?level=components&sel=${encodeURIComponent(c)}`, hint: `Graph, components, ${c} selected` }),
    hotspots: { view: "Hotspots", route: "/views/components/hotspots", hint: "Components, packed" },
    cycles: { view: "Cycles", route: "/views/components/cycles", hint: "The tangles and their shortest cycles" },
    knowledge: { view: "Authors", route: "/views/git/authors?grain=components", hint: "Components grain: fewest authors covering half" },
    effort: { view: "Activity", route: "/views/git/activity?tab=effort", hint: "Effort: where changed lines went" },
    libraries: { view: "Libraries", route: "/views/libraries", hint: "Rolled up to two segments" },
    rules: { view: "Rules", route: "/views/rules", hint: "Findings by rule" },
    trends: { view: "Trends", route: "/views/trends", hint: "System shape across snapshots" },
    dirs: { view: "Metrics", route: "/views/metrics?grain=directories", hint: "Directories grain" },
}
const slotOf = (w: Writer, kind: "figure" | "table", title: string, v: { view: string; route: string; hint: string }) => w.slot(kind, title, v.view, v.route, v.hint)

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const SQL = {
    violations: `SELECT rule, "from", "to", count(*) AS imports FROM rules WHERE status = 'violation' GROUP BY 1, 2, 3 ORDER BY imports DESC`,
    tangles: `SELECT min(component) AS tangle, count(*) AS components FROM component_strongly_connected_groups WHERE component <> '.' GROUP BY "group" HAVING count(*) > 1 ORDER BY components DESC`,
    modules: `SELECT name, kind, files, internal_dependencies AS "depends on (internal)", declared_dependencies AS "declared dependencies" FROM modules ORDER BY files DESC`,
    churn: (d: string) => `SELECT name, coalesce(git__additions__last_${d}_days, 0) + coalesce(git__deletions__last_${d}_days, 0) AS "changed lines", git__commits__last_${d}_days AS commits, git__authors__last_${d}_days AS authors FROM components WHERE name <> '.' ORDER BY 2 DESC, name`,
    filesOf: (c: string) => `SELECT name, complexity__lines AS lines, codesmells__code_health AS health, codesmells__hotspot_score AS hotspot, git__commits__last_180_days AS "commits, 180 days" FROM files WHERE component = ${lit(c)} ORDER BY hotspot DESC NULLS LAST, name`,
    dependentsOf: (c: string) => `SELECT "from" AS component, count(*) AS imports, count(DISTINCT file) AS files FROM component_connections_direct WHERE "to" = ${lit(c)} AND "from" <> ${lit(c)} AND "from" <> '.' GROUP BY 1 ORDER BY imports DESC`,
    dependenciesOf: (c: string) => `SELECT "to" AS component, count(*) AS imports FROM component_connections_direct WHERE "from" = ${lit(c)} AND "to" <> ${lit(c)} AND "to" <> '.' GROUP BY 1 ORDER BY imports DESC`,
    spring: `SELECT name, java__spring__beans AS beans, java__spring__controllers AS controllers, java__spring__services AS services, java__spring__repositories AS repositories, java__jpa__entities AS "JPA entities", java__spring__request_mappings__total AS "request mappings" FROM components WHERE coalesce(java__spring__beans, 0) + coalesce(java__jpa__entities, 0) > 0 ORDER BY coalesce(java__spring__beans, 0) DESC, name`,
    react: (columns: string[]) => {
        const sum = columns.map(c => `coalesce(${c}, 0)`).join(" + ")
        return `SELECT name, ${sum} AS "React components", complexity__lines AS lines, codesmells__hotspot_score AS hotspot FROM components WHERE ${sum} > 0 ORDER BY 2 DESC, name`
    },
    modulesOf: (kind: string) => `SELECT name, directory, files, internal_dependencies AS "depends on (internal)", depends_on AS "internal dependencies" FROM modules WHERE kind = ${lit(kind)} ORDER BY files DESC`,
    largest: `SELECT name, complexity__files AS files, complexity__lines AS lines, modularity__coupling__dependents AS dependents FROM components WHERE name <> '.' ORDER BY lines DESC`,
}

// Parts several templates share.
function glance(w: Writer) { w.reading("size"); if (w.facts.commits) w.reading("history") }
function structure(w: Writer, withFigure = true) {
    w.reading("structure")
    if (withFigure) slotOf(w, "figure", "Dependency structure", VIEWS.structure(w.facts))
}
function hotspots(w: Writer, grain: "components" | "files" = "components", rows = 10) {
    w.reading("hotspots", grain === "files" ? { grain } : undefined)
    w.table(grain === "files" ? "f-hotspots" : "c-hotspots", rows)
}
function rules(w: Writer) { w.reading("rules").sql("Imports that break a rule", SQL.violations, 20) }

// ── General ───────────────────────────────────────────────────────────────

const GENERAL: ReportTemplate[] = [
    {
        id: "architecture-review",
        name: "Architecture review",
        audience: "An architecture board",
        summary: "Structure, coupling, rules, hotspots and health, with room for your findings and recommendations.",
        title: ws => `Architecture review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What this review is for, who asked for it, and which decision it informs.")
            w.section("The system at a glance", true, () => glance(w))
            w.section("Structure", true, () => { structure(w); w.prompt("What the structure says about the layering you intended.") })
            w.section("Coupling", true, () => { w.reading("coupling"); w.table("c-coupling", 8) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Hotspots", needs.git(f), () => { hotspots(w); slotOf(w, "figure", "Hotspots", VIEWS.hotspots) })
            w.section("Code health", needs.health(f), () => { w.reading("health"); w.table("c-health", 8) })
            w.section("Findings", true, () => w.prompt("The two or three things the reader should leave with, each tied to a figure or table above."))
            w.section("Recommendations", true, () => w.prompt("What you propose, in order, and what each costs."))
        },
    },
    {
        id: "executive-summary",
        name: "Executive summary",
        audience: "Leadership, one page",
        summary: "The system in a few computed paragraphs, then what it means and what you ask for.",
        title: ws => `${ws}: summary`,
        build(w) {
            const f = w.facts
            w.prompt("The one sentence to read if nothing else is.")
            glance(w)
            w.reading("structure")
            if (f.commits) w.reading("churn", { days: "90" }).reading("knowledge")
            w.section("What it means", true, () => w.prompt("In business terms: where change is slow or risky, and why."))
            w.section("What we ask for", true, () => w.prompt("The decision or investment you are asking for, and by when."))
        },
    },
    {
        id: "due-diligence",
        name: "Technical due diligence",
        audience: "An acquisition or investment",
        summary: "Scope, team and history, structure, maintainability, dependencies and tests, then the risks.",
        title: ws => `Technical due diligence: ${ws}`,
        build(w) {
            const f = w.facts
            w.section("Scope", true, () => { w.prompt("What was scanned (repositories, branches, dates) and what was not."); w.reading("size") })
            w.section("History and team", needs.git(f), () => { w.reading("history").reading("knowledge"); slotOf(w, "table", "Knowledge by component", VIEWS.knowledge) })
            w.section("Structure", true, () => { structure(w, false); if (Object.keys(f.moduleKinds).length) w.reading("modules"); slotOf(w, "figure", "The system's parts", VIEWS.graph) })
            w.section("Maintainability", needs.health(f), () => { w.reading("health"); if (f.fileColumns.has("git__last_change_age_in_days")) w.reading("age"); w.table("f-health", 10) })
            w.section("Dependencies", needs.snippets(f), () => { w.reading("libraries"); slotOf(w, "table", "Libraries", VIEWS.libraries) })
            w.section("Tests", needs.tests(f), () => w.reading("tests"))
            w.section("Risks", true, () => w.prompt("Each risk with the evidence above that supports it, and how likely it is to matter after the deal."))
        },
    },
    {
        id: "onboarding",
        name: "Onboarding guide",
        audience: "New developers",
        summary: "What is here, how it hangs together, where the work is and who knows it.",
        title: ws => `Getting to know ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Who this is for and what they will work on first.")
            w.section("What is here", true, () => { w.reading("size"); if (Object.keys(f.moduleKinds).length) w.reading("modules"); w.sql("The largest components", SQL.largest, 10) })
            w.section("How it hangs together", true, () => { w.reading("coupling"); slotOf(w, "figure", "The system's parts", VIEWS.graph); w.prompt("The areas a newcomer should know by name, and what each is for.") })
            w.section("Where the work is", needs.git(f), () => { w.reading("churn", { days: "90" }); w.table("f-churn", 10) })
            w.section("Who knows what", needs.git(f), () => { w.reading("knowledge"); slotOf(w, "table", "Knowledge by component", VIEWS.knowledge); w.prompt("Who to ask about which area, if the team is fine with names in writing.") })
            w.section("Handle with care", needs.git(f), () => { w.reading("hotspots"); w.prompt("The parts that bite, and why.") })
        },
    },
    {
        id: "refactoring-case",
        name: "Refactoring case",
        audience: "The case for changing one component",
        summary: "One component: what it is today, why now, what depends on it, cost, and the plan.",
        params: [{ id: "component", label: "Component", kind: "component" }],
        title: (ws, p) => `Refactoring ${p.component || "a component"}`,
        build(w, { params }) {
            const f = w.facts
            const c = params.component
            w.prompt("The change you propose for this component, in one paragraph.")
            w.section("The component today", true, () => { w.reading("focus", { component: c }); if (c) slotOf(w, "figure", `${c} and its neighbours`, VIEWS.focus(c)) })
            w.section("Why now", needs.git(f), () => { if (c) w.sql(`Files of ${c}`, SQL.filesOf(c), 15); w.prompt("What its history and health say about the cost of leaving it as it is.") })
            w.section("What depends on it", true, () => { if (c) w.sql(`Components that import ${c}`, SQL.dependentsOf(c), 15).sql(`What ${c} imports`, SQL.dependenciesOf(c), 15) })
            w.section("Cost and risk", true, () => w.prompt("Effort, who needs to be involved, and what could break."))
            w.section("Plan", true, () => w.prompt("The steps, in order, and how you will know each one worked."))
        },
    },
    {
        id: "debt-register",
        name: "Technical debt register",
        audience: "The team's backlog",
        summary: "Hotspots, low health, tangles and rule breaks, as lists to turn into items.",
        title: ws => `Technical debt: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("How items were chosen, and how they will be tracked.")
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files", 15))
            w.section("Low code health", needs.health(f), () => { w.reading("health"); w.table("f-health", 15) })
            w.section("Tangles", f.tangles ? true : "no tangles", () => { w.reading("structure"); w.sql("Tangles", SQL.tangles, 20); slotOf(w, "figure", "Cycles in the largest tangle", VIEWS.cycles) })
            w.section("Rule breaks", needs.rules(f), () => rules(w))
            w.section("The register", true, () => w.prompt("Per item: an owner, the cost of leaving it, and the next step."))
        },
    },
    {
        id: "ownership",
        name: "Ownership and knowledge",
        audience: "Engineering management",
        summary: "How concentrated knowledge is, where change lands, and what to do about it.",
        title: ws => `Ownership: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why ownership is being looked at now.")
            w.section("History", needs.git(f), () => w.reading("history"))
            w.section("Concentration", needs.git(f), () => { w.reading("knowledge"); slotOf(w, "table", "Knowledge by component", VIEWS.knowledge) })
            w.section("Where change lands", needs.git(f), () => { w.reading("churn", { days: "180" }); w.sql("Change by component, last 180 days", SQL.churn("180"), 12); slotOf(w, "figure", "Where changed lines went", VIEWS.effort) })
            w.section("Risks and actions", true, () => w.prompt("Where one person leaving would stall work, and what you will do about each."))
        },
    },
    {
        id: "dependency-audit",
        name: "Dependency audit",
        audience: "Platform or security review",
        summary: "Libraries the code imports, build modules and how the components depend on each other.",
        title: ws => `Dependency audit: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What prompted the audit, and what is in scope.")
            w.section("Libraries", needs.snippets(f), () => { w.reading("libraries"); slotOf(w, "table", "Libraries", VIEWS.libraries) })
            w.section("Build modules", needs.modules(f), () => { w.reading("modules"); w.sql("Modules", SQL.modules, 40) })
            w.section("Between components", true, () => { w.reading("coupling"); w.reading("structure") })
            w.section("Rules", needs.rules(f), () => rules(w))
            w.section("Actions", true, () => w.prompt("Libraries to upgrade, replace or remove, and dependencies to cut, each with why."))
        },
    },
    {
        id: "modularization",
        name: "Modularization plan",
        audience: "Splitting a monolith",
        summary: "Tangles, levels and coupling, candidate modules drawn from a figure, and the order to cut them.",
        title: ws => `Modularizing ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The goal: what the parts should be able to do apart (deploy, test, own) that they cannot today.")
            w.section("Where it stands", true, () => { w.reading("size"); structure(w) })
            w.section("What holds it together", true, () => { w.reading("coupling"); w.table("c-coupling", 10); if (f.tangles) w.sql("Tangles", SQL.tangles, 10) })
            w.section("Candidate modules", true, () => { slotOf(w, "figure", "Candidate modules", VIEWS.graph); w.prompt("The modules you propose, and the imports that cross between them.") })
            w.section("Sequence", true, () => w.prompt("What to cut first and why, and what each step unblocks."))
        },
    },
    {
        id: "check-in",
        name: "Health check-in",
        audience: "A recurring review",
        summary: "The same readings every time; run it again on a newer snapshot and each cell says what moved.",
        title: ws => `Check-in: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The period this covers, and what changed in the team or the plans.")
            w.section("Shape", true, () => { w.reading("size"); w.reading("structure") })
            w.section("Change", needs.git(f), () => { w.reading("churn", { days: "90" }); hotspots(w, "components", 8) })
            w.section("Health", needs.health(f), () => { w.reading("health"); if (f.fileColumns.has("git__last_change_age_in_days")) w.reading("age") })
            w.section("Rules", needs.rules(f), () => w.reading("rules"))
            w.section("Tests", needs.tests(f), () => w.reading("tests"))
            w.section("Since last time", true, () => { slotOf(w, "figure", "Trends", VIEWS.trends); w.prompt("What moved, and whether it moved the way you meant it to.") })
        },
    },
]

// ── Ecosystems ────────────────────────────────────────────────────────────

const ECOSYSTEM: ReportTemplate[] = [
    {
        id: "spring-review",
        name: "Spring application review",
        audience: "A Spring team or its architects",
        summary: "Beans, controllers and entities by component, the layering between them, and where change lands.",
        ecosystem: "spring",
        title: ws => `Spring review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the application does, and what this review should settle.")
            w.section("The application", true, () => { w.reading("size"); w.reading("spring") })
            w.section("Where the beans are", needs.column(f, "java__spring__beans", "no Spring counts per component"), () => { w.sql("Spring and JPA by component", SQL.spring, 15); w.prompt("Whether controllers, services and repositories sit where the layering says they should.") })
            w.section("Layering", true, () => { structure(w); w.reading("coupling") })
            w.section("Build modules", needs.modules(f), () => w.reading("modules"))
            w.section("Hotspots", needs.git(f), () => hotspots(w))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "jvm-build",
        name: "Multi-module build review",
        audience: "Maven or Gradle builds",
        summary: "Modules, what they declare on each other, and how the code between them actually connects.",
        ecosystem: "jvm",
        title: ws => `Build review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why the module layout is being looked at.")
            w.section("Modules", needs.modules(f), () => { w.reading("modules"); w.sql("Modules", SQL.modules, 40) })
            w.section("How the code connects", true, () => { structure(w); w.reading("coupling") })
            w.section("Rules", needs.rules(f), () => rules(w))
            w.section("Proposal", true, () => w.prompt("Modules to merge, split or re-point, and the imports that justify each."))
        },
    },
    {
        id: "django-review",
        name: "Django project review",
        audience: "A Django team",
        summary: "Apps, their models and views, how apps depend on each other, and where change lands.",
        ecosystem: "django",
        title: ws => `Django review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the project does, and what this review should settle.")
            w.section("The project", true, () => { w.reading("size"); w.reading("django"); w.sql("Apps", SQL.modulesOf("django"), 40) })
            w.section("Between apps", true, () => { structure(w); w.reading("coupling"); w.prompt("Which apps are meant to be reusable, and whether their imports allow it.") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Health and tests", needs.health(f), () => { w.reading("health"); if (f.fileColumns.has("role")) w.reading("tests") })
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "python-review",
        name: "Python codebase review",
        audience: "A Python team",
        summary: "Packages, their imports and the libraries beneath them, hotspots and tests.",
        ecosystem: "python",
        title: ws => `Python review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the code does, and what this review should settle.")
            w.section("The code", true, () => w.reading("size"))
            w.section("Imports between packages", true, () => { structure(w); w.reading("coupling") })
            w.section("Libraries", needs.snippets(f), () => { w.reading("libraries"); slotOf(w, "table", "Libraries", VIEWS.libraries) })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => w.reading("tests"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "node-review",
        name: "JavaScript/TypeScript workspace review",
        audience: "A web or Node team",
        summary: "Packages, TypeScript share, import cycles between folders, libraries and hotspots.",
        ecosystem: "node",
        title: ws => `Workspace review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the workspace ships, and what this review should settle.")
            w.section("The workspace", true, () => { w.reading("size"); w.reading("node"); if (f.moduleKinds.node) w.sql("Packages", SQL.modulesOf("node"), 30) })
            w.section("Imports between folders", true, () => { structure(w); if (f.tangles) w.sql("Tangles", SQL.tangles, 10) })
            w.section("Libraries", needs.snippets(f), () => { w.reading("libraries"); slotOf(w, "table", "Libraries", VIEWS.libraries) })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => w.reading("tests"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "react-review",
        name: "React front end review",
        audience: "A front-end team",
        summary: "Where the components live, how the folders import each other, and which files change most.",
        ecosystem: "react",
        title: ws => `Front end review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the front end does, and what this review should settle.")
            w.section("The front end", true, () => { w.reading("node"); const cols = ["ts__react__components", "js__react__components"].filter(c => f.componentColumns.has(c)); if (cols.length) w.sql("React components by folder", SQL.react(cols), 15) })
            w.section("Structure", true, () => { structure(w); w.prompt("Whether features, shared UI and data access stay apart the way you mean them to.") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Health", needs.health(f), () => { w.reading("health"); w.table("f-health", 10) })
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "go-review",
        name: "Go module review",
        audience: "A Go team",
        summary: "Modules and packages, internal packages and who reaches them, and package coupling.",
        ecosystem: "go",
        title: ws => `Go review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the module does, and what this review should settle.")
            w.section("Modules and packages", true, () => { w.reading("size"); w.reading("go"); if (f.moduleKinds.go) w.sql("Modules", SQL.modulesOf("go"), 30) })
            w.section("Between packages", true, () => { structure(w); w.reading("coupling"); w.sql("The largest packages", SQL.largest, 10) })
            w.section("Rules", needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => w.reading("libraries"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "dotnet-review",
        name: ".NET solution review",
        audience: "A .NET team",
        summary: "Projects and their references, namespaces and their imports, rules and hotspots.",
        ecosystem: "dotnet",
        title: ws => `.NET review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the solution does, and what this review should settle.")
            w.section("The solution", true, () => { w.reading("size"); w.reading("dotnet"); if (f.moduleKinds.dotnet) w.sql("Projects", SQL.modulesOf("dotnet"), 40) })
            w.section("Between namespaces", true, () => { structure(w); w.reading("coupling") })
            w.section("Rules", needs.rules(f), () => rules(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "php-review",
        name: "PHP application review",
        audience: "A Symfony, Laravel or PHP team",
        summary: "Composer packages, bundles and namespaces, their imports, rules and hotspots.",
        ecosystem: "php",
        title: ws => `PHP review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the application does, and what this review should settle.")
            w.section("The application", true, () => { w.reading("size"); w.reading("php"); if (f.moduleKinds.composer) w.sql("Packages", SQL.modulesOf("composer"), 30) })
            w.section("Between namespaces", true, () => { structure(w); w.reading("coupling") })
            w.section("Rules", needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => w.reading("libraries"))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
]

export const TEMPLATES: ReportTemplate[] = [...GENERAL, ...ECOSYSTEM]
export const GENERAL_TEMPLATES = GENERAL
export const ECOSYSTEM_TEMPLATES = ECOSYSTEM

export interface BuiltTemplate {
    blocks: Block[]
    skipped: Array<{ section: string; why: string }>
}

/** A template written for one snapshot. The report always ends on a line to type. */
export function buildTemplate(t: ReportTemplate, ctx: TemplateContext): BuiltTemplate {
    const w = new Writer(ctx.facts)
    t.build(w, ctx)
    const last = w.blocks[w.blocks.length - 1]
    if (!last || isCell(last)) w.blocks.push({ id: newId(), kind: "p", text: "" })
    return { blocks: w.blocks, skipped: w.skipped }
}

/** What a built template holds, counted for the gallery's summary line. */
export function tally(blocks: Block[]) {
    let sections = 0, readings = 0, tables = 0, figures = 0, prompts = 0
    for (const b of blocks) {
        if (!isCell(b)) {
            if (b.kind === "h2") sections++
            if (!b.text && b.prompt) prompts++
            continue
        }
        const s = b.cell.spec
        if (s.type === "reading") readings++
        else if (s.type === "slot") figures++
        else tables++
    }
    return { sections, readings, tables, figures, prompts }
}

// ── Saved templates ───────────────────────────────────────────────────────

/** A report kept as a template: its structure, cells and prompts, not its results. */
export interface SavedTemplate {
    id: string
    name: string
    summary: string
    /** The workspace it was saved from, for the gallery. */
    from: string
    savedAt: string
    blocks: Block[]
}

export const SAVED_TEMPLATES_KEY = "reports.templates"

/**
 * A report as a template. Cells keep what they run, not what they found; a
 * capture or pin becomes a slot for the same view, since what it showed
 * belongs to this codebase. Paragraphs become prompts when asked: the words
 * stay as guidance, the page starts empty.
 */
export function toTemplate(blocks: Block[], opts: { promptParagraphs: boolean; pinRoute: (pinId: string) => { title: string; route: string; view: string } | null }): Block[] {
    const out: Block[] = []
    for (const b of blocks) {
        if (isCell(b)) {
            const s = b.cell.spec
            const keep = (spec: CellSpec, title = b.cell.title): Block => ({ id: newId(), kind: "cell", cell: { spec, title, caption: b.cell.caption, output: null, ranOn: null } })
            if (s.type === "capture") out.push(keep({ type: "slot", kind: s.kind, view: s.view, route: s.route, hint: b.cell.title || s.view }))
            else if (s.type === "pin") {
                const p = opts.pinRoute(s.pinId)
                if (p?.route) out.push(keep({ type: "slot", kind: "figure", view: p.view, route: p.route, hint: p.title }, b.cell.title || p.title))
            } else out.push(keep(s))
            continue
        }
        const t = b as TextBlock
        if (opts.promptParagraphs && t.kind === "p" && t.text.trim()) out.push({ id: newId(), kind: "p", text: "", prompt: plainText(t.text) })
        else if (t.text.trim() || t.prompt || t.kind === "hr") out.push({ ...t, id: newId() })
    }
    return out
}

/** A saved template's blocks for a new report: fresh ids, nothing run. */
export function fromSaved(t: SavedTemplate): Block[] {
    const blocks: Block[] = t.blocks.map(b => (isCell(b) ? { ...b, id: newId(), cell: { ...b.cell, output: null, ranOn: null } as Cell } : { ...b, id: newId() }))
    const last = blocks[blocks.length - 1]
    if (!last || isCell(last)) blocks.push({ id: newId(), kind: "p", text: "" })
    return blocks
}
