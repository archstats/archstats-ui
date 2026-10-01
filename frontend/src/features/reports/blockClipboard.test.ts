import { describe, expect, it } from "vitest"
import { BLOCKS_TYPE, blocksHtml, readBlocks, writeBlocks } from "./blockClipboard"
import type { Block } from "./reportDoc"

/** A clipboard that keeps what it is given, as DataTransfer does. */
function clip(): DataTransfer {
    const data = new Map<string, string>()
    return { setData: (t: string, v: string) => { data.set(t, v) }, getData: (t: string) => data.get(t) ?? "" } as unknown as DataTransfer
}

const blocks: Block[] = [
    { id: "h", kind: "h2", text: "Coupling" },
    { id: "p", kind: "p", text: "Most of it is **shared**." },
    { id: "c", kind: "cell", cell: { spec: { type: "sql", sql: "SELECT 1", limit: 5 }, title: "Pairs", caption: "", output: { table: { columns: [{ id: "a", label: "a", numeric: true }], rows: [{ a: 1 }], total: 1 } }, ranOn: null } },
]
const ctx = { workspace: "w", label: (x: string) => x, figure: () => null }

describe("block clipboard", () => {
    it("brings blocks back whole, cells with their output, under new ids", () => {
        const d = clip()
        writeBlocks(d, blocks, ctx)
        const back = readBlocks(d)!
        expect(back.map(b => b.kind)).toEqual(["h2", "p", "cell"])
        expect(back.every((b, i) => b.id !== blocks[i].id)).toBe(true)
        expect((back[2] as any).cell.output.table.rows).toEqual([{ a: 1 }])
    })

    it("reads the very text it wrote when the custom type was dropped", () => {
        const d = clip()
        writeBlocks(d, blocks, ctx)
        const plain = clip()
        plain.setData("text/plain", d.getData("text/plain"))
        expect(readBlocks(plain)?.length).toBe(3)
        const other = clip()
        other.setData("text/plain", "something else")
        expect(readBlocks(other)).toBeNull()
    })

    it("gives other apps prose and the table, not the cell's spec", () => {
        const d = clip()
        writeBlocks(d, blocks, ctx)
        expect(d.getData("text/plain")).toContain("**Table 1. Pairs**")
        expect(d.getData("text/plain")).not.toContain("```archstats")
        expect(d.getData(BLOCKS_TYPE)).toContain("SELECT 1")
        expect(blocksHtml(blocks, ctx)).toContain("<h2>Coupling</h2>")
        expect(blocksHtml(blocks, ctx)).toContain("<strong>shared</strong>")
    })
})
