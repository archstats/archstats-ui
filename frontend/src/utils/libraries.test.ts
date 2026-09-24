import { describe, expect, it } from "vitest"
import { isPlatform, libraries, looksInternal, ownPrefixes, rollup } from "./libraries"

describe("libraries", () => {
    it("tags platform modules by exact rules", () => {
        expect(isPlatform("net/http", "go")).toBe(true)
        expect(isPlatform("github/com/stretchr/testify/assert", "go")).toBe(false)
        expect(isPlatform("golang/org/x/net", "go")).toBe(false)
        expect(isPlatform("decimal", "python")).toBe(true)
        expect(isPlatform("django/db", "python")).toBe(false)
        expect(isPlatform("path", "javascript")).toBe(true)
        expect(isPlatform("node:fs/promises", "javascript")).toBe(true)
        expect(isPlatform("react", "javascript")).toBe(false)
        expect(isPlatform("java/util", "java")).toBe(true)
        expect(isPlatform("javax/persistence", "java")).toBe(false)
        expect(isPlatform("Symfony\\Component\\Form", "php")).toBe(false)
    })
    it("rolls up by segments, keeping a scoped package whole", () => {
        expect(rollup("Symfony\\Component\\Form\\Extension", 2)).toBe("Symfony\\Component")
        expect(rollup("jakarta/persistence/criteria", 2)).toBe("jakarta/persistence")
        expect(rollup("@mui/material/Button", 1)).toBe("@mui/material")
        expect(rollup("react", 3)).toBe("react")
        expect(rollup("a/b/c", null)).toBe("a/b/c")
        expect(rollup("github/com/stretchr/testify/assert", 1)).toBe("github/com/stretchr")
        expect(rollup("github/com/stretchr/testify/assert", 2)).toBe("github/com/stretchr/testify")
    })
    it("tags imports that start where the project's own names start", () => {
        const own = ownPrefixes([
            "org.broadleafcommerce.core.order", "org.broadleafcommerce.core.catalog", "org.broadleafcommerce.common",
            "api/server/routes", "api/models", "api/app",
            "Symfony\\Component\\DependencyInjection\\Loader\\Configurator",
        ])
        expect(looksInternal("org/broadleafcommerce/presentation/model", own)).toBe(true)
        expect(looksInternal("org/springframework/context", own)).toBe(false)
        expect(looksInternal("api", own)).toBe(true)
        expect(looksInternal("Symfony\\Component\\Form", own)).toBe(false)
    })
    it("counts imports, files and components per library", () => {
        const rows = [
            { content: "jakarta/persistence", file: "a/A.java", component: "a" },
            { content: "jakarta/persistence", file: "a/B.java", component: "a" },
            { content: "jakarta/persistence/criteria", file: "b/C.java", component: "b" },
            { content: "java/util", file: "b/C.java", component: "b" },
        ]
        const libs = libraries(rows, 2, new Map())
        expect(libs.map(l => [l.name, l.imports, l.files, l.components.size, l.platform])).toEqual([
            ["jakarta/persistence", 3, 3, 2, false],
            ["java/util", 1, 1, 1, true],
        ])
    })
})
