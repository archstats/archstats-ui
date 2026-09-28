import { describe, expect, it } from "vitest"
import { runReading } from "./readings"

// A tiny Spring snapshot: a controller that reaches past its service into a
// repository, and an entity that reaches back up into the service.
const UNITS = [
    { id: "a.web.OrderController", kind: "type", name: "OrderController", component: "a.web", owner: "", file: "src/a/web/OrderController.java" },
    { id: "a.svc.OrderService", kind: "type", name: "OrderService", component: "a.svc", owner: "", file: "src/a/svc/OrderService.java" },
    { id: "a.repo.OrderRepository", kind: "type", name: "OrderRepository", component: "a.repo", owner: "", file: "src/a/repo/OrderRepository.java" },
    { id: "a.model.Order", kind: "type", name: "Order", component: "a.model", owner: "", file: "src/a/model/Order.java" },
]
const MARKERS = [
    { unit: "a.web.OrderController", source: "annotation", key: "RestController", value: null },
    { unit: "a.svc.OrderService", source: "annotation", key: "Service", value: null },
    { unit: "a.repo.OrderRepository", source: "supertype", key: "JpaRepository", value: null },
    { unit: "a.model.Order", source: "annotation", key: "Entity", value: null },
]
const EDGES = [
    ["a.web.OrderController", "a.svc.OrderService"], ["a.svc.OrderService", "a.repo.OrderRepository"],
    ["a.repo.OrderRepository", "a.model.Order"], ["a.web.OrderController", "a.repo.OrderRepository"],
    ["a.model.Order", "a.svc.OrderService"],
].map(([from, to]) => ({ from, to }))

function query(sql: string): any[] {
    if (sql.includes("sqlite_master")) return ["units", "unit_markers", "unit_connections", "files"].map(name => ({ name }))
    if (sql.includes("pragma_table_info('files')")) return [{ name: "role" }]
    if (sql.startsWith("SELECT id, kind, name, component, owner, file FROM units")) return UNITS
    if (sql.startsWith("SELECT id, kind, owner FROM units")) return UNITS
    if (sql.startsWith("SELECT unit, source, key, value FROM unit_markers")) return MARKERS
    if (sql.includes("FROM unit_connections")) return EDGES
    if (sql.startsWith("SELECT name, role FROM files")) return UNITS.map(u => ({ name: u.file, role: "production" }))
    return []
}
const ctx = () => ({ query: async (sql: string) => query(sql), revision: 3, label: (x: string) => x, aliases: {} })

describe("framework anatomy", () => {
    it("counts each role, and where each lives", async () => {
        const out = await runReading("roles", { profile: "spring" }, ctx())
        expect(out.values).toMatchObject({ declared: 4, Controllers: 1, Services: 1, Repositories: 1, Entities: 1 })
        expect(out.text).toContain("sorted into the roles Spring gives them")
        expect(out.text).toContain("- **1 controller**")
        expect(out.text).not.toContain("Archstats")
    })

    it("names the references that skip a layer or run back up", async () => {
        const out = await runReading("layers", { profile: "spring" }, ctx())
        expect(out.values).toEqual({ "one step down": 3, "skip a layer": 1, "back up": 1 })
        expect(out.text).toContain("Most go from controllers into repositories")
        expect(out.text).not.toContain("makes the most (1)")
        expect(out.text).toContain("from entities into services")
    })

    it("describes one role by what it uses and what uses it", async () => {
        const out = await runReading("role", { profile: "spring", lane: "repositories" }, ctx())
        expect(out.text).toContain("They use entities (1 time)")
        expect(out.text).toContain("They are used by controllers (1) and services (1)")
        expect((await runReading("role", { profile: "spring", lane: "nope" }, ctx())).absent).toBe(true)
    })
})
