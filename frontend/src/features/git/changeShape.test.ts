import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { shortTails, breadthCompare, breadthPeriods, buildWorkNow, changesAlone, commitBreadthSql, commitComponentsSql, workNowSql } from "./changeShape"
import { buildKnowledge, holdingsByPerson, knowledgePairsSql, knowledgeTree, summarise } from "./knowledgeLeft"

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite")

function db() {
    const d = new DatabaseSync(":memory:")
    d.exec(`CREATE TABLE files (name TEXT, component TEXT);
            CREATE TABLE git_commits (commit_hash TEXT, commit_time TEXT, commit_message TEXT, author_name TEXT, author_email TEXT, file TEXT, file_additions INT, file_deletions INT);`)
    d.exec(`INSERT INTO files VALUES ('a/1.go','a'),('a/2.go','a'),('b/1.go','b'),('c/1.go','c')`)
    const add = d.prepare("INSERT INTO git_commits VALUES (?,?,?,?,?,?,?,?)")
    // Ann wrote most of a long ago and left; Bob is still here.
    add.run("h1", "2020-01-01", "init", "Ann", "ann@x", "a/1.go", 800, 0)
    add.run("h2", "2024-01-01", "b work", "Bob", "bob@x", "b/1.go", 100, 0)
    add.run("h3", "2025-11-01", "wide", "Bob", "bob@x", "a/2.go", 200, 10)
    add.run("h3", "2025-11-01", "wide", "Bob", "bob@x", "b/1.go", 50, 0)
    add.run("h3", "2025-11-01", "wide", "Bob", "bob@x", "c/1.go", 5, 5)
    add.run("h4", "2025-12-01", "Merge branch 'x'", "Bob", "bob@x", "c/1.go", 999, 0)
    add.run("h5", "2025-12-15", "bump", "dependabot[bot]", "d@x", "c/1.go", 999, 0)
    add.run("h6", "2025-12-20", "c alone", "Cy", "cy@x", "c/1.go", 40, 0)
    return d
}
const ANCHOR = "julianday('2026-01-01')"

describe("knowledge left", () => {
    it("places each component on the ladder and names who to ask", () => {
        const pairs = db().prepare(knowledgePairsSql({ aliases: {}, includeBots: false, anchor: ANCHOR })).all()
        const rows = buildKnowledge(pairs, new Map([["a", 900]]), 365)
        const a = rows.find(r => r.component === "a")!
        expect(a.lines).toBe(900)
        expect(a.added).toBe(1000)
        expect(a.hereShare).toBeCloseTo(0.2)
        // Bob is still here but wrote a fifth of it, in one commit this year.
        expect(a.state).toBe("once")
        expect(a.ask?.author).toBe("Bob")
        expect(a.main?.author).toBe("Ann")
        // c: Cy's commit this year, Bob's three-component commit; the merge and the bot never count.
        const c = rows.find(r => r.component === "c")!
        expect(c.hereCommits).toBe(2)
        expect(c.added).toBe(5 + 40)
        expect(rows.find(r => r.component === "b")!.state).toBe("wrote")
        const s = summarise(rows)
        expect(s.byState.once.components).toBe(1)
        expect(holdingsByPerson(rows).get("Bob")?.keeps).toBe(2)
    })
    it("groups components by the first split that means something", () => {
        const row = (component: string, lines: number) => ({ component, lines } as any)
        const t = knowledgeTree([
            row("src/oscar/apps/basket", 100), row("src/oscar/apps/checkout", 100), row("src/oscar/apps/dashboard", 50),
            row("src/oscar/apps/dashboard/offers", 50), row("src/oscar/core", 300), row("docs/source", 10),
        ])
        expect(t.path).toBe("src/oscar")
        expect(t.children.map(c => c.label)).toEqual(["apps", "core", "docs/source"])
        const dash = t.children[0].children.find(c => c.label === "dashboard")!
        expect(dash.children.map(c => c.label)).toEqual(["(own files)", "offers"])
    })
})

describe("work now", () => {
    it("shares the window's changed lines and finds what woke up", () => {
        const rows = db().prepare(workNowSql({ days: 90, anchor: ANCHOR, aliases: {}, includeBots: false })).all()
        const w = buildWorkNow(rows)
        // Merges and bots are left out: c has 10 + 40 lines, a 210, b 50.
        expect(w.lines).toBe(310)
        expect(w.rows[0].component).toBe("a")
        expect(w.half).toBe(1)
        expect(w.rising.map(r => r.component)).toEqual(["a", "c"])
        // b took all of the two years before and a sixth of now.
        expect(w.quiet.map(r => r.component)).toEqual(["b"])
    })
})

describe("breadth", () => {
    it("counts components per commit, without merges or bots", () => {
        const commits = db().prepare(commitBreadthSql({ includeBots: false })).all()
        expect(commits.map((c: any) => [c.h, c.n]).sort()).toEqual([["h1", 1], ["h2", 1], ["h3", 3], ["h6", 1]])
        const { periods, unit } = breadthPeriods(commits)
        // Under six years of history reads by quarter, every quarter given a slot.
        expect(unit).toBe("quarter")
        expect(periods.length).toBe(24)
        expect(periods.at(-1)!.key).toBe("2025-Q4")
        expect(periods.at(-1)!.bands).toEqual([1, 1, 0, 0])
        const cmp = breadthCompare(commits, new Date("2026-01-01"))
        expect(cmp.recent).toEqual({ commits: 2, wide: 0.5, wider: 0 })
    })
    it("says what a component changes with", () => {
        const pairs = db().prepare(commitComponentsSql({ days: null, anchor: ANCHOR, includeBots: false })).all()
        const b = changesAlone(pairs).find(r => r.component === "b")!
        expect(b).toMatchObject({ commits: 2, alone: 1, partners: 2, partnerCommits: 1, partner: "a" })
    })
})

describe("short tails", () => {
    it("keeps the shortest distinct tail", () => {
        const t = shortTails(["Sylius\\Bundle\\AdminBundle\\Grid", "Sylius\\Bundle\\ShopBundle\\Grid", "org.x.dao"])
        expect(t.get("Sylius\\Bundle\\AdminBundle\\Grid")).toBe("AdminBundle\\Grid")
        expect(t.get("org.x.dao")).toBe("dao")
    })
})
