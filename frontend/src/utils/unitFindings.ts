// What is worth saying about a codebase at the grain of what it declares.
//
// Coupling between files is Connections' job -- it has file grain, a graph, a
// matrix and a chord, and this view spent a long time rebuilding it badly.
// What only the unit table knows is what is *inside* those files: that
// `data-service` declares 120 separate things, that `BaseClient` has grown 31
// members, that `handleCheckedChange` has been written out in 18 different
// files, that `Output` is the name of 49 unrelated Java classes.
//
// So this is a list of findings, each a specific claim about declarations,
// each carrying the files behind it so the coupling question can be handed to
// the view that owns it.

import type { UnitNode } from "~/composables/useUnitsModel"

export type FindingKind =
    | "repeated"
    | "crowded"
    | "overgrown"
    | "loadBearing"
    | "entangled"
    | "unreachable"

export interface EvidenceRow {
    label: string
    sub: string
    count?: number
    unitId?: string
    file?: string
}

export interface UnitFinding {
    id: string
    kind: FindingKind
    /** The claim, in the product's own words. */
    headline: string
    detail: string
    tone: "neutral" | "warn"
    /** A number for the rail, when one reads better than prose. */
    metric: number
    metricLabel: string
    /** What the claim was read off. */
    rows: EvidenceRow[]
    /** The files involved, for handing the coupling question to Connections. */
    files: string[]
}

export interface FindingSection {
    kind: FindingKind
    title: string
    /** Why this kind of thing is worth looking at. */
    note: string
    findings: UnitFinding[]
}

/**
 * Names a language requires or strongly idiomatises, which repeat because
 * that is how the language works rather than because anyone copied anything.
 *
 * `constructor` appears in 42 LibreChat files and means nothing; the same
 * count for `handleCheckedChange` means eighteen people wrote the same
 * handler. Without this the first finding on screen is always ceremony.
 */
const CEREMONY = new Set([
    "constructor", "tostring", "equals", "hashcode", "clone", "finalize",
    "main", "init", "__init__", "__str__", "__repr__", "__enter__", "__exit__",
    "render", "default", "index", "new", "of", "valueof", "builder", "build",
    "get", "set", "run", "call", "apply", "error", "handle",
])

const TOP = 6
const MIN_REPEATED = 3
const MIN_CROWDED = 12
const MIN_MEMBERS = 12
const MIN_IMPORTERS = 8

export interface FindingsInput {
    units: UnitNode[]
    /** Unit-level references, used for what depends on what. */
    edges: Array<{ from: string; to: string }>
}

export function unitFindings({ units, edges }: FindingsInput): FindingSection[] {
    if (units.length === 0) return []
    const byId = new Map(units.map((u) => [u.id, u]))
    const out: FindingSection[] = []

    const repeated = repeatedNames(units)
    if (repeated.length) {
        out.push({
            kind: "repeated",
            title: "Written more than once",
            note: "The same name declared in unrelated files. Either a shared idea that was never shared, or two things that should not have the same name.",
            findings: repeated,
        })
    }

    const crowded = crowdedFiles(units)
    if (crowded.length) {
        out.push({
            kind: "crowded",
            title: "Files doing too much",
            note: "A file declaring this many separate things is where an extraction starts.",
            findings: crowded,
        })
    }

    const overgrown = overgrownTypes(units)
    if (overgrown.length) {
        out.push({
            kind: "overgrown",
            title: "Types that have grown",
            note: "A type with this many members is usually several types that have not been separated yet.",
            findings: overgrown,
        })
    }

    const hubs = loadBearing(units, edges, byId)
    if (hubs.length) {
        out.push({
            kind: "loadBearing",
            title: "Load-bearing declarations",
            note: "Changing one of these reaches further than anything else here.",
            findings: hubs,
        })
    }

    const knots = entangled(edges, byId)
    if (knots.length) {
        out.push({
            kind: "entangled",
            title: "Declarations that use each other",
            note: "Neither side can be extracted, tested or replaced on its own.",
            findings: knots,
        })
    }

    const dark = unreachable(units, edges)
    if (dark) {
        out.push({
            kind: "unreachable",
            title: "Nothing imports these",
            note: "Methods and private helpers are called rather than imported, so an import graph cannot reach them. Said plainly rather than left as a gap.",
            findings: [dark],
        })
    }

    return out
}

/** The same declared name appearing in several files. */
function repeatedNames(units: UnitNode[]): UnitFinding[] {
    const byName = new Map<string, UnitNode[]>()
    for (const u of units) {
        if (!u.name || CEREMONY.has(u.name.toLowerCase())) continue
        const list = byName.get(u.name)
        if (list) list.push(u)
        else byName.set(u.name, [u])
    }

    return [...byName.entries()]
        .map(([name, list]) => ({ name, files: [...new Set(list.map((u) => u.file).filter(Boolean))], list }))
        .filter((x) => x.files.length >= MIN_REPEATED)
        .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name))
        .slice(0, TOP)
        .map(({ name, files, list }) => ({
            id: `repeated:${name}`,
            kind: "repeated" as const,
            headline: `${name} is declared in ${files.length} different files.`,
            detail: `Nothing here says they are the same thing, and nothing keeps them in step if one changes.`,
            tone: "warn" as const,
            metric: files.length,
            metricLabel: "files",
            rows: list.slice(0, 60).map((u) => ({
                label: u.name, sub: u.file, unitId: u.id, file: u.file,
            })),
            files,
        }))
}

/** Files declaring an unusual number of separate things. */
function crowdedFiles(units: UnitNode[]): UnitFinding[] {
    const byFile = new Map<string, UnitNode[]>()
    for (const u of units) {
        if (!u.file) continue
        const list = byFile.get(u.file)
        if (list) list.push(u)
        else byFile.set(u.file, [u])
    }

    return [...byFile.entries()]
        .filter(([, list]) => list.length >= MIN_CROWDED)
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .slice(0, TOP)
        .map(([file, list]) => ({
            id: `crowded:${file}`,
            kind: "crowded" as const,
            headline: `${baseName(file)} declares ${list.length} separate things.`,
            detail: "Everything importing any one of them depends on the whole file.",
            tone: "warn" as const,
            metric: list.length,
            metricLabel: "declared",
            rows: list.slice(0, 200).map((u) => ({
                label: u.name, sub: u.kind, unitId: u.id, file: u.file,
            })),
            files: [file],
        }))
}

/** Types that have accumulated members. */
function overgrownTypes(units: UnitNode[]): UnitFinding[] {
    const byOwner = new Map<string, UnitNode[]>()
    for (const u of units) {
        if (!u.owner) continue
        const list = byOwner.get(u.owner)
        if (list) list.push(u)
        else byOwner.set(u.owner, [u])
    }

    return [...byOwner.entries()]
        .filter(([, list]) => list.length >= MIN_MEMBERS)
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .slice(0, TOP)
        .map(([owner, list]) => ({
            id: `overgrown:${owner}`,
            kind: "overgrown" as const,
            headline: `${shortName(owner)} has ${list.length} members.`,
            detail: "Usually several responsibilities that have not been separated yet.",
            tone: "warn" as const,
            metric: list.length,
            metricLabel: "members",
            rows: list.slice(0, 200).map((u) => ({
                label: u.name, sub: u.kind, unitId: u.id, file: u.file,
            })),
            files: [...new Set(list.map((u) => u.file).filter(Boolean))],
        }))
}

/** Declarations the rest of the codebase leans on. */
function loadBearing(
    units: UnitNode[],
    edges: Array<{ from: string; to: string }>,
    byId: Map<string, UnitNode>,
): UnitFinding[] {
    const importers = new Map<string, Set<string>>()
    for (const e of edges) {
        const set = importers.get(e.to)
        if (set) set.add(e.from)
        else importers.set(e.to, new Set([e.from]))
    }

    return [...importers.entries()]
        .filter(([, set]) => set.size >= MIN_IMPORTERS)
        .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
        .slice(0, TOP)
        .map(([id, set]) => {
            const unit = byId.get(id)
            const users = [...set].map((x) => byId.get(x)).filter(Boolean) as UnitNode[]
            return {
                id: `hub:${id}`,
                kind: "loadBearing" as const,
                headline: `${unit?.name ?? shortName(id)} is used by ${set.size} other declarations.`,
                detail: `Declared in ${unit?.file ?? "an unknown file"}. Changing it reaches all of them.`,
                tone: "neutral" as const,
                metric: set.size,
                metricLabel: "users",
                rows: users.slice(0, 200).map((u) => ({
                    label: u.name, sub: u.file, unitId: u.id, file: u.file,
                })),
                files: [...new Set([unit?.file, ...users.map((u) => u.file)].filter(Boolean) as string[])],
            }
        })
}

/** Pairs of declarations that use each other. */
function entangled(
    edges: Array<{ from: string; to: string }>,
    byId: Map<string, UnitNode>,
): UnitFinding[] {
    const directed = new Set(edges.map((e) => e.from + "\n" + e.to))
    const seen = new Set<string>()
    const pairs: Array<[string, string]> = []
    for (const e of edges) {
        if (!directed.has(e.to + "\n" + e.from)) continue
        const key = [e.from, e.to].sort().join("\n")
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push([e.from, e.to])
    }

    return pairs.slice(0, TOP).map(([a, b]) => {
        const ua = byId.get(a)
        const ub = byId.get(b)
        return {
            id: `knot:${a}:${b}`,
            kind: "entangled" as const,
            headline: `${ua?.name ?? shortName(a)} and ${ub?.name ?? shortName(b)} use each other.`,
            detail: "Neither can be extracted, tested or replaced on its own.",
            tone: "warn" as const,
            metric: 2,
            metricLabel: "declarations",
            rows: [ua, ub].filter(Boolean).map((u) => ({
                label: u!.name, sub: u!.file, unitId: u!.id, file: u!.file,
            })),
            files: [...new Set([ua?.file, ub?.file].filter(Boolean) as string[])],
        }
    })
}

/** The honest caveat: what an import graph structurally cannot see. */
function unreachable(units: UnitNode[], edges: Array<{ from: string; to: string }>): UnitFinding | null {
    const touched = new Set<string>()
    for (const e of edges) { touched.add(e.from); touched.add(e.to) }
    const dark = units.filter((u) => !touched.has(u.id))
    if (dark.length === 0) return null

    const share = Math.round((dark.length / units.length) * 100)
    const methods = dark.filter((u) => u.owner).length
    return {
        id: "unreachable",
        kind: "unreachable",
        headline: `${dark.length.toLocaleString()} declarations are never imported.`,
        detail: methods > 0
            ? `${share}% of everything declared. ${methods.toLocaleString()} are members of a type, which are called rather than imported.`
            : `${share}% of everything declared. Entry points, tests and private helpers belong here; anything else is a candidate for deletion.`,
        tone: "neutral",
        metric: dark.length,
        metricLabel: "declarations",
        rows: dark.slice(0, 500).map((u) => ({
            label: u.name, sub: u.file, unitId: u.id, file: u.file,
        })),
        files: [...new Set(dark.map((u) => u.file).filter(Boolean))],
    }
}

function baseName(path: string): string {
    const base = path.split("/").pop() ?? path
    const dot = base.lastIndexOf(".")
    return dot > 0 ? base.slice(0, dot) : base
}

function shortName(id: string): string {
    const tail = id.split("#").pop() ?? id
    return tail.split(".").pop() || tail
}
