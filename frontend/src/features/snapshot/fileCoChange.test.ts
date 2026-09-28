import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { fileCoChangePairs, fileCoChangeSql, sweepingLimit } from "./fileCoChange"

// Through require: Vite would resolve "node:sqlite" as a package called sqlite.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")

function db() {
  const d = new DatabaseSync(":memory:")
  d.exec(`CREATE TABLE files (name TEXT, component TEXT);
          CREATE TABLE git_commits (commit_hash TEXT, file TEXT);`)
  d.exec(`INSERT INTO files VALUES ('a/1','a'),('a/2','a'),('b/1','b'),('b/2','b')`)
  const add = d.prepare("INSERT INTO git_commits VALUES (?, ?)")
  for (const [hash, files] of [
    ["h1", ["a/1", "a/2", "b/1"]],
    ["h2", ["a/1", "a/2"]],
    ["h3", ["b/1", "b/2", "gone/9"]], // gone/9 is no longer scanned: it pairs with nothing
    ["h4", ["a/1", "a/2", "b/1", "b/2"]], // sweeping when the limit is 3
    ["", ["a/1", "b/2"]], // no hash, no commit
  ] as const) for (const f of files) add.run(hash, f)
  return d
}

describe("fileCoChangeSql", () => {
  it("counts each pair once, in name order, leaving sweeping commits out", () => {
    const rows = db().prepare(fileCoChangeSql(3)).all()
    expect(rows.map((r: any) => [r.from, r.to, r.shared])).toEqual(expect.arrayContaining([
      ["a/1", "a/2", 2], ["a/1", "b/1", 1], ["a/2", "b/1", 1], ["b/1", "b/2", 1],
    ]))
    expect(rows).toHaveLength(4)
  })

  it("counts a sweeping commit when the limit allows it", () => {
    const rows = db().prepare(fileCoChangeSql(100)).all() as any[]
    expect(rows.find(r => r.from === "a/1" && r.to === "a/2")?.shared).toBe(3)
    expect(rows.find(r => r.from === "a/1" && r.to === "b/2")?.shared).toBe(1)
  })

  it("keeps only pairs touching the given files", () => {
    const rows = db().prepare(fileCoChangeSql(3, "SELECT name FROM files WHERE component = 'b'")).all() as any[]
    expect(rows.map(r => `${r.from}|${r.to}`).sort()).toEqual(["a/1|b/1", "a/2|b/1", "b/1|b/2"])
  })
})

describe("fileCoChangePairs", () => {
  it("counts exactly what fileCoChangeSql counts, from one row per commit", async () => {
    const d = db()
    const sent: number[] = []
    const query = async (sql: string) => { const rows = d.prepare(sql).all(); sent.push(rows.length); return rows }
    for (const sweeping of [3, 100]) {
      const key = (r: any) => `${r.from}|${r.to}|${r.shared}`
      const pairs = (await fileCoChangePairs(query, sweeping)).map(key).sort()
      expect(pairs).toEqual((d.prepare(fileCoChangeSql(sweeping)).all() as any[]).map(key).sort())
    }
    expect(sent).toEqual([3, 4]) // commits with two or more scanned files, not pairs
  })
})

describe("sweepingLimit", () => {
  it("reads the scan's own limit, 100 when the snapshot predates it", () => {
    expect(sweepingLimit({ git_max_changes_per_commit: "40" })).toBe(40)
    expect(sweepingLimit({})).toBe(100)
  })
})
