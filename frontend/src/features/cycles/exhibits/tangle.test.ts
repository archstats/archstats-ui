// The tangle exhibit against what the legacy `untangle` tool planned on the same snapshots.

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { goldenPath } from "~/features/ask/testing/golden"
import { sqliteWorld } from "~/features/ask/testing/sqliteWorld"
import { isAbsent } from "~/features/exhibits/types"
import { tangle, type TangleData } from "./tangle"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))

describe.skipIf(!snaps.length)("tangle against the legacy untangle tool", () => {
    for (const path of snaps) {
        it(path.split("/").pop()!, async () => {
            const golden = JSON.parse(readFileSync(goldenPath(path), "utf8"))
            const snap = sqliteWorld(path)
            for (const call of golden.calls.filter((c: any) => c.tool === "untangle")) {
                const old = call.evidence[0]
                const d = await tangle.resolve({ of: call.args.component }, { snap })
                if (!old) { expect(isAbsent(d), call.text).toBe(true); continue }
                const now = d as TangleData
                expect([...now.members].sort()).toEqual([...old.members].sort())
                expect(now.steps.map(s => [s.from, s.to, s.imports, s.freed, s.tangled])).toEqual(old.steps.map((s: any) => [s.from, s.to, s.imports, s.freed, s.tangled]))
                expect(now.steps.map(s => s.carriers)).toEqual(old.steps.map((s: any) => s.carriers))
            }
        })
    }
})
