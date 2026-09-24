import { describe, expect, it } from "vitest"
import { baseName, buildModuleGraph, dirName, dirTail, moduleName } from "./moduleGraph"
import type { UnitNode } from "~/composables/useUnitsModel"

function unit(id: string, file: string, kind = "function", lane = "views", weight = 1): UnitNode {
    return {
        id, kind, name: id, scope: file, component: "c", module: "", file,
        owner: "", lane, fanIn: 0, fanOut: 0, weight,
    }
}

describe("baseName / dirName", () => {
    it("reads the name an import would write", () => {
        expect(baseName("api/app/clients/ChatGPTClient.js")).toBe("ChatGPTClient")
        expect(dirName("api/app/clients/ChatGPTClient.js")).toBe("api/app/clients")
    })

    it("keeps a dotfile whole rather than reading it as an extension", () => {
        expect(baseName(".eslintrc")).toBe(".eslintrc")
    })

    it("names a package's entry file after its directory", () => {
        expect(moduleName("client/src/components/Messages/index.tsx")).toBe("Messages/index")
        expect(moduleName("./src/oscar/apps/basket/__init__.py")).toBe("basket/__init__")
        expect(moduleName("./index.ts")).toBe("index")
        expect(moduleName("api/app/clients/ChatGPTClient.js")).toBe("ChatGPTClient")
    })

    it("says a name several modules share with its directory", () => {
        const u = (id: string, file: string) => ({
            id, kind: "type", name: id, scope: file, component: "c", module: "",
            file, owner: "", lane: "x", fanIn: 0, fanOut: 0, weight: 1,
        })
        const g = buildModuleGraph([
            u("a", "src/oscar/apps/basket/views.py"), u("b", "src/oscar/apps/order/views.py"),
            u("c", "src/oscar/apps/order/models.py"),
        ] as any, [])
        expect(g.byPath.get("src/oscar/apps/basket/views.py")!.name).toBe("basket/views")
        expect(g.byPath.get("src/oscar/apps/order/views.py")!.name).toBe("order/views")
        expect(g.byPath.get("src/oscar/apps/order/models.py")!.name).toBe("models")
    })

    it("copes with a file at the root", () => {
        expect(baseName("index.ts")).toBe("index")
        expect(dirName("index.ts")).toBe("")
    })
})

describe("dirTail", () => {
    it("keeps the end of a path, which is the part that identifies it", () => {
        // Truncated from the right this reads "repos/eai-3540597-qp-aud…",
        // which says nothing about where the module lives.
        expect(dirTail("repos/eai-3540597-qp-audit/src/main/java/com/fedex/qp/audit/service/impl"))
            .toBe("…/audit/service/impl")
    })

    it("leaves a short path alone rather than marking it as shortened", () => {
        expect(dirTail("api/app/clients")).toBe("api/app/clients")
        expect(dirTail("src")).toBe("src")
    })

    it("has nothing to shorten at the repository root", () => {
        expect(dirTail("")).toBe("")
    })
})

describe("buildModuleGraph", () => {
    it("collects the units declared in one file into one module", () => {
        const g = buildModuleGraph([
            unit("ChatGPTClient", "a/ChatGPTClient.js", "type"),
            unit("buildPromptBody", "a/ChatGPTClient.js"),
        ], [])
        expect(g.modules).toHaveLength(1)
        expect(g.modules[0].units.map((u) => u.id)).toEqual(["ChatGPTClient", "buildPromptBody"])
    })

    it("names the module after the unit it is about, not the first one seen", () => {
        // The helper sorts ahead on nothing; the filename decides.
        const g = buildModuleGraph([
            unit("buildPromptBody", "a/ChatGPTClient.js"),
            unit("ChatGPTClient", "a/ChatGPTClient.js"),
        ], [])
        expect(g.modules[0].primary?.id).toBe("ChatGPTClient")
    })

    it("matches a primary across naming conventions", () => {
        // use-auth.ts declares useAuth. A literal comparison misses it, and
        // the module then claims to be about whatever sorted first.
        const g = buildModuleGraph([unit("useAuth", "hooks/use-auth.ts")], [])
        expect(g.modules[0].primary?.id).toBe("useAuth")
    })

    it("falls back to the most-referenced unit when nothing matches the filename", () => {
        const big = unit("Alpha", "a/index.ts", "type")
        big.fanIn = 9
        const g = buildModuleGraph([unit("Zeta", "a/index.ts", "type"), big], [])
        expect(g.modules[0].primary?.id).toBe("Alpha")
    })

    it("lifts unit references into module references", () => {
        const g = buildModuleGraph(
            [unit("a", "x.ts"), unit("b", "y.ts")],
            [{ from: "a", to: "b" }],
        )
        expect(g.edges).toHaveLength(1)
        expect(g.edges[0]).toMatchObject({ from: "x.ts", to: "y.ts" })
    })

    it("keeps the unit references that justify a module edge", () => {
        // "These two files are coupled" is a claim; the unit pairs are the
        // evidence, and the Region view shows them.
        const g = buildModuleGraph(
            [unit("a1", "x.ts"), unit("a2", "x.ts"), unit("b", "y.ts")],
            [{ from: "a1", to: "b" }, { from: "a2", to: "b" }],
        )
        expect(g.edges).toHaveLength(1)
        expect(g.edges[0].via).toEqual([{ from: "a1", to: "b" }, { from: "a2", to: "b" }])
    })

    it("does not make an edge out of a reference inside one file", () => {
        // ChatGPTClient calling its own helper is internal structure. Counted
        // as a dependency it would make every module look coupled to itself.
        const g = buildModuleGraph(
            [unit("ChatGPTClient", "a.js", "type"), unit("buildPromptBody", "a.js")],
            [{ from: "ChatGPTClient", to: "buildPromptBody" }],
        )
        expect(g.edges).toEqual([])
        expect(g.modules[0].dark).toBe(true)
    })

    it("counts distinct modules, not references, for fan-in", () => {
        const g = buildModuleGraph(
            [unit("a1", "x.ts"), unit("a2", "x.ts"), unit("b", "y.ts")],
            [{ from: "a1", to: "b" }, { from: "a2", to: "b" }],
        )
        expect(g.byPath.get("y.ts")!.fanIn).toBe(1)
    })

    it("marks a module nothing imports and that imports nothing as dark", () => {
        const g = buildModuleGraph(
            [unit("a", "x.ts"), unit("lonely", "z.ts"), unit("b", "y.ts")],
            [{ from: "a", to: "b" }],
        )
        expect(g.byPath.get("z.ts")!.dark).toBe(true)
        expect(g.byPath.get("x.ts")!.dark).toBe(false)
    })

    it("marks both modules of a mutual pair, so a cycle is visible on the module", () => {
        // Every mutual pair in both test codebases sits inside a single lane,
        // so a region built from traffic between lanes never contains one.
        // Marking the module is the only place it can reliably be seen.
        const g = buildModuleGraph(
            [unit("a", "x.ts"), unit("b", "y.ts"), unit("c", "z.ts")],
            [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "a", to: "c" }],
        )
        expect(g.byPath.get("x.ts")!.inCycle).toEqual(["y.ts"])
        expect(g.byPath.get("y.ts")!.inCycle).toEqual(["x.ts"])
        expect(g.byPath.get("z.ts")!.inCycle).toEqual([])
    })

    it("does not call a one-way dependency a cycle", () => {
        const g = buildModuleGraph(
            [unit("a", "x.ts"), unit("b", "y.ts")],
            [{ from: "a", to: "b" }],
        )
        expect(g.byPath.get("x.ts")!.inCycle).toEqual([])
    })

    it("reports density so the view can tell when the layer says nothing", () => {
        // One unit per file is Java: the module layer is the unit layer, and
        // drawing it would add a level of nesting that carries no information.
        const java = buildModuleGraph([unit("A", "A.java", "type"), unit("B", "B.java", "type")], [])
        expect(java.density).toBe(1)

        const js = buildModuleGraph([unit("a", "x.ts"), unit("b", "x.ts"), unit("c", "y.ts")], [])
        expect(js.density).toBe(1.5)
    })

    it("drops units with no file rather than collecting them under one blank module", () => {
        const g = buildModuleGraph([unit("a", "x.ts"), unit("ghost", "")], [])
        expect(g.modules).toHaveLength(1)
        expect(g.modules[0].path).toBe("x.ts")
    })

    it("takes the module's lane from the unit it is about", () => {
        // A file with one exported component and four helper functions is a
        // component module, however the helpers were classified.
        const g = buildModuleGraph([
            unit("Button", "Button.tsx", "type", "components"),
            unit("clampWidth", "Button.tsx", "function", "utils"),
            unit("toPx", "Button.tsx", "function", "utils"),
        ], [])
        expect(g.modules[0].lane).toBe("components")
    })

    it("sums its units' weight into the module's size", () => {
        const g = buildModuleGraph([
            unit("a", "x.ts", "function", "views", 40),
            unit("b", "x.ts", "function", "views", 60),
        ], [])
        expect(g.modules[0].lines).toBe(100)
    })

    it("can find one dependency by its two ends", () => {
        // A cell in the grid is one of these, and what an architect wants
        // from it is the code underneath, not just that it exists.
        const g = buildModuleGraph(
            [unit("a", "x.ts"), unit("b", "y.ts")],
            [{ from: "a", to: "b" }],
        )
        expect(g.between.get("x.ts\ny.ts")?.via).toEqual([{ from: "a", to: "b" }])
        expect(g.between.get("y.ts\nx.ts")).toBeUndefined()
    })

    it("says nothing about an empty codebase", () => {
        const g = buildModuleGraph([], [])
        expect(g.modules).toEqual([])
        expect(g.density).toBe(0)
    })
})
