import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { lensGroups, resolveLensEdges } from "~/composables/useLensFindings"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { sqlLiteral } from "~/utils/sql"
import type { GroupEdge, LensGroup } from "~/utils/groupEdges"

// One group read as a unit: its files, how it depends on the rest of the
// code and the rest on it, with the rest of the code being the other groups
// of its lens plus everything no group holds.

export const OUTSIDE = "__outside__"

export function useGroupDetail(id: Ref<string>) {
    const data = useDataStore()
    const groups = useGroupsStore()
    const group = computed(() => groups.getGroupById(id.value) ?? null)
    const files = computed(() => (group.value ? groups.filesOf(group.value) : new Set<string>()))
    const components = computed(() => (group.value ? [...groups.componentsOf(group.value).keys()] : []))
    const lines = computed(() => {
        let n = 0
        const byName = data.allComponentsIndex
        for (const c of components.value) n += Number((byName.get(c) as any)?.complexity__lines) || 0
        return n
    })
    /** SQL predicate for this group's files. */
    const fileSql = computed(() => (files.value.size ? `file IN (${[...files.value].map(sqlLiteral).join(", ")})` : "0"))

    // The group's lens, with everything no group of it holds as one more group.
    const { data: edges, loading } = useAsyncQuery<GroupEdge[]>(
        async () => {
            const g = group.value
            if (!g) return []
            const lens = lensGroups(g.dimension)
            const held = new Set(lens.flatMap(x => [...x.files]))
            const outside: LensGroup = { id: OUTSIDE, name: "Outside any group", files: new Set<string>(), components: new Map() }
            for (const f of data.fileComponentIndex.keys()) if (!held.has(f)) outside.files.add(f)
            const covered = new Map<string, number>()
            for (const x of lens) for (const [c] of x.components) covered.set(c, (covered.get(c) ?? 0) + 1)
            for (const [c, fs] of data.componentFilesIndex) {
                const inLens = fs.filter(f => held.has(f)).length
                if (inLens < fs.length) outside.components.set(c, { whole: inLens === 0 })
            }
            const loaded = await resolveLensEdges(sql => data.query(sql), [...lens, outside])
            return (loaded?.result.edges ?? []).filter(e => e.kind !== "type_only" && (e.fromGroup === g.id || e.toGroup === g.id))
        },
        [group, () => groups.groups],
        { initial: [] },
    )

    const outgoing = computed(() => edges.value.filter(e => e.fromGroup === group.value?.id))
    const incoming = computed(() => edges.value.filter(e => e.toGroup === group.value?.id))
    // Ca: files outside that import into the group. Ce: components outside it imports from.
    const ca = computed(() => new Set(incoming.value.map(e => e.file)).size)
    const ce = computed(() => new Set(outgoing.value.map(e => e.toComponent)).size)
    const instability = computed(() => (ca.value + ce.value ? ce.value / (ca.value + ce.value) : null))

    /** Refs of imports that stay inside the group, and all refs its files make. */
    const { data: insideShare } = useAsyncQuery<number | null>(
        async () => {
            if (!files.value.size) return null
            const comps = components.value.map(sqlLiteral).join(", ")
            const rows = await data.query<{ inside: number; total: number }>(`SELECT sum(CASE WHEN "to" IN (${comps || "''"}) THEN reference_count ELSE 0 END) AS inside, sum(reference_count) AS total FROM ${data.runtimeComponentEdges} WHERE ${fileSql.value} AND "from" <> "to"`)
            const r = rows[0]
            return r && Number(r.total) ? Number(r.inside) / Number(r.total) : null
        },
        [fileSql],
        { initial: null },
    )

    return { group, files, components, lines, fileSql, edges, outgoing, incoming, ca, ce, instability, insideShare, loading }
}
