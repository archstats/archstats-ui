// Every exhibit in the catalog, held to the same rules on real snapshots:
// it resolves or says plainly why not; its facts are few, finite and point
// at elements that exist; its table has the columns its rows use; its figure
// has props and a height. Opt in with snapshots:
//   ASK_SNAPS=/a.db:/b.db npx vitest run src/features/exhibits

import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { sqliteWorld } from "~/features/ask/testing/sqliteWorld"
import { CATALOG } from "./catalog"
import { check, MAX_FACTS, present, resolve } from "~/features/exhibits/engine"
import { isAbsent } from "~/features/exhibits/types"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))

describe("the catalog", () => {
    it("has unique kinds, versions and params that describe themselves", () => {
        const kinds = CATALOG.map(d => d.kind)
        expect(new Set(kinds).size).toBe(kinds.length)
        for (const d of CATALOG) {
            expect(d.kind).toMatch(/^[a-z][a-z-]*$/)
            expect(d.v).toBeGreaterThan(0)
            expect(d.summary.length).toBeGreaterThan(20)
            const schema = d.params.jsonSchema()
            // Three at most, four for a ranking (what, among what, where in the code, which ones): the model decides little.
            expect(Object.keys(schema.properties).length, `${d.kind} has at most four params`).toBeLessThanOrEqual(4)
            for (const [k, p] of Object.entries(schema.properties)) expect(p.description, `${d.kind}.${k} says what it is`).toBeTruthy()
        }
    })
})

describe.skipIf(!snaps.length)("every exhibit on real snapshots", () => {
    for (const path of snaps) {
        describe(path.split("/").pop()!, () => {
            const snap = sqliteWorld(path)
            for (const def of CATALOG) {
                it(def.kind, async () => {
                    for (const params of [{}, ...(def.samples?.(snap) ?? [])]) {
                        const checked = check(def.kind, params)
                        if ("error" in checked) {
                            // A definition with a required param refuses empty params, and says what it needs.
                            if (!Object.keys(params).length) { expect(checked.error).toMatch(/required/); continue }
                            throw new Error(`${def.kind} ${JSON.stringify(params)}: ${checked.error}`)
                        }
                        const data = await resolve(checked.spec, { snap })
                        if (isAbsent(data)) { expect(data.absent.length).toBeGreaterThan(10); continue }
                        const label = `${def.kind} ${JSON.stringify(params)}`
                        expect(def.title(checked.spec.params, data).length, label).toBeGreaterThan(3)

                        const facts = def.facts(data, checked.spec.params)
                        expect(facts.length, `${label} states something`).toBeGreaterThan(0)
                        expect(facts.length, `${label} states at most ${def.maxFacts ?? MAX_FACTS} facts`).toBeLessThanOrEqual(def.maxFacts ?? MAX_FACTS)
                        const elements = new Set((def.elements?.(data) ?? []).map(e => e.id))
                        for (const f of facts) {
                            expect(f.text.trim().length, label).toBeGreaterThan(5)
                            for (const [k, v] of Object.entries(f.values)) expect(Number.isFinite(v), `${label}: ${k} = ${v} in "${f.text}"`).toBe(true)
                            if (f.element) expect(elements.has(f.element), `${label}: fact points at ${f.element}, which is not an element`).toBe(true)
                        }

                        const table = def.table(data, checked.spec.params)
                        expect(table.columns.length, label).toBeGreaterThan(0)
                        const ids = new Set(table.columns.map(c => c.id))
                        for (const row of table.rows.slice(0, 50)) for (const k of Object.keys(row)) expect(ids.has(k), `${label}: row key ${k} has no column`).toBe(true)

                        if (def.figure && (def.figure.when?.(data) ?? true)) {
                            for (const density of ["inline", "full"] as const) {
                                const o = { density, highlight: [], title: "t" }
                                expect(typeof def.figure.props(data, checked.spec.params, o), label).toBe("object")
                                const h = def.figure.height(data, o)
                                expect(Number.isFinite(h) && h > 40, `${label}: height ${h}`).toBe(true)
                            }
                        }

                        const shown = await present(checked.spec, { snap, id: "E1", ranOn: { scanId: snap.scanId, commit: "", revision: 0, workspace: "" } })
                        if (!isAbsent(shown)) expect(shown.text).toMatch(/^\[E1\] .+\n\[E1\.1\] /)
                    }
                }, 60_000)
            }
        })
    }
})
