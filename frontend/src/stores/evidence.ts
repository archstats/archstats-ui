import { acceptHMRUpdate, defineStore } from "pinia"
import { Delete, List, Reorder, SaveFigure, Upsert } from "wailsjs/go/app/EvidenceService"
import { QueryIn } from "wailsjs/go/app/QueryService"
import { useDataStore } from "~/stores/data"
import { useWorkspacesStore } from "~/stores/workspaces"
import { comparability } from "~/utils/comparability"
import { cycleHolds, pickValues, pinStatus, PIN_METRICS, type PinKind, type PinStatus, type PinValues } from "~/utils/evidence"
import { buildProvenance } from "~/utils/provenance"
import { newestFirst } from "~/utils/scanOrder"
import { sqlLiteral } from "~/utils/sql"

// The evidence board: findings pinned with where they came from, re-checked
// against the newest snapshot of the code (not whichever is open), each
// status naming what it compared with.

export interface Pin {
    id: string
    workspaceId: string
    position: number
    kind: PinKind
    entityKey: string
    title: string
    route: string
    scanId: string | null
    headCommit: string
    revision: number
    lens: string
    scope: string
    role: string
    values: string
    note: string
    figurePath: string
    createdAt: string
}

export interface PinInput {
    kind: PinKind
    entityKey: string
    title: string
    values?: PinValues
    note?: string
    /** A figure to keep with a view pin, as PNG base64. */
    figure?: string | null
}

export const useEvidenceStore = defineStore("evidence", {
    state: () => ({
        workspace: "" as string,
        pins: [] as Pin[],
        now: {} as Record<string, PinValues | null>,
        statuses: {} as Record<string, PinStatus>,
        checkedAgainst: "" as string,
        loading: false,
    }),
    getters: {
        count: (s) => s.pins.filter(p => p.kind !== "heading").length,
        isPinned: (s) => (kind: PinKind, key: string) => s.pins.some(p => p.kind === kind && p.entityKey === key),
        valuesOf: () => (p: Pin): PinValues => { try { return JSON.parse(p.values || "{}") } catch { return {} } },
    },
    actions: {
        async load(workspaceId: string, force = false) {
            if (this.workspace === workspaceId && !force) return
            this.workspace = workspaceId
            try { this.pins = ((await List(workspaceId)) ?? []) as any } catch { this.pins = [] }
            void this.recheck()
        },
        async pin(input: PinInput): Promise<Pin | null> {
            const ws = useWorkspacesStore()
            const data = useDataStore()
            if (!ws.active) return null
            const p = buildProvenance()
            const route = typeof location !== "undefined" ? location.hash.replace(/^#/, "") : ""
            const saved = (await Upsert({
                id: "", workspaceId: ws.active.id, position: 0, kind: input.kind, entityKey: input.entityKey, title: input.title,
                route, scanId: ws.openScanId ?? null, headCommit: p.commit, revision: data._snapshotRevision ?? 0,
                lens: p.lens ?? "", scope: p.scope ?? "", role: p.role ?? "", values: JSON.stringify(input.values ?? {}),
                note: input.note ?? "", figurePath: "", createdAt: new Date().toISOString(),
            } as any)) as any as Pin
            if (input.figure) {
                try {
                    saved.figurePath = await SaveFigure(ws.active.id, saved.id, input.figure)
                    await Upsert(saved as any)
                } catch { /* the pin stands without its figure */ }
            }
            this.pins = [...this.pins, saved]
            void this.recheck()
            return saved
        },
        async update(id: string, patch: Partial<Pick<Pin, "title" | "note">>) {
            const p = this.pins.find(x => x.id === id)
            if (!p) return
            Object.assign(p, patch)
            await Upsert(p as any)
        },
        async heading(title: string) {
            const ws = useWorkspacesStore()
            if (!ws.active) return
            const saved = (await Upsert({ id: "", workspaceId: ws.active.id, position: 0, kind: "heading", entityKey: "", title, route: "", scanId: null, headCommit: "", revision: 0, lens: "", scope: "", role: "", values: "{}", note: "", figurePath: "", createdAt: new Date().toISOString() } as any)) as any as Pin
            this.pins = [...this.pins, saved]
        },
        async reorder(ids: string[]) {
            const byId = new Map(this.pins.map(p => [p.id, p]))
            this.pins = ids.map(id => byId.get(id)!).filter(Boolean)
            await Reorder(this.workspace, ids)
        },
        async remove(id: string) {
            await Delete(id)
            this.pins = this.pins.filter(p => p.id !== id)
        },

        /** Every pin against the newest complete snapshot. */
        async recheck() {
            const ws = useWorkspacesStore()
            const data = useDataStore()
            const newest: any = newestFirst(ws.scans.filter((s: any) => s.status === "complete"))[0]
            if (!newest) return
            this.checkedAgainst = newest.id
            const q = (sql: string) => QueryIn(newest.id, sql) as Promise<any[]>
            const now: Record<string, PinValues | null> = {}
            const statuses: Record<string, PinStatus> = {}
            let groupOf: Map<string, string> | null = null
            for (const p of this.pins) {
                if (p.kind === "heading" || p.kind === "view") continue
                const pinnedScan: any = p.scanId ? ws.scans.find((s: any) => s.id === p.scanId) : null
                const c = pinnedScan ? comparability(pinnedScan, newest) : { ok: true, reasons: [] as Array<{ level: string; text: string }> }
                const blocked = c.ok ? null : c.reasons.find(r => r.level === "block")?.text ?? "different analyses"
                let values: PinValues | null = null
                try {
                    if (p.kind === "component" || p.kind === "file") {
                        const table = p.kind === "component" ? "components" : "files"
                        const [row] = await q(`SELECT * FROM ${table} WHERE name = ${sqlLiteral(p.entityKey)} LIMIT 1`)
                        values = row ? pickValues(row, PIN_METRICS[p.kind]) : null
                    } else if (p.kind === "cycle") {
                        if (!groupOf) {
                            groupOf = new Map()
                            for (const r of await q(`SELECT "group", component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1)`)) groupOf.set(String(r.component), String(r.group))
                        }
                        const members = p.entityKey.split("\n")
                        values = cycleHolds(members, groupOf) ? { size: members.length } : null
                    } else if (p.kind === "rule") {
                        const [rule, from, to, file] = p.entityKey.split("|")
                        const [r] = await q(`SELECT count(*) AS n FROM rules WHERE status = 'violation' AND rule = ${sqlLiteral(rule)} AND "from" = ${sqlLiteral(from)} AND "to" = ${sqlLiteral(to)} AND file = ${sqlLiteral(file ?? "")}`)
                        values = Number(r?.n) ? { findings: Number(r.n) } : null
                    } else if (p.kind === "pair") {
                        const [from, to] = p.entityKey.split(">")
                        const [r] = await q(`SELECT sum(reference_count) AS n FROM component_connections_direct WHERE "from" = ${sqlLiteral(from)} AND "to" = ${sqlLiteral(to)}`)
                        values = Number(r?.n) ? { references: Number(r.n) } : null
                    }
                } catch { values = null }
                now[p.id] = values
                statuses[p.id] = pinStatus({ pinned: this.valuesOf(p), now: values, blocked, deleted: !p.scanId, label: id => data.statNiceName(id) || id })
            }
            this.now = now
            this.statuses = statuses
        },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useEvidenceStore, import.meta.hot))
