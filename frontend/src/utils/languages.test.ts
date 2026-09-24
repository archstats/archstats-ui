import { describe, expect, it } from "vitest"
import { composition, languageOfPath } from "./languages"

describe("languageOfPath", () => {
    it("names languages, keeps JavaScript apart from TypeScript, and names what it does not know", () => {
        expect(languageOfPath("a/b.js")).toBe("JavaScript")
        expect(languageOfPath("a/b.ts")).toBe("TypeScript")
        expect(languageOfPath("locale/nl/django.po")).toBe("Gettext translations")
        expect(languageOfPath("x/Dockerfile")).toBe("Dockerfile")
        expect(languageOfPath("x/README")).toBe("No extension")
        expect(languageOfPath("x/y.weird")).toBe(".weird")
    })
})

describe("composition", () => {
    it("sums lines per language and role, largest first", () => {
        const rows = composition([
            { name: "a.py", lines: 10, role: "production" },
            { name: "tests/test_a.py", lines: 5, role: "test" },
            { name: "l/django.po", lines: 100, role: "non_code" },
        ])
        expect(rows.map(r => r.language)).toEqual(["Gettext translations", "Python"])
        expect(rows[1]).toMatchObject({ files: 2, lines: 15, extension: ".py", roles: { production: 10, test: 5 } })
    })
})
