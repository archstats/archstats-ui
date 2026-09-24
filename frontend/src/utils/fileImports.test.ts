import { describe, expect, it } from "vitest"
import { aggregateFileImportEdges, fileImportDegrees, queryFileImportEdges, FILE_DEPENDENCY_QUERY } from "./fileImports"

describe("aggregateFileImportEdges", () => {
  it("counts repeated import statements between the same two files as one edge", () => {
    const edges = aggregateFileImportEdges([
      { file: "src/A.java", content: "src/B.java" },
      { file: "src/A.java", content: "src/B.java" },
      { file: "src/A.java", content: "src/C.java" },
    ])
    expect(edges).toEqual([
      { from: "src/A.java", to: "src/B.java", references: 2 },
      { from: "src/A.java", to: "src/C.java", references: 1 },
    ])
  })

  it("drops self-imports and rows missing a file or a target", () => {
    const edges = aggregateFileImportEdges([
      { file: "src/A.java", content: "src/A.java" },
      { file: "", content: "src/B.java" },
      { file: "src/A.java", content: "" },
    ])
    expect(edges).toEqual([])
  })

  it("keeps the two directions of a mutual import as separate edges", () => {
    const edges = aggregateFileImportEdges([
      { file: "src/A.java", content: "src/B.java" },
      { file: "src/B.java", content: "src/A.java" },
    ])
    expect(edges).toHaveLength(2)
  })
})

describe("queryFileImportEdges", () => {
  it("reads the engine's resolved file dependencies", async () => {
    let queried = ""
    const query = async (sql: string) => {
      queried = sql
      return [{ from: "a.ts", to: "b.ts", references: 2 }, { from: "a.ts", to: "a.ts", references: 5 }]
    }
    const edges = await queryFileImportEdges(query, v => v === "unit_connections")
    expect(queried).toBe(FILE_DEPENDENCY_QUERY)
    expect(edges).toEqual([{ from: "a.ts", to: "b.ts", references: 2 }])
  })

  it("gives no file edges rather than guessing from import text", async () => {
    // Import snippets name classes and packages, never files; built from
    // them, every "file edge" pointed at a component name.
    const edges = await queryFileImportEdges(async () => [{ file: "a", content: "b" }], () => false)
    expect(edges).toEqual([])
  })
})

describe("fileImportDegrees", () => {
  it("counts in-degree plus out-degree for every file touched by an edge", () => {
    const degrees = fileImportDegrees([
      { from: "a", to: "b", references: 1 },
      { from: "c", to: "b", references: 1 },
    ])
    expect(degrees.get("a")).toBe(1)
    expect(degrees.get("b")).toBe(2)
    expect(degrees.get("c")).toBe(1)
  })
})
