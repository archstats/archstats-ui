import { describe, expect, it } from "vitest"
import type { Endpoint } from "./catalog"
import { marks, mountedFit, parseQuery, pathFit, pathOf, score, suggest } from "./search"

const ep = (id: number, methods: string[], path: string, unit: string, changes: string[] = [], calls: string[] = []): Endpoint => ({
  route: { id, kind: "http", method: methods.join(","), path, template: path, framework: "", handler: "", unit, function: "", component: "", auth: "", documented: "", file: "", line: 0 },
  methods, handler: "", access: "none", accessText: null, contract: "none", changes, mayChange: [], reads: [], calls, unguarded: [], followed: true,
})
const hay = (e: Endpoint) => [e.methods.join(" "), e.route.path, e.route.unit, ...e.changes, ...e.calls].join(" ").toLowerCase()

describe("search", () => {
  const order = ep(1, ["GET"], "/api/orders/{id}", "web.OrderApi", [], ["payments"])
  const del = ep(2, ["POST"], "/Customer/Delete", "web.CustomerController", ["Customer", "Address"])

  it("reads a pasted URL as its path, and a method word as a method", () => {
    expect(pathOf("https://shop.example.com/api/orders/42?x=1#top")).toBe("/api/orders/42")
    const q = parseQuery("post customer")
    expect(q.tokens).toEqual([{ kind: "method", value: "POST" }])
    expect(q.words).toEqual(["customer"])
  })

  it("fits a concrete path to a template, also under a mount point", () => {
    expect(pathFit("/api/orders/{id}", "/api/orders/42")).toBeGreaterThan(0)
    expect(pathFit("/api/orders/{id}", "/api/orders")).toBe(0)
    expect(mountedFit("/orders/{id}", "/v2/orders/42")).toBeGreaterThan(0)
    expect(mountedFit("/", "/Order/CancelOrder")).toBe(0)
    expect(score(order, hay(order), parseQuery("https://x.io/api/orders/7"))).toBeGreaterThan(0)
    expect(score(del, hay(del), parseQuery("https://x.io/api/orders/7"))).toBe(0)
    expect(score(del, hay(del), parseQuery("/cust"))).toBeGreaterThan(0)
  })

  it("matches every word and every token", () => {
    expect(score(del, hay(del), parseQuery("cust del"))).toBeGreaterThan(0)
    expect(score(del, hay(del), parseQuery("get customer"))).toBe(0)
    expect(score(del, hay(del), parseQuery("", [{ kind: "table", value: "Address" }]))).toBeGreaterThan(0)
    expect(score(order, hay(order), parseQuery("", [{ kind: "system", value: "billing" }]))).toBe(0)
  })

  it("finds a route that takes any method by ANY, not by POST", () => {
    const any = ep(1, ["ANY"], "/orders", "OrderController")
    const post = ep(2, ["POST"], "/orders", "OrderController")
    const both = ep(3, ["PUT", "PATCH"], "/orders/{id}", "OrderController")
    const q = (m: string) => parseQuery("", [{ kind: "method", value: m }])
    expect(score(any, hay(any), q("POST"))).toBe(0)
    expect(score(post, hay(post), q("POST"))).toBeGreaterThan(0)
    expect(score(any, hay(any), q("ANY"))).toBeGreaterThan(0)
    expect(score(both, hay(both), q("PATCH"))).toBeGreaterThan(0)
  })

  it("suggests what a word could mean, and marks where words occur", () => {
    expect(suggest([order, del], "cust").map(s => [s.token.kind, s.label])).toEqual([["table", "Customer"], ["class", "CustomerController"]])
    expect(marks("/Customer/Delete", ["cust", "del"]).filter(m => m.hit).map(m => m.text)).toEqual(["Cust", "Del"])
  })
})
