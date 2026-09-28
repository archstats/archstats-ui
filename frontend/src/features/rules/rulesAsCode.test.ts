import { describe, expect, it } from "vitest"
import { forbiddenPairs, globSql, groupSql, ruleGroup, rulesYaml } from "./rulesAsCode"

describe("rules as code", () => {
    it("pins the separators so a single star stays inside one folder", () => {
        expect(globSql("src/utils/report*", "f.name")).toBe("(f.name GLOB 'src/utils/report*' AND (length(f.name) - length(replace(f.name, '/', ''))) = 2)")
        expect(globSql("src/**/report*", "f.name")).toBe("f.name GLOB 'src/*report*'")
    })
    it("writes a group by its patterns when it is a live pattern query, else by what it holds", () => {
        const comps = new Map([["src/utils", { whole: true }], ["src/stores", { whole: false }]])
        const files = new Set(["src/utils/a.ts", "src/stores/b.ts"])
        const live = ruleGroup({ id: "g", name: "Util", mode: "live", query: "src/utils/**\n!src/utils/*.test.ts" },
            [{ raw: "src/utils/**", exclude: false, plainGlob: true }, { raw: "!src/utils/*.test.ts", exclude: true, plainGlob: true }], comps, files, f => f.slice(0, f.lastIndexOf("/")))
        expect(live.patterns).toEqual(["src/utils/**", "!src/utils/*.test.ts"])
        const fixed = ruleGroup({ id: "g", name: "Util", mode: "fixed" }, null, comps, files, f => f.slice(0, f.lastIndexOf("/")))
        expect(fixed).toMatchObject({ components: ["src/utils"], files: ["src/stores/b.ts"] })
        expect(groupSql(live, "/")).toContain("AND NOT (")
    })
    it("forbids what the layers and pairs forbid, and nothing else unless told to", () => {
        const g = (id: string) => ({ id, name: id, patterns: [], components: [id], files: [] })
        const gs = [g("ui"), g("app"), g("db"), g("misc")]
        const d = { layers: ["ui", "app", "db"], pairs: [{ from: "ui", to: "db", verdict: "forbidden" as const }], unset: "unjudged" as const }
        expect(forbiddenPairs(gs, d).map(([a, b]) => `${a.id}>${b.id}`)).toEqual(["ui>db", "app>ui", "db>ui", "db>app"])
        expect(rulesYaml("Layers", gs, d, "/", "test")).toContain("expect: 0")
    })
})
