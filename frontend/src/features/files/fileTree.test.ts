import { describe, expect, it } from "vitest"
import { buildFileTree, commonRoot, foldersHolding, fuzzyMatch, visibleRows } from "~/features/files/fileTree"

const f = (name: string) => ({ name })
const ROOT = "repos/eai-qp-user/src/main/java/com/fedex/qp/user/service"
const files = [
    f(`${ROOT}/impl/AwbValidationImpl.java`),
    f(`${ROOT}/impl/QuoteServiceImpl.java`),
    f(`${ROOT}/impl/util/dto/RulesDto.java`),
    f(`${ROOT}/UserService.java`),
]

describe("buildFileTree", () => {
    it("lifts the folder every file shares into one root", () => {
        expect(commonRoot(files.map(x => x.name))).toBe(ROOT)
        expect(buildFileTree(files).root).toBe(ROOT)
    })

    it("puts folders first, collapses single-child chains and counts files below", () => {
        const { nodes } = buildFileTree(files)
        const rows = visibleRows(nodes, () => true)
        expect(rows.map(r => `${"  ".repeat(r.depth)}${r.label}${r.kind === "folder" ? `/ (${r.fileCount})` : ""}`)).toEqual([
            "impl/ (3)",
            "  util/dto/ (1)",
            "    RulesDto.java",
            "  AwbValidationImpl.java",
            "  QuoteServiceImpl.java",
            "UserService.java",
        ])
    })

    it("hides what sits in a closed folder, and finds the folders holding a file", () => {
        const { nodes } = buildFileTree(files)
        expect(visibleRows(nodes, () => false).map(r => r.label)).toEqual(["impl", "UserService.java"])
        expect(foldersHolding(nodes, `${ROOT}/impl/util/dto/RulesDto.java`)).toEqual(["impl", "impl/util/dto"])
    })

    it("reads one file, and files with no folder, without a root", () => {
        expect(buildFileTree([f("a.go"), f("b.go")]).root).toBe("")
        expect(visibleRows(buildFileTree([f("x/y/a.go")]).nodes, () => true).map(r => r.label)).toEqual(["a.go"])
    })
})

describe("fuzzyMatch", () => {
    it("matches characters in order, and nothing else", () => {
        expect(fuzzyMatch("awbimpl", `${ROOT}/impl/AwbValidationImpl.java`)).not.toBeNull()
        expect(fuzzyMatch("xyz", `${ROOT}/impl/AwbValidationImpl.java`)).toBeNull()
    })

    it("ranks a hit in the file name above a hit spread over folders", () => {
        const name = fuzzyMatch("rules", `${ROOT}/impl/util/dto/RulesDto.java`)!
        const folders = fuzzyMatch("rules", `${ROOT}/impl/QuoteServiceImpl.java`)
        expect(folders === null || name.score > folders.score).toBe(true)
        expect(fuzzyMatch("quote", `${ROOT}/impl/QuoteServiceImpl.java`)!.score).toBeGreaterThan(fuzzyMatch("quote", `${ROOT}/impl/AwbValidationImpl.java`)?.score ?? -Infinity)
    })

    it("marks the matched characters in the file name", () => {
        const path = "a/QuoteServiceImpl.java"
        const m = fuzzyMatch("qsi", path)!
        expect(m.indices.map(i => path[i]).join("")).toBe("QSI")
    })
})
