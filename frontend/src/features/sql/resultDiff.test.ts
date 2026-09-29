import { describe, expect, it } from "vitest"
import { diffResults, keyColumns } from "./resultDiff"

describe("result diff", () => {
    it("matches rows by their text columns and compares the numbers", () => {
        const now = { columns: ["name", "lines", "health"], rows: [["a", 10, 9], ["b", 25, 7], ["d", 5, null]] }
        const then = { columns: ["health", "name", "lines"], rows: [[9, "a", 10], [8, "b", 20], [6, "c", 3]] }
        const d = diffResults(now, then)
        expect(d.key).toEqual(["name"])
        expect(d.entries.map(e => `${e.row[0]}:${e.status}`)).toEqual(["a:same", "b:changed", "d:added", "c:removed"])
        expect(d.entries[1].before).toEqual(["b", 20, 8])
        expect(d.entries[3].row).toEqual(["c", 3, 6])
        expect(d.counts).toEqual({ added: 1, removed: 1, changed: 1, same: 1 })
    })

    it("names the columns the baseline lacks and does not count them as changes", () => {
        const d = diffResults({ columns: ["name", "role"], rows: [["a", "production"]] }, { columns: ["name"], rows: [["a"]] })
        expect(d.missing).toEqual(["role"])
        expect(d.key).toEqual(["name"])
        expect(d.entries[0].status).toBe("same")
    })

    it("matches by position when every column is a number, and repeats in order", () => {
        expect(keyColumns({ columns: ["n"], rows: [[1]] })).toEqual([])
        expect(diffResults({ columns: ["n"], rows: [[3464]] }, { columns: ["n"], rows: [[3400]] }).entries[0].status).toBe("changed")
        const d = diffResults({ columns: ["k", "v"], rows: [["x", 1], ["x", 2]] }, { columns: ["k", "v"], rows: [["x", 1], ["x", 3]] })
        expect(d.ambiguous).toBe(true)
        expect(d.entries.map(e => e.status)).toEqual(["same", "changed"])
    })
})
