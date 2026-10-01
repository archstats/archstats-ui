import { describe, expect, it } from "vitest"
import { checkGrounding, recite, sentencesOf } from "./grounding"
import type { Fact } from "./types"

const facts: Fact[] = [
    { id: "E1.1", kind: "total", text: "12 floors, top to bottom.", entities: [], values: { floors: 12 } },
    { id: "E1.9", kind: "row", text: "com.acme.core → com.acme.web points back up: 31 import references.", entities: ["com.acme.core", "com.acme.web"], values: { references: 31 } },
    { id: "E2.3", kind: "row", text: "com.acme.cart ↔ com.acme.checkout: 212 shared commits (38% of com.acme.cart's).", entities: ["com.acme.cart", "com.acme.checkout"], values: { shared: 212, percent: 38 } },
    { id: "E2.4", kind: "row", text: "com.acme.cart ↔ com.acme.search: 40 shared commits.", entities: ["com.acme.cart", "com.acme.search"], values: { shared: 40 } },
]

describe("checking prose against the facts it cites", () => {
    it("verifies a sentence whose numbers and names are in its cited fact", () => {
        const g = checkGrounding("The largest upward link is core → web, with 31 import references [E1.9].", facts)
        expect(g.claims[0].verdict).toBe("verified")
    })
    it("catches the right source with the wrong number", () => {
        const g = checkGrounding("core → web carries 42 import references [E1.9].", facts)
        expect(g.claims[0].verdict).toBe("unsupported")
        expect(g.claims[0].reasons[0]).toMatch(/42 is in none/)
    })
    it("catches a number cited to the wrong fact", () => {
        const g = checkGrounding("Cart and checkout share 212 commits [E2.4].", facts)
        expect(g.claims[0].verdict).toBe("unsupported")
    })
    it("catches a fact about something else", () => {
        const g = checkGrounding("checkout changes with search in 40 commits [E2.4].", facts)
        expect(g.claims[0].verdict).toBe("partial")
        expect(g.claims[0].reasons.join()).toMatch(/not about com.acme.checkout/)
    })
    it("allows shares and differences of cited numbers", () => {
        expect(checkGrounding("That is 19% of what cart shares with checkout [E2.3, E2.4].", facts).claims[0].verdict).toBe("verified")
        expect(checkGrounding("Checkout shares 172 more commits with cart than search does [E2.3, E2.4].", facts).claims[0].verdict).toBe("verified")
    })
    it("lets a whole-exhibit citation cover its facts", () => {
        expect(checkGrounding("There are 12 floors [E1].", facts).claims[0].verdict).toBe("verified")
    })
    it("flags numbers stated without a citation, and leaves plain prose alone", () => {
        const g = checkGrounding("So the stack is not the whole story. There are 57 tangled components.", facts)
        expect(g.claims.map(c => c.verdict)).toEqual(["uncited"])
    })
    it("reads list items and sentences, and skips embeds and code", () => {
        expect(sentencesOf("First point [E1.1]. Second point.\n\n- An item [E1.9]\n![Stack](exhibit:E1)\n```\nx = 99\n```")).toEqual(["First point [E1.1].", "Second point.", "An item [E1.9]"])
    })
    it("checks list items against the citation of the sentence that introduces them", () => {
        const g = checkGrounding("The pairs that change together most [E2]:\n- cart ↔ checkout: 212 shared commits\n- cart ↔ search: 41 shared commits", facts)
        expect(g.claims.map(c => c.verdict)).toEqual(["cited", "verified", "unsupported"])
    })
    it("accepts names an exhibit states as a whole (a tangle's members)", () => {
        const withMembers: Fact[] = [...facts, { id: "E3.1", kind: "total", text: "A tangle of 3 components.", entities: [], values: { components: 3 } }, { id: "E3.2", kind: "note", text: "Members: com.acme.a, com.acme.b.", entities: ["com.acme.a", "com.acme.b"], values: {} }]
        expect(checkGrounding("The tangle holds com.acme.a and com.acme.b [E3.1].", withMembers).claims[0].verdict).toBe("verified")
    })
})

describe("recite", () => {
    const rows: Fact[] = [
        { id: "E3.1", kind: "row", text: "AssignmentAction.java: 18 commits.", entities: ["AssignmentAction.java"], values: { commits: 18 } },
        { id: "E3.2", kind: "row", text: "AssignmentServiceImpl.java: 14 commits.", entities: ["AssignmentServiceImpl.java"], values: { commits: 14 } },
        { id: "E4.1", kind: "total", text: "3,441 files.", entities: [], values: { files: 3441 } },
    ]

    it("moves a citation to the one fact that holds the sentence", () => {
        const r = recite("AssignmentServiceImpl.java has 14 commits [E3.1].", rows)
        expect(r.text).toBe("AssignmentServiceImpl.java has 14 commits [E3.2].")
        expect(r.fixed).toBe(1)
        expect(checkGrounding(r.text, rows).counts.verified).toBe(1)
    })

    it("adds a citation a sentence left out", () => {
        expect(recite("The codebase has 3,441 files.", rows).text).toBe("The codebase has 3,441 files [E4.1].")
    })

    it("leaves a sentence alone when no single fact holds it", () => {
        expect(recite("It has 99 commits [E3.1].", rows).fixed).toBe(0)
    })
})

describe("what needs no fact", () => {
    const f: Fact[] = [{ id: "E7.2", kind: "row", text: "com.x.cql: 9.09.", entities: ["com.x.cql"], values: { value: 9.09 } }]
    it("takes the question's own numbers and a scale as given", () => {
        const g = checkGrounding("com.x.cql has the lowest code health (9.09 out of 10.0) among components with more than 5 dependents [E7.2].", f, { given: "Which component with more than 5 dependents has the lowest code health?" })
        expect(g.counts.verified).toBe(1)
    })
})

describe("what a number is called", () => {
    const deps: Fact[] = [{ id: "E2.2", kind: "row", text: "checkout depends on 39 components and is depended on by 87.", entities: ["oscar.apps.checkout"], values: { uses: 39, usedBy: 87 } }]
    it("fails a count put under the other direction", () => {
        const g = checkGrounding("Checkout depends on 87 components [E2.2].", deps)
        expect(g.claims[0].verdict).toBe("unsupported")
        expect(g.claims[0].reasons[0]).toBe("87 is what depends on it, not what it depends on")
        expect(checkGrounding("Checkout depends on 39 components [E2.2].", deps).claims[0].verdict).toBe("verified")
        expect(checkGrounding("87 components depend on checkout; it is used by 87 [E2.2].", deps).claims[0].verdict).toBe("verified")
    })

    it("fails production written as the total, and churn written as fixes", () => {
        const lines: Fact[] = [{ id: "E3.2", kind: "total", text: "22,193 production lines; 56,353 lines in all.", entities: [], values: { production: 22193, all: 56353 } }]
        expect(checkGrounding("It has 22,193 lines in total [E3.2].", lines).claims[0].verdict).toBe("unsupported")
        const churn: Fact[] = [{ id: "E16.1", kind: "row", text: "src/app.ts: 41 commits.", entities: ["src/app.ts"], values: { commits: 41 } }]
        expect(checkGrounding("Fix work concentrates in src/app.ts, 41 commits [E16.1].", churn).claims[0].reasons).toContain("41 counts all commits, not fixes")
    })

    it("reads a plain-word name as a name only when written as one", () => {
        const f: Fact[] = [{ id: "E1.1", kind: "row", text: "com.x.core: 12 files.", entities: ["com.x.core"], values: { files: 12 } }, { id: "E9.1", kind: "row", text: "shop/shipping: 3 files.", entities: ["shop/shipping"], values: { files: 3 } }]
        expect(checkGrounding("The core has 12 files, and it handles shipping [E1.1].", f).claims[0].verdict).toBe("verified")
        expect(checkGrounding("The core has 12 files, and `shipping` depends on it [E1.1].", f).claims[0].verdict).toBe("partial")
    })
})
