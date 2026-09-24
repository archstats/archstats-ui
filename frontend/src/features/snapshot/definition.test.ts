import { describe, expect, it } from "vitest"
import { categoryOf, definitionMarkdown, referenceEntries } from "./definition"
import { DERIVED_METRICS } from "./derivedMetrics"

describe("categoryOf", () => {
    it("prefers the engine's category, then the id prefix", () => {
        expect(categoryOf({ id: "complexity__lines", category: "Size" })).toBe("Size")
        expect(categoryOf({ id: "complexity__lines" })).toBe("Size and complexity")
        expect(categoryOf({ id: "odd" })).toBe("Odd")
    })
})

describe("definitionMarkdown", () => {
    it("reads name, id, short, then long", () => {
        expect(definitionMarkdown({ id: "a__b", name: "B", short: "Short.", long: "Long." })).toBe("**B** (`a__b`): Short.\n\nLong.")
    })
})

describe("referenceEntries", () => {
    it("adds every app-computed metric after the snapshot's", () => {
        const e = referenceEntries([{ id: "x", name: "X", short: "", long: "" }])
        expect(e.length).toBe(1 + DERIVED_METRICS.length)
        expect(e.filter(x => x.derived).every(x => x.id.startsWith("app__"))).toBe(true)
    })
})
