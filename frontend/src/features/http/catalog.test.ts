import { describe, expect, it } from "vitest"
import type { Route } from "./http"
import type { RouteFacts } from "./reach"
import { catalog, FILTER_TEST, haystack, matches, methodsOf, pathParts, sharedPath } from "./catalog"

const route = (id: number, method: string, path: string, unit: string, auth = ""): Route => ({
  id, kind: "http", method, path, template: path, framework: "spring", handler: "", unit, function: `${unit.split(".").pop()}.f${id}`,
  component: "web", auth, documented: "", file: "Web.java", line: id,
})
const fact = (writes: string[], reads: string[], waits: string[] = [], unguarded: string[] = []): RouteFacts => ({
  writes: new Set(writes), reads: new Set(reads), waits: new Set(waits), unguarded: new Set(unguarded), other: new Set(), mayWrite: new Set(), followed: true, units: new Map(),
})

describe("catalog", () => {
  const routes = [
    route(1, "GET", "/orders/{id}", "web.OrderApi", "PreAuthorize(\"hasRole('CLERK')\")"),
    route(2, "POST", "/orders", "web.OrderApi"),
    route(3, "", "/health", "web.Health"),
  ]
  const facts = new Map([[1, fact([], ["shop.Order"])], [2, fact(["shop.Order", "shop.Line"], [], ["payments"], ["payments"])]])
  const groups = catalog(routes, facts, [], s => s)

  it("groups endpoints by the class that answers them, under the path they share", () => {
    expect(groups.map(g => [g.path, g.owner])).toEqual([["/health", "Health"], ["/orders", "OrderApi"]])
    expect(groups[1].endpoints.map(e => e.route.id)).toEqual([2, 1])
    expect(groups[1].endpoints[0].changes).toEqual(["Line", "Order"])
    expect(groups[1].endpoints[1].accessText).toBe("hasRole CLERK")
    expect(methodsOf(routes[2])).toEqual(["ANY"])
  })

  it("finds an endpoint by any of what it does, and filters by the questions", () => {
    const post = groups[1].endpoints[0]
    expect(matches(post, haystack(post), ["post", "line"])).toBe(true)
    expect(matches(post, haystack(post), ["delete"])).toBe(false)
    expect(FILTER_TEST.noTimeout(post)).toBe(true)
    expect(FILTER_TEST.noRule(post)).toBe(true)
    expect(FILTER_TEST.noRule(groups[1].endpoints[1])).toBe(false)
    expect(FILTER_TEST.notFollowed(groups[0].endpoints[0])).toBe(true)
  })

  it("marks path parameters and finds the shared path", () => {
    expect(pathParts("/orders/{id}/lines/:line")).toEqual([{ text: "orders", param: false }, { text: "{id}", param: true }, { text: "lines", param: false }, { text: ":line", param: true }])
    expect(sharedPath(["/a/b/c", "/a/b", "/a/b/d"])).toBe("/a/b")
  })
})
