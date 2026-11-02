// The questions the source view answers about a symbol, beside the code:
// where it is used, what it extends and what implements it, who calls a
// function and what it calls, and what a route reaches. An inquiry lives in
// the URL (`?look=`), so Back returns to it and a link can share it.

import { sqlLiteral } from "~/shared/sql"

export type InquiryKind = "usages" | "types" | "calls" | "reach"

export interface Inquiry {
    kind: InquiryKind
    unit: string
    fn: string | null
    /** The entry point, for reach. */
    entry: number | null
}

export function encodeInquiry(i: Inquiry): string {
    return [i.kind, i.unit, i.fn ?? "", i.entry ?? ""].join("|")
}

export function decodeInquiry(raw: unknown): Inquiry | null {
    if (typeof raw !== "string" || !raw) return null
    const [kind, unit, fn, entry] = raw.split("|")
    if (!["usages", "types", "calls", "reach"].includes(kind) || (!unit && kind !== "reach")) return null
    const n = entry ? Number(entry) : NaN
    return { kind: kind as InquiryKind, unit: unit ?? "", fn: fn || null, entry: Number.isFinite(n) ? n : null }
}

type Query = <T>(sql: string) => Promise<T[]>

// ── Usages ────────────────────────────────────────────────────────
export interface Usage { file: string; line: number | null; from: string | null; component: string | null }
export interface UsageGroup { component: string; usages: Usage[]; files: number }

export const USAGE_LIMIT = 2000

/**
 * Where a unit or function is used: every call site, and for a unit also
 * the files that reference it without a call (a field type, a parameter,
 * an import), at the file level.
 */
export async function loadUsages(q: Query, unit: string, fn: string | null, hasCalls: boolean): Promise<Usage[]> {
    const U = sqlLiteral(unit)
    const sites: Usage[] = hasCalls
        ? await q<Usage>(`SELECT c.file, c.line, MIN(c.from_function) AS "from", f.component FROM calls c LEFT JOIN files f ON f.name = c.file
                          WHERE c.to_unit = ${U}${fn ? ` AND c.to_function = ${sqlLiteral(fn)}` : ""}
                          GROUP BY c.file, c.line ORDER BY f.component, c.file, c.line LIMIT ${USAGE_LIMIT}`)
        : []
    if (fn) return sites
    const seen = new Set(sites.map(s => s.file))
    const files = await q<Usage>(`SELECT uc.from_file AS file, NULL AS line, NULL AS "from", f.component FROM unit_connections uc LEFT JOIN files f ON f.name = uc.from_file
                                  WHERE uc."to" = ${U} GROUP BY uc.from_file ORDER BY f.component, uc.from_file LIMIT ${USAGE_LIMIT}`)
    return [...sites, ...files.filter(f => !seen.has(f.file))]
}

/** Usages by component, the file's own component first, then the most used. */
export function groupUsages(usages: Usage[], home: string | null): UsageGroup[] {
    const by = new Map<string, Usage[]>()
    for (const u of usages) {
        const c = u.component ?? ""
        const list = by.get(c)
        if (list) list.push(u)
        else by.set(c, [u])
    }
    return [...by.entries()]
        .map(([component, list]) => ({ component, usages: list, files: new Set(list.map(u => u.file)).size }))
        .sort((a, b) => Number(b.component === home) - Number(a.component === home) || b.usages.length - a.usages.length || a.component.localeCompare(b.component))
}

// ── Type hierarchy ────────────────────────────────────────────────
export interface TypeLink { id: string; name: string; file: string | null; line: number | null; component: string | null; how: string | null }

export async function loadTypeHierarchy(q: Query, unit: string, has: (t: string, c: string) => boolean): Promise<{ up: TypeLink[]; down: TypeLink[] }> {
    const U = sqlLiteral(unit)
    const up = has("unit_supertypes", "supertype")
        ? await q<TypeLink>(`SELECT COALESCE(NULLIF(s.supertype, ''), s.name) AS id, COALESCE(u.name, s.name) AS name, u.file, u.line, u.component, 'extends' AS how
                             FROM unit_supertypes s LEFT JOIN units u ON u.id = s.supertype WHERE s.unit = ${U} ORDER BY name`)
        : []
    const parts: string[] = []
    if (has("bindings", "interface_unit")) parts.push(`SELECT implementation_unit AS id, mechanism AS how FROM bindings WHERE interface_unit = ${U}`)
    if (has("unit_supertypes", "supertype")) parts.push(`SELECT unit AS id, 'extends' AS how FROM unit_supertypes WHERE supertype = ${U}`)
    const down = parts.length
        ? await q<TypeLink>(`SELECT d.id, COALESCE(u.name, d.id) AS name, u.file, u.line, u.component, MIN(d.how) AS how
                             FROM (${parts.join(" UNION ALL ")}) d LEFT JOIN units u ON u.id = d.id GROUP BY d.id ORDER BY u.component, name LIMIT 500`)
        : []
    return { up, down }
}

// ── Call hierarchy ────────────────────────────────────────────────
export interface CallNode {
    unit: string
    fn: string
    /** Where to open it: the call site for a caller, the definition for a callee. */
    file: string | null
    line: number | null
    component: string | null
    via: string | null
    /** Call sites folded into this row. */
    sites: number
}

export async function loadCallers(q: Query, unit: string, fn: string): Promise<CallNode[]> {
    return q<CallNode>(`SELECT c.from_unit AS unit, c.from_function AS fn, MIN(c.file) AS file, MIN(c.line) AS line, f.component, MIN(c.via) AS via, COUNT(*) AS sites
                        FROM calls c LEFT JOIN files f ON f.name = c.file
                        WHERE c.to_unit = ${sqlLiteral(unit)} AND c.to_function = ${sqlLiteral(fn)} AND c.from_function != ''
                        GROUP BY c.from_unit, c.from_function ORDER BY f.component, c.from_function LIMIT 300`)
}

export async function loadCallees(q: Query, unit: string, fn: string): Promise<CallNode[]> {
    return q<CallNode>(`SELECT c.to_unit AS unit, c.to_function AS fn, u.file, COALESCE(MIN(d.begin_line), u.line) AS line, u.component, MIN(c.via) AS via, COUNT(DISTINCT c.line) AS sites
                        FROM calls c LEFT JOIN units u ON u.id = c.to_unit LEFT JOIN functions d ON d.file = u.file AND d.name = c.to_function
                        WHERE c.from_unit = ${sqlLiteral(unit)} AND c.from_function = ${sqlLiteral(fn)}
                        GROUP BY c.to_unit, c.to_function ORDER BY MIN(c.line) LIMIT 300`)
}

// ── Route reach ───────────────────────────────────────────────────
export interface EntryFacts {
    id: number
    kind: string | null
    method: string | null
    path: string | null
    framework: string | null
    unit: string | null
    function: string | null
    auth: string | null
    file: string | null
    line: number | null
    call_sites: number | null
    resolved: number | null
    units: number | null
    functions: number | null
    tables: number | null
    outbound: number | null
    depth: number | null
}
export interface ReachTarget { kind: string; target: string; depth: number; file: string | null; line: number | null; name: string | null }

export async function loadReach(q: Query, entry: number, has: (t: string, c: string) => boolean): Promise<{ entry: EntryFacts | null; targets: ReachTarget[] }> {
    const reach = has("route_reach", "entry")
    const rows = await q<EntryFacts>(`SELECT e.id, e.kind, e.method, e.path, e.framework, e.unit, e.function, e.auth, e.file, e.line${reach ? ", r.call_sites, r.resolved, r.units, r.functions, r.tables, r.outbound, r.depth" : ""}
                                      FROM entry_points e${reach ? " LEFT JOIN route_reach r ON r.entry = e.id" : ""} WHERE e.id = ${entry} LIMIT 1`)
    const targets = has("route_targets", "target")
        ? await q<ReachTarget>(`SELECT t.kind, t.target, MIN(t.depth) AS depth, u.file, u.line, u.name FROM route_targets t LEFT JOIN units u ON u.id = t.target
                                WHERE t.entry = ${entry} GROUP BY t.kind, t.target ORDER BY t.kind, depth, t.target`)
        : []
    return { entry: rows[0] ?? null, targets }
}
