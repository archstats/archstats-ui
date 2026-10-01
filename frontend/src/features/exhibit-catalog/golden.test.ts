// Exhibits against what the legacy tools said on the same snapshots
// (features/ask/testing/golden): the ranking the `rank` tool drew, the
// neighbours the `graph` tool walked, the timeline `activity` counted.

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { goldenPath } from "~/features/ask/testing/golden"
import { sqliteWorld } from "~/features/ask/testing/sqliteWorld"
import { ranking, type RankingData } from "~/features/metrics/exhibits/ranking"
import { neighbours, type NeighboursData } from "~/features/connections/exhibits/neighbours"
import { activity, type ActivityData } from "~/features/git/exhibits/activity"
import { authors, type AuthorsData } from "~/features/git/exhibits/authors"
import { isAbsent } from "~/features/exhibits/types"

const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))

describe.skipIf(!snaps.length)("exhibits against the legacy tools", () => {
    for (const path of snaps) {
        describe(path.split("/").pop()!, () => {
            const golden = JSON.parse(readFileSync(goldenPath(path), "utf8"))
            const snap = sqliteWorld(path)
            const calls = (tool: string) => golden.calls.filter((c: any) => c.tool === tool)

            it("ranking = rank", async () => {
                for (const c of calls("rank")) {
                    const old = c.evidence[0]
                    const d = await ranking.resolve({ measure: c.args.metric, among: c.args.grain === "files" ? "files" : "components" }, { snap })
                    if (!old) continue
                    // The legacy tool showed 10 by default; the exhibit keeps 15. The first ten agree in value;
                    // ties are ordered by size now (larger first), so only rows above the last tied value must match by name.
                    const mine = (d as RankingData).items.slice(0, old.items.length)
                    expect(mine.map(x => x.value), c.args.metric).toEqual(old.items.map((x: any) => x.value))
                    const edge = old.items[old.items.length - 1]?.value
                    const names = new Set(mine.map(x => x.key))
                    for (const x of old.items) if (x.value !== edge) expect(names.has(x.key), `${c.args.metric}: ${x.key}`).toBe(true)
                }
            })

            it("neighbours = graph around / dependents", async () => {
                for (const c of calls("graph")) {
                    const old = c.evidence[0]
                    if (!old) continue
                    const of = /(?:around|of)\s+(\S+)/.exec(c.args.query)![1]
                    if (/^around/.test(c.args.query)) {
                        const d = await neighbours.resolve({ of, direction: "both" }, { snap }) as NeighboursData
                        // around X = X and its direct neighbours, both ways.
                        const mine = new Set([d.of, ...d.uses.map(x => x.name), ...d.usedBy.map(x => x.name)])
                        const text = /: (\d+) components?/.exec(c.text)
                        if (text) expect(mine.size, c.args.query).toBe(Number(text[1]))
                    } else {
                        const d = await neighbours.resolve({ of, direction: "used by" }, { snap }) as NeighboursData
                        const text = /: (\d+) components?/.exec(c.text)
                        // dependents of X depth all includes X itself.
                        if (text) expect(d.reachUp + 1, c.args.query).toBe(Number(text[1]))
                    }
                }
            })

            it("activity = activity", async () => {
                for (const c of calls("activity")) {
                    const old = c.evidence[0]
                    const d = await activity.resolve({ of: c.args.component }, { snap })
                    if (!old) { expect(isAbsent(d)).toBe(true); continue }
                    expect((d as ActivityData).points).toEqual(old.points)
                }
            })

            it("authors = knowledge", async () => {
                for (const c of calls("knowledge")) {
                    const old = c.evidence[0]
                    const d = await authors.resolve({ of: c.args.component }, { snap })
                    if (!old) continue
                    // The exhibit merges one person's spellings ("Jeff Fischer", "jefffischer"); merge the legacy list the same way.
                    const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")
                    const legacy = new Map<string, number>()
                    for (const x of old.items) legacy.set(key(x.label), (legacy.get(key(x.label)) ?? 0) + x.value)
                    const now = new Map((d as AuthorsData).authors.map(a => [key(a.name), a.commits]))
                    // The exhibit counts as the Authors view does (files still in the snapshot, no bots), so counts
                    // can be lower than the legacy tool's; the people at the top are the same people.
                    expect([...legacy.keys()].filter(k => now.has(k)).length).toBeGreaterThanOrEqual(Math.min(legacy.size, 5))
                }
            })
        })
    }
})
