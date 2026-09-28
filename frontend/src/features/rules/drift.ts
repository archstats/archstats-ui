import type { GroupEdge } from "~/features/groups/groupEdges"
import { findingKey, type Crossing } from "./lensRules"

// Drift: imports that started crossing a lens's declaration between two
// snapshots. Keyed by groups, components and file, not line, so an edit
// above an import does not read as a new crossing.

const key = (e: GroupEdge) => `${e.fromGroup}>${e.toGroup}|${findingKey(e)}`

export function newCrossings(before: Crossing[], after: Crossing[]): GroupEdge[] {
    const was = new Set(before.flatMap(c => c.edges).map(key))
    return after.flatMap(c => c.edges).filter(e => !was.has(key(e)))
}

/** The newest complete scan before this one that can be compared with it, if any. */
export function previousOf<T extends { id: string }>(newestFirst: T[], openId: string, comparable: (a: T, b: T) => boolean): T | null {
    const i = newestFirst.findIndex(s => s.id === openId)
    if (i < 0) return null
    const open = newestFirst[i]
    return newestFirst.slice(i + 1).find(s => comparable(s, open)) ?? null
}
