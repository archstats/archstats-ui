import { describe, expect, it } from "vitest"
import { describeChange, exportMarkdown, pdfBlocks, runCell, tableSql, type RunContext } from "./reportCells"
import type { Block, Cell } from "./reportDoc"

const spec = { type: "table" as const, source: "files" as const, columns: ["complexity__lines", "codesmells__code_health", "missing"], sort: "codesmells__code_health", desc: false, limit: 5 }

describe("report cells", () => {
    it("writes table SQL against the columns there are, reading legacy zero health as none", () => {
        const has = (c: string) => c !== "missing"
        expect(tableSql(spec, has, 3)).toBe(`SELECT name, "complexity__lines" AS "complexity__lines", "codesmells__code_health" AS "codesmells__code_health" FROM files WHERE "codesmells__code_health" IS NOT NULL ORDER BY "codesmells__code_health" ASC NULLS LAST, name LIMIT 5`)
        expect(tableSql(spec, has, 1)).toContain(`NULLIF("codesmells__code_health", 0)`)
    })

    it("runs a table cell and says what moved on the next run", async () => {
        let rows = [{ name: "a.go", complexity__lines: 10, codesmells__code_health: 3 }, { name: "b.go", complexity__lines: 5, codesmells__code_health: 4 }]
        const ctx: RunContext = {
            scan: { id: "s1", label: "22 Sep 2026", headCommit: "abcdef123", revision: 3 },
            query: async sql => (sql.startsWith("SELECT count") ? [{ n: 40 }] : rows),
            console: async () => ({ columns: [], rows: [], truncated: false }),
            columns: async () => new Set(["complexity__lines", "codesmells__code_health"]),
            pin: () => null,
            label: id => id.split("__").pop()!,
            context: () => ({ lens: "Domain" }),
            readings: { query: async () => [], revision: 3, label: id => id, aliases: {} },
        }
        const cell: Cell = { spec, title: "", caption: "", output: null, ranOn: null }
        const first = await runCell(cell, ctx)
        expect(first.output?.table?.columns.map(c => c.label)).toEqual(["Name", "lines", "code_health"])
        expect(first.output?.table?.total).toBe(40)
        expect(first.ranOn).toMatchObject({ scanId: "s1", commit: "abcdef123", lens: "Domain" })
        rows = [{ name: "a.go", complexity__lines: 12, codesmells__code_health: 3 }, { name: "c.go", complexity__lines: 1, codesmells__code_health: 2 }]
        const second = await runCell(first, ctx)
        expect(describeChange(second.previous, second.output)).toBe("Since the last run: 1 new, 1 gone, 1 changed.")
    })

    it("exports numbered cells to Markdown and to the PDF's blocks", () => {
        const cell: Cell = { spec, title: "Unhealthy files", caption: "Lowest first.", ranOn: { scanId: "s", label: "22 Sep", commit: "abc1234", revision: 3, at: "" }, output: { table: { columns: [{ id: "name", label: "Name", numeric: false }, { id: "x", label: "Lines", numeric: true }], rows: [{ name: "a|b", x: 1204 }], total: 1 } } }
        const blocks: Block[] = [
            { id: "1", kind: "h1", text: "Audit" },
            { id: "2", kind: "ul", text: "one **bold**" },
            { id: "3", kind: "ul", text: "two" },
            { id: "c", kind: "cell", cell },
        ]
        const md = exportMarkdown("R", ["W"], blocks, { workspace: "W", label: x => x, figureFile: () => null })
        expect(md).toContain("- one **bold**\n- two")
        expect(md).toContain("**Table 1. Unhealthy files**")
        expect(md).toContain("| a\\|b | 1,204 |")
        expect(md).toContain("<sub>W · snapshot 22 Sep · abc1234 · analysis r3</sub>")
        const pdf = pdfBlocks(blocks, { workspace: "W", label: x => x, figure: () => null })
        expect(pdf.map(b => b.kind)).toEqual(["h1", "ul", "table"])
        expect(pdf[1].items).toHaveLength(2)
        expect(pdf[2]).toMatchObject({ title: "Table 1. Unhealthy files", caption: "Lowest first.", table: { align: ["", "r"], rows: [["a|b", "1,204"]] } })
    })
})

describe("pseudonym guard", () => {
    it("finds real names in a report's text", async () => {
        const { namesIn } = await import("./reportCells")
        expect(namesIn("Ask Jeff Fischer about this", ["Jeff Fischer", "Al"])).toEqual(["Jeff Fischer"])
    })
})
