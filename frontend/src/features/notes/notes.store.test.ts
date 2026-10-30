import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"

const saved: any[] = []
vi.mock("wailsjs/go/app/NotesService", () => ({
    List: vi.fn(async () => [{ id: "n0", subjectKind: "component", subject: "com.acme.pay", text: "Only through PaymentGateway.", author: "model", headCommit: "abc", updatedAt: "2026-10-02T10:00:00Z" }]),
    Save: vi.fn(async (n: any) => { saved.push(n); return { ...n, id: "n1", updatedAt: "2026-10-02T11:00:00Z" } }),
    Delete: vi.fn(async () => undefined),
}))

import { useNotesStore } from "./notes.store"

describe("notes", () => {
    beforeEach(() => { setActivePinia(createPinia()); saved.length = 0 })

    it("loads a workspace's notes and adds one with its subject's kind", async () => {
        const store = useNotesStore()
        await store.load("ws1")
        expect(store.notes.map(n => n.subject)).toEqual(["com.acme.pay"])
        await store.add("src/pay/Stripe.java", "Retries live here.", "def")
        await store.add("", "No module owns the orders table.", "def")
        expect(saved.map(n => [n.subjectKind, n.subject, n.author, n.workspaceId])).toEqual([["file", "src/pay/Stripe.java", "person", "ws1"], ["codebase", "", "person", "ws1"]])
        expect(store.notes[0].text).toBe("No module owns the orders table.")
    })

    it("removes a note", async () => {
        const store = useNotesStore()
        await store.load("ws1")
        await store.remove("n0")
        expect(store.notes).toEqual([])
    })
})
