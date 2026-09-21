import { formatNumber } from "~/utils/format"

// Comparing one reading against the same reading in an earlier snapshot.
//
// Kept pure and away from the composable that fetches the baseline row, so
// the arithmetic and the wording can be tested without a database: a change
// of zero is silence, an absent baseline is silence, and only a metric whose
// better direction the engine actually defines may take a colour.

export interface Delta {
    /** current − baseline, or null when either side is missing. */
    change: number | null
    baseline: number | null
    /** The unit is absent from the baseline snapshot entirely. */
    isNew: boolean
}

export type DeltaDirection = "up-good" | "up-risk" | "neutral"
export type DeltaTone = "good" | "bad" | "new" | "quiet"

export const NO_DELTA: Delta = { change: null, baseline: null, isNew: false }

export function deltaFrom(current: number | null, baselineRaw: unknown, hasBaseline: boolean, presentInBaseline: boolean): Delta {
    if (!hasBaseline) return NO_DELTA
    if (!presentInBaseline) return { change: null, baseline: null, isNew: true }
    if (baselineRaw === null || baselineRaw === undefined || baselineRaw === "") return NO_DELTA
    const before = Number(baselineRaw)
    if (!Number.isFinite(before) || current === null) return NO_DELTA
    return { change: current - before, baseline: before, isNew: false }
}

/** The movement, once rounding at the displayed precision would still show it. */
export function movement(delta: Delta, decimals = 0): number | null {
    const c = delta.change
    if (c === null || !Number.isFinite(c)) return null
    const smallest = decimals > 0 ? 0.5 / 10 ** decimals : 0.5
    return Math.abs(c) < smallest ? null : c
}

export function deltaText(delta: Delta, decimals = 0): string {
    if (delta.isNew) return "new"
    const c = movement(delta, decimals)
    if (c === null) return ""
    return `${c > 0 ? "+" : "−"}${formatNumber(Math.abs(c), decimals)}`
}

export function deltaTone(delta: Delta, direction: DeltaDirection = "neutral", decimals = 0): DeltaTone {
    if (delta.isNew) return "new"
    const c = movement(delta, decimals)
    if (c === null || direction === "neutral") return "quiet"
    const better = direction === "up-good" ? c > 0 : c < 0
    return better ? "good" : "bad"
}

export function deltaTitle(delta: Delta, decimals = 0): string {
    if (delta.isNew) return "Not in the baseline snapshot"
    if (delta.baseline === null) return ""
    return `Was ${formatNumber(delta.baseline, decimals)}`
}
