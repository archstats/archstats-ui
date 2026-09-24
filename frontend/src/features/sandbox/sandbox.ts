// What-if: a plan of edits (move a file to another component, merge two
// components, cut the imports between two) projected onto this snapshot's
// resolved imports. Nothing is re-analysed: the imports stay the ones the
// scan resolved, only where their files and targets sit changes. Rules are
// not re-evaluated.
//
// Coupling follows the engine's own definitions, so a plan with no edits
// reads exactly what the snapshot says: Ca counts the files outside a
// component that import it, Ce the files of the component that import
// outside, both over runtime imports (type-only imports left out); A is
// abstract types over types, I = Ce / (Ca + Ce), D = |A + I - 1|.

export interface SandboxRow { from: string; to: string; file: string; refs: number }

export interface SandboxBase {
    /** file → its component. */
    compOf: Map<string, string>
    /** Every component, including those with no file of their own in compOf. */
    components: string[]
    /** Runtime component imports, one row per importing file and target component. */
    rows: SandboxRow[]
    /** `${file}\u0000${toComponent}` → the files of that component the file imports. */
    targets: Map<string, string[]>
    /** file → the files that import it. */
    importers: Map<string, Set<string>>
    /** Types per file, for abstractness. */
    types: Map<string, { total: number; abstract: number }>
    /** Types per component, for components whose files are not listed. */
    componentTypes: Map<string, { total: number; abstract: number }>
}

export type Edit =
    | { kind: "move"; file: string; to: string }
    | { kind: "merge"; from: string; into: string }
    | { kind: "cut"; from: string; to: string }

export interface Metrics { ca: number; ce: number; i: number; a: number; d: number; files: number }

export interface Projection {
    compOf: Map<string, string>
    /** Component pair "a>b" → references. */
    pairs: Map<string, number>
    metrics: Map<string, Metrics>
    /** Tangles: strongly connected sets of two or more components. */
    tangles: string[][]
    /** Import lines that name a moved file and would have to change, and the files holding them. */
    importSites: { sites: number; files: number }
}

const k = (a: string, b: string) => `${a}\u0000${b}`
export const pairKey = (a: string, b: string) => `${a}>${b}`

export function project(base: SandboxBase, edits: Edit[]): Projection {
    const compOf = new Map(base.compOf)
    const renamed = new Map<string, string>()
    const rename = (c: string): string => { let x = c; for (let i = 0; i < 50 && renamed.has(x); i++) x = renamed.get(x)!; return x }
    const cuts = new Set<string>()
    const moved = new Set<string>()
    for (const e of edits) {
        if (e.kind === "move") { compOf.set(e.file, e.to); moved.add(e.file) }
        else if (e.kind === "merge") {
            renamed.set(e.from, e.into)
            for (const [f, c] of compOf) if (c === e.from) compOf.set(f, e.into)
        } else cuts.add(pairKey(e.from, e.to))
    }

    // Each import row, moved: its source is where its file now sits; its
    // target is where the files it imports now sit.
    const edges: SandboxRow[] = []
    for (const r of base.rows) {
        const from = compOf.get(r.file) ?? rename(r.from)
        const targets = base.targets.get(k(r.file, r.to))
        if (targets && targets.length) {
            const by = new Map<string, number>()
            for (const t of targets) { const c = compOf.get(t) ?? rename(r.to); by.set(c, (by.get(c) ?? 0) + 1) }
            for (const [to, n] of by) edges.push({ from, to, file: r.file, refs: (r.refs * n) / targets.length })
        } else {
            edges.push({ from, to: rename(r.to), file: r.file, refs: r.refs })
        }
    }

    const pairs = new Map<string, number>()
    const inFiles = new Map<string, Set<string>>()
    const outFiles = new Map<string, Set<string>>()
    for (const e of edges) {
        if (e.from === e.to || cuts.has(pairKey(e.from, e.to))) continue
        pairs.set(pairKey(e.from, e.to), (pairs.get(pairKey(e.from, e.to)) ?? 0) + e.refs)
        if (!inFiles.has(e.to)) inFiles.set(e.to, new Set())
        inFiles.get(e.to)!.add(e.file)
        if (!outFiles.has(e.from)) outFiles.set(e.from, new Set())
        outFiles.get(e.from)!.add(e.file)
    }

    // Types follow their files; a component whose files are not listed keeps its own count.
    const typeSum = new Map<string, { total: number; abstract: number; files: number }>()
    const listed = new Set<string>()
    for (const [f, c] of compOf) {
        const t = base.types.get(f)
        const s = typeSum.get(c) ?? { total: 0, abstract: 0, files: 0 }
        s.files++
        if (t) { s.total += t.total; s.abstract += t.abstract }
        typeSum.set(c, s)
        listed.add(base.compOf.get(f)!)
    }
    const names = new Set<string>()
    for (const c of base.components) names.add(rename(c))
    for (const c of compOf.values()) names.add(c)
    const metrics = new Map<string, Metrics>()
    for (const c of names) {
        const ca = inFiles.get(c)?.size ?? 0
        const ce = outFiles.get(c)?.size ?? 0
        let t = typeSum.get(c)
        if (!listed.has(c) && base.componentTypes.has(c)) t = { ...base.componentTypes.get(c)!, files: t?.files ?? 0 }
        const a = t && t.total > 0 ? Math.min(1, Math.max(0, t.abstract / t.total)) : 0
        const i = ca + ce > 0 ? Math.min(1, Math.max(0, ce / (ca + ce))) : 0
        metrics.set(c, { ca, ce, i, a, d: Math.abs(a + i - 1), files: t?.files ?? 0 })
    }

    let sites = 0
    const siteFiles = new Set<string>()
    for (const f of moved) {
        if (base.compOf.get(f) === compOf.get(f)) continue
        for (const imp of base.importers.get(f) ?? []) { if (moved.has(imp)) continue; sites++; siteFiles.add(imp) }
    }

    return { compOf, pairs, metrics, tangles: tangles(pairs), importSites: { sites, files: siteFiles.size } }
}

/** Strongly connected sets of two or more, by Tarjan's algorithm, largest first. */
export function tangles(pairs: Map<string, number>): string[][] {
    const adj = new Map<string, string[]>()
    for (const key of pairs.keys()) {
        const [a, b] = key.split(">")
        if (!adj.has(a)) adj.set(a, [])
        if (!adj.has(b)) adj.set(b, [])
        adj.get(a)!.push(b)
    }
    let index = 0
    const idx = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>()
    const stack: string[] = []
    const out: string[][] = []
    const strong = (v: string) => {
        // Iterative, so a long chain of components cannot overflow the call stack.
        const work: Array<{ v: string; i: number }> = [{ v, i: 0 }]
        idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v)
        while (work.length) {
            const top = work[work.length - 1]
            const next = adj.get(top.v)!
            if (top.i < next.length) {
                const w = next[top.i++]
                if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); on.add(w); work.push({ v: w, i: 0 }) }
                else if (on.has(w)) low.set(top.v, Math.min(low.get(top.v)!, idx.get(w)!))
                continue
            }
            work.pop()
            if (work.length) { const p = work[work.length - 1].v; low.set(p, Math.min(low.get(p)!, low.get(top.v)!)) }
            if (low.get(top.v) === idx.get(top.v)) {
                const set: string[] = []
                let w: string
                do { w = stack.pop()!; on.delete(w); set.push(w) } while (w !== top.v)
                if (set.length > 1) out.push(set.sort())
            }
        }
    }
    for (const v of adj.keys()) if (!idx.has(v)) strong(v)
    return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

/** One line per edit, for the plan and its Markdown. */
export function describeEdit(e: Edit): string {
    if (e.kind === "move") return `Move ${e.file} to ${e.to}`
    if (e.kind === "merge") return `Merge ${e.from} into ${e.into}`
    return `Cut the imports from ${e.from} to ${e.to}`
}

type Query = (sql: string) => Promise<any[]>

/** Reads what a projection needs from a snapshot; `has` says which columns exist. */
export async function loadSandboxBase(q: Query, has: (table: string, column: string) => boolean): Promise<SandboxBase> {
    const typeCols = (table: string) => [
        has(table, "modularity__types__total") ? "coalesce(modularity__types__total, 0) AS total" : "0 AS total",
        has(table, "modularity__types__abstract") ? "coalesce(modularity__types__abstract, 0) AS abstract" : "0 AS abstract",
    ].join(", ")
    const [files, comps, rows, units] = await Promise.all([
        q(`SELECT name, component, ${typeCols("files")} FROM files WHERE component IS NOT NULL AND component <> ''`),
        q(`SELECT name, ${typeCols("components")} FROM components`),
        q(`SELECT "from", "to", file, sum(coalesce(reference_count, 1)) AS refs FROM component_connections_direct WHERE coalesce(kind, '') <> 'type_only' GROUP BY 1, 2, 3`),
        q(`SELECT DISTINCT from_file, to_file, to_component FROM unit_connections WHERE from_file IS NOT NULL AND to_file IS NOT NULL AND from_file <> to_file`).catch(() => []),
    ])
    const compOf = new Map<string, string>()
    const types = new Map<string, { total: number; abstract: number }>()
    for (const f of files) {
        compOf.set(String(f.name), String(f.component))
        types.set(String(f.name), { total: Number(f.total) || 0, abstract: Number(f.abstract) || 0 })
    }
    const componentTypes = new Map<string, { total: number; abstract: number }>()
    for (const c of comps) componentTypes.set(String(c.name), { total: Number(c.total) || 0, abstract: Number(c.abstract) || 0 })
    const targets = new Map<string, string[]>()
    const importers = new Map<string, Set<string>>()
    for (const u of units) {
        const key = `${u.from_file}\u0000${u.to_component}`
        const list = targets.get(key) ?? []
        if (!list.includes(u.to_file)) list.push(String(u.to_file))
        targets.set(key, list)
        if (!importers.has(u.to_file)) importers.set(u.to_file, new Set())
        importers.get(u.to_file)!.add(String(u.from_file))
    }
    return {
        compOf,
        components: comps.map(c => String(c.name)),
        rows: rows.map(r => ({ from: String(r.from), to: String(r.to), file: String(r.file), refs: Number(r.refs) || 0 })),
        targets, importers, types, componentTypes,
    }
}

export interface TangleChange {
    /** Tangles no longer there at all: none of their members is tangled with another. */
    gone: string[][]
    /** Tangles that shrank or broke apart, with what is left of each. */
    split: Array<{ was: string[]; now: string[][] }>
    /** Tangles that join components not tangled together before. */
    formed: string[][]
}

/** How the tangles moved: a remnant of a split tangle is not a new one. */
export function compareTangles(before: string[][], after: string[][]): TangleChange {
    const home = new Map<string, number>()
    before.forEach((t, i) => t.forEach(c => home.set(c, i)))
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
    const formed: string[][] = []
    const remnants = new Map<number, string[][]>()
    for (const t of after) {
        const homes = new Set(t.map(c => home.get(c)))
        const only = homes.size === 1 ? [...homes][0] : undefined
        if (only === undefined) { formed.push(t); continue }
        if (!remnants.has(only)) remnants.set(only, [])
        remnants.get(only)!.push(t)
    }
    const gone: string[][] = []
    const split: TangleChange["split"] = []
    before.forEach((t, i) => {
        const now = remnants.get(i)
        if (!now) gone.push(t)
        else if (!(now.length === 1 && same(now[0], t))) split.push({ was: t, now })
    })
    return { gone, split, formed }
}
