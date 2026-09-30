// Every intent, on real snapshots, the way a model would ask it: each answers
// with exhibits (or says plainly why not), its text carries fact ids, and it
// fits what the loop lets into the model's context.
//   ASK_SNAPS=/a.db:/b.db npx vitest run src/features/ask/intents

import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { sqliteWorld } from "../testing/sqliteWorld"
import type { ToolContext, World } from "../engine/types"
import { INTENTS } from "./index"
import { resolveName } from "./resolve"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))
const MAX_TOOL_TEXT = 6000

function ctxFor(world: World): ToolContext {
    let n = 0
    return { world, ranOn: { scanId: world.scanId, commit: "", revision: 0, workspace: world.workspace }, nextId: () => `E${++n}`, recall: () => null }
}

describe("the intents", () => {
    it("are few, named for questions, with few params", () => {
        expect(INTENTS.length).toBeLessThanOrEqual(13)
        for (const t of INTENTS) {
            expect(t.name).toMatch(/^[a-z_]+$/)
            expect(Object.keys(t.params).length, t.name).toBeLessThanOrEqual(4)
            // No internals in what the model reads: no column names, no routes, no SQL.
            expect(t.description, t.name).not.toMatch(/__|\/views\/|SELECT|exhibit/)
        }
    })
})

describe.skipIf(!snaps.length)("intents on real snapshots", () => {
    for (const path of snaps) {
        describe(path.split("/").pop()!, () => {
            const world = sqliteWorld(path)
            const comps = world.components().filter(c => c.name !== ".").sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))
            const big = String(comps[0].name)
            const small = String(comps[Math.min(comps.length - 1, 5)].name)
            const file = [...world.fileComponent().keys()].find(f => /\.(java|ts|py|vue|kt|go)$/.test(f)) ?? [...world.fileComponent().keys()][0]
            const cases: Array<[string, Record<string, any>]> = [
                ["about", {}], ["about", { of: big }], ["about", { of: file }], ["about", { of: big, vs: small }],
                ["structure", {}], ["structure", { of: big }],
                ["dependencies", { of: big }], ["dependencies", { of: big, direction: "used by" }], ["dependencies", { of: small, on: big }],
                ["change", {}], ["change", { of: big }], ["change", { kind: "hidden coupling" }], ["change", { kind: "hotspots" }], ["change", { since: "6 months" }],
                ["people", {}], ["people", { of: big }],
                ["rank", { measure: "most depended on" }], ["rank", { measure: "least healthy", among: "files" }], ["rank", { measure: "health", where: "dependents > 2" }], ["rank", { measure: "largest", among: "types" }],
                ["libraries", {}], ["deployables", {}], ["rules", {}],
                ["code", { of: file }], ["code", { of: file, find: "import" }], ["code", { find: "import" }], ["code", { of: big }],
                ["search", { text: big.slice(-4) }],
                ["explain", { term: "instability" }], ["explain", { term: "health", of: big }],
            ]
            for (const [name, args] of cases) {
                it(`${name} ${JSON.stringify(args).slice(0, 70)}`, async () => {
                    const t = INTENTS.find(x => x.name === name)!
                    const r = await t.run(args, ctxFor(world))
                    expect(r.text.length, "says something").toBeGreaterThan(10)
                    expect(r.text).not.toMatch(/undefined|NaN|\[object/)
                    if (r.exhibits?.length) {
                        expect(r.text).toMatch(/\[E\d+\.1\] /)
                        expect(r.text.length, `${name} fits the model's context (${r.text.length})`).toBeLessThanOrEqual(MAX_TOOL_TEXT)
                    }
                }, 60_000)
            }
            it("refuses to guess between two equally good names", () => {
                const tails = new Map<string, string[]>()
                for (const c of comps) { const t = String(c.name).split(/[./\\]|::/).pop()!; tails.set(t, [...(tails.get(t) ?? []), String(c.name)]) }
                const twice = [...tails].find(([, v]) => v.length > 1)
                if (!twice) return
                expect("ambiguous" in resolveName(world, twice[0], "component")).toBe(true)
            })
        })
    }
})
