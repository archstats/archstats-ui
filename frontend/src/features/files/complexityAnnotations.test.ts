import { describe, expect, it } from "vitest"
import { annotateLines } from "~/features/files/complexityAnnotations"

describe("annotateLines", () => {
    const annotations = {
        functions: [{ name: "Cart.total", begin: 2, end: 5, cognitive: 18 }],
        steps: [{ line: 3, points: 1, construct: "for", nesting: 0 }, { line: 4, points: 2, construct: "if", nesting: 1 }, { line: 4, points: 1, construct: "&&", nesting: 2 }],
    }

    it("puts each step on its line, inside the band of its function", () => {
        const lines = annotateLines(6, annotations)
        expect(lines.map(l => l.fn?.name ?? null)).toEqual([null, "Cart.total", "Cart.total", "Cart.total", "Cart.total", null])
        expect(lines.map(l => l.first)).toEqual([false, true, false, false, false, false])
        expect(lines[3].steps.map(s => `+${s.points} ${s.construct}`)).toEqual(["+2 if", "+1 &&"])
    })

    it("draws nothing without annotations, and ignores lines past the end", () => {
        expect(annotateLines(3, null).every(l => !l.fn && !l.steps.length)).toBe(true)
        expect(annotateLines(3, { functions: [{ name: "f", begin: 2, end: 9, cognitive: 20 }], steps: [{ line: 9, points: 1, construct: "if", nesting: 0 }] }).length).toBe(3)
    })
})
