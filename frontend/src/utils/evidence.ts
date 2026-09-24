// Evidence pins: a finding kept with where it came from, and whether it
// still holds. The status is always worded as the evidence has it, never as
// a verdict: "holds", "was 14, now 3", "gone", or why the two cannot be
// compared.

export type PinKind = "component" | "file" | "cycle" | "rule" | "pair" | "view" | "heading"

export type PinValues = Record<string, number>

export interface PinStatus {
    kind: "holds" | "moved" | "gone" | "incomparable" | "deleted" | "none"
    text: string
}

export interface StatusInput {
    pinned: PinValues
    /** Null when the entity is absent from the newest snapshot. */
    now: PinValues | null
    /** Why the newest snapshot cannot be compared with the pinned one, if it cannot. */
    blocked?: string | null
    /** The pinned snapshot was deleted. */
    deleted?: boolean
    /** Metric ids to names, for "was" lines. */
    label?: (id: string) => string
}

const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }))

export function pinStatus(i: StatusInput): PinStatus {
    if (i.deleted) return { kind: "deleted", text: "snapshot deleted, values as pinned" }
    if (i.blocked) return { kind: "incomparable", text: `not comparable: ${i.blocked}` }
    if (i.now === null) return { kind: "gone", text: "gone" }
    const keys = Object.keys(i.pinned)
    if (keys.length === 0) return { kind: "none", text: "" }
    const moved = keys.filter(k => i.now![k] !== undefined && Math.abs(i.now![k] - i.pinned[k]) > 1e-9)
    if (moved.length === 0) return { kind: "holds", text: "holds" }
    const k = moved[0]
    const name = i.label ? i.label(k) : k
    const rest = moved.length > 1 ? ` (and ${moved.length - 1} more)` : ""
    return { kind: "moved", text: `${keys.length > 1 ? name + " " : ""}was ${fmt(i.pinned[k])}, now ${fmt(i.now[k])}${rest}` }
}

/** A cycle holds while its members still sit in one strongly connected group. */
export function cycleHolds(members: string[], groupOf: Map<string, string>): boolean {
    if (members.length < 2) return false
    const g = groupOf.get(members[0])
    return !!g && members.every(m => groupOf.get(m) === g)
}

/** The metrics a pin of each kind keeps. */
export const PIN_METRICS: Record<"component" | "file", string[]> = {
    component: ["codesmells__code_health", "codesmells__hotspot_score", "complexity__lines", "modularity__coupling__afferent", "modularity__coupling__efferent", "modularity__instability"],
    file: ["codesmells__code_health", "codesmells__hotspot_score", "complexity__lines", "git__commits__total"],
}

/** Numeric fields of a row, restricted to the metrics a pin keeps. */
export function pickValues(row: Record<string, unknown> | null | undefined, metrics: string[]): PinValues {
    const out: PinValues = {}
    if (!row) return out
    for (const m of metrics) {
        const v = row[m]
        if (v === null || v === undefined || v === "") continue
        const n = Number(v)
        if (Number.isFinite(n)) out[m] = n
    }
    return out
}

/** A pin as the evidence store keeps it: enough to measure it again. */
export interface MeasurablePin { kind: PinKind; entityKey: string }

/**
 * What a pin measures in one snapshot, or null when what it names is gone.
 * `cache` holds the tangle membership between calls on the same snapshot.
 */
export async function measurePin(p: MeasurablePin, q: (sql: string) => Promise<any[]>, cache: { groupOf?: Map<string, string> } = {}): Promise<PinValues | null> {
    const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`
    if (p.kind === "component" || p.kind === "file") {
        const table = p.kind === "component" ? "components" : "files"
        const [row] = await q(`SELECT * FROM ${table} WHERE name = ${lit(p.entityKey)} LIMIT 1`)
        return row ? pickValues(row, PIN_METRICS[p.kind]) : null
    }
    if (p.kind === "cycle") {
        if (!cache.groupOf) {
            cache.groupOf = new Map()
            for (const r of await q(`SELECT "group", component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1)`)) cache.groupOf.set(String(r.component), String(r.group))
        }
        const members = p.entityKey.split("\n")
        return cycleHolds(members, cache.groupOf) ? { size: members.length } : null
    }
    if (p.kind === "rule") {
        const [rule, from, to, file] = p.entityKey.split("|")
        const [r] = await q(`SELECT count(*) AS n FROM rules WHERE status = 'violation' AND rule = ${lit(rule)} AND "from" = ${lit(from)} AND "to" = ${lit(to)} AND file = ${lit(file ?? "")}`)
        return Number(r?.n) ? { findings: Number(r.n) } : null
    }
    if (p.kind === "pair") {
        const [from, to] = p.entityKey.split(">")
        const [r] = await q(`SELECT sum(reference_count) AS n FROM component_connections_direct WHERE "from" = ${lit(from)} AND "to" = ${lit(to)}`)
        return Number(r?.n) ? { references: Number(r.n) } : null
    }
    return null
}
