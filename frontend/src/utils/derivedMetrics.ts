// Numbers the app computes from a snapshot, rather than reads from it. Each
// has an id in the engine's style (prefixed `app__`), a definition written the
// way the engine writes its own, and the SQL that reproduces it against the
// snapshot, so a reader can check any figure without trusting the app. The
// same ids name the readings stored per scan (Overview, Trends, Changes).

export interface DerivedMetric {
    id: string
    name: string
    category: string
    short: string
    long: string
    /** SQL over the snapshot that yields the number; null when it takes a graph walk. */
    sql: string | null
    /** What the app does when there is no SQL form. */
    method?: string
}

const TANGLES = `SELECT "group", count(*) AS size FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1`

export const DERIVED_METRICS: DerivedMetric[] = [
    {
        id: "app__components",
        name: "Components",
        category: "System shape",
        short: "Components in the snapshot, the root excluded.",
        long: "Every component the scan grouped files into. The root component ('.') holds files outside every other component and is left out, as it is on every screen.",
        sql: `SELECT count(*) FROM components WHERE name <> '.'`,
    },
    {
        id: "app__components_in_tangles",
        name: "Components in tangles",
        category: "System shape",
        short: "Components that sit in a dependency cycle with at least one other.",
        long: "A tangle is a strongly connected group of two or more components: each can reach every other by following imports. Components in a tangle cannot be released, tested or understood apart from the rest of it.",
        sql: `SELECT count(*) FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM (${TANGLES}))`,
    },
    {
        id: "app__lines_in_tangles_share",
        name: "Lines in tangles",
        category: "System shape",
        short: "Share of all lines of code that sit in a tangle.",
        long: "Lines of the components in a tangle over the lines of all components. A count of components understates a tangle of large components; this weighs them by size.",
        sql: `SELECT 1.0 * sum(CASE WHEN c.name IN (SELECT component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM (${TANGLES}))) THEN c.complexity__lines ELSE 0 END) / nullif(sum(c.complexity__lines), 0) FROM components c`,
    },
    {
        id: "app__largest_tangle",
        name: "Largest tangle",
        category: "System shape",
        short: "Components in the largest tangle.",
        long: "The size of the largest strongly connected group. One big tangle is a different problem from many small ones: it usually means the system has no layers left.",
        sql: `SELECT coalesce(max(size), 0) FROM (${TANGLES})`,
    },
    {
        id: "app__cross_component_edges",
        name: "Component dependencies",
        category: "System shape",
        short: "Ordered pairs of components where one imports the other.",
        long: "Distinct (from, to) pairs in the direct connections, the root excluded. A pair counts once however many imports it carries.",
        sql: `SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')`,
    },
    {
        id: "app__propagation_cost",
        name: "Propagation cost",
        category: "System shape",
        short: "Share of component pairs where a change in one can reach the other.",
        long: "MacCormack's propagation cost: the number of ordered pairs (a, b) where a reaches b through imports, directly or not, over the number of components squared. Near 0, changes stay local; past about 0.4, most changes can ripple through most of the system.",
        sql: `SELECT 1.0 * (SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')) / nullif((SELECT count(*) * count(*) FROM components WHERE name <> '.'), 0)`,
    },
    {
        id: "app__dependency_levels",
        name: "Dependency levels",
        category: "System shape",
        short: "Layers in the dependency graph once tangles are collapsed.",
        long: "Collapse each tangle into one node, then count the nodes on the longest import chain. A tall stack with few tangles is a layered system; a short stack with one large tangle is not.",
        sql: null,
        method: "Longest path in the condensation of component_connections_direct, computed in the app.",
    },
    {
        id: "app__median_instability",
        name: "Median instability",
        category: "System shape",
        short: "The middle component's instability, Ce / (Ca + Ce).",
        long: "The median of modularity__instability over components. Half the components are more stable than this, half less. The median ignores the handful of leaf and root components that pull the mean to the ends.",
        sql: `SELECT modularity__instability FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL)`,
    },
    {
        id: "app__median_distance",
        name: "Median distance from the main sequence",
        category: "System shape",
        short: "The middle component's |A + I − 1|.",
        long: "The median of modularity__distance_main_sequence over components. Read with care in languages without explicit abstractions (Python, JavaScript, Go), where abstractness is near zero for everything.",
        sql: `SELECT modularity__distance_main_sequence FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL)`,
    },
    {
        id: "app__rule_findings",
        name: "Rule findings",
        category: "System shape",
        short: "Imports that break a dependency rule.",
        long: "Rows of the rules table with status 'violation': each is one import, in one file, at one line, that a configured rule forbids.",
        sql: `SELECT count(*) FROM rules WHERE status = 'violation'`,
    },
    {
        id: "app__last_changed_days",
        name: "Days since last change",
        category: "History",
        short: "Days since a file last changed, counted back to the snapshot's head commit.",
        long: "Counted back from the newest commit in the scan, not from today, so a snapshot says the same thing whenever it is read. A pure rename is not a change: a moved file keeps its age. A component takes its most recently changed file's. Engine revision 2 records this per file as git__last_change_age_in_days; older snapshots are computed in the app from git_commits (anchored at scan time).",
        sql: `SELECT file, julianday((SELECT max(commit_time) FROM git_commits)) - julianday(max(commit_time)) AS days FROM git_commits WHERE file IN (SELECT name FROM files) AND coalesce(file_additions, 0) + coalesce(file_deletions, 0) > 0 GROUP BY file`,
    },
    {
        id: "app__test_importers",
        name: "Test files importing it",
        category: "Tests",
        short: "Test files, in any component, that import this component.",
        long: "Distinct files with role 'test' among the direct connections into a component. A component no test file imports is tested, if at all, only through something else.",
        sql: `SELECT d."to" AS component, count(DISTINCT d.file) AS test_files FROM component_connections_direct d JOIN files f ON f.name = d.file WHERE f.role = 'test' GROUP BY 1`,
    },
]

const byId = new Map(DERIVED_METRICS.map(m => [m.id, m]))

export function derivedMetric(id: string): DerivedMetric | undefined {
    return byId.get(id)
}
