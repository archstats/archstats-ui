import { ref, watch, type Ref } from "vue"
import { sqlIn, sqlLiteral } from "~/shared/sql"
import type { CompEdge } from "./areas"

// What a change set alone does not carry: the newer snapshot's whole
// dependency graph (so a change can be seen against the structure it landed
// in), how many components sit in tangles on each side, and the commits
// between the two points, read from the newer snapshot's history.

type QueryIn = (scanId: string, sql: string) => Promise<any[]>

export interface RangeWork {
    commits: number
    authors: number
    /** Component → commits that touched it in the range, and lines added and removed. */
    byComponent: Map<string, { commits: number; added: number; deleted: number }>
    /** Every (component, commit) pair in the range, so areas count a commit once. */
    touches: Array<[string, string]>
}

/** Distinct commits per area in the range. */
export function commitsByArea(work: RangeWork, areaOf: (component: string) => string | undefined): Map<string, number> {
    const seen = new Map<string, Set<string>>()
    for (const [c, h] of work.touches) {
        const a = areaOf(c)
        if (!a) continue
        if (!seen.has(a)) seen.set(a, new Set())
        seen.get(a)!.add(h)
    }
    return new Map([...seen].map(([a, s]) => [a, s.size]))
}

export interface ChangeContext {
    /** Every component in the newer snapshot. */
    headNames: string[]
    headEdges: CompEdge[]
    tangled: { before: number | null; after: number | null }
    /** Null when the newer snapshot has no history, or the range is unknown. */
    work: RangeWork | null
}

export interface RangeCommit { hash: string; time: string; author: string; message: string; file: string }

const range = (from: string, to: string) =>
    `julianday(commit_time) > julianday(${sqlLiteral(from)}) AND julianday(commit_time) <= julianday(${sqlLiteral(to)})`

async function headEdges(q: QueryIn, scanId: string): Promise<CompEdge[]> {
    // The same reading the comparison makes: no self links, no type-only ones.
    const sql = (kind: boolean) => `SELECT "from", "to", SUM(COALESCE(reference_count, 0)) AS refs FROM component_connections_direct WHERE "from" <> "to"${kind ? " AND COALESCE(kind, '') <> 'type_only'" : ""} GROUP BY 1, 2`
    const rows = await q(scanId, sql(true)).catch(() => q(scanId, sql(false)))
    return rows.map(r => ({ from: String(r.from), to: String(r.to), refs: Number(r.refs) || 0 }))
}

async function tangled(q: QueryIn, scanId: string): Promise<number | null> {
    try {
        const rows = await q(scanId, `SELECT COUNT(*) AS n FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING COUNT(*) > 1)`)
        return Number(rows[0]?.n ?? 0)
    } catch {
        return null
    }
}

async function work(q: QueryIn, scanId: string, from: string, to: string): Promise<RangeWork | null> {
    try {
        const where = range(from, to)
        const [totals, per, touches] = await Promise.all([
            q(scanId, `SELECT COUNT(DISTINCT commit_hash) AS commits, COUNT(DISTINCT author_name) AS authors FROM git_commits WHERE ${where}`),
            q(scanId, `SELECT component, COUNT(DISTINCT commit_hash) AS commits, SUM(file_additions) AS added, SUM(file_deletions) AS deleted FROM git_commits WHERE ${where} AND COALESCE(component, '') <> '' GROUP BY component`),
            q(scanId, `SELECT DISTINCT component, commit_hash FROM git_commits WHERE ${where} AND COALESCE(component, '') <> ''`),
        ])
        return {
            commits: Number(totals[0]?.commits ?? 0),
            authors: Number(totals[0]?.authors ?? 0),
            byComponent: new Map(per.map(r => [String(r.component), { commits: Number(r.commits) || 0, added: Number(r.added) || 0, deleted: Number(r.deleted) || 0 }])),
            touches: touches.map(r => [String(r.component), String(r.commit_hash)] as [string, string]),
        }
    } catch {
        return null
    }
}

/** The commits in the range that touched these files, newest first. */
export async function commitsTouching(q: QueryIn, scanId: string, files: string[], from: string, to: string): Promise<RangeCommit[]> {
    if (!files.length) return []
    const rows = await q(scanId, `SELECT commit_hash AS hash, MIN(commit_time) AS time, author_name AS author, commit_message AS message, file FROM git_commits WHERE file IN ${sqlIn(files)} AND ${range(from, to)} GROUP BY commit_hash, file ORDER BY julianday(time) DESC LIMIT 60`)
    return rows.map(r => ({ hash: String(r.hash), time: String(r.time), author: String(r.author ?? ""), message: String(r.message ?? ""), file: String(r.file) }))
}

export function useChangeContext(pair: Ref<{ base: string; head: string; from: string | null; to: string | null } | null>, q: QueryIn) {
    const context = ref<ChangeContext | null>(null)
    const loading = ref(false)
    let token = 0
    watch(pair, async p => {
        const mine = ++token
        context.value = null
        if (!p) return
        loading.value = true
        try {
            const [names, edges, before, after, w] = await Promise.all([
                q(p.head, "SELECT name FROM components").then(rows => rows.map(r => String(r.name))),
                headEdges(q, p.head),
                tangled(q, p.base),
                tangled(q, p.head),
                p.from && p.to ? work(q, p.head, p.from, p.to) : Promise.resolve(null),
            ])
            if (mine === token) context.value = { headNames: names, headEdges: edges, tangled: { before, after }, work: w }
        } catch {
            if (mine === token) context.value = { headNames: [], headEdges: [], tangled: { before: null, after: null }, work: null }
        } finally {
            if (mine === token) loading.value = false
        }
    }, { immediate: true })
    return { context, loading }
}
