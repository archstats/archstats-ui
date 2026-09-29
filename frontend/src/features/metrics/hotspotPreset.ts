// Which perspective the Hotspots view shows, and what its URL says about it.
// Kept apart from the page so the order of a route change, the grain's columns
// loading and the architect's own choice can be tested without mounting it.

export interface PresetPair {
  id: string
  sizeMetric: string
  colorMetric: string
}

export interface ShownPair {
  sizeMetric: string
  colorMetric: string
  customPinned: boolean
}

export type PresetChoice =
  | { kind: "keep" }
  | { kind: "preset"; id: string }
  | { kind: "custom"; sizeMetric: string; colorMetric: string }

const KEEP: PresetChoice = { kind: "keep" }

/**
 * What to show once the active grain's columns have settled. Pass no columns
 * while they are still loading: a half-read column set (only the code-age
 * column, say) would otherwise pin a nonsense custom pair.
 *
 * The perspective the link asked for wins whenever its columns exist, over the
 * pair left from before and over the default. Otherwise the shown pair stays
 * while its columns exist, and failing that the first of `fallback` (preset ids
 * in order of preference) or the first preset opens.
 */
export function choosePreset(
  columns: string[],
  presets: PresetPair[],
  wanted: string | null,
  shown: ShownPair,
  fallback: string[] = [],
): PresetChoice {
  if (columns.length === 0) return KEEP
  const has = (c: string) => columns.includes(c)
  const fits = (p: PresetPair) => has(p.sizeMetric) && has(p.colorMetric)

  const asked = wanted ? presets.find(p => p.id === wanted && fits(p)) : undefined
  if (asked) {
    const onScreen = !shown.customPinned && shown.sizeMetric === asked.sizeMetric && shown.colorMetric === asked.colorMetric
    return onScreen ? KEEP : { kind: "preset", id: asked.id }
  }

  if (has(shown.sizeMetric) && has(shown.colorMetric)) return KEEP

  const first = fallback.map(id => presets.find(p => p.id === id && fits(p))).find(Boolean) ?? presets.find(fits)
  if (first) return { kind: "preset", id: first.id }

  return {
    kind: "custom",
    sizeMetric: has("complexity__lines") ? "complexity__lines" : columns[0],
    colorMetric: has("git__commits__total") ? "git__commits__total" : (columns[1] || columns[0]),
  }
}

/**
 * The `preset` the URL should carry for the perspective on screen, or
 * `undefined` to leave the URL alone. Nothing is written while the grain's
 * columns are loading: the pair on screen then belongs to the grain being left
 * (or to none), and writing it would replace the perspective a link just asked
 * for with the previous one.
 */
export function presetForUrl(activeId: string, settled: boolean, inUrl: string | null): string | null | undefined {
  if (!settled) return undefined
  const want = activeId === "custom" ? null : activeId
  return want === inUrl ? undefined : want
}
