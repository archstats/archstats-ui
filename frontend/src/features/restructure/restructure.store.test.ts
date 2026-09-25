import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useRestructureStore } from "./restructure.store"
import { useStateStore } from "~/platform/state.store"

vi.mock("wailsjs/go/app/StateService", () => ({ PutMany: vi.fn(async () => {}), PutSetting: vi.fn(async () => {}), Settings: vi.fn(async () => ({})), Workspace: vi.fn(async () => ({})) }))

describe("restructure plan", () => {
    let mem: Record<string, string>
    beforeEach(() => {
        setActivePinia(createPinia())
        mem = {}
        vi.stubGlobal("localStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v }, removeItem: (k: string) => { delete mem[k] } })
    })

    it("keeps a hand-placed file in one module only, and survives a reload", () => {
        const s = useRestructureStore()
        s.load("w")
        const a = s.add({ name: "A", files: ["x.ts", "y.ts"] })
        const b = s.add({ name: "B", files: ["y.ts"] })
        expect(s.byId.get(a)!.files).toEqual(["x.ts"])
        s.place(["x.ts"], b)
        expect(s.byId.get(a)!.files).toEqual([])
        setActivePinia(createPinia())
        const again = useRestructureStore()
        again.load("w")
        expect(again.plan.modules.map(m => [m.name, m.files])).toEqual([["A", []], ["B", ["y.ts", "x.ts"]]])
    })

    it("reads the plan again once the workspace is hydrated", async () => {
        const s = useRestructureStore()
        s.load("w")
        expect(s.fromDb).toBe(false)
        await useStateStore().hydrate("w")
        s.load("w")
        expect(s.fromDb).toBe(true)
    })
})
