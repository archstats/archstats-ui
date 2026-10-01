// The code's own folders as a roll-up: components gathered under the
// packages or directories that hold them, at the depth where there are few
// enough to read. It needs nobody to build a lens, so a codebase of hundreds
// of components draws as a picture of its package tree straight away. It is
// not a grouping the tool invents: the folders are the codebase's.

/** The roll-up's name, beside the lenses. */
export const FOLDERS = "Folders"

/** Group ids of the folder roll-up start with this, so they never meet a saved group's id. */
export const FOLDER_ID = "folder:"

export interface FolderGroup {
    /** The folder, relative to what every component shares. */
    key: string
    /** How the folder reads: its path below the shared root, "(root)" for the root itself. */
    name: string
    members: string[]
}

/** How a name breaks into folders: a path, a namespace, or a dotted package. */
export function segmentsOf(name: string): { parts: string[]; sep: string } {
    for (const sep of ["/", "\\", "::", "."]) if (name.includes(sep)) return { parts: name.split(sep).filter(Boolean), sep }
    return { parts: name && name !== "." ? [name] : [], sep: "/" }
}

/**
 * The components under folders, below the root every component shares. It
 * starts one level down and keeps opening the biggest folder into its
 * subfolders while the count stays within `target`, so busy packages are
 * split and quiet ones stay whole.
 */
export function folderGroups(components: string[], target = 24): FolderGroup[] {
    const named = components.map(c => ({ c, ...segmentsOf(c) }))
    if (!named.length) return []
    // The prefix every component shares says nothing: it is dropped.
    let shared = named[0].parts.length
    for (const n of named) {
        let i = 0
        while (i < shared && i < n.parts.length && n.parts[i] === named[0].parts[i]) i++
        shared = i
    }
    // A component that is the shared root itself keeps its last segment.
    shared = Math.min(shared, ...named.map(n => Math.max(0, n.parts.length - 1)))
    type Item = { c: string; sep: string; rest: string[] }
    const items: Item[] = named.map(n => ({ c: n.c, sep: n.sep, rest: n.parts.slice(shared) }))
    type Folder = { depth: number; items: Item[] }
    // A folder's subfolders, at the first level where it branches.
    const split = (f: Folder): Folder[] => {
        for (let d = f.depth; ; d++) {
            const by = new Map<string, Item[]>()
            for (const it of f.items) {
                const k = it.rest.length > d ? it.rest.slice(0, d + 1).join("\u0000") : `=${it.rest.join("\u0000")}`
                by.set(k, [...(by.get(k) ?? []), it])
            }
            if (by.size > 1 || !f.items.some(it => it.rest.length > d + 1)) return [...by.values()].map(items => ({ depth: d + 1, items }))
        }
    }
    let folders = split({ depth: 0, items })
    for (;;) {
        // The biggest folder that still has subfolders, opened if the count allows.
        const open = folders
            .filter(f => f.items.some(it => it.rest.length > f.depth))
            .sort((a, b) => b.items.length - a.items.length)
        let done = true
        for (const f of open) {
            const parts = split(f)
            if (parts.length < 2 || folders.length - 1 + parts.length > target) continue
            folders = [...folders.filter(x => x !== f), ...parts]
            done = false
            break
        }
        if (done) break
    }
    const out = folders.map(f => {
        const it = f.items[0]
        const parts = it.rest.slice(0, f.depth)
        return { key: parts.join(it.sep), parts, sep: it.sep, members: f.items.map(x => x.c) }
    })
    // Most folders often sit under one root a few others do not (org.shop beside admin):
    // the names leave it out where that stays unambiguous.
    const lead = commonLead(out.filter(f => f.parts.length > 1).map(f => f.parts), out.length * 0.7)
    const short = (f: (typeof out)[number]) => (lead && f.parts.length > lead.length && lead.every((p, i) => f.parts[i] === p) ? f.parts.slice(lead.length).join(f.sep) : f.key)
    const counts = new Map<string, number>()
    for (const f of out) counts.set(short(f), (counts.get(short(f)) ?? 0) + 1)
    return out.map(f => ({ key: f.key, name: (counts.get(short(f))! > 1 ? f.key : short(f)) || "(root)", members: f.members }))
        .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name))
}

/** The longest leading segments that more than `quorum` of the paths share. */
function commonLead(paths: string[][], quorum: number): string[] | null {
    let lead: string[] = []
    for (let d = 0; ; d++) {
        const tally = new Map<string, number>()
        for (const p of paths) if (p.length > d + 1 && lead.every((x, i) => p[i] === x)) tally.set(p[d], (tally.get(p[d]) ?? 0) + 1)
        const [seg, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]
        if (n <= quorum) return lead.length ? lead : null
        lead = [...lead, seg]
    }
}
