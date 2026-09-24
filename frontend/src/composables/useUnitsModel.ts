import { computed, ref, watch } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { loadUnits } from "~/utils/units"
import {
    AUTO, classify, detectFramework, languageOf, profileById, profilesFor,
    type FrameworkProfile, type Language,
} from "~/utils/javaFrameworks"
import { frameworkStorageKey, rememberedFramework } from "~/utils/javaFacts"
import { buildModuleGraph } from "~/utils/moduleGraph"

// One read of the snapshot, indexed once, shared by every structure.
//
// The old view recomputed the graph inside the render path, which is survivable
// at 180 nodes and is not what this screen is for: django-oscar declares 5,838
// units and LibreChat 3,538. Everything here is built in a single pass over the
// rows and handed out as Maps, so a structure switch or a sort costs a lookup
// rather than a rebuild.

export interface UnitNode {
    id: string
    /** type | function | module. */
    kind: string
    name: string
    /** The package, module path or file the unit is qualified by. */
    scope: string
    component: string
    module: string
    file: string
    /** The unit this one belongs to: a Go receiver, a Kotlin extension's type. */
    owner: string
    /** The lane of the active framework profile. */
    lane: string
    fanIn: number
    fanOut: number
    /**
     * How much code this unit is: its file's line count, shared between the
     * units declared in it. Degree alone has almost no variance -- LibreChat
     * has 548 edges over 3,538 units, so nearly everything scores 1 -- and an
     * area encoding built on it draws a uniform grid.
     */
    weight: number
}

export interface UnitEdge {
    from: string
    to: string
}

const KIND_ORDER: Record<string, number> = { type: 0, module: 1, function: 2 }

/** The part of an id before the name, which is how a unit is qualified. */
function scopeOf(id: string): string {
    const hash = id.lastIndexOf("#")
    if (hash >= 0) return id.slice(0, hash)
    const dot = id.lastIndexOf(".")
    return dot >= 0 ? id.slice(0, dot) : ""
}

interface RawUnitRow {
    id: string
    kind: string | null
    name: string | null
    component: string | null
    module: string | null
    owner: string | null
    file: string | null
}

/** What the view is built from, as read from the snapshot. */
interface UnitsSource {
    rows: RawUnitRow[]
    edges: UnitEdge[]
    facts: Map<string, any>
    lines: Map<string, number>
    generated: Set<string>
}

export function useUnitsModel() {
    const store = useDataStore()

    // Which framework profile reads the lanes. Remembered per workspace, since
    // an architect returning next week should not re-pick it.
    const frameworkOverride = ref<string | null>(null)
    watch(() => store.datasetKey, (key) => {
        frameworkOverride.value = rememberedFramework(frameworkStorageKey(null, key))
    }, { immediate: true })

    const source = useAsyncQuery<UnitsSource>(async () => {
        if (!store.hasData) return { rows: [] as RawUnitRow[], edges: [] as UnitEdge[], facts: new Map(), lines: new Map<string, number>(), generated: new Set<string>() }

        const hasUnits = store.hasView("units")
        const [rows, edges, facts, lines, generatedFiles] = await Promise.all([
            hasUnits
                ? store.query<RawUnitRow>("SELECT id, kind, name, component, module, owner, file FROM units")
                : Promise.resolve([] as RawUnitRow[]),
            loadEdges(store),
            // The facts carry markers and raw imports, which is what the
            // framework profiles read. Loaded alongside rather than after, so
            // a cold open is one round trip rather than three.
            loadUnits((sql) => store.query(sql), (v) => store.hasView(v)),
            loadLines(store),
            loadGenerated(store),
        ])
        return { rows, edges, facts, lines, generated: generatedFiles }
    }, [() => store.datasetKey], { initial: { rows: [] as RawUnitRow[], edges: [] as UnitEdge[], facts: new Map(), lines: new Map<string, number>(), generated: new Set<string>() }, immediate: true })

    /** Files a tool wrote, by their own header. */
    const generated = computed(() => source.data.value.generated)

    /**
     * Which language this codebase is: from every file in the snapshot, and
     * only failing that from the files units are declared in. A snapshot that
     * read units from a Symfony project's JavaScript alone offered NestJS,
     * Angular and React for Sylius.
     */
    const language = computed<Language | null>(() => {
        const all: string[] = []
        for (const list of (store.componentFilesIndex as Map<string, string[]>).values()) all.push(...list)
        return languageOf(all) ?? languageOf([...source.data.value.facts.values()].map((f: any) => f.file))
    })

    const detection = computed(() =>
        detectFramework([...source.data.value.facts.values()].map((f: any) => f.facts), language.value))

    const profile = computed<FrameworkProfile>(() =>
        profileById(frameworkOverride.value ?? detection.value.id))

    const offeredProfiles = computed(() => profilesFor(language.value))

    /**
     * Every unit, with its lane and its degree.
     *
     * Degrees come from one pass over the edges rather than from counting
     * neighbours per node, which is the difference between linear and
     * quadratic on a graph this size.
     */
    const units = computed<UnitNode[]>(() => {
        const { rows, edges, facts, lines } = source.data.value
        const fanIn = new Map<string, number>()
        const fanOut = new Map<string, number>()
        for (const e of edges) {
            fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1)
            fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1)
        }

        const p = profile.value
        const laneCache = new Map<string, string>()
        const out: UnitNode[] = []

        // Legacy snapshots carry no units table; the facts map is then the
        // Java-only reading and is the whole population.
        const population: RawUnitRow[] = rows.length > 0
            ? rows
            : [...facts.values()].map((f: any) => ({
                id: f.id, kind: "type", name: f.name, component: f.component,
                module: "", owner: "", file: f.file,
            }))

        // A file's lines are shared between the units declared in it, so a
        // 400-line module holding eight functions does not count eight times.
        const unitsPerFile = new Map<string, number>()
        for (const r of population) {
            const f = r.file || ""
            if (f) unitsPerFile.set(f, (unitsPerFile.get(f) ?? 0) + 1)
        }

        for (const r of population) {
            if (!r.id) continue
            const fact = facts.get(r.id)
            let lane = laneCache.get(r.id)
            if (lane === undefined) {
                lane = fact
                    ? classify(p, fact.facts, { inDegree: fanIn.get(r.id) ?? 0, outDegree: fanOut.get(r.id) ?? 0 })
                    : p.fallback
                laneCache.set(r.id, lane)
            }
            out.push({
                id: r.id,
                kind: r.kind || "type",
                name: r.name || r.id,
                scope: scopeOf(r.id),
                component: r.component || "",
                module: r.module || "",
                file: r.file || fact?.file || "",
                owner: r.owner || "",
                lane,
                fanIn: fanIn.get(r.id) ?? 0,
                fanOut: fanOut.get(r.id) ?? 0,
                weight: weightOf(r.file || fact?.file || "", lines, unitsPerFile),
            })
        }
        return out
    })

    const byId = computed(() => {
        const m = new Map<string, UnitNode>()
        for (const u of units.value) m.set(u.id, u)
        return m
    })

    const edges = computed(() => source.data.value.edges)

    /** Adjacency, both directions, built once. */
    const adjacency = computed(() => {
        const out = new Map<string, string[]>()
        const incoming = new Map<string, string[]>()
        for (const e of edges.value) {
            push(out, e.from, e.to)
            push(incoming, e.to, e.from)
        }
        return { out, incoming }
    })

    /** What a unit uses and what uses it, as nodes rather than ids. */
    function neighboursOf(id: string) {
        const { out, incoming } = adjacency.value
        const map = byId.value
        const uses = (out.get(id) ?? []).map((x) => map.get(x)).filter(Boolean) as UnitNode[]
        const usedBy = (incoming.get(id) ?? []).map((x) => map.get(x)).filter(Boolean) as UnitNode[]
        return { uses: dedupe(uses), usedBy: dedupe(usedBy) }
    }

    /** Lanes that actually hold something, in the profile's order. */
    /**
     * The things the codebase declares: types and functions. A module unit is
     * the file's own top-level code, which the engine records so its imports
     * have somewhere to come from; counting it as a declaration would make
     * every barrel and script "hold" one thing it never declared.
     */
    // What the codebase declares: not the module units that stand for a
    // file's top-level code, and not a member declared inside its owner --
    // a Go type's methods, a Python class's Meta. Java's methods are not
    // units at all, so counting them elsewhere made every other language
    // look several times as busy. A Kotlin extension function, owned by a
    // type in another file, is still declared where it is written.
    const declared = computed(() => {
        const fileOf = new Map(units.value.map((u) => [u.id, u.file]))
        return units.value.filter((u) => u.kind !== "module" && !(u.owner && fileOf.get(u.owner) === u.file))
    })

    const lanes = computed(() => {
        const counts = new Map<string, number>()
        for (const u of declared.value) counts.set(u.lane, (counts.get(u.lane) ?? 0) + 1)
        return profile.value.lanes
            .filter((l) => counts.has(l.id))
            .map((l) => ({ ...l, count: counts.get(l.id) ?? 0 }))
    })

    /**
     * The same codebase read at the grain that actually has edges.
     *
     * Built from the units rather than queried, so a snapshot taken before
     * this view existed reads the same as a fresh one.
     */
    const moduleGraph = computed(() => buildModuleGraph(units.value, edges.value))

    /**
     * Whether the module layer is worth drawing. At one unit per file -- Java,
     * and any language with a one-public-type-per-file rule -- a module is its
     * unit, and nesting it would add a level that carries no information.
     */
    const modulesAreMeaningful = computed(() => moduleGraph.value.density > 1.15)

    const hasUnits = computed(() => units.value.length > 0)
    const hasEdges = computed(() => edges.value.length > 0)

    return {
        loading: source.loading,
        error: source.error,
        units, declared, byId, edges, adjacency, neighboursOf,
        moduleGraph, modulesAreMeaningful,
        lanes, profile, offeredProfiles, detection, language,
        frameworkOverride, hasUnits, hasEdges, generated,
        kindRank: (kind: string) => KIND_ORDER[kind] ?? 3,
    }
}

/** Lines per file, which is the only size signal the snapshot carries. */
async function loadLines(store: ReturnType<typeof useDataStore>): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!store.hasView("files")) return out
    try {
        const rows = await store.query<{ name: string; lines: number | null }>(
            "SELECT name, complexity__lines AS lines FROM files",
        )
        for (const r of rows) if (r.name) out.set(r.name, Number(r.lines) || 0)
    } catch {
        // An older snapshot without the column costs the area encoding its
        // variance and nothing else; every structure still reads.
    }
    return out
}

/** Files whose header says a tool wrote them. Empty for older snapshots. */
async function loadGenerated(store: ReturnType<typeof useDataStore>): Promise<Set<string>> {
    if (!store.hasView("files")) return new Set()
    try {
        const rows = await store.query<{ name: string }>(
            "SELECT name FROM files WHERE complexity__files__generated > 0",
        )
        return new Set(rows.map((r) => r.name))
    } catch {
        return new Set()
    }
}

function weightOf(file: string, lines: Map<string, number>, unitsPerFile: Map<string, number>): number {
    const total = lines.get(file) ?? 0
    if (total <= 0) return 1
    return Math.max(1, total / (unitsPerFile.get(file) ?? 1))
}

async function loadEdges(store: ReturnType<typeof useDataStore>): Promise<UnitEdge[]> {
    // unit_connections is every language. The Java-only table is still read
    // for snapshots taken before it existed, where it holds the same data
    // under an older name.
    if (store.hasView("unit_connections")) {
        const rows = await store.query<{ from: string; to: string }>("SELECT `from`, `to` FROM unit_connections")
        const edges = rows.filter((r) => r.from && r.to && r.from !== r.to).map((r) => ({ from: r.from, to: r.to }))
        if (edges.length > 0) return edges
    }
    if (!store.hasView("java_class_connections_direct")) return []
    const rows = await store.query<{ from: string; to: string }>(
        "SELECT DISTINCT `from`, `to` FROM java_class_connections_direct",
    )
    return rows.filter((r) => r.from && r.to && r.from !== r.to).map((r) => ({ from: r.from, to: r.to }))
}

function push(index: Map<string, string[]>, key: string, value: string) {
    const list = index.get(key)
    if (list) list.push(value)
    else index.set(key, [value])
}

function dedupe(nodes: UnitNode[]): UnitNode[] {
    const seen = new Set<string>()
    const out: UnitNode[] = []
    for (const n of nodes) {
        if (seen.has(n.id)) continue
        seen.add(n.id)
        out.push(n)
    }
    return out
}
