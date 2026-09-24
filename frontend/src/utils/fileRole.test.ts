import { describe, expect, it } from "vitest"
import { componentPassesFacet, isTestPath, looksLikeProductionCode, passesFacet, roleOf } from "./fileRole"

describe("isTestPath", () => {
    it("follows the engine's conventions across languages", () => {
        for (const p of ["core/src/test/java/a/FooTest.java", "src/Sylius/Behat/Context/X.php", "tests/functional/test_basket.py", "gin_test.go", "client/src/a.spec.tsx", "Nop.Tests/Foo.cs", "features/cart.feature", "e2e/login.ts"]) expect(isTestPath(p)).toBe(true)
        for (const p of ["src/main/java/a/Foo.java", "src/oscar/apps/basket/models.py", "context.go", "client/src/App.tsx", "attestation/x.py"]) expect(isTestPath(p)).toBe(false)
    })
})

describe("facets", () => {
    it("prefers the recorded role", () => {
        expect(roleOf({ name: "tests/x.py", role: "generated" })).toBe("generated")
        expect(roleOf({ name: "tests/x.py" })).toBe("test")
    })
    it("sorts files and components", () => {
        expect(passesFacet("third_party", "production")).toBe(true)
        expect(passesFacet("test", "production")).toBe(false)
        expect(componentPassesFacet(["test", "test"], "test")).toBe(true)
        expect(componentPassesFacet(["test", "production"], "test")).toBe(false)
        expect(componentPassesFacet(["test", "production"], "production")).toBe(true)
    })
})

describe("looksLikeProductionCode", () => {
    it("leaves out stylesheets, data and vendored libraries", () => {
        expect(looksLikeProductionCode("admin/js/admin/lib/redactor.js")).toBe(false)
        expect(looksLikeProductionCode("admin/css/admin/blc-admin.css")).toBe(false)
        expect(looksLikeProductionCode("web/app.min.js")).toBe(false)
        expect(looksLikeProductionCode("admin/js/jquery-ui-1.13.3.custom.js")).toBe(false)
        expect(looksLikeProductionCode("core/src/main/java/a/AdminBasicEntityController.java")).toBe(true)
    })
})
