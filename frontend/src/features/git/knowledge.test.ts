import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { componentAuthorsSql, coverCount, knowledgeSql } from "./authors"

// Through require: Vite would resolve "node:sqlite" as a package called sqlite.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")

function db() {
    const d = new DatabaseSync(":memory:")
    d.exec(`CREATE TABLE files (name TEXT, component TEXT);
            CREATE TABLE git_commits (commit_hash TEXT, commit_time TEXT, commit_message TEXT, author_name TEXT, author_email TEXT, file TEXT, file_additions INT, file_deletions INT);`)
    d.exec(`INSERT INTO files VALUES ('a/1.go','a'),('a/2.go','a'),('b/1.go','b')`)
    const add = d.prepare("INSERT INTO git_commits VALUES (?,?,?,?,?,?,?,0)")
    add.run("h1", "2024-01-01", "x", "Ann", "ann@x", "a/1.go", 500)
    add.run("h2", "2024-03-01", "x", "ann", "ann@y", "a/2.go", 100)
    add.run("h3", "2025-01-01", "x", "Bob", "bob@x", "a/1.go", 300)
    add.run("h4", "2025-02-01", "x", "Cy", "cy@x", "a/2.go", 100)
    add.run("h5", "2025-02-02", "x", "dependabot[bot]", "d@x", "a/2.go", 9000)
    add.run("h6", "2025-02-03", "x", "Bob", "bob@x", "gone/9.go", 7000)
    add.run("h7", "2025-02-04", "x", "Bob", "bob@x", "b/1.go", 10)
    return d
}

describe("knowledge", () => {
    it("counts how few cover a fraction", () => {
        expect(coverCount([500, 300, 100, 100], 0.5)).toBe(1)
        expect(coverCount([500, 300, 100, 100], 0.8)).toBe(2)
        expect(coverCount([], 0.8)).toBe(0)
    })
    it("adds lines per person over the component's files now, bots out, aliases merged", () => {
        const rows = db().prepare(knowledgeSql({ ann: "Ann" })).all() as any[]
        const a = rows.find(r => r.component === "a")
        expect(a).toMatchObject({ authors: 3, added: 1000, cover50: 1, cover80: 2, main: "Ann", mainLast: "2024-03-01" })
        expect(a.mainShare).toBeCloseTo(0.6)
        expect(rows.find(r => r.component === "b")).toMatchObject({ authors: 1, cover80: 1, main: "Bob" })
    })
    it("agrees with the per-component list", () => {
        const rows = db().prepare(componentAuthorsSql("a", { ann: "Ann" })).all() as any[]
        expect(rows.map(r => [r.author, r.added])).toEqual([["Ann", 600], ["Bob", 300], ["Cy", 100]])
        expect(coverCount(rows.map(r => r.added), 0.8)).toBe(2)
    })
})
