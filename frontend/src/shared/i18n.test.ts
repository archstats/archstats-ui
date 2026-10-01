// The message files' rules (src/locales/README.md): every key the code asks
// for exists in English, and the Dutch files say the same things, with the
// same placeholders and plural forms, as the English ones.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { allMessages, english, t } from "./i18n"

const SRC = join(__dirname, "..")
const messages = allMessages()

type Leaf = string | Record<string, string>
function leaves(tree: object, prefix = ""): Map<string, Leaf> {
    const out = new Map<string, Leaf>()
    for (const [k, v] of Object.entries(tree)) {
        const key = prefix ? `${prefix}.${k}` : k
        const isPlural = v && typeof v === "object" && Object.keys(v).every(x => ["zero", "one", "two", "few", "many", "other"].includes(x))
        if (typeof v === "string" || isPlural) out.set(key, v as Leaf)
        else if (v && typeof v === "object") for (const [kk, vv] of leaves(v, key)) out.set(kk, vv)
    }
    return out
}
const placeholders = (v: Leaf) => [...new Set([...(typeof v === "string" ? v : Object.values(v).join(" ")).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort()

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { if (name !== "locales" && name !== "testing") sourceFiles(p, out) }
        else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name) && name !== "i18n.ts") out.push(p)
    }
    return out
}

describe("messages", () => {
    const en = new Map(Object.entries(messages.en ?? {}).map(([ns, tree]) => [ns, leaves(tree)]))

    it("has every key the code uses", () => {
        const missing: string[] = []
        for (const file of sourceFiles(SRC)) {
            const text = readFileSync(file, "utf8")
            for (const m of text.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) {
                const [ns, ...rest] = m[1].split(".")
                if (!en.get(ns)?.has(rest.join("."))) missing.push(`${file.slice(SRC.length + 1)}: ${m[1]}`)
            }
        }
        expect(missing).toEqual([])
    })

    for (const [lang, files] of Object.entries(messages)) {
        if (lang === "en") continue
        for (const [ns, tree] of Object.entries(files)) {
            it(`${lang}/${ns}.json matches English`, () => {
                const source = en.get(ns)
                expect(source, `${lang}/${ns}.json has no English file`).toBeDefined()
                const target = leaves(tree)
                expect([...target.keys()].filter(k => !source!.has(k)), "keys English does not have").toEqual([])
                expect([...source!.keys()].filter(k => !target.has(k)), "keys not translated").toEqual([])
                const wrong: string[] = []
                for (const [k, v] of source!) {
                    const tv = target.get(k)
                    if (tv === undefined) continue
                    if (typeof v !== typeof tv) { wrong.push(`${k}: plural in one language only`); continue }
                    if (placeholders(v).join() !== placeholders(tv).join()) wrong.push(`${k}: {${placeholders(v)}} became {${placeholders(tv)}}`)
                    if (typeof v === "object" && typeof tv === "object" && !("one" in tv && "other" in tv)) wrong.push(`${k}: needs one and other`)
                }
                expect(wrong).toEqual([])
            })
        }
    }

    it("has a Dutch file for every English one", () => {
        expect(Object.keys(messages.en ?? {}).filter(ns => !messages.nl?.[ns])).toEqual([])
    })
})

describe("t", () => {
    it("fills placeholders and picks the plural form", () => {
        expect(t("common.count.file", { count: 1 })).toBe("1 file")
        expect(t("common.count.file", { count: 1200 })).toBe("1,200 files")
    })
    it("names a missing key rather than failing", () => {
        expect(t("common.noSuchMessage")).toBe("common.noSuchMessage")
    })
})

describe("english", () => {
    it("is the text itself in English", () => {
        expect(english("Dependency matrix")).toBe("Dependency matrix")
    })
})
