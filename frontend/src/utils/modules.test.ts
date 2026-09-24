import { describe, expect, it } from "vitest"
import { assignFiles, declaredVia, ecosystems, isFixture, parseModules } from "./modules"

const mods = parseModules([
    { name: "broadleaf-common", kind: "maven", directory: "common", manifest: "common/pom.xml", depends_on: "" },
    { name: "broadleaf-open-admin-platform", kind: "maven", directory: "admin/broadleaf-open-admin-platform", manifest: "", depends_on: "broadleaf-common" },
    { name: "broadleaf-admin-module", kind: "maven", directory: "admin/broadleaf-admin-module", manifest: "", depends_on: "broadleaf-framework, broadleaf-open-admin-platform" },
    { name: "broadleaf-framework", kind: "maven", directory: "core/broadleaf-framework", manifest: "", depends_on: "broadleaf-common" },
    { name: "myapp", kind: "django", directory: "tests/_site/apps/myapp", manifest: "", depends_on: null },
    { name: "root", kind: "maven", directory: "", manifest: "pom.xml", depends_on: "" },
])

describe("build modules", () => {
    it("gives each file to the module with the longest directory", () => {
        const m = assignFiles(mods, ["common/src/A.java", "admin/broadleaf-admin-module/src/B.java", "admin/pom.xml", "core/broadleaf-framework/C.java"])
        expect(m.get("common")).toEqual(["common/src/A.java"])
        expect(m.get("admin/broadleaf-admin-module")).toEqual(["admin/broadleaf-admin-module/src/B.java"])
        expect(m.get("")).toEqual(["admin/pom.xml"])
    })
    it("sets test fixtures apart and names the ecosystems", () => {
        expect(mods.filter(isFixture).map(m => m.name)).toEqual(["myapp"])
        expect(ecosystems(mods)).toEqual([{ kind: "maven", count: 5 }, { kind: "django", count: 1 }])
    })
    it("finds the declared path an undeclared import could lean on", () => {
        const deps = new Map(mods.map(m => [m.name, m.dependsOn]))
        expect(declaredVia("broadleaf-admin-module", "broadleaf-common", deps)).toEqual(["broadleaf-framework"])
        expect(declaredVia("broadleaf-common", "broadleaf-admin-module", deps)).toBeNull()
        expect(declaredVia("broadleaf-open-admin-platform", "broadleaf-common", deps)).toEqual([])
    })
})
