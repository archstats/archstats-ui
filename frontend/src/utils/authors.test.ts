import { describe, expect, it } from "vitest"
import { authorStatsSql, canonicalAuthorSql, isBotAuthor, isBotCommit, maskPeople, namesOf, pseudonymLabels } from "./authors"

describe("bots", () => {
    it("recognises the usual machine accounts", () => {
        for (const n of ["dependabot[bot]", "github-actions[bot]", "renovate", "jenkins", "pyup-bot", "Sylius Bot"]) expect(isBotAuthor(n)).toBe(true)
    })
    it("leaves people alone, including names that merely contain 'bot'", () => {
        for (const n of ["Jeff Fischer", "Abbott Smith", "Botond Nagy", "Danny Avila"]) expect(isBotAuthor(n)).toBe(false)
    })
    it("counts Maven release commits as a machine's whoever made them", () => {
        expect(isBotCommit("Broadleaf", "", "[maven-release-plugin] prepare release 5.2.0")).toBe(true)
        expect(isBotCommit("Broadleaf", "", "Fix the cart")).toBe(false)
    })
})

describe("aliases", () => {
    const aliases = { jefffischer: "Jeff Fischer", "O'Brien": "Pat O'Brien" }
    it("folds aliases into the canonical name in SQL, quoting safely", () => {
        const sql = canonicalAuthorSql(aliases)
        expect(sql).toContain("WHEN 'jefffischer' THEN 'Jeff Fischer'")
        expect(sql).toContain("WHEN 'O''Brien' THEN 'Pat O''Brien'")
        expect(canonicalAuthorSql({})).toBe("author_name")
    })
    it("lists every name a person committed under", () => {
        expect(namesOf(aliases, "Jeff Fischer")).toEqual(["Jeff Fischer", "jefffischer"])
    })
})

describe("pseudonymLabels", () => {
    it("numbers by first commit and folds aliases into one label", () => {
        const labels = pseudonymLabels([
            { name: "b", first: "2020-01-02" },
            { name: "a", first: "2021-01-01" },
            { name: "a-alias", first: "2019-06-01" },
        ], { "a-alias": "a" })
        expect(labels).toEqual({ a: "Author 1", b: "Author 2" })
    })
})

describe("maskPeople", () => {
    it("masks handles, emails and trailers", () => {
        expect(maskPeople("Fix #12 (thanks @jdoe, mail x.y@corp.com)\n\nCo-authored-by: Jane <j@x.io>"))
            .toBe("Fix #12 (thanks @…, mail …@…)\n\nCo-authored-by: …")
    })
})

describe("authorStatsSql", () => {
    it("anchors on one row, never one per commit", () => {
        const sql = authorStatsSql("1", { anchor: "julianday('2026-01-01')" })
        expect(sql).toMatch(/WITH now AS \(SELECT julianday\('2026-01-01'\) AS now\)/)
    })
})
