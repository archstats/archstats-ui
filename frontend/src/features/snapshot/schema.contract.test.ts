// The frontend's half of the snapshot read contract (the Go half is
// app/contract). Every engine table and metric column named in our source
// must exist in a snapshot written by the engine pinned in go.mod, or be
// listed below with the reason it may be missing.
//
// Opt in with a fixture the Go contract test writes:
//   ARCHSTATS_FIXTURE_DB=$PWD/../testdata/archstats-fixture.db npx vitest run src/features/snapshot/schema.contract
// scripts/verify-harness.sh writes the fixture and runs this.

import { createRequire } from "node:module"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

const FIXTURE = process.env.ARCHSTATS_FIXTURE_DB ?? ""
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

// Metric columns are named <domain>__<measure>[__<detail>...].
const METRIC = /\b(?:codesmells|complexity|cycles|git|graph|modularity|community|group|java|csharp|ts)__[a-z0-9_]*[a-z0-9]\b/g
// A table read in SQL. CTE names and aliases are dropped per file below.
const TABLE = /\b(?:FROM|JOIN)\s+"?([a-z_][a-z0-9_]*)"?/g
const CTE = /\b([a-z_][a-z0-9_]*)\s*(?:\([^()]*\))?\s+AS\s+(?:NOT\s+)?(?:MATERIALIZED\s+)?\(/gi
const BUILTIN = new Set(["sqlite_master", "sqlite_schema", "pragma_table_info", "json_each", "json_tree"])

// Names our code reads that the pinned engine does not write for the
// fixture. Each is one of: a legacy name read as a fallback for snapshots
// from an older analysis revision, a metric the engine writes only for code
// the fixture lacks, or drift (the engine renamed it and the code was not
// moved). Recorded when this test was introduced; review an entry before
// relying on it, and delete it once nothing reads the name. Never add a name
// here to make a new read pass: change the read, or the engine first.
const KNOWN_ABSENT_COLUMNS = new Set([
    // Java class facts and Spring counts: the Java pack's older vocabulary,
    // read by the java feature and framework profiles.
    "java__class__extends", "java__class__implements", "java__interface__declaration", "java__record__declaration",
    "java__jpa__entity", "java__spring__component", "java__spring__configuration", "java__spring__repository",
    "java__spring__service",
    // Code health and debt: written only where a file earns them.
    "codesmells__debt_interest", "codesmells__hotspot",
    "codesmells__health__deduction__avg_nesting", "codesmells__health__deduction__max_nesting",
    "codesmells__health__threshold__avg_nesting", "codesmells__health__threshold__max_nesting",
    // Old stat names that statNames.ts maps to their current ones.
    "complexity__classes", "git__authors", "git__commits", "modularity__distance", "modularity__component__imported_by",
    "cycles__real__count", "ts__react__components",
])

const KNOWN_ABSENT_TABLES = new Set([
    // Revision 7 to 15; artifacts and pipelines replaced them in 16. readings.ts
    // checks for them, mobileTemplates.ts reads deployable_dependencies as is.
    "deployables", "deployable_dependencies",
])

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) return walk(p)
        return /\.(ts|vue)$/.test(name) && !/\.(test|bench)\.ts$/.test(name) ? [p] : []
    })
}

/** Every metric column and engine table named in the source, with where. */
function namesInSource() {
    const columns = new Map<string, Set<string>>()
    const tables = new Map<string, Set<string>>()
    const add = (m: Map<string, Set<string>>, k: string, f: string) => m.set(k, (m.get(k) ?? new Set()).add(f))
    for (const path of walk(SRC)) {
        const file = relative(SRC, path)
        // Test helpers read the app's own registry too, and the SQL editor's
        // grammar names keywords, not tables.
        if (file.includes("/testing/") || file.startsWith("features/sql/")) continue
        const text = readFileSync(path, "utf8")
        for (const m of text.matchAll(METRIC)) add(columns, m[0], file)
        const local = new Set([...text.matchAll(CTE)].map(m => m[1]))
        for (const m of text.matchAll(TABLE)) {
            const t = m[1]
            if (t.length > 2 && !local.has(t) && !BUILTIN.has(t)) add(tables, t, file)
        }
    }
    return { columns, tables }
}

function schemaOf(path: string) {
    // Through require: Vite would resolve "node:sqlite" as a package called sqlite.
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")
    const db = new DatabaseSync(path, { readOnly: true })
    const all = (sql: string) => db.prepare(sql).all() as any[]
    const tables = new Set(all("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").map(r => String(r.name)))
    const columns = new Set<string>()
    for (const t of tables) for (const c of all(`PRAGMA table_info("${t}")`)) columns.add(String(c.name))
    // A metric column exists only where some file has the metric; the
    // engine's definitions name every metric it can write.
    for (const r of all("SELECT id FROM _metric_definitions")) columns.add(String(r.id))
    // Snippet types share the metric vocabulary and are read by name too.
    for (const r of all("SELECT DISTINCT snippet_type FROM snippets")) columns.add(String(r.snippet_type))
    db.close()
    return { tables, columns }
}

const report = (missing: Array<[string, Set<string>]>) => missing.map(([name, files]) => `${name}  (${[...files].slice(0, 3).join(", ")})`)

describe.skipIf(!FIXTURE || !existsSync(FIXTURE))("snapshot read contract", () => {
    let schema: ReturnType<typeof schemaOf>
    let source: ReturnType<typeof namesInSource>
    beforeAll(() => {
        schema = schemaOf(FIXTURE)
        source = namesInSource()
    })

    it("names only metric columns the engine writes", () => {
        const missing = [...source.columns].filter(([c]) => !schema.columns.has(c) && !KNOWN_ABSENT_COLUMNS.has(c))
        expect(report(missing), "metric columns no snapshot from the pinned engine has; rename the read or change the engine first").toEqual([])
    })

    it("reads only tables the engine writes", () => {
        const missing = [...source.tables].filter(([t]) => !schema.tables.has(t) && !KNOWN_ABSENT_TABLES.has(t))
        expect(report(missing), "tables no snapshot from the pinned engine has (a CTE or alias? name it with AS ( in the same file)").toEqual([])
    })

    it("lists no known-absent name the engine now writes or nothing reads", () => {
        const stale = [
            ...[...KNOWN_ABSENT_COLUMNS].filter(c => schema.columns.has(c) || !source.columns.has(c)),
            ...[...KNOWN_ABSENT_TABLES].filter(t => schema.tables.has(t) || !source.tables.has(t)),
        ]
        expect(stale, "remove these from the known-absent lists").toEqual([])
    })
})
