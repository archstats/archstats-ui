import { describe, expect, it } from "vitest"
import { accessClass, accessLabel, componentLabels, contracts, domainLabels, contractState, EMPTY_MODEL, resourceGroups, systemSummaries, traced, underPrefix, type HttpModel, type Route } from "./http"

const route = (id: number, method: string, path: string, extra: Partial<Route> = {}): Route => ({
  id, kind: "http", method, path, template: path.replace(/\{[^}]*\}/g, "{}"), framework: "spring", handler: "", unit: "", function: "",
  component: "web", auth: "", documented: "", file: "Web.java", line: id, ...extra,
})

function model(over: Partial<HttpModel>): HttpModel {
  return { ...EMPTY_MODEL, reach: new Map(), units: new Map(), complete: true, ...over }
}

describe("resourceGroups", () => {
  it("groups by resource after the shared base and versions, and says the controller once", () => {
    const groups = resourceGroups([
      route(1, "GET", "/api/v1/orders", { function: "OrderController.list" }),
      route(2, "POST", "/api/v1/orders", { function: "OrderController.create" }),
      route(3, "GET", "/api/v1/orders/{id}", { function: "OrderController.get" }),
      route(4, "POST", "/api/v1/orders/{id}/cancel", { function: "Refunds.cancel" }),
      route(5, "GET", "/api/v1/customers/{id}", { function: "CustomerController.get" }),
    ])
    expect(groups.map(g => `${g.base}|${g.resource} ${g.controller} ${g.routes.length}`)).toEqual([
      "/api/v1|customers CustomerController 1",
      "/api/v1|orders OrderController 4",
    ])
    expect(groups[1].routes.map(r => `${r.route.method} ${r.rest || "·"} ${r.member}`)).toEqual([
      "GET · list",
      "POST · create",
      "GET /{id} get",
      "POST /{id}/cancel Refunds.cancel",
    ])
  })

  it("keeps the resource of a single-resource API and groups parameter-led paths under the base", () => {
    const groups = resourceGroups([route(1, "GET", "/orders"), route(2, "GET", "/orders/{id}"), route(3, "GET", "/{tenant}/health")])
    expect(groups.map(g => g.key)).toEqual(["/", "/orders"])
  })

  it("says access once when every route shares it, and per route when they differ", () => {
    const same = resourceGroups([route(1, "GET", "/a", { auth: "AuthorizeAdmin" }), route(2, "GET", "/a/y", { auth: "AuthorizeAdmin" })])
    expect(same[0].access).toBe("AuthorizeAdmin")
    expect(same[0].accessMixed).toBe(false)
    const mixed = resourceGroups([route(1, "GET", "/a", { auth: "AuthorizeAdmin" }), route(2, "GET", "/a/y")])
    expect(mixed[0].access).toBeNull()
    expect(mixed[0].accessMixed).toBe(true)
  })

  it("adds up what the group's routes reach", () => {
    const reach = new Map([[1, { entry: 1, callSites: 4, resolved: 4, unknown: 0, units: 9, functions: 4, tables: 2, outbound: 0, depth: 2 }]])
    const [g] = resourceGroups([route(1, "GET", "/a"), route(2, "GET", "/a/b")], reach, [
      { entry: 1, kind: "table", target: "orders", depth: 2 },
      { entry: 2, kind: "table", target: "orders", depth: 1 },
      { entry: 2, kind: "outbound", target: "7", depth: 3 },
    ])
    expect([g.units, g.tables, g.outbound, g.traced]).toEqual([9, 1, 1, true])
  })

  it("selects routes under a group's key by whole segments", () => {
    const rs = [route(1, "GET", "/orders"), route(2, "GET", "/orders/{id}"), route(3, "GET", "/orders-archive")]
    expect(underPrefix(rs, "/orders").map(r => r.id)).toEqual([1, 2])
  })
})

describe("accessLabel", () => {
  it("names a rule by the word that tells it apart", () => {
    expect(accessLabel("CheckPermission(StandardPermission.Customers.ACTIVITY_LOG_DELETE)")).toBe("ACTIVITY_LOG_DELETE")
    expect(accessLabel("AuthorizeAdmin")).toBe("AuthorizeAdmin")
    expect(accessLabel(`PreAuthorize("hasRole('ADMIN')")`)).toBe("hasRole ADMIN")
    expect(accessLabel(`Authorize(Roles = "Clerk")`)).toBe("Authorize Clerk")
    expect(accessLabel(`hasAnyAuthority(ALL_FUNCTIONS, ALL_FUNCTIONS_READ, "READ_MEETING")`)).toBe("READ_MEETING")
    expect(accessLabel("access(allOfRequestManagers(authorizationManagers))")).toBe("access(…)")
    expect(accessLabel("permitAll")).toBe("permitAll")
    expect(accessLabel("")).toBeNull()
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

describe("traced", () => {
  it("is the share of call sites followed", () => {
    expect(traced({ entry: 1, callSites: 4, resolved: 3, unknown: 1, units: 1, functions: 1, tables: 0, outbound: 0, depth: 1 })).toBe(0.75)
    expect(traced(undefined)).toBeNull()
  })
})

describe("accessClass", () => {
  it("reads what a rule asks for from its words", () => {
    expect(accessClass("")).toBe("none")
    expect(accessClass("AllowAnonymous")).toBe("open")
    expect(accessClass("permitAll")).toBe("open")
    expect(accessClass("CheckAccessPublicStore")).toBe("open")
    expect(accessClass("CheckPermission(StandardPermission.Customers.ACTIVITY_LOG_DELETE)")).toBe("rule")
    expect(accessClass("AuthorizeAdmin")).toBe("rule")
    expect(accessClass(`hasAnyAuthority(ALL_FUNCTIONS, ALL_FUNCTIONS_READ, "READ_MEETING")`)).toBe("rule")
    expect(accessClass("Authorize")).toBe("signedIn")
    expect(accessClass("requireJwtAuth")).toBe("signedIn")
    expect(accessClass("permission_classes = [IsAuthenticated]")).toBe("signedIn")
    expect(accessClass("loginLimiter")).toBe("signedIn")
    expect(accessClass("verifyEmailLimiter")).toBe("other")
  })
})

describe("componentLabels", () => {
  it("drops the shared front and the word every component ends in", () => {
    const m = componentLabels(["org.apache.fineract.portfolio.loanaccount.api", "org.apache.fineract.portfolio.savings.api", "org.apache.fineract.useradministration.api"])
    expect([...m.values()]).toEqual(["portfolio.loanaccount", "portfolio.savings", "useradministration"])
  })
})

describe("domainLabels", () => {
  it("names a data namespace by what tells it apart", () => {
    expect([...domainLabels(["Nop.Core.Domain.Catalog", "Nop.Core.Domain.Orders"]).values()]).toEqual(["Catalog", "Orders"])
    expect([...domainLabels(["org.apache.fineract.portfolio.loanaccount.domain", "org.apache.fineract.portfolio.client.domain"]).values()]).toEqual(["loanaccount", "client"])
    expect([...domainLabels(["Nop.Core.Domain.Catalog", "Nop.Plugin.Tax.Avalara.Domain", "a.billing.Orders", "b.shop.Orders"]).values()]).toEqual(["Catalog", "Avalara", "billing.Orders", "shop.Orders"])
  })
})
