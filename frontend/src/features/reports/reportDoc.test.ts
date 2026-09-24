import { describe, expect, it } from "vitest"
import { fromMarkdown, inlineHtml, inlineRuns, shortcutFor, tableCells, toMarkdown, type Block, type Cell } from "./reportDoc"

const strip = (bs: Block[]) => bs.map(b => ({ ...b, id: undefined }))

describe("report markdown", () => {
    it("round-trips prose and cells, cells keeping their output by id", () => {
        const cell: Cell = { spec: { type: "sql", sql: "SELECT 1", limit: 50 }, title: "One", caption: "It is one.", output: { table: { columns: [], rows: [], total: 0 } }, ranOn: null }
        const blocks: Block[] = [
            { id: "a", kind: "h1", text: "Audit" },
            { id: "b", kind: "p", text: "Some **bold** text\nsoft break." },
            { id: "c", kind: "ul", text: "one" },
            { id: "d", kind: "ul", text: "two" },
            { id: "e", kind: "ol", text: "first" },
            { id: "f", kind: "ol", text: "second" },
            { id: "g", kind: "quote", text: "quoted\nlines" },
            { id: "h", kind: "code", text: "x = 1", lang: "py" },
            { id: "i", kind: "hr", text: "" },
            { id: "cell1", kind: "cell", cell },
            { id: "j", kind: "table", text: "| a | b |\n| --- | --- |\n| 1 | 2 |" },
        ]
        const md = toMarkdown(blocks)
        expect(md).toContain("- one\n- two")
        expect(md).toContain("1. first\n2. second")
        const back = fromMarkdown(md, new Map([["cell1", cell]]))
        expect(strip(back.filter(b => b.kind !== "cell"))).toEqual(strip(blocks.filter(b => b.kind !== "cell")))
        const c = back.find(b => b.kind === "cell") as any
        expect(c.id).toBe("cell1")
        expect(c.cell.output).toEqual(cell.output)
    })
    it("drops a stale output when the spec was edited in the raw view", () => {
        const cell: Cell = { spec: { type: "sql", sql: "SELECT 1", limit: 50 }, title: "", caption: "", output: { error: "x" }, ranOn: null }
        const md = toMarkdown([{ id: "c", kind: "cell", cell }]).replace("SELECT 1", "SELECT 2")
        const back = fromMarkdown(md, new Map([["c", cell]])) as any
        expect(back[0].cell.output).toBeNull()
    })
    it("turns typed prefixes into blocks, as Typora does", () => {
        expect(shortcutFor("## Title")).toEqual({ kind: "h2", text: "Title" })
        expect(shortcutFor("- item")).toEqual({ kind: "ul", text: "item" })
        expect(shortcutFor("1. item")).toEqual({ kind: "ol", text: "item" })
        expect(shortcutFor("> said")).toEqual({ kind: "quote", text: "said" })
        expect(shortcutFor("```sql")).toEqual({ kind: "code", text: "", lang: "sql" })
        expect(shortcutFor("---")).toEqual({ kind: "hr", text: "" })
        expect(shortcutFor("#hashtag")).toBeNull()
    })
})

describe("inline markdown", () => {
    it("reads code, bold, italic, strike and links, nesting included", () => {
        expect(inlineRuns("a **b *c*** `d` ~~e~~ [f](https://x.y)")).toEqual([
            { text: "a " }, { text: "b ", bold: true }, { text: "c", bold: true, italic: true }, { text: " " },
            { text: "d", code: true }, { text: " " }, { text: "e", strike: true }, { text: " " }, { text: "f", link: "https://x.y" },
        ])
    })
    it("leaves snake_case and unclosed markers alone", () => {
        expect(inlineRuns("git__commits__total and *open")).toEqual([{ text: "git__commits__total and *open" }])
    })
    it("escapes HTML and refuses unsafe links", () => {
        expect(inlineHtml("<script>x</script> [y](javascript:alert(1))")).toBe("&lt;script&gt;x&lt;/script&gt; y")
        expect(inlineHtml("[c](/views/components/a)")).toContain('href="#/views/components/a"')
    })
    it("reads a markdown table", () => {
        expect(tableCells("| a | b |\n|---|:-:|\n| 1 | 2 |")).toEqual([["a", "b"], ["1", "2"]])
    })
})
