// A restructure plan: the target modules, each a folder and the files that
// go there, checked against this snapshot's file imports as it is drawn.
// Nothing is re-analysed; the imports stay the ones the scan resolved (and,
// for file types the engine did not parse, the ones read from their text).
// Only where each file sits changes.

import { tangles } from "~/features/sandbox/sandbox"
import { globRegExp, type FileEdge } from "~/features/checks/checks"

export interface PlanModule {
    id: string
    name: string
    /** The folder its files move to; empty leaves them where they are. */
    dir: string
    /** One glob per line; a line starting with ! excludes. */
    patterns: string
    /** Files placed by hand, whatever the patterns say. */
    files: string[]
}

export interface Plan {
    modules: PlanModule[]
    /** When on, list order is the allowed direction: a module may use the ones below it. */
    ordered: boolean
}

export const emptyPlan = (): Plan => ({ modules: [], ordered: false })

let seq = 0
export const moduleId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

// ── Placement ─────────────────────────────────────────────────────────────

interface Matcher { include: RegExp[]; exclude: RegExp[] }
function matcher(patterns: string): Matcher {
    const lines = patterns.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
    return {
        include: lines.filter(l => !l.startsWith("!")).map(globRegExp),
        exclude: lines.filter(l => l.startsWith("!")).map(l => globRegExp(l.slice(1).trim())),
    }
}
const matches = (m: Matcher, f: string) => m.include.some(r => r.test(f)) && !m.exclude.some(r => r.test(f))

/** The source a test file tests, by name: x.test.ts → x.ts, test_x.py → x.py, XTest.java → X.java. */
export function subjectOf(test: string, has: (f: string) => boolean): string | null {
    const dir = test.slice(0, test.lastIndexOf("/") + 1), name = test.slice(dir.length)
    const tries: string[] = []
    const m = name.match(/^(.*?)(\.[\w-]+)*\.(test|spec)\.([cm]?[jt]sx?)$/)
    if (m) for (const ext of ["ts", "tsx", "js", "jsx", "vue", m[4]]) tries.push(dir + m[1] + "." + ext)
    const py = name.match(/^test_(.*)\.py$/) ?? name.match(/^(.*)_test\.py$/)
    if (py) tries.push(dir + py[1] + ".py", dir.replace(/tests?\/$/, "") + py[1] + ".py")
    const go = name.match(/^(.*)_test\.go$/)
    if (go) tries.push(dir + go[1] + ".go")
    const java = name.match(/^(.*?)(Tests?|IT)\.(java|kt)$/)
    if (java) tries.push(dir.replace("/test/", "/main/") + java[1] + "." + java[3])
    return tries.find(has) ?? null
}

export interface Placement {
    /** file → module id. */
    of: Map<string, string>
    /** Files more than one module's patterns match; the first module wins. */
    overlaps: Array<{ file: string; modules: string[] }>
    /** Production files no module takes. */
    unplaced: string[]
}

/**
 * Where each file goes: a hand-placed file where it was placed, else the
 * first module whose patterns match, else the module whose folder it sits
 * in. A test none of those takes follows the file it tests.
 */
export function place(plan: Plan, files: string[], tests: ReadonlySet<string>): Placement {
    const of = new Map<string, string>()
    const overlaps: Placement["overlaps"] = []
    const hand = new Map<string, string>()
    for (const m of plan.modules) for (const f of m.files) hand.set(f, m.id)
    const ms = plan.modules.map(m => ({ id: m.id, m: matcher(m.patterns) }))
    for (const f of files) {
        if (hand.has(f)) { of.set(f, hand.get(f)!); continue }
        const hits = ms.filter(x => matches(x.m, f)).map(x => x.id)
        if (hits.length) of.set(f, hits[0])
        if (hits.length > 1) overlaps.push({ file: f, modules: hits })
    }
    // A module's folder claims what already sits in it, so the plan still
    // reads after its moves are carried out.
    const dirs = plan.modules.map(m => ({ id: m.id, dir: m.dir.trim().replace(/\/+$/, "") })).filter(m => m.dir).sort((a, b) => b.dir.length - a.dir.length)
    for (const f of files) {
        if (of.has(f)) continue
        const m = dirs.find(d => f.startsWith(d.dir + "/"))
        if (m) of.set(f, m.id)
    }
    const all = new Set(files)
    for (const f of files) {
        if (!tests.has(f) || of.has(f)) continue
        const s = subjectOf(f, x => all.has(x))
        if (s && of.has(s)) of.set(f, of.get(s)!)
    }
    return { of, overlaps, unplaced: files.filter(f => !tests.has(f) && !of.has(f)) }
}

// ── Checks ────────────────────────────────────────────────────────────────

export interface Evaluation {
    /** "a>b" (module ids) → the file imports behind it. */
    pairs: Map<string, FileEdge[]>
    /** Pairs that import each other, with the imports each way. */
    mutual: Array<{ a: string; b: string; ab: number; ba: number }>
    /** Sets of modules in a cycle, largest first. */
    tangles: string[][]
    /** With an order: imports from a module up into one listed above it. */
    upward: FileEdge[]
    /** Per module: its files, imports that stay inside, and imports that cross its edge (to unplaced files too). */
    modules: Map<string, { files: number; internal: number; external: number; cohesion: number }>
    /** Imports that cross a module boundary. */
    crossing: number
}

/**
 * The plan's structure checks over production imports. `order` lists module
 * ids top to bottom; pass it only when the plan is ordered.
 */
export function evaluate(placement: Map<string, string>, edges: FileEdge[], production: ReadonlySet<string>, order?: string[]): Evaluation {
    const pairs = new Map<string, FileEdge[]>()
    const mods = new Map<string, { files: number; internal: number; external: number; cohesion: number }>()
    const mod = (id: string) => { if (!mods.has(id)) mods.set(id, { files: 0, internal: 0, external: 0, cohesion: 0 }); return mods.get(id)! }
    for (const [f, m] of placement) if (production.has(f)) mod(m).files++
    const rank = new Map((order ?? []).map((id, i) => [id, i]))
    const upward: FileEdge[] = []
    let crossing = 0
    for (const e of edges) {
        if (!production.has(e.from) || !production.has(e.to)) continue
        const a = placement.get(e.from), b = placement.get(e.to)
        // An import to or from a file no module takes still crosses the module's edge.
        if (!a || !b) { if (a) mod(a).external++; if (b) mod(b).external++; continue }
        if (a === b) { mod(a).internal++; continue }
        crossing++
        mod(a).external++; mod(b).external++
        const k = `${a}>${b}`
        if (!pairs.has(k)) pairs.set(k, [])
        pairs.get(k)!.push(e)
        if (order && rank.has(a) && rank.has(b) && rank.get(b)! < rank.get(a)!) upward.push(e)
    }
    for (const m of mods.values()) m.cohesion = m.internal + m.external ? m.internal / (m.internal + m.external) : 1
    const mutual: Evaluation["mutual"] = []
    for (const [k, ab] of pairs) {
        const [a, b] = k.split(">")
        if (a < b && pairs.has(`${b}>${a}`)) mutual.push({ a, b, ab: ab.length, ba: pairs.get(`${b}>${a}`)!.length })
    }
    mutual.sort((x, y) => Math.min(y.ab, y.ba) - Math.min(x.ab, x.ba))
    const counts = new Map([...pairs].map(([k, v]) => [k, v.length]))
    return { pairs, mutual, tangles: tangles(counts), upward, modules: mods, crossing }
}

// ── Placement advice ──────────────────────────────────────────────────────

export interface Pull { module: string; uses: number; usedBy: number }

/** How strongly a file is tied to each module, by imports either way, strongest first. */
export function pulls(file: string, placement: Map<string, string>, out: Map<string, FileEdge[]>, into: Map<string, FileEdge[]>): Pull[] {
    const by = new Map<string, Pull>()
    const get = (m: string) => { if (!by.has(m)) by.set(m, { module: m, uses: 0, usedBy: 0 }); return by.get(m)! }
    for (const e of out.get(file) ?? []) { const m = placement.get(e.to); if (m) get(m).uses++ }
    for (const e of into.get(file) ?? []) { const m = placement.get(e.from); if (m) get(m).usedBy++ }
    return [...by.values()].sort((a, b) => (b.uses + b.usedBy) - (a.uses + a.usedBy) || b.usedBy - a.usedBy)
}

export interface Misfit { file: string; module: string; to: string; here: number; there: number }

/** Placed files with more ties to another module than to their own: the next moves to try. */
export function misfits(placement: Map<string, string>, production: ReadonlySet<string>, out: Map<string, FileEdge[]>, into: Map<string, FileEdge[]>): Misfit[] {
    const res: Misfit[] = []
    for (const [f, m] of placement) {
        if (!production.has(f)) continue
        const p = pulls(f, placement, out, into)
        const here = p.find(x => x.module === m), best = p[0]
        const h = here ? here.uses + here.usedBy : 0
        if (best && best.module !== m && best.uses + best.usedBy >= 2 && best.uses + best.usedBy > h) res.push({ file: f, module: m, to: best.module, here: h, there: best.uses + best.usedBy })
    }
    return res.sort((a, b) => (b.there - b.here) - (a.there - a.here) || a.file.localeCompare(b.file))
}

export function adjacency(edges: FileEdge[]) {
    const out = new Map<string, FileEdge[]>(), into = new Map<string, FileEdge[]>()
    for (const e of edges) {
        if (!out.has(e.from)) out.set(e.from, [])
        out.get(e.from)!.push(e)
        if (!into.has(e.to)) into.set(e.to, [])
        into.get(e.to)!.push(e)
    }
    return { out, into }
}

// ── Moves ─────────────────────────────────────────────────────────────────

const dirOf = (f: string) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "")
function commonDir(files: string[]): string {
    if (!files.length) return ""
    let p = dirOf(files[0]).split("/")
    for (const f of files) {
        const q = dirOf(f).split("/")
        let i = 0
        while (i < p.length && i < q.length && p[i] === q[i]) i++
        p = p.slice(0, i)
    }
    return p.join("/")
}

export interface Move { from: string; to: string; module: string }

/**
 * Where each file of a module with a folder lands. A file already inside
 * the folder stays put; the files arriving land under it, keeping whatever
 * sub-folders they share below their own common folder (one source folder
 * lands flat). Returns the moves and the target paths two files would both take.
 */
export function moves(plan: Plan, placement: Map<string, string>): { moves: Move[]; collisions: Array<{ to: string; from: string[] }> } {
    const byMod = new Map<string, string[]>()
    for (const [f, m] of placement) byMod.set(m, [...(byMod.get(m) ?? []), f])
    const list: Move[] = []
    for (const m of plan.modules) {
        const dir = m.dir.trim().replace(/\/+$/, "")
        if (!dir) continue
        const arriving = (byMod.get(m.id) ?? []).filter(f => !f.startsWith(dir + "/"))
        const root = commonDir(arriving)
        for (const f of arriving) list.push({ from: f, to: `${dir}/${root ? f.slice(root.length + 1) : f}`, module: m.id })
    }
    const at = new Map<string, string[]>()
    for (const mv of list) at.set(mv.to, [...(at.get(mv.to) ?? []), mv.from])
    const moved = new Set(list.map(m => m.from))
    // A file that stays put also blocks its path.
    for (const f of placement.keys()) if (!moved.has(f) && at.has(f)) at.get(f)!.push(f)
    return { moves: list.sort((a, b) => a.from.localeCompare(b.from)), collisions: [...at].filter(([, fs]) => fs.length > 1).map(([to, from]) => ({ to, from })) }
}

/** Import statements that name a moved file, and the files holding them. */
export function importSites(mv: Move[], edges: FileEdge[]): { sites: number; files: number } {
    const moved = new Set(mv.map(m => m.from))
    const files = new Set<string>()
    let sites = 0
    for (const e of edges) if (moved.has(e.to)) { sites++; files.add(e.from) }
    // A moved file's own relative imports change too.
    for (const e of edges) if (moved.has(e.from) && !moved.has(e.to)) files.add(e.from)
    return { sites, files: files.size }
}

// ── Starting points ───────────────────────────────────────────────────────

const title = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase())

/** One module per sub-folder of a folder: today's structure, as a plan to edit. */
export function fromFolders(root: string, files: string[]): PlanModule[] {
    const r = root.replace(/\/+$/, "")
    const subs = new Set<string>()
    for (const f of files) {
        if (!f.startsWith(r + "/")) continue
        const rest = f.slice(r.length + 1)
        if (rest.includes("/")) subs.add(rest.slice(0, rest.indexOf("/")))
    }
    return [...subs].sort().map(s => ({ id: moduleId(), name: title(s), dir: `${r}/${s}`, patterns: `${r}/${s}/**`, files: [] }))
}

/** A module holding exactly these files, as the X-ray or a selection hands them over. */
export function fromFiles(name: string, files: string[], dir = ""): PlanModule {
    return { id: moduleId(), name, dir, patterns: "", files: [...files] }
}
