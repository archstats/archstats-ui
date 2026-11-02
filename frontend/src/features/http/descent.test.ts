import { describe, expect, it } from "vitest"
import { EMPTY_MODEL, type Call, type HttpModel, type Route } from "./http"
import { codeIndex } from "./reach"
import { descent, nameWords } from "./descent"

const route = (id: number, path: string, unit: string, fn: string): Route => ({
  id, kind: "http", method: "POST", path, template: path, framework: "spring", handler: "", unit, function: fn, component: "web", auth: "", documented: "", file: "x", line: id,
})
const call = (fromUnit: string, fromFunction: string, toUnit: string, toFunction: string): Call => ({ fromUnit, fromFunction, toUnit, toFunction, via: "field", file: "x", line: 1 })

describe("descent", () => {
  const model: HttpModel = {
    ...EMPTY_MODEL, complete: true,
    calls: [call("web.OrderApi", "OrderApi.create", "svc.OrderService", "OrderService.create"), call("svc.OrderService", "OrderService.create", "web.Helper", "Helper.fmt"), call("svc.OrderService", "OrderService.create", "db.OrderRepo", "OrderRepo.save")],
    access: [{ unit: "db.OrderRepo", function: "OrderRepo.save", target: "", entity: "shop.Order", access: "write", via: "orm" }],
    outbound: [{ id: 1, kind: "http", client: "fetch", method: "POST", path: "/", template: "/", target: "", system: "payments", host: "", confidence: "resolved", resolvedVia: "", configKey: "", entry: 0, consumer: 0, resilience: "", unit: "svc.OrderService", function: "OrderService.create", component: "svc", file: "x", line: 1 }],
  }
  const lanes = new Map([["web.OrderApi", "controllers"], ["svc.OrderService", "services"], ["db.OrderRepo", "repositories"], ["web.Helper", "controllers"]])
  const d = descent(codeIndex(model), [route(1, "/orders", "web.OrderApi", "OrderApi.create")], u => lanes.get(u) ?? null, ["controllers", "services", "repositories"])

  it("stacks the route, its classes by layer, then data and systems", () => {
    expect(d.floors.map(f => f.id)).toEqual(["routes", "lane:controllers", "lane:services", "lane:repositories", "data", "outside"])
    expect(d.floors[1].nodes.map(n => n.label).sort()).toEqual(["Helper", "OrderApi"])
    expect(d.floors[4].nodes[0].label).toBe("Order")
  })

  it("links the calls, marks a call up the layers, and the write", () => {
    const k = (l: { from: string; to: string }) => `${l.from}>${l.to}`
    const by = new Map(d.links.map(l => [k(l), l]))
    expect(by.get("c:svc.OrderService>c:web.Helper")!.up).toBe(true)
    expect(by.get("c:web.OrderApi>c:svc.OrderService")!.up).toBe(false)
    expect(by.get("c:db.OrderRepo>t:shop.Order")!.kind).toBe("write")
    expect(by.get("c:svc.OrderService>s:payments")!.kind).toBe("out")
  })

  it("folds the least travelled nodes of a full floor into one", () => {
    const small = descent(codeIndex(model), [route(1, "/orders", "web.OrderApi", "OrderApi.create")], u => lanes.get(u) ?? null, ["controllers", "services", "repositories"], 1)
    const ctrl = small.floors.find(f => f.id === "lane:controllers")!
    expect(ctrl.nodes.map(n => n.kind)).toEqual(["more"])
    expect(ctrl.total).toBe(2)
  })

  it("puts a lane outside the layers where its calls point down, not at the bottom", () => {
    const m: HttpModel = { ...EMPTY_MODEL, complete: true, calls: [call("web.OrderApi", "a", "svc.OrderService", "b"), call("svc.OrderService", "b", "x.Fmt", "c"), call("x.Fmt", "c", "db.OrderRepo", "d")] }
    const at = new Map([["web.OrderApi", "controllers"], ["svc.OrderService", "services"], ["db.OrderRepo", "repositories"], ["x.Fmt", "unclassified"]])
    const f = descent(codeIndex(m), [route(1, "/orders", "web.OrderApi", "a")], u => at.get(u) ?? null, ["controllers", "services", "repositories"])
    expect(f.floors.map(x => x.id)).toEqual(["routes", "lane:controllers", "lane:services", "lane:unclassified", "lane:repositories"])
    expect(f.links.some(l => l.up)).toBe(false)
  })

  it("ranks a floor by how its names match what calls them", () => {
    const m: HttpModel = { ...EMPTY_MODEL, complete: true, calls: ["svc.AddressService", "svc.AuditLog", "svc.AffiliateService"].map(u => call("web.AffiliateController", "a", u, "b")) }
    const f = descent(codeIndex(m), [route(1, "/Affiliate/Create", "web.AffiliateController", "a")], u => (u.startsWith("web") ? "controllers" : "services"), ["controllers", "services"])
    expect(f.floors[2].nodes[0].label).toBe("AffiliateService")
    expect(nameWords("IAddressAttributeParsers")).toEqual(["address", "attribute", "parser"])
    expect(nameWords("CategoriesController")).toEqual(["category"])
  })
})
