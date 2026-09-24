import { describe, expect, it } from "vitest"
import { buildDirTree, commitsByDir, edgesOut, visibleRows, type DirFile } from "./dirTree"

const f = (name: string, component: string | null, lines: number, hotspot: number | null = null, health: number | null = null): DirFile => ({ name, component, lines, hotspot, health })
const files = [
    f("admin/src/main/java/org/acme/web/A.java", "org.acme.web", 100, 40, 6),
    f("admin/src/main/java/org/acme/web/B.java", "org.acme.web", 50, 10, 3),
    f("admin/src/main/java/org/acme/dao/C.java", "org.acme.dao", 30, 5, 9),
    f("admin/pom.xml", null, 20),
    f("core/src/main/java/org/acme/core/D.java", "org.acme.core", 200, 70, 4),
    f("README.md", null, 5),
]

describe("directory tree", () => {
    const root = buildDirTree(files)
    it("rolls every column up by its rule", () => {
        const admin = root.children.find(c => c.label === "admin")!
        expect(admin.files.length).toBe(4)
        expect(admin.lines).toBe(200)
        expect([...admin.components].sort()).toEqual(["org.acme.dao", "org.acme.web"])
        expect(admin.maxHotspot).toBe(40)
        expect(admin.minHealth).toBe(3)
        expect(root.lines).toBe(405)
    })
    it("compacts a chain of single directories into one row", () => {
        const admin = root.children.find(c => c.label === "admin")!
        expect(admin.children.map(c => c.label)).toEqual(["src/main/java/org/acme"])
        const core = root.children.find(c => c.label.startsWith("core"))!
        expect(core.label).toBe("core/src/main/java/org/acme/core")
        expect(core.depth).toBe(1)
    })
    it("orders by lines and shows only what is expanded", () => {
        expect(root.children.map(c => c.label)).toEqual(["admin", "core/src/main/java/org/acme/core"])
        expect(visibleRows(root, new Set()).length).toBe(2)
        expect(visibleRows(root, new Set(["admin"])).map(r => r.label)).toEqual(["admin", "src/main/java/org/acme", "core/src/main/java/org/acme/core"])
    })
    it("counts an edge as leaving when its target has no file inside", () => {
        const admin = root.children.find(c => c.label === "admin")!
        const edges = [{ from: "org.acme.web", to: "org.acme.dao" }, { from: "org.acme.web", to: "org.acme.core" }, { from: "org.acme.dao", to: "org.acme.core" }, { from: "org.acme.web", to: "org.acme.core" }]
        expect(edgesOut(admin, edges)).toHaveLength(2)
    })
    it("counts distinct commits per directory", () => {
        const m = commitsByDir([{ file: "admin/a/A.java", hash: "1" }, { file: "admin/b/B.java", hash: "1" }, { file: "admin/b/B.java", hash: "2" }])
        expect(m.get("admin")).toBe(2)
        expect(m.get("admin/a")).toBe(1)
        expect(m.get("")).toBe(2)
    })
})
