// When and why one component came to import another: the commit that wrote
// the oldest import still carrying the dependency, the newest one, and how
// many arrived lately. For two components in a cycle, every import in the
// cycle is dated, and the newest is the one that closed it. Git is asked on
// demand, about these lines only, at the commit the scan read.

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import type { BlameLine, Snapshot } from "~/features/snapshot/snapshot"
import { candidates } from "~/features/snapshot/names"
import { t } from "~/shared/i18n"
import { esc } from "../landmarks"

/** At most this many files are blamed for one dependency: the rest are counted, not dated. */
const MAX_FILES = 20

export interface Dated { file: string; line: number; commit: string; time: string; author: string; summary: string }

export interface EdgeOrigin {
    from: string
    to: string
    files: number
    dated: number
    first: Dated | null
    last: Dated | null
    recent: number
}

export interface OriginsData {
    edge: EdgeOrigin
    /** When the two are in one cycle: every edge of it, dated, and which closed it. */
    cycle: { nodes: string[]; edges: EdgeOrigin[]; closedBy: EdgeOrigin | null } | null
    atHead: boolean
}

const day = (iso: string) => iso.slice(0, 10)
const short = (sha: string) => sha.slice(0, 7)

async function dateEdge(snap: Snapshot, from: string, to: string, horizon: number): Promise<{ edge: EdgeOrigin; atHead: boolean }> {
    const rows = await snap.query(`SELECT file, begin_position FROM snippets WHERE snippet_type = 'modularity__component__imports' AND component = ${esc(from)} AND content = ${esc(to)}`)
    const byFile = new Map<string, number[]>()
    for (const r of rows) {
        const line = Number(String(r.begin_position ?? "").split(":")[0]) || 0
        if (!line) continue
        const list = byFile.get(String(r.file)) ?? []
        list.push(line)
        byFile.set(String(r.file), list)
    }
    const files = [...byFile.keys()].sort()
    const dated: Dated[] = []
    let atHead = false
    await Promise.all(files.slice(0, MAX_FILES).map(async file => {
        let lines: BlameLine[] = []
        try { lines = await snap.history!.blame(file, byFile.get(file)!) } catch { return }
        for (const b of lines) {
            if (b.atHead) atHead = true
            dated.push({ file, line: b.line, commit: b.commit, time: b.time, author: snap.author(b.author), summary: b.summary })
        }
    }))
    dated.sort((a, b) => a.time.localeCompare(b.time))
    // Per file, the oldest line is when that file started carrying it.
    const firstPerFile = new Map<string, Dated>()
    for (const x of dated) if (!firstPerFile.has(x.file)) firstPerFile.set(x.file, x)
    const starts = [...firstPerFile.values()]
    const recent = starts.filter(x => Date.parse(x.time) >= horizon).length
    return { edge: { from, to, files: files.length, dated: starts.length, first: dated[0] ?? null, last: starts.sort((a, b) => a.time.localeCompare(b.time))[starts.length - 1] ?? null, recent }, atHead }
}

export const origins = exhibit<OriginsData>()({
    kind: "origins", v: 1,
    summary: t("landmarks.origins.summary"),
    params: s.object({
        from: s.string().describe(t("landmarks.origins.paramFrom")),
        to: s.string().describe(t("landmarks.origins.paramTo")),
    }, { aliases: { of: "from", on: "to", component: "from" } }),

    title: (p, d) => t("landmarks.origins.title", { from: d?.edge.from ?? p.from, to: d?.edge.to ?? p.to }),

    async resolve(p, { snap }): Promise<OriginsData | Absent> {
        if (!snap.history) return { absent: t("landmarks.origins.noGit") }
        if (!snap.columns.snippets) return { absent: t("landmarks.origins.noSnippets") }
        const names = snap.components().map(c => String(c.name))
        const from = candidates(names, p.from)[0]
        const to = candidates(names, p.to)[0]
        if (!from) return { absent: t("landmarks.common.noComponent", { name: p.from }) }
        if (!to) return { absent: t("landmarks.common.noComponent", { name: p.to }) }
        const head = Date.parse(snap.info.git_head_time || snap.info.git_based_on || snap.info.scanned_at || "") || Date.now()
        const horizon = head - 365 * 86_400_000

        let a = from, b = to
        let first = await dateEdge(snap, a, b, horizon)
        if (!first.edge.files) {
            // Asked the wrong way round: the dependency runs the other way.
            const back = await dateEdge(snap, b, a, horizon)
            if (back.edge.files) { [a, b] = [b, a]; first = back }
        }
        if (!first.edge.files) return { absent: t("landmarks.origins.noImport", { from, to }) }

        let cycle: OriginsData["cycle"] = null
        const ring = snap.cycles().find(c => c.nodes.includes(a) && c.nodes.includes(b))
        if (ring && ring.nodes.length <= 8) {
            const edges: EdgeOrigin[] = []
            for (let i = 0; i < ring.nodes.length; i++) {
                const x = ring.nodes[i], y = ring.nodes[(i + 1) % ring.nodes.length]
                edges.push(x === a && y === b ? first.edge : (await dateEdge(snap, x, y, horizon)).edge)
            }
            // The cycle closed when its last edge appeared: the one whose oldest import is newest.
            const closedBy = edges.every(e => e.first) ? [...edges].sort((p, q) => q.first!.time.localeCompare(p.first!.time))[0] : null
            cycle = { nodes: ring.nodes, edges, closedBy }
        }
        return { edge: first.edge, cycle, atHead: first.atHead }
    },

    facts(d) {
        const e = d.edge
        const out: FactDraft[] = []
        if (!e.first) {
            out.push({ kind: "absence", text: t("landmarks.origins.undated", { from: e.from, to: e.to, files: e.files }), entities: [e.from, e.to], values: { files: e.files } })
            return out
        }
        out.push({ kind: "row", text: t("landmarks.origins.since", { from: e.from, to: e.to, date: day(e.first.time), commit: short(e.first.commit), summary: e.first.summary, author: e.first.author, file: e.first.file }), entities: [e.from, e.to], values: { files: e.files } })
        out.push({ kind: "total", text: t("landmarks.origins.files", { from: e.from, to: e.to, count: e.files, dated: e.dated, recent: e.recent }), entities: [e.from, e.to], values: { files: e.files, recent: e.recent } })
        if (e.last && e.last.commit !== e.first.commit) out.push({ kind: "row", text: t("landmarks.origins.latest", { date: day(e.last.time), file: e.last.file, commit: short(e.last.commit), summary: e.last.summary, author: e.last.author }), entities: [e.from, e.to], values: {} })
        if (d.cycle) {
            out.push({ kind: "total", text: t("landmarks.origins.cycle", { list: [...d.cycle.nodes, d.cycle.nodes[0]].join(" → ") }), entities: d.cycle.nodes, values: { size: d.cycle.nodes.length } })
            for (const x of d.cycle.edges) if (x.first) out.push({ kind: "row", text: t("landmarks.origins.cycleEdge", { from: x.from, to: x.to, date: day(x.first.time), commit: short(x.first.commit), summary: x.first.summary }), entities: [x.from, x.to], values: { files: x.files } })
            if (d.cycle.closedBy?.first) out.push({ kind: "row", text: t("landmarks.origins.closed", { date: day(d.cycle.closedBy.first.time), from: d.cycle.closedBy.from, to: d.cycle.closedBy.to, commit: short(d.cycle.closedBy.first.commit), summary: d.cycle.closedBy.first.summary, author: d.cycle.closedBy.first.author }), entities: [d.cycle.closedBy.from, d.cycle.closedBy.to], values: {} })
        }
        if (e.files > e.dated) out.push({ kind: "note", text: t("landmarks.origins.capped", { dated: e.dated, files: e.files }), entities: [], values: {} })
        if (d.atHead) out.push({ kind: "note", text: t("landmarks.origins.atHead"), entities: [], values: {} })
        out.push({ kind: "note", text: t("landmarks.origins.lastWrote"), entities: [], values: {} })
        return out
    },

    table: d => {
        const edges = d.cycle?.edges ?? [d.edge]
        return {
            columns: [{ id: "edge", label: t("landmarks.origins.dependency") }, { id: "since", label: t("landmarks.origins.sinceCol") }, { id: "commit", label: t("landmarks.origins.commit") }, { id: "files", label: t("landmarks.origins.filesCol"), numeric: true }, { id: "recent", label: t("landmarks.origins.recentCol"), numeric: true }],
            rows: edges.map(x => ({ edge: `${x.from} → ${x.to}`, since: x.first ? day(x.first.time) : "–", commit: x.first ? `${short(x.first.commit)} ${x.first.summary}` : "", files: x.files, recent: x.recent })),
            total: edges.length,
        }
    },

    samples: () => [],
})
