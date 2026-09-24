// File-to-file import resolution, extracted from the old
// `pages/views/files/dependencies.vue` so the Connections view (file grain,
// static source) and anything else that wants "who imports whom" can share
// one query and one aggregation, tested without mounting a component.
//
// The engine records every import statement as a row in `snippets`, but the
// row's `content` is what the statement names -- a class, a package, a module
// specifier -- and never a file path: 1 row in about 60,000 across four
// snapshots. Built from those rows, "who imports whom" at file grain was a
// file pointing at a component name, and the Files level of Connections drew
// no dependencies at all. The engine resolves references to the file they
// land in; that is what file grain reads now.
export const FILE_IMPORT_QUERY = "SELECT file, content FROM snippets WHERE snippet_type LIKE '%import%'"
export const FILE_DEPENDENCY_QUERY =
  "SELECT from_file AS \"from\", to_file AS \"to\", count(*) AS \"references\" " +
  "FROM unit_connections WHERE from_file IS NOT NULL AND to_file IS NOT NULL AND from_file != to_file " +
  "GROUP BY from_file, to_file"
export interface FileImportRow {
  file: string
  content: string
}

export interface FileImportEdge {
  from: string
  to: string
  references: number
}

/** Collapses raw snippet rows into deduplicated, counted file->file edges. Drops self-imports and blank rows. */
export function aggregateFileImportEdges(rows: FileImportRow[]): FileImportEdge[] {
  const counts = new Map<string, FileImportEdge>()
  for (const row of rows) {
    const from = row.file
    const to = row.content
    if (!from || !to || from === to) continue
    const key = `${from}::${to}`
    const existing = counts.get(key)
    if (existing) {
      existing.references += 1
    } else {
      counts.set(key, { from, to, references: 1 })
    }
  }
  return Array.from(counts.values())
}

/**
 * File-to-file dependencies, resolved by the engine, with the number of
 * unit references behind each. Empty for a snapshot older than the unit
 * graph: there is no honest file-grain answer to give from raw import text.
 */
export async function queryFileImportEdges(
  query: (sql: string) => Promise<any[]>,
  hasView: (view: string) => boolean,
): Promise<FileImportEdge[]> {
  if (!hasView("unit_connections")) return []
  const rows = await query(FILE_DEPENDENCY_QUERY) as Array<{ from: string; to: string; references: number }>
  return rows.filter(r => r.from && r.to && r.from !== r.to)
    .map(r => ({ from: r.from, to: r.to, references: Number(r.references) || 0 }))
}

/** Degree (in + out) of every file that appears in at least one edge; used for top-N filtering and hub labeling. */
export function fileImportDegrees(edges: FileImportEdge[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1)
    degree.set(e.to, (degree.get(e.to) || 0) + 1)
  }
  return degree
}
