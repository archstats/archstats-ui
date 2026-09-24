import { describe, expect, it } from "vitest"
import { exportFileName, toCsv, toMarkdownTable } from "./export"

const cols = [{ id: "name", label: "Name" }, { id: "complexity__lines", label: "Lines" }]

describe("toCsv", () => {
    it("heads with metric ids after a # preamble", () => {
        const csv = toCsv(cols, [{ name: "a", complexity__lines: 12 }], [["workspace", "gin"], ["commit", "main\nabc"]])
        expect(csv).toBe("# workspace: gin\n# commit: main abc\nname,complexity__lines\na,12\n")
    })
    it("quotes commas, quotes and newlines", () => {
        const csv = toCsv(cols, [{ name: 'say "hi", then\nbye', complexity__lines: null }])
        expect(csv.split("\n").slice(1).join("\n")).toBe('"say ""hi"", then\nbye",\n')
    })
})

describe("toMarkdownTable", () => {
    it("right-aligns numeric columns and groups thousands", () => {
        const md = toMarkdownTable(cols, [{ name: "a|b", complexity__lines: 1234.567 }], "gin · r2")
        expect(md).toBe("| Name | Lines |\n| --- | ---: |\n| a\\|b | 1,234.57 |\n\n_gin · r2_\n")
    })
    it("keeps a column with text as text", () => {
        const md = toMarkdownTable(cols, [{ name: "a", complexity__lines: "n/a" }, { name: "b", complexity__lines: 3 }])
        expect(md).toContain("| --- | --- |")
    })
})

describe("exportFileName", () => {
    it("slugs and dates", () => {
        expect(exportFileName("Metrics: components / Sylius", "csv", new Date("2026-09-24T10:00:00Z"))).toBe("metrics-components-sylius-2026-09-24.csv")
    })
})
