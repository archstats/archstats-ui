import { describe, expect, it } from "vitest"
import { pickFor, useExportables } from "./useExportables"

describe("pickFor", () => {
    it("gives a slot the exportable it names, and waits while that one is not ready", () => {
        const { register } = useExportables()
        let knowledgeReady = false
        const offAuthors = register({ kind: "table", title: "Authors (all time)", rows: () => [{ author: "a" }], columns: () => [{ id: "author", label: "Author" }] })
        const offKnowledge = register({ kind: "table", title: "Knowledge by component", ready: () => knowledgeReady, rows: () => [{ component: "c" }], columns: () => [{ id: "component", label: "Component" }] })
        // The leaderboard is ready first; the slot must not take it.
        expect(pickFor("table", "Knowledge by component")).toBeNull()
        knowledgeReady = true
        expect(pickFor("table", "Knowledge by component")?.title).toBe("Knowledge by component")
        // Without a name, any usable table of the kind, the last registered first.
        expect(pickFor("table")?.title).toBe("Knowledge by component")
        offAuthors(); offKnowledge()
    })
})
