import { commonPrefix, detectSeparator } from "~/features/snapshot/names"
import { pathKey, pathLabel } from "~/features/connections/neighbours"
import { t } from "~/shared/i18n"

// Where a change landed, read at the scale of areas rather than components.
//
// A change set lists component dependencies one by one; two hundred of them
// read as noise. Rolled up into areas (the folders or packages the names
// already form) they answer the question that matters: which parts of the
// code now depend on which others, and which of those links are new.
//
// Areas are cut adaptively: a fixed depth is useless where one root holds
// everything (`src/…` at depth 1) or where the roots are many. The largest
// area is split into its children for as long as the count stays under the
// cap, so big areas are read finer and small ones stay whole.

export interface Areas {
    /** Component → its area key. */
    areaOf: Map<string, string>
    /** Area keys, as cut. */
    keys: string[]
    /** Components per area. */
    size: Map<string, number>
    prefix: string
    separator: string
    /** Areas that gave their largest parts away and hold the rest. */
    rest: Set<string>
}

export function adaptiveAreas(names: string[], max = 16): Areas {
    const uniq = [...new Set(names)].sort()
    const separator = detectSeparator(uniq)
    // A Java codebase can carry a few path-named web folders: each name is
    // cut by its own delimiter, and only the dominant kind shares a prefix.
    const sepOf = (n: string) => (separator !== "/" && n.includes("/") ? "/" : separator)
    const prefix = commonPrefix(uniq.filter(n => sepOf(n) === separator), separator)
    const keyAt = (n: string, depth: number) => {
        if (n === "." || n === "/") return n
        const sep = sepOf(n)
        return pathKey(n, sep, depth, sep === separator ? prefix : "")
    }

    interface Area { members: string[]; depth: number }
    const areas = new Map<string, Area>()
    for (const n of uniq) {
        const k = keyAt(n, 1)
        if (!areas.has(k)) areas.set(k, { members: [], depth: 1 })
        areas.get(k)!.members.push(n)
    }
    /** The area's members by their next informative level, or null when it has none. */
    const children = (a: Area): { depth: number; parts: Map<string, string[]> } | null => {
        for (let d = a.depth + 1; ; d++) {
            const parts = new Map<string, string[]>()
            for (const n of a.members) {
                const k = keyAt(n, d)
                if (!parts.has(k)) parts.set(k, [])
                parts.get(k)!.push(n)
            }
            if (parts.size > 1) return { depth: d, parts }
            // Every member is its own key at this depth: nothing deeper to read.
            if (a.members.every(n => keyAt(n, d) === n)) return null
        }
    }
    // Areas under 1% of the components do not earn a row of their own; they
    // share one at the end, and do not use up the budget meanwhile.
    const smallCut = uniq.length * 0.01
    const counted = (sizes: number[]) => sizes.filter(n => n >= smallCut).length
    const done = new Set<string>()
    const rest = new Set<string>()
    while (counted([...areas.values()].map(a => a.members.length)) < max) {
        // The largest area is read finer first.
        const next = [...areas.entries()].filter(([k, a]) => a.members.length > 1 && !done.has(k)).sort((x, y) => y[1].members.length - x[1].members.length || (x[0] < y[0] ? -1 : 1))[0]
        if (!next) break
        const [key, area] = next
        const split = children(area)
        if (!split) { done.add(key); continue }
        const parts = [...split.parts.entries()].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))
        const now = counted([...areas.values()].map(a => a.members.length))
        if (now - (area.members.length >= smallCut ? 1 : 0) + counted(parts.map(p => p[1].length)) <= max) {
            // The small parts stay together under the area's own name, rather
            // than each taking a row or leaving for the shared one.
            const big = parts.filter(p => p[1].length >= smallCut)
            const small = parts.filter(p => p[1].length < smallCut)
            // Splitting into nothing but crumbs reads no better than the whole.
            if (!big.length) { done.add(key); continue }
            if (small.length > 1 && big.length) {
                if (big.length === 1 && big[0][1].length + small.reduce((n, p) => n + p[1].length, 0) === area.members.length && big[0][0] === key) { done.add(key); continue }
                for (const [k, v] of big) if (k !== key) areas.set(k, { members: v, depth: split.depth })
                area.members = small.flatMap(p => p[1]).concat(big.find(p => p[0] === key)?.[1] ?? [])
                rest.add(key)
                if (!big.some(p => p[0] !== key)) done.add(key)
                continue
            }
            areas.delete(key)
            for (const [k, v] of parts) areas.set(k, { members: v, depth: split.depth })
            continue
        }
        // Too many children to show them all: peel off the largest, and the
        // rest stays in the area under its own name.
        const [k, v] = parts[0]
        if (v.length < 2 || k === key) { done.add(key); continue }
        areas.set(k, { members: v, depth: split.depth })
        const left = new Set(v)
        area.members = area.members.filter(n => !left.has(n))
        rest.add(key)
    }
    const small = [...areas.entries()].filter(([, a]) => a.members.length < smallCut)
    if (small.length > 1) {
        areas.set(OTHER, { members: small.flatMap(([, a]) => a.members), depth: 0 })
        for (const [k] of small) areas.delete(k)
    }
    const areaOf = new Map<string, string>()
    const size = new Map<string, number>()
    for (const [k, a] of areas) { size.set(k, a.members.length); for (const n of a.members) areaOf.set(n, k) }
    return { areaOf, keys: [...areas.keys()].sort(), size, prefix, separator, rest }
}

/** The area that holds the small ones together. */
export const OTHER = "\u0000other"

export function areaLabel(areas: Areas, key: string): string {
    if (key === OTHER) return t("trends.areas.otherAreas")
    return pathLabel(key, areas.prefix)
}

export interface CompEdge { from: string; to: string; refs: number }

export type CellState = "same" | "new" | "gone" | "changed"

/** One area pair: row imports column. */
export interface AreaCell {
    from: string
    to: string
    /** Component dependencies between the two now, and their references. */
    links: number
    refs: number
    /** Component dependencies that started, and stopped. */
    added: number
    removed: number
    /** Links before: now − started + stopped. */
    before: number
    state: CellState
}

/**
 * The area matrix: every area pair that has a component dependency now or
 * had one before. `head` is every dependency in the newer snapshot; `added`
 * and `removed` are the change set's.
 */
export function areaCells(areas: Areas, head: CompEdge[], added: CompEdge[], removed: CompEdge[]): AreaCell[] {
    const cells = new Map<string, AreaCell>()
    const cell = (e: CompEdge) => {
        const from = areas.areaOf.get(e.from), to = areas.areaOf.get(e.to)
        if (!from || !to) return null
        const k = `${from}\u0000${to}`
        if (!cells.has(k)) cells.set(k, { from, to, links: 0, refs: 0, added: 0, removed: 0, before: 0, state: "same" })
        return cells.get(k)!
    }
    for (const e of head) { const c = cell(e); if (c) { c.links++; c.refs += e.refs } }
    for (const e of added) { const c = cell(e); if (c) c.added++ }
    for (const e of removed) { const c = cell(e); if (c) c.removed++ }
    for (const c of cells.values()) {
        c.before = c.links - c.added + c.removed
        c.state = c.links > 0 && c.before === 0 ? "new" : c.links === 0 && c.before > 0 ? "gone" : c.added || c.removed ? "changed" : "same"
    }
    return [...cells.values()]
}

/**
 * Areas from those that depend most to those depended on most, by the share
 * of their cross-area references that go out. Row imports column, so with
 * this order most imports sit above the diagonal and the ones below it run
 * the other way.
 */
export function orderAreas(keys: string[], cells: AreaCell[]): string[] {
    const out = new Map(keys.map(k => [k, 0])), inn = new Map(keys.map(k => [k, 0]))
    for (const c of cells) {
        if (c.from === c.to) continue
        const w = Math.max(c.refs, c.before ? 1 : 0)
        out.set(c.from, (out.get(c.from) ?? 0) + w)
        inn.set(c.to, (inn.get(c.to) ?? 0) + w)
    }
    const share = (k: string) => { const o = out.get(k) ?? 0, i = inn.get(k) ?? 0; return o + i ? o / (o + i) : 0 }
    return [...keys].sort((a, b) => share(b) - share(a) || (a < b ? -1 : 1))
}

/** Cells that carry a change, the new and gone links first, then by how much moved. */
export function changedCells(cells: AreaCell[]): AreaCell[] {
    const rank: Record<CellState, number> = { new: 0, gone: 1, changed: 2, same: 3 }
    return cells.filter(c => c.state !== "same").sort((a, b) => rank[a.state] - rank[b.state] || (b.added + b.removed) - (a.added + a.removed) || (a.from + a.to < b.from + b.to ? -1 : 1))
}
