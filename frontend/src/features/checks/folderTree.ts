// The folder tree the structure pictures are drawn on. Every Units finding
// paints the same map, so the architect learns the shape of the codebase
// once and every finding lands somewhere they recognise.

export interface FolderNode {
    /** The label drawn on the map: one folder, or a chain of single-child folders ("frontend/src"). */
    name: string
    /** Full path from the workspace root; a file's own path for a leaf. */
    path: string
    /** Set on leaves only. */
    file?: string
    size: number
    children: FolderNode[]
}

/**
 * Nests files by folder. A folder holding nothing but one other folder is
 * folded into it, so the map spends no header on `frontend/` above `src/`.
 */
export function folderTree(files: string[], sizeOf: (file: string) => number): FolderNode {
    const root: FolderNode = { name: "", path: "", size: 0, children: [] }
    const dirs = new Map<string, FolderNode>([["", root]])
    const dirOf = (path: string): FolderNode => {
        const hit = dirs.get(path)
        if (hit) return hit
        const cut = path.lastIndexOf("/")
        const parent = dirOf(cut < 0 ? "" : path.slice(0, cut))
        const node: FolderNode = { name: path.slice(cut + 1), path, size: 0, children: [] }
        parent.children.push(node)
        dirs.set(path, node)
        return node
    }
    for (const f of files) {
        const cut = f.lastIndexOf("/")
        const parent = dirOf(cut < 0 ? "" : f.slice(0, cut))
        parent.children.push({ name: f.slice(cut + 1), path: f, file: f, size: Math.max(1, sizeOf(f) || 0), children: [] })
    }
    const fold = (n: FolderNode): FolderNode => {
        n.children = n.children.map(fold)
        while (!n.file && n.children.length === 1 && !n.children[0].file) {
            const only = n.children[0]
            n = { ...only, name: n.name ? `${n.name}/${only.name}` : only.name }
        }
        n.size = n.file ? n.size : n.children.reduce((s, c) => s + c.size, 0)
        return n
    }
    const folded = fold(root)
    // The root keeps an empty name so no header is drawn for it; what it
    // folded into becomes its first child's label instead.
    return folded.path ? { name: "", path: "", size: folded.size, children: [folded] } : folded
}

/** The folder a map selection stands for: the path itself, or every file under it. */
export function filesUnder(path: string, files: Iterable<string>): string[] {
    const out: string[] = []
    for (const f of files) if (!path || f === path || f.startsWith(path + "/")) out.push(f)
    return out
}

/** Up to this many floors every order is weighed; past it the greedy pass decides. */
const EXACT_UP_TO = 12

/**
 * The order with the fewest imports pointing up, found exactly: each set of
 * floors placed at the top keeps its cheapest order, and the next floor down
 * pays for every import it sends into that set. Among equally cheap orders
 * the one closest to the given order wins (the fewest pairs swapped), so
 * nothing moves without a reason.
 *
 * The greedy pass below weighs what a floor sends against what it receives,
 * which rewards volume: Broadleaf's services send 1,143 imports into the
 * entities, and that alone put them above the 25 controllers that call them.
 */
function fewestUp(ids: string[], flows: Array<{ from: string; to: string; count: number }>): string[] {
    const n = ids.length
    const at = new Map(ids.map((id, i) => [id, i]))
    const w = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (const f of flows) {
        const a = at.get(f.from), b = at.get(f.to)
        if (a == null || b == null || a === b) continue
        w[a][b] += f.count
    }
    const full = (1 << n) - 1
    const cost = new Array<number>(full + 1).fill(Infinity)
    const swaps = new Array<number>(full + 1).fill(Infinity)
    const seq: number[][] = new Array(full + 1)
    cost[0] = 0
    swaps[0] = 0
    seq[0] = []
    const before = (x: number[], y: number[]) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false }
    for (let set = 0; set < full; set++) {
        if (cost[set] === Infinity) continue
        for (let v = 0; v < n; v++) {
            if (set & (1 << v)) continue
            // v goes below everything in the set: its imports into the set point up.
            let up = 0, swapped = 0
            for (let u = 0; u < n; u++) if (set & (1 << u)) { up += w[v][u]; if (u > v) swapped++ }
            const next = set | (1 << v), c = cost[set] + up, k = swaps[set] + swapped, s = [...seq[set], v]
            const better = c < cost[next] || (c === cost[next] && (k < swaps[next] || (k === swaps[next] && before(s, seq[next]))))
            if (better) { cost[next] = c; swaps[next] = k; seq[next] = s }
        }
    }
    return seq[full].map((i) => ids[i])
}

/**
 * An order for modules that nobody ordered: the one the most imports point
 * down, used most and using least at the bottom. Draws a free plan so that
 * as many imports as possible run downward and the rest stand out.
 */
export function stackOrder(ids: string[], flows: Array<{ from: string; to: string; count: number }>): string[] {
    if (ids.length <= EXACT_UP_TO) return fewestUp(ids, flows)
    const left = new Set(ids)
    const order: string[] = []
    // Repeatedly take the module that sends the fewest imports into what is
    // still unplaced: the top of what remains uses the rest, not the other way.
    while (left.size) {
        let best = "", bestScore = Infinity
        for (const id of left) {
            let into = 0, out = 0
            for (const f of flows) {
                if (!left.has(f.from) || !left.has(f.to) || f.from === f.to) continue
                if (f.to === id) into += f.count
                if (f.from === id) out += f.count
            }
            const score = into - out
            if (score < bestScore || (score === bestScore && ids.indexOf(id) < ids.indexOf(best))) { best = id; bestScore = score }
        }
        order.push(best)
        left.delete(best)
    }
    return order
}
