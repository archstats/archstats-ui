import { createRequire } from "node:module"
import { it } from "vitest"

// Opt-in: SNAPS=a.db,b.db npx vitest run src/utils/sandbox.parity.test.ts
// A plan with no edits must read what each snapshot says, component by component.
import { loadSandboxBase, project } from "~/utils/sandbox"

it.skipIf(!process.env.SNAPS)("reads every snapshot unchanged with no edits", async () => {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")
    for (const path of (process.env.SNAPS ?? "").split(",").filter(Boolean)) {
        const db = new DatabaseSync(path, { readOnly: true })
        const q = async (sql: string) => db.prepare(sql).all()
        const cols = new Map<string, Set<string>>()
        const has = (t: string, c: string) => { if (!cols.has(t)) cols.set(t, new Set((db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as any[]).map(r => r.name))); return cols.get(t)!.has(c) }
        const base = await loadSandboxBase(q, has)
        const p = project(base, [])
        const rows = db.prepare(`SELECT name, modularity__coupling__afferent ca, modularity__coupling__efferent ce, modularity__instability i, modularity__abstractness a, modularity__distance_main_sequence d FROM components`).all() as any[]
        const bad: string[] = []
        for (const r of rows) {
            const m = p.metrics.get(r.name)
            if (!m) { bad.push(`${r.name}: missing`); continue }
            for (const k of ["ca", "ce", "i", "a", "d"] as const) if (Math.abs(Number(r[k] ?? 0) - m[k]) > 1e-9) bad.push(`${r.name} ${k}: snapshot ${r[k]} sandbox ${m[k]}`)
        }
        const scc = db.prepare(`SELECT count(DISTINCT "group") n FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1)`).get() as any
        console.log("PARITY", path.split("/").pop(), rows.length, "components,", bad.length, "mismatches; tangles", p.tangles.length, "vs", scc.n, bad.slice(0, 6).join(" | "))
        if (bad.length || p.tangles.length !== Number(scc.n)) throw new Error(`${path}: ${bad.slice(0, 3).join(" | ")}`)
    }
})
