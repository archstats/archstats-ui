import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { lightPairs } from "./figure"

// Guardrails for everything a report can hold. A figure reaches a report, a
// pin or a PNG only through features/export/figure.ts, which refuses blanks at run
// time; these tests keep the two things it relies on from drifting.

const SRC = join(__dirname, "../..")

function files(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) files(p, out)
        else if (name.endsWith(".vue")) out.push(p)
    }
    return out
}

describe("figure contract", () => {
    it("maps every dark colour to one light colour, so a light export is light", () => {
        const css = readFileSync(join(SRC, "assets/tokens.css"), "utf8")
        const at = css.indexOf("@media (prefers-color-scheme: dark)")
        const read = (block: string) => Object.fromEntries([...block.matchAll(/(--c-[\w-]+):\s*(\d+ \d+ \d+);/g)].map(m => [m[1], m[2]]))
        const ambiguous: string[] = []
        // The dark block only: the paper after it re-declares the light values for a report page.
        const end = css.indexOf(".paper", at)
        const map = lightPairs(read(css.slice(0, at)), read(css.slice(at, end < 0 ? undefined : end)), ambiguous)
        // Two dark tokens sharing a colour with different light ones: add one to REMAP_PREFERRED, or give them different dark values.
        expect(ambiguous).toEqual([])
        expect(map.size).toBeGreaterThan(20)
    })

    it("has every chart hand over a figure, or say why it does not", () => {
        // A component that draws a chart (d3, a canvas, or an svg it keeps a ref to) registers an
        // exportable figure (useSvgFigure, useCanvasFigure, or register({ kind: "figure" })), or
        // carries a comment `figure: none` with the reason, for marks that are not figures.
        const missing: string[] = []
        for (const f of files(SRC)) {
            const s = readFileSync(f, "utf8")
            const template = s.split(/<script[\s>]/)[0]
            const draws = /from ["']d3["']/.test(s) || /<canvas\b/.test(template) || /<svg\b[^>]*\bref=/.test(template)
            if (!draws) continue
            const registers = /useSvgFigure\(|useCanvasFigure\(|useFigure\(/.test(s)
            const optedOut = /figure: none\b/.test(s)
            if (!registers && !optedOut) missing.push(relative(SRC, f))
        }
        expect(missing).toEqual([])
    })

    it("draws every figure in an ExhibitFrame, with its own export button and legend", () => {
        // The frame is where a figure is exported from; a figure registered without one
        // can only be reached through a report slot. Legends are enforced by the types.
        const unframed: string[] = []
        for (const f of files(SRC)) {
            const s = readFileSync(f, "utf8")
            if (!/useSvgFigure\(|useCanvasFigure\(|useFigure\(/.test(s)) continue
            if (!/<(Exhibit|Figure)Frame\b/.test(s)) unframed.push(relative(SRC, f))
        }
        expect(unframed).toEqual([])
    })

    it("registers tables through useTable, so each has a handle for its frame's button", () => {
        const PENDING = new Set<string>()
        const bare: string[] = []
        for (const f of files(SRC)) {
            const rel = relative(SRC, f)
            if (!PENDING.has(rel) && /register\(\{\s*kind:\s*["']table["']/.test(readFileSync(f, "utf8"))) bare.push(rel)
        }
        expect(bare).toEqual([])
    })

    it("registers figures only through useFigure and its two shorthands", () => {
        // A bare register({ kind: "figure" }) skips the legend the interface requires.
        const bare: string[] = []
        for (const f of files(SRC)) {
            if (/kind:\s*["']figure["']\s*,\s*title/.test(readFileSync(f, "utf8"))) bare.push(relative(SRC, f))
        }
        expect(bare).toEqual([])
    })
})
