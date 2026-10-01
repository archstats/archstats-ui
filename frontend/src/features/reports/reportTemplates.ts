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
import { NOT_BOT_SQL } from "~/features/git/authors"
import { ECOSYSTEM } from "./ecosystemTemplates"
import { MOBILE } from "./mobileTemplates"
import { isCell, newId, plainText, type Block, type Cell, type CellSpec, type TextBlock } from "./reportDoc"
import { languageShare, prodFile, type Ecosystem, type EcosystemId, type SnapshotFacts } from "./readings"
import {
    ABOUT, age, churn, coupling, folderPicture, glance, hasModules, hasUnits, health, hotspots, knowledge, lanes, libraries, lit, modules, needs, opt, prod, REACHED, rules,
    SHOWS, slotOf, SQL, structure, tests, VIEWS, Writer, type ReportTemplate, type TemplateContext,
} from "./templateKit"
import { t } from "~/shared/i18n"

export type { ReportTemplate, TemplateContext, TemplateParam } from "./templateKit"
export { Writer } from "./templateKit"

// ── How to read the figures ───────────────────────────────────────────────

const READ = {
    matrix: t("reports.reportTemplates.dependencyMatrixEachRow"),
    dms: t("reports.reportTemplates.mainSequencePlotPlaces"),
    ageTreemap: t("reports.reportTemplates.treemapEachRectangleComponent"),
    nesting: t("reports.reportTemplates.treemapEachRectangleFile"),
    churnTreemap: t("reports.reportTemplates.treemapEachRectangleComponent2"),
    instabilityTreemap: t("reports.reportTemplates.treemapEachRectangleComponent3"),
    plotChurnHealth: t("reports.reportTemplates.plotPlacesEachComponent"),
    plotChurnComplexity: t("reports.reportTemplates.plotPlacesEachComponent4"),
    plotBetweenness: t("reports.reportTemplates.plotPlacesEachComponent2"),
    plotAuthors: t("reports.reportTemplates.plotPlacesEachComponent3"),
    plotAge: t("reports.reportTemplates.plotPlacesEachComponent5"),
    activity: t("reports.reportTemplates.chartShowsLinesAdded2"),
    commitColumns: t("reports.reportTemplates.eachColumnMonthS"),
    calendar: t("reports.reportTemplates.calendarShowsLastYear"),
    outline: t("reports.reportTemplates.outlineListsFoldersTree"),
    changes: t("reports.reportTemplates.changesViewComparesSnapshot"),
    combined: t("reports.reportTemplates.graphShowsComponentNeighbours"),
    cochangeGraph: t("reports.reportTemplates.graphLinksFoldersWhose"),
    tangle: t("reports.reportTemplates.tangleDrawnLevelsTop"),
    dependents: t("reports.reportTemplates.eachBarComponentLong"),
    roots: t("reports.reportTemplates.eachBarTopLevel"),
    languages: t("reports.reportTemplates.eachBarLanguageFile"),
    foldersHealth: t("reports.reportTemplates.mapShowsEveryFile"),
    foldersChurn: t("reports.reportTemplates.mapShowsEveryFile2"),
    foldersRole: t("reports.reportTemplates.mapShowsEveryFile3"),
    effort: t("reports.reportTemplates.eachColumnOneMonth"),
    authorsBars: t("reports.reportTemplates.eachBarPersonLong"),
    externalImports: t("reports.reportTemplates.eachBarOutsidePackage"),
    largestTypes: t("reports.reportTemplates.eachBarOneLargest"),
    hotspotFiles: t("reports.reportTemplates.eachBarFileLong"),
}

/**
 * The main-sequence plot, where abstractness says something. Code without a
 * single interface or abstract class (most Python and JavaScript) sits on its
 * bottom edge; there the plot of what sits between the others says more.
 */
function mainSequence(w: Writer) {
    if (w.facts.abstractComponents === 0) { w.explainSlot(READ.plotBetweenness); slotOf(w, "figure", t("reports.reportTemplates.whatSitsBetweenOthers"), VIEWS.plot("betweenness-churn", t("reports.reportTemplates.betweennessVsChurn"))); return }
    w.explainSlot(READ.dms)
    slotOf(w, "figure", t("reports.reportTemplates.mainSequence"), VIEWS.plot("dms", t("reports.reportTemplates.distanceMainSequence")))
}

/** The largest tangle in levels with its cut plan, and the smallest cycles as paths. */
function tangles(w: Writer, rows = 10) {
    w.explain(ABOUT.structure).reading("structure")
    w.sql(t("reports.reportTemplates.tanglesLargestFirst"), SQL.tangles, rows)
    w.explainSlot(READ.tangle)
    w.exhibit("tangle", {}, t("reports.reportTemplates.largestTangleCutsUndo"))
    w.exhibit("cycles", {}, t("reports.reportTemplates.smallestCyclesPaths"))
}

/** How a team's work has run: commits per month, who made them, and how far the work moved. */
function workOverTime(w: Writer, o: { lines?: boolean; moved?: boolean; people?: boolean } = {}) {
    if (o.lines) { w.explainSlot(READ.activity); slotOf(w, "figure", t("reports.reportTemplates.linesAddedRemovedMonth"), VIEWS.activity) }
    else { w.explainSlot(READ.commitColumns); w.exhibit("activity", {}, t("reports.reportTemplates.commitsPerMonth")) }
    if (o.people) { w.explainSlot(READ.authorsBars); w.exhibit("authors", { since: "a year" }, t("reports.reportTemplates.whoMadeCommitsLast")) }
    if (o.moved) { w.explainSlot(SHOWS.workMoved); slotOf(w, "figure", t("reports.reportTemplates.whereWorkMoved"), VIEWS.workMoved("365")) }
}

// ── General ───────────────────────────────────────────────────────────────

const GENERAL: ReportTemplate[] = [
    {
        id: "architecture-review",
        name: t("reports.reportTemplates.architectureReview"),
        audience: t("reports.reportTemplates.architectureBoardTechLead"),
        summary: t("reports.reportTemplates.fullReviewHowCodebase2"),
        when: t("reports.reportTemplates.useWhenSomeoneNeeds"),
        title: ws => t("reports.reportTemplates.architectureReview2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.startTwoThreeSentences"))
            w.section(t("reports.reportTemplates.systemGlance"), true, () => {
                glance(w)
                w.explainSlot(READ.roots)
                w.exhibit("recipe", { recipe: "roots" }, t("reports.reportTemplates.topLevelAreasSize"))
                w.explainSlot(READ.languages)
                w.exhibit("recipe", { recipe: "size-by-extension" }, t("reports.reportTemplates.codeLanguage"))
            })
            w.section(t("reports.reportTemplates.structureHowPartsDepend"), true, () => {
                w.explain(ABOUT.structure).reading("structure")
                w.explainSlot(SHOWS.stack)
                w.exhibit("stack", {}, t("reports.reportTemplates.codebaseFloors"))
                w.explainSlot(READ.matrix)
                slotOf(w, "table", t("reports.reportTemplates.dependencyMatrixLevels"), VIEWS.matrix(f))
                w.prompt(t("reports.reportTemplates.compareLayeringTeamIntends2"))
            })
            w.section(t("reports.reportTemplates.tanglesCutsUndoThem"), needs.tangles(f), () => {
                w.explain(QABOUT.tangles)
                w.sql(t("reports.reportTemplates.tanglesLargestFirst"), SQL.tangles, 10)
                w.explainSlot(READ.tangle)
                w.exhibit("tangle", {}, t("reports.reportTemplates.largestTangleCutsUndo"))
                w.exhibit("cycles", {}, t("reports.reportTemplates.smallestCyclesPaths"))
                w.prompt(t("reports.reportTemplates.whichTangleMattersMost"))
            })
            w.section(t("reports.reportTemplates.couplingCodeEverythingLeans"), true, () => {
                coupling(w, 10)
                w.explainSlot(READ.dependents)
                w.exhibit("ranking", { measure: "most dependents" }, t("reports.reportTemplates.mostDependedComponents"))
                mainSequence(w)
                if (f.componentColumns.has("modularity__instability")) { w.explain(QABOUT.unstableCore); w.sql(t("reports.reportTemplates.dependedYetDependingMuch"), QSQL.unstableCore(f), 15) }
            })
            w.section(t("reports.reportTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section(t("reports.reportTemplates.hotspotsComplicatedCodeChanges"), needs.git(f), () => {
                hotspots(w, "files", 12)
                w.explainSlot(READ.churnTreemap)
                slotOf(w, "figure", t("reports.reportTemplates.churnAgainstHealthComponent"), VIEWS.treemap("churn", "components", t("reports.reportTemplates.churnAgainstHealthComponents")))
                if (f.componentColumns.has("codesmells__static_complexity_score")) { w.explainSlot(READ.plotChurnComplexity); slotOf(w, "figure", t("reports.reportTemplates.churnAgainstComplexity"), VIEWS.plot("churn-complexity", t("reports.reportTemplates.churnAgainstComplexity"))) }
            })
            w.section(t("reports.reportTemplates.codeHealth"), needs.health(f), () => {
                health(w, "components", 10)
                w.explainSlot(READ.foldersHealth)
                w.exhibit("folders", { by: "health" }, t("reports.reportTemplates.codeHealthAcrossFolders"))
                w.sql(t("reports.reportTemplates.largestProductionFiles"), QSQL.largestFiles(f), 12)
            })
            w.section(t("reports.reportTemplates.whereWorkHasGone"), needs.git(f), () => {
                churn(w, "180")
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", t("reports.reportTemplates.whereWorkMoved"), VIEWS.workMoved("365"))
                w.explainSlot(READ.effort)
                slotOf(w, "figure", t("reports.reportTemplates.whereEachMonthS"), VIEWS.effort)
                w.prompt(t("reports.reportTemplates.doesWorkGoWhere"))
            })
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Findings", true, () => w.prompt(t("reports.reportTemplates.twoThreeThingsReader")))
            w.section("Recommendations", true, () => w.prompt(t("reports.reportTemplates.whatYouProposeMost")))
        },
    },
    {
        id: "executive-summary",
        name: t("reports.reportTemplates.executiveSummary"),
        audience: t("reports.reportTemplates.leadershipOnePage"),
        summary: t("reports.reportTemplates.shortSummaryPeopleWho"),
        when: t("reports.reportTemplates.useWhenYouNeed"),
        title: ws => t("reports.reportTemplates.summary", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.oneSentenceReadIf"))
            // For leadership: one short note on the terms instead of one per paragraph, and few figures.
            w.section(t("reports.reportTemplates.systemNumbers"), true, () => {
                w.explain(QABOUT.execTerms)
                // Names read as plain words here: leadership does not read package paths.
                const plain = { plain: "1" }
                w.reading("size", plain)
                if (f.commits) w.reading("history", plain)
                w.reading("structure", plain)
            })
            w.section(t("reports.reportTemplates.whereEffortGoes"), needs.git(f), () => {
                const plain = { plain: "1" }
                w.reading("churn", { days: "90", ...plain })
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", t("reports.reportTemplates.whereWorkMovedYear"), VIEWS.workMoved("365"))
                w.reading("knowledge", plain)
            })
            w.section(t("reports.reportTemplates.whatMeans"), true, () => w.prompt(t("reports.reportTemplates.translateNumbersBusinessTerms")))
            w.section(t("reports.reportTemplates.whatWeAsk"), true, () => w.prompt(t("reports.reportTemplates.decisionInvestmentYouAsking")))
        },
    },
    {
        id: "due-diligence",
        name: t("reports.reportTemplates.technicalDueDiligence"),
        audience: t("reports.reportTemplates.acquisitionInvestment"),
        summary: t("reports.reportTemplates.outsideAssessmentSomeoneDeciding2"),
        when: t("reports.reportTemplates.useWhenReaderNot"),
        title: ws => t("reports.reportTemplates.technicalDueDiligence2", { ws }),
        build(w) {
            const f = w.facts
            w.section("Scope", true, () => {
                w.prompt(t("reports.reportTemplates.whatWasScannedRepositories"))
                w.explain(ABOUT.size).reading("size")
                w.explainSlot(READ.languages)
                w.exhibit("recipe", { recipe: "size-by-extension" }, t("reports.reportTemplates.codeLanguage"))
                w.explainSlot(READ.foldersRole)
                w.exhibit("folders", { by: "role" }, t("reports.reportTemplates.whatRepositoryHolds"))
            })
            w.section(t("reports.reportTemplates.historyTeam"), needs.git(f), () => {
                w.explain(ABOUT.history).reading("history")
                workOverTime(w, { lines: true, people: true })
                knowledge(w, { map: true })
                w.explain(QABOUT.busFactor)
                w.sql(t("reports.reportTemplates.componentsDependOnePerson"), QSQL.busFactor(f), 15)
            })
            w.section("Structure", true, () => {
                structure(w, false)
                if (hasModules(f)) modules(w)
                folderPicture(w, "chord", t("reports.reportTemplates.howFoldersLeanEach"))
                mainSequence(w)
                if (f.tangles) { w.explainSlot(READ.tangle); w.exhibit("tangle", {}, t("reports.reportTemplates.largestTangleCutsUndo")) }
            })
            w.section("Maintainability", needs.health(f), () => {
                health(w, null)
                age(w)
                w.table("f-health", 10)
                if (f.fileColumns.has("git__last_change_age_in_days")) { w.explainSlot(READ.ageTreemap); slotOf(w, "figure", t("reports.reportTemplates.codeAge"), VIEWS.treemap("age", "components", t("reports.reportTemplates.codeAgeComponents"))) }
                w.explainSlot(READ.largestTypes)
                if (f.tables.has("units")) w.exhibit("recipe", { recipe: "largest-classes" }, t("reports.reportTemplates.largestClassesTypes"))
            })
            w.section(t("reports.reportTemplates.thirdPartyDependencies"), needs.snippets(f), () => {
                libraries(w)
                w.explainSlot(READ.externalImports)
                w.exhibit("recipe", { recipe: "external-imports" }, t("reports.reportTemplates.outsidePackagesImportedMost"))
            })
            w.section(t("reports.reportTemplates.howShips"), f.tables.has("deployables") ? true : t("reports.reportTemplates.scanDidNotLook"), () => {
                w.explain(QABOUT.ships)
                w.exhibit("deployables", {}, t("reports.reportTemplates.whatShipsWhatBuilds"))
            })
            w.section("Tests", needs.tests(f), () => {
                tests(w)
                if (needs.testFiles(f) === true) w.sql(t("reports.reportTemplates.productionComponentsNoTest"), QSQL.untested(f), 15)
            })
            w.section("Risks", true, () => w.prompt(t("reports.reportTemplates.eachRiskEvidenceAbove")))
        },
    },
    {
        id: "onboarding",
        name: t("reports.reportTemplates.onboardingGuide"),
        audience: t("reports.reportTemplates.developersNewCode"),
        summary: t("reports.reportTemplates.guidedTourSomeoneJoining2"),
        when: t("reports.reportTemplates.useWhenNewDeveloper"),
        title: ws => t("reports.reportTemplates.gettingKnow", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whoGuideWhatThey"))
            w.section(t("reports.reportTemplates.whatHere"), true, () => {
                w.explain(ABOUT.size).reading("size")
                w.explainSlot(READ.roots)
                w.exhibit("recipe", { recipe: "roots" }, t("reports.reportTemplates.topLevelAreas"))
                if (hasModules(f)) modules(w)
                w.sql(t("reports.reportTemplates.largestComponents"), SQL.largest(f), 10)
                if (hasUnits(f)) lanes(w, t("reports.reportTemplates.mapCode"))
                else { w.explainSlot(READ.outline); slotOf(w, "table", t("reports.reportTemplates.codebaseDirectory"), VIEWS.outline) }
            })
            w.section(t("reports.reportTemplates.howHangsTogether"), true, () => {
                coupling(w)
                folderPicture(w, "graph", t("reports.reportTemplates.foldersTheirImports"))
                w.prompt(t("reports.reportTemplates.areasNewcomerShouldKnow"))
            })
            w.section(t("reports.reportTemplates.codeEverythingUses"), true, () => {
                w.explain(QABOUT.loadBearing)
                w.exhibit("ranking", { measure: "most dependents" }, t("reports.reportTemplates.mostDependedComponents"))
                if (f.tables.has("unit_connections")) w.exhibit("recipe", { recipe: "shared-types" }, t("reports.reportTemplates.typesUsedMostPlaces"))
                w.prompt(t("reports.reportTemplates.topFewWhatThey"))
            })
            w.section(t("reports.reportTemplates.whereWork"), needs.git(f), () => {
                churn(w, "90")
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", t("reports.reportTemplates.whereWorkMovedLast"), VIEWS.workMoved("90"))
                w.table("f-churn", 10)
            })
            w.section(t("reports.reportTemplates.whoKnowsWhat"), needs.git(f), () => { knowledge(w, { map: true }); w.prompt(t("reports.reportTemplates.whoAskAboutWhich")) })
            w.section(t("reports.reportTemplates.handleCare"), needs.git(f), () => {
                w.explain(ABOUT.hotspots).reading("hotspots")
                w.explainSlot(READ.hotspotFiles)
                w.exhibit("ranking", { measure: "most hotspot", among: "files" }, t("reports.reportTemplates.hottestFiles"))
                w.prompt(t("reports.reportTemplates.partsTendBiteWhy"))
            })
        },
    },
    {
        id: "refactoring-case",
        name: t("reports.reportTemplates.refactoringCase"),
        audience: t("reports.reportTemplates.caseReworkingOneComponent"),
        summary: t("reports.reportTemplates.makesCaseReworkingSingle2"),
        when: t("reports.reportTemplates.useWhenYouWant3"),
        params: [{ id: "component", label: t("reports.reportTemplates.component"), kind: "component" }],
        title: (ws, p) => t("reports.reportTemplates.refactoring", { value: p.component || t("reports.reportTemplates.component2") }),
        build(w, { params }) {
            const f = w.facts
            const c = params.component
            w.prompt(t("reports.reportTemplates.changeYouProposeComponent"))
            w.section(t("reports.reportTemplates.componentToday"), true, () => {
                w.reading("focus", { component: c })
                if (c) { w.exhibit("profile", { of: c }, t("reports.reportTemplates.numbers", { c })); slotOf(w, "figure", t("reports.reportTemplates.neighbours", { c }), VIEWS.focus(c)) }
            })
            w.section(t("reports.reportTemplates.whatMade"), needs.component(c), () => {
                w.explain(t("reports.reportTemplates.tableListsComponentS"))
                w.sql(t("reports.reportTemplates.files", { c }), SQL.filesOf(c), 20)
                w.exhibit("ranking", { measure: "least health", among: "files", of: c }, t("reports.reportTemplates.leastHealthyFiles", { c }))
            })
            w.section(t("reports.reportTemplates.whyNowHistory"), needs.all(needs.git(f), needs.component(c)), () => {
                w.explainSlot(READ.commitColumns)
                w.exhibit("activity", { of: c }, t("reports.reportTemplates.commitsPerMonthTouching", { c }))
                w.explainSlot(READ.authorsBars)
                w.exhibit("authors", { of: c }, t("reports.reportTemplates.whoHasWorked", { c }))
                w.prompt(t("reports.reportTemplates.whatHistoryHealthSay"))
            })
            w.section(t("reports.reportTemplates.whatDepends"), needs.component(c), () => {
                w.explain(ABOUT.coupling)
                w.exhibit("neighbours", { of: c }, t("reports.reportTemplates.whatUsesWhatUses", { c }))
                w.sql(t("reports.reportTemplates.componentsImport", { c }), SQL.dependentsOf(c), 15).sql(t("reports.reportTemplates.whatImports", { c }), SQL.dependenciesOf(c), 15)
                if (f.tangles) { w.explainSlot(READ.tangle); w.exhibit("tangle", { of: c }, t("reports.reportTemplates.tangleAround", { c })) }
            })
            w.section(t("reports.reportTemplates.whatChanges"), needs.all(needs.component(c), needs.coChange(f)), () => {
                w.explain(QABOUT.coChange)
                w.exhibit("cochange", { of: c }, t("reports.reportTemplates.whatChangesSameCommits", { c }))
            })
            w.section(t("reports.reportTemplates.costRisk"), true, () => w.prompt(t("reports.reportTemplates.howMuchWorkWho")))
            w.section("Plan", true, () => w.prompt(t("reports.reportTemplates.stepsOrderEachSmall")))
        },
    },
    {
        id: "debt-register",
        name: t("reports.reportTemplates.technicalDebtRegister"),
        audience: t("reports.reportTemplates.teamSBacklog"),
        summary: t("reports.reportTemplates.listsTechnicalDebtSnapshot2"),
        when: t("reports.reportTemplates.useWhenYouWant"),
        title: ws => t("reports.reportTemplates.technicalDebt", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.howItemsWereChosen"))
            w.section("Hotspots", needs.git(f), () => {
                hotspots(w, "files", 15)
                if (f.componentColumns.has("codesmells__code_health")) { w.explainSlot(READ.plotChurnHealth); slotOf(w, "figure", t("reports.reportTemplates.churnAgainstCodeHealth"), VIEWS.plot("churn-health", t("reports.reportTemplates.churnAgainstHealth"))) }
            })
            w.section(t("reports.reportTemplates.effortGoingUnhealthyCode"), needs.all(needs.git(f), needs.health(f)), () => {
                w.explain(QABOUT.interest)
                w.exhibit("recipe", { recipe: "unhealthy-changing" }, t("reports.reportTemplates.whereEffortGoesUnhealthy"))
                w.explainSlot(READ.effort)
                slotOf(w, "figure", t("reports.reportTemplates.whereEachMonthS"), VIEWS.effort)
            })
            w.section(t("reports.reportTemplates.hardChangeFiles"), needs.health(f), () => {
                health(w, "files", 15)
                w.explainSlot(READ.nesting)
                slotOf(w, "figure", t("reports.reportTemplates.nestingDepth"), VIEWS.treemap("nesting", "files", t("reports.reportTemplates.nestingDepthFiles")))
                if (f.tables.has("units")) { w.explainSlot(READ.largestTypes); w.exhibit("recipe", { recipe: "largest-classes" }, t("reports.reportTemplates.largestClassesTypes")) }
            })
            w.section(t("reports.reportTemplates.circularDependencies"), needs.tangles(f), () => tangles(w, 20))
            w.section(t("reports.reportTemplates.brokenDependencyRules"), needs.rules(f), () => rules(w))
            w.section(t("reports.reportTemplates.largeCodeNobodyHas"), needs.age(f), () => {
                w.explain(ABOUT.age)
                w.sql(t("reports.reportTemplates.productionFilesUnchangedOver"), QSQL.untouched(f), 15)
            })
            w.section(t("reports.reportTemplates.register"), true, () => w.prompt(t("reports.reportTemplates.perItemOwnerWhat")))
        },
    },
    {
        id: "ownership",
        name: t("reports.reportTemplates.ownershipKnowledge"),
        audience: t("reports.reportTemplates.engineeringManagers"),
        summary: t("reports.reportTemplates.showsHowKnowledgeCode2"),
        when: t("reports.reportTemplates.useWhenPlanningTeam"),
        title: ws => t("reports.reportTemplates.ownership", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whyOwnershipBeingLooked"))
            w.section("History", needs.git(f), () => { w.explain(ABOUT.history).reading("history"); workOverTime(w, { people: true }) })
            w.section(t("reports.reportTemplates.howConcentratedKnowledge"), needs.git(f), () => {
                // The map, not the table: the table's eight columns print a word to a line.
                knowledge(w, { map: true })
                w.explain(QABOUT.busFactor)
                w.sql(t("reports.reportTemplates.componentsDependOnePerson"), QSQL.busFactor(f), 20)
                w.explainSlot(READ.plotAuthors)
                slotOf(w, "figure", t("reports.reportTemplates.authorsAgainstChurn"), VIEWS.plot("authors-churn", t("reports.reportTemplates.authorsVsChurn")))
            })
            w.section(t("reports.reportTemplates.whereChangeLands"), needs.git(f), () => {
                churn(w, "180")
                w.explainSlot(READ.foldersChurn)
                w.exhibit("folders", { by: "churn" }, t("reports.reportTemplates.whereCommitsLand"))
                w.sql(t("reports.reportTemplates.changeComponentLast180"), SQL.churn("180"), 12)
            })
            w.section(t("reports.reportTemplates.risksActions"), true, () => w.prompt(t("reports.reportTemplates.whereOnePersonLeaving")))
        },
    },
    {
        id: "dependency-audit",
        name: t("reports.reportTemplates.dependencyAudit"),
        audience: t("reports.reportTemplates.platformSecurityReview"),
        summary: t("reports.reportTemplates.reviewsWhatCodeDepends2"),
        when: t("reports.reportTemplates.useBeforeMajorUpgrade"),
        title: ws => t("reports.reportTemplates.dependencyAudit2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whatPromptedAuditWhat"))
            w.section(t("reports.reportTemplates.thirdPartyLibraries"), needs.snippets(f), () => {
                libraries(w)
                w.explainSlot(READ.externalImports)
                w.exhibit("recipe", { recipe: "external-imports" }, t("reports.reportTemplates.outsidePackagesImportedMost"))
            })
            w.section(t("reports.reportTemplates.whatScanCouldNot"), f.tables.has("unresolved_edges") ? true : t("reports.reportTemplates.scanDoesNotRecord"), () => {
                w.explain(QABOUT.unresolved)
                w.exhibit("recipe", { recipe: "unresolved-imports" }, t("reports.reportTemplates.importsScanCouldNot"))
            })
            w.section(t("reports.reportTemplates.buildModules"), needs.modules(f), () => {
                modules(w, SQL.modules)
                w.exhibit("recipe", { recipe: "modules-deps" }, t("reports.reportTemplates.whichModulesDependWhich"))
            })
            w.section(t("reports.reportTemplates.betweenCodeSOwn"), true, () => {
                coupling(w)
                structure(w, false)
                w.exhibit("recipe", { recipe: "propagation-cost" }, t("reports.reportTemplates.howFarChangeRipples"))
                folderPicture(w, "chord", t("reports.reportTemplates.howFoldersLeanEach"))
                if (f.tables.has("component_connections_direct")) w.exhibit("recipe", { recipe: "edge-kinds" }, t("reports.reportTemplates.howComponentsConnected"))
            })
            w.section(t("reports.reportTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section("Actions", true, () => w.prompt(t("reports.reportTemplates.librariesUpgradeReplaceRemove")))
        },
    },
    {
        id: "modularization",
        name: t("reports.reportTemplates.modularizationPlan"),
        audience: t("reports.reportTemplates.splittingMonolith"),
        summary: t("reports.reportTemplates.plansHowSplitOne2"),
        when: t("reports.reportTemplates.useWhenTeamsKeep"),
        title: ws => t("reports.reportTemplates.modularizing", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.goalWhatPartsShould"))
            w.section(t("reports.reportTemplates.whereStands"), true, () => {
                w.explain(ABOUT.size).reading("size")
                w.explainSlot(READ.roots)
                w.exhibit("recipe", { recipe: "roots" }, t("reports.reportTemplates.topLevelAreasSize"))
                w.explain(ABOUT.structure).reading("structure")
                folderPicture(w, "graph", t("reports.reportTemplates.foldersTheirImports"))
            })
            w.section(t("reports.reportTemplates.whatHoldsTogether"), true, () => {
                coupling(w, 10)
                w.explainSlot(READ.matrix)
                slotOf(w, "table", t("reports.reportTemplates.dependencyMatrixLevels"), VIEWS.matrix(f))
                if (f.tangles) { w.sql("Tangles", SQL.tangles, 10); w.explainSlot(READ.tangle); w.exhibit("tangle", {}, t("reports.reportTemplates.largestTangleCutsUndo")) }
                w.explain(QABOUT.twoWay)
                w.exhibit("recipe", { recipe: "mutual-pairs" }, t("reports.reportTemplates.pairsComponentsImportEach"))
            })
            w.section(t("reports.reportTemplates.whatChangesTogether"), needs.coChange(f), () => {
                w.explainSlot(SHOWS.breadth)
                slotOf(w, "figure", t("reports.reportTemplates.howFarChangeReaches"), VIEWS.breadth)
                w.explainSlot(READ.cochangeGraph)
                slotOf(w, "figure", t("reports.reportTemplates.foldersChangeTogether"), VIEWS.cochangeGraph)
                w.explain(QABOUT.hidden)
                w.exhibit("cochange", { hidden: true }, t("reports.reportTemplates.changeTogetherNoImport"))
            })
            w.section(t("reports.reportTemplates.candidateModules"), true, () => { w.prompt(t("reports.reportTemplates.modulesYouProposeWhat2")) })
            w.section("Sequence", true, () => w.prompt(t("reports.reportTemplates.whatCutFirstWhy2")))
        },
    },
    {
        id: "check-in",
        name: t("reports.reportTemplates.healthCheck"),
        audience: t("reports.reportTemplates.recurringReview"),
        summary: t("reports.reportTemplates.healthCheckSameSections"),
        when: t("reports.reportTemplates.useRegularReviewTeam"),
        title: ws => `Check-in: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.periodCoversWhatChanged"))
            w.section("Shape", true, () => { w.explain(ABOUT.size).reading("size"); w.explain(ABOUT.structure).reading("structure") })
            w.section("Change", needs.git(f), () => {
                churn(w, "90")
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", t("reports.reportTemplates.whereWorkMovedLast"), VIEWS.workMoved("90"))
                hotspots(w, "components", 8)
            })
            w.section("Health", needs.health(f), () => {
                health(w, null)
                age(w)
                if (f.commits) { w.explainSlot(READ.effort); slotOf(w, "figure", t("reports.reportTemplates.whereEachMonthS"), VIEWS.effort) }
            })
            w.section("Rules", needs.rules(f), () => w.explain(ABOUT.rules).reading("rules"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section(t("reports.reportTemplates.sinceLastTime"), true, () => { w.explain(ABOUT.trends); slotOf(w, "figure", "Trends", VIEWS.trends); w.explainSlot(READ.changes); slotOf(w, "table", t("reports.reportTemplates.whatChangedSinceLast"), VIEWS.changes); w.prompt(t("reports.reportTemplates.whatMovedWhetherMoved")) })
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
    largestFiles: (f: SnapshotFacts) => `SELECT name, complexity__lines AS lines${f.fileColumns.has("codesmells__code_health") ? `, round(codesmells__code_health, 1) AS health` : ""}${f.fileColumns.has("git__commits__last_180_days") ? `, git__commits__last_180_days AS "commits, 180 d"` : ""} FROM files WHERE ${prodFile(f)} ORDER BY lines DESC, name`,
    // Depended on by many, while depending on much itself: a change from below ripples up through it.
    unstableCore: (f: SnapshotFacts) => `SELECT name, modularity__coupling__dependents AS dependents, modularity__coupling__dependencies AS dependencies, round(modularity__instability, 2) AS instability${opt(f, "git__commits__last_180_days", `git__commits__last_180_days AS "commits, 180 d"`)} FROM components WHERE ${prod(f, "name")} AND modularity__coupling__dependents >= 5 AND modularity__instability >= 0.5 ORDER BY modularity__coupling__dependents * modularity__instability DESC, name`,
    untestedShared: (f: SnapshotFacts) => `SELECT name, modularity__coupling__dependents AS dependents, complexity__lines AS lines${opt(f, "git__commits__last_180_days", `git__commits__last_180_days AS "commits, 180 d"`)} FROM components WHERE ${prod(f, "name")} AND name NOT IN ${REACHED} AND modularity__coupling__dependents >= 5 ORDER BY dependents DESC, name`,
    // One person behind most of a component's commits, among components with enough history to say.
    busFactor: (f: SnapshotFacts) => `WITH c AS (SELECT component, author_name AS a, count(DISTINCT commit_hash) AS n, max(commit_time) AS last FROM git_commits WHERE coalesce(component, '') <> '' AND ${NOT_BOT_SQL} GROUP BY 1, 2), t AS (SELECT component, sum(n) AS total, max(n) AS top, count(*) AS people, max(last) AS last FROM c GROUP BY 1) SELECT component, total AS commits, people AS "people who committed", CAST(round(100.0 * top / total) AS INTEGER) AS "% by the top committer", substr(last, 1, 10) AS "last commit" FROM t WHERE total >= 10 AND ${prod(f, "component")} ORDER BY 1.0 * top / total DESC, total DESC`,
}

const QABOUT = {
    execTerms: t("reports.reportTemplates.shortProductionCodeCode"),
    impact: t("reports.reportTemplates.changeComponentCanBreak"),
    coChange: t("reports.reportTemplates.gitAlsoShowsWhich"),
    hidden: t("reports.reportTemplates.twoComponentsCoupledWhen2"),
    loadBearing: t("reports.reportTemplates.loadBearingComponentOne2"),
    testGaps: t("reports.reportTemplates.testsSafetyNetChange"),
    cleanup: t("reports.reportTemplates.codeNobodyUsesStill"),
    twoWay: t("reports.reportTemplates.whenTwoComponentsImport2"),
    recent: t("reports.reportTemplates.reportLooksOnlyLast"),
    tangles: t("reports.reportTemplates.tangleGroupComponentsAll"),
    unstableCore: t("reports.reportTemplates.instabilityRuns0Others"),
    untestedShared: t("reports.reportTemplates.bugSharedCodeReaches"),
    busFactor: t("reports.reportTemplates.tableListsComponentsLeast"),
    interest: t("reports.reportTemplates.effortGoesHardChange"),
    unresolved: t("reports.reportTemplates.someImportsPointCode"),
    ships: "A *deployable* is something that ships on its own: a service, an app, a function, a library that is published. The table lists the ones the scan found, what builds each one, and how much of the code it holds.",
}

// ── Quick wins ────────────────────────────────────────────────────────────
// Short reports around one question, each ending in a list someone can act on.

const QUICK: ReportTemplate[] = [
    {
        id: "change-impact",
        icon: "network",
        name: t("reports.reportTemplates.changeImpact"),
        audience: t("reports.reportTemplates.beforeChangingOneComponent"),
        summary: t("reports.reportTemplates.answersWhatCouldBreak2"),
        when: t("reports.reportTemplates.useBeforeRiskyChange"),
        params: [{ id: "component", label: t("reports.reportTemplates.component"), kind: "component" }],
        title: (ws, p) => t("reports.reportTemplates.changingWhatAffects", { value: p.component || t("reports.reportTemplates.component2") }),
        build(w, { params }) {
            const f = w.facts
            const c = params.component
            w.prompt(t("reports.reportTemplates.changeYouPlanMake"))
            w.section(t("reports.reportTemplates.component3"), true, () => {
                w.reading("focus", { component: c })
                if (c) { w.explainSlot(READ.combined); slotOf(w, "figure", t("reports.reportTemplates.importsCoChange", { c }), VIEWS.combined(c)) }
            })
            w.section(t("reports.reportTemplates.whatDepends"), needs.all(needs.component(c), needs.reach(f)), () => {
                w.explain(QABOUT.impact)
                w.sql(t("reports.reportTemplates.howFarChangeCan", { c }), QSQL.reachBySteps(f, c), 20)
                w.sql(t("reports.reportTemplates.componentsDepend", { c }), QSQL.reachOf(f, c), 30)
            })
            w.section(t("reports.reportTemplates.whatChanges"), needs.all(needs.component(c), needs.coChange(f)), () => {
                w.explain(QABOUT.coChange)
                w.sql(t("reports.reportTemplates.componentsChangeSameCommits", { c }), QSQL.changesWith(f, c), 10)
            })
            w.section(t("reports.reportTemplates.whoHasWorked2"), needs.all(needs.component(c), needs.git(f)), () => {
                w.explainSlot(READ.authorsBars)
                w.exhibit("authors", { of: c }, t("reports.reportTemplates.whoHasWorked", { c }))
            })
            w.section(t("reports.reportTemplates.testsReach"), needs.all(needs.component(c), needs.tests(f), needs.testFiles(f)), () => w.sql(t("reports.reportTemplates.testFilesReach", { c }), QSQL.testsOf(c), 30))
            w.section(t("reports.reportTemplates.beforeYouChange"), true, () => w.prompt(t("reports.reportTemplates.whoTellOwnersComponents")))
        },
    },
    {
        id: "hidden-coupling",
        icon: "link",
        name: t("reports.reportTemplates.hiddenCoupling"),
        audience: t("reports.reportTemplates.linksNoImportShows"),
        summary: t("reports.reportTemplates.findsPairsComponentsKeep"),
        when: t("reports.reportTemplates.useWhenChangesKeep"),
        title: ws => t("reports.reportTemplates.hiddenCoupling2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whyYouLookingHidden"))
            w.section(t("reports.reportTemplates.componentsChangeTogetherWithout"), needs.coChange(f), () => {
                w.explain(QABOUT.hidden)
                w.sql(t("reports.reportTemplates.changedTogetherNoImport"), QSQL.hidden(f), 20)
                slotOf(w, "table", t("reports.reportTemplates.hiddenCoupling"), VIEWS.hidden)
                w.prompt(t("reports.reportTemplates.topPairsWhatTies"))
            })
            w.section(t("reports.reportTemplates.betweenFolders"), needs.coChange(f), () => {
                w.explainSlot(READ.cochangeGraph)
                slotOf(w, "figure", t("reports.reportTemplates.foldersChangeTogether"), VIEWS.cochangeGraph)
            })
            w.section(t("reports.reportTemplates.howFarTypicalChange"), needs.coChange(f), () => {
                w.explainSlot(SHOWS.breadth)
                slotOf(w, "figure", t("reports.reportTemplates.howFarChangeReaches"), VIEWS.breadth)
            })
            w.section(t("reports.reportTemplates.whatDoAboutEach"), true, () => w.prompt(t("reports.reportTemplates.perPairOneThree")))
        },
    },
    {
        id: "load-bearing",
        icon: "layers",
        name: t("reports.reportTemplates.loadBearingComponents"),
        audience: t("reports.reportTemplates.protectingSharedCode"),
        summary: t("reports.reportTemplates.listsComponentsMostOther2"),
        when: t("reports.reportTemplates.useDecideWhereTests"),
        title: ws => t("reports.reportTemplates.loadBearingComponents2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whyListMattersNow"))
            w.section(t("reports.reportTemplates.mostDependedComponents"), needs.column(f, "modularity__coupling__dependents", "the scan did not count dependents per component"), () => {
                w.explain(QABOUT.loadBearing)
                w.explainSlot(READ.dependents)
                w.exhibit("ranking", { measure: "most dependents" }, t("reports.reportTemplates.mostDependedComponents"))
                w.sql(t("reports.reportTemplates.componentsHowManyOthers"), QSQL.loadBearing(f), 15)
                if (f.tables.has("unit_connections")) w.exhibit("recipe", { recipe: "shared-types" }, t("reports.reportTemplates.typesUsedMostPlaces"))
            })
            w.section(t("reports.reportTemplates.loadBearingStillMoving"), f.componentColumns.has("modularity__instability") ? true : t("reports.reportTemplates.scanDidNotMeasure"), () => {
                w.explain(QABOUT.unstableCore)
                w.sql(t("reports.reportTemplates.dependedYetDependingMuch"), QSQL.unstableCore(f), 15)
                mainSequence(w)
            })
            w.section(t("reports.reportTemplates.whatProtect"), true, () => w.prompt(t("reports.reportTemplates.topFewWhichNeed")))
        },
    },
    {
        id: "test-gaps",
        icon: "flask",
        name: t("reports.reportTemplates.whereTestsMissing"),
        audience: t("reports.reportTemplates.testPlanning"),
        summary: t("reports.reportTemplates.listsProductionComponentsNo2"),
        when: t("reports.reportTemplates.useDecideWhereWrite"),
        title: ws => t("reports.reportTemplates.testGaps", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whatPromptedIncidentPlanned"))
            w.section(t("reports.reportTemplates.testsCodebase"), needs.tests(f), () => {
                tests(w)
                w.explainSlot(READ.foldersRole)
                w.exhibit("folders", { by: "role" }, t("reports.reportTemplates.whereTestsSit"))
                w.exhibit("recipe", { recipe: "test-files-per-component" }, t("reports.reportTemplates.testFilesPerComponent"))
            })
            w.section(t("reports.reportTemplates.componentsNoTestReaches"), needs.all(needs.tests(f), needs.testFiles(f)), () => {
                w.explain(QABOUT.testGaps)
                w.sql(t("reports.reportTemplates.productionComponentsNoTest"), QSQL.untested(f), 20)
            })
            w.section(t("reports.reportTemplates.sharedCodeNoTest"), needs.all(needs.tests(f), needs.testFiles(f), needs.column(f, "modularity__coupling__dependents", "the scan did not count dependents per component")), () => {
                w.explain(QABOUT.untestedShared)
                w.sql(t("reports.reportTemplates.untestedComponentsFiveMore"), QSQL.untestedShared(f), 15)
            })
            w.section(t("reports.reportTemplates.whereStart"), true, () => w.prompt(t("reports.reportTemplates.threeFiveComponentsTest")))
        },
    },
    {
        id: "cleanup",
        icon: "trash",
        name: t("reports.reportTemplates.cleanupCandidates"),
        audience: t("reports.reportTemplates.removingUnusedCode"),
        summary: t("reports.reportTemplates.listsCodeMayNo2"),
        when: t("reports.reportTemplates.useWhenCodebaseFeels"),
        title: ws => t("reports.reportTemplates.cleanupCandidates2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whyCleanupNowWho"))
            w.section(t("reports.reportTemplates.componentsNothingImports"), needs.column(f, "modularity__coupling__dependents", "the scan did not count dependents per component"), () => {
                w.explain(QABOUT.cleanup)
                w.sql(t("reports.reportTemplates.componentsNoOtherComponent"), QSQL.unimported(f), 25)
                if (hasUnits(f)) { w.explainSlot(SHOWS.reach); slotOf(w, "figure", t("reports.reportTemplates.whatEntryPointsReach"), VIEWS.reach) }
            })
            w.section(t("reports.reportTemplates.largeFilesNobodyHas"), needs.age(f), () => {
                w.sql(t("reports.reportTemplates.productionFilesUnchangedOver"), QSQL.untouched(f), 20)
                w.explainSlot(READ.ageTreemap)
                slotOf(w, "figure", t("reports.reportTemplates.codeAge"), VIEWS.treemap("age", "components", t("reports.reportTemplates.codeAgeComponents")))
            })
            w.section(t("reports.reportTemplates.whereNothingMoves"), needs.git(f), () => {
                w.explainSlot(READ.foldersChurn)
                w.exhibit("folders", { by: "churn" }, t("reports.reportTemplates.whereCommitsLandWhere"))
            })
            w.section(t("reports.reportTemplates.whatGoes"), true, () => w.prompt(t("reports.reportTemplates.eachCandidateYouChecked")))
        },
    },
    {
        id: "two-way",
        icon: "refresh",
        name: t("reports.reportTemplates.circularDependenciesBreakFirst"),
        audience: t("reports.reportTemplates.untanglingCode"),
        summary: t("reports.reportTemplates.listsEveryPairComponents2"),
        when: t("reports.reportTemplates.useWhenYouWant2"),
        title: ws => t("reports.reportTemplates.circularDependencies2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.whyUntanglingMattersHere"))
            w.section(t("reports.reportTemplates.howTangledCode"), true, () => w.explain(ABOUT.structure).reading("structure"))
            w.section(t("reports.reportTemplates.componentsImportEachOther"), needs.tangles(f), () => {
                w.explain(QABOUT.twoWay)
                w.sql(t("reports.reportTemplates.pairsComponentsImportEach"), QSQL.twoWay(f), 20)
            })
            w.section(t("reports.reportTemplates.largestTangle"), needs.tangles(f), () => {
                w.explainSlot(READ.tangle)
                w.exhibit("tangle", {}, t("reports.reportTemplates.largestTangleCutsUndo"))
                w.exhibit("cycles", {}, t("reports.reportTemplates.smallestCyclesPaths"))
                w.explainSlot(READ.matrix)
                slotOf(w, "table", t("reports.reportTemplates.dependencyMatrixLevels"), VIEWS.matrix(f))
            })
            w.section(t("reports.reportTemplates.firstCuts"), true, () => w.prompt(t("reports.reportTemplates.pairsYouWillFix")))
        },
    },
    {
        id: "last-30-days",
        icon: "history",
        name: t("reports.reportTemplates.last30Days"),
        audience: t("reports.reportTemplates.sprintMonthlyReview"),
        summary: t("reports.reportTemplates.whatHappenedCodeLast2"),
        when: t("reports.reportTemplates.useSprintReviewMonthly"),
        title: ws => t("reports.reportTemplates.last30Days2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.reportTemplates.periodCoversWhatTeam"))
            w.section(t("reports.reportTemplates.whereChangeWent"), needs.recent(f), () => {
                w.explain(QABOUT.recent)
                churn(w, "30")
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", t("reports.reportTemplates.whereWorkMovedLast2"), VIEWS.workMoved("30"))
                w.sql(t("reports.reportTemplates.filesChangedMostLast"), QSQL.recentFiles, 15)
                w.explainSlot(READ.calendar)
                slotOf(w, "figure", t("reports.reportTemplates.commitsDay"), VIEWS.calendar)
            })
            w.section(t("reports.reportTemplates.hotspotsTouched"), needs.all(needs.recent(f), f.fileColumns.has("codesmells__hotspot_score") ? true : "the scan has no hotspot scores"), () => {
                w.explain(t("reports.reportTemplates.hotspotCodeBothComplicated"))
                w.sql(t("reports.reportTemplates.hotspotFilesChangedLast"), QSQL.recentHotspots(f), 10)
            })
            w.section(t("reports.reportTemplates.newFiles"), needs.all(needs.recent(f), f.fileColumns.has("git__age_in_days") ? true : "the scan has no file ages"), () => w.sql(t("reports.reportTemplates.productionFilesFirstCommitted"), QSQL.newFiles(f), 15))
            w.section(t("reports.reportTemplates.whatTellsUs"), true, () => w.prompt(t("reports.reportTemplates.didWorkLandWhere")))
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
    node: ["TypeScript", "JavaScript", t("reports.reportTemplates.typescriptTsx"), t("reports.reportTemplates.javascriptJsx"), "Vue", "Svelte"], react: ["TypeScript", "JavaScript", t("reports.reportTemplates.typescriptTsx"), t("reports.reportTemplates.javascriptJsx")],
    // As wide as node's, so a Vue app wins the tie with the workspace review.
    vue: ["TypeScript", "JavaScript", t("reports.reportTemplates.typescriptTsx"), t("reports.reportTemplates.javascriptJsx"), "Vue", "Svelte"],
    go: ["Go"], dotnet: ["C#"], php: ["PHP"],
    android: ["Kotlin", "Java"], ios: ["Swift", "Objective-C"], flutter: ["Dart"], kmp: ["Kotlin"],
    "react-native": ["TypeScript", "JavaScript", t("reports.reportTemplates.typescriptTsx"), t("reports.reportTemplates.javascriptJsx")],
}
/** A framework's review says more than its language's: it wins a tie. */
const SPECIFIC: EcosystemId[] = ["android", "ios", "flutter", "react-native", "spring", "django", "react", "vue", "kmp", "dotnet", "php", "go", "python", "jvm", "node"]

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
