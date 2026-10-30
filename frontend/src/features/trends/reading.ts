import { t, intlLocale } from "~/shared/i18n"
import type { AreaCell } from "./areas"
import type { ChangeSet, Move } from "./changes"
import { commitsByArea, type RangeWork } from "./useChangeContext"

// The comparison read in words, before any table: what changed in the
// structure, most consequential first, each line a fact with the names
// behind it and a way to the evidence. Facts, not verdicts: a new link
// between two areas may be exactly what the team meant to do.

export type ReadingTarget = "tangles" | "rules" | "links" | "moves" | "components" | "work"

export interface ReadingItem {
    key: string
    /** The fact, as a sentence that ends where the names begin. */
    lead: string
    /** The names it is about, shown as identifiers after the lead. */
    names: string[]
    /** Names left out of `names`. */
    more: number
    target: ReadingTarget
    /** The area pair to select, for a line about links. */
    cell?: { from: string; to: string }
}

export interface ReadingInput {
    cs: ChangeSet
    cells: AreaCell[]
    areaLabel: (key: string) => string
    areaOf: (component: string) => string | undefined
    work: RangeWork | null
}

const SHOW = 4
const fmt = (n: number) => n.toLocaleString(intlLocale)
const cut = (names: string[], n = SHOW) => ({ names: names.slice(0, n), more: Math.max(0, names.length - n) })

/** Areas ranked by how many of the items fall in them: "domains/payment (4)". */
function byArea(items: string[], areaOf: (c: string) => string | undefined, label: (k: string) => string): string[] {
    const n = new Map<string, number>()
    for (const c of items) { const a = areaOf(c); if (a) n.set(a, (n.get(a) ?? 0) + 1) }
    return [...n.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([a, k]) => `${label(a)} (${fmt(k)})`)
}

export function changeReading({ cs, cells, areaLabel, areaOf, work }: ReadingInput): ReadingItem[] {
    const out: ReadingItem[] = []
    const tangles = cs.tangles ?? []
    const pair = (c: AreaCell) => `${areaLabel(c.from)} → ${areaLabel(c.to)}`

    for (const [i, x] of tangles.filter(x => x.kind === "formed").entries()) {
        out.push({ key: `formed${i}`, lead: t("trends.reading.tangleFormed", { count: x.after.length }), ...cut(x.after), target: "tangles" })
    }
    for (const [i, x] of tangles.filter(x => x.kind === "grew").entries()) {
        out.push({ key: `grew${i}`, lead: t("trends.reading.tangleGrew", { before: fmt(x.before.length), after: fmt(x.after.length) }), ...cut(x.joined), target: "tangles" })
    }
    const rulesNew = cs.rulesNew ?? []
    if (rulesNew.length) out.push({ key: "rulesNew", lead: t("trends.reading.rulesNew", { count: rulesNew.length }), ...cut([...new Set(rulesNew.map(f => f.rule))]), target: "rules" })

    const fresh = cells.filter(c => c.state === "new" && c.from !== c.to).sort((a, b) => b.links - a.links || b.refs - a.refs)
    if (fresh.length) out.push({ key: "linksNew", lead: t("trends.reading.linksNew", { count: fresh.length }), ...cut(fresh.map(pair)), target: "links", cell: fresh.length === 1 ? { from: fresh[0].from, to: fresh[0].to } : undefined })
    const gone = cells.filter(c => c.state === "gone" && c.from !== c.to).sort((a, b) => b.before - a.before)
    if (gone.length) out.push({ key: "linksGone", lead: t("trends.reading.linksGone", { count: gone.length }), ...cut(gone.map(pair)), target: "links", cell: gone.length === 1 ? { from: gone[0].from, to: gone[0].to } : undefined })

    // Depended on by more components: the hubs the change leaned on.
    const leaned = (cs.moves ?? []).filter((m: Move) => m.metric === "modularity__coupling__dependents" && m.after - m.before >= Math.max(3, m.before * 0.25)).sort((a, b) => (b.after - b.before) - (a.after - a.before))
    if (leaned.length) out.push({ key: "hubs", lead: t("trends.reading.moreDependents", { count: leaned.length }), ...cut(leaned.map(m => `${m.component} ${fmt(m.before)} → ${fmt(m.after)}`), 3), target: "moves" })

    for (const [i, x] of tangles.filter(x => x.kind === "dissolved").entries()) {
        out.push({ key: `dissolved${i}`, lead: t("trends.reading.tangleDissolved", { count: x.before.length }), ...cut(x.before), target: "tangles" })
    }
    for (const [i, x] of tangles.filter(x => x.kind === "shrank").entries()) {
        out.push({ key: `shrank${i}`, lead: t("trends.reading.tangleShrank", { before: fmt(x.before.length), after: fmt(x.after.length) }), ...cut(x.left), target: "tangles" })
    }
    const rulesGone = cs.rulesGone ?? []
    if (rulesGone.length) out.push({ key: "rulesGone", lead: t("trends.reading.rulesGone", { count: rulesGone.length }), ...cut([...new Set(rulesGone.map(f => f.rule))]), target: "rules" })

    const added = cs.componentsAdded ?? [], removed = cs.componentsRemoved ?? []
    if (added.length) out.push({ key: "compAdded", lead: t("trends.reading.componentsAdded", { count: added.length }), ...cut(byArea(added, areaOf, areaLabel), 3), target: "components" })
    if (removed.length) out.push({ key: "compRemoved", lead: t("trends.reading.componentsRemoved", { count: removed.length }), ...cut(byArea(removed, areaOf, areaLabel), 3), target: "components" })

    if (work && work.commits) {
        const top = [...commitsByArea(work, areaOf).entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${areaLabel(a)} (${fmt(n)})`)
        out.push({ key: "work", lead: t("trends.reading.work", { commits: t("trends.reading.commits", { count: work.commits }), authors: t("trends.reading.people", { count: work.authors }) }), ...cut(top, 3), target: "work" })
    }
    return out
}
