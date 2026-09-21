import { describe, expect, it } from "vitest"
import { bandHeights, foldTail, groupByLens, groupByPath, pathKey, pathLabel, segmentPrefix, splitSharedPrefix, UNGROUPED, type Neighbour } from "./neighbours"

const n = (name: string, references = 1): Neighbour => ({
    name, references, direction: "in", sharedCommits: null, coChangeRate: null, hops: 1,
})

describe("pathKey", () => {
    it("keeps the first segments", () => {
        expect(pathKey("Sylius\\Bundle\\CoreBundle\\Fixture", "\\", 2)).toBe("Sylius\\Bundle")
        expect(pathKey("org.broadleafcommerce.core.catalog", ".", 3)).toBe("org.broadleafcommerce.core")
    })

    it("keeps a short name whole rather than inventing a group", () => {
        expect(pathKey("Fixture", "\\", 2)).toBe("Fixture")
        expect(pathKey("Sylius\\Core", "\\", 2)).toBe("Sylius\\Core")
    })

    it("survives a codebase with no separator at all", () => {
        expect(pathKey("main", "", 2)).toBe("main")
    })
})

describe("segmentPrefix", () => {
    it("trims a character-level prefix back to a whole segment", () => {
        expect(segmentPrefix("org.broadleafcommerce.c", ".")).toBe("org.broadleafcommerce.")
    })

    it("is nothing when the names share no segment", () => {
        expect(segmentPrefix("S", "\\")).toBe("")
        expect(segmentPrefix("", ".")).toBe("")
    })
})

describe("pathKey with a shared prefix", () => {
    const P = "org.broadleafcommerce."

    it("counts segments after the prefix, not from the left", () => {
        expect(pathKey("org.broadleafcommerce.core.catalog.domain", ".", 1, P)).toBe("org.broadleafcommerce.core")
        expect(pathKey("org.broadleafcommerce.core.catalog.domain", ".", 2, P)).toBe("org.broadleafcommerce.core.catalog")
    })

    it("splits a codebase that would otherwise be one group", () => {
        const names = ["org.broadleafcommerce.core.catalog", "org.broadleafcommerce.admin.server", "org.broadleafcommerce.common.web"]
        expect(new Set(names.map(n => pathKey(n, ".", 1, P))).size).toBe(3)
        expect(new Set(names.map(n => pathKey(n, ".", 1))).size).toBe(1)
    })

    it("leaves a name that does not carry the prefix alone", () => {
        expect(pathKey("Unknown", ".", 1, P)).toBe("Unknown")
    })

    it("names a group by what is left after the prefix", () => {
        expect(pathLabel("org.broadleafcommerce.core.catalog", P)).toBe("core.catalog")
        expect(pathLabel("Unknown", P)).toBe("Unknown")
    })
})

describe("splitSharedPrefix", () => {
    const P = "com.fedex.qp."

    it("mutes what the group already said", () => {
        expect(splitSharedPrefix("com.fedex.qp.common.dto.eqs", "com.fedex.qp.common.dto", ".", P))
            .toEqual({ shared: "com.fedex.qp.common.dto.", own: "eqs" })
    })

    it("falls back to the project prefix for a row that is its own group", () => {
        expect(splitSharedPrefix("com.fedex.qp.common.repository", "com.fedex.qp.common.repository", ".", P))
            .toEqual({ shared: "com.fedex.qp.", own: "common.repository" })
    })

    it("keeps a name from another branch whole", () => {
        expect(splitSharedPrefix("Tests\\Sylius\\Core", "Sylius\\Bundle", "\\"))
            .toEqual({ shared: "", own: "Tests\\Sylius\\Core" })
    })

    it("never mutes the whole name away", () => {
        expect(splitSharedPrefix("com.fedex.qp.", "com.fedex.qp.", ".", P).own).toBe("com.fedex.qp.")
    })
})

describe("groupByPath", () => {
    const neighbours = [
        n("Sylius\\Bundle\\CoreBundle", 10),
        n("Sylius\\Bundle\\ApiBundle", 5),
        n("Tests\\Sylius\\Core", 7),
    ]

    it("rolls names up and counts both breadth and weight", () => {
        const groups = groupByPath(neighbours, "\\", 2)
        expect(groups.map(g => g.key)).toEqual(["Sylius\\Bundle", "Tests\\Sylius"])
        expect(groups[0]).toMatchObject({ components: 2, references: 15 })
        expect(groups[1]).toMatchObject({ components: 1, references: 7 })
    })

    it("orders members by weight inside a group", () => {
        const [bundle] = groupByPath(neighbours, "\\", 2)
        expect(bundle.members.map(m => m.name)).toEqual(["Sylius\\Bundle\\CoreBundle", "Sylius\\Bundle\\ApiBundle"])
    })

    it("breaks a tie on references, then on name", () => {
        const groups = groupByPath([n("a\\x", 1), n("b\\y", 9)], "\\", 1)
        expect(groups.map(g => g.key)).toEqual(["b", "a"])
    })
})

describe("groupByLens", () => {
    const index = new Map([["a", { name: "Domain", color: "hsl(210, 80%, 55%)" }], ["b", { name: "Domain", color: "hsl(210, 80%, 55%)" }]])

    it("uses the user's groups and names the remainder", () => {
        const groups = groupByLens([n("a"), n("b"), n("c")], name => index.get(name) ?? null)
        expect(groups.map(g => g.key)).toEqual(["Domain", UNGROUPED])
        expect(groups[0].components).toBe(2)
    })

    it("carries the group's own colour through", () => {
        const groups = groupByLens([n("a"), n("c")], name => index.get(name) ?? null)
        expect(groups.find(g => g.key === "Domain")?.color).toBe("hsl(210, 80%, 55%)")
        expect(groups.find(g => g.key === UNGROUPED)?.color).toBeUndefined()
    })
})

describe("foldTail", () => {
    const groups = groupByPath([n("a\\1"), n("b\\1"), n("c\\1"), n("d\\1")], "\\", 1)

    it("leaves a short list alone", () => {
        expect(foldTail(groups, 6)).toHaveLength(4)
    })

    it("folds the tail into one band that keeps its members", () => {
        const folded = foldTail(groups, 3)
        expect(folded).toHaveLength(3)
        expect(folded[2].label).toBe("2 more groups")
        expect(folded[2].components).toBe(2)
        expect(folded[2].members).toHaveLength(2)
    })
})

describe("bandHeights", () => {
    it("fills the available height exactly", () => {
        const heights = bandHeights([50, 30, 20], 200)
        expect(heights.reduce((a, h) => a + h, 0)).toBeCloseTo(200)
    })

    it("keeps a tiny band visible", () => {
        const [big, tiny] = bandHeights([999, 1], 200, 4)
        expect(tiny).toBeGreaterThanOrEqual(4)
        expect(big).toBeGreaterThan(tiny)
    })

    it("shares the height evenly when nothing has weight", () => {
        expect(bandHeights([0, 0], 100)).toEqual([50, 50])
    })

    it("still fits when the minimum cannot be honoured", () => {
        const heights = bandHeights([1, 1, 1, 1], 8, 4)
        expect(heights.reduce((a, h) => a + h, 0)).toBeCloseTo(8)
    })

    it("has nothing to lay out for no groups", () => {
        expect(bandHeights([], 200)).toEqual([])
    })
})
