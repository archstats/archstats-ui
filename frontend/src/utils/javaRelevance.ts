// Relevance of unexplored classes to an explored set, for the seed-and-expand
// explorer in the Classes view. A reduced form of the old Spring Bean engine:
// direct references count in full, one-hop transitive references count at half
// weight, well-known hubs (high in-degree utilities, base classes) are
// penalised so the next layer favours the specific over the ubiquitous, and
// classes that fan out to many others lose a little for the same reason.

/** from -> to -> reference count */
export type Adjacency = Map<string, Map<string, number>>;

export interface RelevanceEntry {
    /** 0–100, normalised so the best candidate scores 100. */
    score: number;
    /** Strongest direct reference to or from the explored set. */
    direct: number;
    /** Strongest one-hop reference through a neighbour of the explored set. */
    indirect: number;
    /** The explored class this candidate is reached through most strongly. */
    via: string | null;
    /** Referenced from many places: a utility or base class, shown apart. */
    hub: boolean;
    /** Looks like a test class. */
    test: boolean;
    /** Sits in the same package or component as something already explored. */
    near: "package" | "component" | null;
}

export interface RelevanceOptions {
    /** Component of a class; candidates in a component the exploration already touches score higher. */
    componentOf?: (id: string) => string | undefined;
    /** Package of a class; candidates in a package the exploration already touches score higher still. Defaults to the id up to its last dot. */
    packageOf?: (id: string) => string | undefined;
    /** Lane index of a class; candidates one lane away from their `via` score higher (the flow of a layered app). */
    laneIndexOf?: (id: string) => number | undefined;
    /** In-degree from which a class counts as a hub. */
    hubInDegree?: number;
}

const TEST_NAME = /(Test|Tests|IT|Spec)$/;

/** `com.acme.audit.AuditService` → `com.acme.audit`; a bare name has no package. */
function defaultPackageOf(id: string): string | undefined {
    const i = id.lastIndexOf(".");
    return i > 0 ? id.slice(0, i) : undefined;
}

function edgeWeight(out: Adjacency, a: string, b: string): number {
    return (out.get(a)?.get(b) ?? 0) + (out.get(b)?.get(a) ?? 0);
}

function neighbours(out: Adjacency, inc: Adjacency, id: string): Set<string> {
    const set = new Set<string>();
    out.get(id)?.forEach((_, t) => set.add(t));
    inc.get(id)?.forEach((_, s) => set.add(s));
    return set;
}

/** Build the reverse adjacency (to -> from -> count) of `out`. */
export function reverseAdjacency(out: Adjacency): Adjacency {
    const inc: Adjacency = new Map();
    out.forEach((targets, from) => {
        targets.forEach((count, to) => {
            if (!inc.has(to)) inc.set(to, new Map());
            inc.get(to)!.set(from, (inc.get(to)!.get(from) ?? 0) + count);
        });
    });
    return inc;
}

/**
 * Score every class adjacent (within two hops) to the explored set.
 * Explored classes are never candidates. `known` limits candidates to classes
 * the caller can show (for instance those with a file in the snapshot).
 */
export function scoreCandidates(
    explored: Iterable<string>,
    out: Adjacency,
    inc: Adjacency = reverseAdjacency(out),
    known: (id: string) => boolean = () => true,
    options: RelevanceOptions = {},
): Map<string, RelevanceEntry> {
    const exploredSet = new Set(explored);
    const result = new Map<string, RelevanceEntry>();
    if (exploredSet.size === 0) return result;
    const hubInDegree = options.hubInDegree ?? 12;

    const best = new Map<string, { direct: number; indirect: number; via: string | null; viaWeight: number }>();
    const bump = (id: string, kind: "direct" | "indirect", weight: number, via: string) => {
        if (exploredSet.has(id) || !known(id)) return;
        const entry = best.get(id) ?? { direct: 0, indirect: 0, via: null, viaWeight: 0 };
        entry[kind] = Math.max(entry[kind], weight);
        if (weight > entry.viaWeight) { entry.viaWeight = weight; entry.via = via; }
        best.set(id, entry);
    };

    exploredSet.forEach((node) => {
        const firstHop = neighbours(out, inc, node);
        firstHop.forEach((mid) => {
            const w1 = edgeWeight(out, node, mid);
            bump(mid, "direct", w1, node);
            neighbours(out, inc, mid).forEach((far) => {
                if (far === node) return;
                bump(far, "indirect", 0.5 * (w1 + edgeWeight(out, mid, far)) / 2, node);
            });
        });
    });

    // Divide by ln(e + in-degree): a class referenced from everywhere says
    // little about where the explored set actually goes. Then favour what
    // stays close: a candidate in a package the exploration already touches
    // is most likely part of the same story, one in the same component next;
    // moving one lane along the flow also helps. Tests go down unless the
    // exploration is about tests.
    const packageOf = options.packageOf ?? defaultPackageOf;
    const exploredPackages = new Set<string>();
    const exploredComponents = new Set<string>();
    exploredSet.forEach((id) => {
        const p = packageOf(id); if (p) exploredPackages.add(p);
        const c = options.componentOf?.(id); if (c) exploredComponents.add(c);
    });
    const nearOf = new Map<string, RelevanceEntry["near"]>();
    let max = 0;
    const raw = new Map<string, number>();
    const exploringTests = [...exploredSet].some((id) => TEST_NAME.test(id));
    best.forEach((entry, id) => {
        const inDegree = inc.get(id)?.size ?? 0;
        let value = (entry.direct + entry.indirect) / Math.log(Math.E + inDegree);
        // A class that itself reaches out to many others (an orchestrator or a
        // god class) is a broad next step, not a specific one: shave a little
        // off, growing with the log of its out-degree so 10 references cost
        // about 9% and 100 about 16%.
        const outDegree = out.get(id)?.size ?? 0;
        value /= 1 + 0.04 * Math.log(1 + outDegree);
        const p = packageOf(id);
        const c = options.componentOf?.(id);
        let near: RelevanceEntry["near"] = null;
        if (p && exploredPackages.has(p)) { near = "package"; value *= 1.5; }
        else if (c && exploredComponents.has(c)) { near = "component"; value *= 1.25; }
        nearOf.set(id, near);
        if (entry.via && options.laneIndexOf) {
            const a = options.laneIndexOf(id), b = options.laneIndexOf(entry.via);
            if (a !== undefined && b !== undefined && Math.abs(a - b) === 1) value *= 1.15;
        }
        if (TEST_NAME.test(id) && !exploringTests) value *= 0.3;
        raw.set(id, value);
        if (value > max) max = value;
    });

    best.forEach((entry, id) => {
        const value = raw.get(id) ?? 0;
        result.set(id, {
            score: max > 0 ? Math.round((value / max) * 100) : 0,
            direct: entry.direct,
            indirect: entry.indirect,
            via: entry.via,
            hub: (inc.get(id)?.size ?? 0) >= hubInDegree,
            test: TEST_NAME.test(id),
            near: nearOf.get(id) ?? null,
        });
    });
    return result;
}
