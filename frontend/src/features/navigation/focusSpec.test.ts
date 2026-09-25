import { describe, expect, it } from "vitest"
import { describeFocus, focusText, shortName, stepDepth, type FocusSpec } from "./focusSpec"

describe("focus specs", () => {
  it("steps + and - symmetrically from only", () => {
    const only: FocusSpec = { op: "only", anchors: ["a"], depth: null }
    const wider = stepDepth(only, 1)!
    expect(wider).toEqual({ op: "around", anchors: ["a"], depth: 1 })
    expect(stepDepth(stepDepth(wider, 1)!, -1)).toEqual(wider)
    expect(stepDepth(wider, -1)).toEqual(only)
  })

  it("will not step a path or a tangle", () => {
    expect(stepDepth({ op: "tangle", anchors: ["a"], depth: null }, 1)).toBeNull()
  })

  it("reads as words", () => {
    expect(describeFocus({ op: "around", anchors: ["billing"], depth: 2 }, "")).toBe("Around billing · 2 hops")
    expect(describeFocus({ op: "dependents", anchors: ["money"], depth: null }, "")).toBe("Everything that reaches money")
    expect(describeFocus({ op: "only", anchors: ["a", "b", "c"], depth: null }, "")).toBe("a and 2 more")
  })

  it("shortens a name to its last whole segments", () => {
    expect(shortName("org.broadleafcommerce.common.file.service")).toBe("…common.file.service")
    expect(shortName("admin/src/main/resources/js/admin/catalog", 20)).toBe("…js/admin/catalog")
    expect(shortName("billing")).toBe("billing")
  })
})
