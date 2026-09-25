// Structure checks: three questions a restructure asks before it moves
// anything, answered from the file-level import graph.
//
// 1. Layer inversions. Folders and class names announce a layer (pages,
//    components, stores, utils; controller, service, repository, domain).
//    An import from a lower layer into a higher one is where "utilities" turn
//    out to be feature code.
// 2. Reachability. Starting from what a framework calls (pages, main, Spring
//    beans, Django apps), which files are never reached, and which only from
//    tests.
// 3. Duplicates. The same exported name declared in several files, and
//    same-named files in several folders: where a rule is written twice.
//
// Every answer is only as complete as the graph; the view says so.

export interface FileEdge { from: string; to: string; names: string[]; inferred?: boolean }

// ── 1. Layers ─────────────────────────────────────────────────────────────

export interface Layer { id: string; label: string; rank: number; folders: RegExp; suffix?: RegExp }

/** Higher rank may use lower; the reverse is an inversion. Conventions shared by most stacks. */
export const LAYERS: Layer[] = [
    { id: "entry", label: "Entry points (pages, views, controllers)", rank: 70, folders: /^(pages|views|screens|routes|layouts|controllers?|endpoints|handlers|web|rest|cli|cmd)$/i, suffix: /(Controller|Resource|Endpoint|Handler|Page|View|Screen)$/ },
    { id: "components", label: "UI components", rank: 60, folders: /^(components|widgets|ui|templates|partials)$/i, suffix: /(Component|Widget)$/ },
    { id: "composables", label: "Composables and hooks", rank: 50, folders: /^(composables|hooks|containers)$/i },
    { id: "application", label: "State and services", rank: 40, folders: /^(stores?|state|slices|reducers|services?|application|usecases|use_cases|facades?|workflows?)$/i, suffix: /(Service|ServiceImpl|Store|UseCase|Facade|Workflow)$/ },
    { id: "infrastructure", label: "Persistence and infrastructure", rank: 30, folders: /^(repositor(y|ies)|daos?|persistence|infrastructure|adapters?|clients?|gateways?|db|database)$/i, suffix: /(Repository|RepositoryImpl|Dao|DaoImpl|Client|Gateway|Adapter)$/ },
    { id: "domain", label: "Domain and model", rank: 20, folders: /^(domain|models?|entit(y|ies)|dto|dtos|types)$/i, suffix: /(Entity|Dto|DTO|Model)$/ },
    { id: "utilities", label: "Utilities", rank: 10, folders: /^(utils?|helpers?|lib|libs|common|shared|support|tools)$/i, suffix: /(Utils?|Helpers?|Support)$/ },
]

/** The layer a file announces: its class-name suffix first, then the deepest folder that names one. */
export function layerOf(path: string, layers: Layer[] = LAYERS): Layer | null {
    const parts = path.split("/")
    const base = parts[parts.length - 1].replace(/\.[^.]+$/, "")
    // Class-name suffixes only for class-like names: useConnectionsModel is a composable, not a model.
    if (/^[A-Z]/.test(base)) for (const l of layers) if (l.suffix?.test(base)) return l
    for (let i = parts.length - 2; i >= 0; i--) {
        for (const l of layers) if (l.folders.test(parts[i])) return l
    }
    return null
}

export interface Inversion { from: Layer; to: Layer; edges: FileEdge[] }

/** Imports from a lower layer into a higher one, grouped by layer pair, most imports first. */
export function inversions(edges: FileEdge[], production: ReadonlySet<string>, layers: Layer[] = LAYERS): Inversion[] {
    const by = new Map<string, Inversion>()
    const cache = new Map<string, Layer | null>()
    const of = (f: string) => { if (!cache.has(f)) cache.set(f, layerOf(f, layers)); return cache.get(f)! }
    for (const e of edges) {
        if (!production.has(e.from) || !production.has(e.to)) continue
        const a = of(e.from), b = of(e.to)
        if (!a || !b || b.rank <= a.rank) continue
        const k = `${a.id}>${b.id}`
        if (!by.has(k)) by.set(k, { from: a, to: b, edges: [] })
        by.get(k)!.edges.push(e)
    }
    return [...by.values()].sort((x, y) => y.edges.length - x.edges.length || (y.to.rank - y.from.rank) - (x.to.rank - x.from.rank))
}

// ── 2. Reachability ───────────────────────────────────────────────────────

export interface RootRule { id: string; label: string; test: (path: string, markers: ReadonlySet<string>) => boolean }

const SPRING = new Set(["Component", "Service", "Controller", "RestController", "Configuration", "Repository", "SpringBootApplication", "Aspect", "ControllerAdvice", "RestControllerAdvice", "WebServlet", "WebFilter", "Endpoint", "Entity", "Embeddable", "MappedSuperclass", "Converter", "EventListener", "Scheduled", "Mapper"])
const seg = (p: string, re: RegExp) => p.split("/").slice(0, -1).some(s => re.test(s))
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1)

/** What frameworks call without an import. A file matching any rule is an entry point. */
export const ROOT_RULES: RootRule[] = [
    { id: "nuxt", label: "Nuxt and Next routing: pages/, layouts/, plugins/, middleware/, server/, app.vue", test: p => seg(p, /^(pages|layouts|plugins|middleware|server)$/) || /^(app|error)\.vue$/.test(base(p)) || /^(page|layout|route|loading|error|not-found)\.(t|j)sx?$/.test(base(p)) && seg(p, /^app$/) },
    { id: "main", label: "Program entry: main.*, index.* at a source root, cmd/, bin/, scripts/, benchmarks", test: p => /^(main|index|app|server|cli)\.(ts|tsx|js|jsx|mjs|cjs|go|py|rs)$/.test(base(p)) && (p.split("/").length <= 3 || /\/(src|cmd|bin)\/[^/]+$/.test(p)) || seg(p, /^(cmd|bin|scripts|bench|benchmarks)$/) || /\.bench\.[cm]?[jt]s$/.test(base(p)) },
    { id: "generated", label: "Generated code and declarations (wailsjs/, generated/, *.d.ts, *_pb2.py)", test: p => /(^|\/)(wailsjs|generated|__generated__)\//.test(p) || /\.d\.ts$|\.(gen|generated|pb)\.[a-z]+$|_pb2(_grpc)?\.py$/.test(p) },
    { id: "workers", label: "Workers and service workers (*.worker.*, sw.*)", test: p => /\.worker\.[cm]?[jt]s$|^(sw|service-worker)\.[jt]s$/.test(base(p)) },
    { id: "config", label: "Build and tool configuration (*.config.*, gradle, vite, nuxt)", test: p => /\.config\.(ts|js|mjs|cjs)$/.test(base(p)) || /^(vite|nuxt|webpack|rollup|tailwind|vitest|jest|babel|eslint)\./.test(base(p)) },
    { id: "spring", label: "Spring and JPA managed classes (@Component, @Service, @Controller, @Entity …)", test: (_p, m) => [...m].some(x => SPRING.has(x)) },
    { id: "django", label: "Django conventions: urls, apps, admin, settings, migrations, management commands, templatetags, signals", test: p => /^(urls|apps|admin|settings[\w-]*|wsgi|asgi|manage|conftest|signals|tasks|receivers)\.py$/.test(base(p)) || seg(p, /^(migrations|management|templatetags)$/) },
    { id: "dotnet", label: ".NET hosts: Program.cs, Startup.cs, controllers", test: p => /^(Program|Startup)\.cs$/.test(base(p)) || /Controller\.cs$/.test(base(p)) },
    { id: "php", label: "PHP front controllers and config: public/index.php, bin/console, config/, Kernel", test: p => /public\/index\.php$/.test(p) || /bin\/console$/.test(p) || seg(p, /^config$/) || /Kernel\.php$/.test(base(p)) },
    { id: "go-main", label: "Go main packages (every file next to a main.go)", test: () => false },
]

export interface Reachability {
    roots: Set<string>
    /** Per rule, how many files it made an entry point. */
    byRule: Array<{ rule: RootRule; files: number }>
    reached: Set<string>
    /** Production code files no entry point reaches. */
    unreachable: string[]
    /** Reached from tests only. */
    testOnly: string[]
}

export interface ReachOptions {
    /** Globs-turned-regexes a person adds. */
    extraRoots?: RegExp[]
    rules?: RootRule[]
}

/**
 * Walks the import graph from every entry point. `tests` are walked
 * separately, so a file only tests reach is told apart from a dead one.
 */
export function reachability(
    files: string[],
    tests: ReadonlySet<string>,
    edges: FileEdge[],
    markers: ReadonlyMap<string, ReadonlySet<string>>,
    { extraRoots = [], rules = ROOT_RULES }: ReachOptions = {},
): Reachability {
    const adj = new Map<string, string[]>()
    const link = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push(b) }
    for (const e of edges) link(e.from, e.to)
    // Go: files of one package use each other without an import.
    const goPkgs = new Map<string, string[]>()
    for (const f of files) if (f.endsWith(".go") && !tests.has(f)) { const d = f.slice(0, f.lastIndexOf("/")); goPkgs.set(d, [...(goPkgs.get(d) ?? []), f]) }
    for (const fs of goPkgs.values()) for (let i = 1; i < fs.length; i++) { link(fs[i - 1], fs[i]); link(fs[i], fs[i - 1]) }
    const empty = new Set<string>()
    const roots = new Set<string>()
    const count = new Map<string, number>()
    // Go: a main package is every file in a folder that holds main.go.
    const goMainDirs = new Set(files.filter(f => base(f) === "main.go").map(f => f.slice(0, f.lastIndexOf("/"))))
    for (const f of files) {
        if (tests.has(f)) continue
        for (const r of rules) {
            const hit = r.id === "go-main" ? f.endsWith(".go") && goMainDirs.has(f.slice(0, f.lastIndexOf("/"))) : r.test(f, markers.get(f) ?? empty)
            if (hit) { roots.add(f); count.set(r.id, (count.get(r.id) ?? 0) + 1); break }
        }
        if (!roots.has(f) && extraRoots.some(re => re.test(f))) { roots.add(f); count.set("extra", (count.get("extra") ?? 0) + 1) }
    }
    const walk = (start: Iterable<string>) => {
        const seen = new Set<string>()
        const stack = [...start]
        while (stack.length) {
            const f = stack.pop()!
            if (seen.has(f)) continue
            seen.add(f)
            for (const t of adj.get(f) ?? []) if (!seen.has(t)) stack.push(t)
        }
        return seen
    }
    const reached = walk(roots)
    const fromTests = walk(tests)
    const production = files.filter(f => !tests.has(f))
    return {
        roots,
        byRule: rules.map(rule => ({ rule, files: count.get(rule.id) ?? 0 })).filter(r => r.files > 0),
        reached,
        unreachable: production.filter(f => !reached.has(f) && !fromTests.has(f)).sort(),
        testOnly: production.filter(f => !reached.has(f) && fromTests.has(f)).sort(),
    }
}

/**
 * Imports read from the text of files the engine did not parse: import
 * paths, component tags (with Nuxt's folder-prefixed names), and names a
 * framework auto-imports. Rough, and marked as inferred wherever shown, but
 * a .vue page the engine skipped still says what it uses.
 */
export function inferEdges(
    unseen: Array<{ file: string; content: string }>,
    files: string[],
    declared: ReadonlyMap<string, string[]>,
): FileEdge[] {
    const byStem = new Map<string, string[]>()
    const byTag = new Map<string, string>()
    for (const f of files) {
        const stem = base(f).replace(/\..*$/, "")
        byStem.set(stem, [...(byStem.get(stem) ?? []), f])
        if (f.endsWith(".vue") || /\.[jt]sx$/.test(f)) {
            byTag.set(stem, f)
            // Nuxt registers components/report/Cell.vue as <ReportCell>.
            const i = f.lastIndexOf("/components/")
            if (i >= 0) {
                const parts = f.slice(i + 12).replace(/\.[^.]+$/, "").split("/").map(pascal)
                const name = parts.reduce((acc, p) => (acc.endsWith(p) ? acc : acc + (p.startsWith(acc) && acc ? p.slice(acc.length) : p)), "")
                if (!byTag.has(name)) byTag.set(name, f)
            }
        }
    }
    // A distinctive name declared once is what an auto-import resolves to.
    const owner = new Map<string, string | null>()
    for (const [f, names] of declared) for (const n of names) if (distinctive(n)) owner.set(n, owner.has(n) && owner.get(n) !== f ? null : f)
    const resolve = (spec: string): string | undefined => {
        const clean = spec.replace(/^([~@]{1,2}\/|\.{1,2}\/)+/, "").replace(/\.[a-z]+$/, "")
        const cands = byStem.get(clean.slice(clean.lastIndexOf("/") + 1)) ?? []
        return cands.find(c => c.replace(/\.[^.]+$/, "").endsWith(clean)) ?? (cands.length === 1 ? cands[0] : undefined)
    }
    const out: FileEdge[] = []
    for (const u of unseen) {
        const to = new Map<string, Set<string>>()
        const add = (t: string | undefined, name: string) => { if (t && t !== u.file) { if (!to.has(t)) to.set(t, new Set()); to.get(t)!.add(name) } }
        for (const m of u.content.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'`]([^"'`]+)["'`]/g)) if (!/^[a-z@][\w.-]*(\/|$)/.test(m[1]) || m[1].startsWith("@/")) add(resolve(m[1]), m[1])
        for (const m of u.content.matchAll(/<([A-Z][A-Za-z0-9]+|[a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g)) { const tag = m[1].includes("-") ? pascal(m[1]) : m[1]; add(byTag.get(tag) ?? byTag.get(tag.replace(/^Lazy/, "")), `<${tag}>`) }
        for (const t of new Set(u.content.match(/[A-Za-z_$][\w$]{5,}/g) ?? [])) { const f = owner.get(t); if (f) add(f, t) }
        for (const [t, names] of to) out.push({ from: u.file, to: t, names: [...names], inferred: true })
    }
    return out
}

const pascal = (s: string) => s.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("")
// Declared names count only when distinctive: camelCase or PascalCase, not a plain word.
const distinctive = (n: string) => n.length >= 6 && /[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/.test(n) && !COMMON_NAMES.has(n)

/** Contents of the files the graph cannot read, for {@link inferEdges}. */
export async function loadUnseenContents(q: Query, files: string[]): Promise<Array<{ file: string; content: string }>> {
    const out: Array<{ file: string; content: string }> = []
    for (let i = 0; i < files.length; i += 200) {
        const list = files.slice(i, i + 200).map(f => `'${f.replace(/'/g, "''")}'`).join(",")
        const rows = await q(`SELECT file, content FROM file_contents WHERE file IN (${list})`)
        for (const r of rows) out.push({ file: String(r.file), content: String(r.content ?? "") })
    }
    return out
}

/** A glob a person types (`src/legacy/**`, `**\/*.stories.ts`) as a path regex. */
export function globRegExp(glob: string): RegExp {
    let re = ""
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++ }
        else if (c === "*") re += "[^/]*"
        else if (c === "?") re += "[^/]"
        else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }
    return new RegExp(`^${re}$`)
}

// ── 3. Duplicates ─────────────────────────────────────────────────────────

const COMMON_NAMES = new Set(["main", "init", "__init__", "index", "default", "setup", "render", "test", "get", "set", "run", "handle", "execute", "apply", "build", "create", "update", "delete", "load", "save", "toString", "equals", "hashCode", "constructor", "Meta", "Config", "Props", "State", "Options", "props", "emit", "Migration", "Command", "Test", "Tests"])

export interface Duplicate { name: string; files: string[] }
export interface DeclaredUnit { name: string; file: string; kind: string; shared: boolean }

/** Exported names declared in more than one production file, widest first. */
export function duplicateNames(units: DeclaredUnit[], production: ReadonlySet<string>): Duplicate[] {
    const by = new Map<string, Set<string>>()
    for (const u of units) {
        // A local helper nobody imports is not a second copy of anything; a type, or a name another file uses, is.
        if (!production.has(u.file) || COMMON_NAMES.has(u.name) || u.name.length < 3 || !(u.kind === "type" || u.shared)) continue
        if (!by.has(u.name)) by.set(u.name, new Set())
        by.get(u.name)!.add(u.file)
    }
    return [...by].filter(([, fs]) => fs.size > 1).map(([name, fs]) => ({ name, files: [...fs].sort() }))
        .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name))
}

const COMMON_FILES = /^(index|__init__|main|mod|types|constants|README|package|setup|conftest|urls|apps|admin|models|views|forms|tests?|utils|helpers|app|config)$/i

/** File names used in more than one folder (ignoring index, __init__ and the like). */
export function sameNamedFiles(files: string[]): Duplicate[] {
    const by = new Map<string, string[]>()
    for (const f of files) {
        const b = base(f).replace(/\.[^.]+$/, "")
        if (COMMON_FILES.test(b)) continue
        by.set(b, [...(by.get(b) ?? []), f])
    }
    return [...by].filter(([, fs]) => fs.length > 1).map(([name, fs]) => ({ name, files: fs.sort() }))
        .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name))
}

// ── Loading ───────────────────────────────────────────────────────────────

type Query = (sql: string) => Promise<any[]>

export interface ChecksData {
    files: string[]
    tests: Set<string>
    production: Set<string>
    lines: Map<string, number>
    edges: FileEdge[]
    markers: Map<string, Set<string>>
    units: DeclaredUnit[]
    /** Files the import graph mentions at all. */
    seen: Set<string>
}

export async function loadChecks(q: Query, has: (table: string, column?: string) => boolean, isTest: (path: string) => boolean): Promise<ChecksData> {
    const roleCol = has("files", "role") ? "role" : "NULL AS role"
    const [rows, conns, markers, units] = await Promise.all([
        q(`SELECT name, ${roleCol}, coalesce(complexity__lines, 0) AS lines FROM files`),
        has("unit_connections") ? q(`SELECT uc.from_file AS a, uc.to_file AS b, group_concat(DISTINCT u.name) AS names FROM unit_connections uc LEFT JOIN units u ON u.id = uc."to" WHERE uc.from_file <> uc.to_file GROUP BY 1, 2`) : Promise.resolve([]),
        has("unit_markers") && has("units") ? q(`SELECT DISTINCT u.file AS file, m.key AS key FROM unit_markers m JOIN units u ON u.id = m.unit WHERE m.source = 'annotation'`) : Promise.resolve([]),
        has("units") ? q(`SELECT u.name, u.file, u.kind, max(CASE WHEN uc.from_file IS NOT NULL AND uc.from_file <> u.file THEN 1 ELSE 0 END) AS shared FROM units u LEFT JOIN unit_connections uc ON uc."to" = u.id WHERE (u.owner IS NULL OR u.owner = '') AND u.kind IN ('type', 'function') GROUP BY u.id`) : Promise.resolve([]),
    ])
    const files: string[] = [], tests = new Set<string>(), production = new Set<string>(), lines = new Map<string, number>()
    for (const r of rows) {
        const f = String(r.name)
        const role = r.role ? String(r.role) : (isTest(f) ? "test" : "production")
        if (role === "test") { tests.add(f); files.push(f) }
        else if (role === "production") { production.add(f); files.push(f) }
        lines.set(f, Number(r.lines) || 0)
    }
    const seen = new Set<string>()
    for (const c of conns) { seen.add(String(c.a)); seen.add(String(c.b)) }
    for (const u of units) seen.add(String(u.file))
    const m = new Map<string, Set<string>>()
    for (const r of markers) { const f = String(r.file); if (!m.has(f)) m.set(f, new Set()); m.get(f)!.add(String(r.key)) }
    return {
        files, tests, production, lines,
        edges: conns.map(c => ({ from: String(c.a), to: String(c.b), names: c.names ? String(c.names).split(",") : [] })),
        markers: m,
        units: units.map(u => ({ name: String(u.name), file: String(u.file), kind: String(u.kind), shared: Number(u.shared) > 0 })),
        seen,
    }
}
