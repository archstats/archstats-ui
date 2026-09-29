import { describe, expect, it } from "vitest"
import { EMPTY_FACTS, VUE, classify, detectFramework, languageOf, profileById, type ClassFacts } from "./frameworkProfiles"

const facts = (name: string, o: Partial<{ file: string; annotations: string[]; imports: string[]; usedImports: string[]; isInterface: boolean }> = {}): ClassFacts => ({
  ...EMPTY_FACTS, name, file: o.file,
  annotations: new Set(o.annotations ?? []), imports: new Set(o.imports ?? []),
  ...(o.usedImports ? { usedImports: new Set(o.usedImports) } : {}),
  isInterface: o.isInterface ?? false,
})
const component = (file: string) => facts(file.split("/").pop()!.replace(/\..*$/, ""), { file, annotations: ["vue_component"], imports: ["vue"] })

describe("Vue", () => {
  it("counts a .vue file as the TypeScript it is written in", () => {
    // A Vue app in plain JavaScript has no .ts file at all.
    expect(languageOf(["src/App.vue", "src/components/Panel.vue", "src/main.js", "server/main.go"])).toBe("typescript")
  })

  it("is detected from its components and its imports", () => {
    const codebase = [
      ...Array.from({ length: 20 }, (_, i) => component(`src/components/C${i}.vue`)),
      ...Array.from({ length: 30 }, (_, i) => facts(`helper${i}`, { file: `src/lib/h${i}.ts` })),
    ]
    const r = detectFramework(codebase, "typescript")
    expect(r.id).toBe(VUE.id)
    expect(r.confident).toBe(true)
  })

  it("puts pages, layouts and the root apart from the components they use", () => {
    const p = profileById(VUE.id)
    expect(classify(p, component("frontend/src/pages/views/units.vue"))).toBe("pages")
    expect(classify(p, component("src/layouts/default.vue"))).toBe("pages")
    expect(classify(p, component("src/App.vue"))).toBe("pages")
    expect(classify(p, component("src/features/units/components/ShapeLanding.vue"))).toBe("components")
  })

  it("reads stores, composables, clients and types from the script side", () => {
    const p = profileById(VUE.id)
    expect(classify(p, facts("useSettingsStore", { file: "src/stores/settings.ts", imports: ["pinia"], usedImports: ["pinia"] }))).toBe("stores")
    expect(classify(p, facts("useUnitsModel", { file: "src/features/units/useUnitsModel.ts", imports: ["vue"], usedImports: ["vue"] }))).toBe("composables")
    expect(classify(p, facts("fetchReport", { file: "src/api.ts", imports: ["ofetch"], usedImports: ["ofetch"] }))).toBe("data")
    expect(classify(p, facts("UnitNode", { file: "src/types.ts", isInterface: true }))).toBe("models")
    expect(classify(p, facts("formatBytes", { file: "src/format.ts" }))).toBe("unclassified")
  })
})
