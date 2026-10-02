// Archstats Ask as an MCP server (stdio): the same tools the Ask view uses,
// over the newest complete scan of a workspace (or any snapshot file), for
// Claude Code, Claude Desktop or any other MCP client. Read-only.
//
//   claude mcp add archstats -- npx --prefix /path/to/archstats-ui/frontend vite-node \
//     --config /path/to/archstats-ui/frontend/vitest.config.ts \
//     /path/to/archstats-ui/frontend/scripts/ask-mcp.ts -- --workspace BroadleafCommerce
//
// Options: --workspace <name|id> (newest complete scan) or --db <snapshot.db>
// (with --repo <checkout> to let it date imports with git blame). Over a
// workspace it can also blame (at the scanned commit) and keep notes in the
// app's own store; everything else is read-only.

import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { sqliteWorld } from "../src/features/ask/testing/sqliteWorld"
import { nodeHistory, nodeNotes } from "../src/features/ask/testing/nodeWorkspace"
import { INTENTS, TOOLS, useIntents } from "../src/features/ask/tools"
import { buildCard } from "../src/features/ask/knowledge/card"
import { PLAYBOOKS } from "../src/features/ask/knowledge/playbooks"
import { TRAPS } from "../src/features/ask/engine/prompt"
import type { ToolContext } from "../src/features/ask/engine/types"

const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const log = (...a: unknown[]) => process.stderr.write(`[archstats-mcp] ${a.join(" ")}\n`)

function appDataDir(): string {
    if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "archstats")
    if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "archstats")
    return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "archstats")
}

interface Resolved { path: string; label: string; folder?: string; workspaceId?: string; scanId?: string; commit?: string; workspace?: string }

function resolveSnapshot(): Resolved {
    const db = opt("db")
    if (db) return { path: db, label: db.split("/").pop()!, folder: opt("repo") }
    const ws = opt("workspace")
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")
    const app = new DatabaseSync(join(appDataDir(), "app.db"), { readOnly: true })
    const rows = app.prepare(`SELECT w.id AS workspace_id, w.name AS workspace, w.folder_path AS folder, s.id AS scan_id, s.snapshot_path AS path, s.head_commit AS commit_, s.started_at AS at FROM scans s JOIN workspaces w ON w.id = s.workspace_id WHERE s.status = 'complete' ${ws ? "AND (w.name = ? OR w.id = ?)" : ""} ORDER BY s.started_at DESC LIMIT 1`).all(...(ws ? [ws, ws] : [])) as any[]
    if (!rows.length) throw new Error(ws ? `No complete scan for workspace "${ws}".` : "No complete scan in the app.")
    const r = rows[0]
    return { path: r.path, label: `${r.workspace} @ ${String(r.commit_ || "").slice(0, 7) || r.at}`, folder: r.folder, workspaceId: r.workspace_id, scanId: r.scan_id, commit: String(r.commit_ ?? ""), workspace: r.workspace }
}

const snap = resolveSnapshot()
if (!existsSync(snap.path)) throw new Error(`Snapshot not found: ${snap.path}`)
const world = sqliteWorld(snap.path, {
    workspace: snap.workspace,
    history: snap.folder && existsSync(snap.folder) ? nodeHistory(snap.folder, snap.commit ?? "") : undefined,
    notes: snap.workspaceId ? nodeNotes(join(appDataDir(), "app.db"), snap.workspaceId, snap.scanId ?? "", snap.commit ?? "") : undefined,
})
let seq = 0
const texts = new Map<string, string>()
const ctx: ToolContext = {
    world,
    ranOn: { scanId: snap.path, commit: world.info.git_head_commit ?? "", revision: Number(world.info.analysis_revision ?? 0), workspace: world.workspace },
    nextId: () => `E${++seq}`,
    recall: id => texts.get(id) ?? null,
}
// The intents (ASK_TOOLS=legacy for the old set); the view-only tools need the app.
const tools = (useIntents() ? INTENTS : TOOLS).filter(t => !["on_screen", "look_at_view", "show", "ask_user", "load_tools"].includes(t.name))
log(`serving ${tools.length} tools over ${snap.label}`)

const INSTRUCTIONS = `Archstats measures the architecture of a codebase from a scan. These tools read one snapshot (${snap.label}). Each asks the codebase one kind of question and answers with facts, one per line, each with an id like [E3.4]; cite the ids.

To find your way around: "about" for an overview; "rank" among units for the classes and functions the rest of the code leans on most (a map to read first); "flows" for the entry points, and with from, what one route or handler runs on down to its data; "data" for what is stored and which components share it; "contracts" for what a component exposes or what implements an interface; "rules" with kind kept for the conventions the code follows and their exceptions; "surprises" for what stands out; "why" for the documents and notes about a component, and with on, when and in which commit a dependency (or a cycle) appeared. Then: structure, dependencies, change, people, libraries, deployables, code, search, explain. "note" keeps a note for later sessions; use it only when asked to remember something. Traps:\n${TRAPS.map(t => `- ${t}`).join("\n")}`

type Msg = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: any }
const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`)
const reply = (id: Msg["id"], result: object) => send({ jsonrpc: "2.0", id, result })
const fail = (id: Msg["id"], code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } })

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]

async function handle(m: Msg) {
    switch (m.method) {
        case "initialize":
            return reply(m.id, {
                protocolVersion: SUPPORTED.includes(m.params?.protocolVersion) ? m.params.protocolVersion : "2025-06-18",
                capabilities: { tools: {}, prompts: {}, resources: {} },
                serverInfo: { name: "archstats", title: "Archstats", version: "0.1.0" },
                instructions: INSTRUCTIONS,
            })
        case "ping":
            return reply(m.id, {})
        case "tools/list":
            return reply(m.id, {
                tools: tools.map(t => ({
                    name: t.name, description: t.description,
                    inputSchema: { type: "object", properties: t.params, required: t.required ?? [] },
                    annotations: { readOnlyHint: true, openWorldHint: false },
                })),
            })
        case "tools/call": {
            const t = tools.find(x => x.name === m.params?.name)
            if (!t) return fail(m.id, -32602, `Unknown tool ${m.params?.name}`)
            try {
                const r = await t.run(m.params?.arguments ?? {}, ctx)
                for (const e of r.evidence ?? []) texts.set(e.id, r.text)
                for (const x of r.exhibits ?? []) texts.set(x.id, r.text)
                return reply(m.id, { content: [{ type: "text", text: r.text }], isError: false })
            } catch (e: any) {
                return reply(m.id, { content: [{ type: "text", text: `The tool failed: ${String(e?.message ?? e)}` }], isError: true })
            }
        }
        case "resources/list":
            return reply(m.id, { resources: [{ uri: "archstats://snapshot", name: "Snapshot card", description: "A one-screen brief of the codebase", mimeType: "text/plain" }] })
        case "resources/read":
            if (m.params?.uri !== "archstats://snapshot") return fail(m.id, -32602, "Unknown resource")
            return reply(m.id, { contents: [{ uri: "archstats://snapshot", mimeType: "text/plain", text: (await buildCard(world)).text }] })
        case "prompts/list":
            return reply(m.id, { prompts: PLAYBOOKS.map(p => ({ name: p.id, title: p.title, description: `${p.title}. For: ${p.when}.` })) })
        case "prompts/get": {
            const p = PLAYBOOKS.find(x => x.id === m.params?.name)
            if (!p) return fail(m.id, -32602, "Unknown prompt")
            return reply(m.id, { description: p.title, messages: [{ role: "user", content: { type: "text", text: `${p.title} for this codebase, using the Archstats tools:\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nCite evidence ids; say what the snapshot cannot show.` } }] })
        }
        default:
            if (m.id !== undefined) fail(m.id, -32601, `Method not found: ${m.method}`)
    }
}

createInterface({ input: process.stdin }).on("line", line => {
    if (!line.trim()) return
    let m: Msg
    try { m = JSON.parse(line) } catch { return fail(null as any, -32700, "Parse error") }
    handle(m).catch(e => m.id !== undefined && fail(m.id, -32603, String(e?.message ?? e)))
})
