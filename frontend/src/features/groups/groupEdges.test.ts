import { describe, expect, it } from "vitest"
import { groupPairTotals, resolveGroupEdges, targetKey, type LensGroup } from "./groupEdges"

const g = (id: string, files: string[], comps: Array<[string, boolean]>): LensGroup => ({ id, name: id, files: new Set(files), components: new Map(comps.map(([c, whole]) => [c, { whole }])) })

describe("resolveGroupEdges", () => {
    const web = g("web", ["web/a.py", "shared/x.py"], [["web", true], ["shared", false]])
    const svc = g("svc", ["svc/b.py", "shared/y.py"], [["svc", true], ["shared", false]])
    it("reads the source from the file and the target from a whole component", () => {
        const r = resolveGroupEdges([{ from: "web", to: "svc", file: "web/a.py", refs: 2 }], [web, svc])
        expect(r.edges.map(e => `${e.fromGroup}>${e.toGroup}`)).toEqual(["web>svc"])
    })
    it("splits by the file the import resolved to, else marks the row ambiguous", () => {
        const rows = [{ from: "svc", to: "shared", file: "svc/b.py", refs: 1 }]
        const amb = resolveGroupEdges(rows, [web, svc])
        expect(amb.ambiguous).toBe(1)
        expect(amb.edges.map(e => e.toGroup)).toEqual(["web"])
        const known = resolveGroupEdges(rows, [web, svc], new Map([[targetKey("svc/b.py", "shared"), ["shared/x.py"]]]))
        expect(known.ambiguous).toBe(0)
        expect(known.edges.map(e => `${e.fromGroup}>${e.toGroup}`)).toEqual(["svc>web"])
    })
    it("counts rows outside the lens instead of guessing", () => {
        const r = resolveGroupEdges([{ from: "x", to: "svc", file: "x/z.py", refs: 1 }, { from: "web", to: "nowhere", file: "web/a.py", refs: 1 }], [web, svc])
        expect([r.unplacedFrom, r.unplacedTo, r.edges.length]).toEqual([1, 1, 0])
    })
    it("totals pairs", () => {
        const r = resolveGroupEdges([{ from: "web", to: "svc", file: "web/a.py", refs: 2 }, { from: "web", to: "svc", file: "shared/x.py", refs: 3 }], [web, svc])
        expect(groupPairTotals(r.edges).get("web>svc")).toMatchObject({ refs: 5 })
    })
})
