import { describe, expect, it } from "vitest"
import type { Grounding } from "~/features/exhibits/grounding"
import { answerVerdict, brokenCitations, checkWords, trustedText } from "./verdict"

const g = (claims: Array<[string, Grounding["claims"][number]["verdict"]]>): Grounding => {
    const counts = { verified: 0, cited: 0, partial: 0, unsupported: 0, uncited: 0 }
    for (const [, v] of claims) counts[v]++
    return { claims: claims.map(([sentence, verdict]) => ({ sentence, cites: [], verdict, reasons: verdict === "verified" ? [] : ["why"] })), counts }
}

describe("answerVerdict", () => {
    it("says all claims check out when they do", () => {
        const v = answerVerdict(g([["a", "verified"], ["b", "verified"], ["c", "cited"]]))
        expect(v.level).toBe("good")
        expect(v.headline).toBe("All 3 claims check out against their facts")
        expect(v.flagged).toEqual([])
    })

    it("is bad on an unsupported claim or a citation to nothing, and lists them first", () => {
        const v = answerVerdict(g([["a", "verified"], ["b", "uncited"], ["c", "unsupported"]]))
        expect(v.level).toBe("bad")
        expect(v.headline).toBe("1 of 3 claims check out against their facts")
        expect(v.problems).toEqual(["1 unsupported", "1 uncited"])
        expect(v.flagged.map(x => x.sentence)).toEqual(["c", "b"])
        expect(answerVerdict(g([["a", "verified"]]), { broken: ["E3"] }).level).toBe("bad")
    })

    it("warns on uncited or partly supported claims and on failed checks", () => {
        expect(answerVerdict(g([["a", "verified"], ["b", "partial"]])).level).toBe("warn")
        expect(answerVerdict(g([["a", "verified"]]), { failedChecks: ["No source for 30"] }).level).toBe("warn")
    })

    it("says so first when the answer rests on another measure than the one asked", () => {
        const v = answerVerdict(g([["a", "verified"]]), { wrongTopic: "Asked about instability; the answer rests on a ranking by dependents (fan-in)" })
        expect(v.level).toBe("bad")
        expect(v.headline).toBe("The numbers are right, but they answer a different question")
        expect(v.problems[0]).toMatch(/^Asked about instability/)
    })

    it("says what was left out when the unbacked sentences are folded away", () => {
        const v = answerVerdict(g([["a", "verified"], ["b", "verified"], ["c", "uncited"]]), { folded: true })
        expect(v.level).toBe("warn")
        expect(v.headline).toBe("All 2 claims shown check out against their facts")
        expect(v.problems[0]).toBe("1 statement left out: not backed by its facts")
    })

    it("stays out of the way when there is nothing to check", () => {
        expect(answerVerdict(g([])).level).toBe("none")
        expect(answerVerdict(null).level).toBe("none")
    })
})

describe("brokenCitations", () => {
    it("finds ids the conversation does not hold", () => {
        expect(brokenCitations("Two tangles [E1.2, E3]. More [E1].", new Set(["E1", "E1.2"]))).toEqual(["E3"])
    })
})

describe("trustedText", () => {
    it("leaves out what the facts do not bear out, and the sentence that leaned on it", () => {
        const answer = "It has 12 cycles [E1.1]. Coverage is 80%. It is fine."
        expect(trustedText(answer, g([["It has 12 cycles [E1.1].", "verified"], ["Coverage is 80%.", "uncited"]]))).toBe("It has 12 cycles [E1.1].")
    })
})

describe("checkWords", () => {
    it("says a failed check in the reader's words", () => {
        expect(checkWords({ id: "gave-up", detail: "Said it could not answer after 0 tool calls; the catalogue says: …" })).toBe("Said it could not answer without looking it up")
        expect(checkWords({ id: "uncited", detail: "Cites ids no tool returned: E7.14, E7.45" })).toBe("Cites E7.14, E7.45, which Ask never showed")
    })
})

describe("what leaned on a left-out sentence", () => {
    const one = (sentence: string) => ({ claims: [{ sentence, cites: [], verdict: "unsupported" as const, reasons: ["x"] }], counts: { verified: 0, cited: 0, partial: 0, unsupported: 1, uncited: 0 } })
    it("goes with it", () => {
        expect(trustedText("Ryan wrote 97% of commits. They know all 49 components. The tangle has 29.", one("Ryan wrote 97% of commits."))).toBe("The tangle has 29.")
        expect(trustedText("Intro.\n\nThe key risks:\n\n- Risk is 12 [E1].\n\nNext part.", one("Risk is 12 [E1]."))).toBe("Intro.\n\nNext part.")
    })
})
