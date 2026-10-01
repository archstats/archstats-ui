// The app in Dutch: the language is read once when i18n loads, so this file
// sets it before the first import.
import { beforeAll, describe, expect, it } from "vitest"

let i18n: typeof import("./i18n")

beforeAll(async () => {
    const store = new Map([["archstats.locale", "nl"]])
    ;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} }
    i18n = await import("./i18n")
})

describe("Dutch", () => {
    it("is the app's language", () => {
        expect(i18n.locale).toBe("nl")
        expect(i18n.intlLocale).toBe("nl-NL")
    })
    it("writes numbers and plurals the Dutch way", () => {
        expect(i18n.t("common.count.file", { count: 1 })).toBe("1 bestand")
        expect(i18n.t("common.count.file", { count: 1200 })).toBe("1.200 bestanden")
        expect(i18n.listOf(["a", "b", "c"])).toBe("a, b en c")
    })
    it("finds the English a report slot asks for", () => {
        expect(i18n.english(i18n.t("units.shapeLanding.howLayersLean"))).toBe("How the layers lean")
        expect(i18n.english(i18n.t("git.changeBreadth.componentsTouchedPerCommit", { unit: "componenten" }))).toMatch(/^Components touched per commit/)
    })
})

describe("metric definitions in Dutch", () => {
    it("translate the engine's per-window definitions", async () => {
        const { localized } = await import("~/features/snapshot/definition")
        const def = localized({ id: "git__commits__last_90_days", name: "Commit Count (Last 90 Days)", short: "", long: "" })
        expect(def.name).toBe("Aantal commits (laatste 90 dagen)")
    })
})

describe("numbers passed in already written", () => {
    it("take a decimal comma, and keep thousands groups", () => {
        expect(i18n.t("ui.format.days", { value: "28.9" })).toBe("28,9 d")
        expect(i18n.t("ui.format.days", { value: "541.462" })).toBe("541.462 d")
    })
})
