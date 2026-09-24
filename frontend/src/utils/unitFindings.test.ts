import { describe, expect, it } from "vitest"
import { unitFindings, type FindingSection } from "./unitFindings"
import type { UnitNode } from "~/composables/useUnitsModel"

function unit(id: string, name: string, file: string, extra: Partial<UnitNode> = {}): UnitNode {
    return {
        id, kind: "function", name, scope: file, component: "c", module: "",
        file, owner: "", lane: "logic", fanIn: 0, fanOut: 0, weight: 1, ...extra,
    }
}

const find = (s: FindingSection[], kind: string) => s.find((x) => x.kind === kind)

describe("unitFindings", () => {
    it("says nothing about an empty codebase", () => {
        expect(unitFindings({ units: [], edges: [] })).toEqual([])
    })

    describe("repeated names", () => {
        const copies = ["a", "b", "c", "d"].map((f) =>
            unit(`${f}#handleChange`, "handleChange", `${f}.ts`))

        it("finds one name written out in several files", () => {
            const f = find(unitFindings({ units: copies, edges: [] }), "repeated")!.findings[0]
            expect(f.headline).toBe("handleChange is declared in 4 different files.")
            expect(f.files.sort()).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"])
        })

        it("ignores names the language requires", () => {
            // `constructor` is in 42 LibreChat files and means nothing; the
            // same count for a handler means eighteen people wrote it twice.
            const ceremony = ["a", "b", "c", "d"].map((f) =>
                unit(`${f}#constructor`, "constructor", `${f}.ts`))
            expect(find(unitFindings({ units: ceremony, edges: [] }), "repeated")).toBeUndefined()
        })

        it("does not call two occurrences a pattern", () => {
            const twice = ["a", "b"].map((f) => unit(`${f}#x`, "sameName", `${f}.ts`))
            expect(find(unitFindings({ units: twice, edges: [] }), "repeated")).toBeUndefined()
        })

        it("counts distinct files, not declarations", () => {
            // Two overloads in one file are one place, not two.
            const sameFile = [
                unit("a#x1", "overloaded", "a.ts"), unit("a#x2", "overloaded", "a.ts"),
                unit("b#x", "overloaded", "b.ts"),
            ]
            expect(find(unitFindings({ units: sameFile, edges: [] }), "repeated")).toBeUndefined()
        })
    })

    describe("crowded files", () => {
        const many = Array.from({ length: 14 }, (_, i) => unit(`big#u${i}`, `u${i}`, "big.ts"))

        it("names a file declaring an unusual number of things", () => {
            const f = find(unitFindings({ units: many, edges: [] }), "crowded")!.findings[0]
            expect(f.headline).toBe("big declares 14 separate things.")
            expect(f.files).toEqual(["big.ts"])
        })

        it("leaves an ordinary file alone", () => {
            const few = Array.from({ length: 4 }, (_, i) => unit(`ok#u${i}`, `u${i}`, "ok.ts"))
            expect(find(unitFindings({ units: few, edges: [] }), "crowded")).toBeUndefined()
        })
    })

    describe("overgrown types", () => {
        it("counts the members of one type", () => {
            const members = Array.from({ length: 13 }, (_, i) =>
                unit(`f#m${i}`, `m${i}`, "f.ts", { owner: "f#Big" }))
            const f = find(unitFindings({ units: members, edges: [] }), "overgrown")!.findings[0]
            expect(f.headline).toBe("Big has 13 members.")
        })

        it("has nothing to say where a language records no owners", () => {
            // Java is one type per file with no members recorded; the section
            // must be absent rather than empty.
            const java = Array.from({ length: 20 }, (_, i) => unit(`T${i}`, `T${i}`, `T${i}.java`))
            expect(find(unitFindings({ units: java, edges: [] }), "overgrown")).toBeUndefined()
        })
    })

    describe("load-bearing declarations", () => {
        const hub = unit("util#cn", "cn", "util.ts")
        const users = Array.from({ length: 9 }, (_, i) => unit(`u${i}#x`, `x${i}`, `u${i}.ts`))
        const edges = users.map((u) => ({ from: u.id, to: hub.id }))

        it("counts distinct importers, not references", () => {
            const f = find(unitFindings({ units: [hub, ...users], edges }), "loadBearing")!.findings[0]
            expect(f.headline).toBe("cn is used by 9 other declarations.")
        })

        it("carries the importing files so the coupling can be handed on", () => {
            const f = find(unitFindings({ units: [hub, ...users], edges }), "loadBearing")!.findings[0]
            expect(f.files).toContain("util.ts")
            expect(f.files).toContain("u0.ts")
        })

        it("does not call a lightly used declaration load-bearing", () => {
            const light = [{ from: "u0#x", to: hub.id }]
            expect(find(unitFindings({ units: [hub, ...users], edges: light }), "loadBearing")).toBeUndefined()
        })
    })

    describe("entangled declarations", () => {
        it("reports a mutual pair once, whichever way round it was seen", () => {
            const a = unit("a#A", "A", "a.ts")
            const b = unit("b#B", "B", "b.ts")
            const s = find(unitFindings({
                units: [a, b],
                edges: [{ from: a.id, to: b.id }, { from: b.id, to: a.id }],
            }), "entangled")!
            expect(s.findings).toHaveLength(1)
            expect(s.findings[0].headline).toMatch(/A and B use each other|B and A use each other/)
        })

        it("does not call a one-way dependency entangled", () => {
            const a = unit("a#A", "A", "a.ts")
            const b = unit("b#B", "B", "b.ts")
            expect(find(unitFindings({ units: [a, b], edges: [{ from: a.id, to: b.id }] }), "entangled"))
                .toBeUndefined()
        })
    })

    describe("unreachable declarations", () => {
        it("counts what no import reaches and says why", () => {
            const a = unit("a#A", "A", "a.ts")
            const b = unit("b#B", "B", "b.ts")
            const method = unit("a#A.run", "run", "a.ts", { owner: "a#A" })
            const f = find(unitFindings({
                units: [a, b, method], edges: [{ from: a.id, to: b.id }],
            }), "unreachable")!.findings[0]
            expect(f.headline).toBe("1 declarations are never imported.")
            expect(f.detail).toContain("called rather than imported")
        })

        it("is absent when every declaration is reached", () => {
            const a = unit("a#A", "A", "a.ts")
            const b = unit("b#B", "B", "b.ts")
            expect(find(unitFindings({ units: [a, b], edges: [{ from: a.id, to: b.id }] }), "unreachable"))
                .toBeUndefined()
        })
    })

    it("gives every finding files to hand to Connections", () => {
        // The whole handoff depends on this: a finding with no files cannot
        // open anywhere, and Connections works in files.
        const units = [
            ...["a", "b", "c"].map((f) => unit(`${f}#dup`, "dup", `${f}.ts`)),
            ...Array.from({ length: 14 }, (_, i) => unit(`big#u${i}`, `u${i}`, "big.ts")),
        ]
        for (const section of unitFindings({ units, edges: [] })) {
            for (const f of section.findings) {
                expect(f.files.length, f.id).toBeGreaterThan(0)
                expect(f.rows.length, f.id).toBeGreaterThan(0)
            }
        }
    })
})
