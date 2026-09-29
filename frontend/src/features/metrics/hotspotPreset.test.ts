import { describe, expect, it } from "vitest"
import { choosePreset, presetForUrl, type PresetPair } from "./hotspotPreset"

const LINES = "complexity__lines"
const AGE = "app__last_changed_days"
const NEST = "complexity__indentation__max"
const HOT = "codesmells__hotspot_score"

const PRESETS: PresetPair[] = [
  { id: "hotspots", sizeMetric: LINES, colorMetric: HOT },
  { id: "age", sizeMetric: LINES, colorMetric: AGE },
  { id: "nesting", sizeMetric: LINES, colorMetric: NEST },
]
const FILE_COLUMNS = [AGE, LINES, NEST, HOT]
const showing = (sizeMetric: string, colorMetric: string, customPinned = false) => ({ sizeMetric, colorMetric, customPinned })

describe("choosePreset", () => {
  it("waits while the grain's columns are loading", () => {
    // The bug: files not read yet, only the code-age column known, and the
    // old pair (lines × age) no longer fits. It used to pin age × age.
    expect(choosePreset([], [], "nesting", showing(LINES, AGE))).toEqual({ kind: "keep" })
  })

  it("opens the preset the link asked for once its columns exist", () => {
    expect(choosePreset(FILE_COLUMNS, PRESETS, "nesting", showing(LINES, AGE))).toEqual({ kind: "preset", id: "nesting" })
  })

  it("prefers the asked-for preset over a custom pair with the same metrics", () => {
    expect(choosePreset(FILE_COLUMNS, PRESETS, "nesting", showing(LINES, NEST, true))).toEqual({ kind: "preset", id: "nesting" })
    expect(choosePreset(FILE_COLUMNS, PRESETS, "nesting", showing(LINES, NEST))).toEqual({ kind: "keep" })
  })

  it("keeps the shown pair when the asked-for preset has no columns here", () => {
    const dirs = [LINES, NEST, HOT]
    const noAge = PRESETS.filter(p => p.id !== "age")
    expect(choosePreset(dirs, noAge, "age", showing(LINES, NEST))).toEqual({ kind: "keep" })
    expect(choosePreset(dirs, noAge, "age", showing(LINES, AGE))).toEqual({ kind: "preset", id: "hotspots" })
  })

  it("falls back in the order given, then to the first preset", () => {
    expect(choosePreset(FILE_COLUMNS, PRESETS, null, showing("", ""), ["nesting"])).toEqual({ kind: "preset", id: "nesting" })
    expect(choosePreset(FILE_COLUMNS, PRESETS, null, showing("", ""))).toEqual({ kind: "preset", id: "hotspots" })
  })

  it("picks a custom pair when no preset fits", () => {
    expect(choosePreset([LINES, "git__commits__total"], [], null, showing("", ""))).toEqual({ kind: "custom", sizeMetric: LINES, colorMetric: "git__commits__total" })
  })
})

describe("presetForUrl", () => {
  it("leaves the URL alone while columns are loading", () => {
    expect(presetForUrl("custom", false, "nesting")).toBeUndefined()
    expect(presetForUrl("age", false, "nesting")).toBeUndefined()
  })
  it("follows the perspective shown once settled", () => {
    expect(presetForUrl("nesting", true, "nesting")).toBeUndefined()
    expect(presetForUrl("hotspots", true, "nesting")).toBe("hotspots")
    expect(presetForUrl("custom", true, "nesting")).toBeNull()
    expect(presetForUrl("custom", true, null)).toBeUndefined()
  })
})
