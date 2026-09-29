import { describe, expect, it } from "vitest"
import { GO_CLI, GO_HTTP, UNCLASSIFIED, classify, detectFramework, profileById } from "./frameworkProfiles"
import { loadUnits } from "~/features/units/units"
import { layersOf } from "~/features/reports/anatomy"
import { runReading } from "~/features/reports/readings"

// The Go facts the engine's pack test (extensions/treesitter/golang/
// layers_test.go) asserts, written down as the snapshot rows the UI reads:
// a gin service with a gRPC server beside it, and a cobra tool. Each unit is
// [id, kind, owner, file]; uses are the modules each unit's references name,
// members included, and the edges are what unit.Connections resolved.

type Row = [id: string, kind: string, owner: string, file: string]
const nameOf = (id: string) => id.slice(id.lastIndexOf(".") + 1).replace(/@.*$/, "")

const SHOP = "github.com/acme/shop/internal/"
const SERVICE_UNITS: Row[] = [
    ["cmd/server.main", "function", "", "cmd/server/main.go"],
    ["cmd/server.init@main.go", "function", "", "cmd/server/main.go"],
    ["internal/handlers.OrderHandler", "type", "", "internal/handlers/orders.go"],
    ["internal/handlers.OrderHandler.Get", "function", "internal/handlers.OrderHandler", "internal/handlers/orders.go"],
    ["internal/handlers.OrderHandler.Create", "function", "internal/handlers.OrderHandler", "internal/handlers/orders.go"],
    ["internal/handlers.NewOrderHandler", "function", "", "internal/handlers/orders.go"],
    ["internal/handlers.Register", "function", "", "internal/handlers/orders.go"],
    ["internal/handlers.healthHandler", "function", "", "internal/handlers/orders.go"],
    ["internal/middleware.RequestLogger", "function", "", "internal/middleware/logging.go"],
    ["internal/service.OrderRepository", "type", "", "internal/service/orders.go"],
    ["internal/service.OrderService", "type", "", "internal/service/orders.go"],
    ["internal/service.NewOrderService", "function", "", "internal/service/orders.go"],
    ["internal/service.OrderService.Find", "function", "internal/service.OrderService", "internal/service/orders.go"],
    ["internal/service.OrderService.Place", "function", "internal/service.OrderService", "internal/service/orders.go"],
    ["internal/store.OrderStore", "type", "", "internal/store/orders.go"],
    ["internal/store.New", "function", "", "internal/store/orders.go"],
    ["internal/store.OrderStore.Get", "function", "internal/store.OrderStore", "internal/store/orders.go"],
    ["internal/store.OrderStore.Save", "function", "internal/store.OrderStore", "internal/store/orders.go"],
    ["internal/store.OrderStore.Ping", "function", "internal/store.OrderStore", "internal/store/orders.go"],
    ["internal/models.Timestamps", "type", "", "internal/models/order.go"],
    ["internal/models.Order", "type", "", "internal/models/order.go"],
    ["internal/models.CreateOrderRequest", "type", "", "internal/models/order.go"],
    ["internal/models.Config", "type", "", "internal/models/order.go"],
    ["internal/grpc.Server", "type", "", "internal/grpc/server.go"],
    ["internal/grpc.NewServer", "function", "", "internal/grpc/server.go"],
    ["internal/grpc.Server.GetOrder", "function", "internal/grpc.Server", "internal/grpc/server.go"],
    ["internal/grpc/pb.Order", "type", "", "internal/grpc/pb/orders.pb.go"],
    ["internal/grpc/pb.GetOrderRequest", "type", "", "internal/grpc/pb/orders.pb.go"],
    ["internal/grpc/pb.UnimplementedOrdersServer", "type", "", "internal/grpc/pb/orders.pb.go"],
    ["internal/grpc/pb.UnimplementedOrdersServer.GetOrder", "function", "internal/grpc/pb.UnimplementedOrdersServer", "internal/grpc/pb/orders.pb.go"],
    ["internal/grpc/pb.RegisterOrdersServer", "function", "", "internal/grpc/pb/orders.pb.go"],
    ["internal/store.TestGet", "function", "", "internal/store/orders_test.go"],
    ["internal/store.init@orders_test.go", "function", "", "internal/store/orders_test.go"],
]
const SERVICE_IMPORTS: Record<string, string[]> = {
    "cmd/server/main.go": ["log", SHOP + "handlers", SHOP + "store", "github.com/gin-gonic/gin"],
    "internal/handlers/orders.go": ["net/http", SHOP + "middleware", SHOP + "models", SHOP + "service", SHOP + "store", "github.com/gin-gonic/gin"],
    "internal/middleware/logging.go": ["log", "time", "github.com/gin-gonic/gin"],
    "internal/service/orders.go": ["context", SHOP + "models", SHOP + "store"],
    "internal/store/orders.go": ["context", "database/sql", SHOP + "models", "github.com/redis/go-redis/v9"],
    "internal/models/order.go": ["time"],
    "internal/grpc/server.go": ["context", SHOP + "service", SHOP + "grpc/pb", "google.golang.org/grpc"],
    "internal/grpc/pb/orders.pb.go": ["context"],
    "internal/store/orders_test.go": ["testing", "github.com/DATA-DOG/go-sqlmock"],
}
const SERVICE_MARKERS = [
    ["internal/service.OrderRepository", "supertype", "interface", null],
    ["internal/models.Timestamps", "struct_tag", "json", "created_at"], ["internal/models.Timestamps", "struct_tag", "db", "created_at"],
    ["internal/models.Order", "supertype", "Timestamps", null],
    ...["id", "customer", "total"].flatMap(v => [["internal/models.Order", "struct_tag", "json", v], ["internal/models.Order", "struct_tag", "db", v]]),
    ["internal/models.CreateOrderRequest", "struct_tag", "json", "customer"], ["internal/models.CreateOrderRequest", "struct_tag", "binding", "required"], ["internal/models.CreateOrderRequest", "struct_tag", "json", "total"],
    ["internal/models.Config", "struct_tag", "json", "addr"], ["internal/models.Config", "struct_tag", "yaml", "addr"], ["internal/models.Config", "struct_tag", "json", "dsn"], ["internal/models.Config", "struct_tag", "yaml", "dsn"],
    ["internal/grpc.Server", "supertype", "UnimplementedOrdersServer", null],
    ["internal/grpc/pb.Order", "struct_tag", "protobuf", "bytes,1,opt,name=id"], ["internal/grpc/pb.Order", "struct_tag", "json", "id,omitempty"],
    ["internal/grpc/pb.GetOrderRequest", "struct_tag", "protobuf", "bytes,1,opt,name=id"], ["internal/grpc/pb.GetOrderRequest", "struct_tag", "json", "id,omitempty"],
].map(([unit, source, key, value]) => ({ unit, source, key, value }))
const SERVICE_USES: Record<string, string[]> = {
    "cmd/server.main": ["log", SHOP + "handlers", SHOP + "store", "github.com/gin-gonic/gin"],
    "internal/handlers.OrderHandler": [SHOP + "service", "internal/handlers"],
    "internal/handlers.OrderHandler.Get": ["net/http", "github.com/gin-gonic/gin", "internal/handlers"],
    "internal/handlers.OrderHandler.Create": ["net/http", "github.com/gin-gonic/gin", SHOP + "models", "internal/handlers"],
    "internal/handlers.NewOrderHandler": [SHOP + "service", "internal/handlers"],
    "internal/handlers.Register": ["github.com/gin-gonic/gin", SHOP + "store", SHOP + "middleware", SHOP + "service", "internal/handlers"],
    "internal/handlers.healthHandler": ["github.com/gin-gonic/gin", "net/http"],
    "internal/middleware.RequestLogger": ["github.com/gin-gonic/gin", "log", "time"],
    "internal/service.OrderRepository": ["context", SHOP + "models"],
    "internal/service.OrderService": ["internal/service"],
    "internal/service.NewOrderService": [SHOP + "store", "internal/service"],
    "internal/service.OrderService.Find": ["context", SHOP + "models", "internal/service"],
    "internal/service.OrderService.Place": ["context", SHOP + "models", "internal/service"],
    "internal/store.OrderStore": ["database/sql", "github.com/redis/go-redis/v9"],
    "internal/store.New": ["database/sql", "internal/store"],
    "internal/store.OrderStore.Get": ["context", SHOP + "models", "internal/store"],
    "internal/store.OrderStore.Save": ["context", SHOP + "models", "internal/store"],
    "internal/store.OrderStore.Ping": ["context", "internal/store"],
    "internal/models.Timestamps": ["time"],
    "internal/models.Order": ["internal/models"],
    "internal/models.CreateOrderRequest": ["internal/models"],
    "internal/models.Config": ["internal/models"],
    "internal/grpc.Server": [SHOP + "grpc/pb", SHOP + "service"],
    "internal/grpc.NewServer": ["google.golang.org/grpc", SHOP + "grpc/pb", SHOP + "service", "internal/grpc"],
    "internal/grpc.Server.GetOrder": ["context", SHOP + "grpc/pb", "internal/grpc"],
    "internal/grpc/pb.UnimplementedOrdersServer.GetOrder": ["context", "internal/grpc/pb"],
    "internal/store.TestGet": ["testing", "github.com/DATA-DOG/go-sqlmock", "internal/store"],
}
const SERVICE_EDGES: Array<[string, string]> = [
    ["cmd/server.main", "internal/handlers.Register"], ["cmd/server.main", "internal/store.New"],
    ["internal/handlers.OrderHandler", "internal/service.OrderService"],
    ["internal/handlers.OrderHandler.Get", "internal/handlers.OrderHandler"],
    ["internal/handlers.OrderHandler.Create", "internal/handlers.OrderHandler"], ["internal/handlers.OrderHandler.Create", "internal/models.CreateOrderRequest"],
    ["internal/handlers.NewOrderHandler", "internal/handlers.OrderHandler"], ["internal/handlers.NewOrderHandler", "internal/service.OrderService"],
    ["internal/handlers.Register", "internal/handlers.NewOrderHandler"], ["internal/handlers.Register", "internal/middleware.RequestLogger"],
    ["internal/handlers.Register", "internal/service.NewOrderService"], ["internal/handlers.Register", "internal/store.OrderStore"], ["internal/handlers.Register", "internal/handlers.healthHandler"],
    ["internal/service.OrderRepository", "internal/models.Order"],
    ["internal/service.OrderService", "internal/service.OrderRepository"],
    ["internal/service.NewOrderService", "internal/service.OrderService"], ["internal/service.NewOrderService", "internal/store.OrderStore"],
    ["internal/service.OrderService.Find", "internal/service.OrderService"], ["internal/service.OrderService.Find", "internal/models.Order"],
    ["internal/service.OrderService.Place", "internal/service.OrderService"], ["internal/service.OrderService.Place", "internal/models.Order"], ["internal/service.OrderService.Place", "internal/models.CreateOrderRequest"],
    ["internal/store.OrderStore.Get", "internal/store.OrderStore"], ["internal/store.OrderStore.Get", "internal/models.Order"],
    ["internal/store.OrderStore.Save", "internal/store.OrderStore"], ["internal/store.OrderStore.Save", "internal/models.Order"],
    ["internal/store.OrderStore.Ping", "internal/store.OrderStore"], ["internal/store.New", "internal/store.OrderStore"],
    ["internal/models.Order", "internal/models.Timestamps"],
    ["internal/grpc.Server", "internal/service.OrderService"], ["internal/grpc.Server", "internal/grpc/pb.UnimplementedOrdersServer"],
    ["internal/grpc.NewServer", "internal/grpc.Server"],
    ["internal/grpc.Server.GetOrder", "internal/grpc.Server"], ["internal/grpc.Server.GetOrder", "internal/grpc/pb.GetOrderRequest"], ["internal/grpc.Server.GetOrder", "internal/grpc/pb.Order"],
    ["internal/store.TestGet", "internal/store.New"],
]

const TIDY = "github.com/acme/tidy/internal/"
const CLI_UNITS: Row[] = [
    ["main", "function", "", "main.go"],
    ["cmd.Execute", "function", "", "cmd/root.go"],
    ["cmd.newRunCmd", "function", "", "cmd/root.go"],
    ["cmd.init@root.go", "function", "", "cmd/root.go"],
    ["internal/tidy.Runner", "type", "", "internal/tidy/run.go"],
    ["internal/tidy.NewRunner", "function", "", "internal/tidy/run.go"],
    ["internal/tidy.Run", "function", "", "internal/tidy/run.go"],
    ["internal/tidy.Runner.Run", "function", "internal/tidy.Runner", "internal/tidy/run.go"],
    ["internal/tidy.Dedupe", "function", "", "internal/tidy/run.go"],
    ["internal/io.FileReader", "type", "", "internal/io/files.go"],
    ["internal/io.FileWriter", "type", "", "internal/io/files.go"],
    ["internal/io.NewFileReader", "function", "", "internal/io/files.go"],
    ["internal/io.NewFileWriter", "function", "", "internal/io/files.go"],
    ["internal/io.FileReader.ReadAll", "function", "internal/io.FileReader", "internal/io/files.go"],
    ["internal/io.FileWriter.WriteAll", "function", "internal/io.FileWriter", "internal/io/files.go"],
    ["internal/io.Buffer", "type", "", "internal/io/files.go"],
    ["internal/io.Buffer.Push", "function", "internal/io.Buffer", "internal/io/files.go"],
    ["internal/io.Buffer.Len", "function", "internal/io.Buffer", "internal/io/files.go"],
    ["internal/config.Config", "type", "", "internal/config/config.go"],
    ["internal/config.Load", "function", "", "internal/config/config.go"],
]
const CLI_IMPORTS: Record<string, string[]> = {
    "main.go": ["github.com/acme/tidy/cmd"],
    "cmd/root.go": ["os", TIDY + "config", TIDY + "tidy", "github.com/spf13/cobra"],
    "internal/tidy/run.go": [TIDY + "config", TIDY + "io"],
    "internal/io/files.go": ["bufio", "os"],
    "internal/config/config.go": ["os", "gopkg.in/yaml.v3"],
}
const CLI_MARKERS = ["input", "output"].flatMap(v => [
    { unit: "internal/config.Config", source: "struct_tag", key: "yaml", value: v },
    { unit: "internal/config.Config", source: "struct_tag", key: "json", value: v },
])
const CLI_USES: Record<string, string[]> = {
    "main": ["github.com/acme/tidy/cmd"],
    "cmd.Execute": ["os", "cmd"],
    "cmd.newRunCmd": ["github.com/spf13/cobra", TIDY + "config", TIDY + "tidy"],
    "cmd.init@root.go": ["cmd"],
    "internal/tidy.Runner": [TIDY + "config"],
    "internal/tidy.NewRunner": [TIDY + "config", "internal/tidy"],
    "internal/tidy.Run": [TIDY + "config", "internal/tidy"],
    "internal/tidy.Runner.Run": [TIDY + "io", "internal/tidy"],
    "internal/io.NewFileReader": ["internal/io"],
    "internal/io.NewFileWriter": ["internal/io"],
    "internal/io.FileReader.ReadAll": ["os", "bufio", "internal/io"],
    "internal/io.FileWriter.WriteAll": ["os", "internal/io"],
    "internal/io.Buffer.Push": ["internal/io"],
    "internal/config.Load": ["os", "gopkg.in/yaml.v3", "internal/config"],
}
const CLI_EDGES: Array<[string, string]> = [
    ["main", "cmd.Execute"],
    ["cmd.newRunCmd", "internal/tidy.Run"], ["cmd.newRunCmd", "internal/config.Load"], ["cmd.init@root.go", "cmd.newRunCmd"],
    ["internal/tidy.Runner", "internal/config.Config"], ["internal/tidy.NewRunner", "internal/tidy.Runner"], ["internal/tidy.NewRunner", "internal/config.Config"],
    ["internal/tidy.Run", "internal/tidy.NewRunner"], ["internal/tidy.Run", "internal/config.Config"],
    ["internal/tidy.Runner.Run", "internal/tidy.Runner"], ["internal/tidy.Runner.Run", "internal/io.NewFileReader"], ["internal/tidy.Runner.Run", "internal/io.NewFileWriter"], ["internal/tidy.Runner.Run", "internal/tidy.Dedupe"],
    ["internal/io.NewFileReader", "internal/io.FileReader"], ["internal/io.NewFileWriter", "internal/io.FileWriter"],
    ["internal/io.FileReader.ReadAll", "internal/io.FileReader"], ["internal/io.FileWriter.WriteAll", "internal/io.FileWriter"],
    ["internal/io.Buffer.Push", "internal/io.Buffer"], ["internal/io.Buffer.Len", "internal/io.Buffer"],
    ["internal/config.Load", "internal/config.Config"],
]

interface Fixture { units: Row[]; imports: Record<string, string[]>; markers: Array<{ unit: string; source: string; key: string; value: string | null }>; uses: Record<string, string[]>; edges: Array<[string, string]> }
const SERVICE: Fixture = { units: SERVICE_UNITS, imports: SERVICE_IMPORTS, markers: SERVICE_MARKERS, uses: SERVICE_USES, edges: SERVICE_EDGES }
const CLI: Fixture = { units: CLI_UNITS, imports: CLI_IMPORTS, markers: CLI_MARKERS, uses: CLI_USES, edges: CLI_EDGES }

/** The snapshot's tables, answered the way the real ones answer each query. */
function snapshot(fx: Fixture) {
    const units = fx.units.map(([id, kind, owner, file]) => ({ id, kind, name: nameOf(id), component: file.slice(0, file.lastIndexOf("/")) || ".", module: "", owner, file }))
    const tables = ["units", "unit_markers", "unit_uses", "unit_connections", "snippets", "files"]
    const query = async (sql: string): Promise<any[]> => {
        if (sql.includes("sqlite_master")) return tables.map(name => ({ name }))
        if (sql.includes("pragma_table_info('files')")) return [{ name: "role" }]
        if (sql.includes("FROM units")) return units
        if (sql.includes("FROM unit_markers")) return fx.markers
        if (sql.includes("FROM unit_uses")) return Object.entries(fx.uses).flatMap(([unit, mods]) => mods.map(module => ({ unit, module })))
        if (sql.includes("FROM unit_connections")) return fx.edges.map(([from, to]) => ({ from, to }))
        if (sql.includes("FROM snippets")) return Object.entries(fx.imports).flatMap(([file, imps]) => imps.map(content => ({ file, content })))
        if (sql.includes("FROM files")) return Object.keys(fx.imports).map(name => ({ name, role: /_test\.go$/.test(name) ? "test" : "production" }))
        return []
    }
    return { query, hasView: (v: string) => tables.includes(v), ctx: { query, revision: 3, label: (x: string) => x, aliases: {} } }
}

async function facts(fx: Fixture) {
    const { query, hasView } = snapshot(fx)
    return loadUnits(query, hasView)
}

describe("detecting a Go codebase", () => {
    it("reads a gin service with a gRPC server as Go services", async () => {
        const all = await facts(SERVICE)
        const d = detectFramework([...all.values()].map(f => f.facts), "go")
        expect(d.id).toBe("go-http")
        expect(d.confident).toBe(true)
        // Nothing in the service imports cobra, urfave or flag.
        expect(d.candidates.map(c => c.id)).toEqual(["go-http"])
    })

    it("reads a cobra tool as Go command line", async () => {
        const all = await facts(CLI)
        const d = detectFramework([...all.values()].map(f => f.facts), "go")
        expect(d.id).toBe("go-cli")
        expect(d.confident).toBe(true)
    })

    it("reads a service launched from a cobra main as a service, as long as the handlers outnumber the commands", async () => {
        // Votes are counted per unit and cobra sits in the few units of cmd/;
        // twice as many handlers is the lead detection asks for.
        const withCobra: Fixture = {
            ...SERVICE,
            units: [...SERVICE_UNITS, ["cmd/server.Execute", "function", "", "cmd/server/root.go"], ["cmd/server.newServeCmd", "function", "", "cmd/server/root.go"]],
            imports: { ...SERVICE_IMPORTS, "cmd/server/main.go": ["github.com/spf13/cobra"], "cmd/server/root.go": ["github.com/spf13/cobra", SHOP + "handlers", "github.com/gin-gonic/gin"] },
        }
        const d = detectFramework([...(await facts(withCobra)).values()].map(f => f.facts), "go")
        expect(d.id).toBe("go-http")
        expect(d.candidates.map(c => c.id)).toEqual(["go-http", "go-cli"])
        // Four cobra units against seven gin ones is too close, and detection
        // says so rather than guessing.
        const even: Fixture = { ...withCobra, imports: { ...withCobra.imports, "internal/grpc/server.go": ["context", SHOP + "service"] } }
        const e = detectFramework([...(await facts(even)).values()].map(f => f.facts), "go")
        expect(e.confident).toBe(false)
        expect(e.reason).toContain("Go command line is close behind")
    })
})

describe("the Go services lanes", () => {
    const go = profileById("go-http")
    const lanes = async () => {
        const all = await facts(SERVICE)
        return (id: string) => classify(go, all.get(id)!.facts)
    }

    it("puts each layer of the service in its lane", async () => {
        const lane = await lanes()
        expect(lane("internal/handlers.OrderHandler")).toBe("handlers")
        expect(lane("internal/handlers.NewOrderHandler")).toBe("handlers")
        expect(lane("internal/handlers.healthHandler")).toBe("handlers")
        expect(lane("internal/middleware.RequestLogger")).toBe("middleware")
        expect(lane("internal/service.OrderService")).toBe("logic")
        expect(lane("internal/service.NewOrderService")).toBe("logic")
        // The store is a store because its methods call database/sql.
        expect(lane("internal/store.OrderStore")).toBe("data")
        expect(lane("internal/store.New")).toBe("data")
        expect(lane("internal/models.Order")).toBe("models")
        expect(lane("internal/models.Timestamps")).toBe("models")
        expect(lane("internal/models.CreateOrderRequest")).toBe("models")
        expect(lane("internal/grpc.Server")).toBe("handlers")
        expect(lane("internal/grpc.NewServer")).toBe("handlers")
    })

    it("reads a struct tagged json as a model even when it is configuration", async () => {
        // A Config carrying json and yaml tags is a shape that crosses a
        // boundary, which is what the Models lane is for; its name is also
        // one of the lane's suffixes. There is no Config lane to prefer.
        const lane = await lanes()
        expect(lane("internal/models.Config")).toBe("models")
        expect(GO_HTTP.lanes.find(l => l.id === "models")!.nameSuffixes).toContain("Config")
    })

    it("reads an interface named for a repository as data access", async () => {
        const lane = await lanes()
        const all = await facts(SERVICE)
        expect(all.get("internal/service.OrderRepository")!.facts.isInterface).toBe(true)
        expect(lane("internal/service.OrderRepository")).toBe("data")
    })

    it("leaves wiring and tests unclassified", async () => {
        const lane = await lanes()
        // Nothing in the profile says what main or a Register function is.
        expect(lane("cmd/server.main")).toBe(UNCLASSIFIED)
        expect(lane("cmd/server.init@main.go")).toBe(UNCLASSIFIED)
        expect(lane("internal/handlers.Register")).toBe(UNCLASSIFIED)
        // A test using sqlmock is not a store; its uses name no database.
        expect(lane("internal/store.TestGet")).toBe(UNCLASSIFIED)
    })

    it("classifies generated protobuf code like hand-written code", async () => {
        // Nothing in the facts says a unit is generated: the file carries the
        // flag, and neither the lanes nor the anatomy reading look at it.
        const lane = await lanes()
        expect(lane("internal/grpc/pb.Order")).toBe("models")
        expect(lane("internal/grpc/pb.UnimplementedOrdersServer")).toBe("handlers")
    })
})

describe("the Go command line lanes", () => {
    const cli = profileById("go-cli")

    it("puts commands, logic, readers and config in their lanes", async () => {
        const all = await facts(CLI)
        const lane = (id: string) => classify(cli, all.get(id)!.facts)
        expect(lane("main")).toBe("commands")
        expect(lane("cmd.Execute")).toBe("commands")
        expect(lane("cmd.newRunCmd")).toBe("commands")
        expect(lane("internal/tidy.Runner")).toBe("logic")
        expect(lane("internal/io.FileReader")).toBe("data")
        expect(lane("internal/io.FileWriter")).toBe("data")
        expect(lane("internal/io.NewFileReader")).toBe("data")
        expect(lane("internal/config.Config")).toBe("models")
        // Verbs stay unclassified: Go's functions are named for what they do.
        expect(lane("internal/tidy.Run")).toBe(UNCLASSIFIED)
        expect(lane("internal/tidy.Dedupe")).toBe(UNCLASSIFIED)
        expect(lane("internal/config.Load")).toBe(UNCLASSIFIED)
        expect(lane("internal/io.Buffer")).toBe(UNCLASSIFIED)
    })

    it("keeps a logic lane, so the layer between commands and stores exists", () => {
        // With no rule of its own the lane was folded into Unclassified and
        // the profile's layer order lost its second step.
        expect(GO_CLI.lanes.find(l => l.id === "logic")!.nameSuffixes?.length).toBeGreaterThan(0)
        expect(cli.lanes.map(l => l.id)).toEqual(["commands", "logic", "data", "models", UNCLASSIFIED])
        expect(layersOf(cli)).toEqual(["commands", "logic", "data", "models"])
    })
})

describe("the Go layer order", () => {
    it("runs handlers, logic, data, models for a service", () => {
        expect(layersOf(profileById("go-http"))).toEqual(["handlers", "logic", "data", "models"])
    })

    it("counts the service's references as one step down or into the models, and none back up", async () => {
        const out = await runReading("layers", { profile: "go-http" }, snapshot(SERVICE).ctx)
        // Down: handler -> service (twice, the type and its constructor), gRPC
        // server -> service, service -> repository, constructor -> store,
        // repository -> model, store -> model, and the handlers binding
        // request models and the service building models: every layer uses
        // the models, so reaching them skips nothing.
        expect(out.values).toEqual({ "one step down": 12, "skip a layer": 0, "back up": 0 })
        expect(out.text).toContain("handlers and routes → logic → stores and clients → models")
        expect(out.text).toContain("None run back up.")
    })

    it("reads a model reaching into the service as running back up", async () => {
        const planted: Fixture = { ...SERVICE, edges: [...SERVICE_EDGES, ["internal/models.Order", "internal/service.OrderService"], ["internal/store.OrderStore.Get", "internal/service.OrderService"]] }
        const out = await runReading("layers", { profile: "go-http" }, snapshot(planted).ctx)
        expect(out.values).toMatchObject({ "back up": 2 })
        expect(out.text).toContain("run back up, against the order")
        // The store's method is rolled up to the store, so it is the store
        // that is named.
        expect(out.text).toMatch(/Most go from (models|stores and clients) into logic/)
    })

    it("counts the tool's references down its own order", async () => {
        const out = await runReading("layers", { profile: "go-cli" }, snapshot(CLI).ctx)
        // newRunCmd -> Runner is not counted: the command calls Run, a verb,
        // and Run is unclassified. Runner -> readers is one step down, and
        // Runner and NewRunner -> Config reach the bottom layer, as expected.
        expect(out.values).toEqual({ "one step down": 4, "skip a layer": 0, "back up": 0 })
        const planted: Fixture = { ...CLI, edges: [...CLI_EDGES, ["internal/io.FileReader.ReadAll", "internal/tidy.Runner"]] }
        expect((await runReading("layers", { profile: "go-cli" }, snapshot(planted).ctx)).values).toMatchObject({ "back up": 1 })
    })

    it("leaves test files out of the roles, and picks the service profile on its own", async () => {
        const out = await runReading("roles", {}, snapshot(SERVICE).ctx)
        expect(out.text).toContain("This is a **Go services** codebase")
        // 24 top-level units (members are reached through their owners), less
        // the two in orders_test.go. main, init and Register are unclassified.
        expect(out.values).toMatchObject({ declared: 22, "Handlers & Routes": 7, Middleware: 1, "Stores & Clients": 3, Models: 6, Logic: 2, unclassified: 3 })
    })
})
