// What a set of references actually says, instead of listing them.
//
// Clicking a lane-to-lane link produced 911 rows, every one of which read
// "a service imports a repository" -- which is Spring working exactly as
// designed. The architecture was on screen and invisible: `CountryRepository`
// appeared in dozens of those rows and nothing said so.
//
// A region is reached by a question ("why is this tangled?", "what is in
// here?"), so it has to answer one. These are the answers; the enumeration
// stays available behind them for when someone genuinely wants to read it.

import type { Reference } from "~/utils/findings"

export interface Tally {
    path: string
    /** Distinct modules on the other side of the arrow. */
    count: number
    /** Names of a few of them, for a subtitle rather than another list. */
    sample: string[]
}

export interface ReferenceReading {
    total: number
    /** Distinct modules doing the importing, and being imported. */
    sources: number
    targets: number
    /** The median number of imports per importing module. */
    typical: number
    /** Importers pulling in materially more than the typical one. */
    heavy: Tally[]
    /** Imported by the most distinct modules in this region. */
    mostDependedOn: Tally[]
    /** Pairs that import each other. */
    cycles: Array<{ from: string; to: string }>
}

const TOP = 6

/**
 * Read a set of references.
 *
 * Counts are of distinct modules rather than of references: a module edge
 * carrying nine unit references is still one dependency, and ranking by the
 * raw count would put a chatty pair above a genuinely central one.
 */
export function readReferences(references: Reference[]): ReferenceReading {
    const byTarget = new Map<string, Set<string>>()
    const bySource = new Map<string, Set<string>>()
    const cycles: Array<{ from: string; to: string }> = []
    const seenCycle = new Set<string>()

    for (const r of references) {
        add(byTarget, r.to, r.from)
        add(bySource, r.from, r.to)
        if ((r.back ?? 0) > 0) {
            const key = [r.from, r.to].sort().join("\n")
            if (!seenCycle.has(key)) {
                seenCycle.add(key)
                cycles.push({ from: r.from, to: r.to })
            }
        }
    }

    const perSource = [...bySource.values()].map((s) => s.size).sort((a, b) => a - b)
    const typical = perSource.length === 0 ? 0 : perSource[Math.floor(perSource.length / 2)]

    // "More than the typical module" rather than a fixed number, because a
    // codebase where everything imports eight things has no outlier at eight.
    const heavyFloor = Math.max(typical + 1, 3)

    return {
        total: references.length,
        sources: bySource.size,
        targets: byTarget.size,
        typical,
        heavy: rank(bySource).filter((t) => t.count >= heavyFloor).slice(0, TOP),
        mostDependedOn: rank(byTarget).filter((t) => t.count > 1).slice(0, TOP),
        cycles,
    }
}

function add(index: Map<string, Set<string>>, key: string, value: string) {
    const set = index.get(key)
    if (set) set.add(value)
    else index.set(key, new Set([value]))
}

function rank(index: Map<string, Set<string>>): Tally[] {
    return [...index.entries()]
        .map(([path, others]) => ({
            path,
            count: others.size,
            sample: [...others].slice(0, 3),
        }))
        // Ties broken by path so the order never shuffles between renders.
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/**
 * The region in one or two sentences, said in the product's own language.
 *
 * Written from the reading rather than from the raw total, because "911
 * references" is a number to interpret and "312 modules reaching into 89" is
 * a shape.
 */
export function describeReading(
    reading: ReferenceReading,
    nameOf: (path: string) => string,
): string[] {
    if (reading.total === 0) return []
    const out: string[] = []
    const n = (x: number) => x.toLocaleString()

    out.push(
        `${n(reading.total)} references, from ${n(reading.sources)} ` +
        `${reading.sources === 1 ? "module" : "modules"} into ${n(reading.targets)}.`,
    )

    if (reading.typical > 0) {
        const heavier = reading.heavy.length
        out.push(heavier > 0
            ? `A typical one imports ${reading.typical}; ${n(heavier)} import noticeably more.`
            : `A typical one imports ${reading.typical}, and none stands out.`)
    }

    const top = reading.mostDependedOn[0]
    if (top && top.count >= 3) {
        out.push(`${nameOf(top.path)} alone is imported by ${top.count} of them.`)
    }

    if (reading.cycles.length > 0) {
        out.push(reading.cycles.length === 1
            ? `One pair here imports each other.`
            : `${reading.cycles.length} pairs here import each other.`)
    }

    return out
}
