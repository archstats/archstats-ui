import { describe, expect, it } from "vitest"
import { ecosystems, type SnapshotFacts } from "./readings"
import { isCell } from "./reportDoc"
import { bestTemplate, buildTemplate, TEMPLATES } from "./reportTemplates"

const facts = (over: Partial<SnapshotFacts> = {}): SnapshotFacts => ({
    tables: new Set(["files", "components", "component_connections_direct", "snippets", "modules"]),
    fileColumns: new Set(["role", "codesmells__code_health"]),
    componentColumns: new Set(),
    summary: {}, snapshot: {},
    roles: { production: { files: 500, lines: 60000 } },
    production: { files: 500, lines: 60000 },
    // archstats-ui: its TypeScript and its .vue files, with a Go back end beside them.
    languages: [{ language: "TypeScript", files: 280, lines: 30000 }, { language: "Vue", files: 220, lines: 25000 }, { language: "Go", files: 60, lines: 5000 }],
    components: 80, moduleKinds: { node: 1, go: 1 }, commits: 200, authors: 1,
    revision: 8, rules: { applicable: 0, violations: 0 }, tangles: 0, reactImporters: 0, vueComponents: 0, markers: new Set(), indirectColumns: new Set(),
    moduleTypes: {}, mobileApps: [],
    ...over,
})

describe("the Vue review", () => {
    it("is offered for a codebase of Vue components, and opens the gallery", () => {
        const vue = facts({ vueComponents: 228 })
        const found = ecosystems(vue)
        expect(found.map(e => e.id)).toEqual(expect.arrayContaining(["node", "vue"]))
        expect(found.find(e => e.id === "vue")!.why).toBe("228 Vue components")
        expect(bestTemplate(vue, found)).toBe("vue-review")
        // A handful of .vue files in a TypeScript workspace is not a Vue front end.
        expect(ecosystems(facts({ vueComponents: 3 })).map(e => e.id)).not.toContain("vue")
    })

    it("counts .vue lines as the front end's when there is no package.json", () => {
        const noPackage = facts({ moduleKinds: {}, production: { files: 45, lines: 8000 }, languages: [{ language: "Vue", files: 40, lines: 7000 }, { language: "JavaScript", files: 5, lines: 1000 }], vueComponents: 40 })
        expect(ecosystems(noPackage).map(e => e.id)).toEqual(["node", "vue"])
    })

    it("reads its roles from the Vue profile, and leaves out what an old scan lacks", () => {
        const t = TEMPLATES.find(x => x.id === "vue-review")!
        const old = buildTemplate(t, { facts: facts({ tables: new Set(["files", "components", "units"]) }), ecosystems: [], params: {} })
        expect(old.skipped.map(s => s.section)).toEqual(expect.arrayContaining(["Shared components", "Components nothing uses", "The largest components"]))

        const scanned = facts({
            tables: new Set(["files", "components", "component_connections_direct", "snippets", "units", "unit_markers", "unit_connections"]),
            markers: new Set(["filename:vue_component"]),
            vueComponents: 228,
        })
        const built = buildTemplate(t, { facts: scanned, ecosystems: [], params: {} })
        expect(built.skipped.map(s => s.section)).not.toContain("Shared components")
        const readings = built.blocks.flatMap(b => (isCell(b) && b.cell.spec.type === "reading" ? [`${b.cell.spec.reading}:${b.cell.spec.params?.profile ?? ""}:${b.cell.spec.params?.lane ?? ""}`] : []))
        expect(readings).toEqual(expect.arrayContaining(["roles:vue:", "layers:vue:", "role:vue:pages", "role:vue:components", "role:vue:composables", "role:vue:data"]))
        const slots = built.blocks.flatMap(b => (isCell(b) && b.cell.spec.type === "slot" ? [b.cell.spec.route] : []))
        expect(slots).toContain("/views/units?flow=components,composables")
    })
})
