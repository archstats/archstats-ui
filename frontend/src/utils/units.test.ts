import { describe, expect, it } from "vitest"
import { importsUsed, loadUnits } from "./units"
import { classify, profileById } from "./javaFrameworks"

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
