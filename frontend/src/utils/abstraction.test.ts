import { describe, expect, it } from "vitest"
import { implicitAbstractionLanguage } from "./abstraction"

describe("implicitAbstractionLanguage", () => {
  it("names the languages that declare no abstract types", () => {
    expect(implicitAbstractionLanguage(["src/oscar/apps/basket/models.py", "src/oscar/apps/basket/views.py"])).toBe("Python")
    expect(implicitAbstractionLanguage(["lib/index.js", "lib/util.mjs"])).toBe("JavaScript")
    expect(implicitAbstractionLanguage(["app/models/user.rb"])).toBe("Ruby")
  })
  it("leaves the languages that do alone", () => {
    expect(implicitAbstractionLanguage(["Foo.java", "Bar.java"])).toBeNull()
    expect(implicitAbstractionLanguage(["api.ts", "types.ts", "build.js"])).toBeNull()
    expect(implicitAbstractionLanguage(["server.go"])).toBeNull()
  })
  it("goes with the plurality of files", () => {
    expect(implicitAbstractionLanguage(["A.java", "B.java", "gen.py"])).toBeNull()
    expect(implicitAbstractionLanguage(["a.py", "b.py", "Tool.java"])).toBe("Python")
  })
  it("says nothing about files it cannot place", () => {
    expect(implicitAbstractionLanguage(["README.md", "Makefile"])).toBeNull()
    expect(implicitAbstractionLanguage([])).toBeNull()
  })
})
