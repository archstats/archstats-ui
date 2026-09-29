import { describe, expect, it } from "vitest"
import { dependencyLevels, ecosystems, listOf, runReading, type SnapshotFacts } from "./readings"
import { describeChange, exportMarkdown, pdfBlocks } from "./reportCells"
import { cellNumbers, fromMarkdown, isCell, toMarkdown, type Block } from "./reportDoc"
import { bestTemplate, buildTemplate, fromSaved, hasEvidence, TEMPLATES, toTemplate, tally } from "./reportTemplates"

const facts = (over: Partial<SnapshotFacts> = {}): SnapshotFacts => ({
    tables: new Set(["files", "components", "component_connections_direct", "snippets", "modules", "rules"]),
    fileColumns: new Set(["role", "codesmells__code_health", "git__last_change_age_in_days"]),
    componentColumns: new Set(["codesmells__hotspot_score", "java__spring__beans"]),
    summary: {}, snapshot: {},
    roles: { production: { files: 10, lines: 1000 } },
    production: { files: 10, lines: 1000 },
    languages: [{ language: "Java", files: 10, lines: 1000 }],
    components: 5, moduleKinds: {}, commits: 100, authors: 4,
    revision: 4, rules: { applicable: 0, violations: 0 }, tangles: 0, reactImporters: 0, vueComponents: 0, markers: new Set(), indirectColumns: new Set(),
    moduleTypes: {}, mobileApps: [],
    ...over,
})

describe("readings", () => {
    it("counts dependency levels with each tangle as one node", () => {
        // a → b → c, and c ⇄ d is a tangle: a, b, {c, d} is three levels.
        const edges: Array<[string, string]> = [["a", "b"], ["b", "c"], ["c", "d"], ["d", "c"]]
        expect(dependencyLevels(edges, new Map([["c", "#1"], ["d", "#1"]]))).toBe(3)
        expect(dependencyLevels([], new Map())).toBe(0)
    })

    it("reads ecosystems from the evidence, saying which", () => {
        const spring = ecosystems(facts({ summary: { java__spring__beans: 750, java__jpa__entities: 157 }, moduleKinds: { maven: 13 } }))
        expect(spring.map(e => e.id)).toEqual(["spring", "jvm"])
        expect(spring[0].why).toBe("750 Spring beans, 157 JPA entities")
        const django = ecosystems(facts({ moduleKinds: { django: 39 }, languages: [{ language: "Python", files: 1, lines: 1000 }] }))
        expect(django.map(e => e.id)).toEqual(["django"])
        expect(ecosystems(facts({ languages: [{ language: "Go", files: 1, lines: 900 }, { language: "YAML", files: 1, lines: 100 }] })).map(e => e.id)).toEqual(["go"])
        // Admin JavaScript beside a Java back end, with functions the engine counts as components: neither Node nor React.
        const bundled = facts({ languages: [{ language: "Java", files: 1, lines: 700 }, { language: "JavaScript", files: 1, lines: 300 }], summary: { js__react__components: 263 } })
        expect(ecosystems(bundled).map(e => e.id)).toEqual([])
        const web = facts({ moduleKinds: { node: 7 }, languages: [{ language: "TypeScript", files: 1, lines: 1000 }], summary: { ts__react__components: 622 }, reactImporters: 535 })
        expect(ecosystems(web).map(e => e.id)).toEqual(["node", "react"])
    })

    it("writes a list the way a sentence does", () => {
        expect(listOf(["a"])).toBe("a")
        expect(listOf(["a", "b", "c"])).toBe("a, b and c")
    })

    it("says what a snapshot lacks instead of failing", async () => {
        const ctx = { query: async () => [], revision: 3, label: (x: string) => x, aliases: {} }
        const out = await runReading("rules", undefined, ctx)
        expect(out.absent).toBe(true)
        expect(out.text).toBe("No dependency rule applies to this code.")
        expect((await runReading("nope", undefined, ctx)).absent).toBe(true)
    })

    it("says which numbers in a paragraph moved", () => {
        const a = { reading: { text: "x", values: { tangles: 3, components: 40 } } }
        const b = { reading: { text: "y", values: { tangles: 2, components: 40 } } }
        expect(describeChange(a, b)).toBe("Since the last run: tangles 3 → 2.")
        expect(describeChange(a, a)).toBe("Unchanged since the last run.")
    })
})

describe("templates", () => {
    it("leaves out what the snapshot cannot fill, and names it", () => {
        const t = TEMPLATES.find(x => x.id === "architecture-review")!
        const built = buildTemplate(t, { facts: facts({ commits: 0 }), ecosystems: [], params: {} })
        expect(built.skipped.map(s => s.section)).toEqual(["Dependency rules", "Hotspots: complicated code that changes often"])
        expect(built.skipped[1].why).toBe("the scan has no git history")
        const withRules = buildTemplate(t, { facts: facts({ rules: { applicable: 2, violations: 1 } }), ecosystems: [], params: {} })
        expect(withRules.skipped).toEqual([])
    })

    it("builds every template on a sparse snapshot, ending on a line to type", () => {
        for (const t of TEMPLATES) {
            const { blocks } = buildTemplate(t, { facts: facts(), ecosystems: [], params: { component: "core" } })
            expect(blocks.length, t.id).toBeGreaterThan(2)
            expect(isCell(blocks[blocks.length - 1]), t.id).toBe(false)
            expect(tally(blocks).sections, t.id).toBeGreaterThan(0)
            expect(t.when, t.id).toMatch(/^Use it /)
        }
    })

    it("opens the gallery on the ecosystem that holds most of the code", () => {
        const php = facts({ languages: [{ language: "PHP", files: 900, lines: 86000 }, { language: "JavaScript", files: 40, lines: 14000 }], production: { files: 940, lines: 100000 }, moduleKinds: { composer: 60, node: 2 } })
        expect(bestTemplate(php, ecosystems(php))).toBe("php-review")
        const tiny = facts({ languages: [{ language: "Go", files: 3, lines: 100 }, { language: "Markdown", files: 30, lines: 900 }], production: { files: 33, lines: 1000 }, moduleKinds: { go: 1 } })
        expect(bestTemplate(tiny, ecosystems(tiny))).toBe("architecture-review")
    })

    it("keeps a template's explanations as explanations when saved", () => {
        const blocks: Block[] = [{ id: "e", kind: "p", text: "A *hotspot* is…", explain: true }, { id: "w", kind: "p", text: "We found three." }]
        const t = toTemplate(blocks, { promptParagraphs: true, pinRoute: () => null })
        expect(t.map(b => (isCell(b) ? "" : `${b.text}|${b.prompt ?? ""}|${!!b.explain}`))).toEqual(["A *hotspot* is…||true", "|We found three.|false"])
        const saved = { id: "s", name: "S", summary: "", from: "x", savedAt: "", blocks: t }
        expect(fromSaved(saved, false).filter(b => !isCell(b) && b.explain)).toHaveLength(0)
    })

    it("knows a template that would write nothing", () => {
        expect(hasEvidence([{ id: "h", kind: "h2", text: "A" }, { id: "p", kind: "p", text: "", prompt: "Write" }])).toBe(false)
    })

    it("counts a table taken from a view as a table, not a figure", () => {
        const slot = (kind: "table" | "figure") => ({ id: kind, kind: "cell" as const, cell: { id: kind, spec: { type: "slot" as const, kind, route: "/", view: "V", hint: "" }, output: null } }) as unknown as Block
        const t = tally([slot("table"), slot("table"), slot("figure")])
        expect([t.slotTables, t.figures, t.slots]).toEqual([2, 1, 3])
    })

    it("explains each section's terms unless asked not to", () => {
        const t = TEMPLATES.find(x => x.id === "architecture-review")!
        const on = buildTemplate(t, { facts: facts(), ecosystems: [], params: {} })
        const off = buildTemplate(t, { facts: facts(), ecosystems: [], params: {}, explain: false })
        expect(tally(on.blocks).explanations).toBeGreaterThan(4)
        expect(tally(off.blocks).explanations).toBe(0)
        expect(tally(off.blocks).readings).toBe(tally(on.blocks).readings)
        const text = on.blocks.map(b => (isCell(b) ? "" : b.text)).join(" ")
        expect(text).toContain("A *tangle* is")
        expect(text).toContain("A *hotspot* is")
    })

    it("writes a framework template from the framework's own evidence, and leaves out what the scan lacks", () => {
        const t = TEMPLATES.find(x => x.id === "spring-review")!
        const bare = buildTemplate(t, { facts: facts(), ecosystems: [], params: {} })
        expect(bare.skipped.map(s => s.section)).toContain("The web layer: how the controllers are split up")
        const spring = facts({
            tables: new Set(["files", "components", "component_connections_direct", "units", "unit_markers", "unit_connections"]),
            markers: new Set(["annotation:RestController", "annotation:Entity", "annotation:Transactional", "annotation:ConditionalOnProperty"]),
        })
        const built = buildTemplate(t, { facts: spring, ecosystems: [], params: {} })
        expect(built.skipped.map(s => s.section)).not.toContain("The web layer: how the controllers are split up")
        const readings = built.blocks.flatMap(b => (isCell(b) && b.cell.spec.type === "reading" ? [`${b.cell.spec.reading}:${b.cell.spec.params?.lane ?? ""}`] : []))
        expect(readings).toEqual(expect.arrayContaining(["roles:", "layers:", "role:controllers", "role:entities"]))
        const slots = built.blocks.flatMap(b => (isCell(b) && b.cell.spec.type === "slot" ? [b.cell.spec.route] : []))
        expect(slots).toContain("/views/units?flow=controllers,services")
    })

    it("asks for a component before a quick win can say what it affects", () => {
        const t = TEMPLATES.find(x => x.id === "change-impact")!
        const f = facts({ tables: new Set(["files", "components", "component_connections_direct", "component_connections_indirect", "git_component_shared_commits"]), roles: { production: { files: 10, lines: 1000 }, test: { files: 3, lines: 90 } } })
        expect(buildTemplate(t, { facts: f, ecosystems: [], params: {} }).skipped.map(s => s.why)).toEqual(["no component is chosen", "no component is chosen", "no component is chosen"])
        const chosen = buildTemplate(t, { facts: f, ecosystems: [], params: { component: "o'core" } })
        expect(chosen.skipped).toEqual([])
        const sql = chosen.blocks.flatMap(b => (isCell(b) && b.cell.spec.type === "sql" ? [b.cell.spec.sql] : []))
        expect(sql).toHaveLength(4)
        expect(sql.every(q => q.includes("'o''core'"))).toBe(true)
    })

    it("numbers slots as the figures they will be; readings take no number", () => {
        const t = TEMPLATES.find(x => x.id === "architecture-review")!
        const { blocks } = buildTemplate(t, { facts: facts(), ecosystems: [], params: {} })
        const labels = [...cellNumbers(blocks).values()]
        expect(labels.filter(l => l.startsWith("Figure"))).toEqual(["Figure 1", "Figure 2", "Figure 3", "Figure 4"])
        const readings = blocks.filter(b => isCell(b) && b.cell.spec.type === "reading")
        expect(readings.every(b => !cellNumbers(blocks).has(b.id))).toBe(true)
    })

    it("keeps prompts through Markdown and out of every export", () => {
        const blocks: Block[] = [
            { id: "h", kind: "h2", text: "Findings" },
            { id: "p", kind: "p", text: "", prompt: "What the reader should leave with." },
            { id: "r", kind: "cell", cell: { spec: { type: "reading", reading: "size" }, title: "", caption: "", output: { reading: { text: "It holds **3** files.", values: {} } }, ranOn: null } },
            { id: "s", kind: "cell", cell: { spec: { type: "slot", kind: "figure", view: "Hotspots", route: "/views/components/hotspots", hint: "Components" }, title: "Hotspots", caption: "", output: null, ranOn: null } },
        ]
        const md = toMarkdown(blocks)
        expect(md).toContain("<!-- prompt: What the reader should leave with. -->")
        const back = fromMarkdown(md)
        expect(back[1]).toMatchObject({ kind: "p", text: "", prompt: "What the reader should leave with." })
        const pdf = pdfBlocks(blocks, { workspace: "w", label: x => x, figure: () => null })
        // The unfilled slot is left out, and said to be: the last line names it.
        expect(pdf.map(b => b.kind)).toEqual(["h2", "p", "p"])
        expect(pdf[1].runs?.map(r => r.text).join("")).toBe("It holds 3 files.")
        expect(pdf[2].runs?.[0].text).toMatch(/^Not included: Hotspots \(figure, from Hotspots\)/)
        const out = exportMarkdown("R", [], blocks, { workspace: "w", label: x => x, figureFile: () => null })
        expect(out).not.toContain("prompt")
        expect(out).not.toContain("**Hotspots**")
        expect(out).toContain("Not included: Hotspots")
        expect(out).toContain("It holds **3** files.")
    })

    it("prints what was filled: no gaps in numbering, no explanation of a missing figure, no instructions, row counts", () => {
        const slot = (id: string, title: string): Block => ({ id, kind: "cell", cell: { spec: { type: "slot", kind: "table", view: "Connections", route: "/views/connections", hint: "" }, title, caption: "", output: null, ranOn: null } })
        const table = (id: string, title: string, rows: number, total: number): Block => ({ id, kind: "cell", cell: { spec: { type: "sql", sql: "SELECT 1", limit: rows }, title, caption: "", output: { table: { columns: [{ id: "a", label: "A", numeric: false }], rows: Array.from({ length: rows }, (_, i) => ({ a: String(i) })), total } }, ranOn: null } })
        const blocks: Block[] = [
            table("t1", "First", 2, 2),
            { id: "e", kind: "p", text: "In the dependency matrix each row…", beforeSlot: true },
            slot("s", "Dependency matrix"),
            table("t2", "Second", 2, 170),
            { id: "r", kind: "cell", cell: { spec: { type: "reading", reading: "focus" }, title: "", caption: "", output: { reading: { text: "Choose a component for this paragraph.", values: {}, absent: true, instruction: true } }, ranOn: null } },
        ]
        const pdf = pdfBlocks(blocks, { workspace: "w", label: x => x, figure: () => null })
        expect(pdf.filter(b => b.kind === "table").map(b => b.title)).toEqual(["Table 1. First", "Table 2. Second"])
        expect(pdf.find(b => b.title === "Table 2. Second")?.caption).toBe("2 of 170 rows.")
        const text = pdf.flatMap(b => b.runs ?? []).map(r => r.text).join(" ")
        expect(text).not.toContain("In the dependency matrix")
        expect(text).not.toContain("Choose a component")
        expect(text).toContain("Not included: Dependency matrix (table, from Connections)")
    })

    it("saves structure, not results: captures and pins become slots, paragraphs prompts", () => {
        const blocks: Block[] = [
            { id: "h", kind: "h2", text: "Coupling" },
            { id: "p", kind: "p", text: "The **core** is imported by everything." },
            { id: "c", kind: "cell", cell: { spec: { type: "capture", kind: "figure", route: "/views/connections", view: "Connections" }, title: "Graph", caption: "As of May.", output: { figure: "x.png" }, ranOn: null } },
            { id: "q", kind: "cell", cell: { spec: { type: "pin", pinId: "p1" }, title: "", caption: "", output: null, ranOn: null } },
            { id: "t", kind: "cell", cell: { spec: { type: "sql", sql: "SELECT 1", limit: 5 }, title: "One", caption: "", output: { table: { columns: [], rows: [], total: 0 } }, ranOn: { scanId: "s", label: "l", commit: "", revision: 3, at: "" } } },
        ]
        const kept = toTemplate(blocks, { promptParagraphs: true, pinRoute: id => (id === "p1" ? { title: "Tangle", route: "/views/components/cycles", view: "Cycles" } : null) })
        expect(kept[1]).toMatchObject({ kind: "p", text: "", prompt: "The core is imported by everything." })
        expect((kept[2] as any).cell.spec).toEqual({ type: "slot", kind: "figure", view: "Connections", route: "/views/connections", hint: "Graph" })
        expect((kept[3] as any).cell.spec.view).toBe("Cycles")
        expect((kept[4] as any).cell.output).toBeNull()
        expect((kept[4] as any).cell.ranOn).toBeNull()
        const fresh = fromSaved({ id: "t", name: "n", summary: "", from: "w", savedAt: "", blocks: kept })
        expect(fresh.map(b => b.id)).not.toContain(kept[0].id)
        expect(fresh[fresh.length - 1]).toMatchObject({ kind: "p", text: "" })
    })
})

describe("mobile", () => {
    it("reads mobile ecosystems from the apps the scan found", () => {
        const android = ecosystems(facts({ mobileApps: [{ name: "app", platform: "android" }], moduleKinds: { gradle: 36 }, moduleTypes: { "android-application": 2, "android-library": 30 } }))
        expect(android.map(e => e.id)).toContain("android")
        expect(android.find(e => e.id === "android")!.why).toBe("the app app")
        const kmp = ecosystems(facts({ mobileApps: [{ name: "tivi", platform: "ios" }, { name: "android-app", platform: "android" }], moduleTypes: { "kotlin-multiplatform": 40 } }))
        expect(kmp.map(e => e.id)).toEqual(expect.arrayContaining(["android", "ios", "kmp"]))
        const flutter = ecosystems(facts({ mobileApps: [{ name: "wonders", platform: "flutter" }], languages: [{ language: "Dart", files: 190, lines: 30000 }], production: { files: 190, lines: 30000 } }))
        expect(flutter.map(e => e.id)).toContain("flutter")
        expect(flutter.map(e => e.id)).not.toContain("android")
    })

    it("builds each mobile template, skipping what an old snapshot cannot fill", () => {
        for (const id of ["android-review", "ios-review", "flutter-review", "react-native-review", "kmp-review"]) {
            const t = TEMPLATES.find(x => x.id === id)!
            expect(t, id).toBeTruthy()
            const old = buildTemplate(t, { facts: facts(), ecosystems: [], params: {} })
            expect(old.skipped.map(s => s.why).join(" "), id).toMatch(/scan again|classes|defines no modules/)
            const full = buildTemplate(t, { facts: facts({ tables: new Set(["files", "components", "units", "unit_markers", "unit_connections", "app_declarations", "deployables", "deployable_dependencies", "modules"]), moduleKinds: { gradle: 3 }, mobileApps: [{ name: "app", platform: "android" }] }), ecosystems: [], params: {} })
            expect(full.skipped.filter(s => s.section !== "Hotspots" && s.section !== "Objective-C"), id).toEqual([])
        }
    })

    it("lists an app's samples and previews after it", () => {
        const e = ecosystems(facts({ mobileApps: [{ name: "isowords", platform: "ios" }, { name: "cubecorepreview", platform: "ios" }, { name: "appclip", platform: "ios" }] }))
        expect(e.find(x => x.id === "ios")!.why).toBe("2 apps isowords and appclip and 1 sample app")
    })
})

describe("figures", () => {
    const slots = (id: string, f: SnapshotFacts) => buildTemplate(TEMPLATES.find(t => t.id === id)!, { facts: f, ecosystems: ecosystems(f), params: { component: "a" } }).blocks
        .filter(isCell).map(b => b.cell.spec).filter(s => s.type === "slot") as Array<{ route: string; take?: string; kind: string }>

    it("draws the structure as the roles' floors when the scan has classes, at any size", () => {
        const withUnits = facts({ tables: new Set([...facts().tables, "units"]), components: 900 })
        expect(slots("architecture-review", withUnits).some(s => s.take === "How the layers lean")).toBe(true)
        // Without classes: the graph while it stays legible, nothing past that.
        expect(slots("architecture-review", facts()).some(s => s.route.startsWith("/views/connections?level="))).toBe(true)
        expect(slots("architecture-review", facts({ components: 900 })).some(s => s.route.startsWith("/views/connections?level="))).toBe(false)
    })

    it("names the figure it wants on every view that shows more than one", () => {
        const f = facts({ tables: new Set([...facts().tables, "units", "git_component_shared_commits"]), summary: { git__commits__last_30_days: 5 }, fileColumns: new Set([...facts().fileColumns, "codesmells__hotspot_score", "git__age_in_days"]) })
        for (const t of TEMPLATES) {
            for (const s of slots(t.id, f)) {
                if (/^\/views\/(units|git\/activity|git\/authors)|^\/$/.test(s.route.split("?")[0])) expect(s.take, `${t.id}: ${s.route}`).toBeTruthy()
            }
        }
    })

    it("plots the main sequence only where some code is abstract", () => {
        const plot = (f: SnapshotFacts) => slots("load-bearing", f).map(s => s.route).find(r => r.includes("view=plot"))
        expect(plot(facts({ componentColumns: new Set([...facts().componentColumns, "modularity__coupling__dependents"]), abstractComponents: 12 }))).toContain("preset=dms")
        expect(plot(facts({ componentColumns: new Set([...facts().componentColumns, "modularity__coupling__dependents"]), abstractComponents: 0 }))).toContain("preset=betweenness-churn")
    })

    it("leaves out the drawings that print as a cloud", () => {
        const f = facts({ tables: new Set([...facts().tables, "units", "git_component_shared_commits"]) })
        for (const t of TEMPLATES) {
            const routes = slots(t.id, f).map(s => s.route)
            expect(routes.filter(r => r.includes("source=git&level=")), t.id).toEqual([])
            expect(routes.filter(r => r.includes("tab=effort")), t.id).toEqual([])
        }
    })
})
