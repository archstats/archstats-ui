// The open snapshot as the Ask engine sees it, built from the stores the
// views already fill: the same components, edges, cycles and roles, so an
// answer never disagrees with the screen.

import { Console, FindInCode, FindLines } from "wailsjs/go/app/QueryService"
import { Embed } from "wailsjs/go/app/AskService"
import { takeView } from "./stage"
import { runInWorker } from "./codeRunner"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useAuthorsStore } from "~/features/git/authors.store"
import type { CyclePath } from "~/features/cycles/cycles"
import type { ConnectionRow, Definition, ViewContext, World } from "../engine/types"

export function appWorld(onScreen: () => ViewContext | null): World {
    const data = useDataStore()
    const ws = useWorkspacesStore()
    const authors = useAuthorsStore()
    const scanId = data._openScanId ?? ""
    let defs: Map<string, Definition> | null = null
    // Older snapshots carry no _snapshot table; the scan registry still knows the commit and revision.
    const scan = (ws.scans as any[]).find(s => s.id === scanId)
    const info: Record<string, string> = {
        ...(scan ? {
            git_head_commit: scan.headCommit ?? "", git_branch: scan.branch ?? "", analysis_revision: String(scan.analysisRevision ?? ""),
            extensions: scan.extensions ?? "", scanned_at: String(scan.finishedAt ?? scan.startedAt ?? ""), report_id: ws.active?.name ?? "",
        } : {}),
        ...Object.fromEntries(Object.entries(data.snapshotInfo as Record<string, string>).filter(([, v]) => v !== "" && v !== null && v !== undefined)),
    }
    return {
        scanId,
        info,
        workspace: ws.active?.name ?? "",
        columns: data.$state._columns as Record<string, string[]>,
        components: () => data.allRawComponents as Array<Record<string, any>>,
        connections: () => data.componentConnections as unknown as ConnectionRow[],
        cycles: () => data.allCyclesExpanded as CyclePath[],
        definitions: () => {
            if (!defs) {
                defs = new Map()
                for (const d of (data.definitions as Map<string, any>).values()) defs.set(d.id, { id: d.id, name: d.name || d.id, short: d.short || d.short_description || "", long: d.long || d.long_description || "" })
            }
            return defs
        },
        fileComponent: () => data.fileComponentIndex as Map<string, string>,
        fileRole: f => String((data.fileRoleIndex as Map<string, string>).get(f) ?? "production"),
        // Always this scan, by id: the backend's globally open snapshot can be another workspace's
        // (the native window switched), and a query sent there answers about the wrong code.
        query: sql => data.queryIn(scanId, sql),
        console: async sql => {
            const r = await Console(scanId, sql)
            return { columns: r.columns ?? [], rows: (r.rows ?? []) as unknown[][], truncated: !!r.truncated }
        },
        findInCode: async (needle, o) => {
            const r = await FindInCode(scanId, needle, { regex: !!o.regex, caseSensitive: !!o.caseSensitive, word: !!o.word } as any)
            return { files: (r.files ?? []).map(f => ({ file: f.file, hits: f.hits })), totalHits: r.totalHits, searched: r.searched, truncated: r.truncated }
        },
        findLines: async (file, needle, o) => ((await FindLines(scanId, file, needle, { regex: !!o.regex, caseSensitive: !!o.caseSensitive, word: !!o.word } as any)) ?? []).map(l => ({ line: l.line, text: l.text, context: l.context })),
        author: name => authors.display(name),
        runCode: (code, api) => runInWorker(code, api),
        readView: (route, opts) => takeView(scanId, route, { ...opts, figures: 2, vision: true }),
        embed: async texts => (await Embed("nomic-embed-text", texts)) as number[][],
        aliases: () => (authors.aliases ?? {}) as Record<string, string>,
        onScreen,
    }
}
