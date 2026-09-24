import { describe, expect, it } from "vitest"
import { buildConfig, countsOf, parseConfig } from "./workspaceConfig"

describe("workspace config", () => {
    it("round-trips groups, lenses, merges and arrangements, and drops other keys", () => {
        const groups = parseConfig(JSON.stringify({ version: 4, groups: [{ id: "g", name: "Billing", dimension: "Domain", members: [{ kind: "component", name: "billing" }], color: "#000", createdAt: 1 }] })).groups
        const cfg = buildConfig(groups, [{ name: "Domain", cut: "vertical", order: 0, hue: 0, description: "", createdAt: 1 }], { jeff: "Jeff" }, { "layout:Domain": { a: [1, 2] }, "lens.active": "Domain", "studio.way.Domain": "role" })
        const back = parseConfig(JSON.stringify(cfg))
        expect(countsOf(back)).toEqual({ groups: 1, lenses: 1, aliases: 1, layouts: 2, queries: 0 })
        expect(back.groups[0].name).toBe("Billing")
        expect(back.dimensions[0].cut).toBe("vertical")
    })

    it("refuses what is not a config", () => {
        expect(() => parseConfig("[1,2]")).toThrow(/not an Archstats/)
        expect(() => parseConfig("{")).toThrow(/not JSON/)
        expect(() => parseConfig(JSON.stringify({ format: "archstats-workspace", version: 9 }))).toThrow(/newer/)
    })
})
