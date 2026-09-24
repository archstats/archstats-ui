import { parseDimensions, parseGroups, type Dimension, type SavedGroup } from "~/stores/groups"
import type { AliasMap } from "~/utils/authors"

// A workspace's hand-made state as one file: groups and lenses, author
// merges, arrangements and saved queries. The consultant hands a lens to the
// client with it; the architect moves months of work to another machine.
// Earlier groups-only exports import too.

export const CONFIG_FORMAT = "archstats-workspace"
export const CONFIG_VERSION = 1

export interface WorkspaceConfig {
    format: typeof CONFIG_FORMAT
    version: number
    groups: SavedGroup[]
    dimensions: Dimension[]
    authorAliases: AliasMap
    /** Workspace-state keys for arrangements (`layout:*`, `studio.way.*`), values as stored. */
    layouts: Record<string, unknown>
    savedQueries: unknown[]
}

const LAYOUT_KEY = /^(layout:|studio\.way\.)/

export function isLayoutKey(key: string): boolean {
    return LAYOUT_KEY.test(key)
}

export function buildConfig(groups: SavedGroup[], dimensions: Dimension[], aliases: AliasMap, state: Record<string, unknown>): WorkspaceConfig {
    const layouts = Object.fromEntries(Object.entries(state).filter(([k]) => isLayoutKey(k)))
    const saved = state["queries.saved"]
    return { format: CONFIG_FORMAT, version: CONFIG_VERSION, groups, dimensions, authorAliases: aliases, layouts, savedQueries: Array.isArray(saved) ? saved : [] }
}

/** Reads a config file, or a groups-only export; throws with a reason on anything else. */
export function parseConfig(text: string): WorkspaceConfig {
    let data: any
    try { data = JSON.parse(text) } catch { throw new Error("The file is not JSON.") }
    if (!data || typeof data !== "object") throw new Error("The file holds no workspace config.")
    const isConfig = data.format === CONFIG_FORMAT
    const isGroups = !isConfig && (Array.isArray(data.groups) || Array.isArray(data.componentGroups) || Array.isArray(data.fileGroups))
    if (!isConfig && !isGroups) throw new Error("This is not an Archstats workspace config or groups export.")
    if (isConfig && Number(data.version) > CONFIG_VERSION) throw new Error(`The file was written by a newer Archstats (config version ${data.version}).`)
    const groups = parseGroups(data)
    const aliases: AliasMap = {}
    if (isConfig && data.authorAliases && typeof data.authorAliases === "object") {
        for (const [a, c] of Object.entries(data.authorAliases)) if (typeof c === "string" && a) aliases[a] = c
    }
    const layouts: Record<string, unknown> = {}
    if (isConfig && data.layouts && typeof data.layouts === "object") {
        for (const [k, v] of Object.entries(data.layouts)) if (isLayoutKey(k)) layouts[k] = v
    }
    return {
        format: CONFIG_FORMAT,
        version: CONFIG_VERSION,
        groups,
        dimensions: parseDimensions(data, groups),
        authorAliases: aliases,
        layouts,
        savedQueries: isConfig && Array.isArray(data.savedQueries) ? data.savedQueries : [],
    }
}

export interface ConfigCounts { groups: number; lenses: number; aliases: number; layouts: number; queries: number }

export function countsOf(c: WorkspaceConfig): ConfigCounts {
    return { groups: c.groups.length, lenses: c.dimensions.length, aliases: Object.keys(c.authorAliases).length, layouts: Object.keys(c.layouts).length, queries: c.savedQueries.length }
}
