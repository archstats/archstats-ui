import { describe, expect, it } from "vitest"
import { componentPath } from "./routes"

describe("componentPath", () => {
  it("keeps a dotted name as it is", () => {
    expect(componentPath("org.example.core")).toBe("/views/components/org.example.core")
  })
  it("keeps a slashed name in one segment", () => {
    expect(componentPath("src/app/core")).toBe("/views/components/src%2Fapp%2Fcore")
    expect(componentPath("src/app/core", "cycles")).toBe("/views/components/src%2Fapp%2Fcore/cycles")
  })
})
