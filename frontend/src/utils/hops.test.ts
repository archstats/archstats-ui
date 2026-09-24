import { describe, expect, it } from "vitest"
import { hopsOf } from "~/utils/hops"

describe("hopsOf", () => {
  it("counts the steps on a path, not the components", () => {
    expect(hopsOf("a -> b")).toBe(1)
    expect(hopsOf("a -> b -> c -> d")).toBe(3)
  })
  it("falls back to the stored number without a path", () => {
    expect(hopsOf(null, 4)).toBe(4)
    expect(hopsOf("", "2")).toBe(2)
  })
})
