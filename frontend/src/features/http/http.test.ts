import { describe, expect, it } from "vitest"
import { contracts, contractState, EMPTY_MODEL, flow, routeTree, systemSummaries, traced, treeRows, underPrefix, type HttpModel, type Route } from "./http"

const route = (id: number, method: string, path: string, extra: Partial<Route> = {}): Route => ({
  id, kind: "http", method, path, template: path.replace(/\{[^}]*\}/g, "{}"), framework: "spring", handler: "", unit: "", function: "",
  component: "web", auth: "", documented: "", file: "Web.java", line: id, ...extra,
})

function model(over: Partial<HttpModel>): HttpModel {
  return { ...EMPTY_MODEL, reach: new Map(), units: new Map(), complete: true, ...over }
}

describe("routeTree", () => {
  it("folds a chain of single segments into one row and keeps branches apart", () => {
    const tree = routeTree([
      route(1, "GET", "/api/v1/orders"),
      route(2, "POST", "/api/v1/orders"),
      route(3, "GET", "/api/v1/orders/{id}"),
      route(4, "GET", "/api/v1/customers/{id}"),
      route(5, "GET", "/health"),
    ])
    expect(tree.count).toBe(5)
    const rows = treeRows(tree, new Set())
    expect(rows.map(r => r.kind === "node" ? `${"  ".repeat(r.node.depth)}${r.node.segment} (${r.node.count})` : `${"  ".repeat(r.depth + 1)}${r.route.method}`)).toEqual([
      "  api/v1 (4)",
      "    customers/{id} (1)",
      "      GET",
      "    orders (3)",
      "      GET",
      "      POST",
      "      {id} (1)",
      "        GET",
      "  health (1)",
      "    GET",
    ])
  })

  it("hides what is under a closed prefix", () => {
    const tree = routeTree([route(1, "GET", "/a/x"), route(2, "GET", "/a/y"), route(3, "GET", "/b")])
    const rows = treeRows(tree, new Set(["/a"]))
    expect(rows.filter(r => r.kind === "route")).toHaveLength(1)
  })

  it("selects routes under a prefix by whole segments", () => {
    const rs = [route(1, "GET", "/orders"), route(2, "GET", "/orders/{id}"), route(3, "GET", "/orders-archive")]
    expect(underPrefix(rs, "/orders").map(r => r.id)).toEqual([1, 2])
  })
})

describe("contracts", () => {
  it("names what each side is missing, within the components the contract covers", () => {
    const m = model({
      routes: [route(1, "GET", "/orders/{id}", { documented: "spec" }), route(2, "GET", "/orders"), route(3, "GET", "/admin", { component: "admin" })],
      operations: [
        { spec: "api.yaml", title: "Orders", version: "1.0", method: "GET", path: "/orders/{id}", template: "/orders/{}", operationId: "get", tag: "", summary: "", deprecated: false, security: "", side: "provided", entry: 1, line: 5 },
        { spec: "api.yaml", title: "Orders", version: "1.0", method: "DELETE", path: "/orders/{id}", template: "/orders/{}", operationId: "del", tag: "", summary: "", deprecated: false, security: "", side: "provided", entry: 0, line: 9 },
      ],
    })
    const [c] = contracts(m)
    expect(c.matched).toBe(1)
    expect(c.specOnly.map(o => o.operationId)).toEqual(["del"])
    expect(c.codeOnly.map(r => r.id)).toEqual([2])
    expect(contractState(m.routes[0], [c])).toBe("described")
    expect(contractState(m.routes[1], [c])).toBe("missing")
    expect(contractState(m.routes[2], [c])).toBe("none")
  })
})

describe("systemSummaries", () => {
  it("joins calls and configuration per system, hosts in environment order", () => {
    const m = model({
      outbound: [
        { id: 1, kind: "http", client: "feign", method: "POST", path: "/refunds", template: "/refunds", target: "", system: "payments", host: "pay.nl", confidence: "declared", resolvedVia: "declared", configKey: "clients.payments.url", entry: 0, consumer: 0, resilience: "timeout", unit: "u", function: "f", component: "c", file: "P.java", line: 3 },
        { id: 2, kind: "http", client: "fetch", method: "GET", path: "/api/orders", template: "/api/orders", target: "", system: "self", host: "", confidence: "resolved", resolvedVia: "literal", configKey: "", entry: 7, consumer: 0, resilience: "", unit: "", function: "", component: "", file: "a.ts", line: 1 },
      ],
      systems: [
        { system: "payments", kind: "http", environment: "", host: "localhost", source: "config", configKey: "clients.payments.url", file: "application.yml", line: 4 },
        { system: "payments", kind: "http", environment: "prod", host: "pay.nl", source: "config", configKey: "clients.payments.url", file: "application-prod.yml", line: 4 },
        { system: "sql:orders", kind: "sql", environment: "prod", host: "db", source: "config", configKey: "spring.datasource.url", file: "application-prod.yml", line: 2 },
      ],
      targets: [{ entry: 3, kind: "outbound", target: "1", depth: 2 }],
    })
    const s = systemSummaries(m)
    expect(s.map(x => x.system)).toEqual(["payments", "sql:orders"])
    expect(s[0].hosts).toEqual([{ environment: "prod", host: "pay.nl" }, { environment: "", host: "localhost" }])
    expect(s[0].routes).toEqual([3])
    expect(s[0].resilience).toEqual(["timeout"])
    expect(s[1].configOnly).toBe(true)
  })
})

describe("flow", () => {
  it("lays a route out from handler to services, data and the tables and systems at the end", () => {
    const m = model({
      routes: [route(1, "GET", "/orders/{id}", { unit: "acme.OrderController", function: "OrderController.get" })],
      calls: [
        { fromUnit: "acme.OrderController", fromFunction: "OrderController.get", toUnit: "acme.OrderService", toFunction: "OrderService.find", via: "field", file: "", line: 1 },
        { fromUnit: "acme.OrderService", fromFunction: "OrderService.find", toUnit: "acme.DefaultOrderService", toFunction: "DefaultOrderService.find", via: "implementation", file: "", line: 1 },
        { fromUnit: "acme.DefaultOrderService", fromFunction: "DefaultOrderService.find", toUnit: "acme.OrderRepository", toFunction: "OrderRepository.findById", via: "field", file: "", line: 1 },
      ],
      access: [{ unit: "acme.OrderRepository", function: "", target: "Order", entity: "acme.Order", access: "read_write" }],
      units: new Map([
        ["acme.OrderController", { id: "acme.OrderController", name: "OrderController", component: "web", markers: "" }],
        ["acme.OrderService", { id: "acme.OrderService", name: "OrderService", component: "orders", markers: "" }],
        ["acme.DefaultOrderService", { id: "acme.DefaultOrderService", name: "DefaultOrderService", component: "orders", markers: "" }],
        ["acme.OrderRepository", { id: "acme.OrderRepository", name: "OrderRepository", component: "orders", markers: "" }],
      ]),
    })
    const f = flow(m, [1])
    expect(f.lanes.routes.map(n => n.label)).toEqual(["GET /orders/{id}"])
    expect(f.lanes.handlers.map(n => n.label)).toEqual(["OrderController"])
    expect(f.lanes.services.map(n => n.label)).toEqual(["DefaultOrderService", "OrderService"])
    expect(f.lanes.data.map(n => n.label)).toEqual(["OrderRepository"])
    expect(f.lanes.systems.map(n => n.label)).toEqual(["Order"])
    expect(f.edges.some(e => e.kind === "implementation")).toBe(true)
    expect(f.components).toEqual(["orders", "web"])
  })

  it("keeps a lane readable and says how much it left out", () => {
    const routes = Array.from({ length: 30 }, (_, i) => route(i + 1, "GET", `/r${i}`))
    const f = flow(model({ routes }), routes.map(r => r.id), 10)
    expect(f.lanes.routes).toHaveLength(10)
    expect(f.hidden.routes).toBe(20)
  })
})

describe("traced", () => {
  it("is the share of call sites followed", () => {
    expect(traced({ entry: 1, callSites: 4, resolved: 3, unknown: 1, units: 1, functions: 1, tables: 0, outbound: 0, depth: 1 })).toBe(0.75)
    expect(traced(undefined)).toBeNull()
  })
})
