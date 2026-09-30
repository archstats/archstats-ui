// Areas of a codebase: the floors a layering is read over. Component names
// come in more than one style in one snapshot (Java packages `com.elepy.auth`
// beside folders `admin/src/main/resources/frontend`), so each style is read
// on its own, its shared prefix dropped, and the biggest area is split by its
// next segment until the areas say something: one floor holding the whole
// backend makes every layering look clean.

export interface Areas {
    /** Component → area key. */
    of: Map<string, string>
    /** Area keys, largest first. */
    keys: string[]
    /** How the areas were cut, in words. */
    how: string
}

const SEPS = ["/", "::", "\\", "."] as const

function sepOf(name: string): string {
    for (const s of SEPS) if (name.includes(s)) return s
    return "."
}

function prefixOf(names: string[], sep: string): string {
    if (names.length < 2) return ""
    const parts = names.map(n => n.split(sep))
    const out: string[] = []
    for (let i = 0; ; i++) {
        const p = parts[0][i]
        if (p === undefined || parts.some(ps => ps[i] !== p || ps.length <= i + 1)) break
        out.push(p)
    }
    return out.length ? out.join(sep) + sep : ""
}

export function areasOf(names: string[], linesOf: (n: string) => number, opts: { target?: number; max?: number } = {}): Areas {
    const target = opts.target ?? 7
    const max = opts.max ?? 12
    // Split each name into segments after its own style's shared prefix.
    const bySep = new Map<string, string[]>()
    for (const n of names) { const s = sepOf(n); (bySep.get(s) ?? bySep.set(s, []).get(s)!).push(n) }
    const segs = new Map<string, { sep: string; parts: string[]; family: string }>()
    const styles = bySep.size
    for (const [sep, list] of bySep) {
        const pre = prefixOf(list, sep)
        for (const n of list) segs.set(n, { sep, parts: (n.startsWith(pre) ? n.slice(pre.length) : n).split(sep).filter(Boolean), family: styles > 1 ? `${pre || sep}` : "" })
    }
    const depth = new Map(names.map(n => [n, 1]))
    const keyOf = (n: string) => {
        const s = segs.get(n)!
        const d = Math.min(depth.get(n)!, Math.max(1, s.parts.length))
        return s.parts.slice(0, d).join(s.sep) || n
    }
    const floors = () => {
        const m = new Map<string, string[]>()
        for (const n of names) { const k = keyOf(n); (m.get(k) ?? m.set(k, []).get(k)!).push(n) }
        return m
    }
    // Split the biggest area (by code) while it holds most of the code and can
    // be split; only areas with a real share of the code count towards enough.
    const total = names.reduce((s, n) => s + linesOf(n), 0) || 1
    const share = (ms: string[]) => ms.reduce((s, n) => s + linesOf(n), 0) / total
    const significant = (f: Map<string, string[]>) => [...f.values()].filter(ms => share(ms) >= 0.02).length
    for (let round = 0; round < 40; round++) {
        const f = floors()
        if (significant(f) >= target) break
        const members = [...f.values()].sort((a, b) => share(b) - share(a))[0]
        if (share(members) < 0.3) break
        const deeper = members.filter(n => segs.get(n)!.parts.length > depth.get(n)!)
        if (!deeper.length) break
        for (const n of deeper) depth.set(n, depth.get(n)! + 1)
    }
    const f = floors()
    // The largest areas stay; slivers (under 2% of the code) and whatever is
    // past the floor limit fold into one area, named for what it holds.
    const lines = new Map([...f].map(([k, ms]) => [k, share(ms)]))
    const ranked = [...f.keys()].sort((a, b) => lines.get(b)! - lines.get(a)!)
    const kept = new Set(ranked.filter((k, i) => i < max - 1 && lines.get(k)! >= 0.02))
    const rest = ranked.filter(k => !kept.has(k))
    const OTHER = rest.length > 1 ? `(${rest.length} other areas)` : rest[0]
    const of = new Map<string, string>()
    for (const [k, ms] of f) for (const n of ms) of.set(n, kept.has(k) ? k : OTHER!)
    const keys = [...ranked.filter(k => kept.has(k)), ...(rest.length ? [OTHER!] : [])]
    const how = styles > 1
        ? "areas cut from each naming style separately (packages and folders), split until no area holds most of the code"
        : "areas cut by name, split until no area holds most of the code"
    return { of, keys, how }
}
