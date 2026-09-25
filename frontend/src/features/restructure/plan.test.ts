import { describe, expect, it } from "vitest"
import { evaluate, fromFolders, importSites, misfits, adjacency, moves, place, subjectOf, type Plan } from "./plan"
import { restructureScript, rewriteImports } from "./rewrite"
import type { FileEdge } from "~/features/checks/checks"

const e = (from: string, to: string): FileEdge => ({ from, to, names: [] })
const files = ["s/utils/reportDoc.ts", "s/utils/reportDoc.test.ts", "s/utils/sqlLang.ts", "s/stores/reports.ts", "s/pages/report.vue", "s/utils/misc.ts"]
const tests = new Set(["s/utils/reportDoc.test.ts"])
const plan: Plan = {
    ordered: true,
    modules: [
        { id: "pages", name: "Pages", dir: "", patterns: "s/pages/**", files: [] },
        { id: "report", name: "Report", dir: "s/features/report", patterns: "s/**/report*\n!s/pages/**", files: [] },
        { id: "sql", name: "SQL", dir: "s/features/sql", patterns: "", files: ["s/utils/sqlLang.ts"] },
    ],
}

describe("placement", () => {
    it("places by hand, then by the first matching pattern; tests follow their subject", () => {
        const p = place(plan, files, tests)
        expect(p.of.get("s/utils/reportDoc.ts")).toBe("report")
        expect(p.of.get("s/stores/reports.ts")).toBe("report")
        expect(p.of.get("s/utils/reportDoc.test.ts")).toBe("report")
        expect(p.of.get("s/utils/sqlLang.ts")).toBe("sql")
        expect(p.unplaced).toEqual(["s/utils/misc.ts"])
    })
    it("still reads after the moves: a module's folder claims what sits in it", () => {
        const after = ["s/features/report/reportDoc.ts", "s/features/sql/sqlLang.ts", "s/utils/misc.ts"]
        const p = place(plan, after, new Set())
        expect(p.of.get("s/features/report/reportDoc.ts")).toBe("report")
        expect(p.of.get("s/features/sql/sqlLang.ts")).toBe("sql")
        expect(p.unplaced).toEqual(["s/utils/misc.ts"])
    })
    it("finds a test's subject across conventions", () => {
        const has = (f: string) => ["a/x.ts", "p/app/views.py", "src/main/java/a/Order.java", "g/scan.go"].includes(f)
        expect(subjectOf("a/x.test.ts", has)).toBe("a/x.ts")
        expect(subjectOf("p/app/tests/test_views.py", has)).toBe("p/app/views.py")
        expect(subjectOf("src/test/java/a/OrderTest.java", has)).toBe("src/main/java/a/Order.java")
        expect(subjectOf("g/scan_test.go", has)).toBe("g/scan.go")
    })
})

describe("checks", () => {
    const prod = new Set(files.filter(f => !tests.has(f)))
    const edges = [e("s/pages/report.vue", "s/stores/reports.ts"), e("s/stores/reports.ts", "s/utils/reportDoc.ts"), e("s/utils/reportDoc.ts", "s/utils/sqlLang.ts"), e("s/utils/sqlLang.ts", "s/stores/reports.ts"), e("s/utils/sqlLang.ts", "s/pages/report.vue")]
    it("finds mutual pairs, cycles, upward imports and cohesion", () => {
        const p = place(plan, files, tests)
        const ev = evaluate(p.of, edges, prod, plan.modules.map(m => m.id))
        expect(ev.mutual).toEqual([{ a: "report", b: "sql", ab: 1, ba: 1 }])
        expect(ev.tangles[0]).toEqual(["pages", "report", "sql"])
        expect(ev.upward.map(x => x.to)).toEqual(["s/stores/reports.ts", "s/pages/report.vue"])
        expect(ev.modules.get("report")!.internal).toBe(1)
        expect(evaluate(p.of, [e("s/utils/reportDoc.ts", "s/utils/misc.ts")], prod).modules.get("report")!.external).toBe(1)
        expect(ev.crossing).toBe(4)
    })
    it("names files tied more to another module than their own", () => {
        const of = new Map([["a/x.ts", "A"], ["a/y.ts", "A"], ["b/z.ts", "B"], ["b/w.ts", "B"]])
        const { out, into } = adjacency([e("b/w.ts", "a/x.ts"), e("a/y.ts", "a/x.ts"), e("b/w.ts", "a/y.ts"), e("b/z.ts", "b/w.ts")])
        expect(misfits(of, new Set(of.keys()), out, into).map(m => `${m.file}>${m.to}`)).toEqual(["b/w.ts>A"])
    })
})

describe("moves", () => {
    it("keeps shared sub-folders, flags collisions and counts import sites", () => {
        const p = place(plan, files, tests)
        const { moves: mv, collisions } = moves(plan, p.of)
        expect(mv.map(m => `${m.from} -> ${m.to}`)).toEqual([
            "s/stores/reports.ts -> s/features/report/stores/reports.ts",
            "s/utils/reportDoc.test.ts -> s/features/report/utils/reportDoc.test.ts",
            "s/utils/reportDoc.ts -> s/features/report/utils/reportDoc.ts",
            "s/utils/sqlLang.ts -> s/features/sql/sqlLang.ts",
        ])
        expect(collisions).toEqual([])
        expect(importSites(mv, [e("s/pages/report.vue", "s/stores/reports.ts"), e("s/pages/report.vue", "s/utils/misc.ts")])).toEqual({ sites: 1, files: 1 })
    })
    it("leaves files already in the folder, and lands one source folder flat", () => {
        const p2: Plan = { ordered: false, modules: [{ id: "st", name: "Stores", dir: "s/stores", patterns: "s/stores/**", files: ["s/utils/misc.ts"] }] }
        const { moves: mv } = moves(p2, place(p2, files, tests).of)
        expect(mv.map(m => `${m.from} -> ${m.to}`)).toEqual(["s/utils/misc.ts -> s/stores/misc.ts"])
    })
    it("starts from today's folders", () => {
        expect(fromFolders("s", files).map(m => m.patterns)).toEqual(["s/pages/**", "s/stores/**", "s/utils/**"])
    })
})

describe("rewrite", () => {
    const known = new Set(["f/src/utils/reportDoc.ts", "f/src/stores/reports.ts", "f/src/pages/report.vue", "f/src/utils/index.ts", "f/src/utils/sql.ts"])
    const mv = { "f/src/utils/reportDoc.ts": "f/src/features/report/reportDoc.ts", "f/src/stores/reports.ts": "f/src/features/report/reports.store.ts" }
    const aliases = { "~/": "f/src" }
    it("rewrites alias and relative imports of moved files, and a moved file's own imports", () => {
        const page = `import { a } from "~/utils/reportDoc"\nimport { useReports } from '../stores/reports'\nimport x from "~/utils"\nimport vue from "vue"`
        expect(rewriteImports(page, "f/src/pages/report.vue", mv, aliases, known)).toBe(
            `import { a } from "~/features/report/reportDoc"\nimport { useReports } from '../features/report/reports.store'\nimport x from "~/utils"\nimport vue from "vue"`)
        const store = `import { a } from "../utils/reportDoc"\nimport { s } from "../utils/sql"\nconst m = await import("./x")`
        expect(rewriteImports(store, "f/src/stores/reports.ts", mv, aliases, known)).toBe(
            `import { a } from "./reportDoc"\nimport { s } from "../../utils/sql"\nconst m = await import("./x")`)
    })
    it("embeds the same function in a runnable script", () => {
        const script = restructureScript([{ from: "a/x.ts", to: "b/x.ts", module: "m" }], aliases)
        expect(script).toContain(`"a/x.ts": "b/x.ts"`)
        const body = script.slice(script.indexOf("const rewriteImports = ") + 23, script.indexOf("\n\nconst dry"))
        const fn = new Function(`return (${body})`)() as typeof rewriteImports
        expect(fn(`import y from "./x"`, "a/y.ts", { "a/x.ts": "b/x.ts" }, {}, new Set(["a/x.ts", "a/y.ts"]))).toBe(`import y from "../b/x"`)
    })
})
