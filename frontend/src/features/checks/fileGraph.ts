import { CODE_EXTENSIONS, extensionOf } from "~/features/snapshot/coverage"
import { inferEdges, loadChecks, loadUnseenContents, type ChecksData, type FileEdge } from "./checks"

// The file import graph of any snapshot, given a way to query it: what
// useFileGraph builds for the open one, for comparing two (Changes, drift).

type Query = (sql: string) => Promise<any[]>

export interface FileGraph {
    data: ChecksData
    /** Code files, tests included. */
    code: string[]
    /** Production code files. */
    production: Set<string>
    /** Engine imports plus those read from the text of file types it did not parse. */
    edges: FileEdge[]
    /** File types with no import data at all, with their production file counts. */
    blind: string[]
    blindExt: Array<{ ext: string; files: number }>
    /** Share of production code files the engine has import data for. */
    coverageShare: number
    /** The imports read from text, marked `inferred`. */
    inferred: FileEdge[]
}

/** Tables and the files table's columns, for loaders that ask `has(table, column?)`. */
export async function schemaOf(q: Query): Promise<(table: string, column?: string) => boolean> {
    const [tables, cols] = await Promise.all([
        q(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view')`),
        q(`SELECT name FROM pragma_table_info('files')`).catch(() => []),
    ])
    const t = new Set(tables.map(r => String(r.name)))
    const c = new Set(cols.map(r => String(r.name)))
    return (table, column) => (column ? table === "files" && c.has(column) : t.has(table))
}

export async function loadFileGraph(q: Query, isTest: (path: string) => boolean): Promise<FileGraph> {
    const has = await schemaOf(q)
    const data = await loadChecks(q, has, isTest)
    const code = data.files.filter(f => CODE_EXTENSIONS.has(extensionOf(f)))
    const production = new Set(code.filter(f => data.production.has(f)))
    const seen = new Map<string, { files: number; seen: number }>()
    for (const f of production) {
        const e = extensionOf(f), s = seen.get(e) ?? { files: 0, seen: 0 }
        s.files++
        if (data.seen.has(f)) s.seen++
        seen.set(e, s)
    }
    const blindExt = [...seen].filter(([, s]) => s.seen === 0 && s.files >= 3).map(([ext, s]) => ({ ext, files: s.files })).sort((a, b) => b.files - a.files)
    const blind = blindExt.map(b => b.ext)
    let total = 0, covered = 0
    for (const s of seen.values()) { total += s.files; covered += s.seen }
    let inferred: FileEdge[] = []
    if (blind.length && has("file_contents")) {
        const unseen = await loadUnseenContents(q, code.filter(f => blind.includes(extensionOf(f))))
        const declared = new Map<string, string[]>()
        for (const u of data.units) declared.set(u.file, [...(declared.get(u.file) ?? []), u.name])
        inferred = inferEdges(unseen, code, declared)
    }
    const edges = inferred.length ? [...data.edges, ...inferred] : data.edges
    return { data, code, production, edges, blind, blindExt, coverageShare: total ? covered / total : 1, inferred }
}
