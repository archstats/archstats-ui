// Exhibits in the app: the snapshot a spec is drawn from. The open scan reads
// the stores the views fill (one read for the view and the exhibit); any other
// scan is read by id with SQL.

import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useAuthorsStore } from "~/features/git/authors.store"
import { scanSnapshot } from "~/features/snapshot/scanSnapshot"
import type { Snapshot } from "~/features/snapshot/snapshot"
import type { CyclePath } from "~/features/cycles/cycles"
import type { ConnectionRow, Definition } from "~/features/snapshot/snapshot"
import { registerSnapshotSource } from "~/features/exhibits/engine"
import "./catalog"

export async function snapshotFor(scanId: string): Promise<Snapshot> {
    const data = useDataStore()
    const ws = useWorkspacesStore()
    const authors = useAuthorsStore()
    const author = (name: string) => authors.display(name)
    const aliases = () => (authors.aliases ?? {}) as Record<string, string>
    if (scanId && scanId === data._openScanId) return openSnapshot()
    return scanSnapshot(scanId, sql => data.queryIn(scanId, sql), { workspace: ws.active?.name ?? "", author, aliases })
}

/** The scan open in the window, from its stores. */
export function openSnapshot(): Snapshot {
    const data = useDataStore()
    const ws = useWorkspacesStore()
    const authors = useAuthorsStore()
    const scanId = data._openScanId ?? ""
    let defs: Map<string, Definition> | null = null
    return {
        scanId,
        info: data.snapshotInfo as Record<string, string>,
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
        query: sql => data.queryIn(scanId, sql),
        author: name => authors.display(name),
        aliases: () => (authors.aliases ?? {}) as Record<string, string>,
    }
}

// Every drawn exhibit reads its scan through this.
registerSnapshotSource(snapshotFor)
