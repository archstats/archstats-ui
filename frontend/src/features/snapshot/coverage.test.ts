import { describe, expect, it } from "vitest"
import { coverageGapMatters, extensionOf, gapPhrase, importCoverage } from "./coverage"

describe("import coverage", () => {
    const files = [
        ...Array.from({ length: 20 }, (_, i) => `src/components/C${i}.vue`),
        ...Array.from({ length: 30 }, (_, i) => `src/utils/u${i}.ts`),
        "README.md", "package.json",
    ]
    const analysed = new Set(files.filter(f => f.endsWith(".ts")))

    it("counts only code files, per extension, largest gap first", () => {
        const c = importCoverage(files, analysed)
        expect(c.files).toBe(50)
        expect(c.analysed).toBe(30)
        expect(c.byExtension[0]).toEqual({ extension: "vue", files: 20, analysed: 0 })
        expect(c.share).toBeCloseTo(0.6)
    })

    it("interrupts only for a real gap", () => {
        expect(coverageGapMatters(importCoverage(files, analysed))).toBe(true)
        const small = importCoverage([...analysed, "a.vue", "b.vue"], analysed)
        expect(coverageGapMatters(small)).toBe(false)
    })

    it("names the gap in words", () => {
        expect(gapPhrase(importCoverage(files, analysed))).toBe("20 .vue files")
        const two = importCoverage([...files, "x.svelte"], analysed)
        expect(gapPhrase(two)).toBe("20 .vue and 1 .svelte files")
    })

    it("reads extensions from the last segment", () => {
        expect(extensionOf("a.b/c")).toBe("")
        expect(extensionOf("src/X.Test.TS")).toBe("ts")
        expect(extensionOf(".gitignore")).toBe("")
    })

    it("a codebase with no code is fully covered", () => {
        expect(importCoverage(["README.md"], new Set()).share).toBe(1)
    })
})
