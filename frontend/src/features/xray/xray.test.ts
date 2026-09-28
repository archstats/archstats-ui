import { describe, expect, it } from "vitest"
import { areaOf, byArea, firstComment, nameTokens, topics, type XrayFile } from "./xray"

describe("firstComment", () => {
    it("takes the first descriptive comment, first sentence", () => {
        const src = `import x from "y"\n\n// Reading a component's cycles as something you can act on.\n//\n// A list of fifty-three cycles answers nothing.\nexport const a = 1`
        expect(firstComment(src)).toBe("Reading a component's cycles as something you can act on.")
    })
    it("skips licence headers and tool directives", () => {
        const src = `/*\n * Copyright 2020 Acme. Licensed under the Apache License.\n */\n// eslint-disable-next-line no-console\n/** The engine behind building a dimension by sorting. */`
        expect(firstComment(src)).toBe("The engine behind building a dimension by sorting.")
    })
    it("reads Python docstrings and hash comments", () => {
        expect(firstComment(`"""Checkout views: the steps a basket goes through."""\nimport x`)).toBe("Checkout views: the steps a basket goes through.")
        expect(firstComment(`#!/usr/bin/env python\n# Builds the report from its cells and readings.`)).toBe("Builds the report from its cells and readings.")
    })
    it("reads a comment inside a Vue file", () => {
        expect(firstComment(`<template>\n  <!-- The cycle map: a component at the centre, its partners ringed. -->\n</template>`)).toBe("The cycle map: a component at the centre, its partners ringed.")
    })
    it("says nothing when the file says nothing", () => {
        expect(firstComment(`export const x = 1 // two`)).toBe("")
    })
})

describe("areas", () => {
    it("places a neighbour relative to the folder's parent", () => {
        expect(areaOf("frontend/src/components/report/X.vue", "frontend/src/utils")).toBe("components/report")
        expect(areaOf("frontend/src/utils/x.ts", "frontend/src/utils")).toBe("utils")
        expect(areaOf("app/scan/scan.go", "frontend/src/utils")).toBe("app/scan")
    })
    it("rolls neighbours up, busiest area first", () => {
        const r = byArea(["frontend/src/pages/a.vue", "frontend/src/pages/b.vue", "frontend/src/stores/s.ts"], "frontend/src/utils")
        expect(r.map(x => [x.area, x.files.length])).toEqual([["pages", 2], ["stores", 1]])
    })
})

describe("topics", () => {
    const f = (path: string, o: Partial<XrayFile> = {}): XrayFile => ({ path, lines: 100, role: "production", commits: 5, health: null, summary: "", exports: [], usedBy: [], testedBy: [], uses: [], changesWith: [], ...o })
    const files = [
        f("u/reportDoc.ts", { usedBy: ["p/evidence.vue", "c/Cell.vue"], changesWith: [{ file: "u/reportCells.ts", shared: 4 }] }),
        f("u/reportCells.ts", { usedBy: ["p/evidence.vue", "c/Cell.vue"], uses: ["u/reportDoc.ts"] }),
        f("u/reportTemplates.ts", { usedBy: ["p/evidence.vue"], uses: ["u/reportDoc.ts"] }),
        f("u/sqlLang.ts", { usedBy: ["c/SqlEditor.vue"] }),
        f("u/sqlSchema.ts", { usedBy: ["c/SqlEditor.vue"], uses: ["u/sqlLang.ts"] }),
        f("u/reportDoc.test.ts", { role: "test" }),
        f("u/lonely.ts"),
    ]
    it("groups files that are used together and named alike", () => {
        const t = topics(files)
        const report = t.find(x => x.files.includes("u/reportDoc.ts"))!
        expect(report.files).toEqual(expect.arrayContaining(["u/reportCells.ts", "u/reportTemplates.ts", "u/reportDoc.test.ts"]))
        expect(report.name).toBe("report")
        const sql = t.find(x => x.files.includes("u/sqlLang.ts"))!
        expect(sql.files).toContain("u/sqlSchema.ts")
        expect(sql.files).not.toContain("u/reportDoc.ts")
    })
    it("puts loners in one topic, last", () => {
        const t = topics(files)
        expect(t[t.length - 1].name).toBe("Unclustered")
        expect(t[t.length - 1].files).toEqual(["u/lonely.ts"])
    })
    it("splits camel case and drops generic words", () => {
        expect(nameTokens("src/composables/useDimensionStudio.ts")).toEqual(["dimension", "studio"])
        expect(nameTokens("src/utils/reportDoc.test.ts")).toEqual(["report", "doc"])
    })
})
