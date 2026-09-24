import { describe, expect, it } from "vitest"
import { canonicalAuthorSql, isBotAuthor, isBotCommit, namesOf } from "./authors"

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
