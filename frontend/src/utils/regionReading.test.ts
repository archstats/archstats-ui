import { describe, expect, it } from "vitest"
import { describeReading, readReferences } from "./regionReading"
import type { Reference } from "./findings"

function ref(from: string, to: string, weight = 1, back?: number): Reference {
    return { from, to, weight, back }
}
const nameOf = (p: string) => p.replace(/\.\w+$/, "")

/** Four services reaching into a shared repository, plus odds and ends. */
const services: Reference[] = [
    ref("A.java", "Shared.java"), ref("B.java", "Shared.java"),
    ref("C.java", "Shared.java"), ref("D.java", "Shared.java"),
    ref("A.java", "Other.java"), ref("A.java", "Third.java"),
]

describe("readReferences", () => {
    it("counts distinct modules on each side, not references", () => {
        const r = readReferences(services)
        expect(r.total).toBe(6)
        expect(r.sources).toBe(4)
        expect(r.targets).toBe(3)
    })

    it("finds the module everything in the region leans on", () => {
        // This is the fact that was on screen and invisible: one repository
        // appearing in dozens of otherwise identical rows.
        const top = readReferences(services).mostDependedOn[0]
        expect(top.path).toBe("Shared.java")
        expect(top.count).toBe(4)
    })

    it("does not call something depended on when only one module imports it", () => {
        expect(readReferences([ref("A.java", "B.java")]).mostDependedOn).toEqual([])
    })

    it("ranks by distinct importers rather than by reference weight", () => {
        // A chatty pair with nine unit references is still one dependency.
        const r = readReferences([
            ref("A.java", "Chatty.java", 9),
            ref("A.java", "Central.java"), ref("B.java", "Central.java"),
        ])
        expect(r.mostDependedOn[0].path).toBe("Central.java")
    })

    it("reports what a typical importer pulls in", () => {
        expect(readReferences(services).typical).toBe(1)
    })

    it("names the importers that reach further than the typical one", () => {
        expect(readReferences(services).heavy.map((h) => h.path)).toEqual(["A.java"])
    })

    it("calls nothing heavy when every module imports the same amount", () => {
        // A codebase where everything imports eight things has no outlier at
        // eight, so the bar has to move with the distribution.
        const flat = ["A", "B", "C"].flatMap((s) =>
            ["X", "Y", "Z"].map((t) => ref(`${s}.java`, `${t}.java`)))
        expect(readReferences(flat).heavy).toEqual([])
    })

    it("collects each mutual pair once, whichever way round it was seen", () => {
        const r = readReferences([ref("A.java", "B.java", 1, 2), ref("B.java", "A.java", 2, 1)])
        expect(r.cycles).toHaveLength(1)
    })

    it("has nothing to say about an empty region", () => {
        const r = readReferences([])
        expect(r).toMatchObject({ total: 0, sources: 0, targets: 0, typical: 0 })
        expect(r.mostDependedOn).toEqual([])
    })
})

describe("describeReading", () => {
    it("states the shape rather than the raw total", () => {
        expect(describeReading(readReferences(services), nameOf)[0])
            .toBe("6 references, from 4 modules into 3.")
    })

    it("names what the region leans on", () => {
        expect(describeReading(readReferences(services), nameOf).join(" "))
            .toContain("Shared alone is imported by 4 of them.")
    })

    it("says plainly when nothing stands out", () => {
        const flat = ["A", "B", "C"].flatMap((s) =>
            ["X", "Y", "Z"].map((t) => ref(`${s}.java`, `${t}.java`)))
        expect(describeReading(readReferences(flat), nameOf).join(" ")).toContain("none stands out")
    })

    it("mentions cycles when the region holds any", () => {
        const lines = describeReading(
            readReferences([...services, ref("Shared.java", "A.java", 1, 1)]), nameOf)
        expect(lines.join(" ")).toMatch(/pairs? here imports? each other|One pair here/)
    })

    it("says nothing at all about an empty region", () => {
        expect(describeReading(readReferences([]), nameOf)).toEqual([])
    })
})
