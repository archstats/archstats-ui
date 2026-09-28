// Report templates: the outline of a kind of report, written for one
// codebase. A template is built against what the snapshot holds: a section
// whose evidence the snapshot lacks is left out and named, never shown
// empty. Facts come in as readings (computed paragraphs), evidence as table
// and query cells, figures as slots the writer fills from a view, and the
// interpretation as prompts. Nothing in a template is a verdict.
//
// This file holds the general templates and the quick wins; the ones for one
// framework or build tool are in ecosystemTemplates.ts, and what they are all
// written with is in templateKit.ts.

import { TRUSTED_PAIR_SQL } from "~/features/git/cochange"
import { ECOSYSTEM } from "./ecosystemTemplates"
import { MOBILE } from "./mobileTemplates"
import { isCell, newId, plainText, type Block, type Cell, type CellSpec, type TextBlock } from "./reportDoc"
import { languageShare, prodFile, type Ecosystem, type EcosystemId, type SnapshotFacts } from "./readings"
import {
    ABOUT, age, churn, coupling, glance, hasModules, health, hotspots, knowledge, libraries, lit, modules, needs, opt, prod, REACHED, rules,
    slotOf, SQL, structure, tests, VIEWS, Writer, type ReportTemplate, type TemplateContext,
} from "./templateKit"

export type { ReportTemplate, TemplateContext, TemplateParam } from "./templateKit"
export { Writer } from "./templateKit"

// ── How to read the figures ───────────────────────────────────────────────

const READ = {
    matrix: "In the dependency matrix each row and each column is a group of components, numbered in dependency order. A number in a cell counts the imports from the row's group into the column's.\n\nIn a cleanly layered codebase every number sits on one side of the diagonal. A number on the other side is a dependency running the wrong way.",
    dms: "The main-sequence plot places each component by *instability*, left to right (from depended on by others to depending on others), and *abstractness*, bottom to top (from concrete code to interfaces and abstract classes). Components near the diagonal from top left to bottom right are balanced.\n\nBottom left is the *zone of pain*: concrete code that many others depend on, which is hard to change. Top right is the *zone of uselessness*: abstractions that nothing uses.",
    churnHealth: "In this treemap each rectangle is a component. Its size is how often it changed, and it runs hot where code health is low. Large and hot means code that keeps changing and is hard to change: that is where improvement pays back first.",
    ageTreemap: "In this treemap each rectangle is a component, sized by its lines. It runs hot where nothing has changed for longest: code nobody on the team has worked in recently.",
    nesting: "In this treemap each rectangle is a file, sized by its lines. It runs hot where the logic is nested deepest (conditions inside loops inside conditions), which is hard to read and to test.",
    plotChurnHealth: "The plot places each component by how often it changed, left to right, and by its code health, bottom to top, sized by its lines. The bottom right holds the code that changes most and is hardest to work in.",
    plotAuthors: "The plot places each component by how many people have changed it, left to right, and how often it changed, bottom to top. The top left is code that changes a lot but that few people know.",
    chord: "In the chord diagram each arc on the circle is a group of components. A ribbon between two arcs stands for the imports between them: the wider the ribbon, the more imports.",
    activity: "The chart shows the lines added and removed each month across the history, which shows how the pace of work has changed.",
    coChange: "This graph links groups of components that change in the same commits, whether or not they import each other. Thick links between groups that should be independent are hidden coupling.",
    outline: "The outline lists the folders as a tree. Every number is rolled up from the files inside, which makes it a map of the codebase by folder.",
    changes: "The Changes view compares this snapshot with the one before it: components added and removed, dependencies that appeared or went away, and rule findings that are new or gone.",
    combined: "The graph shows the component with its neighbours, linked both by imports and by commits that changed them together.",
}

// ── General ───────────────────────────────────────────────────────────────

const GENERAL: ReportTemplate[] = [
    {
        id: "architecture-review",
        name: "Architecture review",
        audience: "An architecture board or tech lead",
        summary: "A full review of how the codebase is built: its size and history, how its parts depend on each other, which dependency rules it breaks, where complicated code keeps changing, and how easy the code is to work in. Each section opens with evidence counted from the snapshot; you add what it means, your findings and what you recommend.",
        when: "Use it when someone needs the overall picture before a decision: a roadmap, a rewrite, a new team taking the code over, or a yearly review.",
        title: ws => `Architecture review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Start with two or three sentences: why this review was done, who asked for it, and which decision it should help make. For example: whether to split out the billing code, or where to spend next quarter's clean-up time.")
            w.section("The system at a glance", true, () => glance(w))
            w.section("Structure: how the parts depend on each other", true, () => {
                structure(w)
                w.explainSlot(READ.matrix)
                slotOf(w, "table", "Dependency matrix, in levels", VIEWS.matrix(f))
                w.prompt("Compare this with the layering the team intends. Do the imports run the way the design says they should? Name any tangle that joins parts that are meant to stay apart.")
            })
            w.section("Coupling: the most depended-on parts", true, () => {
                coupling(w, 8)
                w.explainSlot(READ.dms)
                slotOf(w, "figure", "The main sequence", VIEWS.plot("dms", "Distance to Main Sequence"))
            })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Hotspots: complicated code that changes often", needs.git(f), () => { hotspots(w); slotOf(w, "figure", "Hotspots", VIEWS.hotspots) })
            w.section("Code health", needs.health(f), () => {
                health(w, "components", 8)
                if (f.commits) { w.explainSlot(READ.churnHealth); slotOf(w, "figure", "Churn against code health", VIEWS.treemap("churn", "components", "Churn against health, components")) }
            })
            w.section("Findings", true, () => w.prompt("The two or three things the reader should remember. Tie each one to a figure or table above, so the reader can check it for themselves."))
            w.section("Recommendations", true, () => w.prompt("What you propose, most important first. For each: what the work is, roughly what it costs, and what it makes easier or safer afterwards."))
        },
    },
    {
        id: "executive-summary",
        name: "Executive summary",
        audience: "Leadership, on one page",
        summary: "A one-page summary for people who do not read code: how big the system is, how tangled it is, where the team's effort goes and how much of it depends on a few people. The facts are counted for you; you write what they mean for the business and what you are asking for.",
        when: "Use it when you need a decision or a budget from people outside engineering, or a short status for leadership.",
        title: ws => `${ws}: summary`,
        build(w) {
            const f = w.facts
            w.prompt("The one sentence to read if nothing else is read. For example: “Half of our changes land in three parts of the system that only one person knows well, and we are asking for time to spread that knowledge.”")
            // One page for leadership: one short note on the terms instead of one per paragraph, and one figure.
            w.section("The system in numbers", true, () => {
                w.explain(QABOUT.execTerms)
                // Names read as plain words here: leadership does not read package paths.
                const plain = { plain: "1" }
                w.reading("size", plain)
                if (f.commits) w.reading("history", plain)
                w.reading("structure", plain)
                if (f.commits) {
                    w.reading("churn", { days: "90", ...plain })
                    w.reading("knowledge", plain)
                    slotOf(w, "figure", "Where changed lines went", VIEWS.effort)
                }
            })
            w.section("What it means", true, () => w.prompt("Translate the numbers into business terms: where change is slow, risky or dependent on a few people, and what that costs in delays, incidents or onboarding time. Leave out any term the reader would need explained."))
            w.section("What we ask for", true, () => w.prompt("The decision or investment you are asking for, what it will change, and by when you need an answer."))
        },
    },
    {
        id: "due-diligence",
        name: "Technical due diligence",
        audience: "An acquisition or investment",
        summary: "An outside assessment for someone deciding whether to buy, invest in or take over the software: what was looked at, the team and its history, how the system is structured, how maintainable the code is, what it depends on, how well it is tested, and the risks that follow.",
        when: "Use it when the reader is not the team that wrote the code and has to judge its quality and risks, for example before an acquisition, an investment or an outsourcing contract.",
        title: ws => `Technical due diligence: ${ws}`,
        build(w) {
            const f = w.facts
            w.section("Scope", true, () => { w.prompt("What was scanned (repositories, branches, the date of the newest commit) and what was left out, so the reader knows what the evidence covers."); w.explain(ABOUT.size).reading("size") })
            w.section("History and team", needs.git(f), () => {
                w.explain(ABOUT.history).reading("history")
                w.explainSlot(READ.activity)
                slotOf(w, "figure", "Work over time", VIEWS.activity)
                knowledge(w)
            })
            w.section("Structure", true, () => {
                structure(w, false)
                if (hasModules(f)) modules(w)
                slotOf(w, "figure", "The system's parts", VIEWS.graph)
                w.explainSlot(READ.dms)
                slotOf(w, "figure", "The main sequence", VIEWS.plot("dms", "Distance to Main Sequence"))
            })
            w.section("Maintainability", needs.health(f), () => {
                health(w, null)
                age(w)
                w.table("f-health", 10)
                if (f.fileColumns.has("git__last_change_age_in_days")) { w.explainSlot(READ.ageTreemap); slotOf(w, "figure", "Code age", VIEWS.treemap("age", "components", "Code age, components")) }
            })
            w.section("Third-party dependencies", needs.snippets(f), () => libraries(w))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Risks", true, () => w.prompt("Each risk, with the evidence above that supports it, how likely it is to matter after the deal, and what it would take to reduce it."))
        },
    },
    {
        id: "onboarding",
        name: "Onboarding guide",
        audience: "Developers new to the code",
        summary: "A guided tour for someone joining the team: what the codebase holds, how its main parts fit together, where the day-to-day work happens, who knows which area, and which parts to handle with care. You add the names and context that numbers cannot give.",
        when: "Use it when a new developer joins, or when a team takes over code it did not write.",
        title: ws => `Getting to know ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Who this guide is for and what they will work on first, so they know which sections matter most to them.")
            w.section("What is here", true, () => {
                w.explain(ABOUT.size).reading("size")
                if (hasModules(f)) modules(w)
                w.sql("The largest components", SQL.largest(f), 10)
                w.explainSlot(READ.outline)
                slotOf(w, "table", "The codebase by directory", VIEWS.outline)
            })
            w.section("How it hangs together", true, () => {
                coupling(w)
                slotOf(w, "figure", "The system's parts", VIEWS.graph)
                w.explainSlot(READ.chord)
                slotOf(w, "figure", "Who imports whom", VIEWS.chord)
                w.prompt("The areas a newcomer should know by name, and what each one is for, in a sentence each.")
            })
            w.section("Where the work is", needs.git(f), () => { churn(w, "90"); w.table("f-churn", 10) })
            w.section("Who knows what", needs.git(f), () => { knowledge(w); w.prompt("Who to ask about which area, if the team is happy to have names in writing.") })
            w.section("Handle with care", needs.git(f), () => { w.explain(ABOUT.hotspots).reading("hotspots"); w.prompt("The parts that tend to bite, and why: what makes them hard, and what to check before changing them.") })
        },
    },
    {
        id: "refactoring-case",
        name: "Refactoring case",
        audience: "The case for reworking one component",
        summary: "Makes the case for reworking a single component: what it is today, what its history and health say about the cost of leaving it alone, what depends on it and could break, what the work would cost, and the plan. Choose the component below; it starts on the biggest hotspot.",
        when: "Use it when you want time or approval to restructure one part of the code and have to show that it is worth it.",
        params: [{ id: "component", label: "Component", kind: "component" }],
        title: (ws, p) => `Refactoring ${p.component || "a component"}`,
        build(w, { params }) {
            const f = w.facts
            const c = params.component
            w.prompt("The change you propose for this component, in one paragraph: what it looks like now, and what it should look like afterwards.")
            w.section("The component today", true, () => { w.reading("focus", { component: c }); if (c) slotOf(w, "figure", `${c} and its neighbours`, VIEWS.focus(c)) })
            w.section("Why now", needs.all(needs.git(f), needs.component(c)), () => {
                w.explain("The table lists the component's files, the hottest first. A hotspot is a file that is both complicated and changed often; code health rates how easy a file is to change, from 1 (hard) to 10 (simple).")
                w.sql(`Files of ${c}`, SQL.filesOf(c), 15)
                w.prompt("What its history and health say about the cost of leaving it as it is: how often it changes, how long those changes take, and what goes wrong.")
            })
            w.section("What depends on it", needs.component(c), () => {
                w.explain(ABOUT.coupling)
                if (f.tangles) slotOf(w, "figure", `The tangle around ${c}`, VIEWS.cyclesAround(c))
                w.sql(`Components that import ${c}`, SQL.dependentsOf(c), 15).sql(`What ${c} imports`, SQL.dependenciesOf(c), 15)
            })
            w.section("Cost and risk", true, () => w.prompt("How much work it is, who needs to be involved (the owners of the components that depend on it), and what could break along the way."))
            w.section("Plan", true, () => w.prompt("The steps, in order, each small enough to ship on its own, and how you will know each one worked."))
        },
    },
    {
        id: "debt-register",
        name: "Technical debt register",
        audience: "The team's backlog",
        summary: "Lists the technical debt the snapshot can see (hotspots, hard-to-change files, circular dependencies and broken rules) as tables you can turn into backlog items. *Technical debt* is anything in the code that makes future changes slower or riskier than they need to be.",
        when: "Use it when you want a concrete, evidence-based list of clean-up work to plan into sprints.",
        title: ws => `Technical debt: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("How the items were chosen, and where they will be tracked (the backlog, a board, this report).")
            w.section("Hotspots", needs.git(f), () => {
                hotspots(w, "files", 15)
                if (f.componentColumns.has("codesmells__code_health")) { w.explainSlot(READ.plotChurnHealth); slotOf(w, "figure", "Churn against code health", VIEWS.plot("churn-health", "Churn against health")) }
            })
            w.section("Hard-to-change files", needs.health(f), () => {
                health(w, "files", 15)
                w.explainSlot(READ.nesting)
                slotOf(w, "figure", "Nesting depth", VIEWS.treemap("nesting", "files", "Nesting depth, files"))
            })
            w.section("Circular dependencies", needs.tangles(f), () => { structure(w, false); w.sql("Tangles", SQL.tangles, 20); slotOf(w, "figure", "Cycles in the largest tangle", VIEWS.cycles) })
            w.section("Broken dependency rules", needs.rules(f), () => rules(w))
            w.section("The register", true, () => w.prompt("Per item: an owner, what leaving it costs (time lost, bugs, blocked work), and the next concrete step."))
        },
    },
    {
        id: "ownership",
        name: "Ownership and knowledge",
        audience: "Engineering managers",
        summary: "Shows how knowledge of the code is spread across the team: which components depend on one or two people, where the recent work lands, and what to do about the risk. No names are written unless you add them.",
        when: "Use it when planning team changes, before someone leaves or goes on long leave, or when work keeps waiting on the same people.",
        title: ws => `Ownership: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why ownership is being looked at now: a team change, a departure, work that keeps queueing on the same people.")
            w.section("History", needs.git(f), () => { w.explain(ABOUT.history).reading("history"); w.explainSlot(READ.activity); slotOf(w, "figure", "Work over time", VIEWS.activity) })
            w.section("How concentrated knowledge is", needs.git(f), () => {
                knowledge(w)
                w.explainSlot(READ.plotAuthors)
                slotOf(w, "figure", "Authors against churn", VIEWS.plot("authors-churn", "Authors vs Churn"))
            })
            w.section("Where change lands", needs.git(f), () => { churn(w, "180"); w.sql("Change by component, last 180 days", SQL.churn("180"), 12); slotOf(w, "figure", "Where changed lines went", VIEWS.effort) })
            w.section("Risks and actions", true, () => w.prompt("Where one person leaving would stall work, and for each: what you will do (pairing, reviews, documentation, rotation) and by when."))
        },
    },
    {
        id: "dependency-audit",
        name: "Dependency audit",
        audience: "Platform or security review",
        summary: "Reviews what the code depends on: the third-party libraries it imports, the build modules and what they declare, how the code's own components depend on each other, and any broken dependency rules. You finish with what to upgrade, replace, remove or cut.",
        when: "Use it before a major upgrade, after a security advisory, or when the build has become slow and hard to reason about.",
        title: ws => `Dependency audit: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What prompted the audit, and what is in scope (all libraries, one framework, one part of the system).")
            w.section("Third-party libraries", needs.snippets(f), () => libraries(w))
            w.section("Build modules", needs.modules(f), () => modules(w, SQL.modules))
            w.section("Between the code's own components", true, () => { coupling(w); structure(w, false) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Actions", true, () => w.prompt("Libraries to upgrade, replace or remove, and dependencies between components to cut, each with the reason."))
        },
    },
    {
        id: "modularization",
        name: "Modularization plan",
        audience: "Splitting a monolith",
        summary: "Plans how to split one large codebase (a *monolith*) into modules that can be built, tested, deployed or owned separately: where it stands, what holds it together, which modules you propose, and the order to cut them.",
        when: "Use it when teams keep getting in each other's way in one codebase, or before moving to separate services or packages.",
        title: ws => `Modularizing ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The goal: what the parts should be able to do on their own (deploy, test, be owned by one team) that they cannot do today.")
            w.section("Where it stands", true, () => { w.explain(ABOUT.size).reading("size"); structure(w) })
            w.section("What holds it together", true, () => {
                coupling(w, 10)
                if (f.tangles) w.sql("Tangles", SQL.tangles, 10)
                w.explainSlot(READ.matrix)
                slotOf(w, "table", "Dependency matrix, in levels", VIEWS.matrix(f))
                if (f.commits) { w.explainSlot(READ.coChange); slotOf(w, "figure", "What changes together", VIEWS.coChange) }
            })
            w.section("Candidate modules", true, () => { slotOf(w, "figure", "Candidate modules", VIEWS.graph); w.prompt("The modules you propose, what each one owns, and the imports that would cross between them.") })
            w.section("Sequence", true, () => w.prompt("What to cut first and why, and what each step makes possible. Cutting where few imports cross is usually cheapest."))
        },
    },
    {
        id: "check-in",
        name: "Health check-in",
        audience: "A recurring review",
        summary: "A short health check with the same sections every time. Make it once, then run it again on each new snapshot (monthly or quarterly): every counted paragraph says what moved since the last run, so the report tracks progress over time.",
        when: "Use it for a regular review with the team or management, to see whether the codebase is getting easier or harder to work in.",
        title: ws => `Check-in: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The period this covers, and what changed in the team or the plans since the last check-in.")
            w.section("Shape", true, () => { w.explain(ABOUT.size).reading("size"); w.explain(ABOUT.structure).reading("structure") })
            w.section("Change", needs.git(f), () => { churn(w, "90"); hotspots(w, "components", 8) })
            w.section("Health", needs.health(f), () => { health(w, null); age(w) })
            w.section("Rules", needs.rules(f), () => w.explain(ABOUT.rules).reading("rules"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Since last time", true, () => { w.explain(ABOUT.trends); slotOf(w, "figure", "Trends", VIEWS.trends); w.explainSlot(READ.changes); slotOf(w, "table", "What changed since the last snapshot", VIEWS.changes); w.prompt("What moved, and whether it moved the way you meant it to. If not, what you will do differently.") })
        },
    },
]

/** Import steps between two components; before analysis revision 1 the path length counted components, one more than the steps. */
const steps = (f: SnapshotFacts) => (f.revision < 1 ? "shortest_path_length - 1" : "shortest_path_length")
const QSQL = {
    reachBySteps: (f: SnapshotFacts, c: string) => `SELECT ${steps(f)} AS "steps away", count(*) AS components FROM component_connections_indirect WHERE "to" = ${lit(c)} AND "from" <> ${lit(c)} AND ${prod(f, `"from"`)} GROUP BY 1 ORDER BY 1`,
    reachOf: (f: SnapshotFacts, c: string) => `SELECT "from" AS component, ${steps(f)} AS "steps away", ${f.indirectColumns.has("shortest_path") ? `shortest_path AS "shortest import chain"` : `next_hop AS "next step toward it"`} FROM component_connections_indirect WHERE "to" = ${lit(c)} AND "from" <> ${lit(c)} AND ${prod(f, `"from"`)} ORDER BY 2, 1`,
    changesWith: (f: SnapshotFacts, c: string) => `SELECT pair_2 AS component, shared_commits AS "commits that changed both", CAST(round(percentage_of_all_commits_pair_1) AS INTEGER) AS "% of its commits", CASE WHEN EXISTS (SELECT 1 FROM component_connections_direct d WHERE (d."from" = pair_1 AND d."to" = pair_2) OR (d."from" = pair_2 AND d."to" = pair_1)) THEN 'yes' ELSE 'no' END AS "import between them" FROM git_component_shared_commits WHERE pair_1 = ${lit(c)} AND ${prod(f, "pair_2")} AND ${TRUSTED_PAIR_SQL} ORDER BY 2 DESC, 1`,
    testsOf: (c: string) => `SELECT name AS "test file", CASE WHEN component = ${lit(c)} THEN 'sits inside it' ELSE 'imports it' END AS "how it reaches it" FROM files WHERE role = 'test' AND (component = ${lit(c)} OR name IN (SELECT file FROM component_connections_direct WHERE "to" = ${lit(c)})) ORDER BY 2 DESC, 1`,
    // The same pairs as Connections' hidden coupling: at least 10 shared commits, 30% of the quieter side's, no import either way.
    hidden: (f: SnapshotFacts) => `SELECT pair_1 AS component, pair_2 AS "changes together with", shared_commits AS "commits that changed both", CAST(round(max(percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2)) AS INTEGER) AS "% of the quieter one's commits" FROM git_component_shared_commits s WHERE pair_1 < pair_2 AND shared_commits >= 10 AND max(percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2) >= 30 AND ${TRUSTED_PAIR_SQL} AND ${prod(f, "pair_1")} AND ${prod(f, "pair_2")} AND NOT EXISTS (SELECT 1 FROM component_connections_direct d WHERE (d."from" = s.pair_1 AND d."to" = s.pair_2) OR (d."from" = s.pair_2 AND d."to" = s.pair_1)) ORDER BY 3 DESC, 1, 2`,
    loadBearing: (f: SnapshotFacts) => `SELECT name, modularity__coupling__dependents AS "components that depend on it", complexity__lines AS lines${opt(f, "codesmells__code_health", `round(codesmells__code_health, 1) AS "code health"`)}${opt(f, "git__commits__last_180_days", `git__commits__last_180_days AS "commits, last 180 days"`)}${f.fileColumns.has("role") && needs.testFiles(f) === true ? `, CASE WHEN name IN ${REACHED} THEN 'yes' ELSE 'no' END AS "reached by tests"` : ""} FROM components WHERE ${prod(f, "name")} AND coalesce(modularity__coupling__dependents, 0) > 0 ORDER BY 2 DESC, name`,
    untested: (f: SnapshotFacts) => `SELECT name, complexity__lines AS lines${opt(f, "git__commits__last_180_days", `git__commits__last_180_days AS "commits, last 180 days"`)}, modularity__coupling__dependents AS "components that depend on it"${opt(f, "codesmells__code_health", `round(codesmells__code_health, 1) AS "code health"`)} FROM components WHERE ${prod(f, "name")} AND name NOT IN ${REACHED} ORDER BY ${f.componentColumns.has("git__commits__last_180_days") ? "coalesce(git__commits__last_180_days, 0) DESC, " : ""}coalesce(complexity__lines, 0) DESC, name`,
    // Lines of production files only: a root component also holds conftest.py and setup.py.
    unimported: (f: SnapshotFacts) => `SELECT name, (SELECT sum(coalesce(fi.complexity__lines, 0)) FROM files fi WHERE fi.component = components.name AND ${prodFile(f, "fi")}) AS lines${opt(f, "git__last_change_age_in_days", `git__last_change_age_in_days AS "days since last change"`)}, modularity__coupling__dependencies AS "components it imports" FROM components WHERE ${prod(f, "name")} AND coalesce(modularity__coupling__dependents, 0) = 0 ORDER BY ${f.componentColumns.has("git__last_change_age_in_days") ? "git__last_change_age_in_days DESC NULLS LAST, " : ""}name`,
    untouched: (f: SnapshotFacts) => `SELECT name, complexity__lines AS lines, git__last_change_age_in_days AS "days since last change", component FROM files WHERE ${prodFile(f)} AND coalesce(component, '') <> '' AND git__last_change_age_in_days > 730 ORDER BY lines DESC, name`,
    twoWay: (f: SnapshotFacts) => `WITH e AS (SELECT "from" AS a, "to" AS z, count(*) AS n FROM component_connections_direct WHERE "from" <> "to" AND ${prod(f, `"from"`)} AND ${prod(f, `"to"`)} GROUP BY 1, 2) SELECT x.a AS "component A", x.z AS "component B", x.n AS "times A imports B", y.n AS "times B imports A" FROM e x JOIN e y ON x.a = y.z AND x.z = y.a WHERE x.a < x.z ORDER BY min(x.n, y.n), max(x.n, y.n) DESC, 1, 2`,
    recentFiles: `SELECT name, git__commits__last_30_days AS commits, coalesce(git__additions__last_30_days, 0) + coalesce(git__deletions__last_30_days, 0) AS "changed lines", git__authors__last_30_days AS authors FROM files WHERE git__commits__last_30_days > 0 ORDER BY 3 DESC, name`,
    newFiles: (f: SnapshotFacts) => `SELECT name, complexity__lines AS lines, component FROM files WHERE git__age_in_days <= 30 AND ${prodFile(f)} ORDER BY lines DESC, name`,
    recentHotspots: (f: SnapshotFacts) => `SELECT name, round(codesmells__hotspot_score, 1) AS "hotspot score"${f.fileColumns.has("codesmells__code_health") ? `, round(codesmells__code_health, 1) AS "code health"` : ""}, git__commits__last_30_days AS "commits, last 30 days" FROM files WHERE git__commits__last_30_days > 0 AND codesmells__hotspot_score > 0 ORDER BY codesmells__hotspot_score DESC, name`,
}

const QABOUT = {
    execTerms: "In short: *production code* is the code that ships to users, and a *component* is a folder or package of it. A *tangle* is a set of components that all depend on one another, so none of them can change on its own. *Churn* is the number of lines added and deleted, which shows where the team's effort went.",
    impact: "A change to a component can break the code that uses it. Components that import it directly notice first; components that import *those* can be affected in turn.\n\nThe first table counts the components that depend on it by how many steps away they are: 1 step means they import it directly, 2 steps means they import something that imports it, and so on. The second table lists them, with the shortest chain of imports that links each one to it.",
    coChange: "Git also shows which components tend to change in the same commits. When two components keep changing together, a change to one has usually needed a change to the other, whether or not an import joins them. A pair with no import between them is tied by something the code structure does not show.",
    hidden: "Two components are *coupled* when a change to one needs a change to the other. Imports make most coupling visible, but not all of it. A shared database table, a configuration key, a message format, copied code, or a front end calling a back end all tie components together without an import.\n\nThis table finds such pairs in the git history: they changed together in at least 10 commits, yet neither imports the other. The last column says how tightly. Of the commits that changed the less active of the two, it is the share that also changed the other.",
    loadBearing: "A *load-bearing* component is one that many other components depend on: shared models, utilities, base classes, API clients. A change to it can affect every component that imports it.\n\nThis table lists them, most depended on first, with what makes a change to them safer or riskier: how easy the code is to work in, how much it is still changing, and whether any test reaches it.",
    testGaps: "Tests are the safety net for change. This table lists the production components that no test reaches: no test file imports them, and none sits inside them.\n\nThey are ranked by how often they changed in the last 180 days, because code that keeps changing without tests is where regressions slip through. Some code is tested another way, through end-to-end or manual tests, which this does not see.",
    cleanup: "Code nobody uses still costs something: people read it, keep it compiling, update it when libraries change, and hesitate to delete it. These tables list candidates: components that no other component imports, least recently changed first, and large files nobody has changed in two years.\n\n**Check before deleting anything.** Entry points (main programs, controllers, command handlers, scheduled jobs) and code a framework loads by name (Spring beans, Django apps, plugins, templates) are used without being imported.",
    twoWay: "When two components import each other, neither can be understood, tested or reused without the other. It is the smallest possible tangle, and the cheapest to break.\n\nThe table lists every such pair with how many times each imports the other, the pairs where one direction has only a few imports first. Those few imports are usually the ones to move or turn around, for example by moving the shared piece into one of the two components, or into a new one both can use.",
    recent: "This report looks only at the last 30 days of commits, counted back from the newest commit in the scan. It shows where the team's work went in that time: which files changed most, which hotspots were touched, and which files are new.",
}

// ── Quick wins ────────────────────────────────────────────────────────────
// Short reports around one question, each ending in a list someone can act on.

const QUICK: ReportTemplate[] = [
    {
        id: "change-impact",
        icon: "network",
        name: "Change impact",
        audience: "Before changing one component",
        summary: "Answers “what could break if I change this?” for one component: every component that depends on it, directly or through others; the components that have historically changed together with it; and the tests that reach it. Choose the component below.",
        when: "Use it before a risky change, a refactor or an upgrade of one component, to know who to warn and what to test.",
        params: [{ id: "component", label: "Component", kind: "component" }],
        title: (ws, p) => `Changing ${p.component || "a component"}: what it affects`,
        build(w, { params }) {
            const f = w.facts
            const c = params.component
            w.prompt("The change you plan to make, in a sentence or two.")
            w.section("The component", true, () => {
                w.reading("focus", { component: c })
                if (c) { w.explainSlot(READ.combined); slotOf(w, "figure", `${c}: imports and co-change`, VIEWS.combined(c)) }
            })
            w.section("What depends on it", needs.all(needs.component(c), needs.reach(f)), () => {
                w.explain(QABOUT.impact)
                w.sql(`How far a change to ${c} can reach`, QSQL.reachBySteps(f, c), 20)
                w.sql(`Components that depend on ${c}`, QSQL.reachOf(f, c), 30)
            })
            w.section("What changes with it", needs.all(needs.component(c), needs.coChange(f)), () => {
                w.explain(QABOUT.coChange)
                w.sql(`Components that change in the same commits as ${c}`, QSQL.changesWith(f, c), 10)
            })
            w.section("Tests that reach it", needs.all(needs.component(c), needs.tests(f), needs.testFiles(f)), () => w.sql(`Test files that reach ${c}`, QSQL.testsOf(c), 30))
            w.section("Before you change it", true, () => w.prompt("Who to tell (the owners of the components above), which tests to run or write first, and what you will check once the change is in."))
        },
    },
    {
        id: "hidden-coupling",
        icon: "link",
        name: "Hidden coupling",
        audience: "Links no import shows",
        summary: "Finds pairs of components that keep changing in the same commits although neither imports the other. Something the code structure does not show ties them together, such as a shared database table, a configuration key, a message format, an API between a front end and a back end, or copied code.",
        when: "Use it when changes keep needing edits in unexpected places, or before splitting code into separate modules or services: hidden links are what break first.",
        title: ws => `Hidden coupling: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why you are looking for hidden coupling now: a planned split, or changes that keep surprising the team.")
            w.section("Components that change together without an import", needs.coChange(f), () => {
                w.explain(QABOUT.hidden)
                w.sql("Changed together, no import between them", QSQL.hidden(f), 20)
                slotOf(w, "table", "Hidden coupling", VIEWS.hidden)
                w.explainSlot(READ.coChange)
                slotOf(w, "figure", "What changes together", VIEWS.coChange)
                w.prompt("For the top pairs, what ties them together? Look at a few of the commits that changed both and name the link: a table, an API, a shared rule, copied code.")
            })
            w.section("What to do about each", true, () => w.prompt("Per pair, one of three: make the link visible (a shared module, an explicit interface, a contract test), remove it (merge the copied logic), or accept it and write it down where the next person will find it."))
        },
    },
    {
        id: "load-bearing",
        icon: "layers",
        name: "Load-bearing components",
        audience: "Protecting shared code",
        summary: "Lists the components the most other components depend on, beside what makes changing them safe or risky: how easy their code is to work in, how much they still change, and whether any test reaches them.",
        when: "Use it to decide where tests, code review and stability matter most, or before letting more teams build on shared code.",
        title: ws => `Load-bearing components: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why this list matters now: a new team building on the shared code, an upgrade, or incidents that started in shared code.")
            w.section("The most depended-on components", needs.column(f, "modularity__coupling__dependents", "the scan did not count dependents per component"), () => {
                w.explain(QABOUT.loadBearing)
                w.sql("Components by how many others depend on them", QSQL.loadBearing(f), 15)
                w.explainSlot(READ.dms)
                slotOf(w, "figure", "The main sequence", VIEWS.plot("dms", "Distance to Main Sequence"))
            })
            w.section("What to protect", true, () => w.prompt("For the top few: which need more tests, a named owner, stricter review, or a smaller and more stable interface, and why."))
        },
    },
    {
        id: "test-gaps",
        icon: "flask",
        name: "Where tests are missing",
        audience: "Test planning",
        summary: "Lists the production components no test reaches, the ones that change most first, with their size, how many other components depend on them and how easy their code is to work in.",
        when: "Use it to decide where to write tests next, or before a refactor in an area you are not sure is tested.",
        title: ws => `Test gaps: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What prompted this: an incident, a planned refactor, or a push to raise the test safety net.")
            w.section("Tests in the codebase", needs.tests(f), () => tests(w))
            w.section("Components no test reaches", needs.all(needs.tests(f), needs.testFiles(f)), () => {
                w.explain(QABOUT.testGaps)
                w.sql("Production components no test reaches", QSQL.untested(f), 20)
            })
            w.section("Where to start", true, () => w.prompt("The three to five components to test first, and why: they change often, many others depend on them, or a bug there would be costly."))
        },
    },
    {
        id: "cleanup",
        icon: "trash",
        name: "Cleanup candidates",
        audience: "Removing unused code",
        summary: "Lists code that may no longer be needed: components no other component imports, least recently changed first, and large files nobody has changed in two years. Each is a candidate to check, not a verdict.",
        when: "Use it when the codebase feels bigger than it needs to be, before a migration (less code to move), or when onboarding keeps stumbling over code nobody uses.",
        title: ws => `Cleanup candidates: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why a cleanup now, and who will confirm that something is really unused before it goes.")
            w.section("Components nothing imports", needs.column(f, "modularity__coupling__dependents", "the scan did not count dependents per component"), () => {
                w.explain(QABOUT.cleanup)
                w.sql("Components no other component imports", QSQL.unimported(f), 25)
            })
            w.section("Large files nobody has changed in two years", needs.age(f), () => {
                w.sql("Production files unchanged for over two years, largest first", QSQL.untouched(f), 20)
                w.explainSlot(READ.ageTreemap)
                slotOf(w, "figure", "Code age", VIEWS.treemap("age", "components", "Code age, components"))
            })
            w.section("What goes", true, () => w.prompt("For each candidate you checked: remove it, keep it (and say what uses it, so the next person does not ask again), or ask its owner."))
        },
    },
    {
        id: "two-way",
        icon: "refresh",
        name: "Circular dependencies to break first",
        audience: "Untangling the code",
        summary: "Lists every pair of components that import each other, the smallest and cheapest kind of circular dependency, with how many imports run each way. The pairs where one direction has only a few imports come first: they are usually the quickest to fix.",
        when: "Use it when you want to start untangling the code with small, safe steps, or to stop new circular dependencies from creeping in.",
        title: ws => `Circular dependencies: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why untangling matters here: slow builds, parts that cannot be tested alone, or a planned split.")
            w.section("How tangled the code is", true, () => w.explain(ABOUT.structure).reading("structure"))
            w.section("Components that import each other", needs.tangles(f), () => {
                w.explain(QABOUT.twoWay)
                w.sql("Pairs of components that import each other", QSQL.twoWay(f), 20)
                slotOf(w, "figure", "The largest tangle", VIEWS.cycles)
                w.explainSlot(READ.matrix)
                slotOf(w, "table", "Dependency matrix, in levels", VIEWS.matrix(f))
            })
            w.section("The first cuts", true, () => w.prompt("The pairs you will fix first, which imports you will move or turn around in each, and how you will stop them coming back (a dependency rule, a review check)."))
        },
    },
    {
        id: "last-30-days",
        icon: "history",
        name: "The last 30 days",
        audience: "A sprint or monthly review",
        summary: "What happened in the code in the last 30 days: how much changed and where, which files changed most, which hotspots the team touched and which files are new.",
        when: "Use it for a sprint review, a monthly update, or to see where the team's time actually went.",
        title: ws => `${ws}: the last 30 days`,
        build(w) {
            const f = w.facts
            w.prompt("The period this covers and what the team set out to do in it, so the reader can compare plan and reality.")
            w.section("Where the change went", needs.recent(f), () => {
                w.explain(QABOUT.recent)
                churn(w, "30")
                w.sql("Files changed most in the last 30 days", QSQL.recentFiles, 15)
                w.explainSlot(READ.activity)
                slotOf(w, "figure", "Work over time", VIEWS.activity)
            })
            w.section("Hotspots touched", needs.all(needs.recent(f), f.fileColumns.has("codesmells__hotspot_score") ? true : "the scan has no hotspot scores"), () => {
                w.explain("A *hotspot* is code that is both complicated and changed often; its score runs from 0 to 100. Work in a hotspot tends to take longer and break more often, so it is worth knowing how much of the month went there.")
                w.sql("Hotspot files changed in the last 30 days", QSQL.recentHotspots(f), 10)
            })
            w.section("New files", needs.all(needs.recent(f), f.fileColumns.has("git__age_in_days") ? true : "the scan has no file ages"), () => w.sql("Production files first committed in the last 30 days", QSQL.newFiles(f), 15))
            w.section("What it tells us", true, () => w.prompt("Did the work land where the plan said it would? Name anything unexpected: a file that keeps changing, a hotspot that took more time than planned."))
        },
    },
]

export const TEMPLATES: ReportTemplate[] = [...GENERAL, ...QUICK, ...ECOSYSTEM, ...MOBILE]
export const GENERAL_TEMPLATES = GENERAL
export const QUICK_TEMPLATES = QUICK
export const ECOSYSTEM_TEMPLATES = [...ECOSYSTEM, ...MOBILE]

export interface BuiltTemplate {
    blocks: Block[]
    skipped: Array<{ section: string; why: string }>
}

/** A template written for one snapshot. The report always ends on a line to type. */
export function buildTemplate(t: ReportTemplate, ctx: TemplateContext): BuiltTemplate {
    const w = new Writer(ctx.facts, ctx.explain ?? true)
    w.eco = t.ecosystem ?? leadEcosystem(ctx.facts, ctx.ecosystems)
    t.build(w, ctx)
    const last = w.blocks[w.blocks.length - 1]
    if (!last || isCell(last)) w.blocks.push({ id: newId(), kind: "p", text: "" })
    return { blocks: w.blocks, skipped: w.skipped }
}

/** The languages each ecosystem's code is written in, for how much of the codebase it covers. */
const ECO_LANGUAGES: Record<EcosystemId, string[]> = {
    spring: ["Java", "Kotlin"], jvm: ["Java", "Kotlin"], django: ["Python"], python: ["Python"],
    node: ["TypeScript", "JavaScript", "TypeScript (TSX)", "JavaScript (JSX)"], react: ["TypeScript", "JavaScript", "TypeScript (TSX)", "JavaScript (JSX)"],
    go: ["Go"], dotnet: ["C#"], php: ["PHP"],
    android: ["Kotlin", "Java"], ios: ["Swift", "Objective-C"], flutter: ["Dart"], kmp: ["Kotlin"],
    "react-native": ["TypeScript", "JavaScript", "TypeScript (TSX)", "JavaScript (JSX)"],
}
/** A framework's review says more than its language's: it wins a tie. */
const SPECIFIC: EcosystemId[] = ["android", "ios", "flutter", "react-native", "spring", "django", "react", "kmp", "dotnet", "php", "go", "python", "jvm", "node"]

/**
 * The template the gallery opens on: the detected ecosystem whose code is the
 * largest share of the production lines, if that is at least 30%; otherwise
 * the Architecture review. A JavaScript review never opens on a PHP codebase
 * because a few scripts were found.
 */
export function bestTemplate(f: SnapshotFacts, ecos: Ecosystem[], templates: ReportTemplate[] = [...ECOSYSTEM, ...MOBILE]): string {
    const lead = leadEcosystem(f, ecos.filter(e => templates.some(t => t.ecosystem === e.id)))
    return (lead && templates.find(t => t.ecosystem === lead)?.id) || "architecture-review"
}

/** The detected ecosystem holding the largest share of the production lines, at least 30%; "" when none does. */
export function leadEcosystem(f: SnapshotFacts, ecos: Ecosystem[]): EcosystemId | "" {
    let best: { id: EcosystemId; share: number; rank: number } | null = null
    for (const e of ecos) {
        const share = languageShare(f, ...ECO_LANGUAGES[e.id])
        const rank = SPECIFIC.indexOf(e.id)
        if (share >= 0.3 && (!best || share > best.share + 0.01 || (Math.abs(share - best.share) <= 0.01 && rank < best.rank))) best = { id: e.id, share, rank }
    }
    return best?.id ?? ""
}

/** Evidence a built template holds: computed paragraphs, tables and slots. None means an empty report. */
export function hasEvidence(blocks: Block[]): boolean {
    const t = tally(blocks)
    return t.readings + t.tables + t.slots > 0
}

/** What a built template holds, counted for the gallery's summary line. */
export function tally(blocks: Block[]) {
    let sections = 0, readings = 0, tables = 0, figures = 0, slotTables = 0, prompts = 0, explanations = 0
    for (const b of blocks) {
        if (!isCell(b)) {
            if (b.kind === "h2") sections++
            if (!b.text && b.prompt) prompts++
            if (b.kind === "p" && b.text && !b.prompt) explanations++
            continue
        }
        const s = b.cell.spec
        if (s.type === "reading") readings++
        else if (s.type === "slot") { if (s.kind === "table") slotTables++; else figures++ }
        else tables++
    }
    /** figures and slotTables are taken from the views; slots counts both. */
    return { sections, readings, tables, figures, slotTables, slots: figures + slotTables, prompts, explanations }
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
        // The template's own explanations stay explanations; only the writer's paragraphs become prompts.
        if (opts.promptParagraphs && t.kind === "p" && t.text.trim() && !t.explain) out.push({ id: newId(), kind: "p", text: "", prompt: plainText(t.text) })
        else if (t.text.trim() || t.prompt || t.kind === "hr") out.push({ ...t, id: newId() })
    }
    return out
}

/** A saved template's blocks for a new report: fresh ids, nothing run; its explanations only when asked for. */
export function fromSaved(t: SavedTemplate, explain = true): Block[] {
    const blocks: Block[] = t.blocks.filter(b => explain || isCell(b) || !b.explain).map(b => (isCell(b) ? { ...b, id: newId(), cell: { ...b.cell, output: null, ranOn: null } as Cell } : { ...b, id: newId() }))
    const last = blocks[blocks.length - 1]
    if (!last || isCell(last)) blocks.push({ id: newId(), kind: "p", text: "" })
    return blocks
}
