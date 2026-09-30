// Every tool and every cookbook recipe, run against real snapshots. Opt in:
//   ASK_SNAPS=/path/a.db:/path/b.db npx vitest run src/features/ask/tools
// Each tool must answer without throwing, and say something for the model.

import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { TOOLS, toolByName } from "./index"
import { RECIPES, bindRecipe } from "../knowledge/cookbook"
import { buildCard } from "../knowledge/card"
import { sqliteWorld } from "../testing/sqliteWorld"
import type { ToolContext, World } from "../engine/types"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))

function ctxFor(world: World): ToolContext {
    let n = 0
    return { world, ranOn: { scanId: world.scanId, commit: "", revision: 0, workspace: world.workspace }, nextId: () => `E${++n}`, recall: () => null }
}

describe.skipIf(!snaps.length)("tools on real snapshots", () => {
    for (const path of snaps) {
        describe(path.split("/").pop()!, () => {
            const world = sqliteWorld(path)
            const ctx = ctxFor(world)
            const comps = world.components().filter(c => c.name !== ".").sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))
            const big = String(comps[0].name)
            const tangled = world.cycles()[0]?.nodes[0] ?? big
            const file = [...world.fileComponent().keys()][0]
            const run = async (name: string, args: Record<string, any>) => {
                const r = await toolByName(name)!.run(args, ctx)
                expect(r.text.length, `${name} said nothing`).toBeGreaterThan(5)
                expect(r.text, `${name} failed`).not.toMatch(/The tool failed|SQL error/)
                return r
            }

            it("builds the snapshot card", async () => {
                const card = await buildCard(world)
                expect(card.text).toMatch(/components/)
            })
            it("capabilities, find, component, rank", async () => {
                await run("capabilities", { question: "smallest cycle" })
                await run("find", { text: big.slice(-4) })
                const c = await run("component", { name: big })
                expect(c.evidence?.[0]?.kind).toBe("component")
                for (const metric of ["size", "dependents", "churn", "health", "hotspot", "cycles", "pagerank", "afferent"]) await run("rank", { metric })
                await run("rank", { metric: "lines", grain: "files", limit: 5 })
                const f = await run("rank", { metric: "health", order: "asc", filter: "dependents > 2" })
                expect(f.text).toMatch(/only where dependents > 2/)
            })
            it("graph, tangles, cycles, untangle", async () => {
                await run("graph", { query: `dependents of ${big} depth all` })
                await run("graph", { query: `around ${big}` })
                await run("tangles", {})
                const cy = await run("cycles", { sort: "asc", limit: 3 })
                expect(cy.text).toMatch(/cycles|no cycles/i)
                await run("untangle", { component: tangled })
            })
            it("files and code", async () => {
                await run("files_of", { component: big })
                const o = await run("file_outline", { path: file })
                expect(o.evidence?.[0]?.kind).toBe("file")
                if ("file_contents" in world.columns) {
                    await run("file_read", { path: file, from: 1, to: 20 })
                    await run("code_search", { text: "import" })
                }
            })
            it("figures: layers, mass, knowledge map", async () => {
                const l = await run("layers", {})
                expect(l.exhibits?.[0]?.spec.kind).toBe("stack")
                expect(l.text).toMatch(/^\[E\d+\] The layers of the codebase\n\[E\d+\.1\] /)
                await run("layers", { within: big })
                const m = await run("mass", { color: "role" })
                expect(m.evidence?.[0]?.kind).toBe("folders")
                await run("mass", { color: "health" })
                if ("git_commits" in world.columns) {
                    const k = await run("knowledge_map", {})
                    expect(k.evidence?.[0]?.kind).toBe("knowledge")
                }
            })
            it("history", async () => {
                if (!("git_commits" in world.columns)) return
                await run("activity", {})
                await run("activity", { component: big })
                await run("knowledge", { component: big })
                await run("cochange", { component: big })
            })
            it("code mode", async () => {
                const r = await run("run_code", { code: "const cs = await components(); const e = await edges(); return { n: cs.length, top: cs.sort((a, b) => b.dependents - a.dependents)[0].name, edges: e.length }" })
                expect(r.text).toMatch(/"n":/)
                const bad = await toolByName("run_code")!.run({ code: "return fetch('http://example.com')" }, ctx)
                expect(bad.text).toMatch(/failed/)
            })
            it("schema and sql", async () => {
                await run("schema", { term: "commit" })
                const r = await run("sql", { query: "SELECT count(*) AS n FROM components" })
                expect(r.evidence?.[0]?.kind).toBe("table")
            })
            it("every cookbook recipe the snapshot can run", async () => {
                for (const r of RECIPES.filter(x => x.needs.every(t => t in world.columns))) {
                    const args = Object.fromEntries(r.params.filter(p => p.default === undefined).map(p => [p.name, p.name === "from" ? big : String(comps[1]?.name ?? big)]))
                    const res = await world.console(bindRecipe(r, args))
                    expect(res.columns.length, r.id).toBeGreaterThan(0)
                }
            })
            it("offers every tool with a valid schema", () => {
                for (const t of TOOLS) {
                    expect(t.name).toMatch(/^[a-z_]+$/)
                    for (const k of t.required ?? []) expect(t.params[k], `${t.name}.${k}`).toBeTruthy()
                }
            })
        })
    }
})
