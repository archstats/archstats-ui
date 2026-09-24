import { describe, expect, it } from "vitest"
import { ownerOf, ownerSets, parseCodeowners, patternToRegExp } from "./codeowners"

// GitHub's documented example file, trimmed to the lines with a stated outcome.
const GITHUB = `
# These owners will be the default owners for everything in the repo.
*       @global-owner1 @global-owner2
# Order is important; the last matching pattern takes the most precedence.
*.js    @js-owner #This is an inline comment.
*.go docs@example.com
/build/logs/ @doctocat
docs/*  docs@example.com
apps/ @octocat
/docs/ @doctocat
/scripts/ @doctocat @octocat
**/logs @octocat
/apps/ @octocat
/apps/github
`

const owners = (co: ReturnType<typeof parseCodeowners>, p: string) => ownerOf(co, p)?.owners ?? null

describe("codeowners", () => {
    const co = parseCodeowners(GITHUB)
    it("reads rules and inline comments", () => {
        expect(co.rules).toHaveLength(11)
        expect(co.rules[1]).toMatchObject({ pattern: "*.js", owners: ["@js-owner"] })
    })
    it("lets the last matching line win", () => {
        expect(owners(co, "src/app.js")).toEqual(["@js-owner"])
        expect(owners(co, "README.md")).toEqual(["@global-owner1", "@global-owner2"])
        expect(owners(co, "scripts/deploy.js")).toEqual(["@doctocat", "@octocat"])
    })
    it("matches unanchored patterns at any depth and anchored ones at the root", () => {
        expect(owners(co, "deep/down/x/logs/today.txt")).toEqual(["@octocat"])
        expect(owners(co, "build/logs/today.txt")).toEqual(["@octocat"])
        expect(patternToRegExp("/build/logs/").test("x/build/logs/a")).toBe(false)
    })
    it("keeps docs/* to direct files", () => {
        expect(patternToRegExp("docs/*").test("docs/getting-started.md")).toBe(true)
        expect(patternToRegExp("docs/*").test("docs/build-app/troubleshooting.md")).toBe(false)
    })
    it("un-owns what a rule without owners matches", () => {
        expect(owners(co, "apps/github/x.rb")).toEqual([])
        const { unowned } = ownerSets(co, ["apps/github/x.rb", "apps/other/y.rb"])
        expect(unowned).toEqual(["apps/github/x.rb"])
    })
    it("groups files by owner set and says which lines did it", () => {
        const { sets, unowned } = ownerSets(parseCodeowners("* @a\n/web/ @b @a\n/web/legacy/"), ["x.go", "web/a.ts", "web/legacy/b.ts", "y.go"])
        expect(sets.map(s => [s.key, s.files.length, s.lines])).toEqual([["@a", 2, [1]], ["@a @b", 1, [2]]])
        expect(unowned).toEqual(["web/legacy/b.ts"])
    })
    it("reads GitLab sections with default owners", () => {
        const g = parseCodeowners("[Docs] @docs-team\n/docs/\n[Backend][2] @be\n/api/ @api-owner")
        expect(owners(g, "docs/a.md")).toEqual(["@docs-team"])
        expect(owners(g, "api/x.go")).toEqual(["@api-owner"])
        expect(ownerOf(g, "docs/a.md")?.section).toBe("Docs")
    })
    it("reads Sylius's single rule", () => {
        const s = parseCodeowners("* @Sylius/key-contributors @Sylius/development-team\n")
        const { sets, unowned } = ownerSets(s, ["src/A.php", "tests/B.php"])
        expect(sets).toHaveLength(1)
        expect(sets[0].files).toHaveLength(2)
        expect(unowned).toEqual([])
    })
})
