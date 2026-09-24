import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useStateStore } from "~/stores/state"
import { readDurable, writeDurable } from "./durable"

vi.mock("wailsjs/go/app/StateService", () => ({ PutMany: vi.fn(async () => {}), PutSetting: vi.fn(async () => {}), Settings: vi.fn(async () => ({})), Workspace: vi.fn(async () => ({})) }))

describe("durable workspace state", () => {
    let mem: Record<string, string>
    beforeEach(() => {
        setActivePinia(createPinia())
        mem = { legacy: "old" }
        vi.stubGlobal("localStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v }, removeItem: (k: string) => { delete mem[k] } })
    })

    it("uses the browser copy until the workspace is hydrated", () => {
        expect(readDurable("w", "groups", "legacy")).toBe("old")
        writeDurable("w", "groups", "legacy", "new")
        expect(mem.legacy).toBe("new")
    })

    it("carries the browser copy up once, and never again after a delete", async () => {
        await useStateStore().hydrate("w")
        expect(readDurable("w", "groups", "legacy")).toBe("old")
        expect(useStateStore().get("groups", null)).toBe("old")
        writeDurable("w", "groups", "legacy", null)
        expect(readDurable("w", "groups", "legacy")).toBeNull()
        expect(mem.legacy).toBe("old")
    })

    it("prefers app.db over a stale browser copy", async () => {
        await useStateStore().hydrate("w")
        writeDurable("w", "groups", "legacy", "newer")
        mem.legacy = "stale"
        expect(readDurable("w", "groups", "legacy")).toBe("newer")
    })
})
