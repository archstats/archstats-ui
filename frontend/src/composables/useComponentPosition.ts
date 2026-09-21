import { computed, type Ref } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"

// Where a component sits in the graph, from the three tables the app has
// never read: the community it clusters with, the strongly connected group it
// is tangled in, and the component it is furthest from.
//
// A strongly connected group larger than one is the important one: every
// component in it can reach every other, so none of them can be extracted
// alone. The engine computes it on every scan and nothing has shown it.

export interface CommunityRow { community_nr: number; community_size: number }
export interface GroupRow { group: number; group_size: number }
export interface FurthestRow {
    furthest_component: string
    furthest_component_distance: number
    furthest_component_shortest_path: string | null
}

export interface Position {
    community: CommunityRow | null
    /** Only when the group holds more than one component; a group of one is not a tangle. */
    tangle: GroupRow | null
    furthest: FurthestRow | null
    /** Components sharing this one's strongly connected group, itself excluded. */
    tangleMembers: string[]
}

const EMPTY: Position = { community: null, tangle: null, furthest: null, tangleMembers: [] }

export function useComponentPosition(name: Ref<string>) {
    const store = useDataStore()

    const { data, loading } = useAsyncQuery<Position>(
        async () => {
            const lit = sqlLiteral(name.value)
            if (!name.value) return EMPTY

            const community = store.hasView("component_communities")
                ? (await store.query<CommunityRow>(
                    `SELECT community_nr, community_size FROM component_communities WHERE component = ${lit} LIMIT 1`))[0] ?? null
                : null

            let tangle: GroupRow | null = null
            let tangleMembers: string[] = []
            if (store.hasView("component_strongly_connected_groups")) {
                const rows = await store.query<GroupRow>(
                    `SELECT "group", group_size FROM component_strongly_connected_groups WHERE component = ${lit} LIMIT 1`)
                const row = rows[0] ?? null
                if (row && Number(row.group_size) > 1) {
                    tangle = row
                    const members = await store.query<{ component: string }>(
                        `SELECT component FROM component_strongly_connected_groups WHERE "group" = ${Number(row.group)} ORDER BY component`)
                    tangleMembers = members.map(m => m.component).filter(c => c !== name.value)
                }
            }

            const furthest = store.hasView("component_connections_furthest")
                ? (await store.query<FurthestRow>(
                    `SELECT furthest_component, furthest_component_distance, furthest_component_shortest_path
                     FROM component_connections_furthest WHERE component = ${lit} LIMIT 1`))[0] ?? null
                : null

            return { community, tangle, furthest, tangleMembers }
        },
        [name],
        { initial: EMPTY },
    )

    /** "A -> B -> C" as its steps, for rendering a walkable chain. */
    const furthestPath = computed<string[]>(() => {
        const raw = data.value.furthest?.furthest_component_shortest_path
        if (!raw) return []
        return String(raw).split("->").map(s => s.trim()).filter(Boolean)
    })

    return { position: data, furthestPath, loading }
}

/** The same split, for any stored path string. */
export function pathSteps(raw: string | null | undefined): string[] {
    if (!raw) return []
    return String(raw).split("->").map(s => s.trim()).filter(Boolean)
}
