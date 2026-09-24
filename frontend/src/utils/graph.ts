// Readings that any directed graph in this app can be asked for.
//
// Written against the edge shape rather than against units or modules,
// because the same four questions are worth asking at both grains and the
// answers should not differ by which file they were implemented in.

export interface Edge {
    from: string
    to: string
}

/**
 * Everything a change to this node could reach, and how far away it is.
 *
 * One hop answers "what does this touch"; the question an architect actually
 * arrives with is "what breaks if I change this", and that is transitive.
 * Breadth-first so the depth is the true shortest distance, and bounded so a
 * hub in a dense graph cannot walk the whole codebase.
 */
export function blastRadius<E extends Edge>(
    edges: E[],
    id: string,
    direction: "uses" | "usedBy",
    maxDepth = 6,
): Map<string, number> {
    const next = new Map<string, string[]>()
    for (const e of edges) {
        const [from, to] = direction === "uses" ? [e.from, e.to] : [e.to, e.from]
        const list = next.get(from)
        if (list) list.push(to)
        else next.set(from, [to])
    }

    const depths = new Map<string, number>()
    let frontier = [id]
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const found: string[] = []
        for (const current of frontier) {
            for (const neighbour of next.get(current) ?? []) {
                if (neighbour === id || depths.has(neighbour)) continue
                depths.set(neighbour, depth)
                found.push(neighbour)
            }
        }
        frontier = found
    }
    return depths
}

/** How far a change to one node can travel. */
export interface Reach {
    count: number
    /** The distance to the furthest node affected. */
    hops: number
}

/**
 * What a change here can break, and how far away the furthest of it is.
 *
 * Unbounded. It used blastRadius's default depth of six, so "reaches N
 * modules, up to 6 hops away" was the cap talking: 270 of Broadleaf's modules
 * reach further, one of them missing 342 of the 708 modules it reaches. The
 * walk is breadth-first over each edge once, so there is no cost reason to
 * stop early.
 */
export function reachOf<E extends Edge>(edges: E[], id: string): Reach {
    const depths = blastRadius(edges, id, "usedBy", Number.POSITIVE_INFINITY)
    let hops = 0
    for (const d of depths.values()) if (d > hops) hops = d
    return { count: depths.size, hops }
}

/** Nodes in a two-step cycle: each uses the other. */
export function mutualPairs<E extends Edge>(edges: E[]): Array<[string, string]> {
    const seen = new Set<string>()
    for (const e of edges) seen.add(e.from + "\n" + e.to)
    const out: Array<[string, string]> = []
    const done = new Set<string>()
    for (const e of edges) {
        if (!seen.has(e.to + "\n" + e.from)) continue
        const key = [e.from, e.to].sort().join("\n")
        if (done.has(key)) continue
        done.add(key)
        out.push([e.from, e.to])
    }
    return out
}

export interface LaneFlow {
    from: string
    to: string
    count: number
    /** Edges running the other way between the same two lanes. */
    reverse: number
}

/**
 * Which lane depends on which, and how one-directional it is.
 *
 * A dependency that runs one way is a layer. One that runs both ways is two
 * things that cannot be separated, which is the finding worth surfacing.
 */
export function laneFlows<E extends Edge>(
    laneOf: Map<string, string>,
    edges: E[],
): LaneFlow[] {
    const pairs = new Map<string, number>()
    for (const e of edges) {
        const from = laneOf.get(e.from)
        const to = laneOf.get(e.to)
        if (!from || !to || from === to) continue
        const key = from + "\n" + to
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }

    const out: LaneFlow[] = []
    for (const [key, count] of pairs) {
        const [from, to] = key.split("\n")
        out.push({ from, to, count, reverse: pairs.get(to + "\n" + from) ?? 0 })
    }
    return out.sort((a, b) => b.count - a.count)
}
