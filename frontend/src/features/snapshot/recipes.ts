// The common queries: SQL an architect reaches for, checked against real
// snapshots (cookbook.test.ts runs every entry). A result from here is
// marked verified in the conversation, the way a trusted asset is in a
// data assistant: the model chose the question, not the arithmetic.
//
// Parameters are `:name` placeholders, bound as literals (strings quoted,
// numbers checked), never pasted as SQL. The snapshot's own knowledge, so
// exhibits and the chat both read it; searching it by words is the chat's.

import { t } from "~/shared/i18n"

export interface CookbookParam { name: string; kind: "text" | "number"; default?: string | number; description: string }

export interface Recipe {
    id: string
    question: string
    /** More ways to ask it, for search. */
    also: string[]
    params: CookbookParam[]
    sql: string
    /** Tables it needs; recipes whose tables are missing are not offered. */
    needs: string[]
    /** How to read the columns. */
    reading: string
    chart?: { label: string; value: string }
    /** Where in the app the query comes from, for harvested recipes. */
    source?: string
}

export const RECIPES: Recipe[] = [
    {
        id: "size-by-extension", question: t("snapshot.recipes.howMuchCodeEach"), also: ["languages", "file types", "extensions", "tech stack"],
        params: [], needs: ["files"],
        sql: `SELECT lower(CASE WHEN instr(name, '.') > 0 THEN replace(name, rtrim(name, replace(name, '.', '')), '') ELSE '(none)' END) AS extension, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC LIMIT 15`,
        reading: t("snapshot.recipes.extensionFileSuffixFiles"), chart: { label: t("snapshot.recipes.extension"), value: "lines" },
    },
    {
        id: "roles", question: t("snapshot.recipes.howMuchProductionCode"), also: ["tests", "test ratio", "generated code", "vendored", "production"],
        params: [], needs: ["files"],
        sql: `SELECT coalesce(role, 'unknown') AS role, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC`,
        reading: t("snapshot.recipes.roleWhatFileScan"), chart: { label: t("snapshot.recipes.role"), value: "lines" },
    },
    {
        id: "roots", question: t("snapshot.recipes.whatTopLevelAreas"), also: ["top level", "folders", "directories", "areas", "main parts", "modules"],
        params: [{ name: "depth", kind: "number", default: 1, description: t("snapshot.recipes.folderDepth1Top") }], needs: ["files"],
        sql: `WITH f AS (SELECT name, complexity__lines AS lines, name || '/' AS p FROM files)
SELECT CASE WHEN :depth <= 1 THEN substr(p, 1, instr(p, '/') - 1)
            ELSE substr(p, 1, instr(p, '/') + instr(substr(p, instr(p, '/') + 1), '/') - 1) END AS area,
       count(*) AS files, sum(lines) AS lines
FROM f GROUP BY 1 ORDER BY lines DESC LIMIT 20`,
        reading: t("snapshot.recipes.areaFolderDepthFiles"), chart: { label: t("snapshot.recipes.area"), value: "lines" },
    },
    {
        id: "build-modules", question: t("snapshot.recipes.whichBuildModulesPackages"), also: ["maven modules", "gradle", "npm packages", "go modules", "build"],
        params: [], needs: ["modules"],
        sql: `SELECT name, kind, directory, files FROM modules ORDER BY files DESC LIMIT 40`,
        reading: t("snapshot.recipes.oneRowPerModule"),
    },
    {
        id: "no-dependents", question: t("snapshot.recipes.whichComponentsDoesNothing"), also: ["entry points", "unused", "roots", "top of the graph", "nobody imports"],
        params: [], needs: ["components"],
        sql: `SELECT name, modularity__coupling__dependencies AS dependencies, complexity__lines AS lines FROM components WHERE coalesce(modularity__coupling__dependents, 0) = 0 AND name != '.' ORDER BY lines DESC LIMIT 25`,
        reading: t("snapshot.recipes.nothingImportsTheseEither"),
    },
    {
        id: "mutual-pairs", question: t("snapshot.recipes.whichPairsComponentsImport"), also: ["mutual", "two way", "bidirectional", "2-cycle", "each other"],
        params: [], needs: ["component_connections_direct"],
        sql: `WITH e AS (SELECT DISTINCT "from" AS a, "to" AS b FROM component_connections_direct WHERE (kind IS NULL OR kind != 'type_only') AND "from" != "to")
SELECT e.a AS component, e.b AS other FROM e JOIN e r ON r.a = e.b AND r.b = e.a WHERE e.a < e.b ORDER BY 1 LIMIT 50`,
        reading: t("snapshot.recipes.eachPairTwoComponent"),
    },
    {
        id: "import-files", question: t("snapshot.recipes.whichFilesMakeOne"), also: ["which file imports", "why does a depend on b", "import lines", "carriers"],
        params: [{ name: "from", kind: "text", description: t("snapshot.recipes.importingComponent") }, { name: "to", kind: "text", description: t("snapshot.recipes.importedComponent") }], needs: ["component_connections_direct"],
        sql: `SELECT file, sum(coalesce(reference_count, 1)) AS refs FROM component_connections_direct WHERE "from" = :from AND "to" = :to GROUP BY file ORDER BY refs DESC LIMIT 30`,
        reading: t("snapshot.recipes.filesReferenceHowMany"),
    },
    {
        id: "hotspot-files", question: t("snapshot.recipes.whichFilesHotspotsChanged"), also: ["hotspot files", "risky files", "refactor candidates", "worst files"],
        params: [{ name: "limit", kind: "number", default: 15, description: t("snapshot.recipes.rows") }], needs: ["files"],
        sql: `SELECT name AS file, component, codesmells__hotspot_score AS hotspot, git__commits__total AS commits, codesmells__code_health AS health, complexity__lines AS lines FROM files WHERE coalesce(role, 'production') = 'production' AND codesmells__hotspot_score > 0 ORDER BY hotspot DESC LIMIT :limit`,
        reading: t("snapshot.recipes.hotspotChurnWeightedComplexity"), chart: { label: t("snapshot.recipes.file"), value: "hotspot" },
    },
    {
        id: "unhealthy-changing", question: t("snapshot.recipes.whereEffortGoingUnhealthy"), also: ["effort into bad code", "low health high churn", "technical debt interest"],
        params: [{ name: "health", kind: "number", default: 5, description: t("snapshot.recipes.healthBelowCountsUnhealthy") }], needs: ["files"],
        sql: `SELECT name AS file, component, codesmells__code_health AS health, git__commits__last_180_days AS commits_180d, complexity__lines AS lines FROM files WHERE codesmells__code_health > 0 AND codesmells__code_health < :health AND git__commits__last_180_days > 0 ORDER BY commits_180d DESC LIMIT 20`,
        reading: t("snapshot.recipes.filesBelowHealthLine"),
    },
    {
        id: "stale", question: t("snapshot.recipes.whichProductionFilesHave"), also: ["stale", "untouched", "dead code", "old code", "abandoned"],
        params: [{ name: "days", kind: "number", default: 365, description: t("snapshot.recipes.daysSinceLastChange") }], needs: ["files"],
        sql: `SELECT name AS file, component, git__last_change_age_in_days AS days_since_change, complexity__lines AS lines FROM files WHERE coalesce(role, 'production') = 'production' AND git__last_change_age_in_days >= :days ORDER BY lines DESC LIMIT 25`,
        reading: t("snapshot.recipes.unchangedNotUnusedStable"),
    },
    {
        id: "top-authors", question: t("snapshot.recipes.whoMostActiveAuthors"), also: ["authors", "contributors", "team", "who commits"],
        params: [], needs: ["git_authors"],
        sql: `SELECT author_name AS author, git__commits__total AS commits, git__commits__last_90_days AS commits_90d, git__unique_file_changes__total AS files_touched FROM git_authors ORDER BY commits DESC LIMIT 15`,
        reading: t("snapshot.recipes.commitCountsActivityNot"), chart: { label: t("snapshot.recipes.author"), value: "commits" },
    },
    {
        id: "commits-per-month", question: t("snapshot.recipes.howManyCommitsWere"), also: ["activity over time", "timeline", "is it maintained", "commit history"],
        params: [], needs: ["git_commit_info"],
        sql: `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commit_info GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
        reading: t("snapshot.recipes.distinctCommitsPerCalendar"), chart: { label: t("snapshot.recipes.month"), value: "commits" },
    },
    {
        id: "cochange-pairs", question: t("snapshot.recipes.whichComponentsChangeTogether"), also: ["change together", "co-change", "logical coupling", "hidden coupling"],
        params: [], needs: ["git_component_shared_commits"],
        sql: `SELECT pair_1 AS a, pair_2 AS b, shared_commits, round(percentage_of_all_commits_pair_1, 1) AS pct_of_a, round(percentage_of_all_commits_pair_2, 1) AS pct_of_b FROM git_component_shared_commits WHERE pair_1 != pair_2 ORDER BY shared_commits DESC LIMIT 20`,
        reading: t("snapshot.recipes.sharedCommitsCommitsTouching"),
    },
    {
        id: "largest-classes", question: t("snapshot.recipes.whichTypesClassesLargest"), also: ["god class", "largest classes", "big types", "biggest files"],
        params: [], needs: ["files"],
        sql: `SELECT name AS file, component, complexity__lines AS lines, modularity__types__total AS types, codesmells__code_health AS health FROM files WHERE coalesce(role, 'production') = 'production' ORDER BY lines DESC LIMIT 15`,
        reading: t("snapshot.recipes.largestProductionFilesTypes"), chart: { label: t("snapshot.recipes.file"), value: "lines" },
    },
    {
        id: "rule-results", question: t("snapshot.recipes.whatDoEngineS"), also: ["rules", "violations", "architecture rules", "checks"],
        params: [], needs: ["rules"],
        sql: `SELECT rule, status, "from", "to", file, line FROM rules ORDER BY status, rule LIMIT 50`,
        reading: t("snapshot.recipes.rulesEvaluatedScanTime"),
    },
    {
        id: "test-files-per-component", question: t("snapshot.recipes.whichComponentsHaveTests"), also: ["test coverage by component", "untested", "tests per component"],
        params: [], needs: ["files"],
        sql: `SELECT component, sum(CASE WHEN role = 'test' THEN complexity__lines ELSE 0 END) AS test_lines, sum(CASE WHEN coalesce(role, 'production') = 'production' THEN complexity__lines ELSE 0 END) AS production_lines FROM files WHERE component IS NOT NULL GROUP BY component HAVING production_lines > 0 ORDER BY production_lines DESC LIMIT 25`,
        reading: t("snapshot.recipes.linesTestCodeFiled"),
    },
    // ── Harvested from the app's own queries (scripts/ask-harvest.mjs) ──
    {
        id: "edge-kinds", question: t("snapshot.recipes.howComponentsConnectedStatic"), also: ["dynamic imports", "type only", "kinds of dependencies", "runtime lookups", "reflection"],
        params: [], needs: ["component_connections_direct"], source: "features/overview/components/SummarySection.vue",
        sql: `WITH p AS (SELECT "from", "to", max(kind = 'import') AS s, max(kind = 'dynamic') AS d, max(kind = 'type_only') AS t FROM component_connections_direct WHERE "from" != "to" GROUP BY 1, 2) SELECT sum(s = 1 OR d = 1) AS runtime_pairs, sum(d = 1 AND s = 0) AS dynamic_only_pairs, sum(t = 1 AND s = 0 AND d = 0) AS type_only_pairs FROM p`,
        reading: t("snapshot.recipes.componentPairsHowOne"),
    },
    {
        id: "unresolved-imports", question: t("snapshot.recipes.whichImportsCouldScan"), also: ["unresolved", "missing imports", "blind spots", "scan coverage", "what the scan cannot see"],
        params: [], needs: ["unresolved_edges"], source: "features/overview/components/SummarySection.vue",
        sql: `SELECT reason, count(*) AS imports, count(DISTINCT file) AS files, min("from") AS example_from, min(names) AS example_names FROM unresolved_edges GROUP BY reason ORDER BY imports DESC`,
        reading: t("snapshot.recipes.importsPointNothingScan"),
    },
    {
        id: "external-imports", question: t("snapshot.recipes.whichOutsidePackagesLibraries"), also: ["libraries", "external dependencies", "third party", "frameworks used", "npm packages", "vendors"],
        params: [], needs: ["snippets"], source: "features/reports/readings.ts",
        sql: `SELECT content AS imported, count(DISTINCT file) AS files FROM snippets WHERE snippet_type = 'modularity__component__imports' AND content NOT IN (SELECT name FROM components) GROUP BY 1 ORDER BY 2 DESC LIMIT 30`,
        reading: t("snapshot.recipes.importedNamesNotComponents"), chart: { label: t("snapshot.recipes.imported"), value: "files" },
    },
    {
        id: "untested-components", question: t("snapshot.recipes.whichComponentsHaveNo"), also: ["untested", "no tests", "test gaps", "missing tests"],
        params: [], needs: ["files", "component_connections_direct"], source: "features/reports/readings.ts",
        sql: `SELECT c.name AS component, c.complexity__lines AS lines FROM components c WHERE c.name IN (SELECT component FROM files WHERE role = 'production') AND c.name NOT IN (SELECT component FROM files WHERE role = 'test' AND component IS NOT NULL UNION SELECT d."to" FROM component_connections_direct d JOIN files t ON t.name = d.file WHERE t.role = 'test') ORDER BY lines DESC LIMIT 30`,
        reading: t("snapshot.recipes.productionComponentsNoTest"), chart: { label: t("snapshot.recipes.component"), value: "lines" },
    },
    {
        id: "shared-types", question: t("snapshot.recipes.whichTypesUsedMost"), also: ["most used types", "shared classes", "core types", "god types", "widely used"],
        params: [], needs: ["units", "unit_connections"], source: "features/reports/mobileTemplates.ts",
        sql: `SELECT t.name AS type, coalesce(nullif(t.module, ''), t.component) AS declared_in, count(DISTINCT uc.from_component) AS folders_using_it, count(DISTINCT uc."from") AS units_using_it FROM unit_connections uc JOIN units t ON t.id = uc."to" WHERE t.kind = 'type' AND uc.from_component <> uc.to_component GROUP BY t.id ORDER BY 3 DESC, 4 DESC LIMIT 25`,
        reading: t("snapshot.recipes.typesReferencedOtherComponents"), chart: { label: t("snapshot.recipes.type"), value: "folders_using_it" },
    },
    {
        id: "last-30-days", question: t("snapshot.recipes.whatChangedLast30"), also: ["recent changes", "this month", "what is being worked on now", "latest work"],
        params: [], needs: ["files"], source: "features/reports/reportTemplates.ts",
        sql: `SELECT name AS file, git__commits__last_30_days AS commits, coalesce(git__additions__last_30_days, 0) + coalesce(git__deletions__last_30_days, 0) AS changed_lines, git__authors__last_30_days AS authors FROM files WHERE git__commits__last_30_days > 0 ORDER BY changed_lines DESC, name LIMIT 30`,
        reading: t("snapshot.recipes.filesChanged30Days"),
    },
    {
        id: "propagation-cost", question: t("snapshot.recipes.whatPropagationCostHow"), also: ["propagation cost", "ripple", "how connected is it", "change impact overall", "maccormack"],
        params: [], needs: ["component_connections_indirect"], source: "features/snapshot/derivedMetrics.ts",
        sql: `SELECT round(100.0 * ((SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')) + (SELECT count(*) FROM components WHERE name <> '.')) / nullif((SELECT count(*) * count(*) FROM components WHERE name <> '.'), 0), 1) AS propagation_cost_percent`,
        reading: t("snapshot.recipes.shareComponentPairsWhere"),
    },
    {
        id: "medians", question: t("snapshot.recipes.whatTypicalInstabilityDistance"), also: ["median instability", "main sequence", "typical component", "averages"],
        params: [], needs: ["components"], source: "features/snapshot/derivedMetrics.ts",
        sql: `SELECT (SELECT modularity__instability FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL)) AS median_instability, (SELECT modularity__distance_main_sequence FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL)) AS median_distance`,
        reading: t("snapshot.recipes.mediansOverAllComponents"),
    },
    {
        id: "big-commits", question: t("snapshot.recipes.whichCommitsTouchedMost"), also: ["largest commits", "big bang changes", "sweeping commits", "refactor commits"],
        params: [], needs: ["git_commits"], source: "pages/index.vue",
        sql: `SELECT commit_hash, substr(commit_time, 1, 10) AS day, substr(commit_message, 1, 80) AS message, count(file) AS files_changed, sum(file_additions) AS additions, sum(file_deletions) AS deletions FROM git_commits GROUP BY commit_hash ORDER BY files_changed DESC LIMIT 20`,
        reading: t("snapshot.recipes.commitsHowManyFiles"),
    },
    {
        id: "communities", question: t("snapshot.recipes.whichClustersDoesDependency"), also: ["communities", "clusters", "natural modules", "groups of components", "modularity"],
        params: [], needs: ["component_communities"], source: "features/lens-builder/useSuggestModel.ts",
        sql: `SELECT community_nr AS community, count(*) AS components, group_concat(component, ', ') AS members FROM component_communities GROUP BY community_nr ORDER BY components DESC LIMIT 15`,
        reading: t("snapshot.recipes.communitiesFoundEngineSets"),
    },
    {
        id: "modules-deps", question: t("snapshot.recipes.whichBuildModulesDepend"), also: ["module dependencies", "maven module graph", "package dependencies", "workspace packages"],
        params: [], needs: ["modules"], source: "features/lens-builder/useBuildModules.ts",
        sql: `SELECT name, kind, directory, depends_on FROM modules WHERE coalesce(depends_on, '') <> '' ORDER BY kind, name LIMIT 60`,
        reading: t("snapshot.recipes.buildModulesOtherModules"),
    },
]

export function recipe(id: string): Recipe | undefined {
    return RECIPES.find(r => r.id === id)
}

/** The recipe's SQL with its parameters bound as literals. */
export function bindRecipe(r: Recipe, args: Record<string, unknown>): string {
    let sql = r.sql
    for (const p of r.params) {
        const raw = args[p.name] ?? p.default
        if (raw === undefined || raw === null || raw === "") throw new Error(t("snapshot.recipes.recipeNeeds", { name: p.name, description: p.description }))
        let lit: string
        if (p.kind === "number") {
            const n = Number(raw)
            if (!Number.isFinite(n)) throw new Error(t("snapshot.recipes.mustNumber", { name: p.name }))
            lit = String(n)
        } else lit = `'${String(raw).replace(/'/g, "''")}'`
        sql = sql.replace(new RegExp(`:${p.name}\\b`, "g"), lit)
    }
    return sql
}
