import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import {
    EMPTY_FACTS, PROFILES, STRUCTURE, UNCLASSIFIED, classify, detectFramework, isMain, languageOf, looksLikeEntry, looksLikeModel,
    profileById, profilesFor, withUnclassified, type ClassFacts, type FrameworkProfile, type Language,
} from "./frameworkProfiles"
import { loadUnits } from "~/features/units/units"
import { layersOf } from "~/features/reports/anatomy"

// The structural profile and the machinery every profile stands on: what the
// unit loader puts in the facts, and what the shared rules can therefore see.

const facts = (name: string, o: Partial<Omit<ClassFacts, "name">> = {}): ClassFacts => ({ ...EMPTY_FACTS, name, ...o })
const structure = profileById("structure")

describe("looksLikeEntry", () => {
    it("is anything with a main, whatever references it", () => {
        expect(looksLikeEntry(facts("App", { methods: new Set(["main"]) }), { inDegree: 5, outDegree: 0 })).toBe(true)
    })
    it("is a unit called main, since the loader has no method names for a Go or Python program", () => {
        expect(isMain(facts("main"))).toBe(true)
        expect(looksLikeEntry(facts("main"), { inDegree: 0, outDegree: 0 })).toBe(true)
        expect(classify(structure, facts("main"), { inDegree: 0, outDegree: 0 })).toBe("entry")
        expect(classify(profileById("go-cli"), facts("main"))).toBe("commands")
    })
    it("is otherwise a unit nothing references that references something", () => {
        expect(looksLikeEntry(facts("Orphan"), { inDegree: 0, outDegree: 3 })).toBe(true)
        expect(looksLikeEntry(facts("Leaf"), { inDegree: 0, outDegree: 0 })).toBe(false)
        expect(looksLikeEntry(facts("Used"), { inDegree: 1, outDegree: 3 })).toBe(false)
        // A shape or a contract nothing references is unused, not an entry.
        expect(looksLikeEntry(facts("Point", { isRecord: true }), { inDegree: 0, outDegree: 3 })).toBe(false)
        expect(looksLikeEntry(facts("Port", { isInterface: true }), { inDegree: 0, outDegree: 3 })).toBe(false)
    })
})

describe("looksLikeModel", () => {
    it("is a record, or a type with few methods per field that reaches little", () => {
        expect(looksLikeModel(facts("Point", { isRecord: true }), { inDegree: 0, outDegree: 9 })).toBe(true)
        expect(looksLikeModel(facts("Money", { fields: 2, methodCount: 4 }), { inDegree: 0, outDegree: 1 })).toBe(true)
        expect(looksLikeModel(facts("Money", { fields: 2, methodCount: 7 }), { inDegree: 0, outDegree: 1 })).toBe(false)
        expect(looksLikeModel(facts("Money", { fields: 2, methodCount: 4 }), { inDegree: 0, outDegree: 3 })).toBe(false)
        expect(looksLikeModel(facts("Port", { isInterface: true, fields: 2 }), { inDegree: 0, outDegree: 0 })).toBe(false)
    })

    it("cannot see a Go struct, a Java record or a Python dataclass through the unit loader", async () => {
        // The engine records no field count and no record marker for any
        // unit, so loadUnits gives every unit fields 0 and isRecord false and
        // the rule can only fire for legacy Java snapshots read without units.
        // Every profile using it (structure, Vert.x, Dropwizard, Android,
        // Ktor, Flutter) is placing models by name and markers alone.
        const units = [
            { id: "internal/models.Order", kind: "type", name: "Order", component: "internal/models", owner: "", file: "internal/models/order.go" },
            { id: "com.acme.Money", kind: "type", name: "Money", component: "com.acme", owner: "", file: "src/com/acme/Money.java" },
            { id: "shop.models#Sku", kind: "type", name: "Sku", component: "shop", owner: "", file: "shop/models.py" },
        ]
        const markers = [
            { unit: "internal/models.Order", source: "struct_tag", key: "json", value: "id" },
            { unit: "shop.models#Sku", source: "annotation", key: "dataclass", value: null },
            { unit: "shop.models#Sku", source: "filename", key: "models", value: null },
        ]
        const all = await loadUnits(async (sql) => (sql.includes("FROM units") ? units : sql.includes("FROM unit_markers") ? markers : []), (v) => ["units", "unit_markers"].includes(v))
        for (const id of ["internal/models.Order", "com.acme.Money", "shop.models#Sku"]) {
            const f = all.get(id)!.facts
            expect(f.fields).toBe(0)
            expect(f.isRecord).toBe(false)
            expect(looksLikeModel(f, { inDegree: 9, outDegree: 0 })).toBe(false)
        }
        // So under the structural profile all three are unclassified.
        expect(classify(structure, all.get("internal/models.Order")!.facts, { inDegree: 9, outDegree: 0 })).toBe(UNCLASSIFIED)
        expect(classify(structure, all.get("com.acme.Money")!.facts, { inDegree: 9, outDegree: 0 })).toBe(UNCLASSIFIED)
        expect(classify(structure, all.get("shop.models#Sku")!.facts, { inDegree: 9, outDegree: 0 })).toBe(UNCLASSIFIED)
    })
})

describe("name suffixes", () => {
    it("do not match a name that is only the suffix", () => {
        expect(classify(structure, facts("OrderService"))).toBe("logic")
        expect(classify(structure, facts("Service"))).toBe(UNCLASSIFIED)
        expect(classify(structure, facts("Repository"))).toBe(UNCLASSIFIED)
        expect(classify(profileById("go-http"), facts("Handler"))).toBe(UNCLASSIFIED)
        expect(classify(profileById("go-http"), facts("Config"))).toBe(UNCLASSIFIED)
    })
    it("match a Go type that is only the suffix, since its package qualifies it", () => {
        // grpc.Server, store.Store and config.Config are the idiom, and the
        // service, store and config of a Go codebase are mostly named so.
        expect(classify(profileById("go-http"), facts("Server", { file: "internal/grpc/server.go" }))).toBe("handlers")
        expect(classify(profileById("go-http"), facts("Config", { file: "internal/config/config.go" }))).toBe("models")
        expect(classify(profileById("go-cli"), facts("Runner", { file: "internal/tidy/run.go" }))).toBe("logic")
        expect(classify(structure, facts("Store", { file: "db/store.go" }))).toBe("data")
        expect(classify(structure, facts("Store", { file: "db/Store.java" }))).toBe(UNCLASSIFIED)
    })
    it("are case-sensitive, so a lowercase Go function is not a type", () => {
        expect(classify(profileById("go-http"), facts("newHandler"))).toBe("handlers")
        expect(classify(profileById("go-http"), facts("handler"))).toBe(UNCLASSIFIED)
    })
})

describe("imports against used imports", () => {
    const file = new Set(["context", "database/sql", "fmt"])
    it("places by the imports the unit uses when the snapshot records them", () => {
        // One function in the file queries the database; the others do not.
        expect(classify(structure, facts("Query", { imports: file, usedImports: new Set(["database/sql"]) }))).toBe("data")
        expect(classify(structure, facts("Format", { imports: file, usedImports: new Set(["fmt"]) }))).toBe(UNCLASSIFIED)
        // Using none of the file's imports is an answer, not a missing one.
        expect(classify(structure, facts("Nothing", { imports: file, usedImports: new Set() }))).toBe(UNCLASSIFIED)
    })
    it("falls back to the file's imports when it does not", () => {
        expect(classify(structure, facts("Format", { imports: file }))).toBe("data")
    })
    it("reads every language's data packages, since the structural profile is every language's fallback", () => {
        for (const imp of ["database/sql", "gorm.io/gorm", "sqlalchemy.orm", "mongoose", "Microsoft.EntityFrameworkCore", "Doctrine\\ORM\\Mapping", "org.jetbrains.exposed.sql", "java.sql.Connection"]) {
            expect(classify(structure, facts("Thing", { imports: new Set([imp]) })), imp).toBe("data")
        }
        expect(classify(structure, facts("Thing", { imports: new Set(["fmt", "react", "lodash"]) }))).toBe(UNCLASSIFIED)
    })
})

describe("detectFramework at the edges", () => {
    const go = (n: number, imports: string[]) => Array.from({ length: n }, (_, i) => facts("U" + i, { imports: new Set(imports) }))
    it("is confidently structural on nothing at all", () => {
        const d = detectFramework([], "go")
        expect(d.id).toBe("structure")
        expect(d.confident).toBe(true)
        expect(d.candidates).toEqual([])
        expect(d.total).toBe(0)
        expect(d.reason).toBe("")
    })
    it("asks on a tie", () => {
        const d = detectFramework([...go(5, ["net/http"]), ...go(5, ["github.com/spf13/cobra"])], "go")
        expect(d.id).toBe("structure")
        expect(d.confident).toBe(false)
        expect(d.candidates.map(c => c.strong)).toEqual([5, 5])
        expect(d.reason).toMatch(/is close behind/)
    })
    it("has only the structural profile for a language nothing is written for", () => {
        expect(profilesFor("rust" as Language).map(p => p.id)).toEqual(["structure"])
        const d = detectFramework(go(5, ["net/http"]), "rust" as Language)
        expect(d.id).toBe("structure")
        expect(d.confident).toBe(true)
        expect(d.reason).toContain("No framework")
    })
    it("weighs a profile's votes only by count, whatever its weight says", () => {
        // GO_CLI declares weight 2, and a weight below 4 changes nothing:
        // scores are strong * 3 + weak, and the weight is read only to decide
        // whether a specific framework demotes the Jakarta standard.
        const d = detectFramework([...go(4, ["net/http"]), ...go(3, ["github.com/spf13/cobra"])], "go")
        expect(d.candidates.map(c => [c.id, c.score])).toEqual([["go-http", 12], ["go-cli", 9]])
    })
})

describe("languageOf on a mixed repository", () => {
    it("takes the plurality of files", () => {
        expect(languageOf(["app/a.go", "app/b.go", "app/c.go", "web/x.ts", "web/y.vue"])).toBe("go")
        expect(languageOf(["app/a.go", "web/x.ts", "web/y.vue", "web/z.tsx"])).toBe("typescript")
    })
    it("breaks a tie by the first language seen, which is the order of the files", () => {
        expect(languageOf(["a.go", "b.ts"])).toBe("go")
        expect(languageOf(["b.ts", "a.go"])).toBe("typescript")
    })
    it("is scoped by detection: a Go review of a Go and Vue repository votes among Go profiles only", () => {
        const mixed = [...Array.from({ length: 6 }, (_, i) => facts("H" + i, { imports: new Set(["net/http"]), file: `app/h${i}.go` })), ...Array.from({ length: 10 }, (_, i) => facts("C" + i, { imports: new Set(["vue"]), file: `web/c${i}.vue` }))]
        expect(detectFramework(mixed, "go").id).toBe("go-http")
        expect(detectFramework(mixed, "typescript").candidates.map(c => c.id)).not.toContain("go-http")
    })
})

describe("withUnclassified", () => {
    const raw: FrameworkProfile = {
        id: "toy", label: "Toy", detect: {},
        lanes: [
            { id: "web", label: "Web", color: "blue", nameSuffixes: ["Handler"], hint: "What answers a request" },
            { id: "logic", label: "Logic & Other", color: "green", hint: "Everything unclassified" },
            { id: "data", label: "Data", color: "amber", imports: ["database/sql"], hint: "Stores, and everything unclassified" },
        ],
        fallback: "logic",
    }
    it("folds a lane with no rule into Unclassified and makes that the fallback", () => {
        const p = withUnclassified(raw)
        expect(p.lanes.map(l => l.id)).toEqual(["web", "data", UNCLASSIFIED])
        expect(p.fallback).toBe(UNCLASSIFIED)
        expect(classify(p, facts("Thing"))).toBe(UNCLASSIFIED)
        expect(classify(p, facts("OrderHandler"))).toBe("web")
    })
    it("strips the & Other from labels and hints of the lanes it keeps", () => {
        const p = withUnclassified(raw)
        expect(p.lanes.find(l => l.id === "data")!.hint).toBe("Stores")
        expect(p.lanes.find(l => l.id === UNCLASSIFIED)!.label).toBe("Unclassified")
        expect(withUnclassified({ ...raw, lanes: [{ id: "logic", label: "Logic & Other", color: "green", nameSuffixes: ["Service"], hint: "Everything unclassified" }] }).lanes[0]).toMatchObject({ label: "Logic", hint: undefined })
    })
    it("drops a folded lane from the layer order too", () => {
        // The structural order is entry, logic, data, models and every one
        // of them has a rule, so all four survive.
        expect(layersOf(structure)).toEqual(["entry", "logic", "data", "models"])
        expect(STRUCTURE.lanes.every(l => l.nameSuffixes?.length || l.rule || l.imports?.length)).toBe(true)
    })
    it("is what profilesFor(null) hands out, for every profile", () => {
        const all = profilesFor(null)
        expect(all).toBe(PROFILES)
        for (const p of all) {
            expect(p.fallback).toBe(UNCLASSIFIED)
            expect(p.lanes.at(-1)!.id).toBe(UNCLASSIFIED)
        }
        expect(profileById("nope").id).toBe("structure")
    })
})

describe("loadUnits against snapshot rows", () => {
    // Rows as the engine writes them: a Go store with a method in the same
    // file and one in another, a type whose Go pack gave it no name, a
    // module unit, and a marker from every source.
    const units = [
        { id: "db.Store", kind: "type", name: "Store", component: "db", owner: "", file: "db/store.go" },
        { id: "db.Store.Get", kind: "function", name: "Get", component: "db", owner: "db.Store", file: "db/store.go" },
        { id: "db.Store.Close", kind: "function", name: "Close", component: "db", owner: "db.Store", file: "db/close.go" },
        { id: "db.Store.Close.helper", kind: "function", name: "helper", component: "db", owner: "db.Store.Close", file: "db/close.go" },
        { id: "db.Port", kind: "type", name: "Port", component: "db", owner: "", file: "db/port.go" },
        { id: "shop.models#", kind: "module", name: "", component: "shop", owner: "", file: "shop/models.py" },
        { id: "shop.models#Sku", kind: "type", name: "", component: "shop", owner: "", file: "shop/models.py" },
        { id: "Acme.Web", kind: "type", name: "Web", component: "Acme", owner: null, file: null },
    ]
    const markers = [
        { unit: "db.Store", source: "struct_tag", key: "validate", value: "required" },
        { unit: "db.Store", source: "directive", key: "embed", value: "sql/*.sql" },
        { unit: "db.Port", source: "supertype", key: "interface", value: null },
        { unit: "db.Port", source: "supertype", key: "io.Closer", value: null },
        { unit: "shop.models#Sku", source: "filename", key: "models", value: null },
        { unit: "shop.models#Sku", source: "path", key: "admin", value: null },
        { unit: "shop.models#Sku", source: "annotation", key: "dataclass", value: null },
        { unit: "Acme.Web", source: "manifest", key: "activity", value: "com.acme.Web" },
        { unit: "Acme.Web", source: "annotation", key: "  ", value: null },
    ]
    const snippets = [
        { file: "db/store.go", content: "database/sql" }, { file: "db/store.go", content: "context" },
        { file: "db/close.go", content: "github.com/redis/go-redis/v9" }, { file: "db/close.go", content: "  " },
        { file: "shop/models.py", content: "django.db" },
    ]
    const uses = [
        { unit: "db.Store.Get", module: "database/sql" }, { unit: "db.Store.Get", module: "db" },
        { unit: "db.Store.Close.helper", module: "github.com/redis/go-redis/v9" },
        { unit: "", module: "x" }, { unit: "db.Port", module: "" },
    ]
    const snapshot = (tables: Record<string, any[]>) => ({
        hasView: (v: string) => v in tables,
        query: async (sql: string) => {
            for (const [name, rows] of Object.entries(tables)) if (sql.includes(`FROM ${name}`) && !sql.includes(`FROM ${name}_`)) return rows
            return []
        },
    })

    it("reads markers by source, drops members and keeps the module unit", async () => {
        const { query, hasView } = snapshot({ units, unit_markers: markers, snippets, unit_uses: uses })
        const all = await loadUnits(query, hasView)
        expect([...all.keys()]).toEqual(["db.Store", "db.Port", "shop.models#", "shop.models#Sku", "Acme.Web"])

        const store = all.get("db.Store")!
        expect([...store.facts.annotations]).toEqual(["validate", "embed"])
        expect(store.facts.supertypes.size).toBe(0)
        expect(store.facts.methodCount).toBe(2)
        expect(store.facts.methods.size).toBe(0)
        expect(store.facts.fields).toBe(0)
        expect(store.component).toBe("db")

        const port = all.get("db.Port")!
        expect([...port.facts.supertypes]).toEqual(["interface", "io.Closer"])
        expect(port.facts.isInterface).toBe(true)
        expect(port.facts.annotations.size).toBe(0)

        // filename, path, annotation and manifest all read as annotations;
        // a blank key is skipped.
        expect([...all.get("shop.models#Sku")!.facts.annotations]).toEqual(["models", "admin", "dataclass"])
        expect([...all.get("Acme.Web")!.facts.annotations]).toEqual(["activity"])
        // A unit with no name is named by the last part of its id; the
        // module unit is named for its file's module.
        expect(all.get("shop.models#Sku")!.name).toBe("Sku")
        expect(all.get("shop.models#")!.name).toBe("shop.models")
        expect(all.get("Acme.Web")!.file).toBe("")
    })

    it("gives a unit its file's raw imports, and the ones its members use as used imports", async () => {
        const { query, hasView } = snapshot({ units, unit_markers: markers, snippets, unit_uses: uses })
        const all = await loadUnits(query, hasView)
        const store = all.get("db.Store")!.facts
        expect([...store.imports]).toEqual(["database/sql", "context"])
        // Get uses database/sql; Close's helper, two owners down and in
        // another file, uses redis, which store.go never imports. A blank
        // import is dropped.
        expect([...store.usedImports!]).toEqual(["database/sql"])
        expect([...all.get("db.Port")!.facts.usedImports!]).toEqual([])
        expect([...all.get("shop.models#Sku")!.facts.imports]).toEqual(["django.db"])
        expect(classify(profileById("go-http"), store)).toBe("data")
        expect(classify(profileById("go-http"), all.get("db.Port")!.facts)).toBe(UNCLASSIFIED)
    })

    it("treats an empty uses table as no record of uses", async () => {
        // Every unit reading as using nothing would empty every import lane.
        const { query, hasView } = snapshot({ units, unit_markers: markers, snippets, unit_uses: [] })
        const all = await loadUnits(query, hasView)
        expect(all.get("db.Store")!.facts.usedImports).toBeUndefined()
        expect(classify(profileById("go-http"), all.get("db.Store")!.facts)).toBe("data")
    })

    it("reads a snapshot without markers, uses or snippets", async () => {
        const { query, hasView } = snapshot({ units })
        const all = await loadUnits(query, hasView)
        expect(all.size).toBe(5)
        expect(all.get("db.Store")!.facts.imports.size).toBe(0)
        expect(all.get("db.Store")!.facts.usedImports).toBeUndefined()
    })

    it("falls back to the Java files path when there are no units", async () => {
        expect((await loadUnits(snapshot({}).query, snapshot({}).hasView)).size).toBe(0)
        const { query, hasView } = snapshot({ units: [], files: [] })
        expect((await loadUnits(query, hasView)).size).toBe(0)
    })
})

// The Units page's model, driven with a fake store so its `declared` filter
// can be read against the same rows.
const fake = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }))
vi.mock("~/features/snapshot/data.store", () => ({
    useDataStore: () => ({
        hasData: true,
        datasetKey: "scan-1",
        componentFilesIndex: new Map<string, string[]>(),
        hasView: (v: string) => v in fake.tables,
        query: async (sql: string) => {
            for (const [name, rows] of Object.entries(fake.tables)) if (sql.includes(`FROM ${name}`) && !sql.includes(`FROM ${name}_`)) return rows
            return []
        },
    }),
}))
vi.mock("~/features/snapshot/useAsyncQuery", () => ({
    useAsyncQuery: (load: () => Promise<any>, _deps: unknown, options: { initial: any }) => {
        const data = ref(options.initial)
        const done = load().then(v => { data.value = v })
        return { data, loading: ref(false), error: ref(null), reload: () => done }
    },
}))

describe("useUnitsModel's declared units", () => {
    it("leaves out module units and members declared beside their owner, and keeps a member declared elsewhere", async () => {
        fake.tables = {
            units: [
                { id: "db.Store", kind: "type", name: "Store", component: "db", module: "db", owner: "", file: "db/store.go" },
                { id: "db.Store.Get", kind: "function", name: "Get", component: "db", module: "db", owner: "db.Store", file: "db/store.go" },
                { id: "db.Store.Close", kind: "function", name: "Close", component: "db", module: "db", owner: "db.Store", file: "db/close.go" },
                { id: "db.New", kind: "function", name: "New", component: "db", module: "db", owner: "", file: "db/store.go" },
                { id: "shop.models#", kind: "module", name: "models", component: "shop", module: "shop.models", owner: "", file: "shop/models.py" },
                { id: "acme.Table.selectAll", kind: "function", name: "selectAll", component: "acme", module: "acme", owner: "acme.Table", file: "acme/Queries.kt" },
                { id: "acme.Table", kind: "type", name: "Table", component: "acme", module: "acme", owner: "", file: "acme/Table.kt" },
            ],
            unit_connections: [],
        }
        const { useUnitsModel } = await import("~/features/units/useUnitsModel")
        const model = useUnitsModel()
        // The mocked query resolves on the next tick.
        await new Promise(r => setTimeout(r, 0))
        expect(model.units.value.map(u => u.id)).toHaveLength(7)
        // Get sits in its receiver's file; Close does not, and counts as
        // declared where it is written, like the Kotlin extension. Neither
        // has facts of its own (the loader drops owned units), so both land
        // in the fallback lane rather than their owner's.
        expect(model.declared.value.map(u => u.id).sort()).toEqual(["acme.Table", "acme.Table.selectAll", "db.New", "db.Store", "db.Store.Close"])
        expect(model.byId.value.get("db.Store.Close")!.lane).toBe(UNCLASSIFIED)
        expect(model.byId.value.get("db.Store")!.lane).toBe("data")
        // No framework is imported, so the structural profile places them:
        // the store by its name, and New, a verb, nowhere.
        expect(model.profile.value.id).toBe("structure")
        expect(model.lanes.value.map(l => [l.id, l.count])).toEqual([["data", 1], [UNCLASSIFIED, 4]])
    })
})

describe("a PHP interface named for its role", () => {
    it("takes the role its name gives before Interface", () => {
        const f = (name: string) => ({ ...EMPTY_FACTS, name, file: `src/${name}.php`, isInterface: true })
        expect(classify(profileById("symfony"), f("OrderRepositoryInterface"))).toBe("data")
        expect(classify(profileById("structure"), f("PaymentGatewayInterface"))).toBe("data")
        // A bare Interface is no role.
        expect(classify(profileById("structure"), f("Interface"))).toBe("unclassified")
    })
})
