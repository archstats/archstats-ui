// Numbers the app computes from a snapshot, rather than reads from it. Each
// has an id in the engine's style (prefixed `app__`), a definition written the
// way the engine writes its own, and the SQL that reproduces it against the
// snapshot, so a reader can check any figure without trusting the app. The
// same ids name the readings stored per scan (Overview, Trends, Changes).

import { t } from "~/shared/i18n"

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
        name: t("definitions.metrics.app__components.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__components.short"),
        long: t("definitions.metrics.app__components.long"),
        sql: `SELECT count(*) FROM components WHERE name <> '.'`,
    },
    {
        id: "app__components_in_tangles",
        name: t("definitions.metrics.app__components_in_tangles.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__components_in_tangles.short"),
        long: t("definitions.metrics.app__components_in_tangles.long"),
        sql: `SELECT count(*) FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM (${TANGLES}))`,
    },
    {
        id: "app__lines_in_tangles_share",
        name: t("definitions.metrics.app__lines_in_tangles_share.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__lines_in_tangles_share.short"),
        long: t("definitions.metrics.app__lines_in_tangles_share.long"),
        sql: `SELECT 1.0 * sum(CASE WHEN c.name IN (SELECT component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM (${TANGLES}))) THEN c.complexity__lines ELSE 0 END) / nullif(sum(c.complexity__lines), 0) FROM components c`,
    },
    {
        id: "app__largest_tangle",
        name: t("definitions.metrics.app__largest_tangle.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__largest_tangle.short"),
        long: t("definitions.metrics.app__largest_tangle.long"),
        sql: `SELECT coalesce(max(size), 0) FROM (${TANGLES})`,
    },
    {
        id: "app__cross_component_edges",
        name: t("definitions.metrics.app__cross_component_edges.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__cross_component_edges.short"),
        long: t("definitions.metrics.app__cross_component_edges.long"),
        sql: `SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')`,
    },
    {
        id: "app__propagation_cost",
        name: t("definitions.metrics.app__propagation_cost.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__propagation_cost.short"),
        long: t("definitions.metrics.app__propagation_cost.long"),
        sql: `SELECT 1.0 * ((SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')) + (SELECT count(*) FROM components WHERE name <> '.')) / nullif((SELECT count(*) * count(*) FROM components WHERE name <> '.'), 0)`,
    },
    {
        id: "app__dependency_levels",
        name: t("definitions.metrics.app__dependency_levels.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__dependency_levels.short"),
        long: t("definitions.metrics.app__dependency_levels.long"),
        sql: null,
        method: t("definitions.metrics.app__dependency_levels.method"),
    },
    {
        id: "app__median_instability",
        name: t("definitions.metrics.app__median_instability.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__median_instability.short"),
        long: t("definitions.metrics.app__median_instability.long"),
        sql: `SELECT modularity__instability FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__instability IS NOT NULL)`,
    },
    {
        id: "app__median_distance",
        name: t("definitions.metrics.app__median_distance.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__median_distance.short"),
        long: t("definitions.metrics.app__median_distance.long"),
        sql: `SELECT modularity__distance_main_sequence FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL ORDER BY 1 LIMIT 1 OFFSET (SELECT (count(*) - 1) / 2 FROM components WHERE name <> '.' AND modularity__distance_main_sequence IS NOT NULL)`,
    },
    {
        id: "app__rule_findings",
        name: t("definitions.metrics.app__rule_findings.name"),
        category: t("definitions.categories.systemShape"),
        short: t("definitions.metrics.app__rule_findings.short"),
        long: t("definitions.metrics.app__rule_findings.long"),
        sql: `SELECT count(*) FROM rules WHERE status = 'violation'`,
    },
    {
        id: "app__last_changed_days",
        name: t("definitions.metrics.app__last_changed_days.name"),
        category: t("definitions.categories.history"),
        short: t("definitions.metrics.app__last_changed_days.short"),
        long: t("definitions.metrics.app__last_changed_days.long"),
        sql: `SELECT file, julianday((SELECT max(commit_time) FROM git_commits)) - julianday(max(commit_time)) AS days FROM git_commits WHERE file IN (SELECT name FROM files) AND coalesce(file_additions, 0) + coalesce(file_deletions, 0) > 0 GROUP BY file`,
    },
    {
        id: "app__test_importers",
        name: t("definitions.metrics.app__test_importers.name"),
        category: t("definitions.categories.tests"),
        short: t("definitions.metrics.app__test_importers.short"),
        long: t("definitions.metrics.app__test_importers.long"),
        sql: `SELECT d."to" AS component, count(DISTINCT d.file) AS test_files FROM component_connections_direct d JOIN files f ON f.name = d.file WHERE f.role = 'test' GROUP BY 1`,
    },
]

const byId = new Map(DERIVED_METRICS.map(m => [m.id, m]))

export function derivedMetric(id: string): DerivedMetric | undefined {
    return byId.get(id)
}
