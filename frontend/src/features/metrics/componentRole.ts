// Naming what a component is, from its own coordinates.
//
// The engine records four numbers per component that together describe its
// place in the dependency graph: afferent and efferent coupling, abstractness
// and instability. A reader can derive the shape from those four, and today
// every reader has to. This does it once, in the product's words.
//
// A role is a description, never a grade (PRODUCT principle 4). "Hub" says
// many components import it and it imports many; it does not say that is bad.
// The zone note is the one exception the canon earns: Martin named the two
// corners of the A/I square himself, and the engine ships the distance.

import { t } from "~/shared/i18n"

export type ComponentRoleId =
    | "isolated"
    | "foundation"
    | "leaf"
    | "hub"
    | "widely-used"
    | "integrator"
    | "intermediate"

export interface ComponentRole {
    id: ComponentRoleId
    /** Two words at most; it sits beside the component name. */
    label: string
    /** The counts the label was read from, as a sentence. */
    evidence: string
}

export type ZoneId = "pain" | "uselessness" | "main-sequence" | "none"

export interface ComponentZone {
    id: ZoneId
    label: string
    evidence: string
}

export interface RoleInput {
    /** Components that import this one. */
    afferent: number
    /** Components this one imports. */
    efferent: number
    /** Share of components with a lower afferent count, 0–100. */
    afferentPercentile: number
    /** Share of components with a lower efferent count, 0–100. */
    efferentPercentile: number
}

/** Above this percentile a count counts as "many", relative to this codebase. */
const MANY = 80

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`
}

export function componentRole(input: RoleInput): ComponentRole {
    const { afferent: ca, efferent: ce, afferentPercentile: caPct, efferentPercentile: cePct } = input
    const used = t("metrics.componentRole.it", { t: t("common.count.componentImports", { count: ca }) })
    const uses = t("metrics.componentRole.imports", { components: t("common.count.component", { count: ce }) })

    if (ca === 0 && ce === 0) {
        return { id: "isolated", label: t("metrics.componentRole.isolated"), evidence: t("metrics.componentRole.nothingImportsImportsNothing") }
    }
    if (ce === 0) {
        return { id: "foundation", label: t("metrics.componentRole.foundation"), evidence: t("metrics.componentRole.importsNothing", { used }) }
    }
    if (ca === 0) {
        return { id: "leaf", label: t("metrics.componentRole.leaf"), evidence: t("metrics.componentRole.nothingImports", { uses }) }
    }
    if (caPct >= MANY && cePct >= MANY) {
        return { id: "hub", label: t("metrics.componentRole.hub"), evidence: t("metrics.componentRole.bothHighCodebase", { used, uses }) }
    }
    if (caPct >= MANY) {
        return { id: "widely-used", label: t("metrics.componentRole.widelyUsed"), evidence: t("metrics.componentRole.moreThanMost", { used, uses }) }
    }
    if (cePct >= MANY) {
        return { id: "integrator", label: t("metrics.componentRole.integrator"), evidence: t("metrics.componentRole.moreThanMost2", { uses, used }) }
    }
    return { id: "intermediate", label: t("metrics.componentRole.intermediate"), evidence: t("metrics.componentRole.and", { used, uses }) }
}

/** Martin's two corners, plus the line between them. Needs both coordinates. */
export function componentZone(abstractness: number | null, instability: number | null): ComponentZone {
    if (abstractness === null || instability === null || !Number.isFinite(abstractness) || !Number.isFinite(instability)) {
        return { id: "none", label: "", evidence: "" }
    }
    const a = abstractness
    const i = instability
    const distance = Math.abs(a + i - 1)
    const coords = t("metrics.componentRole.abstractnessInstability", { value: a.toFixed(2), value2: i.toFixed(2) })

    if (a <= 0.3 && i <= 0.3) {
        return { id: "pain", label: t("metrics.componentRole.zonePain"), evidence: t("metrics.componentRole.concreteDependedSoChanges", { coords }) }
    }
    if (a >= 0.7 && i >= 0.7) {
        return { id: "uselessness", label: t("metrics.componentRole.zoneUselessness"), evidence: t("metrics.componentRole.abstractUnusedOthers", { coords }) }
    }
    if (distance <= 0.2) {
        return { id: "main-sequence", label: t("metrics.componentRole.mainSequence"), evidence: t("metrics.componentRole.abstractnessMatchesHowMuch", { coords }) }
    }
    return { id: "none", label: "", evidence: coords }
}

/** Where a value sits among all of them: rank 1 is the highest. */
export function rankOf(value: number, sorted: number[]): { rank: number; percentile: number } {
    if (sorted.length === 0) return { rank: 0, percentile: 0 }
    const rank = sorted.findIndex(v => v <= value) + 1
    const below = sorted.filter(v => v < value).length
    return { rank: rank || sorted.length, percentile: Math.round((below / sorted.length) * 100) }
}
