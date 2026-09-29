// How much of the code the import graph actually covers.
//
// Every view that reasons from imports (dependencies, cycles, rules, dead
// code) is only as good as the files the engine parsed.
// A language it does not read, or a file it skipped, leaves no trace in the
// graph; the views then answer confidently about half a codebase. This says
// how much is missing, per extension, so a view can say so too.

/** Extensions that hold code someone would expect to see in a dependency graph. */
export const CODE_EXTENSIONS = new Set([
    "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "vue", "svelte",
    "java", "kt", "kts", "scala", "groovy", "go", "py", "php", "cs", "vb", "fs",
    "rb", "rs", "swift", "c", "cc", "cpp", "cxx", "h", "hpp", "m", "mm", "dart", "ex", "exs", "lua",
])

export function extensionOf(path: string): string {
    const base = path.slice(path.lastIndexOf("/") + 1)
    const dot = base.lastIndexOf(".")
    return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

export interface CoverageRow { extension: string; files: number; analysed: number }

export interface ImportCoverage {
    /** Production code files, and how many of them the graph knows anything about. */
    files: number
    analysed: number
    /** Per extension, largest gap first. */
    byExtension: CoverageRow[]
    /** Share of production code files with import data, 0..1 (1 when there is no code). */
    share: number
}

/**
 * `files`: production code file paths. `analysed`: every file the graph
 * mentions, as an importer, an imported file or a file that declares
 * something. A file the graph mentions in any way was read by a language pack.
 */
export function importCoverage(files: Iterable<string>, analysed: ReadonlySet<string>): ImportCoverage {
    const by = new Map<string, CoverageRow>()
    let total = 0
    let covered = 0
    for (const f of files) {
        const ext = extensionOf(f)
        if (!CODE_EXTENSIONS.has(ext)) continue
        total++
        const row = by.get(ext) ?? { extension: ext, files: 0, analysed: 0 }
        row.files++
        if (analysed.has(f)) { row.analysed++; covered++ }
        by.set(ext, row)
    }
    const byExtension = [...by.values()].sort((a, b) => (b.files - b.analysed) - (a.files - a.analysed) || b.files - a.files || a.extension.localeCompare(b.extension))
    return { files: total, analysed: covered, byExtension, share: total ? covered / total : 1 }
}

/** The gap is worth interrupting for: at least 5% of the code and at least 10 files. */
export function coverageGapMatters(c: ImportCoverage): boolean {
    const missing = c.files - c.analysed
    return missing >= 10 && missing / Math.max(c.files, 1) >= 0.05
}

/** "217 .vue files" or "217 .vue and 12 .svelte files": the extensions behind the gap, largest first. */
export function gapPhrase(c: ImportCoverage, max = 2): string {
    const gaps = c.byExtension.filter(r => r.files > r.analysed).slice(0, max)
    const parts = gaps.map(r => `${(r.files - r.analysed).toLocaleString("en-US")} .${r.extension}`)
    if (!parts.length) return ""
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
    const rest = c.byExtension.filter(r => r.files > r.analysed).length - gaps.length
    return `${joined} file${gaps.reduce((n, r) => n + r.files - r.analysed, 0) === 1 ? "" : "s"}${rest > 0 ? ` (and ${rest} more type${rest === 1 ? "" : "s"})` : ""}`
}

type Query = (sql: string) => Promise<any[]>

/** Reads what `importCoverage` needs. `has` says which tables and columns the snapshot has. */
export async function loadImportCoverage(q: Query, has: (table: string, column?: string) => boolean): Promise<ImportCoverage> {
    const production = has("files", "role") ? "role = 'production'" : "1 = 1"
    const [files, ...mentioned] = await Promise.all([
        q(`SELECT name FROM files WHERE ${production}`),
        has("component_connections_direct") ? q(`SELECT DISTINCT file AS f FROM component_connections_direct`) : Promise.resolve([]),
        has("unit_connections") ? q(`SELECT DISTINCT from_file AS f FROM unit_connections UNION SELECT DISTINCT to_file FROM unit_connections`) : Promise.resolve([]),
        has("units") ? q(`SELECT DISTINCT file AS f FROM units`) : Promise.resolve([]),
    ])
    const analysed = new Set<string>()
    for (const rows of mentioned) for (const r of rows) if (r.f) analysed.add(String(r.f))
    return importCoverage(files.map(r => String(r.name)), analysed)
}
