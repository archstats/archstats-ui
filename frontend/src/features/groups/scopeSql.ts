import { useScopeStore } from "./scope.store"
import { sqlLiteral } from "~/shared/sql"
import { listOf, t } from "~/shared/i18n"

// The active scope (groups, a query, the Production/Tests switch) as an SQL
// predicate on a file column, for views that count in SQL rather than
// filter rows they already hold: Activity, Authors, Rules. Null when nothing
// is scoped, so callers keep their unscoped query as it was.

export function scopeWhere(column = "file"): string | null {
    const scope = useScopeStore()
    if (!scope.isActive) return null
    const files = scope.fileNames
    if (!files || files.size === 0) return "0"
    return `${column} IN (${[...files].map(sqlLiteral).join(", ")})`
}

/** A short words-only description of the scope, for "N of M" captions. */
export function scopeLabel(): string {
    const scope = useScopeStore()
    const parts = scope.byDimension.map(b => listOf(b.groups.map(g => g.name), "disjunction"))
    if (scope.query.trim()) parts.push(t("groups.scopeSql.matching", { query: scope.query.trim() }))
    if (scope.facet !== "all") parts.push(scope.facet === "test" ? t("groups.scopeSql.testFiles") : t("groups.scopeSql.productionFiles"))
    return parts.join(", ")
}
