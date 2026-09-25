import { computed, ref, watch, type Ref } from "vue"
import { lensGroups } from "~/features/groups/lensEdges"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useLensStore } from "~/features/groups/lens.store"
import { loadFileGraph, type FileGraph } from "~/features/checks/fileGraph"
import { isTestPath } from "~/features/snapshot/fileRole"
import { useRestructureStore } from "~/features/restructure/restructure.store"
import { evaluate, place } from "~/features/restructure/plan"
import { compareStructure, type StructureDiff } from "~/features/restructure/compare"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useStateStore } from "~/platform/state.store"

// Two snapshots read through one structure: the restructure plan's modules,
// or the active lens's groups. The same checks as the planner, before and
// after, so a restructure can be judged by what it did, not what it moved.

type Query = (sql: string) => Promise<any[]>
export type StructureBy = "plan" | "lens"

const graphs = new Map<string, Promise<FileGraph>>()
function graphOf(scanId: string, q: Query): Promise<FileGraph> {
    if (!graphs.has(scanId)) graphs.set(scanId, loadFileGraph(q, isTestPath).catch(e => { graphs.delete(scanId); throw e }))
    return graphs.get(scanId)!
}

export function useStructureCompare(ids: Ref<{ base: string; head: string } | null>, queryIn: (scanId: string, sql: string) => Promise<any[]>) {
    const planner = useRestructureStore()
    const lens = useLensStore()
    const groups = useGroupsStore()
    const workspaces = useWorkspacesStore()
    const state = useStateStore()
    watch([() => workspaces.active?.id, () => state.hydrated], ([id]) => { if (id) planner.load(id) }, { immediate: true })

    const available = computed<StructureBy[]>(() => [
        ...(planner.plan.modules.length ? ["plan" as const] : []),
        ...(lens.active && groups.groups.some(g => g.dimension === lens.active) ? ["lens" as const] : []),
    ])
    const chosen = ref<StructureBy | null>(null)
    const by = computed<StructureBy | null>(() => (chosen.value && available.value.includes(chosen.value) ? chosen.value : available.value[0] ?? null))

    const diff = ref<StructureDiff | null>(null)
    const loading = ref(false)
    const error = ref("")
    const name = (id: string) => (by.value === "plan" ? planner.name(id) : groups.getGroupById(id)?.name ?? id)

    watch([ids, by, () => JSON.stringify(planner.plan), () => lens.active, () => groups.groups], async () => {
        diff.value = null; error.value = ""
        const s = ids.value, mode = by.value
        if (!s || !mode) return
        loading.value = true
        try {
            const [b, h] = await Promise.all([graphOf(s.base, sql => queryIn(s.base, sql)), graphOf(s.head, sql => queryIn(s.head, sql))])
            const placeOn = (g: FileGraph) => {
                if (mode === "plan") { const p = place(planner.plan, g.code, g.data.tests); return { of: p.of, unplaced: p.unplaced.length } }
                // A lens holds files, and whole components: a file new since the
                // groups were drawn still belongs where its component does.
                const of = new Map<string, string>(), whole = new Map<string, string>()
                for (const lg of lensGroups(lens.active!)) {
                    for (const f of lg.files) of.set(f, lg.id)
                    for (const [c, cov] of lg.components) if (cov.whole) whole.set(c, lg.id)
                }
                for (const f of g.code) { if (of.has(f)) continue; const c = g.data.component.get(f); if (c && whole.has(c)) of.set(f, whole.get(c)!) }
                return { of, unplaced: [...g.production].filter(f => !of.has(f)).length }
            }
            const pb = placeOn(b), ph = placeOn(h)
            const order = mode === "plan" && planner.plan.ordered ? planner.plan.modules.map(m => m.id) : undefined
            diff.value = compareStructure(evaluate(pb.of, b.edges, b.production, order), evaluate(ph.of, h.edges, h.production, order), [pb.unplaced, ph.unplaced], !!order)
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e)
        } finally {
            loading.value = false
        }
    }, { immediate: true })

    return { available, by, chosen, diff, loading, error, name }
}
