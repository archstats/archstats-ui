// One scan, read-only, as code that computes from it sees it: exhibits, Ask's
// tools, reports. The app builds one from the stores the views fill; tests and
// the MCP server build one straight from the SQLite file. Nothing here knows
// about a view, a store or the chat.

/** One distinct shortest cycle, as the Cycles view counts them. */
export interface CyclePath {
    id: number
    nodes: string[]
    size: number
    sharedCommits: number
    severity: number
}

export interface ConnectionRow {
    from: string
    to: string
    file?: string | null
    reference_count?: number | null
    kind?: string | null
}

export interface Definition { id: string; name: string; short: string; long: string }

export interface Snapshot {
    scanId: string
    /** The `_snapshot` table: commit, revision, extensions, ignore globs… */
    info: Record<string, string>
    workspace: string
    /** Columns per table. */
    columns: Record<string, string[]>
    components(): Array<Record<string, any>>
    /** Runtime import edges between components, one row per importing file. */
    connections(): ConnectionRow[]
    /** Distinct shortest cycles, as the views count them. */
    cycles(): CyclePath[]
    definitions(): Map<string, Definition>
    /** File → component. */
    fileComponent(): Map<string, string>
    /** File → production / test / generated / third-party / non-code. */
    fileRole(file: string): string
    /** Internal, trusted SQL. */
    query<T = any>(sql: string): Promise<T[]>
    /** A person's name as the app shows it: pseudonymised when the workspace asks. */
    author(name: string): string
    /** Author aliases merged in the app (name → canonical name). */
    aliases?(): Record<string, string>
}
