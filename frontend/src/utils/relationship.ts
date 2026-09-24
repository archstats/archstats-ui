// How two groups of modules relate, read as a relationship.
//
// Clicking the link between two lanes used to land on a twenty-by-twenty grid
// of individual modules. That drops two grains in one step: the question was
// about Data access and Logic & Other, and the answer was a wall of
// QueryBuilder, MongoCrud, S3Configuration. The relationship itself -- how
// much runs each way, which modules actually cross the boundary, and what is
// wrong at it -- was never stated.
//
// Measured on LibreChat, a boundary is long-tailed: 1,391 file dependencies
// spread over 622 senders, most carrying one or two, a handful carrying
// fifteen to twenty-two. The handful is the story and a grid buries it.

import type { Reference } from "~/utils/findings"

/** One module that crosses the boundary, and how far it reaches. */
export interface Crossing {
    path: string
    /** Distinct modules on the other side. */
    partners: string[]
    /** Unit references carried across. */
    weight: number
}

export type AnomalyKind = "cycle" | "against-grain" | "bottleneck" | "wide"

export interface Anomaly {
    id: string
    kind: AnomalyKind
    /** The claim, in the product's own words. */
    headline: string
    detail: string
    tone: "warn" | "neutral"
    /** Modules to light up when this is opened. */
    paths: string[]
    /** The dependencies behind it, so it can be inspected rather than taken. */
    references: Reference[]
}

export interface Relationship {
    /** References running the way most of them run, and the ones that do not. */
    forward: Reference[]
    backward: Reference[]
    /** Modules that reach across, most-reaching first. */
    senders: Crossing[]
    /** Modules reached, most-depended-on first. */
    receivers: Crossing[]
    /** The modules sending against the grain, which is usually the finding. */
    returners: Crossing[]
    anomalies: Anomaly[]
}

export interface RelationshipInput {
    references: Reference[]
    /** Lane of each module, so the two directions can be told apart. */
    laneOf: Map<string, string>
    /** The two lanes, in the order the region names them. */
    a: string
    b: string
    nameOf: (path: string) => string
    labelOf: (lane: string) => string
}

/** A receiver this many senders share is the boundary's single point of failure. */
const BOTTLENECK_SHARE = 0.4
const BOTTLENECK_MIN = 4
/** A sender reaching this many modules is not a port, it is a leak. */
const WIDE = 5

export function readRelationship(
    { references, laneOf, a, b, nameOf, labelOf }: RelationshipInput,
): Relationship {
    // Which way most of it runs decides which direction is "the grain"; the
    // minority is what an architect came to argue about.
    const fromA = references.filter((r) => laneOf.get(r.from) === a)
    const fromB = references.filter((r) => laneOf.get(r.from) === b)
    const aLeads = fromA.length >= fromB.length
    const forward = aLeads ? fromA : fromB
    const backward = aLeads ? fromB : fromA
    const [head, tail] = aLeads ? [a, b] : [b, a]

    const senders = crossings(forward, "from")
    const receivers = crossings(forward, "to")
    const returners = crossings(backward, "from")

    const anomalies: Anomaly[] = []

    // A cycle is the thing you cannot pull apart, so it leads.
    const directed = new Set(references.map((r) => r.from + "\n" + r.to))
    const seen = new Set<string>()
    const cycles: Reference[] = []
    for (const r of references) {
        if (!directed.has(r.to + "\n" + r.from)) continue
        const key = [r.from, r.to].sort().join("\n")
        if (seen.has(key)) continue
        seen.add(key)
        cycles.push(r)
    }
    if (cycles.length > 0) {
        anomalies.push({
            id: "cycle",
            kind: "cycle",
            headline: cycles.length === 1
                ? `${nameOf(cycles[0].from)} and ${nameOf(cycles[0].to)} import each other.`
                : `${cycles.length} pairs here import each other.`,
            detail: "Neither side can be extracted, tested or replaced on its own.",
            tone: "warn",
            paths: [...new Set(cycles.flatMap((r) => [r.from, r.to]))],
            references: cycles,
        })
    }

    if (backward.length > 0) {
        const share = Math.round((backward.length / references.length) * 100)
        anomalies.push({
            id: "against-grain",
            kind: "against-grain",
            headline: `${backward.length} ${backward.length === 1 ? "reference runs" : "references run"} ` +
                `from ${labelOf(tail)} back into ${labelOf(head)}.`,
            detail: `${share}% of the traffic here, against the direction of the other ${forward.length}. ` +
                `${returners.length} ${returners.length === 1 ? "module is" : "modules are"} responsible.`,
            tone: "warn",
            paths: [...new Set(backward.flatMap((r) => [r.from, r.to]))],
            references: backward,
        })
    }

    // One module everything leans on is a different problem from many.
    const top = receivers[0]
    if (top && top.partners.length >= BOTTLENECK_MIN &&
        top.partners.length >= senders.length * BOTTLENECK_SHARE) {
        anomalies.push({
            id: "bottleneck",
            kind: "bottleneck",
            headline: `${nameOf(top.path)} carries ${top.partners.length} of the ${senders.length} crossings.`,
            detail: "Most of this boundary is one module. Changing it touches everything that crosses.",
            tone: "warn",
            paths: [top.path, ...top.partners],
            references: forward.filter((r) => r.to === top.path),
        })
    }

    const widest = senders[0]
    if (widest && widest.partners.length >= WIDE) {
        anomalies.push({
            id: "wide",
            kind: "wide",
            headline: `${nameOf(widest.path)} reaches ${widest.partners.length} modules across the boundary.`,
            detail: "A module crossing this widely is not using an interface, it is using the internals.",
            tone: "warn",
            paths: [widest.path, ...widest.partners],
            references: forward.filter((r) => r.from === widest.path),
        })
    }

    // Saying a boundary is clean is a reading too, and the absence of any
    // warning otherwise reads as the screen having failed to load.
    if (anomalies.length === 0) {
        anomalies.push({
            id: "clean",
            kind: "wide",
            headline: "Nothing is wrong at this boundary.",
            detail: `Every reference runs from ${labelOf(head)} into ${labelOf(tail)}, ` +
                `no pair imports back, and no single module carries it.`,
            tone: "neutral",
            paths: [],
            references: [],
        })
    }

    return { forward, backward, senders, receivers, returners, anomalies }
}

/** Group references by one end, ranked by how far that end reaches. */
function crossings(references: Reference[], side: "from" | "to"): Crossing[] {
    const other = side === "from" ? "to" : "from"
    const index = new Map<string, { partners: Set<string>; weight: number }>()
    for (const r of references) {
        const entry = index.get(r[side]) ?? { partners: new Set<string>(), weight: 0 }
        entry.partners.add(r[other])
        entry.weight += r.weight
        index.set(r[side], entry)
    }
    return [...index.entries()]
        .map(([path, e]) => ({ path, partners: [...e.partners], weight: e.weight }))
        // Ties broken by path so the order never shuffles between renders.
        .sort((x, y) => y.partners.length - x.partners.length || y.weight - x.weight ||
            x.path.localeCompare(y.path))
}
