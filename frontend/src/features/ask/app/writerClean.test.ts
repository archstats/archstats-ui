import { describe, expect, it } from "vitest"
import { clean } from "./writer"

describe("a written section", () => {
    it("keeps no id the report does not print", () => {
        expect(clean("The tangle holds 61 components (Figure E5). Table E6 lists the cuts.")).toBe("The tangle holds 61 components. The table lists the cuts.")
        expect(clean("See the order [E2.3].")).toBe("See the order.")
    })
})
