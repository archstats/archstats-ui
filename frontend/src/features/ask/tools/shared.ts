// Helpers every tool uses: numbers written the same way everywhere, names
// resolved the way a person types them, and metric words mapped to the
// column that honestly answers them.

import type { World } from "../engine/types"
import { candidates, shortName } from "~/features/snapshot/names"
import { intlLocale } from "~/shared/i18n"

export { candidates, shortName }

export const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "–"
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v)
    return Number.isInteger(n) ? n.toLocaleString(intlLocale) : n.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
}

export const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))

export function componentNames(world: World): string[] {
    return world.components().map(c => String(c.name))
}

export function resolveComponent(world: World, asked: string): { name: string | null; also: string[] } {
    const c = candidates(componentNames(world), asked)
    return { name: c[0] ?? null, also: c.slice(1, 5) }
}

export function resolveFile(world: World, asked: string): { name: string | null; also: string[] } {
    const files = [...world.fileComponent().keys()]
    const c = candidates(files, asked)
    return { name: c[0] ?? null, also: c.slice(1, 5) }
}

export function notFound(kind: string, asked: string, also: string[]): string {
    return `No ${kind} matches "${asked}".${also.length ? ` Did you mean: ${also.join(", ")}?` : ""} Use find to look names up.`
}

export { METRIC_WORDS, METRIC_TRAP, resolveMetric, metricName, metricShort } from "~/features/snapshot/measures"
