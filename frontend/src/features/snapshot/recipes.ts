// The common queries: SQL an architect reaches for, checked against real
// snapshots (cookbook.test.ts runs every entry). A result from here is
// marked verified in the conversation, the way a trusted asset is in a
// data assistant: the model chose the question, not the arithmetic.
//
// Parameters are `:name` placeholders, bound as literals (strings quoted,
// numbers checked), never pasted as SQL. The snapshot's own knowledge, so
// exhibits and the chat both read it; searching it by words is the chat's.

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
        id: "size-by-extension", question: "How much code is in each language or file type?", also: ["languages", "file types", "extensions", "tech stack"],
        params: [], needs: ["files"],
        sql: `SELECT lower(CASE WHEN instr(name, '.') > 0 THEN replace(name, rtrim(name, replace(name, '.', '')), '') ELSE '(none)' END) AS extension, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC LIMIT 15`,
        reading: "extension: the file suffix; files and lines per suffix.", chart: { label: "extension", value: "lines" },
    },
    {
        id: "roles", question: "How much is production code, tests, generated or third-party?", also: ["tests", "test ratio", "generated code", "vendored", "production"],
        params: [], needs: ["files"],
        sql: `SELECT coalesce(role, 'unknown') AS role, count(*) AS files, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC`,
        reading: "role: what a file is for, as the scan classified it.", chart: { label: "role", value: "lines" },
    },
    {
        id: "roots", question: "What are the top-level areas and how big is each?", also: ["top level", "folders", "directories", "areas", "main parts", "modules"],
        params: [{ name: "depth", kind: "number", default: 1, description: "Folder depth, 1 = top level" }], needs: ["files"],
        sql: `WITH f AS (SELECT name, complexity__lines AS lines, name || '/' AS p FROM files)
SELECT CASE WHEN :depth <= 1 THEN substr(p, 1, instr(p, '/') - 1)
            ELSE substr(p, 1, instr(p, '/') + instr(substr(p, instr(p, '/') + 1), '/') - 1) END AS area,
       count(*) AS files, sum(lines) AS lines
FROM f GROUP BY 1 ORDER BY lines DESC LIMIT 20`,
        reading: "area: the folder at that depth; files and lines under it.", chart: { label: "area", value: "lines" },
    },
    {
        id: "build-modules", question: "Which build modules or packages does the project declare?", also: ["maven modules", "gradle", "npm packages", "go modules", "build"],
        params: [], needs: ["modules"],
        sql: `SELECT name, kind, directory, files FROM modules ORDER BY files DESC LIMIT 40`,
        reading: "One row per module a build file declares (pom.xml, package.json, go.mod…).",
    },
    {
        id: "no-dependents", question: "Which components does nothing depend on (tops of the graph, entry points)?", also: ["entry points", "unused", "roots", "top of the graph", "nobody imports"],
        params: [], needs: ["components"],
        sql: `SELECT name, modularity__coupling__dependencies AS dependencies, complexity__lines AS lines FROM components WHERE coalesce(modularity__coupling__dependents, 0) = 0 AND name != '.' ORDER BY lines DESC LIMIT 25`,
        reading: "Nothing imports these. Either entry points (apps, main, controllers) or unused code; dynamic loading is invisible to the scan.",
    },
    {
        id: "mutual-pairs", question: "Which pairs of components import each other?", also: ["mutual", "two way", "bidirectional", "2-cycle", "each other"],
        params: [], needs: ["component_connections_direct"],
        sql: `WITH e AS (SELECT DISTINCT "from" AS a, "to" AS b FROM component_connections_direct WHERE (kind IS NULL OR kind != 'type_only') AND "from" != "to")
SELECT e.a AS component, e.b AS other FROM e JOIN e r ON r.a = e.b AND r.b = e.a WHERE e.a < e.b ORDER BY 1 LIMIT 50`,
        reading: "Each pair is a two-component cycle: the smallest tangle there is.",
    },
    {
        id: "import-files", question: "Which files make one component import another?", also: ["which file imports", "why does a depend on b", "import lines", "carriers"],
        params: [{ name: "from", kind: "text", description: "Importing component" }, { name: "to", kind: "text", description: "Imported component" }], needs: ["component_connections_direct"],
        sql: `SELECT file, sum(coalesce(reference_count, 1)) AS refs FROM component_connections_direct WHERE "from" = :from AND "to" = :to GROUP BY file ORDER BY refs DESC LIMIT 30`,
        reading: "The files in `from` that reference `to`, with how many import references each (refs).",
    },
    {
        id: "hotspot-files", question: "Which files are hotspots: changed often and complex?", also: ["hotspot files", "risky files", "refactor candidates", "worst files"],
        params: [{ name: "limit", kind: "number", default: 15, description: "Rows" }], needs: ["files"],
        sql: `SELECT name AS file, component, codesmells__hotspot_score AS hotspot, git__commits__total AS commits, codesmells__code_health AS health, complexity__lines AS lines FROM files WHERE coalesce(role, 'production') = 'production' AND codesmells__hotspot_score > 0 ORDER BY hotspot DESC LIMIT :limit`,
        reading: "hotspot: churn weighted by complexity. health: 10 is best.", chart: { label: "file", value: "hotspot" },
    },
    {
        id: "unhealthy-changing", question: "Where is effort going into unhealthy code?", also: ["effort into bad code", "low health high churn", "technical debt interest"],
        params: [{ name: "health", kind: "number", default: 5, description: "Health below this counts as unhealthy" }], needs: ["files"],
        sql: `SELECT name AS file, component, codesmells__code_health AS health, git__commits__last_180_days AS commits_180d, complexity__lines AS lines FROM files WHERE codesmells__code_health > 0 AND codesmells__code_health < :health AND git__commits__last_180_days > 0 ORDER BY commits_180d DESC LIMIT 20`,
        reading: "Files below the health line that still get commits: where debt costs time now.",
    },
    {
        id: "stale", question: "Which production files have not changed for a long time?", also: ["stale", "untouched", "dead code", "old code", "abandoned"],
        params: [{ name: "days", kind: "number", default: 365, description: "Days since last change" }], needs: ["files"],
        sql: `SELECT name AS file, component, git__last_change_age_in_days AS days_since_change, complexity__lines AS lines FROM files WHERE coalesce(role, 'production') = 'production' AND git__last_change_age_in_days >= :days ORDER BY lines DESC LIMIT 25`,
        reading: "Unchanged is not unused: stable code is often finished code.",
    },
    {
        id: "top-authors", question: "Who are the most active authors?", also: ["authors", "contributors", "team", "who commits"],
        params: [], needs: ["git_authors"],
        sql: `SELECT author_name AS author, git__commits__total AS commits, git__commits__last_90_days AS commits_90d, git__unique_file_changes__total AS files_touched FROM git_authors ORDER BY commits DESC LIMIT 15`,
        reading: "Commit counts are activity, not productivity.", chart: { label: "author", value: "commits" },
    },
    {
        id: "commits-per-month", question: "How many commits were made per month?", also: ["activity over time", "timeline", "is it maintained", "commit history"],
        params: [], needs: ["git_commit_info"],
        sql: `SELECT substr(commit_time, 1, 7) AS month, count(DISTINCT commit_hash) AS commits FROM git_commit_info GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
        reading: "Distinct commits per calendar month, newest first.", chart: { label: "month", value: "commits" },
    },
    {
        id: "cochange-pairs", question: "Which components change together most often?", also: ["change together", "co-change", "logical coupling", "hidden coupling"],
        params: [], needs: ["git_component_shared_commits"],
        sql: `SELECT pair_1 AS a, pair_2 AS b, shared_commits, round(percentage_of_all_commits_pair_1, 1) AS pct_of_a, round(percentage_of_all_commits_pair_2, 1) AS pct_of_b FROM git_component_shared_commits WHERE pair_1 != pair_2 ORDER BY shared_commits DESC LIMIT 20`,
        reading: "shared_commits: commits touching both. pct: share of each side's own commits.",
    },
    {
        id: "largest-classes", question: "Which types or classes are the largest?", also: ["god class", "largest classes", "big types", "biggest files"],
        params: [], needs: ["files"],
        sql: `SELECT name AS file, component, complexity__lines AS lines, modularity__types__total AS types, codesmells__code_health AS health FROM files WHERE coalesce(role, 'production') = 'production' ORDER BY lines DESC LIMIT 15`,
        reading: "Largest production files; types = declared types in the file.", chart: { label: "file", value: "lines" },
    },
    {
        id: "rule-results", question: "What do the engine's rules report?", also: ["rules", "violations", "architecture rules", "checks"],
        params: [], needs: ["rules"],
        sql: `SELECT rule, status, "from", "to", file, line FROM rules ORDER BY status, rule LIMIT 50`,
        reading: "Rules evaluated at scan time, with the import that broke each.",
    },
    {
        id: "test-files-per-component", question: "Which components have tests and how much?", also: ["test coverage by component", "untested", "tests per component"],
        params: [], needs: ["files"],
        sql: `SELECT component, sum(CASE WHEN role = 'test' THEN complexity__lines ELSE 0 END) AS test_lines, sum(CASE WHEN coalesce(role, 'production') = 'production' THEN complexity__lines ELSE 0 END) AS production_lines FROM files WHERE component IS NOT NULL GROUP BY component HAVING production_lines > 0 ORDER BY production_lines DESC LIMIT 25`,
        reading: "Lines of test code filed under each component. Tests elsewhere (a separate test tree) count under their own component; this is not coverage.",
    },
    // ── Harvested from the app's own queries (scripts/ask-harvest.mjs) ──
    {
        id: "edge-kinds", question: "How are components connected: static imports, dynamic lookups, or type-only?", also: ["dynamic imports", "type only", "kinds of dependencies", "runtime lookups", "reflection"],
        params: [], needs: ["component_connections_direct"], source: "features/overview/components/SummarySection.vue",
        sql: `WITH p AS (SELECT "from", "to", max(kind = 'import') AS s, max(kind = 'dynamic') AS d, max(kind = 'type_only') AS t FROM component_connections_direct WHERE "from" != "to" GROUP BY 1, 2) SELECT sum(s = 1 OR d = 1) AS runtime_pairs, sum(d = 1 AND s = 0) AS dynamic_only_pairs, sum(t = 1 AND s = 0 AND d = 0) AS type_only_pairs FROM p`,
        reading: "Component pairs by how one uses the other: a static import, only a runtime lookup by name, or only for types (erased at runtime).",
    },
    {
        id: "unresolved-imports", question: "Which imports could the scan not resolve to code?", also: ["unresolved", "missing imports", "blind spots", "scan coverage", "what the scan cannot see"],
        params: [], needs: ["unresolved_edges"], source: "features/overview/components/SummarySection.vue",
        sql: `SELECT reason, count(*) AS imports, count(DISTINCT file) AS files, min("from") AS example_from, min(names) AS example_names FROM unresolved_edges GROUP BY reason ORDER BY imports DESC`,
        reading: "Imports that point at nothing the scan found: external packages, generated code, or blind spots. Many of these means the graph is missing edges.",
    },
    {
        id: "external-imports", question: "Which outside packages and libraries are imported most?", also: ["libraries", "external dependencies", "third party", "frameworks used", "npm packages", "vendors"],
        params: [], needs: ["snippets"], source: "features/reports/readings.ts",
        sql: `SELECT content AS imported, count(DISTINCT file) AS files FROM snippets WHERE snippet_type = 'modularity__component__imports' AND content NOT IN (SELECT name FROM components) GROUP BY 1 ORDER BY 2 DESC LIMIT 30`,
        reading: "Imported names that are not components of this snapshot, by how many files import them.", chart: { label: "imported", value: "files" },
    },
    {
        id: "untested-components", question: "Which components have no tests in them or aimed at them?", also: ["untested", "no tests", "test gaps", "missing tests"],
        params: [], needs: ["files", "component_connections_direct"], source: "features/reports/readings.ts",
        sql: `SELECT c.name AS component, c.complexity__lines AS lines FROM components c WHERE c.name IN (SELECT component FROM files WHERE role = 'production') AND c.name NOT IN (SELECT component FROM files WHERE role = 'test' AND component IS NOT NULL UNION SELECT d."to" FROM component_connections_direct d JOIN files t ON t.name = d.file WHERE t.role = 'test') ORDER BY lines DESC LIMIT 30`,
        reading: "Production components with no test file inside and no test file importing them. Tests reaching them indirectly are not counted.", chart: { label: "component", value: "lines" },
    },
    {
        id: "shared-types", question: "Which types are used from the most other folders?", also: ["most used types", "shared classes", "core types", "god types", "widely used"],
        params: [], needs: ["units", "unit_connections"], source: "features/reports/mobileTemplates.ts",
        sql: `SELECT t.name AS type, coalesce(nullif(t.module, ''), t.component) AS declared_in, count(DISTINCT uc.from_component) AS folders_using_it, count(DISTINCT uc."from") AS units_using_it FROM unit_connections uc JOIN units t ON t.id = uc."to" WHERE t.kind = 'type' AND uc.from_component <> uc.to_component GROUP BY t.id ORDER BY 3 DESC, 4 DESC LIMIT 25`,
        reading: "Types referenced from other components, by how many components and units use them.", chart: { label: "type", value: "folders_using_it" },
    },
    {
        id: "last-30-days", question: "What changed in the last 30 days?", also: ["recent changes", "this month", "what is being worked on now", "latest work"],
        params: [], needs: ["files"], source: "features/reports/reportTemplates.ts",
        sql: `SELECT name AS file, git__commits__last_30_days AS commits, coalesce(git__additions__last_30_days, 0) + coalesce(git__deletions__last_30_days, 0) AS changed_lines, git__authors__last_30_days AS authors FROM files WHERE git__commits__last_30_days > 0 ORDER BY changed_lines DESC, name LIMIT 30`,
        reading: "Files changed in the 30 days before the scanned commit, most changed lines first.",
    },
    {
        id: "propagation-cost", question: "What is the propagation cost: how far does a change ripple on average?", also: ["propagation cost", "ripple", "how connected is it", "change impact overall", "maccormack"],
        params: [], needs: ["component_connections_indirect"], source: "features/snapshot/derivedMetrics.ts",
        sql: `SELECT round(100.0 * ((SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')) + (SELECT count(*) FROM components WHERE name <> '.')) / nullif((SELECT count(*) * count(*) FROM components WHERE name <> '.'), 0), 1) AS propagation_cost_percent`,
        reading: "The share of component pairs where one reaches the other through imports (itself included). Low single digits is loose; above 20–30% most changes can reach most code.",
    },
    {
        id: "medians", question: "What are the typical instability and distance from the main sequence?", also: ["median instability", "main sequence", "typical component", "averages"],
        params: [], needs: ["components"], source: "features/snapshot/derivedMetrics.ts",
        sql: `SELECT (SELECT modularity__instability FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL)) AS median_instability, (SELECT modularity__distance_main_sequence FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL)) AS median_distance`,
        reading: "Medians over all components. Instability: 0 = everything depends on it, 1 = it depends on everything. Distance: 0 = balanced between abstract and stable.",
    },
    {
        id: "big-commits", question: "Which commits touched the most files?", also: ["largest commits", "big bang changes", "sweeping commits", "refactor commits"],
        params: [], needs: ["git_commits"], source: "pages/index.vue",
        sql: `SELECT commit_hash, substr(commit_time, 1, 10) AS day, substr(commit_message, 1, 80) AS message, count(file) AS files_changed, sum(file_additions) AS additions, sum(file_deletions) AS deletions FROM git_commits GROUP BY commit_hash ORDER BY files_changed DESC LIMIT 20`,
        reading: "Commits by how many files they touched. Very large ones are usually renames, formatting or dependency bumps; the scan leaves the largest out of co-change.",
    },
    {
        id: "communities", question: "Which clusters does the dependency graph fall into?", also: ["communities", "clusters", "natural modules", "groups of components", "modularity"],
        params: [], needs: ["component_communities"], source: "features/lens-builder/useSuggestModel.ts",
        sql: `SELECT community_nr AS community, count(*) AS components, group_concat(component, ', ') AS members FROM component_communities GROUP BY community_nr ORDER BY components DESC LIMIT 15`,
        reading: "Communities found by the engine: sets of components with more imports inside than out. A hint at modules, not a verdict; the lens builder weighs several readings.",
    },
    {
        id: "modules-deps", question: "Which build modules depend on which?", also: ["module dependencies", "maven module graph", "package dependencies", "workspace packages"],
        params: [], needs: ["modules"], source: "features/lens-builder/useBuildModules.ts",
        sql: `SELECT name, kind, directory, depends_on FROM modules WHERE coalesce(depends_on, '') <> '' ORDER BY kind, name LIMIT 60`,
        reading: "Build modules and the other modules of this repository each declares a dependency on.",
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
        if (raw === undefined || raw === null || raw === "") throw new Error(`The recipe needs "${p.name}" (${p.description}).`)
        let lit: string
        if (p.kind === "number") {
            const n = Number(raw)
            if (!Number.isFinite(n)) throw new Error(`"${p.name}" must be a number.`)
            lit = String(n)
        } else lit = `'${String(raw).replace(/'/g, "''")}'`
        sql = sql.replace(new RegExp(`:${p.name}\\b`, "g"), lit)
    }
    return sql
}
