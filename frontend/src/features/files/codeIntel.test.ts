import { describe, expect, it } from "vitest"
import { boundaryOf, buildIntel, linkLine, namingLine, resolveAt, simpleName, type CallRow, type IntelFacts, type UnitRow } from "~/features/files/codeIntel"
import { splitHighlighted } from "~/features/files/highlightLines"

const unit = (id: string, extra: Partial<UnitRow> = {}): UnitRow => ({
    id, name: simpleName(id), kind: "type", file: `src/${simpleName(id)}.java`, line: 3, signature: null, component: "app.api", module: "core", used_by: 0, ...extra,
})
const call = (line: number, to_unit: string, to_function: string, via: string, extra: Partial<CallRow> = {}): CallRow => ({
    line, to_unit, to_function, via, file: `src/${simpleName(to_unit)}.java`, def_line: 10, def_end: 20, unit_line: 1,
    component: "app.service", module: "core", signature: null, unit_kind: "type", ...extra,
})

const lines = [
    "package app.api;",                                            // 1
    "",                                                            // 2
    "@Path(\"/loans\")",                                           // 3
    "public class LoansApi {",                                     // 4
    "    private final LoanService loans; // LoanService here",   // 5
    "    public String all() {",                                   // 6
    "        return loans.retrieveAll(\"x\");",                    // 7
    "    }",                                                       // 8
    "}",                                                           // 9
]

const facts: IntelFacts = {
    file: "src/LoansApi.java", component: "app.api", module: "core", lines,
    ownUnits: [unit("app.api.LoansApi", { file: "src/LoansApi.java", used_by: 4 })],
    ownFunctions: [{ name: "LoansApi.all", begin: 6, end: 8, signature: "public String all()", usages: 2 }],
    referenced: [
        unit("app.service.LoanService", { component: "app.service" }),
        unit("other.LoanService", { component: "other" }),
        unit("app.service.Money", { component: "app.service", module: "money" }),
    ],
    calls: [
        call(7, "app.service.LoanServiceImpl", "LoanServiceImpl.retrieveAll", "implementation"),
        call(7, "app.service.LoanService", "LoanService.retrieveAll", "field"),
        call(7, "app.service.Gone", "Gone.missing", "field"),
    ],
    implementations: [{ unit: "app.api.LoansApi", n: 1 }],
    marks: [{ kind: "entry", line: 6, data: { method: "GET", path: "/loans" } }],
}

describe("splitHighlighted", () => {
    it("closes a span at the end of a line and opens it again on the next", () => {
        const html = `a<span class="hljs-comment">/* one\ntwo */</span>b\nc`
        expect(splitHighlighted(html)).toEqual([
            `a<span class="hljs-comment">/* one</span>`,
            `<span class="hljs-comment">two */</span>b`,
            `c`,
        ])
    })
})

describe("buildIntel", () => {
    const intel = buildIntel(facts)

    it("links a call to the interface it names and offers the implementation", () => {
        const hit = resolveAt(intel, 7, "retrieveAll")!
        expect(hit.target.fn).toBe("LoanService.retrieveAll")
        expect(hit.target.alternatives.map(a => a.fn)).toEqual(["LoanServiceImpl.retrieveAll"])
        expect(hit.target.end).toBe(20)
    })

    it("leaves a call plain when its name is not on the line", () => {
        expect(resolveAt(intel, 7, "missing")).toBeNull()
    })

    it("drops a type name two units share rather than guess", () => {
        expect(intel.types.has("LoanService")).toBe(false)
        expect(intel.types.get("Money")?.unit).toBe("app.service.Money")
    })

    it("puts declarations on the line that names them, not the annotation", () => {
        expect(namingLine(lines, 3, "LoansApi")).toBe(4)
        expect(intel.declarations.get(4)?.target.unit).toBe("app.api.LoansApi")
        expect(intel.declarations.get(4)?.implementations).toBe(1)
        expect(intel.declarations.get(6)?.target.fn).toBe("LoansApi.all")
        expect(resolveAt(intel, 6, "all")?.declaration).toBe(true)
    })

    it("files marks by line", () => {
        expect(intel.marks.get(6)?.[0].data.path).toBe("/loans")
    })

    it("tells a crossing from a stay at home, and a forbidden one from both", () => {
        const money = intel.types.get("Money")!
        expect(boundaryOf(intel, money)).toBe("module")
        expect(boundaryOf(intel, resolveAt(intel, 7, "retrieveAll")!.target)).toBe("component")
        expect(boundaryOf(intel, money, f => (f === "src/Money.java" ? "Layers" : null))).toBe("forbidden")
        expect(boundaryOf(intel, intel.declarations.get(4)!.target)).toBe("same")
    })
})

describe("linkLine", () => {
    const intel = buildIntel(facts)

    it("wraps resolved identifiers and leaves comments and strings alone", () => {
        const html = `        <span class="hljs-keyword">return</span> loans.retrieveAll(<span class="hljs-string">"retrieveAll"</span>);`
        const out = linkLine(html, 7, intel)
        expect(out.match(/data-ref/g)?.length).toBe(1)
        expect(out).toContain(`<span class="ref ref-component ref-fn" data-ref="fn:app.service.LoanService#LoanService.retrieveAll">retrieveAll</span>(`)
        const comment = `<span class="hljs-comment">// Money</span> Money`
        expect(linkLine(comment, 5, intel).match(/data-ref/g)?.length).toBe(1)
    })

    it("does not break HTML entities", () => {
        expect(linkLine("a &amp;&amp; Money &lt; b", 5, intel)).toContain("&amp;&amp; <span")
    })
})
