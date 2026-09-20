// File-to-file import resolution, extracted from the old
// `pages/views/files/dependencies.vue` so the Connections view (file grain,
// static source) and anything else that wants "who imports whom" can share
// one query and one aggregation, tested without mounting a component.
//
// The engine records every import statement as a row in `snippets` whose
// `snippet_type` ends in "import"; `file` is the importing file and `content`
// is the name of the thing it imports (a file path, in this codebase's
// convention). Several import statements between the same two files collapse
// into one edge with a reference count.

export const FILE_IMPORT_QUERY = "SELECT file, content FROM snippets WHERE snippet_type LIKE '%import%'"

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

/** Runs the query through the caller's `query` function (normally `store.query`) and aggregates the result. */
export async function queryFileImportEdges(query: (sql: string) => Promise<FileImportRow[]>): Promise<FileImportEdge[]> {
  const rows = await query(FILE_IMPORT_QUERY)
  return aggregateFileImportEdges(rows)
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
