// A lens's declaration as rules a build can run: an assertions file for
// `archstats assert --rules <file>`, which scans the tree, runs each query
// against the fresh snapshot and fails when a query returns rows. Each
// group becomes a SQL condition that keeps meaning the same thing as the
// code changes: its patterns as globs, its whole components by name, and
// only the files it holds by hand as a list.

import type { Declaration } from "~/features/groups/groups.store"
import { t } from "~/shared/i18n"

export interface RuleGroup {
    id: string
    name: string
    /** Pattern lines of a query made only of patterns, `!` excludes kept. */
    patterns: string[]
    /** Components the group holds whole. */
    components: string[]
    /** Files it holds that no pattern or whole component says. */
    files: string[]
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const depth = (col: string, sep: string) => t("rules.rulesAsCode.lengthLengthReplace", { col, col2: col, sep: lit(sep) })

/**
 * A pattern as a SQL condition on one column. SQLite's GLOB lets * cross a
 * separator, so a pattern without ** also pins the number of separators:
 * with as many in the path as in the pattern, no * can swallow one.
 */
export function globSql(pattern: string, col: string, sep = "/"): string {
    const deep = pattern.includes("**")
    const g = pattern.replace(/\*\*\/?/g, "*").replace(/[[\]]/g, c => `[${c}]`)
    const cond = `${col} GLOB ${lit(g)}`
    if (deep) return cond
    const n = pattern.split(sep).length - 1
    return `(${cond} AND ${depth(col, sep)} = ${n})`
}

/** Whether a file (path `f`, component `c`) is in the group. */
export function groupSql(g: RuleGroup, sep: string): string {
    const inc: string[] = [], exc: string[] = []
    for (const p of g.patterns) {
        const neg = p.startsWith("!"), pat = neg ? p.slice(1).trim() : p.trim()
        if (!pat) continue
        const c = `(${globSql(pat, "f.name")} OR ${globSql(pat, "f.component", sep)})`
        ;(neg ? exc : inc).push(c)
    }
    if (g.components.length) inc.push(`f.component IN (${g.components.map(lit).join(", ")})`)
    if (g.files.length) inc.push(`f.name IN (${g.files.map(lit).join(", ")})`)
    if (!inc.length) return "0"
    return `(${inc.join(" OR ")})${exc.length ? ` AND NOT (${exc.join(" OR ")})` : ""}`
}

/** Every ordered pair of groups the declaration forbids. */
export function forbiddenPairs(groups: RuleGroup[], d: Declaration): Array<[RuleGroup, RuleGroup]> {
    const out: Array<[RuleGroup, RuleGroup]> = []
    for (const a of groups) for (const b of groups) {
        if (a.id === b.id) continue
        const pair = d.pairs.find(p => p.from === a.id && p.to === b.id)
        let v: string
        if (pair) v = pair.verdict
        else {
            const i = d.layers.indexOf(a.id), j = d.layers.indexOf(b.id)
            v = i >= 0 && j >= 0 ? (i < j ? "allowed" : "forbidden") : d.unset
        }
        if (v === "forbidden") out.push([a, b])
    }
    return out
}

/**
 * One query returning a row per import that crosses the declaration:
 * groups, importing file, its line, and what it imports. File imports come
 * from unit references; component imports add what those miss, when the
 * target component sits wholly in one group.
 */
export function crossingSql(groups: RuleGroup[], d: Declaration, sep: string, production = true): string {
    const forbidden = forbiddenPairs(groups, d)
    if (!forbidden.length) return "SELECT 1 WHERE 0"
    const cases = groups.map(g => `      WHEN ${groupSql(g, sep)} THEN ${lit(g.name)}`).join("\n")
    const pairs = forbidden.map(([a, b]) => `(${lit(a.name)}, ${lit(b.name)})`).join(", ")
    const prod = production ? `\n    WHERE coalesce(f.role, 'production') <> 'test'` : ""
    return `WITH grp(file, component, name) AS (
    SELECT f.name, f.component, CASE
${cases}
    END FROM files f${prod}
), cgrp(component, name) AS (
    SELECT component, max(name) FROM grp GROUP BY component
    HAVING count(*) = count(name) AND count(DISTINCT name) = 1
), forbidden(a, b) AS (VALUES ${pairs}
), crossing(from_group, to_group, file, imports, to_component) AS (
    SELECT DISTINCT fg.name, tg.name, u.from_file, u.to_file, tg.component
    FROM unit_connections u
    JOIN grp fg ON fg.file = u.from_file JOIN grp tg ON tg.file = u.to_file
    JOIN forbidden x ON x.a = fg.name AND x.b = tg.name
    UNION
    SELECT DISTINCT fg.name, cg.name, c.file, c."to", c."to"
    FROM component_connections_direct c
    JOIN grp fg ON fg.file = c.file JOIN cgrp cg ON cg.component = c."to"
    JOIN forbidden x ON x.a = fg.name AND x.b = cg.name
    WHERE coalesce(c.kind, '') <> 'type_only'
      AND NOT EXISTS (SELECT 1 FROM unit_connections u2 JOIN grp t2 ON t2.file = u2.to_file
                      WHERE u2.from_file = c.file AND t2.component = c."to")
)
SELECT from_group, to_group, file,
    (SELECT min(CAST(substr(s.begin_position, 1, instr(s.begin_position, ':') - 1) AS INTEGER)) FROM snippets s
     WHERE s.file = crossing.file AND s.snippet_type IN ('modularity__component__imports', 'modularity__component__imports__type') AND s.content = crossing.to_component) AS line,
    group_concat(imports, ', ') AS imports
FROM crossing
GROUP BY from_group, to_group, file
ORDER BY from_group, to_group, file`
}

/** The assertions file: one rule for the whole declaration, expecting no rows. */
export function rulesYaml(lens: string, groups: RuleGroup[], d: Declaration, sep: string, origin: string): string {
    const q = crossingSql(groups, d, sep).split("\n").map(l => "      " + l).join("\n")
    const order = d.layers.map(id => groups.find(g => g.id === id)?.name).filter(Boolean).join(" > ")
    const yamlStr = (s: string) => JSON.stringify(s)
    return t("rules.rulesAsCode.dependenciesDeclaredLensBuild", { lens, origin, value: yamlStr(t("rules.rulesAsCode.declaredDependencies", { lens })), value2: yamlStr(order ? t("rules.rulesAsCode.layersTopFirstPair", { order, pairsLength: d.pairs.length, value: d.unset === "forbidden" ? t("rules.rulesAsCode.forbidden") : t("rules.rulesAsCode.notJudged") }) : t("rules.rulesAsCode.pairRuleSAnything", { pairsLength: d.pairs.length, value: d.unset === "forbidden" ? t("rules.rulesAsCode.forbidden") : t("rules.rulesAsCode.notJudged") })), q })
}

/**
 * A group as the export writes it. A live group made only of patterns keeps
 * its patterns, so the build judges the code as it is then; any other group
 * is written as the components it holds whole and the files it holds besides.
 */
export function ruleGroup(
    g: { id: string; name: string; mode?: string; query?: string },
    lines: Array<{ raw: string; exclude: boolean; plainGlob: boolean }> | null,
    components: Map<string, { whole: boolean }>,
    files: Set<string>,
    componentOf: (file: string) => string | undefined,
): RuleGroup {
    if (g.mode === "live" && lines && lines.length && lines.every(l => l.plainGlob)) {
        return { id: g.id, name: g.name, patterns: lines.map(l => l.raw.trim()), components: [], files: [] }
    }
    const whole = [...components].filter(([, c]) => c.whole).map(([n]) => n).sort()
    const wholeSet = new Set(whole)
    return { id: g.id, name: g.name, patterns: [], components: whole, files: [...files].filter(f => !wholeSet.has(componentOf(f) ?? "")).sort() }
}

/** A CI step that runs the exported rules. */
export const CI_SNIPPET = t("rules.rulesAsCode.githubWorkflowsArchitectureYml")
