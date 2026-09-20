import { describe, expect, it } from "vitest"
import { aggregateFileImportEdges, fileImportDegrees, queryFileImportEdges, FILE_IMPORT_QUERY } from "./fileImports"

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
  it("runs the documented snippets query and aggregates the rows", async () => {
    let queried = ""
    const query = async (sql: string) => {
      queried = sql
      return [
        { file: "a", content: "b" },
        { file: "a", content: "b" },
      ]
    }
    const edges = await queryFileImportEdges(query)
    expect(queried).toBe(FILE_IMPORT_QUERY)
    expect(edges).toEqual([{ from: "a", to: "b", references: 2 }])
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
