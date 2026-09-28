import { describe, expect, it } from "vitest"
import { duplicateNames, globRegExp, inferEdges, inversions, resolveRawImports, layerOf, reachability, sameNamedFiles, type FileEdge } from "./checks"

const e = (from: string, to: string, names: string[] = []): FileEdge => ({ from, to, names })

describe("layers", () => {
    it("reads a layer from class-name suffixes before folders", () => {
        expect(layerOf("src/main/java/org/acme/order/OrderController.java")?.id).toBe("entry")
        expect(layerOf("src/main/java/org/acme/web/OrderService.java")?.id).toBe("application")
        expect(layerOf("frontend/src/utils/java.ts")?.id).toBe("utilities")
        expect(layerOf("frontend/src/composables/useChartTheme.ts")?.id).toBe("composables")
        expect(layerOf("frontend/src/workers/db.worker.ts")).toBeNull()
        expect(layerOf("frontend/src/composables/useConnectionsModel.ts")?.id).toBe("composables")
    })
    it("flags imports from a lower layer into a higher one", () => {
        const prod = new Set(["f/src/utils/java.ts", "f/src/composables/useChartTheme.ts", "f/src/utils/history.ts", "f/src/stores/data.ts", "f/src/pages/x.vue"])
        const inv = inversions([
            e("f/src/utils/java.ts", "f/src/composables/useChartTheme.ts", ["chartTheme"]),
            e("f/src/utils/history.ts", "f/src/stores/data.ts"),
            e("f/src/pages/x.vue", "f/src/utils/java.ts"),
        ], prod)
        expect(inv.map(i => `${i.from.id}>${i.to.id}:${i.edges.length}`)).toEqual(["utilities>composables:1", "utilities>application:1"])
    })
})

describe("reachability", () => {
    const files = ["f/src/pages/index.vue", "f/src/utils/used.ts", "f/src/utils/dead.ts", "f/src/utils/tested.ts", "f/src/utils/tested.test.ts",
        "src/main/java/a/OrderService.java", "src/main/java/a/Helper.java", "cmd/tool/main.go", "cmd/tool/flags.go", "internal/scan/scan.go", "internal/scan/walk.go"]
    const tests = new Set(["f/src/utils/tested.test.ts"])
    const edges = [e("f/src/pages/index.vue", "f/src/utils/used.ts"), e("f/src/utils/tested.test.ts", "f/src/utils/tested.ts"), e("src/main/java/a/OrderService.java", "src/main/java/a/Helper.java"), e("cmd/tool/main.go", "internal/scan/scan.go")]
    const markers = new Map([["src/main/java/a/OrderService.java", new Set(["Service"])]])
    it("walks from what frameworks call, and tells dead from test-only", () => {
        const r = reachability(files, tests, edges, markers)
        expect(r.unreachable).toEqual(["f/src/utils/dead.ts"])
        expect(r.testOnly).toEqual(["f/src/utils/tested.ts"])
        expect(r.reached.has("src/main/java/a/Helper.java")).toBe(true)
        expect(r.roots.has("cmd/tool/flags.go")).toBe(true)
        expect(r.reached.has("internal/scan/walk.go")).toBe(true)
    })
    it("lets a person add roots", () => {
        const r = reachability(files, tests, edges, markers, { extraRoots: [globRegExp("f/src/utils/dead.*")] })
        expect(r.unreachable).toEqual([])
    })
    it("reads imports from files the engine did not parse", () => {
        const all = ["f/src/pages/about.vue", "f/src/components/report/Cell.vue", "f/src/components/Dead.vue", "f/src/utils/dead.ts", "f/src/composables/useThing.ts"]
        const inferred = inferEdges([
            { file: "f/src/pages/about.vue", content: "<template><ReportCell/></template><script setup>import { x } from '~/utils/dead'\nconst t = useThingValue()</script>" },
            { file: "f/src/components/Dead.vue", content: "<template><div/></template>" },
        ], all, new Map([["f/src/composables/useThing.ts", ["useThingValue"]]]))
        expect(inferred.map(e => e.to).sort()).toEqual(["f/src/components/report/Cell.vue", "f/src/composables/useThing.ts", "f/src/utils/dead.ts"])
        const r = reachability(all, new Set(), inferred, new Map())
        expect(r.unreachable).toEqual(["f/src/components/Dead.vue"])
    })
})

describe("globs", () => {
    it("turns globs into path regexes", () => {
        expect(globRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true)
        expect(globRegExp("src/*.ts").test("src/a/c.ts")).toBe(false)
        expect(globRegExp("**/stories/**").test("x/stories/y/z.ts")).toBe(true)
    })
})

describe("duplicates", () => {
    it("finds a name declared in several files, ignoring common ones", () => {
        const prod = new Set(["a/fileRole.ts", "b/findings.ts", "c/x.ts"])
        const d = duplicateNames([
            { name: "isTestPath", file: "a/fileRole.ts", kind: "function", shared: true }, { name: "isTestPath", file: "b/findings.ts", kind: "function", shared: true },
            { name: "main", file: "a/fileRole.ts", kind: "function", shared: true }, { name: "main", file: "c/x.ts", kind: "function", shared: true },
            { name: "push", file: "a/fileRole.ts", kind: "function", shared: false }, { name: "push", file: "c/x.ts", kind: "function", shared: false },
        ], prod)
        expect(d).toEqual([{ name: "isTestPath", files: ["a/fileRole.ts", "b/findings.ts"] }])
    })
    it("finds same-named files, ignoring index and __init__", () => {
        expect(sameNamedFiles(["a/cycles.ts", "b/cycles.vue", "a/index.ts", "b/index.ts"])).toEqual([{ name: "cycles", files: ["a/cycles.ts", "b/cycles.vue"] }])
    })
})

describe("raw imports", () => {
    const files = ["f/src/stores/data.ts", "f/src/utils/query.ts", "f/src/utils/index.ts", "core/file/role.go", "core/file/walk.go", "core/file/role_test.go", "cmd/main.go",
        "src/main/java/org/acme/order/Order.java", "src/main/java/org/acme/order/Line.java", "src/main/java/org/acme/web/Api.java", "shop/models.py", "shop/app/__init__.py"]
    it("resolves aliased, relative, dotted and package imports", () => {
        const e = resolveRawImports([
            { file: "f/src/utils/query.ts", spec: "~/stores/data" }, { file: "f/src/stores/data.ts", spec: "../utils" }, { file: "f/src/stores/data.ts", spec: "vue" },
            { file: "cmd/main.go", spec: "github.com/acme/tool/core/file" },
            { file: "src/main/java/org/acme/web/Api.java", spec: "org.acme.order.Order" }, { file: "src/main/java/org/acme/web/Api.java", spec: "org.acme.order.*" },
            { file: "shop/app/__init__.py", spec: "shop.models" },
        ], files)
        expect(e.map(x => `${x.from}>${x.to}`)).toEqual([
            "f/src/utils/query.ts>f/src/stores/data.ts", "f/src/stores/data.ts>f/src/utils/index.ts",
            "cmd/main.go>core/file/role.go", "cmd/main.go>core/file/walk.go",
            "src/main/java/org/acme/web/Api.java>src/main/java/org/acme/order/Order.java", "src/main/java/org/acme/web/Api.java>src/main/java/org/acme/order/Line.java",
            "shop/app/__init__.py>shop/models.py",
        ])
    })
})
