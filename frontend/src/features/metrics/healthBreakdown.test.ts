import { describe, expect, it } from "vitest"
import { breakdownKind, deductionSummary, healthBreakdown } from "~/features/metrics/healthBreakdown"

// Revision 11: a parsed file, the worked example of the engine's decision.
const parsed = {
    name: "src/order/OrderService.java",
    codesmells__code_health: 4.5,
    codesmells__health__deduction__complex_code: 2, codesmells__health__deduction__coupling: 1.5, codesmells__health__deduction__size: 2,
    complexity__lines__complex: 75, complexity__functions__complex: 1, modularity__imports__count: 20, complexity__lines__code: 600,
}
// Revision 11: a language no pack parses, read from indentation.
const indented = {
    codesmells__code_health: 7,
    codesmells__health__deduction__deep_code: 2, codesmells__health__deduction__size: 1,
    complexity__indentation__deep: 75, complexity__lines__nonblank: 360,
}
// Revisions 2-10: size over 500 and two nesting deductions.
const legacy = {
    codesmells__code_health: 6.5, complexity__lines: 850, complexity__indentation__max: 7, complexity__indentation__avg: 2.5,
    codesmells__health__deduction__size: 3, codesmells__health__deduction__max_nesting: 0.5, codesmells__health__deduction__avg_nesting: 0,
    codesmells__health__threshold__max_nesting: 6, codesmells__health__threshold__avg_nesting: 2.5,
}

describe("healthBreakdown", () => {
    it("reads the formula the snapshot stored, not its revision number", () => {
        expect(breakdownKind(parsed)).toBe("functions")
        expect(breakdownKind(indented)).toBe("indentation")
        expect(breakdownKind(legacy)).toBe("legacy")
        expect(breakdownKind({ codesmells__code_health: 8 })).toBeNull()
    })

    it("explains a parsed file by complex code, coupling and size", () => {
        const b = healthBreakdown(parsed)!
        expect(b.rows.map(r => [r.id, r.points])).toEqual([["complex_code", 2], ["coupling", 1.5], ["size", 2]])
        expect(b.rows[0].input).toBe("75 lines in 1 function")
        expect(b.rows[1].input).toBe("20 imports")
        expect(b.expected).toBe(4.5)
        // Each deduction opens its evidence; size is the file itself.
        expect(b.rows.map(r => r.to)).toEqual(["/views/files/src/order/OrderService.java/functions", "/views/files/src/order/OrderService.java/imports", undefined])
    })

    it("explains a file read from indentation by deep code and size", () => {
        const b = healthBreakdown(indented)!
        expect(b.rows.map(r => r.id)).toEqual(["deep_code", "size"])
        expect(b.rows[1].input).toBe("360 non-blank lines")
        expect(b.expected).toBe(7)
    })

    it("keeps the old breakdown for older snapshots", () => {
        const b = healthBreakdown(legacy)!
        expect(b.rows.map(r => r.id)).toEqual(["size", "max_nesting", "avg_nesting"])
        expect(b.rows[1].threshold).toBe("over 6")
        expect(b.expected).toBe(6.5)
    })

    it("floors at 1 and says the unfloored sum", () => {
        const b = healthBreakdown({ ...parsed, codesmells__code_health: 1, codesmells__health__deduction__complex_code: 9 })!
        expect(b.unfloored).toBe(-2.5)
        expect(b.expected).toBe(1)
    })

    it("has nothing to explain without a score or a size deduction", () => {
        expect(healthBreakdown({ ...parsed, codesmells__code_health: null })).toBeNull()
        expect(healthBreakdown({ codesmells__code_health: 7, codesmells__health__deduction__deep_code: 1 })).toBeNull()
    })

    it("sums the deductions in one line for a tooltip", () => {
        expect(deductionSummary(parsed)).toBe("10 − 2 (complex code) − 1.5 (coupling) − 2 (size)")
        expect(deductionSummary(legacy)).toBe("10 − 3 (size) − 0.5 (deepest nesting) − 0 (average nesting)")
        expect(deductionSummary({})).toBeNull()
    })
})
