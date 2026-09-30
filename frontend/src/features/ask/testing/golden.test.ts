// What the legacy tools said on real snapshots, kept so the exhibits that
// replace them can be held to the same numbers. Opt in:
//   ASK_GOLDEN=write ASK_SNAPS=/a.db:/b.db npx vitest run src/features/ask/testing/golden.test.ts
// writes testing/golden/<snapshot>.json; without ASK_GOLDEN=write it only checks the files exist.

import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { toolByName } from "../tools"
import { sqliteWorld } from "./sqliteWorld"
import type { ToolContext, World } from "../engine/types"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))
import { goldenDir as dir, goldenPath } from "./golden"

function ctxFor(world: World): ToolContext {
    let n = 0
    return { world, ranOn: { scanId: world.scanId, commit: "", revision: 0, workspace: world.workspace }, nextId: () => `E${++n}`, recall: () => null }
}

/** The calls whose answers the exhibits must keep. */
export function goldenCalls(world: World): Array<[string, Record<string, any>]> {
    const comps = world.components().filter(c => c.name !== ".").sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))
    const big = String(comps[0].name)
    const tangled = world.cycles()[0]?.nodes[0] ?? big
    const file = [...world.fileComponent().keys()].sort()[0]
    const git = "git_commits" in world.columns
    return [
        ["layers", {}], ["layers", { within: big }],
        ["mass", { color: "role" }], ["mass", { color: "health" }],
        ["tangles", {}], ["cycles", { sort: "asc", limit: 5 }], ["untangle", { component: tangled }],
        ["graph", { query: `around ${big}` }], ["graph", { query: `dependents of ${big} depth all` }],
        ["rank", { metric: "dependents" }], ["rank", { metric: "size" }], ["rank", { metric: "lines", grain: "files", limit: 10 }],
        ["component", { name: big }], ["files_of", { component: big }], ["file_outline", { path: file }],
        ...(git ? [["activity", {}], ["activity", { component: big }], ["cochange", {}], ["cochange", { component: big }], ["knowledge", { component: big }], ["knowledge_map", {}]] as Array<[string, Record<string, any>]> : []),
    ]
}

describe.skipIf(!snaps.length)("golden outputs of the legacy tools", () => {
    for (const path of snaps) {
        it(path.split("/").pop()!, async () => {
            const world = sqliteWorld(path)
            const ctx = ctxFor(world)
            if (process.env.ASK_GOLDEN !== "write") { expect(existsSync(goldenPath(path))).toBe(true); return }
            const out: Array<{ tool: string; args: Record<string, any>; text: string; evidence: unknown[] }> = []
            for (const [tool, args] of goldenCalls(world)) {
                const r = await toolByName(tool)!.run(args, ctx)
                out.push({ tool, args, text: r.text, evidence: r.evidence ?? [] })
            }
            mkdirSync(dir, { recursive: true })
            writeFileSync(goldenPath(path), JSON.stringify({ snapshot: path, workspace: world.workspace, calls: out }, null, 1))
        }, 120_000)
    }
})
