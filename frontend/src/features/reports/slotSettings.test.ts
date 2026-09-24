import { describe, expect, it } from "vitest"
import { askedSettings, compareSettings, viewName } from "./slotSettings"

describe("slot settings", () => {
    it("reads a slot's route as the view's own settings, defaults included where they matter", () => {
        expect(askedSettings("/views/connections?level=groups")).toEqual([
            { label: "View", asked: "Connections", got: undefined, ok: true },
            { label: "Shown as", asked: "Graph", got: undefined, ok: true },
            { label: "Level", asked: "By group", got: undefined, ok: true },
        ])
        expect(askedSettings("/views/git/activity?tab=effort").map(r => `${r.label}: ${r.asked}`)).toEqual(["View: Activity", "Tab: Effort"])
        expect(viewName("/views/components/hotspots")).toBe("Hotspots")
    })

    it("checks a capture against the ask, naming what differs", () => {
        const rows = compareSettings("/views/connections?level=groups", "/views/connections?level=components&source=git")
        expect(rows.filter(r => !r.ok).map(r => `${r.label}: asks ${r.asked}, taken as ${r.got}`)).toEqual([
            "Level: asks By group, taken as Components",
            "Connections: asks Imports, taken as Changed together",
        ])
        expect(compareSettings("/views/connections?level=groups", "/views/connections?level=groups&q=x").every(r => r.ok)).toBe(true)
        expect(compareSettings("/views/libraries", "/views/components/hotspots")[0]).toMatchObject({ label: "View", ok: false, got: "Hotspots" })
    })
})
