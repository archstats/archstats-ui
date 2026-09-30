import { describe, expect, it } from "vitest"
import { answerBlocks, checkBlocks } from "./toReport"
import { fromMarkdown } from "~/features/reports/reportDoc"

describe("an answer into a report", () => {
    const answer = "It has 12 cycles [E1.1]. Coverage is 80%."
    const grounding = { claims: [{ sentence: "It has 12 cycles [E1.1].", cites: ["E1.1"], verdict: "verified" as const, reasons: [] }, { sentence: "Coverage is 80%.", cites: [], verdict: "uncited" as const, reasons: ["states 80% without citing a fact"] }], counts: { verified: 1, cited: 0, partial: 0, unsupported: 0, uncited: 1 } }

    it("keeps a mark on the sentence its facts did not back", () => {
        const text = answerBlocks(answer, [], fromMarkdown, ["Coverage is 80%."]).map(b => (b as any).text).join("\n")
        expect(text).toContain("Coverage is 80%. *(check: not backed by the facts it cited)*")
        expect(text).not.toContain("[E1.1]")
    })

    it("lists what to check under the answer", () => {
        const [quote] = checkBlocks(grounding, ["E9"])
        expect(quote.kind).toBe("quote")
        expect((quote as any).text).toMatch(/Coverage is 80%\. \(uncited: states 80% without citing a fact\)/)
        expect((quote as any).text).toMatch(/cited E9, which Ask never showed/)
    })
})
