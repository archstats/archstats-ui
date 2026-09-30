// The snapshot card: a one-screen brief of the codebase the model reads on
// every turn, so it never starts from zero and never mistakes one snapshot
// for another. Facts only, each one computed here.

import type { World } from "../engine/types"
import { foldEdges, tanglesOf } from "~/features/cycles/untangle"
import { commonPrefix, separatorOf } from "~/features/snapshot/names"

export { commonPrefix, separatorOf }

export interface SnapshotCard {
    text: string
    /** Every number in the card, so answers quoting it count as sourced. */
    numbers: string
    has: { git: boolean; units: boolean; rules: boolean; health: boolean; modules: boolean; contents: boolean }
}

const n = (v: unknown) => Math.round(Number(v) || 0).toLocaleString("en-US")

async function one<T = any>(world: World, sql: string): Promise<T | null> {
    try { return ((await world.query<T>(sql))[0] ?? null) } catch { return null }
}

export async function buildCard(world: World): Promise<SnapshotCard> {
    const info = world.info
    const comps = world.components().filter(c => c.name !== ".")
    const names = comps.map(c => String(c.name))
    const sep = separatorOf(names)
    const prefix = commonPrefix(names, sep)
    const lines = comps.reduce((s, c) => s + (Number(c.complexity__lines) || 0), 0)
    const cols = world.columns
    const has = {
        git: "git_commit_info" in cols || "git_commits" in cols,
        units: "units" in cols,
        rules: "rules" in cols,
        health: (cols.components ?? []).includes("codesmells__code_health"),
        modules: "modules" in cols,
        contents: "file_contents" in cols,
    }
    const files = await one<{ n: number }>(world, "SELECT count(*) AS n FROM files")
    const roles = has.contents || (cols.files ?? []).includes("role")
        ? await world.query<{ role: string; n: number; lines: number }>("SELECT coalesce(role, 'unknown') AS role, count(*) AS n, sum(complexity__lines) AS lines FROM files GROUP BY 1 ORDER BY lines DESC").catch(() => [])
        : []

    // Roots: the first segment after the shared prefix.
    const roots = new Map<string, { count: number; lines: number }>()
    for (const c of comps) {
        const rest = String(c.name).slice(prefix.length)
        const root = rest.split(sep)[0] || String(c.name)
        const r = roots.get(root) ?? { count: 0, lines: 0 }
        r.count++
        r.lines += Number(c.complexity__lines) || 0
        roots.set(root, r)
    }
    const topRoots = [...roots].sort((a, b) => b[1].lines - a[1].lines).slice(0, 8)
    const largest = [...comps].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0)).slice(0, 5)

    const edges = foldEdges(world.connections())
    const tangles = tanglesOf(new Set([...names, ...edges.flatMap(e => [e.from, e.to])]), edges).sort((a, b) => b.length - a.length)
    const inTangles = tangles.reduce((s, t) => s + t.length, 0)

    const git = has.git ? await one<{ commits: number; first: string; last: string }>(world, "SELECT count(DISTINCT commit_hash) AS commits, min(commit_time) AS first, max(commit_time) AS last FROM git_commit_info") : null
    const authors = has.git ? await one<{ n: number }>(world, "SELECT count(*) AS n FROM git_authors") : null
    const units = has.units ? await one<{ n: number }>(world, "SELECT count(*) AS n FROM units") : null

    const absent: string[] = []
    if (!has.git) absent.push("git history (no churn, authors or co-change)")
    if (!has.health) absent.push("code health")
    if (!has.units) absent.push("units (class/function level)")
    if (!has.contents) absent.push("file contents (no code reading)")
    const ignore = info.walker_ignored_top ? (() => { try { return (JSON.parse(info.walker_ignored_top) as string[]).slice(0, 8).join(", ") } catch { return "" } })() : ""

    const out = [
        `Project ${info.report_id ?? world.workspace} · commit ${String(info.git_head_commit ?? "").slice(0, 7) || "unknown"}${info.git_branch ? ` on ${info.git_branch}` : ""} · analysis revision ${info.analysis_revision ?? "?"} · scanned ${String(info.scanned_at ?? "").slice(0, 10)}`,
        `Read with: ${info.extensions ?? "?"}${ignore ? ` · ignored: ${ignore}` : ""}`,
        `Size: ${n(comps.length)} components · ${n(files?.n)} files · ${n(lines)} lines`,
        roles.length ? `Files by role: ${roles.map(r => `${r.role} ${n(r.n)} files / ${n(r.lines)} lines`).join(" · ")}` : "",
        `Component names share the prefix "${prefix || "(none)"}"; separator "${sep}".`,
        `Top-level areas (by lines): ${topRoots.map(([k, v]) => `${k} (${n(v.count)} components, ${n(v.lines)} lines)`).join(", ")}`,
        `Largest components: ${largest.map(c => `${c.name} (${n(c.complexity__lines)} lines)`).join(", ")}`,
        `Tangles (sets of components that all reach each other): ${n(tangles.length)}${tangles.length ? `, holding ${n(inTangles)} components; the largest has ${n(tangles[0].length)}` : ""} · distinct shortest cycles: ${n(world.cycles().length)}`,
        git ? `History: ${n(git.commits)} commits by ${n(authors?.n)} authors, ${String(git.first ?? "").slice(0, 10)} to ${String(git.last ?? "").slice(0, 10)}` : "",
        units ? `Units (classes, functions…): ${n(units.n)}` : "",
        absent.length ? `Not in this snapshot: ${absent.join("; ")}.` : "",
    ].filter(Boolean)
    const text = out.join("\n")
    return { text, numbers: text, has }
}
