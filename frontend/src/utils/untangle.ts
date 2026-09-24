// Untangling: a tangle is a set of components that can all reach each other
// by following imports (a strongly connected component of two or more). Laid
// out in an order where imports run one way, the few that run against it
// are what make every cycle in the tangle; cutting them leaves layers. This
// finds such an order (keeping the imports against it few and light), draws
// it in layers, and plans the cuts, most untangling first. A plan, not the
// only one: the smallest set of cuts is NP-hard to find, and the reader is
// choosing what to argue for, not proving optimality.

export interface WEdge {
    from: string
    to: string
    /** Import references along the edge. */
    imports: number
    /** Distinct files holding them. */
    files: number
}

export const edgeId = (from: string, to: string) => `${from}\u0000${to}`

// ── Strongly connected components ─────────────────────────────────────────

/** Tarjan's algorithm, iterative, over the edges not cut. */
export function sccs(nodes: Iterable<string>, edges: Iterable<Pick<WEdge, "from" | "to">>, cut?: ReadonlySet<string>): string[][] {
    const adj = new Map<string, string[]>()
    for (const n of nodes) adj.set(n, [])
    for (const e of edges) {
        if (e.from === e.to || (cut && cut.has(edgeId(e.from, e.to)))) continue
        if (!adj.has(e.from) || !adj.has(e.to)) continue
        adj.get(e.from)!.push(e.to)
    }
    let index = 0
    const idx = new Map<string, number>()
    const low = new Map<string, number>()
    const onStack = new Set<string>()
    const stack: string[] = []
    const out: string[][] = []
    for (const root of adj.keys()) {
        if (idx.has(root)) continue
        const work: Array<{ v: string; i: number }> = [{ v: root, i: 0 }]
        idx.set(root, index); low.set(root, index); index++
        stack.push(root); onStack.add(root)
        while (work.length) {
            const top = work[work.length - 1]
            const next = adj.get(top.v)!
            if (top.i < next.length) {
                const w = next[top.i++]
                if (!idx.has(w)) {
                    idx.set(w, index); low.set(w, index); index++
                    stack.push(w); onStack.add(w)
                    work.push({ v: w, i: 0 })
                } else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, idx.get(w)!))
                continue
            }
            work.pop()
            if (work.length) { const p = work[work.length - 1].v; low.set(p, Math.min(low.get(p)!, low.get(top.v)!)) }
            if (low.get(top.v) === idx.get(top.v)) {
                const comp: string[] = []
                let w: string
                do { w = stack.pop()!; onStack.delete(w); comp.push(w) } while (w !== top.v)
                out.push(comp)
            }
        }
    }
    return out
}

/** Tangles: strongly connected sets of two or more, largest first. */
export function tanglesOf(nodes: Iterable<string>, edges: Iterable<Pick<WEdge, "from" | "to">>, cut?: ReadonlySet<string>): string[][] {
    return sccs(nodes, edges, cut).filter(c => c.length > 1).map(c => c.sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

/** How tangled a set is: the sum of each tangle's size squared. Splitting a tangle lowers it before freeing anyone. */
const knot = (ts: string[][]) => ts.reduce((s, t) => s + t.length * t.length, 0)

// ── An order with few imports against it ──────────────────────────────────

/**
 * Importers first, what they import after: an order in which the weight of
 * imports running backwards is small. Eades, Lin and Smyth's greedy,
 * weighted by imports, then a sifting pass that moves each component to
 * where the backward weight is least.
 */
export function orderOf(nodes: string[], edges: WEdge[]): string[] {
    const inside = new Set(nodes)
    const es = edges.filter(e => e.from !== e.to && inside.has(e.from) && inside.has(e.to))
    const out = new Map<string, Map<string, number>>(), inn = new Map<string, Map<string, number>>()
    for (const n of nodes) { out.set(n, new Map()); inn.set(n, new Map()) }
    for (const e of es) {
        out.get(e.from)!.set(e.to, (out.get(e.from)!.get(e.to) ?? 0) + e.imports)
        inn.get(e.to)!.set(e.from, (inn.get(e.to)!.get(e.from) ?? 0) + e.imports)
    }
    const remaining = new Set(nodes)
    const weight = (m: Map<string, number>) => { let s = 0; for (const [k, w] of m) if (remaining.has(k)) s += w; return s }
    const head: string[] = [], tail: string[] = []
    const take = (v: string) => remaining.delete(v)
    // Stable choice: by name, so the same snapshot always draws the same way.
    const sorted = [...nodes].sort()
    while (remaining.size) {
        let moved = true
        while (moved) {
            moved = false
            for (const v of sorted) if (remaining.has(v) && weight(out.get(v)!) === 0) { tail.unshift(v); take(v); moved = true }
            for (const v of sorted) if (remaining.has(v) && weight(inn.get(v)!) === 0) { head.push(v); take(v); moved = true }
        }
        if (!remaining.size) break
        let best = "", bestScore = -Infinity
        for (const v of sorted) {
            if (!remaining.has(v)) continue
            const score = weight(out.get(v)!) - weight(inn.get(v)!)
            if (score > bestScore) { best = v; bestScore = score }
        }
        head.push(best); take(best)
    }
    const order = [...head, ...tail]
    return sift(order, out, inn)
}

/** Moves each component, heaviest first, to the place in the order where the imports against it weigh least. */
function sift(order: string[], out: Map<string, Map<string, number>>, inn: Map<string, Map<string, number>>, passes = 3): string[] {
    const degree = (v: string) => { let s = 0; for (const w of out.get(v)!.values()) s += w; for (const w of inn.get(v)!.values()) s += w; return s }
    const byWeight = [...order].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b))
    let cur = [...order]
    for (let pass = 0; pass < passes; pass++) {
        let improved = false
        for (const v of byWeight) {
            const at = cur.indexOf(v)
            const rest = cur.filter(x => x !== v)
            // v at position p (before rest[p]): v→w is backward when w sits before v, w→v when w sits after.
            const a = rest.map(w => out.get(v)!.get(w) ?? 0)
            const b = rest.map(w => inn.get(v)!.get(w) ?? 0)
            let cost = b.reduce((s, x) => s + x, 0)
            let bestP = 0, bestCost = cost
            let atCost = at === 0 ? cost : NaN
            for (let p = 1; p <= rest.length; p++) {
                cost += a[p - 1] - b[p - 1]
                if (p === at) atCost = cost
                if (cost < bestCost) { bestCost = cost; bestP = p }
            }
            if (bestCost < atCost) { rest.splice(bestP, 0, v); cur = rest; improved = true }
        }
        if (!improved) break
    }
    return cur
}

// ── Layers ────────────────────────────────────────────────────────────────

export interface TangleLayout {
    order: string[]
    /** Importers in layer 0; each import that runs with the order goes to a later layer. */
    layers: string[][]
    layerOf: Map<string, number>
    /** Imports that run with the order. */
    forward: WEdge[]
    /** Imports that run against it: together they make every cycle in the tangle. */
    against: WEdge[]
}

export function layoutTangle(nodes: string[], edges: WEdge[]): TangleLayout {
    const inside = new Set(nodes)
    const es = edges.filter(e => e.from !== e.to && inside.has(e.from) && inside.has(e.to))
    const order = orderOf(nodes, es)
    const pos = new Map(order.map((n, i) => [n, i]))
    const forward = es.filter(e => pos.get(e.from)! < pos.get(e.to)!)
    const layerOf = new Map<string, number>()
    const preds = new Map<string, string[]>()
    for (const e of forward) (preds.get(e.to) ?? preds.set(e.to, []).get(e.to)!).push(e.from)
    for (const n of order) layerOf.set(n, Math.max(-1, ...(preds.get(n) ?? []).map(p => layerOf.get(p)!)) + 1)
    const count = Math.max(0, ...layerOf.values()) + 1
    const layers: string[][] = Array.from({ length: count }, () => [])
    for (const n of order) layers[layerOf.get(n)!].push(n)
    // Fewer crossings: each component sits near the middle of those it connects with.
    const neighbours = new Map<string, string[]>()
    for (const e of es) { (neighbours.get(e.from) ?? neighbours.set(e.from, []).get(e.from)!).push(e.to); (neighbours.get(e.to) ?? neighbours.set(e.to, []).get(e.to)!).push(e.from) }
    const rank = new Map<string, number>()
    const setRanks = () => layers.forEach(l => l.forEach((n, i) => rank.set(n, i / Math.max(1, l.length - 1))))
    setRanks()
    for (let sweep = 0; sweep < 6; sweep++) {
        const range = sweep % 2 === 0 ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i)
        for (const li of range) {
            const l = layers[li]
            const bary = new Map(l.map(n => {
                const ns = (neighbours.get(n) ?? []).filter(m => layerOf.get(m) !== li)
                return [n, ns.length ? ns.reduce((s, m) => s + rank.get(m)!, 0) / ns.length : rank.get(n)!] as const
            }))
            l.sort((a, b) => bary.get(a)! - bary.get(b)! || a.localeCompare(b))
            l.forEach((n, i) => rank.set(n, i / Math.max(1, l.length - 1)))
        }
    }
    // Read against the levels, not the first order: an import to a later level runs with them even if the
    // order had it backwards, so this set is never larger than the order's, and is often smaller.
    const withLevels = es.filter(e => layerOf.get(e.to)! > layerOf.get(e.from)!)
    const againstLevels = es.filter(e => layerOf.get(e.to)! <= layerOf.get(e.from)!)
    return { order: layers.flat(), layers, layerOf, forward: withLevels, against: againstLevels }
}

// ── The plan ──────────────────────────────────────────────────────────────

export interface CutStep extends WEdge {
    step: number
    /** Components no longer in any tangle after this cut and every one before it. */
    freed: number
    /** Components still in a tangle afterwards. */
    tangled: number
    /** The tangles left, by size. */
    left: number[]
    /** This cut split a tangle without freeing a component yet. */
    splits: boolean
}

/**
 * The imports against the order, as a sequence of cuts: at each step the one
 * whose removal untangles most (lowers the sum of squared tangle sizes the
 * most; a split counts before anything is freed), ties to the fewest
 * imports. After `greedy` steps the rest follow lightest first, which keeps
 * a 150-component tangle quick to plan.
 */
export function planCuts(nodes: string[], layout: TangleLayout, greedy = 24): CutStep[] {
    const all = layout.forward.concat(layout.against)
    const cut = new Set<string>()
    let state = tanglesOf(nodes, all, cut)
    const steps: CutStep[] = []
    const pending = [...layout.against].sort((a, b) => a.imports - b.imports || a.files - b.files || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    const record = (e: WEdge, before: string[][], after: string[][]) => {
        const tangled = after.reduce((s, t) => s + t.length, 0)
        const was = before.reduce((s, t) => s + t.length, 0)
        steps.push({ ...e, step: steps.length + 1, freed: nodes.length - tangled, tangled, left: after.map(t => t.length), splits: tangled === was && after.length > before.length })
    }
    while (pending.length && state.length) {
        // Only a cut inside a standing tangle does anything.
        const where = new Map<string, number>()
        state.forEach((t, i) => t.forEach(n => where.set(n, i)))
        const live = pending.filter(e => where.has(e.from) && where.get(e.from) === where.get(e.to))
        if (!live.length) break
        let pick = live[0]
        let pickAfter: string[][] | null = null
        if (steps.length < greedy) {
            const now = knot(state)
            let bestGain = -1
            for (const e of live) {
                cut.add(edgeId(e.from, e.to))
                const after = tanglesOf(state.flat(), all, cut)
                cut.delete(edgeId(e.from, e.to))
                const gain = now - knot(after)
                if (gain > bestGain) { bestGain = gain; pick = e; pickAfter = after }
            }
        }
        cut.add(edgeId(pick.from, pick.to))
        const after = pickAfter ?? tanglesOf(state.flat(), all, cut)
        record(pick, state, after)
        state = after
        pending.splice(pending.indexOf(pick), 1)
    }
    return steps
}

/** What a set of cuts leaves of a tangle: its tangles and the components freed. */
export function afterCuts(nodes: string[], edges: WEdge[], cut: ReadonlySet<string>): { tangles: string[][]; freed: Set<string> } {
    const tangles = tanglesOf(nodes, edges, cut)
    const still = new Set(tangles.flat())
    return { tangles, freed: new Set(nodes.filter(n => !still.has(n))) }
}

/** Direct connection rows (one per importing file and target) folded into weighted edges. */
export function foldEdges(rows: Array<{ from: string; to: string; file?: string | null; count?: number | null; reference_count?: number | null }>, skip = (n: string) => n === "."): WEdge[] {
    const by = new Map<string, { from: string; to: string; imports: number; files: Set<string> }>()
    for (const r of rows) {
        const from = String(r.from), to = String(r.to)
        if (from === to || skip(from) || skip(to)) continue
        const k = edgeId(from, to)
        let e = by.get(k)
        if (!e) by.set(k, (e = { from, to, imports: 0, files: new Set() }))
        e.imports += Number(r.reference_count ?? r.count) || 1
        if (r.file) e.files.add(String(r.file))
    }
    return [...by.values()].map(e => ({ from: e.from, to: e.to, imports: e.imports, files: e.files.size }))
}
