import { describe, expect, it } from "vitest"
import { describeChange, displayTable, EMPTY_TABLE, sharedParent, errorSentence, exportMarkdown, pdfBlocks, runCell, scopeNote, tableSql, type RunContext } from "./reportCells"
import { proseName, proseNames, type Block, type Cell } from "./reportDoc"
import { plainName, roleOf } from "./readings"

const spec = { type: "table" as const, source: "files" as const, columns: ["complexity__lines", "codesmells__code_health", "missing"], sort: "codesmells__code_health", desc: false, limit: 5 }

describe("report cells", () => {
    it("writes table SQL against the columns there are, reading legacy zero health as none", () => {
        const has = (c: string) => c !== "missing"
        expect(tableSql(spec, has, 3)).toBe(`SELECT name, "complexity__lines" AS "complexity__lines", "codesmells__code_health" AS "codesmells__code_health" FROM files WHERE "codesmells__code_health" IS NOT NULL ORDER BY "codesmells__code_health" ASC NULLS LAST, name LIMIT 5`)
        expect(tableSql(spec, has, 1)).toContain(`NULLIF("codesmells__code_health", 0)`)
    })

    it("keeps a production table to production code, and says so", () => {
        const has = (c: string) => c !== "missing"
        const files = { ...spec, scope: "production" }
        expect(tableSql(files, has, 3, true)).toContain(`WHERE role = 'production' AND "codesmells__code_health" IS NOT NULL`)
        expect(tableSql({ ...files, source: "components" as const }, has, 3, true)).toContain(`name IN (SELECT component FROM files WHERE role = 'production')`)
        expect(tableSql(files, has, 3, false)).toContain(`name GLOB '*_test.go'`)
        expect(scopeNote(files, false)).toMatch(/recognised by their path/)
        expect(scopeNote(files, true)).toMatch(/^Production files only/)
        expect(scopeNote(spec, true)).toBeUndefined()
    })

    it("recognises test files by path on a scan without roles", () => {
        expect(roleOf("gin/context_test.go")).toBe("test")
        expect(roleOf("src/test/java/a/FooTest.java")).toBe("test")
        expect(roleOf("web/src/app.spec.ts")).toBe("test")
        expect(roleOf("tests/test_models.py")).toBe("test")
        expect(roleOf("gin/context.go")).toBe("production")
        expect(roleOf("web/vendor/jquery/jquery.js")).toBe("third_party")
        expect(roleOf("src/attestation.go")).toBe("production")
        expect(roleOf("gin/context_test.go", "production")).toBe("production")
    })

    it("shortens long names in prose, keeping two in one sentence apart", () => {
        expect(proseName("src/Sylius/Bundle/AdminBundle/Resources/assets/controllers")).toBe("assets/controllers")
        expect(proseName("internal/fs")).toBe("internal/fs")
        expect(proseNames(["Sylius\\Bundle\\CoreBundle\\Doctrine\\ORM", "Sylius\\Bundle\\ProductBundle\\Doctrine\\ORM"])).toEqual(["CoreBundle\\Doctrine\\ORM", "ProductBundle\\Doctrine\\ORM"])
    })

    it("gives leadership plain names", () => {
        expect(plainName("org.apache.fineract.portfolio.loanaccount")).toBe("portfolio loanaccount")
        expect(plainName("internal/fs")).toBe("internal/fs")
        expect(plainName("(root)")).toBe("(root)")
    })

    it("says a table matched nothing instead of printing its headers alone", () => {
        const empty = { id: "e", kind: "cell", cell: { spec: { type: "sql", sql: "SELECT 1", limit: 5 }, title: "Tagged structs", caption: "", output: { table: { columns: [{ id: "struct", label: "Struct", numeric: false }], rows: [], total: 0 } }, ranOn: null } } as unknown as Block
        const pdf = pdfBlocks([empty], { workspace: "w", label: x => x, figure: () => null })
        expect(pdf).toEqual([{ kind: "p", runs: [{ text: "Table 1. Tagged structs", bold: true }, { text: ` ${EMPTY_TABLE}` }] }])
        expect(exportMarkdown("R", [], [empty], { workspace: "w", label: x => x, figureFile: () => null })).toContain(EMPTY_TABLE)
    })

    it("says a timeout in words", () => {
        expect(errorSentence("stopped after 30s")).toMatch(/^This query took too long on this snapshot and was stopped after 30 seconds\./)
        expect(errorSentence("no such column: x")).toBe("no such column: x")
    })

    it("counts instability from the dependents and dependencies beside it", () => {
        const sql = tableSql({ type: "table", source: "components", columns: ["modularity__coupling__dependents", "modularity__coupling__dependencies", "modularity__instability"], sort: "modularity__coupling__dependents", desc: true, limit: 5 }, () => true, 4)
        expect(sql).toContain(`round(1.0 * coalesce("modularity__coupling__dependencies", 0) / nullif(coalesce("modularity__coupling__dependents", 0) + coalesce("modularity__coupling__dependencies", 0), 0), 3) AS "modularity__instability"`)
    })

    it("says a parent every name shares once, in the header", () => {
        expect(sharedParent(["org.broadleafcommerce.core.catalog.domain", "org.broadleafcommerce.core.offer.domain", "org.broadleafcommerce.profile.core.domain"])).toBe("org.broadleafcommerce.")
        expect(sharedParent(["src/Sylius/Bundle/CoreBundle", "src/Sylius/Bundle/AdminBundle"])).toBe("src/Sylius/Bundle/")
        expect(sharedParent(["app/store", "app/query"])).toBe("")
        expect(sharedParent(["org.a.b", "com.a.b"])).toBe("")
        expect(sharedParent(["(root) -> binding", "(root) -> render"])).toBe("")
        expect(sharedParent(["org.example.core", "org.example.core.sub"])).toBe("org.example.")
        const cell = { id: "c", spec, output: { table: { columns: [{ id: "package", label: "Package", numeric: false }, { id: "n", label: "Entities", numeric: true }], rows: [{ package: "org.broadleafcommerce.core.catalog.domain", n: 23 }, { package: "org.broadleafcommerce.core.offer.domain", n: 20 }], total: 2 } } } as unknown as Cell
        const t = displayTable(cell, c => c)!
        expect(t.columns).toEqual(["Package (all in org.broadleafcommerce.core)", "Entities"])
        expect(t.rows).toEqual([["catalog.domain", "23"], ["offer.domain", "20"]])
        expect(t.full![0][0]).toBe("org.broadleafcommerce.core.catalog.domain")
    })

    it("names the root folder's component (root)", () => {
        const cell = { id: "c", spec, output: { table: { columns: [{ id: "name", label: "Name", numeric: false }], rows: [{ name: "." }, { name: "gin/render" }, { name: ". -> binding -> render" }, { name: "ProductDaoImpl,OrderDaoImpl" }, { name: 1204 }], total: 5 } } } as unknown as Cell
        expect(displayTable(cell, c => c)!.rows).toEqual([["(root)"], ["gin/render"], ["(root) -> binding -> render"], ["ProductDaoImpl, OrderDaoImpl"], ["1,204"]])
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
        expect(md).toContain("<sub>W · snapshot 22 Sep · commit abc1234 · analysis r3</sub>")
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
