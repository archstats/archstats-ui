import { describe, expect, it } from "vitest"
import { adaptiveAreas, areaCells, changedCells, orderAreas, OTHER } from "./areas"

describe("adaptiveAreas", () => {
    it("reads the biggest area finer and keeps the small ones together", () => {
        const names = [
            ...Array.from({ length: 30 }, (_, i) => `src/domains/d${i % 3}/m${i}`),
            ...Array.from({ length: 10 }, (_, i) => `src/app/p${i}`),
            "tools", "docs",
            ...Array.from({ length: 160 }, (_, i) => `lib/x${i}/y`),
        ]
        const a = adaptiveAreas(names, 6)
        expect(a.areaOf.get("src/domains/d0/m0")).toBe("src/domains/d0")
        expect(a.areaOf.get("tools")).toBe(OTHER)
        expect(a.areaOf.get("tools")).toBe(a.areaOf.get("docs"))
        expect(a.keys.filter(k => k !== OTHER).length).toBeLessThanOrEqual(6)
    })
    it("reads past the prefix every name shares", () => {
        const a = adaptiveAreas(["org.acme.billing.a", "org.acme.billing.b", "org.acme.catalog.c", "org.acme.catalog.d"], 2)
        expect(a.prefix).toBe("org.acme.")
        expect(new Set(a.areaOf.values())).toEqual(new Set(["org.acme.billing", "org.acme.catalog"]))
    })
})

describe("areaCells", () => {
    const a = adaptiveAreas(["p.a.x", "p.a.y", "p.b.x", "p.b.y", "p.c.x", "p.c.y"], 3)
    const head = [{ from: "p.a.x", to: "p.b.x", refs: 3 }, { from: "p.a.y", to: "p.c.x", refs: 1 }, { from: "p.b.y", to: "p.c.y", refs: 2 }]
    const added = [{ from: "p.a.y", to: "p.c.x", refs: 1 }, { from: "p.b.y", to: "p.c.y", refs: 2 }]
    const removed = [{ from: "p.c.x", to: "p.a.x", refs: 4 }, { from: "p.b.x", to: "p.c.x", refs: 1 }]
    const cells = areaCells(a, head, added, removed)
    const at = (f: string, t: string) => cells.find(c => c.from === `p.${f}` && c.to === `p.${t}`)
    it("marks a link between areas that had none as new, and a link with none left as gone", () => {
        expect(at("a", "c")?.state).toBe("new")
        expect(at("c", "a")?.state).toBe("gone")
        expect(at("a", "b")?.state).toBe("same")
        expect(at("b", "c")).toMatchObject({ state: "changed", added: 1, removed: 1, before: 1, links: 1 })
    })
    it("orders dependents above what they depend on, and the changes new first", () => {
        expect(orderAreas(a.keys, cells)[0]).toBe("p.a")
        expect(changedCells(cells).map(c => c.state)).toEqual(["new", "gone", "changed"])
    })
})
