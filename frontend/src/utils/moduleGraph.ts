// The file, treated as the thing that actually has edges.
//
// A unit graph draws every declared name as a node, which is the wrong grain
// for every language except Java. What an import names is the *module* --
// `ChatGPTClient.js` -- and `buildPromptBody` declared inside it is a private
// helper no import will ever mention. Drawn as a peer node it is not a gap in
// the data, it is a category error: the view invents 2,087 absences.
//
// Rolling the same edges up to files, measured on the snapshots on disk:
//
//   LibreChat    3,538 units / 1,217 files   units 41% connected -> files 74%
//   django-oscar 5,838 units /   676 files   units 21% connected -> files 46%
//   a Java repo  5,438 units / 5,438 files   units 59% connected -> files 59%
//
// Java is 1.00 units per file, so the layer collapses to nothing and the view
// is unchanged -- which is exactly why Java always looked first-class. It was
// getting this structure for free.

import type { UnitNode, UnitEdge } from "~/composables/useUnitsModel"

export interface ModuleNode {
    /** The file path, which is this module's identity. */
    path: string
    /** The basename without its extension, which is what an import writes. */
    name: string
    dir: string
    component: string
    /** The lane most of its units belong to. */
    lane: string
    /** Its units, types before functions, most-connected first within a kind. */
    units: UnitNode[]
    /**
     * What it declares at its own top level: its units less the members of
     * another unit in the same file. gin's context.go is one Context type
     * with 150 methods, and "declares 151 separate things" read as 151 jobs;
     * a Java file, whose methods are not units, could never say the same.
     */
    declared: UnitNode[]
    /**
     * The unit this module is *about*: the one sharing its filename, else the
     * most-referenced. `ChatGPTClient.js` is about `ChatGPTClient`; the three
     * helpers beside it are its insides.
     */
    primary: UnitNode | null
    /** Distinct modules importing this one, and imported by it. */
    fanIn: number
    fanOut: number
    lines: number
    /** Nothing imports this module and it imports nothing. */
    dark: boolean
    /**
     * Some module this one imports imports it back.
     *
     * Measured: every mutual pair in both test codebases sits inside one
     * lane -- LibreChat's three are all `Messages/Message` against
     * `Messages/MultiMessage` and the like. A cycle is therefore never
     * visible in a region built from traffic *between* lanes, which is why
     * it is marked on the module itself and shows up wherever modules are
     * listed.
     */
    inCycle: string[]
}

export interface ModuleEdge {
    from: string
    to: string
    /** The unit references that justify this edge, which is the evidence. */
    via: Array<{ from: string; to: string }>
}

export interface ModuleGraph {
    modules: ModuleNode[]
    edges: ModuleEdge[]
    byPath: Map<string, ModuleNode>
    /** Modules importing a given module, and the ones it imports. */
    incoming: Map<string, string[]>
    outgoing: Map<string, string[]>
    /** One dependency by its two ends, for inspecting a single cell. */
    between: Map<string, ModuleEdge>
    /**
     * Units per module across the codebase. At 1.0 the module layer carries
     * no information and the view should not draw it.
     */
    density: number
}

const KIND_RANK: Record<string, number> = { type: 0, module: 1, function: 2 }

/** The basename without directories or extension. */
export function baseName(path: string): string {
    const slash = path.lastIndexOf("/")
    const base = slash >= 0 ? path.slice(slash + 1) : path
    const dot = base.lastIndexOf(".")
    return dot > 0 ? base.slice(0, dot) : base
}

/**
 * What to call a module. A package's entry file is named for its directory:
 * LibreChat has dozens of `index` files and oscar hundreds of `__init__`, and
 * "index is the largest at 40" names none of them.
 */
export function moduleName(path: string): string {
    const base = baseName(path)
    if (base !== "index" && base !== "__init__" && base !== "mod") return base
    const dir = dirName(path).replace(/^\.\/?/, "")
    if (!dir) return base
    return dir.slice(dir.lastIndexOf("/") + 1) + "/" + base
}

/**
 * The last few segments of a directory, which is the part that identifies it.
 *
 * `repos/eai-3540597-qp-audit/src/main/java/com/fedex/qp/audit/service/impl`
 * truncated from the right leaves "repos/eai-3540597-qp-aud…", which says
 * nothing. The tail says `audit/service/impl`.
 */
export function dirTail(dir: string, segments = 3): string {
    if (!dir) return ""
    const parts = dir.split("/")
    if (parts.length <= segments) return dir
    return "…/" + parts.slice(-segments).join("/")
}

export function dirName(path: string): string {
    const slash = path.lastIndexOf("/")
    return slash >= 0 ? path.slice(0, slash) : ""
}

/**
 * Group units by the file they are declared in and lift their edges with them.
 *
 * Units with no file cannot belong to a module and are dropped rather than
 * collected under an empty path, which would read as one enormous module.
 */
export function buildModuleGraph(units: UnitNode[], unitEdges: UnitEdge[]): ModuleGraph {
    const byPath = new Map<string, ModuleNode>()
    const fileOfUnit = new Map<string, string>()

    // The lane of a file that declares nothing of its own: a barrel, a test,
    // a script. Its module unit stands for the file's top-level code and
    // carries its imports, but is not a thing the file declares.
    const moduleLane = new Map<string, string>()
    for (const u of units) {
        if (!u.file) continue
        fileOfUnit.set(u.id, u.file)
        let m = byPath.get(u.file)
        if (!m) {
            m = {
                path: u.file, name: moduleName(u.file), dir: dirName(u.file),
                component: u.component, lane: u.lane, units: [], declared: [], primary: null,
                fanIn: 0, fanOut: 0, lines: 0, dark: true, inCycle: [],
            }
            byPath.set(u.file, m)
        }
        if (u.kind === "module") {
            if (!moduleLane.has(u.file)) moduleLane.set(u.file, u.lane)
            continue
        }
        m.units.push(u)
    }

    // Unit references become module references. A reference inside one file is
    // internal structure, not a dependency, so it is not an edge.
    const seen = new Map<string, ModuleEdge>()
    for (const e of unitEdges) {
        const from = fileOfUnit.get(e.from)
        const to = fileOfUnit.get(e.to)
        if (!from || !to || from === to) continue
        const key = from + "\n" + to
        const existing = seen.get(key)
        if (existing) existing.via.push({ from: e.from, to: e.to })
        else seen.set(key, { from, to, via: [{ from: e.from, to: e.to }] })
    }

    const edges = [...seen.values()]
    const incoming = new Map<string, string[]>()
    const outgoing = new Map<string, string[]>()
    for (const e of edges) {
        push(outgoing, e.from, e.to)
        push(incoming, e.to, e.from)
    }

    const directed = new Set(edges.map((e) => e.from + "\n" + e.to))
    for (const m of byPath.values()) {
        m.fanIn = incoming.get(m.path)?.length ?? 0
        m.fanOut = outgoing.get(m.path)?.length ?? 0
        m.dark = m.fanIn === 0 && m.fanOut === 0
        m.inCycle = (outgoing.get(m.path) ?? []).filter((other) => directed.has(other + "\n" + m.path))
        m.units.sort((a, b) =>
            (KIND_RANK[a.kind] ?? 3) - (KIND_RANK[b.kind] ?? 3) ||
            b.fanIn - a.fanIn ||
            a.name.localeCompare(b.name))
        const here = new Set(m.units.map((u) => u.id))
        m.declared = m.units.filter((u) => !u.owner || !here.has(u.owner))
        m.primary = primaryOf(m)
        m.lane = dominantLane(m.units, m.primary) || moduleLane.get(m.path) || m.lane
        m.lines = m.units.reduce((sum, u) => sum + u.weight, 0)
    }

    const modules = [...byPath.values()]
    // A name several modules share is said with its directory: oscar has a
    // views.py in every app, and "views is the largest at 126" named none.
    const sharing = new Map<string, number>()
    for (const m of modules) sharing.set(m.name, (sharing.get(m.name) ?? 0) + 1)
    for (const m of modules) {
        if ((sharing.get(m.name) ?? 0) < 2 || m.name.includes("/")) continue
        const dir = m.dir.replace(/^\.\/?/, "")
        if (dir) m.name = dir.slice(dir.lastIndexOf("/") + 1) + "/" + m.name
    }
    const totalUnits = modules.reduce((n, m) => n + m.units.length, 0)
    const between = new Map(edges.map((e) => [e.from + "\n" + e.to, e]))
    return {
        modules, edges, byPath, incoming, outgoing, between,
        density: modules.length > 0 ? totalUnits / modules.length : 0,
    }
}

/**
 * The unit a module is named after, else the one most of the codebase refers
 * to. Matched without separators or case because `use-auth.ts` declares
 * `useAuth`.
 */
function primaryOf(m: ModuleNode): UnitNode | null {
    if (m.units.length === 0) return null
    const wanted = m.name.replace(/[-_.]/g, "").toLowerCase()
    const named = m.units.find((u) => u.name.replace(/[-_.]/g, "").toLowerCase() === wanted)
    if (named) return named
    // Already sorted types-first by descending fan-in, so the head is the
    // most-referenced thing in the file.
    return m.units[0]
}

/**
 * The lane the module belongs to: its primary unit's, since that is the unit
 * the module is about. A module whose primary has no lane falls back to the
 * one most of its units share.
 */
function dominantLane(units: UnitNode[], primary: UnitNode | null): string {
    if (primary?.lane) return primary.lane
    const counts = new Map<string, number>()
    for (const u of units) counts.set(u.lane, (counts.get(u.lane) ?? 0) + 1)
    let best = ""
    let bestN = -1
    for (const [lane, n] of counts) if (n > bestN) { best = lane; bestN = n }
    return best
}

function push(index: Map<string, string[]>, key: string, value: string) {
    const list = index.get(key)
    if (list) { if (!list.includes(value)) list.push(value) }
    else index.set(key, [value])
}
