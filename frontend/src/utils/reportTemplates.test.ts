import { describe, expect, it } from "vitest"
import { dependencyLevels, ecosystems, listOf, runReading, type SnapshotFacts } from "./readings"
import { describeChange, exportMarkdown, pdfBlocks } from "./reportCells"
import { cellNumbers, fromMarkdown, isCell, toMarkdown, type Block } from "./reportDoc"
import { buildTemplate, fromSaved, TEMPLATES, toTemplate, tally } from "./reportTemplates"

const facts = (over: Partial<SnapshotFacts> = {}): SnapshotFacts => ({
    tables: new Set(["files", "components", "component_connections_direct", "snippets", "modules", "rules"]),
    fileColumns: new Set(["role", "codesmells__code_health", "git__last_change_age_in_days"]),
    componentColumns: new Set(["codesmells__hotspot_score", "java__spring__beans"]),
    summary: {}, snapshot: {},
    roles: { production: { files: 10, lines: 1000 } },
    production: { files: 10, lines: 1000 },
    languages: [{ language: "Java", files: 10, lines: 1000 }],
    components: 5, moduleKinds: {}, commits: 100, authors: 4,
    rules: { applicable: 0, violations: 0 }, tangles: 0, reactImporters: 0,
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
        expect(out.text).toBe("No dependency rule applies to this snapshot.")
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
        expect(built.skipped.map(s => s.section)).toEqual(["Dependency rules", "Hotspots"])
        expect(built.skipped[1].why).toBe("no git history")
        const withRules = buildTemplate(t, { facts: facts({ rules: { applicable: 2, violations: 1 } }), ecosystems: [], params: {} })
        expect(withRules.skipped).toEqual([])
    })

    it("builds every template on a sparse snapshot, ending on a line to type", () => {
        for (const t of TEMPLATES) {
            const { blocks } = buildTemplate(t, { facts: facts(), ecosystems: [], params: { component: "core" } })
            expect(blocks.length, t.id).toBeGreaterThan(2)
            expect(isCell(blocks[blocks.length - 1]), t.id).toBe(false)
            expect(tally(blocks).sections, t.id).toBeGreaterThan(0)
        }
    })

    it("numbers slots as the figures they will be; readings take no number", () => {
        const t = TEMPLATES.find(x => x.id === "architecture-review")!
        const { blocks } = buildTemplate(t, { facts: facts(), ecosystems: [], params: {} })
        const labels = [...cellNumbers(blocks).values()]
        expect(labels.filter(l => l.startsWith("Figure"))).toEqual(["Figure 1", "Figure 2"])
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
        expect(pdf.map(b => b.kind)).toEqual(["h2", "p"])
        expect(pdf[1].runs?.map(r => r.text).join("")).toBe("It holds 3 files.")
        const out = exportMarkdown("R", [], blocks, { workspace: "w", label: x => x, figureFile: () => null })
        expect(out).not.toContain("prompt")
        expect(out).not.toContain("Hotspots")
        expect(out).toContain("It holds **3** files.")
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
