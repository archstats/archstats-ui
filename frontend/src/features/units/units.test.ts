import { describe, expect, it } from "vitest"
import { importsUsed, loadUnits } from "./units"
import { classify, profileById } from "~/features/frameworks/frameworkProfiles"

// A tiny in-memory snapshot: the queries loadUnits makes, answered from rows.
function snapshot(tables: Record<string, any[]>) {
    const hasView = (v: string) => v in tables
    const query = async (sql: string) => {
        if (sql.includes("FROM units")) return tables.units
        if (sql.includes("FROM unit_markers")) return tables.unit_markers ?? []
        if (sql.includes("FROM unit_uses")) return tables.unit_uses
        if (sql.includes("FROM snippets")) return tables.snippets ?? []
        return []
    }
    return { query, hasView }
}

describe("importsUsed", () => {
    it("matches an import to the module it names or a name inside it", () => {
        const imports = new Set(["database/sql", "org.acme.data.Repo", "org.other.*", "fmt"])
        expect([...importsUsed(imports, new Set(["database/sql"]))]).toEqual(["database/sql"])
        expect([...importsUsed(imports, new Set(["org.acme.data"]))]).toEqual(["org.acme.data.Repo"])
        expect([...importsUsed(imports, new Set(["org.other"]))]).toEqual(["org.other.*"])
        // A prefix of a module name is not the module.
        expect([...importsUsed(new Set(["database/sqlx"]), new Set(["database/sql"]))]).toEqual([])
        expect(importsUsed(imports, undefined).size).toBe(0)
        // PHP: `use Illuminate\Database\Eloquent\Model;` for the module Illuminate\Database\Eloquent.
        expect([...importsUsed(new Set(["Illuminate\\Database\\Eloquent\\Model"]), new Set(["Illuminate\\Database\\Eloquent"]))])
            .toEqual(["Illuminate\\Database\\Eloquent\\Model"])
    })
})

describe("loadUnits", () => {
    const units = [
        { id: "TestRender", kind: "function", name: "TestRender", component: ".", owner: "", file: "./context_test.go" },
        { id: "TestBSON", kind: "function", name: "TestBSON", component: ".", owner: "", file: "./context_test.go" },
        { id: "Store", kind: "type", name: "Store", component: "db", owner: "", file: "db/store.go" },
        { id: "Store.Get", kind: "function", name: "Get", component: "db", owner: "Store", file: "db/store.go" },
    ]
    const snippets = [
        { file: "./context_test.go", content: "net/http" },
        { file: "./context_test.go", content: "go.mongodb.org/mongo-driver/v2/bson" },
        { file: "db/store.go", content: "database/sql" },
    ]

    it("gives each unit only the imports it uses, its methods' included", async () => {
        const { query, hasView } = snapshot({
            units, snippets,
            unit_uses: [
                { unit: "TestRender", module: "net/http" },
                { unit: "TestBSON", module: "go.mongodb.org/mongo-driver/v2/bson" },
                { unit: "Store.Get", module: "database/sql" },
            ],
        })
        const facts = await loadUnits(query as any, hasView)
        const go = profileById("go-http")
        // gin's context_test imports a MongoDB package for one test; the
        // other tests are not stores for it.
        expect(classify(go, facts.get("TestRender")!.facts)).not.toBe("data")
        expect(classify(go, facts.get("TestBSON")!.facts)).toBe("data")
        // The store reaches the database through its method.
        expect(classify(go, facts.get("Store")!.facts)).toBe("data")
        // Detection still sees the whole file.
        expect(facts.get("TestRender")!.facts.imports.has("go.mongodb.org/mongo-driver/v2/bson")).toBe(true)
    })

    it("falls back to the file's imports for a snapshot that does not record uses", async () => {
        const { query, hasView } = snapshot({ units, snippets })
        const facts = await loadUnits(query as any, hasView)
        expect(facts.get("TestRender")!.facts.usedImports).toBeUndefined()
        expect(classify(profileById("go-http"), facts.get("TestRender")!.facts)).toBe("data")
    })
})

describe("an owner the snapshot has no unit for", () => {
    it("leaves a Kotlin extension on a library type standing on its own", async () => {
        // `fun Route.orders()` is owned by a Route that Ktor declares, not the codebase.
        const { query, hasView } = snapshot({
            units: [
                { id: "shop.routes.Route.orders", kind: "function", name: "orders", component: "shop.routes", owner: "shop.routes.Route", file: "src/routes/Orders.kt" },
                { id: "shop.Service", kind: "type", name: "OrderService", component: "shop", owner: "", file: "src/OrderService.kt" },
                { id: "shop.Service.place", kind: "function", name: "place", component: "shop", owner: "shop.Service", file: "src/OrderService.kt" },
            ],
            unit_markers: [{ unit: "shop.routes.Route.orders", source: "receiver", key: "Route", value: null }],
            snippets: [{ file: "src/routes/Orders.kt", content: "io.ktor.server.routing.Route" }],
        })
        const out = await loadUnits(query, hasView)
        expect([...out.keys()].sort()).toEqual(["shop.Service", "shop.routes.Route.orders"])
        expect(classify(profileById("ktor"), out.get("shop.routes.Route.orders")!.facts)).toBe("routes")
        expect(out.get("shop.Service")!.facts.methodCount).toBe(1)
    })
})

describe("a record", () => {
    it("is data by declaration, whatever its field count", async () => {
        const { query, hasView } = snapshot({
            units: [
                { id: "Shop.OrderDto", kind: "type", name: "OrderDto", component: "Shop", owner: "", file: "Shop/OrderDto.cs" },
                { id: "shop.Order", kind: "type", name: "Order", component: "shop", owner: "", file: "shop/Order.kt" },
                { id: "shop.Cart", kind: "type", name: "Cart", component: "shop", owner: "", file: "shop/Cart.kt" },
            ],
            unit_markers: [
                { unit: "Shop.OrderDto", source: "keyword", key: "record", value: null },
                { unit: "shop.Order", source: "keyword", key: "data", value: null },
                // An annotation that happens to be called data is not the keyword.
                { unit: "shop.Cart", source: "annotation", key: "data", value: null },
            ],
        })
        const out = await loadUnits(query, hasView)
        expect(out.get("Shop.OrderDto")!.facts.isRecord).toBe(true)
        expect(out.get("shop.Order")!.facts.isRecord).toBe(true)
        expect(out.get("shop.Cart")!.facts.isRecord).toBe(false)
        expect(classify(profileById("structure"), out.get("Shop.OrderDto")!.facts)).toBe("models")
    })
})
