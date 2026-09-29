import { computed } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { useStateStore } from "~/platform/state.store"
import { scopeWhere } from "~/features/groups/scopeSql"
import { anchorSql } from "./history"
import { useAuthorsStore } from "./authors.store"
import { HERE_WINDOWS, buildKnowledge, holdingsByPerson, knowledgePairsSql, knowledgeTree, summarise, type HereWindowId, type KnowledgePair } from "./knowledgeLeft"

// The Knowledge reading of Authors, loaded once per page: both grains read it
// (People counts whom each person is the one to ask about). The window is the
// architect's, per workspace.

export function useKnowledgeLeft() {
    const data = useDataStore()
    const authors = useAuthorsStore()
    const state = useStateStore()

    const windowId = computed<HereWindowId>({
        get: () => {
            const v = state.get<string>("knowledge.here", "365")
            return (HERE_WINDOWS.some(w => w.id === v) ? v : "365") as HereWindowId
        },
        set: v => state.set("knowledge.here", v === "365" ? null : v),
    })
    const windowDays = computed(() => HERE_WINDOWS.find(w => w.id === windowId.value)!.days)

    const { data: raw, loading, error } = useAsyncQuery<{ pairs: KnowledgePair[]; lines: Map<string, number> }>(
        async () => {
            if (!data.hasView("git_commits")) return { pairs: [], lines: new Map() }
            const [pairs, lines] = await Promise.all([
                data.query<KnowledgePair>(knowledgePairsSql({ aliases: authors.aliases, includeBots: authors.showBots, anchor: anchorSql(), where: scopeWhere("c.file") })),
                data.query<{ name: string; lines: number }>("SELECT name, coalesce(complexity__lines, 0) AS lines FROM components"),
            ])
            return { pairs, lines: new Map(lines.map(r => [r.name, Number(r.lines) || 0])) }
        },
        [() => authors.aliases, () => authors.showBots, () => scopeWhere("c.file")],
        { initial: { pairs: [], lines: new Map() } },
    )

    // Components with code today; a component whose files are all gone has nothing to know.
    const rows = computed(() => buildKnowledge(raw.value.pairs, raw.value.lines, windowDays.value).filter(r => r.lines > 0))
    const all = rows
    const summary = computed(() => summarise(rows.value))
    const tree = computed(() => knowledgeTree(rows.value))
    const holdings = computed(() => holdingsByPerson(rows.value))

    return { windowId, windowDays, rows, all, summary, tree, holdings, loading, error }
}

export type KnowledgeLeft = ReturnType<typeof useKnowledgeLeft>
