// Numbers and counts written the same way in every exhibit's facts.

import { intlLocale } from "~/shared/i18n"

export const n = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
export const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`
export const sq = (s: string) => `'${String(s).replace(/'/g, "''")}'`
/** A number from a row, or null when there is none. */
export const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * A period in plain words ("30 days", "6 months", "a year", "2024") as a
 * number of days back from the scan's newest commit; null when it names none.
 */
export function daysIn(since: string | undefined): number | null {
    if (!since) return null
    const s = since.toLowerCase().trim()
    const m = s.match(/(\d+|a|an|one|two|three|six|twelve)?\s*(day|week|month|year|quarter)s?/)
    if (m) {
        const k = ({ a: 1, an: 1, one: 1, two: 2, three: 3, six: 6, twelve: 12 } as Record<string, number>)[m[1] ?? ""] ?? (Number(m[1]) || 1)
        return k * ({ day: 1, week: 7, month: 30, quarter: 91, year: 365 } as Record<string, number>)[m[2]]
    }
    return null
}
