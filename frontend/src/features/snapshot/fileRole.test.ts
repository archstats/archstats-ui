import { describe, expect, it } from "vitest"
import { componentPassesFacet, guessRole, isSourceFile, isTestPath, looksLikeProductionCode, NON_PRODUCTION_GLOBS, passesFacet, roleOf, TEST_GLOBS } from "./fileRole"

describe("isTestPath", () => {
    it("follows the engine's conventions across languages", () => {
        for (const p of ["core/src/test/java/a/FooTest.java", "src/Sylius/Behat/Context/X.php", "tests/functional/test_basket.py", "gin_test.go", "client/src/a.spec.tsx", "Nop.Tests/Foo.cs", "features/cart.feature", "e2e/login.ts"]) expect(isTestPath(p)).toBe(true)
        for (const p of ["src/main/java/a/Foo.java", "src/oscar/apps/basket/models.py", "context.go", "client/src/App.tsx", "attestation/x.py"]) expect(isTestPath(p)).toBe(false)
    })
})

describe("TEST_GLOBS", () => {
    it("says what isTestPath says, for SQL over snapshots without roles", () => {
        const glob = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
        const matches = (p: string) => TEST_GLOBS.some(g => glob(g).test(p))
        const paths = [
            "core/src/test/java/a/FooTest.java", "src/Sylius/Behat/Context/X.php", "tests/functional/test_basket.py", "gin_test.go", "client/src/a.spec.tsx",
            "Nop.Tests/Foo.cs", "src/Nop.Tests/Foo.cs", "features/cart.feature", "e2e/login.ts", "a/cypress/x.js", "testdata/protoexample/test.pb.go", "app/FooIT.java",
            "src/FooSpec.php", "conftest.py", "pkg/conftest.py", "a/b.test.mjs",
            "src/main/java/a/Foo.java", "src/oscar/apps/basket/models.py", "context.go", "client/src/App.tsx", "attestation/x.py", "src/Contest.java", "latest/x.go",
        ]
        for (const p of paths) expect(matches(p), p).toBe(isTestPath(p))
    })
    it("with NON_PRODUCTION_GLOBS, leaves out what guessRole leaves out", () => {
        const glob = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
        const notProduction = (p: string) => [...TEST_GLOBS, ...NON_PRODUCTION_GLOBS].some(g => glob(g).test(p))
        const paths = [
            "admin/js/admin/lib/redactor.js", "admin/css/admin/blc-admin.css", "web/app.min.js", "admin/js/jquery-ui-1.13.3.custom.js", "Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js/elfinder.full.js",
            "src/Nop.Web/wwwroot/lib/bootstrap/x.js", "vendor/github.com/x/y.go", "node_modules/a/index.js", "static/oscar/js/lib/x.js", "README.md", "config.yaml", "docs/a.rst",
            "src/main/java/a/Foo.java", "src/oscar/apps/basket/models.py", "context.go", "client/src/App.tsx", "pipeline.py", "src/liberty/Main.java",
        ]
        for (const p of paths) expect(notProduction(p), p).toBe(guessRole(p) !== "production")
        expect(guessRole("Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js/elfinder.full.js")).toBe("third_party")
        expect(guessRole("README.md")).toBe("non_code")
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

describe("isSourceFile", () => {
    it("drops files a recorded role calls non-code, generated or third-party", () => {
        expect(isSourceFile({ name: "docs/guide.md", role: "non_code" })).toBe(false)
        expect(isSourceFile({ name: "api/gen/client.ts", role: "generated" })).toBe(false)
        expect(isSourceFile({ name: "admin/lib/redactor.js", role: "third_party" })).toBe(false)
        expect(isSourceFile({ name: "src/main/java/a/Foo.java", role: "production" })).toBe(true)
        expect(isSourceFile({ name: "src/test/java/a/FooTest.java", role: "test" })).toBe(true)
    })
    it("drops what is not written in a programming language, whatever the role says", () => {
        for (const name of ["./LICENSE", "specs/desktop-app.md", "tasks/plan.md", "Jenkinsfile", "templates/cart.html", "db/load_catalog.sql", "go.mod", "infra/main.tf"]) {
            expect(isSourceFile({ name, role: "production" }), name).toBe(false)
        }
    })
    it("falls back to the path when the snapshot recorded no roles", () => {
        for (const name of ["doc/license.txt", "antlr/license.txt", "core/src/main/resources/bl_catalog.xml", "admin/js/admin/lib/redactor.js", "web/app.min.js", "vendor/x/y.go", "README"]) {
            expect(isSourceFile({ name }), name).toBe(false)
            expect(isSourceFile({ name, role: null }), name).toBe(false)
        }
        for (const name of ["core/src/main/java/a/Foo.java", "frontend/src/pages/x.vue", "app/scan/scan.go", "pkg/tool.py", "scripts/build.sh", "src/App.tsx"]) {
            expect(isSourceFile({ name }), name).toBe(true)
        }
    })
})
