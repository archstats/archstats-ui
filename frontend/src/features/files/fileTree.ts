// A set of file paths as a tree to navigate, the way GitHub and every IDE
// show a repository: the folder all of them share becomes one root line,
// folders come before files, and a chain of folders holding nothing but the
// next folder (src/main/java/com/acme) collapses into one row.

export interface TreeFolder<T> {
    kind: "folder"
    /** The folder's path under the root, unique: the key a folder is opened by. */
    key: string
    /** What the row reads: one segment, or a collapsed chain "main/java/com". */
    label: string
    children: TreeNode<T>[]
    /** Files anywhere below, for the row's count. */
    fileCount: number
}

export interface TreeFile<T> {
    kind: "file"
    key: string
    label: string
    file: T
}

export type TreeNode<T> = TreeFolder<T> | TreeFile<T>

export interface FileTree<T> {
    /** The directory every file sits in, "" when they share none. */
    root: string
    nodes: TreeNode<T>[]
}

export interface TreeRow<T> {
    kind: "folder" | "file"
    key: string
    label: string
    depth: number
    open: boolean
    fileCount: number
    file?: T
}

function dirOf(path: string): string[] {
    return path.split("/").slice(0, -1)
}

/** The directory the paths all sit in. */
export function commonRoot(paths: string[]): string {
    if (!paths.length) return ""
    const first = dirOf(paths[0])
    let n = first.length
    for (const p of paths) {
        const d = dirOf(p)
        let i = 0
        while (i < n && i < d.length && d[i] === first[i]) i++
        n = i
    }
    return first.slice(0, n).join("/")
}

export function buildFileTree<T extends { name: string }>(files: T[]): FileTree<T> {
    const root = commonRoot(files.map(f => f.name))
    const cut = root ? root.length + 1 : 0
    const top: TreeFolder<T> = { kind: "folder", key: "", label: "", children: [], fileCount: 0 }
    for (const file of files) {
        const parts = file.name.slice(cut).split("/")
        let folder = top
        let key = ""
        for (const part of parts.slice(0, -1)) {
            key = key ? `${key}/${part}` : part
            let next = folder.children.find((c): c is TreeFolder<T> => c.kind === "folder" && c.key === key)
            if (!next) {
                next = { kind: "folder", key, label: part, children: [], fileCount: 0 }
                folder.children.push(next)
            }
            folder = next
        }
        folder.children.push({ kind: "file", key: file.name, label: parts[parts.length - 1], file })
    }
    const finish = (folder: TreeFolder<T>): number => {
        // A folder whose only child is a folder reads as one row.
        for (let i = 0; i < folder.children.length; i++) {
            let child = folder.children[i]
            while (child.kind === "folder" && child.children.length === 1 && child.children[0].kind === "folder") {
                const only = child.children[0] as TreeFolder<T>
                child = { ...only, label: `${child.label}/${only.label}` }
            }
            folder.children[i] = child
        }
        folder.children.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "folder" ? -1 : 1))
        folder.fileCount = folder.children.reduce((sum, c) => sum + (c.kind === "folder" ? finish(c) : 1), 0)
        return folder.fileCount
    }
    finish(top)
    return { root, nodes: top.children }
}

/** The rows on screen: every node whose folders are all open. */
export function visibleRows<T>(nodes: TreeNode<T>[], open: (key: string) => boolean, depth = 0, out: TreeRow<T>[] = []): TreeRow<T>[] {
    for (const node of nodes) {
        if (node.kind === "folder") {
            const isOpen = open(node.key)
            out.push({ kind: "folder", key: node.key, label: node.label, depth, open: isOpen, fileCount: node.fileCount })
            if (isOpen) visibleRows(node.children, open, depth + 1, out)
        } else {
            out.push({ kind: "file", key: node.key, label: node.label, depth, open: false, fileCount: 1, file: node.file })
        }
    }
    return out
}

/** Every folder key in the tree, for "open all". */
export function folderKeys<T>(nodes: TreeNode<T>[], out: string[] = []): string[] {
    for (const n of nodes) if (n.kind === "folder") { out.push(n.key); folderKeys(n.children, out) }
    return out
}

/** The folders that hold a file, so selecting it can reveal it. */
export function foldersHolding<T>(nodes: TreeNode<T>[], fileKey: string, trail: string[] = []): string[] | null {
    for (const n of nodes) {
        if (n.kind === "file" && n.key === fileKey) return trail
        if (n.kind === "folder") {
            const found = foldersHolding(n.children, fileKey, [...trail, n.key])
            if (found) return found
        }
    }
    return null
}

export interface FuzzyMatch {
    score: number
    /** Indices into the path that matched, for underlining. */
    indices: number[]
}

/**
 * Go to file: the query's characters in order anywhere in the path, ranked
 * the way a finder ranks them. Characters in the file name beat characters
 * in its folders, runs beat scattered hits, and a hit at the start of a word
 * (after / . _ - or a lower-to-upper case change) counts extra.
 */
export function fuzzyMatch(query: string, path: string): FuzzyMatch | null {
    const q = query.replace(/\s+/g, "").toLowerCase()
    if (!q) return { score: 0, indices: [] }
    const lower = path.toLowerCase()
    const nameStart = path.lastIndexOf("/") + 1
    // Match from the end so the file name gets first claim on the characters.
    const indices: number[] = []
    let qi = q.length - 1
    for (let i = path.length - 1; i >= 0 && qi >= 0; i--) {
        if (lower[i] === q[qi]) { indices.push(i); qi-- }
    }
    if (qi >= 0) return null
    indices.reverse()
    let score = 0
    for (let k = 0; k < indices.length; k++) {
        const i = indices[k]
        score += i >= nameStart ? 3 : 1
        if (k > 0 && indices[k - 1] === i - 1) score += 4
        const prev = path[i - 1]
        if (i === 0 || prev === "/" || prev === "." || prev === "_" || prev === "-" || (prev === prev?.toLowerCase() && path[i] !== path[i].toLowerCase())) score += 3
    }
    if (lower.slice(nameStart).startsWith(q)) score += 10
    return { score: score - path.length * 0.01, indices }
}
