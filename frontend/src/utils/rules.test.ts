import { describe, expect, it } from "vitest"
import {
    atLine, fallbackName, groupByRule, held, kindLabel, notApplicable, shortLocation, summarise, verdictOf,
    NOT_APPLICABLE, OK, VIOLATION, type RuleFinding,
} from "./rules"

const noDefs = () => undefined

function broke(rule: string, from: string, to: string, file: string, line = 1, kind = "import"): RuleFinding {
    return { rule, status: VIOLATION, from, to, kind, file, line }
}

function verdict(rule: string, status: string): RuleFinding {
    return { rule, status, from: "", to: "", kind: "", file: "", line: 0 }
}

describe("groupByRule", () => {
    it("counts distinct module pairs, not lines", () => {
        // Twenty imports between the same two modules is one architectural
        // fact, not twenty.
        const groups = groupByRule([
            broke("r", "a", "b", "a/1.php", 1),
            broke("r", "a", "b", "a/2.php", 2),
            broke("r", "a", "b", "a/3.php", 3),
        ], noDefs)

        expect(groups).toHaveLength(1)
        expect(groups[0].edges).toBe(1)
        expect(groups[0].files).toBe(3)
        expect(groups[0].violations).toHaveLength(3)
    })

    it("ranks by how many module pairs break the rule, not by raw count", () => {
        const groups = groupByRule([
            // Forty lines, one pair.
            ...Array.from({ length: 40 }, (_, i) => broke("noisy", "a", "b", `a/${i}.php`, i)),
            // Four lines, four pairs -- the worse problem.
            broke("spread", "a", "b", "x.php"), broke("spread", "c", "d", "y.php"),
            broke("spread", "e", "f", "z.php"), broke("spread", "g", "h", "w.php"),
        ], noDefs)

        expect(groups.map(g => g.id)).toEqual(["spread", "noisy"])
    })

    it("ignores the rules that held or never applied", () => {
        const groups = groupByRule([
            broke("broken", "a", "b", "f.php"),
            verdict("fine", OK),
            verdict("irrelevant", NOT_APPLICABLE),
        ], noDefs)

        expect(groups.map(g => g.id)).toEqual(["broken"])
    })

    it("takes its name and blurb from the definition registry", () => {
        const groups = groupByRule([broke("rules__symfony__x", "a", "b", "f.php")],
            () => ({
                name: "Component must not depend on Bundle",
                short: "The domain must stay usable without the framework.",
            }))

        expect(groups[0].name).toBe("Component must not depend on Bundle")
        expect(groups[0].short).toContain("usable without")
    })

    it("still names a rule whose definition never loaded", () => {
        // An old snapshot can carry rows whose definitions are missing. The
        // id is ugly but it is never nothing.
        const groups = groupByRule([broke("rules__dotnet__core_must_not_depend_on_plugin", "a", "b", "f.cs")], noDefs)
        expect(groups[0].name).toBe("Core must not depend on plugin")
    })

    it("orders violations so the list is stable between runs", () => {
        const groups = groupByRule([
            broke("r", "b", "c", "z.php", 9), broke("r", "a", "c", "y.php", 2), broke("r", "a", "c", "y.php", 1),
        ], noDefs)
        expect(groups[0].violations.map(x => `${x.from}:${x.line}`)).toEqual(["a:1", "a:2", "b:9"])
    })
})

describe("verdictOf", () => {
    it("separates a rule that held from a rule that could not be checked", () => {
        // The distinction the screen exists to make. "Core must not depend on
        // a plugin" holding in a .NET solution is a result; the same rule in
        // a Go repository has no opinion, and a green tick there would claim
        // something nobody checked.
        expect(verdictOf([verdict("a", OK), verdict("b", NOT_APPLICABLE)])).toBe("clean")
        expect(verdictOf([verdict("a", OK), broke("b", "x", "y", "f.php")])).toBe("violations")
    })

    it("reports no verdict at all when the project declares no modules", () => {
        // The engine returns nothing rather than a row per rule claiming it
        // held, because a rule about modules cannot be checked without them.
        expect(verdictOf([])).toBe("no-modules")
    })
})

describe("held and notApplicable", () => {
    const findings = [
        broke("broken", "a", "b", "f.php"),
        verdict("rules__go__internal_must_not_be_imported_from_outside", OK),
        verdict("rules__dotnet__core_must_not_depend_on_plugin", NOT_APPLICABLE),
        verdict("rules__symfony__component_must_not_depend_on_bundle", NOT_APPLICABLE),
    ]

    it("lists the rules that applied and held", () => {
        expect(held(findings, noDefs).map(g => g.id))
            .toEqual(["rules__go__internal_must_not_be_imported_from_outside"])
    })

    it("lists the rules that had no opinion, sorted by name", () => {
        expect(notApplicable(findings, noDefs).map(g => g.name))
            .toEqual(["Core must not depend on plugin", "Component must not depend on bundle"]
                .sort((a, b) => a.localeCompare(b)))
    })

    it("never counts a broken rule as either", () => {
        expect(held(findings, noDefs).map(g => g.id)).not.toContain("broken")
        expect(notApplicable(findings, noDefs).map(g => g.id)).not.toContain("broken")
    })
})

describe("labels", () => {
    it("names how an edge came to exist", () => {
        expect(kindLabel("manifest")).toBe("declared")
        expect(kindLabel("type_only")).toBe("types only")
        expect(kindLabel("dynamic")).toBe("dynamic")
        // An unclassified edge is an ordinary import, which is what every
        // edge was before kinds existed.
        expect(kindLabel("")).toBe("import")
        expect(kindLabel("import")).toBe("import")
    })

    it("writes file and line the way a person would paste it", () => {
        expect(atLine("src/A.php", 16)).toBe("src/A.php:16")
        // A manifest edge has no line; showing ":0" would be noise.
        expect(atLine("src/A.csproj", 0)).toBe("src/A.csproj")
    })

    it("summarises only when there is something to summarise", () => {
        expect(summarise([])).toBe("")
        expect(summarise(groupByRule([broke("r", "a", "b", "f.php")], noDefs))).toBe("1 violation across 1 rule")
        expect(summarise(groupByRule([broke("r", "a", "b", "f.php"), broke("s", "c", "d", "g.php")], noDefs)))
            .toBe("2 violations across 2 rules")
    })
})

describe("fallbackName", () => {
    it("strips the registry prefix", () => {
        expect(fallbackName("rules__go__internal_must_not_be_imported_from_outside"))
            .toBe("Internal must not be imported from outside")
        expect(fallbackName("weird")).toBe("Weird")
    })
})

describe("shortLocation", () => {
    it("keeps the line number, which a wide path would truncate away", () => {
        expect(shortLocation("src/Sylius/Component/Promotion/Repository/CatalogPromotionRepositoryInterface.php", 16))
            .toBe("CatalogPromotionRepositoryInterface.php:16")
    })

    it("drops the line when there is none", () => {
        // A manifest edge has no line.
        expect(shortLocation("src/Core/Acme.Core.csproj", 0)).toBe("Acme.Core.csproj")
    })

    it("survives a path with no directories", () => {
        expect(shortLocation("go.mod", 3)).toBe("go.mod:3")
    })
})
