// The workspace outside the app, for the MCP server and tests: git blame in
// the checkout, and notes in app.db, the same table the app keeps them in.
// Node only; never imported by the app.

import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { dirname, basename, join } from "node:path"
import type { BlameLine, History, Notes, WorkspaceNote } from "~/features/snapshot/snapshot"

/** git blame at the scanned commit, read from the file's own folder. */
export function nodeHistory(folder: string, commit: string): History {
    const cache = new Map<string, BlameLine[]>()
    return {
        async blame(file, lines) {
            if (!lines.length) return []
            const sorted = [...new Set(lines)].sort((a, b) => a - b)
            const full = join(folder, file)
            const dir = dirname(full)
            let rev = commit || "HEAD"
            let atHead = !commit
            try {
                const top = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
                const root = execFileSync("git", ["-C", folder, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
                if (top !== root) { rev = "HEAD"; atHead = true }
            } catch { throw new Error(`${file} is not in a git repository`) }
            const key = `${rev}\u0000${full}\u0000${sorted.join(",")}`
            const hit = cache.get(key)
            if (hit) return hit
            const args = ["-C", dir, "blame", "--porcelain", "-w", "-M", ...sorted.flatMap(l => ["-L", `${l},${l}`]), rev, "--", basename(full)]
            const out = parsePorcelain(execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 << 20 }), atHead)
            cache.set(key, out)
            return out
        },
    }
}

export function parsePorcelain(text: string, atHead: boolean): BlameLine[] {
    const commits = new Map<string, { author: string; summary: string; time: string }>()
    const out: BlameLine[] = []
    let cur: BlameLine | null = null
    for (const line of text.split("\n")) {
        if (!line) continue
        if (line[0] === "\t") { if (cur) out.push(cur); cur = null; continue }
        const f = line.split(" ")
        if (f.length >= 3 && /^[0-9a-f]{40}$/.test(f[0])) {
            cur = { line: Number(f[2]), commit: f[0], time: "", author: "", summary: "", atHead }
            if (!commits.has(f[0])) commits.set(f[0], { author: "", summary: "", time: "" })
            continue
        }
        if (!cur) continue
        const c = commits.get(cur.commit)!
        if (f[0] === "author") c.author = line.slice(7)
        else if (f[0] === "summary") c.summary = line.slice(8)
        else if (f[0] === "author-time") c.time = new Date(Number(f[1]) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
    }
    for (const b of out) Object.assign(b, commits.get(b.commit))
    return out
}

/** A workspace's notes in app.db, written through the app's own schema. */
export function nodeNotes(appDb: string, workspaceId: string, scanId: string, commit: string): Notes {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")
    const db = new DatabaseSync(appDb)
    // The app creates the table (app.db migration 5); an older app.db has none yet.
    const ready = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get()
    const row = (r: any): WorkspaceNote => ({ id: r.id, subjectKind: r.subject_kind, subject: r.subject, text: r.text, author: r.author === "model" ? "model" : "person", headCommit: r.head_commit, updatedAt: String(r.updated_at) })
    return {
        async list() {
            if (!ready()) return []
            return (db.prepare("SELECT * FROM notes WHERE workspace_id = ? ORDER BY updated_at DESC, id").all(workspaceId) as any[]).map(row)
        },
        async save(note) {
            if (!ready()) throw new Error("This app.db has no notes yet: open the newer Archstats once so it can add them.")
            const now = new Date().toISOString()
            const id = note.id || globalThis.crypto.randomUUID()
            db.prepare(`INSERT INTO notes (id, workspace_id, subject_kind, subject, text, author, scan_id, head_commit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET subject_kind = excluded.subject_kind, subject = excluded.subject, text = excluded.text, updated_at = excluded.updated_at`)
                .run(id, workspaceId, note.subjectKind, note.subject, note.text, note.author, scanId || null, commit, now, now)
            return row(db.prepare("SELECT * FROM notes WHERE id = ?").get(id))
        },
    }
}
