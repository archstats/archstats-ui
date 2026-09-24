import { describe, expect, it } from "vitest"
import { citedMetrics, namesIn, reportMarkdown } from "./report"

const header = { workspace: "gin", scannedAt: "2026-09-24T10:00:00Z", commit: "abc123def456", branch: "main", uncommitted: 0, appVersion: "dev", revision: 3, extensions: "git,go", roles: "production 120, test 40", ignoreGlobs: "", shallow: false, historyRange: "", anchor: "24 Sep 2026", sweeping: 4, pseudonymised: false }

describe("reportMarkdown", () => {
    it("writes the method, the pins with then and now, figures and a glossary", () => {
        const md = reportMarkdown("gin review", header, [
            { kind: "heading", title: "Coupling", note: "", pinned: {}, now: null, status: null, snapshot: "", commit: "", revision: 0, lens: "", scope: "", figureFile: null },
            { kind: "component", title: "context", note: "Everything leans on it.", pinned: { ce: 14 }, now: { ce: 3 }, status: { kind: "moved", text: "was 14, now 3" }, snapshot: "24 Sep", commit: "abc123def456", revision: 3, lens: "", scope: "", figureFile: "gin review-figures/1.png" },
        ], [{ id: "ce", name: "Efferent coupling", short: "What it depends on." }], id => (id === "ce" ? "Efferent coupling" : id))
        expect(md).toContain("- **Commit:** main `abc123def456`")
        expect(md).toContain("## Coupling")
        expect(md).toContain("| Efferent coupling | 14 | 3 |")
        expect(md).toContain("![context](gin%20review-figures/1.png)")
        expect(md).toContain("- **Efferent coupling** (`ce`): What it depends on.")
        expect(md).not.toContain("/Users/")
    })
    it("says not recorded instead of guessing", () => {
        expect(reportMarkdown("x", { ...header, commit: "", scannedAt: null, sweeping: null, shallow: null }, [], [], id => id)).toContain("- **Commit:** not recorded")
    })
})

describe("helpers", () => {
    it("collects cited metrics and finds real names in notes", () => {
        expect(citedMetrics([{ pinned: { a: 1 } }, { pinned: { a: 2, b: 3 } }])).toEqual(["a", "b"])
        expect(namesIn("Ask Jeff Fischer about this", ["Jeff Fischer", "Al"])).toEqual(["Jeff Fischer"])
    })
})
