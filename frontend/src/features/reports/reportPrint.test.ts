import { describe, expect, it } from "vitest"
import { printHtml } from "./reportPrint"

describe("printHtml", () => {
    const html = printHtml({
        title: "Spring <review>",
        meta: ["BroadleafCommerce · snapshot"],
        blocks: [
            { kind: "h2", runs: [{ text: "The roles" }] },
            { kind: "p", runs: [{ text: "A " }, { text: "service", code: true }, { text: " holds " }, { text: "logic", bold: true }] },
            { kind: "p", runs: [{ text: "Terms." }], tone: "soft" },
            { kind: "ol", items: [[{ text: "one" }], [{ text: "two" }]], start: 3 },
            { kind: "table", table: { columns: ["Package (all in org.example)", "Lines"], align: ["", "r"], rows: [["core.dao", "12"]] }, title: "Table 1. Packages", caption: "", provenance: "ws · snapshot" },
            { kind: "table", table: { columns: ["a", "b"], align: ["", ""], rows: [["1", "2"]] } },
        ],
    })

    it("sets prose, headings and lists in the editor's classes", () => {
        expect(html).toContain(`<h2 class="nb-h2">The roles</h2>`)
        expect(html).toContain(`<p class="nb-p doc-prose">A <code>service</code> holds <strong>logic</strong></p>`)
        expect(html).toContain(`class="nb-p doc-prose nb-explain"`)
        expect(html).toContain(`<span class="nb-marker">4.</span>two`)
    })

    it("escapes the title and prints a cell's table as a figure", () => {
        expect(html).toContain(`<h1 class="doc-title">Spring &lt;review&gt;</h1>`)
        expect(html).toContain(`<figure class="doc-figure doc-figure-table"><p class="doc-fig-title">Table 1. Packages</p><table class="doc-data ">`)
        expect(html).toContain(`Package <span class="doc-data-all">all in org.example</span>`)
        expect(html).toContain(`<td class="doc-r doc-num">12</td>`)
    })

    it("sets a table written in the text as the editor does", () => {
        expect(html).toContain(`<div class="nb-table"><table><thead>`)
    })
})
