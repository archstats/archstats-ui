// The one place exhibits are made: a spec checked against its definition,
// its data computed once per scan (cached), and presented as a part to keep,
// facts to cite and the text a model reads. Nothing here draws; ExhibitView
// and the render host do that from the same spec.

import { stableKey } from "./schema"
import type { Snapshot } from "~/features/snapshot/snapshot"
import { isAbsent, type Absent, type ExhibitDef, type ExhibitPart, type ExhibitRanOn, type ExhibitSpec, type Fact, type ResolveContext } from "./types"
import { t } from "~/shared/i18n"

// The definitions are registered by the catalog (features/exhibit-catalog),
// which knows every feature; the engine knows none of them.
const byKind = new Map<string, ExhibitDef>()

/** Adds definitions to the engine; a kind registered twice keeps the last. */
export function registerExhibits(defs: readonly ExhibitDef[]): void {
    for (const d of defs) byKind.set(d.kind, d)
}

export const defOf = (kind: string): ExhibitDef | null => byKind.get(kind) ?? null

// Where a drawn exhibit reads its scan: the app registers its stores and SQL
// (exhibit-catalog/app); the kernel never reaches for them itself.
let snapshotSource: ((scanId: string) => Promise<Snapshot>) | null = null

export function registerSnapshotSource(source: (scanId: string) => Promise<Snapshot>): void {
    snapshotSource = source
}

export function snapshotOf(scanId: string): Promise<Snapshot> {
    if (!snapshotSource) return Promise.reject(new Error(t("exhibits.engine.noSnapshotSourceRegistered")))
    return snapshotSource(scanId)
}

/** The most facts one exhibit hands a model; definitions cap themselves well below this. */
export const MAX_FACTS = 30
/** Rows kept with a part so an old conversation can show the table without the scan. */
const KEPT_ROWS = 40

export type Checked = { spec: ExhibitSpec; def: ExhibitDef; dropped: string[] }

/** A spec made valid, or why it cannot be. */
export function check(kind: string, params: unknown): Checked | { error: string } {
    const def = defOf(kind)
    if (!def) return { error: t("exhibits.engine.noExhibit", { kind }) }
    const parsed = def.params.parse(params)
    if ("error" in parsed) return parsed
    return { def, spec: { kind: def.kind, v: def.v, params: parsed.value as Record<string, unknown> }, dropped: parsed.dropped }
}

// Resolved data per scan and spec. Small and bounded: a conversation or a report
// asks for the same few exhibits again and again (drawing, re-drawing, exporting).
const cache = new Map<string, Promise<unknown>>()
const CACHE_MAX = 60

export function resolve(spec: ExhibitSpec, ctx: ResolveContext): Promise<unknown | Absent> {
    const def = defOf(spec.kind)
    if (!def) return Promise.resolve({ absent: t("exhibits.engine.noExhibit", { kind: spec.kind }) })
    const key = `${ctx.snap.scanId}|${spec.kind}|${spec.v}|${stableKey(spec.params)}`
    let hit = cache.get(key)
    if (!hit) {
        hit = def.resolve(spec.params, ctx)
        hit.catch(() => cache.delete(key))
        cache.set(key, hit)
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
    }
    return hit
}

export function clearExhibitCache(scanId?: string) {
    if (!scanId) { cache.clear(); return }
    for (const k of [...cache.keys()]) if (k.startsWith(`${scanId}|`)) cache.delete(k)
}

export interface Presented {
    part: ExhibitPart
    /** What the model reads: the title line, then one line per fact with its id. */
    text: string
}

/** An exhibit made for a conversation: computed, stated as facts, kept as a part. */
export async function present(spec: ExhibitSpec, ctx: ResolveContext & { id: string; ranOn: ExhibitRanOn }): Promise<Presented | Absent> {
    const def = defOf(spec.kind)
    if (!def) return { absent: t("exhibits.engine.noExhibit", { kind: spec.kind }) }
    const data = await resolve(spec, ctx)
    if (isAbsent(data)) return data
    const title = def.title(spec.params, data)
    const facts: Fact[] = def.facts(data, spec.params).slice(0, def.maxFacts ?? MAX_FACTS).map((f, i) => ({ ...f, id: `${ctx.id}.${i + 1}` }))
    const table = def.table(data, spec.params)
    const part: ExhibitPart = {
        id: ctx.id, spec, title, ranOn: ctx.ranOn, facts,
        table: { ...table, rows: table.rows.slice(0, KEPT_ROWS), total: table.total ?? table.rows.length },
        open: def.open?.(spec.params, data) ?? null,
    }
    return { part, text: factsText(part) }
}

export function factsText(part: Pick<ExhibitPart, "id" | "title" | "facts">): string {
    return [`[${part.id}] ${part.title}`, ...part.facts.map(f => `[${f.id}] ${f.text}`)].join("\n")
}

/** The elements a set of cited facts points at, for lighting a figure beside the sentence that cites them. */
export function highlightFor(part: ExhibitPart, citedFactIds: Iterable<string>): string[] {
    const cited = new Set(citedFactIds)
    return [...new Set(part.facts.filter(f => cited.has(f.id) && f.element).map(f => f.element!))]
}
