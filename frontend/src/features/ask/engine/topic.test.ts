import { describe, expect, it } from "vitest"
import { askedMeasures, subjectMismatch, topicMismatch } from "./topic"

const ranking = (id: string, measure: string) => ({ id, spec: { kind: "ranking", params: { measure } } })

describe("topicMismatch", () => {
    it("catches instability answered from a ranking of dependents", () => {
        const m = topicMismatch("Which components are the most unstable?", "core.util is the most stable, 48 dependents [E2.3].", [ranking("E2", "most depended on")])
        expect(m).toEqual({ asked: "instability", ranked: "dependents (fan-in)", cites: "E2" })
    })

    it("accepts an answer that cites a ranking of what was asked", () => {
        expect(topicMismatch("most unstable?", "x [E2.1] and y [E3.1]", [ranking("E2", "most depended on"), ranking("E3", "instability")])).toBeNull()
    })

    it("says nothing when the question names no measure or the answer cites no ranking", () => {
        expect(topicMismatch("Where are the tangles?", "[E1]", [ranking("E1", "dependents")])).toBeNull()
        expect(topicMismatch("most unstable?", "No ranking cited.", [ranking("E1", "dependents")])).toBeNull()
    })

    it("reads the words people use", () => {
        expect(askedMeasures("What is the least healthy file?")).toEqual(["codesmells__code_health"])
        expect(askedMeasures("which package is most depended on")).toEqual(["modularity__coupling__dependents"])
        expect(askedMeasures("Which files carry the first cut?")).toEqual([])
    })
})

describe("subjectMismatch", () => {
    const stack = { id: "E4", spec: { kind: "stack", params: {} } }
    it("catches a layering question answered without the layering figure it drew", () => {
        expect(subjectMismatch("Confirm that the code is cleanly layered.", "The most unstable are x [E1.2].", [stack])).toEqual({ asked: "layering", cites: "E4" })
        expect(subjectMismatch("Confirm that the code is cleanly layered.", "7 links point back up [E4.13].", [stack])).toBeNull()
        expect(subjectMismatch("Which are the most unstable?", "x [E1.2]", [stack])).toBeNull()
    })
})
