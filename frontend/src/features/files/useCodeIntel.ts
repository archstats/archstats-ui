// The rows a file's code intelligence is built from (codeIntel.ts), read
// once per file. Every table is optional: a snapshot from before the engine
// recorded calls (revision 13) still links its type names, one from before
// units links nothing, and the view draws plain code.

import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { verdictOf } from "~/features/rules/lensRules"
import { sqlIn, sqlLiteral } from "~/shared/sql"
import { buildIntel, type CallRow, type CodeIntel, type FunctionRow, type LineMark, type UnitRow } from "./codeIntel"

const UNIT_COLS = "u.id, u.name, u.kind, u.file, u.line, u.signature, u.component, u.module, u.used_by"

export function useCodeIntel(filePath: Ref<string>, contents: Ref<string>) {
    const store = useDataStore()
    const has = (table: string, column: string) => store.hasColumn(table, column)

    const { data } = useAsyncQuery<CodeIntel | null>(
        async (signal) => {
            const file = filePath.value
            if (!file || !contents.value || !has("units", "used_by")) return null
            const F = sqlLiteral(file)
            const q = <T>(sql: string) => store.query<T>(sql, { signal })
            const none = Promise.resolve([] as any[])

            const [info, ownUnits, referenced, calls, ownFunctions] = await Promise.all([
                q<{ component: string | null; module: string | null }>(`SELECT component, ${has("files", "module") ? "module" : "NULL AS module"} FROM files WHERE name = ${F} LIMIT 1`),
                q<UnitRow>(`SELECT ${UNIT_COLS} FROM units u WHERE u.file = ${F}`),
                has("unit_connections", "from_file")
                    ? q<UnitRow>(`SELECT ${UNIT_COLS} FROM unit_connections uc JOIN units u ON u.id = uc."to" WHERE uc.from_file = ${F} GROUP BY u.id`)
                    : none,
                has("calls", "to_function")
                    ? q<CallRow>(`SELECT c.line, c.to_unit, c.to_function, c.via, u.file, u.line AS unit_line, u.component, u.module, u.kind AS unit_kind,
                                         fn.begin_line AS def_line, fn.end_line AS def_end, COALESCE(fn.signature, u.signature) AS signature
                                  FROM calls c LEFT JOIN units u ON u.id = c.to_unit
                                  LEFT JOIN functions fn ON fn.file = u.file AND fn.name = c.to_function
                                  WHERE c.file = ${F} ORDER BY c.line`)
                    : none,
                has("functions", "signature")
                    ? q<FunctionRow>(`SELECT name, begin_line AS begin, end_line AS end, signature, NULL AS usages FROM functions WHERE file = ${F} ORDER BY begin_line`)
                    : none,
            ])
            const ids = ownUnits.map(u => u.id)
            const [usages, implementations, marks] = await Promise.all([
                ids.length && has("calls", "to_function")
                    ? q<{ fn: string; n: number }>(`SELECT to_function AS fn, COUNT(DISTINCT file || ':' || line) AS n FROM calls WHERE to_unit IN ${sqlIn(ids)} GROUP BY to_function`)
                    : none,
                ids.length ? implementationCounts(q, ids, has) : none,
                marksOf(q, F, has),
            ])
            const used = new Map(usages.map((r: { fn: string; n: number }) => [r.fn, r.n]))
            for (const fn of ownFunctions as FunctionRow[]) fn.usages = used.get(fn.name) ?? 0
            // Duplicate rows from overloads and repeated joins are harmless:
            // targets are kept by key.
            return buildIntel({
                file, component: info[0]?.component ?? store.fileComponentIndex.get(file) ?? null, module: info[0]?.module ?? null,
                lines: contents.value.split("\n"),
                ownUnits, ownFunctions, referenced, calls, implementations, marks,
            })
        },
        [filePath, contents],
        { initial: null },
    )
    return computed(() => data.value)
}

async function implementationCounts(q: <T>(sql: string) => Promise<T[]>, ids: string[], has: (t: string, c: string) => boolean) {
    const parts: string[] = []
    if (has("bindings", "interface_unit")) parts.push(`SELECT interface_unit AS iface, implementation_unit AS impl FROM bindings WHERE interface_unit IN ${sqlIn(ids)}`)
    if (has("unit_supertypes", "supertype")) parts.push(`SELECT supertype AS iface, unit AS impl FROM unit_supertypes WHERE supertype IN ${sqlIn(ids)}`)
    if (!parts.length) return []
    return q<{ unit: string; n: number }>(`SELECT iface AS unit, COUNT(DISTINCT impl) AS n FROM (${parts.join(" UNION ")}) GROUP BY iface`)
}

async function marksOf(q: <T>(sql: string) => Promise<T[]>, F: string, has: (t: string, c: string) => boolean): Promise<LineMark[]> {
    const as = (kind: LineMark["kind"]) => (rows: Array<Record<string, any>>) => rows.map(r => ({ kind, line: Number(r.line), data: r }))
    const reach = has("route_reach", "entry")
    const loads: Array<Promise<LineMark[]>> = []
    if (has("entry_points", "handler")) {
        loads.push(q<Record<string, any>>(`SELECT e.id, e.kind, e.method, e.path, e.framework, e.handler, e.function, e.auth, e.line${reach ? ", r.units, r.functions, r.tables, r.outbound, r.depth" : ""}
            FROM entry_points e${reach ? " LEFT JOIN route_reach r ON r.entry = e.id" : ""} WHERE e.file = ${F}`).then(as("entry")))
    }
    if (has("outbound_calls", "system")) loads.push(q<Record<string, any>>(`SELECT id, kind, client, method, path, target, system, host, confidence, config_key, function, line FROM outbound_calls WHERE file = ${F}`).then(as("outbound")))
    if (has("data_access", "access")) loads.push(q<Record<string, any>>(`SELECT target, entity, access, via, function, line FROM data_access WHERE file = ${F}`).then(as("data")))
    if (has("config_entries", "key")) {
        const readers = has("outbound_calls", "config_key") ? ", (SELECT COUNT(*) FROM outbound_calls o WHERE o.config_key = c.key) AS readers" : ""
        loads.push(q<Record<string, any>>(`SELECT c.key, c.value, c.environment, c.line${readers} FROM config_entries c WHERE c.file = ${F}`).then(as("config")))
    }
    if (has("bindings", "mechanism")) loads.push(q<Record<string, any>>(`SELECT interface, implementation, mechanism, line FROM bindings WHERE file = ${F}`).then(as("binding")))
    if (has("cicd_flags", "rule")) loads.push(q<Record<string, any>>(`SELECT rule, detail, line FROM cicd_flags WHERE file = ${F}`).then(as("flag")))
    if (has("api_findings", "rule")) loads.push(q<Record<string, any>>(`SELECT rule, detail, severity, line FROM api_findings WHERE file = ${F}`).then(as("flag")))
    if (has("unresolved_edges", "names")) loads.push(q<Record<string, any>>(`SELECT names, reason, line FROM unresolved_edges WHERE file = ${F}`).then(as("unresolved")))
    return (await Promise.all(loads)).flat()
}

/**
 * Whether a reference from this file into another breaks a lens's declared
 * layers: the lens's name when it does. Every lens with a declaration is
 * asked, so the code shows the crossings a Rules check would report.
 */
export function useForbiddenCrossing(filePath: Ref<string>) {
    const groups = useGroupsStore()
    const lenses = computed(() => {
        const out: Array<{ name: string; groupOf: Map<string, string>; check: (from: string, to: string) => boolean }> = []
        for (const d of groups.dimensionRecords) {
            const declared = d.declared
            if (!declared || (!declared.layers.length && !declared.pairs.length)) continue
            const groupOf = new Map<string, string>()
            for (const g of groups.groups.filter(g => g.dimension === d.name)) for (const f of groups.filesOf(g)) if (!groupOf.has(f)) groupOf.set(f, g.id)
            out.push({ name: d.name, groupOf, check: (from, to) => verdictOf(from, to, declared) === "forbidden" })
        }
        return out
    })
    return computed(() => {
        const from = filePath.value
        if (!lenses.value.length) return undefined
        return (toFile: string): string | null => {
            for (const l of lenses.value) {
                const a = l.groupOf.get(from), b = l.groupOf.get(toFile)
                if (a && b && a !== b && l.check(a, b)) return l.name
            }
            return null
        }
    })
}
