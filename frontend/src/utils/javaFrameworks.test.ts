import { describe, expect, it } from "vitest"
import { BEAM, EMPTY_FACTS, JAKARTA, QUARKUS, SPRING, STRUCTURE, classify, detectFramework, type ClassFacts, languageOf, profilesFor, PROFILES } from "./javaFrameworks"

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
  it("is not confident when the strong classes are a sliver of a large codebase", () => {
    // Exposed: an ORM with a handful of Ktor samples among 2,810 classes.
    const sliver = detectFramework([...many(14, ["io.ktor.server.application.Application"]), ...many(2800, [])], "kotlin")
    expect(sliver.confident).toBe(false)
    // A large application with a small but real share still reads.
    const big = detectFramework([...many(60, ["io.ktor.server.application.Application"]), ...many(3000, [])], "kotlin")
    expect(big.id).toBe("ktor")
    expect(big.confident).toBe(true)
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

describe("languageOf", () => {
    it("reads the language off the files units are declared in", () => {
        expect(languageOf(["src/Main.java", "src/Other.java"])).toBe("java")
        expect(languageOf(["lib/router.go"])).toBe("go")
        expect(languageOf(["src/App.tsx", "src/util.ts"])).toBe("typescript")
        expect(languageOf(["shop/models.py"])).toBe("python")
        expect(languageOf(["src/Controller.php"])).toBe("php")
        expect(languageOf(["src/Program.cs"])).toBe("csharp")
        expect(languageOf(["src/Main.kt"])).toBe("kotlin")
    })

    it("takes the plurality, not the presence", () => {
        // A Spring service with a handful of Kotlin tests is a Java codebase,
        // and a Next.js app with one build script in Python is not Python.
        const files = [...Array(20).fill("src/A.java"), "src/ATest.kt", "build.py"]
        expect(languageOf(files)).toBe("java")
    })

    it("has no answer for a codebase of files it does not know", () => {
        expect(languageOf(["README.md", "Makefile"])).toBeNull()
        expect(languageOf([])).toBeNull()
    })
})

describe("profilesFor", () => {
    it("offers only the profiles for that language, plus the structural one", () => {
        const go = profilesFor("go").map(p => p.id)
        expect(go).toContain("go-http")
        expect(go).toContain("structure")
        expect(go).not.toContain("spring")
        expect(go).not.toContain("django")

        const py = profilesFor("python").map(p => p.id)
        expect(py).toContain("django")
        expect(py).not.toContain("nestjs")
    })

    it("offers everything when the language is unknown", () => {
        expect(profilesFor(null).length).toBe(PROFILES.length)
    })
})

describe("detectFramework across languages", () => {
    function facts(imports: string[], annotations: string[] = []): ClassFacts {
        return { ...EMPTY_FACTS, name: "Thing", imports: new Set(imports), annotations: new Set(annotations) }
    }

    it("finds Django from its imports and its filenames", () => {
        // Django puts the role in the filename: django-oscar has 29 apps.py
        // against 39 architectural decorators in the whole repository.
        const d = detectFramework(
            Array.from({ length: 12 }, () => facts(["django.db", "django.views"], ["models"])),
            "python",
        )
        expect(d.id).toBe("django")
        expect(d.confident).toBe(true)
    })

    it("finds NestJS in TypeScript", () => {
        const d = detectFramework(
            Array.from({ length: 12 }, () => facts(["@nestjs/common"], ["Injectable"])),
            "typescript",
        )
        expect(d.id).toBe("nestjs")
    })

    it("finds a Go service from net/http", () => {
        const d = detectFramework(
            Array.from({ length: 12 }, () => facts(["net/http", "github.com/gin-gonic/gin"])),
            "go",
        )
        expect(d.id).toBe("go-http")
    })

    // The reason detection is language-scoped at all. Every one of these
    // signals is shared with a profile for another language.
    it("never lets one language's profile win on another's codebase", () => {
        // `Controller` is Spring, Micronaut, NestJS, Angular-adjacent and
        // Laravel. On a Go codebase none of them may win.
        const goish = detectFramework(
            Array.from({ length: 12 }, () => facts(["net/http"], ["Controller", "Injectable"])),
            "go",
        )
        expect(goish.candidates.map(c => c.id)).not.toContain("spring")
        expect(goish.candidates.map(c => c.id)).not.toContain("nestjs")
        expect(goish.candidates.map(c => c.id)).not.toContain("laravel")

        // And Spring may not win on a TypeScript codebase that happens to
        // import something called `org.springframework` in a string.
        const tsish = detectFramework(
            Array.from({ length: 12 }, () => facts(["org.springframework.web"], ["Service"])),
            "typescript",
        )
        expect(tsish.candidates.map(c => c.id)).not.toContain("spring")
    })

    it("falls back to structure when no framework is imported anywhere", () => {
        // "No framework" is itself a confident answer, and a different one
        // from "several are close and I cannot choose".
        const d = detectFramework(Array.from({ length: 12 }, () => facts(["lodash"])), "typescript")
        expect(d.id).toBe("structure")
        expect(d.confident).toBe(true)
        expect(d.reason).toContain("No framework")
    })

    it("asks rather than guesses when the evidence is thin", () => {
        // One file importing React among twelve is not a React application.
        const thin = [facts(["react"]), ...Array.from({ length: 11 }, () => facts(["lodash"]))]
        const d = detectFramework(thin, "typescript")
        expect(d.id).toBe("structure")
        expect(d.confident).toBe(false)
    })
})

describe("profiles split out what their rules did not match", () => {
    it("gives every profile an Unclassified lane and sends unmatched units there", async () => {
        const { PROFILES, UNCLASSIFIED, classify } = await import("./javaFrameworks")
        for (const p of PROFILES) {
            expect(p.fallback).toBe(UNCLASSIFIED)
            expect(p.lanes.some(l => l.id === UNCLASSIFIED)).toBe(true)
            // No real lane keeps "& Other" once other has its own lane.
            for (const l of p.lanes) expect(l.label).not.toMatch(/& Other$/)
        }
        const spring = PROFILES.find(p => p.id === "spring")!
        const none = { name: "Sku", annotations: new Set<string>(), supertypes: new Set<string>(), legacy: new Set<string>(),
            imports: new Set<string>(), methods: new Set<string>(), fields: 0, methodCount: 0, isRecord: false, isInterface: true }
        expect(classify(spring, none)).toBe(UNCLASSIFIED)
        expect(classify(spring, { ...none, annotations: new Set(["Service"]) })).toBe("services")
        expect(spring.lanes.find(l => l.id === "services")!.label).toBe("Services")
    })
})
