// The directory tree of a snapshot, built from its files (never from the
// engine's directories table, which counts differently per language), with
// every column rolled up by a stated rule. A chain of directories that each
// hold one directory and no files is one row: Java's src/main/java/org/acme
// is a path, not four decisions.

export interface DirFile {
    name: string
    component: string | null
    lines: number
    hotspot: number | null
    health: number | null
}

export interface DirNode {
    /** The directory's path, without a trailing slash; "" is the root. */
    path: string
    /** What the row shows: the compacted chain from its parent row. */
    label: string
    depth: number
    children: DirNode[]
    /** Files directly inside, and inside every directory under it. */
    files: DirFile[]
    lines: number
    components: Set<string>
    maxHotspot: number | null
    minHealth: number | null
}

/** The rule each column is rolled up by; the table shows it and the CSV carries it. */
export const ROLLUP_RULES: Array<[string, string]> = [
    ["files", "count of files under the directory, at any depth"],
    ["lines", "sum of the files' lines"],
    ["components", "distinct components with a file under the directory"],
    ["commits", "distinct commits touching a file under the directory, in the period"],
    ["max_hotspot", "highest file hotspot score under the directory"],
    ["lowest_health", "lowest file code health under the directory"],
    ["edges_out", "distinct component dependencies from a component with files under the directory to one with none there"],
]

export function buildDirTree(files: DirFile[]): DirNode {
    const root = node("", "", 0)
    const byPath = new Map<string, DirNode>([["", root]])
    for (const f of files) {
        // "./Jenkinsfile" sits at the root: a "." segment is no directory.
        const parts = f.name.split("/").filter(p => p !== ".")
        parts.pop()
        let path = ""
        let parent = root
        add(root, f)
        for (const part of parts) {
            path = path ? `${path}/${part}` : part
            let n = byPath.get(path)
            if (!n) {
                n = node(path, part, parent.depth + 1)
                byPath.set(path, n)
                parent.children.push(n)
            }
            add(n, f)
            parent = n
        }
    }
    compact(root)
    sortTree(root)
    return root
}

function node(path: string, label: string, depth: number): DirNode {
    return { path, label, depth, children: [], files: [], lines: 0, components: new Set(), maxHotspot: null, minHealth: null }
}

function add(n: DirNode, f: DirFile) {
    n.files.push(f)
    n.lines += Number(f.lines) || 0
    if (f.component) n.components.add(f.component)
    if (f.hotspot !== null && Number.isFinite(f.hotspot)) n.maxHotspot = n.maxHotspot === null ? f.hotspot : Math.max(n.maxHotspot, f.hotspot)
    if (f.health !== null && Number.isFinite(f.health)) n.minHealth = n.minHealth === null ? f.health : Math.min(n.minHealth, f.health)
}

/** Folds a directory that holds only one directory into it, all the way down. */
function compact(n: DirNode) {
    for (let i = 0; i < n.children.length; i++) {
        let c = n.children[i]
        while (c.children.length === 1 && c.files.length === c.children[0].files.length) {
            const only = c.children[0]
            only.label = `${c.label}/${only.label}`
            c = only
        }
        c.depth = n.depth + 1
        n.children[i] = c
        compact(c)
    }
}

function sortTree(n: DirNode) {
    n.children.sort((a, b) => b.lines - a.lines || a.label.localeCompare(b.label))
    n.children.forEach(sortTree)
}

/** The rows to show: every child of an expanded node, depth-first. */
export function visibleRows(root: DirNode, expanded: Set<string>): DirNode[] {
    const out: DirNode[] = []
    const walk = (n: DirNode) => {
        for (const c of n.children) {
            out.push(c)
            if (expanded.has(c.path)) walk(c)
        }
    }
    walk(root)
    return out
}

/**
 * Dependencies that leave a directory: from a component with files under it
 * to a component with no file there. Counted as distinct component pairs.
 */
export function edgesOut(n: DirNode, edges: Array<{ from: string; to: string }>): Array<{ from: string; to: string }> {
    const inside = n.components
    const out = new Map<string, { from: string; to: string }>()
    for (const e of edges) {
        if (e.from === e.to || !inside.has(e.from) || inside.has(e.to)) continue
        out.set(`${e.from}\u0000${e.to}`, e)
    }
    return [...out.values()]
}

/** Distinct commits per directory path, from (file, commit) pairs. */
export function commitsByDir(pairs: Array<{ file: string; hash: string }>): Map<string, number> {
    const sets = new Map<string, Set<string>>()
    for (const { file, hash } of pairs) {
        const parts = file.split("/").filter(p => p !== ".")
        parts.pop()
        let path = ""
        const touch = (p: string) => { let s = sets.get(p); if (!s) { s = new Set(); sets.set(p, s) } s.add(hash) }
        touch("")
        for (const part of parts) { path = path ? `${path}/${part}` : part; touch(path) }
    }
    return new Map([...sets].map(([k, v]) => [k, v.size]))
}
