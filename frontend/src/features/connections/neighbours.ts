// Turning a component's neighbours into something a person can read.
//
// A widely used component has hundreds of dependents. A list of hundreds of
// names answers nothing; the same names rolled up by the part of the codebase
// they live in answer it immediately — "the test suite and the bundles depend
// on this, the domain barely does". Everything here is pure: the caller
// supplies the separator and, when the user has groups, the group index.

export type Direction = "in" | "out" | "both"

export interface Neighbour {
    name: string
    direction: Direction
    /** Import references between the two, summed over both directions. */
    references: number
    sharedCommits: number | null
    coChangeRate: number | null
    /** Shortest path length in hops; 1 is a direct import. */
    hops: number | null
}

export interface NeighbourGroup {
    key: string
    label: string
    /** The group's own colour, when it came from a lens the user built. */
    color?: string
    /** How many of the component's neighbours live here. */
    components: number
    references: number
    members: Neighbour[]
}

/**
 * A character-level common prefix trimmed back to a whole segment, which is
 * what "every name starts with org.broadleafcommerce." should mean.
 */
export function segmentPrefix(commonPrefix: string, separator: string): string {
    if (!separator || !commonPrefix) return ""
    const cut = commonPrefix.lastIndexOf(separator)
    return cut === -1 ? "" : commonPrefix.slice(0, cut + separator.length)
}

/**
 * The first `depth` segments of a name **after the prefix every name shares**.
 * Counting from the left of the raw name is useless in a codebase where every
 * component begins `org.broadleafcommerce.`: depth 1 and 2 both answer "org".
 */
export function pathKey(name: string, separator: string, depth: number, prefix = ""): string {
    if (!separator) return name
    const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name
    const parts = rest.split(separator)
    if (parts.length <= depth) return name
    return (name.startsWith(prefix) ? prefix : "") + parts.slice(0, depth).join(separator)
}

/** What a group is called once the shared prefix is taken as read. */
export function pathLabel(key: string, prefix: string): string {
    return prefix && key.startsWith(prefix) ? key.slice(prefix.length) || key : key
}

export interface SplitName {
    /** What the row already knows from its group: shown, but muted. */
    shared: string
    /** What makes this row itself. */
    own: string
}

/**
 * A member's full name, split into the part its group already said and the
 * part that distinguishes it. Trimming the shared part away entirely leaves
 * fragments like "eqs" and "br" that name nothing, and rows that happen to BE
 * their group keep their whole name while their neighbours lose theirs.
 */
export function splitSharedPrefix(name: string, groupKey: string, separator: string, projectPrefix = ""): SplitName {
    if (separator && name !== groupKey && name.startsWith(`${groupKey}${separator}`)) {
        return { shared: `${groupKey}${separator}`, own: name.slice(groupKey.length + separator.length) }
    }
    if (projectPrefix && name.startsWith(projectPrefix) && name.length > projectPrefix.length) {
        return { shared: projectPrefix, own: name.slice(projectPrefix.length) }
    }
    return { shared: "", own: name }
}

function collect(
    neighbours: Neighbour[],
    keyOf: (n: Neighbour) => string,
    decorate: (key: string) => { label: string; color?: string } = key => ({ label: key }),
): NeighbourGroup[] {
    const groups = new Map<string, NeighbourGroup>()
    for (const n of neighbours) {
        const key = keyOf(n)
        let group = groups.get(key)
        if (!group) {
            group = { key, components: 0, references: 0, members: [], ...decorate(key) }
            groups.set(key, group)
        }
        group.components++
        group.references += n.references
        group.members.push(n)
    }
    for (const group of groups.values()) {
        group.members.sort((a, b) => b.references - a.references || a.name.localeCompare(b.name))
    }
    return Array.from(groups.values())
        .sort((a, b) => b.components - a.components || b.references - a.references || a.key.localeCompare(b.key))
}

export function groupByPath(neighbours: Neighbour[], separator: string, depth: number, prefix = ""): NeighbourGroup[] {
    return collect(neighbours, n => pathKey(n.name, separator, depth, prefix), key => ({ label: pathLabel(key, prefix) }))
}

export const UNGROUPED = "Ungrouped"

/** The key the folded tail is collected under; no component name can collide. */
export const FOLDED_KEY = "\u0000folded"

export interface LensGroup { name: string; color?: string }

/** Rolled up by the user's own groups, which outrank any naming convention. */
export function groupByLens(neighbours: Neighbour[], groupOf: (name: string) => LensGroup | null): NeighbourGroup[] {
    const colors = new Map<string, string | undefined>()
    return collect(
        neighbours,
        n => {
            const group = groupOf(n.name)
            if (group) colors.set(group.name, group.color)
            return group?.name ?? UNGROUPED
        },
        key => ({ label: key, color: colors.get(key) }),
    )
}

/**
 * At most `max` bands for a diagram: the largest groups kept whole and the
 * tail folded into one, so a long tail never becomes a hairline nobody reads.
 */
export function foldTail(groups: NeighbourGroup[], max: number): NeighbourGroup[] {
    if (groups.length <= max) return groups
    const kept = groups.slice(0, max - 1)
    const tail = groups.slice(max - 1)
    const components = tail.reduce((a, g) => a + g.components, 0)
    return [...kept, {
        key: FOLDED_KEY,
        label: `${tail.length} more groups`,
        components,
        references: tail.reduce((a, g) => a + g.references, 0),
        members: tail.flatMap(g => g.members),
    }]
}

/**
 * Band thicknesses for one side of the flow, in pixels.
 *
 * Every band stays visible, so a group of one is still clickable, and the
 * bands still fill the height exactly: the minimum is taken out of the space
 * the rest share rather than added on top of it.
 */
export function bandHeights(values: number[], available: number, minimum = 4): number[] {
    if (values.length === 0) return []
    const floor = Math.min(minimum, available / values.length)
    const total = values.reduce((a, v) => a + v, 0)
    const free = Math.max(0, available - floor * values.length)
    if (total <= 0) return values.map(() => available / values.length)
    return values.map(v => floor + (v / total) * free)
}
