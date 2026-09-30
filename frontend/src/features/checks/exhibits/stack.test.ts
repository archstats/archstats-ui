// The stack exhibit against what the legacy `layers` tool drew on the same
// snapshots (testing/golden): the same floors in the same order, the same
// sizes, the same upward links. And the facts on a small hand-made codebase.

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { goldenPath } from "~/features/ask/testing/golden"
import { sqliteWorld } from "~/features/ask/testing/sqliteWorld"
import type { Snapshot } from "~/features/snapshot/snapshot"
import { isAbsent } from "~/features/exhibits/types"
import { stack, type StackData } from "./stack"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))

function tiny(): Snapshot {
    const comps = ["app.web.api", "app.web.ui", "app.core.model", "app.core.rules", "app.store.db"].map(name => ({ name, complexity__lines: 100 }))
    const edge = (from: string, to: string, n = 1) => Array.from({ length: n }, (_, i) => ({ from, to, file: `${from}/${i}.x`, reference_count: 1 }))
    const connections = [
        ...edge("app.web.api", "app.core.model", 3), ...edge("app.web.ui", "app.core.rules", 2),
        ...edge("app.core.model", "app.store.db", 4), ...edge("app.core.rules", "app.store.db"),
        ...edge("app.store.db", "app.web.api"), // points back up, and closes a tangle across all three floors
    ]
    return {
        scanId: "tiny", info: {}, workspace: "tiny", columns: {},
        components: () => comps, connections: () => connections, cycles: () => [],
        definitions: () => new Map(), fileComponent: () => new Map(), fileRole: () => "production",
        query: async () => [], author: n => n,
    }
}

describe("stack on a small codebase", () => {
    it("orders the floors so imports run down, and names what points back up", async () => {
        const d = await stack.resolve({}, { snap: tiny() }) as StackData
        expect(isAbsent(d)).toBe(false)
        // areasOf splits small codebases into their parts; the order is what matters: web above core above store.
        const pos = (prefix: string) => d.floors.findIndex(f => f.id.startsWith(prefix))
        expect(pos("web")).toBeLessThan(pos("core"))
        expect(pos("core")).toBeLessThan(pos("store"))
        const up = d.flows.filter(f => f.bad)
        expect(up.map(f => f.key)).toEqual(["store>web.api"])
        const facts = stack.facts(d, {})
        expect(facts[0].text).toMatch(new RegExp(`^${d.floors.length} floors`))
        expect(facts.find(f => f.element === "flow:store>web.api")?.values.references).toBe(1)
        expect(facts.some(f => /tangle of 3 components crosses 3 floors/.test(f.text))).toBe(true)
    })
    it("says why when there is nothing to stack", async () => {
        const d = await stack.resolve({ of: "app.store.db" }, { snap: tiny() })
        expect(isAbsent(d) && d.absent).toMatch(/Nothing to stack under/)
    })
    it("lights the floor or link a highlight names", async () => {
        const d = await stack.resolve({}, { snap: tiny() }) as StackData
        const props = stack.figure!.props(d, {}, { density: "inline", highlight: ["flow:store>web.api"], title: "x" })
        expect(props.selected).toEqual({ kind: "flow", id: "store>web.api" })
    })
})

describe.skipIf(!snaps.length)("stack against the legacy layers tool", () => {
    for (const path of snaps) {
        it(path.split("/").pop()!, async () => {
            const golden = JSON.parse(readFileSync(goldenPath(path), "utf8"))
            const snap = sqliteWorld(path)
            for (const call of golden.calls.filter((c: any) => c.tool === "layers")) {
                const old = call.evidence[0]
                const d = await stack.resolve({ of: call.args.within }, { snap })
                if (!old) { expect(isAbsent(d)).toBe(true); continue }
                const now = d as StackData
                expect(now.floors.map(f => [f.id, f.sub, f.weight])).toEqual(old.floors.map((f: any) => [f.id, f.sub, f.weight]))
                const flows = (fs: Array<{ from: string; to: string; count: number; bad?: boolean }>) => fs.map(f => `${f.from}>${f.to}:${f.count}:${!!f.bad}`).sort()
                expect(flows(now.flows)).toEqual(flows(old.flows))
                expect(now.grouping).toBe(old.grouping)
            }
        })
    }
})
