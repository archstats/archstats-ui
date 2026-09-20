import { describe, expect, it } from "vitest"
import { BEAM, EMPTY_FACTS, JAKARTA, QUARKUS, SPRING, STRUCTURE, classify, detectFramework, type ClassFacts } from "./javaFrameworks"

const facts = (name: string, o: Partial<{ annotations: string[]; supertypes: string[]; legacy: string[]; imports: string[]; methods: string[]; fields: number; methodCount: number; isRecord: boolean; isInterface: boolean }> = {}): ClassFacts => ({
  ...EMPTY_FACTS, name,
  annotations: new Set(o.annotations ?? []), supertypes: new Set(o.supertypes ?? []), legacy: new Set(o.legacy ?? []),
  imports: new Set(o.imports ?? []), methods: new Set(o.methods ?? []),
  fields: o.fields ?? 0, methodCount: o.methodCount ?? 0, isRecord: o.isRecord ?? false, isInterface: o.isInterface ?? false,
})

describe("framework detection", () => {
  const many = (n: number, imports: string[]) => Array.from({ length: n }, (_, i) => facts("C" + i, { imports }))
  it("is confident about Spring from its web and stereotype packages", () => {
    const r = detectFramework([...many(6, ["org.springframework.stereotype.Service"]), ...many(30, [])])
    expect(r.id).toBe("spring")
    expect(r.confident).toBe(true)
  })
  it("is not confident when a codebase only reuses CDI and injection (a framework like Elepy)", () => {
    const r = detectFramework([...many(70, ["jakarta.enterprise.context.ApplicationScoped", "jakarta.inject.Inject"]), ...many(300, [])])
    expect(r.confident).toBe(false)
    expect(r.id).toBe("structure")
    expect(r.candidates[0].id).toBe("jakarta")
    expect(r.candidates[0].strong).toBe(0)
    expect(r.reason).toMatch(/Shared APIs/)
  })
  it("lets a distinctive import outrank the shared Jakarta standard", () => {
    const r = detectFramework([...many(4, ["jakarta.ws.rs.Path"]), ...many(3, ["io.quarkus.runtime.Quarkus"]), ...many(20, [])])
    expect(r.id).toBe("quarkus")
    expect(r.confident).toBe(true)
  })
  it("asks when two frameworks are close", () => {
    const r = detectFramework([...many(5, ["org.springframework.web.bind.annotation.RestController"]), ...many(4, ["io.micronaut.http.annotation.Controller"]), ...many(20, [])])
    expect(r.confident).toBe(false)
    expect(r.candidates.map(c => c.id).slice(0, 2).sort()).toEqual(["micronaut", "spring"])
  })
  it("votes Beam from supertypes and Android from imports", () => {
    expect(detectFramework([facts("A", { supertypes: ["PTransform"] }), facts("B", { supertypes: ["DoFn"] }), facts("C", { imports: ["org.apache.beam.sdk.Pipeline"] })]).id).toBe("beam")
    expect(detectFramework([facts("A", { imports: ["android.app.Activity"] }), facts("B", { imports: ["androidx.lifecycle.ViewModel"] }), facts("C", { imports: ["android.os.Bundle"] })]).id).toBe("android")
  })
  it("is confidently structural with no framework packages at all", () => {
    const r = detectFramework([facts("OrderService"), facts("OrderDto")])
    expect(r.id).toBe("structure")
    expect(r.confident).toBe(true)
  })
})

describe("classification", () => {
  it("puts Spring beans without a stereotype and plain classes in Services & Other", () => {
    expect(classify(SPRING, facts("Foo", { annotations: ["Component"] }))).toBe("services")
    expect(classify(SPRING, facts("OrderMapper"))).toBe("services")
    expect(classify(SPRING, facts("OrderRepository", { supertypes: ["JpaRepository"] }))).toBe("repositories")
    expect(classify(SPRING, facts("Order", { annotations: ["Entity"] }))).toBe("entities")
    expect(classify(SPRING, facts("X", { legacy: ["java__spring__controller"] }))).toBe("controllers")
  })
  it("prefers facts over imports, and imports over naming", () => {
    expect(classify(JAKARTA, facts("OrderRepository", { annotations: ["Stateless"] }))).toBe("beans")
    expect(classify(JAKARTA, facts("OrderDao"))).toBe("repositories")
    expect(classify(QUARKUS, facts("OrdersApi", { imports: ["jakarta.ws.rs.GET"] }))).toBe("resources")
    expect(classify(BEAM, facts("ParseFn", { supertypes: ["DoFn"] }))).toBe("fns")
  })
  it("classifies by structure without a framework", () => {
    expect(classify(STRUCTURE, facts("App", { methods: ["main"] }), { inDegree: 5, outDegree: 3 })).toBe("entry")
    expect(classify(STRUCTURE, facts("Orphan", { methods: ["run"] }), { inDegree: 0, outDegree: 4 })).toBe("entry")
    expect(classify(STRUCTURE, facts("OrderStore", { imports: ["java.sql.Connection"] }), { inDegree: 3, outDegree: 1 })).toBe("data")
    expect(classify(STRUCTURE, facts("Point", { isRecord: true }), { inDegree: 9, outDegree: 0 })).toBe("models")
    expect(classify(STRUCTURE, facts("Money", { fields: 2, methodCount: 4 }), { inDegree: 9, outDegree: 1 })).toBe("models")
    expect(classify(STRUCTURE, facts("Pricing", { fields: 1, methodCount: 12 }), { inDegree: 4, outDegree: 6 })).toBe("logic")
    expect(classify(STRUCTURE, facts("OrderController"), { inDegree: 4, outDegree: 6 })).toBe("entry")
  })
})
