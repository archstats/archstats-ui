// The folder tree the structure pictures are drawn on. Checks and the
// restructure planner paint the same map, so the architect learns the shape
// of the codebase once and every finding lands somewhere they recognise.

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

/**
 * An order for modules that nobody ordered: the one the most imports point
 * down, used most and using least at the bottom. Draws a free plan so that
 * as many imports as possible run downward and the rest stand out.
 */
export function stackOrder(ids: string[], flows: Array<{ from: string; to: string; count: number }>): string[] {
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
