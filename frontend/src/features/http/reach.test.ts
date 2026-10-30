import { describe, expect, it } from "vitest"
import { EMPTY_MODEL, type Call, type HttpModel, type Route } from "./http"
import { routeFacts, traceRoute, writes } from "./reach"

const route = (id: number, method: string, path: string, unit: string, fn: string, component: string, auth = ""): Route => ({
  id, kind: "http", method, path, template: path, framework: "spring", handler: "", unit, function: fn,
  component, auth, documented: "", file: "x", line: id,
})
const call = (fromUnit: string, fromFunction: string, toUnit: string, toFunction: string): Call => ({ fromUnit, fromFunction, toUnit, toFunction, via: "field", file: "x", line: 1 })
const unit = (id: string, component: string) => [id, { id, name: id.split(".").pop()!, component, markers: "", file: "", line: 0 }] as const

function shop(): { model: HttpModel; routes: Route[] } {
  const routes = [
    route(1, "GET", "/orders", "web.OrderController", "OrderController.list", "web", "PreAuthorize(\"hasRole('CLERK')\")"),
    route(2, "GET", "/orders/{id}/cancel", "web.OrderController", "OrderController.cancel", "web"),
    route(3, "POST", "/orders", "web.OrderController", "OrderController.create", "web", "AllowAnonymous"),
    route(4, "GET,POST", "/admin/users", "admin.UserAdmin", "UserAdmin.list", "admin"),
  ]
  const model: HttpModel = {
    ...EMPTY_MODEL, complete: true, reach: new Map(),
    units: new Map([unit("web.OrderController", "web"), unit("admin.UserAdmin", "admin"), unit("svc.OrderService", "svc.orders"), unit("svc.UserService", "svc.users")]),
    calls: [
      call("web.OrderController", "OrderController.list", "svc.OrderService", "OrderService.list"),
      call("web.OrderController", "OrderController.cancel", "svc.OrderService", "OrderService.cancel"),
      call("web.OrderController", "OrderController.create", "svc.OrderService", "OrderService.create"),
      call("admin.UserAdmin", "UserAdmin.list", "svc.UserService", "UserService.list"),
    ],
    access: [
      { unit: "svc.OrderService", function: "OrderService.list", target: "", entity: "shop.Order", access: "read", via: "orm" },
      { unit: "svc.OrderService", function: "OrderService.cancel", target: "", entity: "shop.Order", access: "read_write", via: "orm" },
      { unit: "svc.OrderService", function: "", target: "", entity: "shop.Order", access: "read_write", via: "orm" },
      { unit: "svc.OrderService", function: "OrderService.create", target: "", entity: "shop.Order", access: "write", via: "orm" },
    ],
    outbound: [{ id: 9, kind: "http", client: "fetch", method: "GET", path: "/", template: "/", target: "", system: "payments", host: "", confidence: "resolved", resolvedVia: "", configKey: "", entry: 0, consumer: 0, resilience: "retry", unit: "svc.OrderService", function: "OrderService.create", component: "svc.orders", file: "x", line: 1 }],
  }
  return { model, routes }
}

describe("writes", () => {
  it("takes a repository's direction from the function using it", () => {
    expect(writes("write", "X.get")).toBe(true)
    expect(writes("read", "X.delete")).toBe(false)
    expect(writes("read_write", "CategoryService.DeleteCategoryAsync")).toBe(true)
    expect(writes("read_write", "CategoryService.GetCategoryByIdAsync")).toBe(false)
    expect(writes("read_write", "Settings.setting")).toBe(false)
  })
})

describe("routeFacts", () => {
  it("knows what a route changes and waits on", () => {
    const { model, routes } = shop()
    const { facts } = routeFacts(model, routes)
    expect([...facts.get(2)!.writes]).toEqual(["shop.Order"])
    expect([...facts.get(1)!.reads]).toEqual(["shop.Order"])
    expect([...facts.get(3)!.unguarded]).toEqual(["payments"])
  })

  it("traces a route as a tree that ends in what it changes and calls", () => {
    const { model, routes } = shop()
    const { index } = routeFacts(model, routes)
    const { root } = traceRoute(index, routes[2])
    expect(root!.function).toBe("OrderController.create")
    expect(root!.children[0].writes).toEqual(["shop.Order"])
    expect(root!.children[0].systems).toEqual(["payments"])
  })
})
