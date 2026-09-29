import { describe, expect, it } from "vitest"
import { compareStructure, evaluate } from "./structureCompare"
import type { FileEdge } from "~/features/checks/checks"

const e = (from: string, to: string): FileEdge => ({ from, to, names: [] })

describe("structure compare", () => {
    const of = new Map([["p/a.ts", "pages"], ["r/b.ts", "report"], ["r/c.ts", "report"], ["s/d.ts", "sql"]])
    const prod = new Set([...of.keys(), "u/misc.ts"])
    const base = evaluate(of, [e("p/a.ts", "r/b.ts"), e("r/b.ts", "r/c.ts"), e("r/c.ts", "s/d.ts"), e("s/d.ts", "r/b.ts"), e("s/d.ts", "p/a.ts"), e("r/b.ts", "u/misc.ts")], prod)
    it("finds mutual pairs, cycles and crossing imports", () => {
        expect(base.mutual).toEqual([{ a: "report", b: "sql", ab: 1, ba: 1 }])
        expect(base.tangles[0]).toEqual(["pages", "report", "sql"])
        expect(base.crossing).toBe(4)
    })
    it("reads what a change did", () => {
        const head = evaluate(of, [e("p/a.ts", "r/b.ts"), e("r/c.ts", "s/d.ts")], prod)
        const d = compareStructure(base, head, [1, 0])
        expect(d.mutualGone).toEqual([{ a: "report", b: "sql" }])
        expect(d.depsGone.map(x => `${x.from}>${x.to}`).sort()).toEqual(["sql>pages", "sql>report"])
        expect(d.rows.find(r => r.label === "Groups caught in cycles")).toMatchObject({ before: 3, after: 0 })
    })
})
