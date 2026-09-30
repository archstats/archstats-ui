// Measures by the words people use for them: "size", "dependents",
// "churn", "health", mapped to the column that honestly answers them. The
// file-counting coupling columns go to the component counts (a trap: they
// count importing files, not components).

import type { Snapshot } from "./snapshot"

/** Friendly words to the column that answers them; the file-counting coupling columns go to the component counts. */
export const METRIC_WORDS: Record<string, string> = {
    size: "complexity__lines", lines: "complexity__lines", loc: "complexity__lines", largest: "complexity__lines", biggest: "complexity__lines",
    files: "complexity__files",
    dependents: "modularity__coupling__dependents", "used by": "modularity__coupling__dependents", "fan-in": "modularity__coupling__dependents", fan_in: "modularity__coupling__dependents", afferent: "modularity__coupling__dependents", modularity__coupling__afferent: "modularity__coupling__dependents",
    dependencies: "modularity__coupling__dependencies", "fan-out": "modularity__coupling__dependencies", fan_out: "modularity__coupling__dependencies", efferent: "modularity__coupling__dependencies", modularity__coupling__efferent: "modularity__coupling__dependencies",
    instability: "modularity__instability", abstractness: "modularity__abstractness", distance: "modularity__distance_main_sequence", "main sequence": "modularity__distance_main_sequence",
    churn: "git__commits__total", commits: "git__commits__total", changes: "git__commits__total",
    "recent churn": "git__commits__last_90_days", "recent commits": "git__commits__last_90_days", recent: "git__commits__last_90_days",
    authors: "git__authors__total", health: "codesmells__code_health", "code health": "codesmells__code_health",
    hotspot: "codesmells__hotspot_score", hotspots: "codesmells__hotspot_score", complexity: "codesmells__static_complexity_score",
    pagerank: "graph__page_rank", "page rank": "graph__page_rank", centrality: "graph__page_rank", importance: "graph__page_rank", betweenness: "graph__betweenness",
    age: "git__age_in_days", "last change": "git__last_change_age_in_days", stale: "git__last_change_age_in_days",
    cycles: "cycles", tangled: "cycles", tangle: "cycles", circular: "cycles",
}

export const METRIC_TRAP: Record<string, string> = {
    afferent: "Afferent coupling counts importing files; ranked by dependents (components) instead.",
    modularity__coupling__afferent: "Afferent coupling counts importing files; ranked by dependents (components) instead.",
    efferent: "Efferent coupling counts importing files; ranked by dependencies (components) instead.",
    modularity__coupling__efferent: "Efferent coupling counts importing files; ranked by dependencies (components) instead.",
}

export function resolveMetric(snap: Snapshot, asked: string, table: "components" | "files"): { id: string; note?: string } | null {
    const q = String(asked ?? "").trim().toLowerCase()
    const cols = snap.columns[table] ?? []
    const note = METRIC_TRAP[q]
    const mapped = METRIC_WORDS[q]
    if (mapped === "cycles") return table === "components" ? { id: "cycles" } : null
    if (mapped && cols.includes(mapped)) return { id: mapped, note }
    if (cols.includes(q)) return { id: q }
    for (const d of snap.definitions().values()) if (d.name.toLowerCase() === q && cols.includes(d.id)) return { id: d.id }
    const part = cols.find(c => c.includes(q.replace(/\s+/g, "_")))
    return part ? { id: part } : null
}

export function metricName(snap: Snapshot, id: string): string {
    if (id === "cycles") return "Cycles it is in"
    return snap.definitions().get(id)?.name || id
}

export function metricShort(snap: Snapshot, id: string): string {
    if (id === "cycles") return "Distinct shortest cycles through it, each counted once."
    return snap.definitions().get(id)?.short ?? ""
}
