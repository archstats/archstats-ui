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

/** The commit that last wrote a line, as of the commit the scan read. */
export interface BlameLine {
    line: number
    commit: string
    /** RFC 3339. */
    time: string
    author: string
    summary: string
    /** Read at the repository's HEAD, not the scanned commit (a workspace of several repositories). */
    atHead: boolean
}

/** What git can say about the scanned code, asked a few lines at a time. */
export interface History {
    blame(file: string, lines: number[]): Promise<BlameLine[]>
}

/** Something a person or Ask learned about part of the codebase, kept across sessions. */
export interface WorkspaceNote {
    id: string
    subjectKind: "codebase" | "component" | "file" | "unit" | "entry" | "table"
    subject: string
    text: string
    author: "person" | "model"
    headCommit: string
    updatedAt: string
}

/** The workspace's notes: read by every exhibit that names a subject, written by Ask and the person. */
export interface Notes {
    list(): Promise<WorkspaceNote[]>
    save(note: Omit<WorkspaceNote, "id" | "updatedAt" | "headCommit"> & { id?: string }): Promise<WorkspaceNote>
}

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
    /** Git, on demand: absent where the workspace's checkout cannot be reached. */
    history?: History
    /** The workspace's notes: absent outside a workspace (a snapshot file read on its own). */
    notes?: Notes
}
