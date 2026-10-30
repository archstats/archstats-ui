import { describe, expect, it } from "vitest"
import { EMPTY_MODEL, type Call, type HttpModel, type Route } from "./http"
import { apiStack, foldStack, litBy } from "./stack"

const route = (id: number, path: string, unit: string, fn: string, component: string): Route => ({
  id, kind: "http", method: "GET", path, template: path, framework: "spring", handler: "", unit, function: fn,
  component, auth: "", documented: "", file: "x", line: id,
})
const call = (fromUnit: string, fromFunction: string, toUnit: string, toFunction: string): Call => ({ fromUnit, fromFunction, toUnit, toFunction, via: "field", file: "x", line: 1 })
const unit = (id: string, component: string) => [id, { id, name: id.split(".").pop()!, component, markers: "" }] as const

function shop(): { model: HttpModel; routes: Route[] } {
  const routes = [
    route(1, "/orders", "web.OrderController", "OrderController.list", "web"),
    route(2, "/orders/{id}", "web.OrderController", "OrderController.get", "web"),
    route(3, "/admin/users", "admin.UserAdmin", "UserAdmin.list", "admin"),
  ]
  const model: HttpModel = {
    ...EMPTY_MODEL, complete: true, reach: new Map(),
    units: new Map([unit("web.OrderController", "web"), unit("admin.UserAdmin", "admin"), unit("svc.OrderService", "svc.orders"), unit("svc.UserService", "svc.users"), unit("db.Repo", "db")]),
    calls: [
      call("web.OrderController", "OrderController.list", "svc.OrderService", "OrderService.list"),
      call("web.OrderController", "OrderController.get", "svc.OrderService", "OrderService.get"),
      call("svc.OrderService", "OrderService.get", "db.Repo", "Repo.find"),
      call("admin.UserAdmin", "UserAdmin.list", "svc.UserService", "UserService.list"),
    ],
    access: [
      { unit: "svc.OrderService", function: "OrderService.list", target: "", entity: "shop.Order", access: "read" },
      { unit: "db.Repo", function: "Repo.find", target: "", entity: "shop.OrderLine", access: "read" },
      { unit: "svc.UserService", function: "UserService.list", target: "", entity: "auth.User", access: "read" },
    ],
    outbound: [{ id: 9, kind: "http", client: "fetch", method: "GET", path: "/", template: "/", target: "", system: "mail-api", host: "", confidence: "resolved", resolvedVia: "", configKey: "", entry: 0, consumer: 0, resilience: "", unit: "svc.UserService", function: "UserService.list", component: "svc.users", file: "x", line: 1 }],
  }
  return { model, routes }
}

describe("apiStack", () => {
  it("lays the code a route reaches on floors by how many calls in it sits, and ends at data and systems", () => {
    const { model, routes } = shop()
    const st = apiStack(model, routes)
    const floor = (id: string) => st.boxes.get(id)?.floor
    expect([floor("area:web"), floor("comp:svc.orders"), floor("comp:db"), floor("data:shop.Order"), floor("sys:mail-api")]).toEqual(["api", "near", "mid", "data", "outside"])
    expect([...st.boxes.get("comp:svc.orders")!.routes]).toEqual([1, 2])
    expect(st.bands.map(b => `${b.id}:${b.routes.size}`).sort()).toEqual([
      "area:admin>comp:svc.users:1", "area:web>comp:svc.orders:2", "comp:db>data:shop.OrderLine:1",
      "comp:svc.orders>comp:db:1", "comp:svc.orders>data:shop.Order:1", "comp:svc.users>data:auth.User:1", "comp:svc.users>sys:mail-api:1",
    ])
    expect(st.paths.get(2)!.get("comp:svc.orders")).toEqual(["OrderService"])
  })

  it("opens the API floor into resources when asked", () => {
    const { model, routes } = shop()
    const st = apiStack(model, routes.slice(0, 2), "resource")
    expect(st.floors[0].boxes.map(b => b.label)).toEqual(["/orders"])
  })

  it("sets aside the code most routes pass through", () => {
    const routes = Array.from({ length: 20 }, (_, i) => route(i + 1, `/r${i}`, "web.C", `C.m${i}`, "web"))
    const model: HttpModel = {
      ...EMPTY_MODEL, complete: true, reach: new Map(), units: new Map([unit("web.C", "web"), unit("core.Ctx", "core"), unit("svc.A", "svc")]),
      calls: [...routes.map(r => call("web.C", r.function, "core.Ctx", "Ctx.get")), call("web.C", "C.m0", "svc.A", "A.run")],
    }
    const st = apiStack(model, routes)
    expect(st.boxes.get("comp:core")!.shared).toBe(true)
    expect(st.bands.map(b => b.id)).toEqual(["area:web>comp:svc"])
    expect(st.floors.find(f => f.id === "near")!.shared.map(b => b.id)).toEqual(["comp:core"])
  })

  it("lights what a set of routes passes", () => {
    const { model, routes } = shop()
    const lit = litBy(apiStack(model, routes), new Set([3]))
    expect([...lit.boxes.keys()].sort()).toEqual(["area:admin", "comp:svc.users", "data:auth.User", "sys:mail-api"])
  })
})

describe("foldStack", () => {
  it("keeps each floor's biggest boxes and folds the rest, bands and all", () => {
    const { model, routes } = shop()
    const st = apiStack(model, routes)
    const folded = foldStack(st, f => (f === "data" ? 2 : 9))
    const data = folded.floors.find(f => f.id === "data")!
    expect(data.boxes.map(b => b.id)).toEqual([st.floors.find(f => f.id === "data")!.boxes[0].id, "more:data"])
    expect(folded.boxes.get("more:data")!.parts.size).toBe(2)
    expect(folded.bands.every(b => folded.boxes.has(b.from) && folded.boxes.has(b.to))).toBe(true)
  })
})
