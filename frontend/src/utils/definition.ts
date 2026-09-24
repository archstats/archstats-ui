import { DERIVED_METRICS, type DerivedMetric } from "~/utils/derivedMetrics"

interface Definition {
    id: string;
    name: string;
    short: string;
    long: string;
    short_description?: string;
    long_description?: string;
    /** The family the engine files the metric under (revision 2); empty in older snapshots. */
    category?: string;
}

export type {
    Definition
}

// Older snapshots carry no category; the id's first segment is the family.
const PREFIX_CATEGORIES: Record<string, string> = {
    complexity: "Size and complexity",
    codesmells: "Code health",
    modularity: "Modularity",
    graph: "Graph position",
    community: "Communities",
    git: "History",
    cycles: "Cycles",
    group: "Tangles",
    walker: "Scan coverage",
    java: "Java",
    csharp: "C#",
}

export function categoryOf(def: Pick<Definition, "id" | "category">): string {
    if (def.category) return def.category
    const prefix = def.id.split("__")[0]
    return PREFIX_CATEGORIES[prefix] ?? (prefix ? prefix[0].toUpperCase() + prefix.slice(1) : "Other")
}

/** One entry in the reference: an engine definition, or one the app computes. */
export interface ReferenceEntry {
    id: string
    name: string
    category: string
    short: string
    long: string
    /** Set for numbers the app computes; the SQL that reproduces them. */
    derived?: DerivedMetric
}

export function referenceEntries(defs: Iterable<Definition>): ReferenceEntry[] {
    const out: ReferenceEntry[] = []
    for (const d of defs) out.push({ id: d.id, name: d.name || d.id, category: categoryOf(d), short: d.short, long: d.long })
    for (const m of DERIVED_METRICS) out.push({ id: m.id, name: m.name, category: m.category, short: m.short, long: m.long, derived: m })
    return out
}

/** `**Name** (`id`): short`, then the long text: pasteable into a glossary. */
export function definitionMarkdown(e: Pick<ReferenceEntry, "id" | "name" | "short" | "long" | "derived">): string {
    const head = `**${e.name}** (\`${e.id}\`): ${e.short}`.trim()
    const parts = [head]
    if (e.long && e.long !== e.short) parts.push(e.long)
    if (e.derived) parts.push(e.derived.sql ? "Computed by the app:\n\n```sql\n" + e.derived.sql + "\n```" : `Computed by the app. ${e.derived.method ?? ""}`.trim())
    return parts.join("\n\n")
}

/** Every entry, grouped by category, as a Markdown glossary. */
export function glossaryMarkdown(entries: ReferenceEntry[]): string {
    const byCat = new Map<string, ReferenceEntry[]>()
    for (const e of entries) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e])
    const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b))
    return cats.map(c => `## ${c}\n\n` + byCat.get(c)!.sort((a, b) => a.name.localeCompare(b.name)).map(definitionMarkdown).join("\n\n")).join("\n\n") + "\n"
}
