import { describe, expect, it } from "vitest"
import { filesUnder, folderTree, stackOrder } from "./folderTree"

describe("folderTree", () => {
    const files = ["frontend/src/a/x.ts", "frontend/src/a/y.ts", "frontend/src/b/z.ts", "README.md"]
    const size = (f: string) => f.length

    it("folds single-child folder chains into one label", () => {
        const t = folderTree(files.slice(0, 3), size)
        expect(t.name).toBe("")
        expect(t.children).toHaveLength(1)
        expect(t.children[0].name).toBe("frontend/src")
        expect(t.children[0].path).toBe("frontend/src")
        expect(t.children[0].children.map(c => c.name).sort()).toEqual(["a", "b"])
    })

    it("sums leaf sizes up the tree and never sizes a file below one", () => {
        const t = folderTree(["a/x.ts", "a/y.ts"], f => (f.endsWith("x.ts") ? 10 : 0))
        expect(t.size).toBe(11)
    })

    it("keeps a root with files and folders unfolded", () => {
        const t = folderTree(files, size)
        expect(t.children.map(c => c.name).sort()).toEqual(["README.md", "frontend/src"])
        expect(t.children.find(c => c.name === "README.md")!.file).toBe("README.md")
    })
})

describe("filesUnder", () => {
    it("matches whole segments only", () => {
        expect(filesUnder("src/order", ["src/order/a.ts", "src/orders/b.ts", "src/order"])).toEqual(["src/order/a.ts", "src/order"])
    })
})

describe("stackOrder", () => {
    it("puts what everything uses at the bottom", () => {
        const flows = [{ from: "ui", to: "core", count: 5 }, { from: "core", to: "util", count: 3 }, { from: "ui", to: "util", count: 1 }]
        expect(stackOrder(["util", "core", "ui"], flows)).toEqual(["ui", "core", "util"])
    })

    it("keeps the given order when nothing decides it", () => {
        expect(stackOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"])
    })
})

describe("stackOrder, weighed exactly", () => {
    it("puts the callers on top even when the floor below sends more", () => {
        // Broadleaf after interfaces join their lanes: volume is not direction.
        const flows = [
            { from: "services", to: "entities", count: 1143 }, { from: "repositories", to: "entities", count: 334 },
            { from: "services", to: "repositories", count: 115 }, { from: "repositories", to: "services", count: 81 },
            { from: "controllers", to: "services", count: 57 }, { from: "entities", to: "services", count: 43 },
            { from: "controllers", to: "entities", count: 29 }, { from: "services", to: "controllers", count: 6 },
        ]
        expect(stackOrder(["services", "repositories", "controllers", "entities"], flows)).toEqual(["controllers", "services", "repositories", "entities"])
    })

    it("moves a floor only as far as an import asks", () => {
        expect(stackOrder(["a", "b", "c", "d"], [{ from: "c", to: "b", count: 2 }])).toEqual(["a", "c", "b", "d"])
    })
})
