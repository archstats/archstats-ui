import { acceptHMRUpdate, defineStore } from 'pinia'
import { readDurable, writeDurable } from "~/utils/durable"
import { v4 as uuidv4 } from 'uuid'
import { useDataStore } from '~/stores/data'
import { isLive, parseQuery, runQuery, type Query } from '~/utils/query'
import { detectSeparator } from '~/utils/studio'

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

// A group is a named set of units. A unit is a component or a file; a Java
// class is its file. One group may hold whole components next to single
// files, so "Audits" can be a component plus the three controllers that live
// elsewhere. Every reader resolves a group to files (for file views) or to
// components with a coverage (for component views) through the getters
// below; nothing outside this store needs to know how members are stored.

export type UnitKind = 'component' | 'file'

export interface Member {
    kind: UnitKind
    name: string
}

/**
 * Whether a group IS its query or IS its members.
 *
 * A query about names answers the same way until someone renames something;
 * one about metrics answers differently every scan. That difference decides
 * whether a group is a decision or a finding, and it is asked rather than
 * defaulted — a domain map that quietly redraws itself because a file grew by
 * 200 lines is worse than no map.
 */
export type GroupMode = 'live' | 'fixed'

/** How a fixed group was found, kept so it can be re-checked rather than trusted. */
export interface Provenance {
    query: string
    /** The scan it was run against, so a later disagreement can be dated. */
    scanId?: string
    at: number
}

export interface SavedGroup {
    id: string
    name: string
    members: Member[]
    color: string       // HSL string, e.g. "hsl(210, 80%, 55%)"
    createdAt: number
    /** The axis this group cuts along: "Domain", "Layer", … A unit may sit in one group per dimension. */
    dimension: string
    /** When live, the group is the answer to this; `members` is then a cache nobody reads. */
    query?: string
    mode: GroupMode
    /**
     * For a fixed group, the query that found it. Re-run on each scan, not to
     * change the group but to offer what it would catch now: membership never
     * moves under the architect, and never goes quietly stale either.
     */
    foundBy?: Provenance
}

/** How much of one component a group holds. */
export interface Coverage {
    /** Files of the component inside the group. */
    files: number
    /** Files the component has in the snapshot (0 when unknown). */
    total: number
    /** The whole component is in, either listed as a component or file by file. */
    full: boolean
}

/** Where a group lands when nothing chose a dimension for it: the "Ad hoc" dimension. */
export const DEFAULT_DIMENSION = 'Ad hoc'
/** The name the old default carried; migrated on load. */
const LEGACY_DEFAULT = 'Groups'

export type DimensionCut = 'vertical' | 'horizontal' | 'free'

/** A dimension is one way of slicing the codebase; groups belong to one by name. */
export interface Dimension {
    name: string
    cut: DimensionCut
    /** Position in the sidebar and in menus. */
    order: number
    /** Where this dimension starts in the colour palette, so two dimensions differ at a glance. */
    hue: number
    description: string
    createdAt: number
}

export function units(kind: UnitKind, names: Iterable<string>): Member[] {
    return Array.from(names, name => ({ kind, name }))
}

export function memberKey(m: Member): string {
    return `${m.kind}:${m.name}`
}

export function componentMembers(g: SavedGroup): string[] {
    return g.members.filter(m => m.kind === 'component').map(m => m.name)
}

export function fileMembers(g: SavedGroup): string[] {
    return g.members.filter(m => m.kind === 'file').map(m => m.name)
}

export function hasMember(g: SavedGroup, kind: UnitKind, name: string): boolean {
    return g.members.some(m => m.kind === kind && m.name === name)
}

function normaliseMember(raw: unknown, fallbackKind: UnitKind): Member | null {
    if (typeof raw === 'string') return raw ? { kind: fallbackKind, name: raw } : null
    if (raw && typeof raw === 'object') {
        const m = raw as Partial<Member>
        if (typeof m.name !== 'string' || !m.name) return null
        return { kind: m.kind === 'file' ? 'file' : 'component', name: m.name }
    }
    return null
}

function normaliseGroup(g: Partial<SavedGroup> & { id: string; type?: UnitKind }, fallbackKind: UnitKind = 'component'): SavedGroup {
    const kind: UnitKind = g.type === 'file' ? 'file' : fallbackKind
    const seen = new Set<string>()
    const members: Member[] = []
    for (const raw of Array.isArray(g.members) ? g.members : []) {
        const m = normaliseMember(raw, kind)
        if (!m || seen.has(memberKey(m))) continue
        seen.add(memberKey(m))
        members.push(m)
    }
    const query = typeof g.query === 'string' && g.query.trim() ? g.query : undefined
    const found = g.foundBy && typeof (g.foundBy as any).query === 'string'
        ? { query: (g.foundBy as any).query, scanId: (g.foundBy as any).scanId, at: Number((g.foundBy as any).at) || Date.now() }
        : undefined
    return {
        id: g.id,
        name: g.name ?? 'Group',
        members,
        color: g.color ?? GROUP_COLOR_PALETTE[0],
        createdAt: g.createdAt ?? Date.now(),
        dimension: (g.dimension && g.dimension.trim()) || DEFAULT_DIMENSION,
        query,
        // A group written before queries existed is fixed: we do not know how
        // it was made, and inventing a query for it would be a lie that
        // silently rewrites what the architect decided.
        mode: g.mode === 'live' && query ? 'live' : 'fixed',
        foundBy: found,
    }
}

/** One number per unit per metric, for the queries that ask about size or shape. */
export interface MetricTable {
    components: Map<string, Record<string, number>>
    files: Map<string, Record<string, number>>
    /** Short name → column id, from the snapshot's own `_metric_definitions`. */
    alias: Map<string, string>
}

interface GroupsState {
    groups: SavedGroup[]
    /** Loaded on demand; a live query that asks about metrics needs it. */
    metrics: MetricTable | null
    metricsFor: string | null
    /** Dimension records; `dimensions` (the getter) lists their names in order. */
    dimensionRecords: Dimension[]
    projectKey: string | null
    /** The last dimension saved through the builder, for a moment of feedback. */
    lastSaved: { dimension: string; groups: number; at: number } | null
}

// ═══════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════

export const GROUP_COLOR_PALETTE = [
    'hsl(210, 80%, 55%)',   // Blue
    'hsl(160, 70%, 42%)',   // Emerald
    'hsl(340, 75%, 55%)',   // Rose
    'hsl(45, 90%, 50%)',    // Amber
    'hsl(270, 65%, 58%)',   // Violet
    'hsl(15, 85%, 55%)',    // Orange
    'hsl(190, 75%, 45%)',   // Cyan
    'hsl(330, 65%, 50%)',   // Pink
    'hsl(95, 60%, 45%)',    // Lime
    'hsl(240, 55%, 60%)',   // Indigo
    'hsl(30, 80%, 52%)',    // Tangerine
    'hsl(175, 65%, 40%)',   // Teal
]

/**
 * The next colour for a group in a dimension: the first palette colour that
 * dimension has not used, walking from the dimension's own starting hue so
 * two dimensions drawn side by side start on different colours.
 */
function getNextColor(groupsInDimension: SavedGroup[], hue: number): string {
    const usedColors = new Set(groupsInDimension.map(g => g.color))
    const n = GROUP_COLOR_PALETTE.length
    for (let i = 0; i < n; i++) {
        const color = GROUP_COLOR_PALETTE[(hue + i) % n]
        if (!usedColors.has(color)) return color
    }
    // Every palette colour used in this dimension: cycle with a lightness offset.
    const base = GROUP_COLOR_PALETTE[(hue + groupsInDimension.length) % n]
    const cycleRound = Math.floor(groupsInDimension.length / n)
    const lightnessShift = cycleRound * 15
    return base.replace(/(\d+)%\)$/, (_, l) => {
        const newL = Math.min(85, parseInt(l) + lightnessShift)
        return `${newL}%)`
    })
}

// ═══════════════════════════════════════════════════════
// LOCALSTORAGE
// ═══════════════════════════════════════════════════════

const STORAGE_PREFIX = 'archstats-groups-'
const STORAGE_VERSION = 4

function getStorageKey(projectKey: string): string {
    return `${STORAGE_PREFIX}${projectKey}`
}

/** Reads the current shape or any older one; the legacy default dimension becomes "Ad hoc". */
export function parseGroups(data: any): SavedGroup[] {
    if (!data || typeof data !== 'object') return []
    let groups: SavedGroup[]
    if (Array.isArray(data.groups)) groups = data.groups.map((g: any) => normaliseGroup(g))
    else {
        const component = Array.isArray(data.componentGroups) ? data.componentGroups.map((g: any) => normaliseGroup(g, 'component')) : []
        const file = Array.isArray(data.fileGroups) ? data.fileGroups.map((g: any) => normaliseGroup(g, 'file')) : []
        groups = [...component, ...file]
    }
    if (!(Number(data.version) >= 3)) for (const g of groups) if (g.dimension === LEGACY_DEFAULT) g.dimension = DEFAULT_DIMENSION
    return groups
}

function normaliseDimension(raw: any, order: number): Dimension | null {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
    if (!name) return null
    return {
        name,
        cut: raw.cut === 'vertical' || raw.cut === 'horizontal' ? raw.cut : 'free',
        order: Number.isFinite(raw.order) ? raw.order : order,
        hue: Number.isFinite(raw.hue) ? raw.hue : 0,
        description: typeof raw.description === 'string' ? raw.description : '',
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    }
}

/** Dimension records, reconciled with the groups: every dimension a group names exists. */
export function parseDimensions(data: any, groups: SavedGroup[]): Dimension[] {
    const out: Dimension[] = []
    const seen = new Set<string>()
    if (data && Array.isArray(data.dimensions)) {
        data.dimensions.forEach((raw: any, i: number) => {
            const d = normaliseDimension(raw, i)
            if (d && !seen.has(d.name)) { seen.add(d.name); out.push(d) }
        })
    }
    for (const g of groups) {
        if (seen.has(g.dimension)) continue
        seen.add(g.dimension)
        out.push({ name: g.dimension, cut: 'free', order: out.length, hue: (out.length * 5) % GROUP_COLOR_PALETTE.length, description: '', createdAt: g.createdAt })
    }
    return out.sort((a, b) => a.order - b.order).map((d, i) => ({ ...d, order: i }))
}

// Groups are the architect's months of work: they live in app.db (the
// versioned blob stored opaque under "groups"), carried up from the browser
// copy earlier versions kept.
function saveToLocalStorage(projectKey: string, groups: SavedGroup[], dimensions: Dimension[]) {
    if (!projectKey) return
    writeDurable(projectKey, 'groups', getStorageKey(projectKey), JSON.stringify({ version: STORAGE_VERSION, groups, dimensions }))
}

function loadFromLocalStorage(projectKey: string): { groups: SavedGroup[]; dimensions: Dimension[] } | null {
    if (!projectKey) return null
    try {
        const raw = readDurable(projectKey, 'groups', getStorageKey(projectKey))
        if (!raw) return null
        const data = JSON.parse(raw)
        // Migration here is one-way and these are hand-made decisions, so the
        // shape being replaced is kept once, under its own key.
        if (Number(data.version) < STORAGE_VERSION) {
            try { localStorage.setItem(`${getStorageKey(projectKey)}-v${Number(data.version) || 0}`, raw) } catch {}
        }
        const groups = parseGroups(data)
        return { groups, dimensions: parseDimensions(data, groups) }
    } catch (e) {
        console.warn('Failed to load groups from localStorage:', e)
        return null
    }
}

interface Resolved {
    components: Map<string, Coverage>
    files: Set<string>
}


// ═══════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════

export const useGroupsStore = defineStore('groups', {
    state: (): GroupsState => ({
        groups: [],
        dimensionRecords: [],
        projectKey: null,
        lastSaved: null,
        metrics: null,
        metricsFor: null,
    }),

    getters: {
        allGroups: (state) => state.groups,

        getGroupById: (state) => {
            return (id: string): SavedGroup | undefined => state.groups.find(g => g.id === id)
        },

        getGroupColor: (state) => {
            return (groupId: string): string | null => state.groups.find(g => g.id === groupId)?.color || null
        },

        /** Dimension names in their own order. */
        dimensions(state): string[] {
            return state.dimensionRecords.slice().sort((a, b) => a.order - b.order).map(d => d.name)
        },

        dimensionOf: (state) => (name: string): Dimension | undefined => state.dimensionRecords.find(d => d.name === name),

        /** Every dimension with its groups, in dimension order; an empty dimension still appears. */
        groupsByDimension(state): Array<{ dimension: string; groups: SavedGroup[] }> {
            const out = new Map<string, SavedGroup[]>()
            for (const g of state.groups) out.set(g.dimension, [...(out.get(g.dimension) ?? []), g])
            return this.dimensions.map(dimension => ({ dimension, groups: out.get(dimension) ?? [] }))
        },

        /**
         * What each group amounts to right now: its own members when fixed,
         * the answer to its query when live.
         *
         * Every view that colours by lens resolves every group, so identical
         * query text is answered once — two groups written the same way are
         * the same question.
         */
        membership(state): Map<string, Member[]> {
            const data = useDataStore()
            const components = Array.from(data.componentFilesIndex.keys())
            const files = Array.from(data.fileComponentIndex.keys())
            const sep = detectSeparator(components)
            const metrics = state.metrics
            const metric = metrics
                ? (kind: UnitKind, id: string, name: string): number | undefined => {
                    const row = (kind === 'component' ? metrics.components : metrics.files).get(id)
                    if (!row) return undefined
                    const column = metrics.alias.get(name.toLowerCase()) ?? name
                    const v = row[column]
                    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
                }
                : undefined

            const answered = new Map<string, Member[]>()
            const out = new Map<string, Member[]>()
            for (const g of state.groups) {
                if (g.mode !== 'live' || !g.query) { out.set(g.id, g.members); continue }
                let members = answered.get(g.query)
                if (!members) {
                    const r = runQuery(parseQuery(g.query), { components, files, componentSep: sep, metric })
                    members = [...units('component', r.components), ...units('file', r.files)]
                    answered.set(g.query, members)
                }
                out.set(g.id, members)
            }
            return out
        },

        /**
         * What a lens is worth right now.
         *
         * Everything here is drift the architect would otherwise find out
         * about by accident, months later: a query that stopped matching
         * because someone renamed a package, two groups quietly claiming the
         * same component, a frozen group whose own query has moved on. The
         * app reports it and offers; it never absorbs it, and it never edits
         * a decision on the architect's behalf.
         */
        lensHealth(state): (dimension: string) => {
            groups: number; placed: number; total: number
            overlaps: Array<{ id: string; groups: string[] }>
            silent: Array<{ group: SavedGroup; lines: number[] }>
            candidates: Array<{ group: SavedGroup; extra: number }>
        } {
            return (dimension: string) => {
                const data = useDataStore()
                const total = data.componentFilesIndex.size
                const mine = state.groups.filter(g => g.dimension === dimension)

                const owners = new Map<string, string[]>()
                for (const g of mine) {
                    for (const m of this.membership.get(g.id) ?? g.members) {
                        if (m.kind !== 'component') continue
                        owners.set(m.name, [...(owners.get(m.name) ?? []), g.name])
                    }
                }
                const overlaps: Array<{ id: string; groups: string[] }> = []
                owners.forEach((names, id) => { if (names.length > 1) overlaps.push({ id, groups: names }) })

                // A line that matches nothing is the whole reason a group is
                // text rather than a list of ids.
                const components = Array.from(data.componentFilesIndex.keys())
                const files = Array.from(data.fileComponentIndex.keys())
                const sep = detectSeparator(components)
                const answer = (text: string) => runQuery(parseQuery(text), { components, files, componentSep: sep })

                const silent: Array<{ group: SavedGroup; lines: number[] }> = []
                const candidates: Array<{ group: SavedGroup; extra: number }> = []
                for (const g of mine) {
                    if (g.mode === 'live' && g.query) {
                        const r = answer(g.query)
                        if (r.empty.length) silent.push({ group: g, lines: r.empty })
                        continue
                    }
                    // A fixed group's query is a watchlist: it offers what it
                    // would catch now, and changes nothing.
                    if (!g.foundBy) continue
                    const held = new Set(g.members.filter(m => m.kind === 'component').map(m => m.name))
                    const r = answer(g.foundBy.query)
                    if (r.empty.length) silent.push({ group: g, lines: r.empty })
                    const extra = r.components.filter(id => !held.has(id)).length
                    if (extra > 0) candidates.push({ group: g, extra })
                }

                return { groups: mine.length, placed: owners.size, total, overlaps, silent, candidates }
            }
        },

        /** The members of one group, whichever way it is defined. */
        membersOf(): (g: SavedGroup) => Member[] {
            return (g) => this.membership.get(g.id) ?? g.members
        },

        // ── Resolution: what each group amounts to in the open snapshot ──
        resolved(state): Map<string, Resolved> {
            const data = useDataStore()
            const componentOf = data.fileComponentIndex
            const filesOfComponent = data.componentFilesIndex
            const out = new Map<string, Resolved>()
            for (const g of state.groups) {
                const components = new Map<string, Coverage>()
                const files = new Set<string>()
                for (const m of this.membership.get(g.id) ?? g.members) {
                    if (m.kind === 'component') {
                        const all = filesOfComponent.get(m.name) ?? []
                        components.set(m.name, { files: all.length, total: all.length, full: true })
                        for (const f of all) files.add(f)
                    } else {
                        files.add(m.name)
                        const c = componentOf.get(m.name)
                        if (!c) continue
                        const cov = components.get(c)
                        if (cov?.full) continue
                        const total = (filesOfComponent.get(c) ?? []).length
                        const n = (cov?.files ?? 0) + 1
                        components.set(c, { files: n, total, full: total > 0 && n >= total })
                    }
                }
                out.set(g.id, { components, files })
            }
            return out
        },

        /** Components a group touches, with how much of each it holds. */
        componentsOf(): (g: SavedGroup) => Map<string, Coverage> {
            return (g) => this.resolved.get(g.id)?.components ?? new Map()
        },

        /** Every file a group amounts to: listed files plus the files of listed components. */
        filesOf(): (g: SavedGroup) => Set<string> {
            return (g) => this.resolved.get(g.id)?.files ?? new Set()
        },

        coverage(): (g: SavedGroup, component: string) => Coverage | null {
            return (g, component) => this.resolved.get(g.id)?.components.get(component) ?? null
        },

        /** component → groups holding it, wholly or in part. */
        componentGroupIndex(state): Map<string, SavedGroup[]> {
            const index = new Map<string, SavedGroup[]>()
            for (const g of state.groups) {
                for (const c of this.resolved.get(g.id)?.components.keys() ?? []) {
                    const list = index.get(c)
                    if (list) list.push(g); else index.set(c, [g])
                }
            }
            return index
        },

        /** file → groups holding it, directly or through its component. */
        fileGroupIndex(state): Map<string, SavedGroup[]> {
            const index = new Map<string, SavedGroup[]>()
            for (const g of state.groups) {
                for (const f of this.resolved.get(g.id)?.files ?? []) {
                    const list = index.get(f)
                    if (list) list.push(g); else index.set(f, [g])
                }
            }
            return index
        },

        /** Groups that list the unit itself (what "Remove from groups" acts on). */
        directGroupsOf(state): (kind: UnitKind, name: string) => SavedGroup[] {
            return (kind, name) => state.groups.filter(g => hasMember(g, kind, name))
        },

        getGroupsForComponent(): (componentName: string) => SavedGroup[] {
            return (componentName) => this.componentGroupIndex.get(componentName) ?? []
        },

        getGroupsForFile(): (filePath: string) => SavedGroup[] {
            return (filePath) => this.fileGroupIndex.get(filePath) ?? []
        },

        /** How much of the codebase a dimension covers: distinct components its groups touch. */
        dimensionCoverage(): (dimension: string) => { groups: number; components: number } {
            return (dimension) => {
                const seen = new Set<string>()
                let groups = 0
                for (const g of this.groups) {
                    if (g.dimension !== dimension) continue
                    groups++
                    for (const c of this.componentsOf(g).keys()) seen.add(c)
                }
                return { groups, components: seen.size }
            }
        },
    },

    actions: {
        // ── Lifecycle ──────────────────────────────────────
        initForProject(projectKey: string) {
            this.projectKey = projectKey
            const saved = loadFromLocalStorage(projectKey)
            this.groups = saved?.groups ?? []
            this.dimensionRecords = saved?.dimensions ?? []
            this.lastSaved = null
        },

        // ── Dimensions ─────────────────────────────────────
        /** Makes sure a dimension exists; returns it. */
        ensureDimension(name: string, opts: Partial<Pick<Dimension, 'cut' | 'description'>> = {}): Dimension {
            const label = name.trim() || DEFAULT_DIMENSION
            let d = this.dimensionRecords.find(x => x.name === label)
            if (!d) {
                d = { name: label, cut: opts.cut ?? 'free', order: this.dimensionRecords.length, hue: (this.dimensionRecords.length * 5) % GROUP_COLOR_PALETTE.length, description: opts.description ?? '', createdAt: Date.now() }
                this.dimensionRecords.push(d)
                this._persist()
            } else if (opts.cut && d.cut === 'free' && opts.cut !== 'free') {
                d.cut = opts.cut
                this._persist()
            }
            return d
        },

        updateDimension(name: string, updates: Partial<Pick<Dimension, 'cut' | 'description'>>) {
            const d = this.dimensionRecords.find(x => x.name === name)
            if (!d) return
            if (updates.cut !== undefined) d.cut = updates.cut
            if (updates.description !== undefined) d.description = updates.description
            this._persist()
        },

        /** Moves a dimension to a position in the order. */
        moveDimension(name: string, to: number) {
            const list = this.dimensionRecords.slice().sort((a, b) => a.order - b.order)
            const from = list.findIndex(d => d.name === name)
            if (from === -1) return
            const [d] = list.splice(from, 1)
            list.splice(Math.max(0, Math.min(list.length, to)), 0, d)
            list.forEach((x, i) => { x.order = i })
            this._persist()
        },

        // ── CRUD ───────────────────────────────────────────
        createGroup(name: string, members: Member[] = [], dimension: string = DEFAULT_DIMENSION): SavedGroup {
            const d = this.ensureDimension(dimension)
            const group = normaliseGroup({
                id: uuidv4(),
                name,
                members,
                color: getNextColor(this.groups.filter(g => g.dimension === d.name), d.hue),
                createdAt: Date.now(),
                dimension: d.name,
            })
            this.groups.push(group)
            this._persist()
            return group
        },

        updateGroup(id: string, updates: Partial<Pick<SavedGroup, 'name' | 'color' | 'members' | 'dimension'>>) {
            const group = this._findGroup(id)
            if (!group) return
            if (updates.name !== undefined) group.name = updates.name
            if (updates.color !== undefined) group.color = updates.color
            if (updates.members !== undefined) group.members = normaliseGroup({ id, members: updates.members }).members
            if (updates.dimension !== undefined) group.dimension = this.ensureDimension(updates.dimension).name
            this._persist()
        },

        addMembersToGroup(id: string, newMembers: Member[]) {
            const group = this._findGroup(id)
            if (!group) return
            const keys = new Set(group.members.map(memberKey))
            for (const m of newMembers) {
                if (keys.has(memberKey(m))) continue
                keys.add(memberKey(m))
                group.members.push({ kind: m.kind, name: m.name })
            }
            this._persist()
        },

        removeMembersFromGroup(id: string, toRemove: Member[]) {
            const group = this._findGroup(id)
            if (!group) return
            const keys = new Set(toRemove.map(memberKey))
            group.members = group.members.filter(m => !keys.has(memberKey(m)))
            this._persist()
        },

        /**
         * Define a group by a query.
         *
         * Live keeps the query and lets the snapshot decide who is in it.
         * Fixed keeps the members that were on screen when the architect said
         * yes, and files the query as provenance — so the group can be
         * re-checked later without ever moving on its own. Either way the
         * query is kept: choosing fixed must not feel like throwing work away,
         * or people pick live out of loss aversion and their domain map starts
         * redrawing itself.
         */
        setQuery(id: string, query: string, mode: GroupMode, scanId?: string) {
            const g = this.groups.find(x => x.id === id)
            if (!g) return
            const text = query.trim()
            if (!text) {
                g.query = undefined
                g.mode = 'fixed'
                this._persist()
                return
            }
            g.query = text
            g.mode = mode
            if (mode === 'fixed') {
                g.foundBy = { query: text, scanId, at: Date.now() }
                // Freeze what the query answers right now, so the members are
                // the ones that were actually seen and agreed to.
                const found = this.membership.get(g.id)
                if (found && found.length) g.members = found
            } else {
                g.foundBy = undefined
            }
            this._persist()
        },

        /**
         * Load the numbers a `where` clause asks about.
         *
         * The language does not define a metric namespace of its own; it
         * inherits the snapshot's, which is documented inside the snapshot in
         * `_metric_definitions`. So an extension that adds a metric extends
         * the language, and the editor can offer its description without the
         * app knowing anything about it.
         */
        async ensureMetrics(): Promise<MetricTable | null> {
            const data = useDataStore()
            const key = data.datasetKey ?? ''
            if (this.metrics && this.metricsFor === key) return this.metrics
            if (!data.hasData) return null
            try {
                const [defs, comps, files] = await Promise.all([
                    data.hasView('_metric_definitions') ? data.query<any>('select id, name from _metric_definitions') : Promise.resolve([]),
                    data.query<any>('select * from components'),
                    data.hasView('files') ? data.query<any>('select * from files') : Promise.resolve([]),
                ])
                const numeric = (rows: any[]) => {
                    const out = new Map<string, Record<string, number>>()
                    for (const r of rows) {
                        if (!r?.name) continue
                        const row: Record<string, number> = {}
                        for (const k in r) { const v = Number(r[k]); if (Number.isFinite(v)) row[k] = v }
                        out.set(String(r.name), row)
                    }
                    return out
                }
                // A short name wins only if it is unambiguous. Two metrics
                // answering to `efferent` would make a query mean one thing
                // on one snapshot and another elsewhere.
                const alias = new Map<string, string>()
                const clashed = new Set<string>()
                const offer = (from: string, to: string) => {
                    const k = from.toLowerCase().trim()
                    if (!k || clashed.has(k)) return
                    const seen = alias.get(k)
                    if (seen && seen !== to) { alias.delete(k); clashed.add(k); return }
                    alias.set(k, to)
                }
                const columns = new Set<string>()
                for (const row of comps.values()) for (const k in row) columns.add(k)
                for (const id of columns) {
                    offer(id, id)
                    const tail = id.split('__').slice(-1)[0]
                    if (tail && tail !== id) offer(tail, id)
                    const twoDeep = id.split('__').slice(-2).join('_')
                    if (twoDeep && twoDeep !== tail) offer(twoDeep, id)
                }
                for (const d of defs) if (d?.id && d?.name) offer(String(d.name), String(d.id))
                this.metrics = { components: numeric(comps), files: numeric(files), alias }
                this.metricsFor = key
                return this.metrics
            } catch (e) {
                console.warn('Failed to load metrics for queries:', e)
                return null
            }
        },

        /** Take a fixed group's watchlist off, when its provenance stops being useful. */
        clearProvenance(id: string) {
            const g = this.groups.find(x => x.id === id)
            if (!g?.foundBy) return
            g.foundBy = undefined
            this._persist()
        },

        deleteGroup(id: string) {
            this.groups = this.groups.filter(g => g.id !== id)
            this._persist()
        },

        /** Renames a dimension; renaming onto an existing one merges into it. */
        renameDimension(from: string, to: string) {
            const name = to.trim()
            if (!name || name === from) return
            const target = this.dimensionRecords.find(d => d.name === name)
            const source = this.dimensionRecords.find(d => d.name === from)
            for (const g of this.groups) if (g.dimension === from) g.dimension = name
            if (target) this.dimensionRecords = this.dimensionRecords.filter(d => d !== source)
            else if (source) source.name = name
            this._persist()
        },

        /** Deletes a dimension and every group in it. */
        deleteDimension(dimension: string) {
            this.groups = this.groups.filter(g => g.dimension !== dimension)
            this.dimensionRecords = this.dimensionRecords.filter(d => d.name !== dimension).sort((a, b) => a.order - b.order).map((d, i) => ({ ...d, order: i }))
            this._persist()
        },

        /** A moment of feedback after the builder saves. */
        noteSaved(dimension: string, groups: number) { this.lastSaved = { dimension, groups, at: Date.now() } },

        // ── Import / Export ────────────────────────────────
        exportGroups(): string {
            return JSON.stringify({ version: STORAGE_VERSION, groups: this.groups, dimensions: this.dimensionRecords }, null, 2)
        },

        importGroups(jsonString: string, mode: 'merge' | 'replace' = 'merge') {
            try {
                const data = JSON.parse(jsonString)
                const imported = parseGroups(data)
                if (mode === 'replace') {
                    this.groups = imported
                    this.dimensionRecords = parseDimensions(data, imported)
                } else {
                    const existingIds = new Set(this.groups.map(g => g.id))
                    for (const g of imported) if (!existingIds.has(g.id)) this.groups.push(g)
                    for (const d of parseDimensions(data, imported)) if (!this.dimensionRecords.some(x => x.name === d.name)) this.dimensionRecords.push({ ...d, order: this.dimensionRecords.length })
                }
                this._persist()
            } catch (e) {
                console.error('Failed to import groups:', e)
                throw new Error('Invalid groups JSON format')
            }
        },

        // ── Internal ──────────────────────────────────────
        _findGroup(id: string): SavedGroup | undefined {
            return this.groups.find(g => g.id === id)
        },

        _persist() {
            // Every dimension a group names exists as a record.
            for (const g of this.groups) if (!this.dimensionRecords.some(d => d.name === g.dimension)) this.dimensionRecords.push({ name: g.dimension, cut: 'free', order: this.dimensionRecords.length, hue: (this.dimensionRecords.length * 5) % GROUP_COLOR_PALETTE.length, description: '', createdAt: Date.now() })
            if (this.projectKey) saveToLocalStorage(this.projectKey, this.groups, this.dimensionRecords)
        },
    },
})

// See the note in stores/draft.ts: without this, an action or getter added
// while the dev server runs is missing from the live store until a reload.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useGroupsStore, import.meta.hot));
