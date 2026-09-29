import { computed, ref, watch, type Ref } from "vue"
import { lensGroups } from "~/features/groups/lensEdges"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useLensStore } from "~/features/groups/lens.store"
import { loadFileGraph, type FileGraph } from "~/features/checks/fileGraph"
import { isTestPath } from "~/features/snapshot/fileRole"
import { compareStructure, evaluate, type StructureDiff } from "./structureCompare"

// Two snapshots read through the active lens's groups, so a change can be
// judged by what it did to how they depend on each other, not what it moved.

type Query = (sql: string) => Promise<any[]>

const graphs = new Map<string, Promise<FileGraph>>()
function graphOf(scanId: string, q: Query): Promise<FileGraph> {
    if (!graphs.has(scanId)) graphs.set(scanId, loadFileGraph(q, isTestPath).catch(e => { graphs.delete(scanId); throw e }))
    return graphs.get(scanId)!
}

export function useStructureCompare(ids: Ref<{ base: string; head: string } | null>, queryIn: (scanId: string, sql: string) => Promise<any[]>) {
    const lens = useLensStore()
    const groups = useGroupsStore()

    const available = computed(() => !!lens.active && groups.groups.some(g => g.dimension === lens.active))
    const diff = ref<StructureDiff | null>(null)
    const loading = ref(false)
    const error = ref("")
    const name = (id: string) => groups.getGroupById(id)?.name ?? id

    watch([ids, available, () => lens.active, () => groups.groups], async () => {
        diff.value = null; error.value = ""
        const s = ids.value
        if (!s || !available.value) return
        loading.value = true
        try {
            const [b, h] = await Promise.all([graphOf(s.base, sql => queryIn(s.base, sql)), graphOf(s.head, sql => queryIn(s.head, sql))])
            const placeOn = (g: FileGraph) => {
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
            diff.value = compareStructure(evaluate(pb.of, b.edges, b.production), evaluate(ph.of, h.edges, h.production), [pb.unplaced, ph.unplaced])
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e)
        } finally {
            loading.value = false
        }
    }, { immediate: true })

    return { available, diff, loading, error, name }
}
