import { has, locale, t } from "~/shared/i18n"
import { DERIVED_METRICS, type DerivedMetric } from "./derivedMetrics"

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
    complexity: "sizeAndComplexity",
    codesmells: "codeHealth",
    modularity: "modularity",
    graph: "graphPosition",
    community: "communities",
    git: "history",
    cycles: "cycles",
    group: "tangles",
    walker: "scanCoverage",
    java: "java",
    csharp: "csharp",
}

/** The key a category is stored under: "Modularity & Component Structure" → "modularityComponentStructure". */
export function categoryKey(name: string): string {
    const words = name.toLowerCase().replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    return words.map((w, i) => (i && w ? w[0].toUpperCase() + w.slice(1) : w)).join("")
}

/** A category's name in the app's language; one the messages lack keeps its own. */
function categoryName(key: string, fallback: string): string {
    return has(`definitions.categories.${key}`) ? t(`definitions.categories.${key}`) : fallback
}

export function categoryOf(def: Pick<Definition, "id" | "category">): string {
    if (def.category) return categoryName(categoryKey(def.category), def.category)
    const prefix = def.id.split("__")[0]
    const key = PREFIX_CATEGORIES[prefix]
    if (key) return categoryName(key, key)
    return prefix ? prefix[0].toUpperCase() + prefix.slice(1) : t("definitions.categories.other")
}

/**
 * A snapshot's definition in the app's language. In English the snapshot's
 * own text stands, since it is what the scan that wrote it said; in another
 * language the translation of the same metric id replaces it, and a metric
 * the messages do not know keeps its English.
 */
export function localized<D extends Pick<Definition, "id" | "name" | "short" | "long">>(def: D): D {
    if (locale === "en") return def
    let key = `definitions.metrics.${def.id}`
    let params: Record<string, number> | undefined
    if (!has(`${key}.name`)) {
        // The engine writes a definition per history window ("git__commits__last_90_days").
        const windowed = /^(.+)__last_(\d+)_days$/.exec(def.id)
        if (!windowed || !has(`definitions.windowed.${windowed[1]}.name`)) return def
        key = `definitions.windowed.${windowed[1]}`
        params = { days: Number(windowed[2]) }
    }
    const out = { ...def, name: t(`${key}.name`, params), short: t(`${key}.short`, params), long: t(`${key}.long`, params) }
    if ("short_description" in out) Object.assign(out, { short_description: out.short, long_description: out.long })
    return out
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
    if (e.derived) parts.push(e.derived.sql ? t("definitions.computedSql") + "\n\n```sql\n" + e.derived.sql + "\n```" : `${t("definitions.computed")} ${e.derived.method ?? ""}`.trim())
    return parts.join("\n\n")
}

/** Every entry, grouped by category, as a Markdown glossary. */
export function glossaryMarkdown(entries: ReferenceEntry[]): string {
    const byCat = new Map<string, ReferenceEntry[]>()
    for (const e of entries) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e])
    const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b))
    return cats.map(c => `## ${c}\n\n` + byCat.get(c)!.sort((a, b) => a.name.localeCompare(b.name)).map(definitionMarkdown).join("\n\n")).join("\n\n") + "\n"
}
