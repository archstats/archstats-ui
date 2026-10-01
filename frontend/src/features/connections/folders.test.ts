import { describe, expect, it } from "vitest"
import { folderGroups, segmentsOf } from "./folders"

describe("folder roll-up", () => {
    it("drops the shared root and goes as deep as stays legible", () => {
        const comps = ["org.shop.core.catalog.domain", "org.shop.core.catalog.dao", "org.shop.core.order.domain", "org.shop.web.api", "org.shop.web.admin"]
        const g = folderGroups(comps, 3)
        expect(g.map(x => x.name).sort()).toEqual(["core.catalog", "core.order", "web"])
        expect(g.find(x => x.name === "core.catalog")?.members).toHaveLength(2)
        expect(folderGroups(comps, 2).map(x => x.name).sort()).toEqual(["core", "web"])
    })

    it("reads paths and keeps the root component", () => {
        const g = folderGroups(["src", "src/features/a", "src/features/b", "src/shared"], 10)
        expect(g.flatMap(x => x.members).sort()).toEqual(["src", "src/features/a", "src/features/b", "src/shared"])
        expect(g.some(x => x.members.includes("src"))).toBe(true)
    })

    it("splits namespaces and packages by their own separator", () => {
        expect(segmentsOf("App\\Http\\Controllers").parts).toEqual(["App", "Http", "Controllers"])
        expect(segmentsOf("a::b").parts).toEqual(["a", "b"])
        expect(segmentsOf(".").parts).toEqual([])
    })

    it("never makes more folders than asked, unless the first level already has more", () => {
        const many = Array.from({ length: 60 }, (_, i) => `p${i}.x`)
        expect(folderGroups(many, 24)).toHaveLength(60)
        const nested = Array.from({ length: 60 }, (_, i) => `root.g${i % 6}.c${i}`)
        expect(folderGroups(nested, 24).length).toBeLessThanOrEqual(24)
        expect(folderGroups(nested, 6)).toHaveLength(6)
    })

    it("leaves out the root most folders share, unless names would clash", () => {
        const comps = ["org.shop.cms.a", "org.shop.cms.b", "org.shop.core.a", "org.shop.core.b", "org.shop.web.a", "org.shop.web.b", "org.shop.api.a", "org.shop.api.b", "org.shop.admin.x", "admin", "common"]
        const names = folderGroups(comps, 7).map(g => g.name).sort()
        expect(names).toContain("cms")
        expect(names).toContain("core")
        expect(names).toContain("org.shop.admin")
        expect(names).toContain("admin")
    })
})
