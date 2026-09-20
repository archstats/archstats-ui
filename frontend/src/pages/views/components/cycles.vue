<template>
  <ViewWorkspaceLayout
    title="Cycles"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="360px"
  >
    <template #stats>
      <span>{{ countText }}</span>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Sort cycles">
        <button type="button" :aria-pressed="sortBy === 'severity'" @click="sortBy = 'severity'">Severity</button>
        <button type="button" :aria-pressed="sortBy === 'size'" @click="sortBy = 'size'">Size</button>
        <button type="button" :aria-pressed="sortBy === 'sharedCommits'" @click="sortBy = 'sharedCommits'">Co-changes</button>
      </div>
      <SingleSelect v-if="groupOptions.length > 1" v-model="groupFilter" :options="groupOptions" placeholder="All groups"/>
    </template>

    <!-- Canvas: the selected cycle's loop and its connections. -->
    <template #visualizer>
      <template v-if="selectedCycle">
        <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
          <span class="font-mono text-sm font-medium text-neutral-900">Cycle #{{ selectedCycle.id }}</span>
          <span class="ui-toolbar-meta flex items-center gap-1.5">
            <span>{{ selectedCycle.size }} nodes</span>
            <span class="text-neutral-300">·</span>
            <span>severity {{ selectedCycle.severity }}</span>
            <span class="text-neutral-300">·</span>
            <span>{{ selectedCycle.sharedCommits }} co-changes</span>
          </span>
          <button type="button" class="ui-btn ui-btn-sm ml-auto" @click="saveCycleAsGroup">
            <Icon icon="bookmark" :size="13" class="text-neutral-500"/>
            <span>Save cycle as group</span>
          </button>
        </div>

        <div class="relative min-h-0 grow">
          <CycleLoopChart
            :nodes="selectedCycle.nodes"
            :edges="edges"
            :selected-edge="selectedEdge"
            @select-edge="onSelectEdge"
          />
        </div>

        <!-- Loop connections: one row per edge, weakest first. -->
        <div class="flex max-h-[38%] shrink-0 flex-col hairline-t">
          <div class="flex h-9 shrink-0 items-center gap-2 px-4">
            <span class="ui-section-title">Loop connections</span>
            <span class="ui-toolbar-meta">{{ edgesLoading ? 'Reading imports and shared commits…' : 'Click a row or an edge to inspect it' }}</span>
          </div>
          <div class="min-h-0 overflow-y-auto">
            <table class="ui-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th></th>
                  <th>To</th>
                  <th class="text-right">Imports</th>
                  <th class="text-right">Co-changes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="edge in sortedEdges"
                  :key="edgeKey(edge)"
                  class="is-clickable"
                  :class="{ 'is-selected': isSelectedEdge(edge) }"
                  @click="selectedEdge = { from: edge.from, to: edge.to }"
                >
                  <td class="max-w-[280px] truncate">
                    <span v-if="groupDot(edge.from)" class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" :style="groupDot(edge.from)!"></span>
                    <router-link :to="componentPath(edge.from)" class="font-mono text-sm text-neutral-900 hover:underline" :title="edge.from" @click.stop>{{ shortName(edge.from) }}</router-link>
                  </td>
                  <td class="w-6 px-0 text-center"><Icon icon="chevron-right" :size="12" class="inline text-neutral-400"/></td>
                  <td class="max-w-[280px] truncate">
                    <span v-if="groupDot(edge.to)" class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" :style="groupDot(edge.to)!"></span>
                    <router-link :to="componentPath(edge.to)" class="font-mono text-sm text-neutral-900 hover:underline" :title="edge.to" @click.stop>{{ shortName(edge.to) }}</router-link>
                  </td>
                  <td class="is-num text-right">{{ formatNumber(edge.referenceCount) }}</td>
                  <td class="is-num text-right">{{ formatNumber(edge.sharedCommits) }}</td>
                  <td class="w-24 text-right"><span v-if="isBreakingPoint(edge)" class="ui-tag">weakest</span></td>
                </tr>
                <tr v-if="!edgesLoading && sortedEdges.length === 0">
                  <td colspan="6" class="text-neutral-500">No direct connections recorded for this cycle.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <EmptyState
        v-else-if="!store.hasData"
        icon="recycle"
        title="No snapshot open"
        text="Open a scan to look for dependency cycles."
      />
      <EmptyState
        v-else-if="store.allCyclesExpanded.length === 0"
        icon="recycle"
        title="No dependency cycles"
        text="Every import path is acyclic."
      />
      <EmptyState
        v-else
        icon="recycle"
        title="No cycle selected"
        text="Pick a cycle in the panel to see its loop, its co-change flows and the weakest link."
      />
    </template>

    <!-- Panel: the ranked list of cycles. -->
    <template #tab-list>
      <EmptyState
        v-if="!store.hasData"
        title="No snapshot open"
        text="Open a scan to look for dependency cycles."
      />
      <EmptyState
        v-else-if="store.allCyclesExpanded.length === 0"
        title="No dependency cycles"
        text="Every import path is acyclic."
      />
      <EmptyState
        v-else-if="scopedCycles.length === 0"
        title="No cycles in scope"
        :text="`No cycle touches a component of ${scope.group?.name ?? 'the active scope'}.`"
      >
        <button type="button" class="ui-btn ui-btn-sm" @click="scope.clear()">Clear scope</button>
      </EmptyState>
      <EmptyState
        v-else-if="filteredCycles.length === 0"
        title="No cycles match"
        :text="searchQuery.trim() ? `No cycle contains “${searchQuery.trim()}”.` : 'No cycle touches a component of the chosen group.'"
      >
        <button v-if="searchQuery" type="button" class="ui-btn ui-btn-sm" @click="searchQuery = ''">Clear search</button>
        <button v-if="selectedFilterGroupId" type="button" class="ui-btn ui-btn-sm" @click="selectedFilterGroupId = null">All groups</button>
      </EmptyState>

      <div v-else class="flex flex-col gap-1">
        <div
          v-for="cycle in paginatedCycles"
          :key="cycle.id"
          role="button"
          tabindex="0"
          class="flex cursor-pointer flex-col gap-1.5 rounded px-2.5 py-2 text-left transition-colors"
          :class="selectedCycleId === cycle.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
          @click="selectCycle(cycle)"
          @keydown.enter.prevent="selectCycle(cycle)"
          @keydown.space.prevent="selectCycle(cycle)"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono text-sm text-neutral-500">Cycle #{{ cycle.id }}</span>
            <span class="font-mono text-sm tabular-nums text-neutral-500">severity {{ cycle.severity }}</span>
          </div>

          <!-- The loop, as links: a → b → c → a -->
          <div class="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            <template v-for="(node, i) in cycle.nodes" :key="node">
              <Icon v-if="i > 0" icon="chevron-right" :size="11" class="shrink-0 text-neutral-400"/>
              <router-link :to="componentPath(node)" class="font-mono text-sm text-neutral-900 hover:underline" :title="node" @click.stop>{{ shortName(node) }}</router-link>
            </template>
            <Icon icon="chevron-right" :size="11" class="shrink-0 text-neutral-400"/>
            <span class="font-mono text-sm text-neutral-500" :title="cycle.nodes[0]">{{ shortName(cycle.nodes[0]) }}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="ui-tag">{{ cycle.size }} nodes</span>
            <span class="ui-tag">{{ cycle.sharedCommits }} co-changes</span>
          </div>
        </div>

        <div v-if="totalPages > 1" class="mt-2 flex items-center justify-between pt-3 hairline-t">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Previous page" :disabled="page === 1" @click="page = Math.max(1, page - 1)">
            <Icon icon="chevron-left" :size="14"/>
          </button>
          <span class="font-mono text-sm tabular-nums text-neutral-500">{{ page }} / {{ totalPages }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Next page" :disabled="page === totalPages" @click="page = Math.min(totalPages, page + 1)">
            <Icon icon="chevron-right" :size="14"/>
          </button>
        </div>
      </div>
    </template>

    <!-- Panel: the weakest link and the selected edge's import locations. -->
    <template #tab-diagnostics>
      <template v-if="selectedCycle">
        <LoadingState v-if="edgesLoading" text="Reading import locations and shared commits…"/>

        <template v-else-if="activeInspectorEdge">
          <section class="flex flex-col gap-3">
            <span class="ui-section-title">{{ isBreakingPoint(activeInspectorEdge) ? 'Weakest link' : 'Selected edge' }}</span>
            <div class="flex flex-wrap items-center gap-1 text-base text-neutral-900">
              <span>Cut</span>
              <router-link :to="componentPath(activeInspectorEdge.from)" class="font-mono text-sm hover:underline" :title="activeInspectorEdge.from">{{ shortName(activeInspectorEdge.from) }}</router-link>
              <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
              <router-link :to="componentPath(activeInspectorEdge.to)" class="font-mono text-sm hover:underline" :title="activeInspectorEdge.to">{{ shortName(activeInspectorEdge.to) }}</router-link>
            </div>
            <p v-if="isBreakingPoint(activeInspectorEdge)" class="text-sm leading-4 text-neutral-500">
              The edge with the fewest imports in this loop. Removing it breaks the cycle at the lowest cost.
            </p>
            <p v-else-if="breakingPoint" class="flex flex-wrap items-center gap-1 text-sm leading-4 text-neutral-500">
              <span>Weakest link is</span>
              <span class="font-mono text-neutral-800" :title="breakingPoint.from">{{ shortName(breakingPoint.from) }}</span>
              <Icon icon="chevron-right" :size="11" class="text-neutral-400"/>
              <span class="font-mono text-neutral-800" :title="breakingPoint.to">{{ shortName(breakingPoint.to) }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selectedEdge = { from: breakingPoint.from, to: breakingPoint.to }">Inspect</button>
            </p>
            <dl class="ui-kv">
              <dt>References</dt>
              <dd>{{ formatNumber(activeInspectorEdge.referenceCount) }} imports</dd>
              <dt>Shared commits</dt>
              <dd>{{ formatNumber(activeInspectorEdge.sharedCommits) }}</dd>
              <dt>Importing files</dt>
              <dd>{{ formatNumber(activeInspectorEdge.files.length) }}</dd>
            </dl>
          </section>

          <section v-if="hasTies" class="flex flex-col gap-2 pt-4 hairline-t">
            <span class="ui-section-title">Tied edges</span>
            <p class="text-sm leading-4 text-neutral-500">{{ tiedEdges.length }} edges share the minimum of {{ breakingPoint?.referenceCount }} imports; any of them is a candidate cut.</p>
            <div class="-mx-4 overflow-x-auto">
              <table class="ui-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th class="text-right">Co-changes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="edge in tiedEdges"
                    :key="edgeKey(edge)"
                    class="is-clickable"
                    :class="{ 'is-selected': isSelectedEdge(edge) }"
                    @click="selectedEdge = { from: edge.from, to: edge.to }"
                  >
                    <td class="max-w-[140px] truncate"><router-link :to="componentPath(edge.from)" class="font-mono text-sm text-neutral-900 hover:underline" :title="edge.from" @click.stop>{{ shortName(edge.from) }}</router-link></td>
                    <td class="max-w-[140px] truncate"><router-link :to="componentPath(edge.to)" class="font-mono text-sm text-neutral-900 hover:underline" :title="edge.to" @click.stop>{{ shortName(edge.to) }}</router-link></td>
                    <td class="is-num text-right">{{ formatNumber(edge.sharedCommits) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="flex flex-col gap-2 pt-4 hairline-t">
            <span class="ui-section-title">Import locations</span>
            <EmptyState
              v-if="activeInspectorEdge.files.length === 0"
              title="No import locations"
              text="The snapshot records no file importing this component along this edge."
            />
            <ul v-else class="flex flex-col">
              <li v-for="f in activeInspectorEdge.files" :key="f.file" class="flex flex-col py-1.5 hairline-b last:border-b-0">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0"
                    :aria-expanded="expandedFiles.has(f.file)"
                    :aria-label="expandedFiles.has(f.file) ? 'Hide source' : 'Show source'"
                    @click="toggleFile(f.file)"
                  >
                    <Icon :icon="expandedFiles.has(f.file) ? 'chevron-down' : 'chevron-right'" :size="13" class="text-neutral-500"/>
                  </button>
                  <router-link :to="fileSourcePath(f.file, f.firstLine)" class="min-w-0 truncate font-mono text-sm text-neutral-900 hover:underline" :title="f.file">{{ f.file }}</router-link>
                  <span class="ui-tag ml-auto shrink-0">{{ f.count }} {{ f.count === 1 ? 'import' : 'imports' }}</span>
                </div>
                <div v-if="f.ranges.length" class="flex flex-wrap items-center gap-1 pl-7 font-mono text-sm text-neutral-500">
                  <span>Lines</span>
                  <SnippetPopover v-for="range in f.ranges" :key="range" :file="f.file" :lines="range">
                    <router-link :to="fileSourcePath(f.file, rangeStart(range))" class="text-neutral-800 underline decoration-dotted hover:text-neutral-900">{{ range }}</router-link>
                  </SnippetPopover>
                </div>
                <div v-if="expandedFiles.has(f.file)" class="mt-1.5 flex flex-col gap-1.5 pl-7">
                  <template v-if="f.ranges.length > 0 && f.ranges.length <= inlineSnippetLimit">
                    <SnippetPopover v-for="range in f.ranges" :key="'inline-' + range" :file="f.file" :lines="range" inline/>
                  </template>
                  <p v-else-if="f.ranges.length > inlineSnippetLimit" class="text-sm leading-4 text-neutral-500">
                    {{ f.ranges.length }} import sites; hover a line range above to preview it, or open the file.
                  </p>
                  <p v-else class="text-sm leading-4 text-neutral-500">No line numbers recorded for this import.</p>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="groupSpanParts.length" class="flex flex-col gap-1 pt-4 hairline-t">
            <span class="ui-section-title">Groups crossed</span>
            <dl class="ui-kv">
              <template v-for="part in groupSpanParts" :key="part.name">
                <dt>{{ part.name }}</dt>
                <dd>{{ part.count }} {{ part.count === 1 ? 'node' : 'nodes' }}</dd>
              </template>
            </dl>
          </section>
        </template>

        <EmptyState
          v-else
          title="No connection data"
          text="The snapshot has no direct connections along this cycle's edges."
        />
      </template>
      <EmptyState v-else title="No cycle selected" text="Pick a cycle to see its weakest link."/>
    </template>
  </ViewWorkspaceLayout>

  <GroupActionBar ref="trayRef" :selected-items="traySelection" kind="component" @clear="traySelection = []"/>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { useLensStore } from "~/stores/lens"
import { useScopeStore } from "~/stores/scope"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlIn, sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import SingleSelect from "~/components/ui/common/SingleSelect.vue"
import Icon from "~/components/ui/common/Icon.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import SnippetPopover from "~/components/SnippetPopover.vue"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"
import CycleLoopChart from "~/components/components/cycles/CycleLoopChart.vue"

const route = useRoute()
const store = useDataStore()
const groupsStore = useGroupsStore()
const scope = useScopeStore()

interface Cycle {
  id: number
  cycleText: string
  nodes: string[]
  size: number
  sharedCommits: number
  severity: number
}

interface EdgeFile {
  file: string
  count: number
  ranges: string[]
  firstLine: number | null
}

interface EdgeDetail {
  from: string
  to: string
  referenceCount: number
  sharedCommits: number
  files: EdgeFile[]
}

// ── Toolbar state ────────────────────────────────────────────────
const searchQuery = ref("")
const sortBy = ref<"severity" | "size" | "sharedCommits">("severity")
const selectedFilterGroupId = ref<string | null>(null)
const isSidebarOpen = ref(true)
const activeTab = ref("list")
const page = ref(1)
const itemsPerPage = 12

// A component detail links here with ?component=<name>; seed the search with it.
watch(() => route.query.component, (component) => {
  const value = Array.isArray(component) ? component[0] : component
  if (value) searchQuery.value = String(value)
}, { immediate: true })

watch([searchQuery, selectedFilterGroupId, () => scope.groupIds], () => { page.value = 1 })

type GroupOption = { name: string; id: string | null }
const allGroupsOption: GroupOption = { name: "All groups", id: null }
const groupOptions = computed<GroupOption[]>(() => [
  allGroupsOption,
  ...groupsStore.groups.filter(g => !lens.active || g.dimension === lens.active).map(g => ({ name: g.name, id: g.id })),
])
const groupFilter = computed<GroupOption>({
  get: () => groupOptions.value.find(o => o.id === selectedFilterGroupId.value) ?? allGroupsOption,
  set: (option) => { selectedFilterGroupId.value = option?.id ?? null },
})

const tabs = computed(() => {
  const list = [{ id: "list", label: "Cycles" }]
  if (selectedCycle.value) list.push({ id: "diagnostics", label: "Diagnostics" })
  return list
})

// ── Cycles: scope, group filter, search, sort ────────────────────
const allCycles = computed<Cycle[]>(() => store.hasData ? (store.allCyclesExpanded as Cycle[]) : [])

const scopedCycles = computed(() => {
  if (!scope.isActive) return allCycles.value
  return allCycles.value.filter(c => c.nodes.some(n => scope.componentInScope(n)))
})

const filteredCycles = computed(() => {
  let list = scopedCycles.value
  if (selectedFilterGroupId.value) {
    const group = groupsStore.getGroupById(selectedFilterGroupId.value)
    if (group) {
      const members = new Set(groupsStore.componentsOf(group).keys())
      list = list.filter(c => c.nodes.some(n => members.has(n)))
    }
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter(c => c.nodes.some(n => n.toLowerCase().includes(q)))

  return [...list].sort((a, b) => {
    if (sortBy.value === "size") return b.size - a.size || b.severity - a.severity
    if (sortBy.value === "sharedCommits") return b.sharedCommits - a.sharedCommits || b.severity - a.severity
    return b.severity - a.severity
  })
})

const countText = computed(() => {
  const n = scopedCycles.value.length
  const m = allCycles.value.length
  return scope.isActive ? `${formatNumber(n)} of ${formatNumber(m)} cycles` : `${formatNumber(m)} ${m === 1 ? 'cycle' : 'cycles'}`
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCycles.value.length / itemsPerPage)))
const paginatedCycles = computed(() => {
  const start = (page.value - 1) * itemsPerPage
  return filteredCycles.value.slice(start, start + itemsPerPage)
})

// ── Selection ────────────────────────────────────────────────────
const selectedCycleId = ref<number | null>(null)
const selectedCycle = computed<Cycle | null>(() => {
  if (selectedCycleId.value === null) return null
  return allCycles.value.find(c => c.id === selectedCycleId.value) ?? null
})

function selectCycle(cycle: Cycle) {
  selectedCycleId.value = cycle.id
}

// The view never opens empty: the top cycle of the current list is selected
// on arrival and whenever the list no longer contains the selection. An
// automatic selection keeps the list tab; a click moves to Diagnostics.
let autoSelected = false
watch(filteredCycles, (list) => {
  if (list.length === 0) return
  if (selectedCycleId.value === null || !list.some(c => c.id === selectedCycleId.value)) {
    autoSelected = true
    selectedCycleId.value = list[0].id
  }
}, { immediate: true })

watch(selectedCycle, (cycle) => {
  selectedEdge.value = null
  expandedFiles.value = new Set()
  activeTab.value = cycle && !autoSelected ? "diagnostics" : "list"
  autoSelected = false
})

// ── Per-edge detail: two queries per selected cycle ──────────────
// Imports and import sites come from the direct-connection rows already in
// memory plus one `snippets` query for every file of the loop; shared commits
// come from one `git_component_shared_commits` query for every pair.
function toRanges(numbers: number[]): string[] {
  const ranges: string[] = []
  if (numbers.length === 0) return ranges
  let start = numbers[0]
  let end = numbers[0]
  const flush = () => ranges.push(start === end ? String(start) : `${start}-${end}`)
  for (const n of numbers.slice(1)) {
    if (n === end + 1) { end = n; continue }
    flush()
    start = n
    end = n
  }
  flush()
  return ranges
}

const pairKey = (a: string, b: string) => `${a}|${b}`

const { data: loadedEdges, loading: edgesLoading } = useAsyncQuery<EdgeDetail[]>(
  async () => {
    const cycle = selectedCycle.value
    if (!cycle) return []
    const nodes = cycle.nodes
    const connections = store.componentConnections as any[]

    // Base edges from the in-memory direct connections, in loop order.
    const base = nodes.map((from, i) => {
      const to = nodes[(i + 1) % nodes.length]
      const files = new Map<string, number>()
      let referenceCount = 0
      for (const c of connections) {
        if (c.from !== from || c.to !== to) continue
        const count = Number(c.reference_count ?? c.count) || 0
        referenceCount += count
        if (count > 0) {
          const file = String(c.file || "unknown")
          files.set(file, (files.get(file) || 0) + count)
        }
      }
      return { from, to, referenceCount, files }
    })

    // One snippets query for every importing file of the loop.
    const filePaths = Array.from(new Set(base.flatMap(e => Array.from(e.files.keys())))).filter(f => f !== "unknown")
    const linesByFileTarget = new Map<string, number[]>()
    if (filePaths.length > 0 && store.hasView("snippets")) {
      const rows = await store.query<{ file: string; content: string; begin_position: string }>(`
        SELECT file, content, begin_position
        FROM snippets
        WHERE snippet_type = ${sqlLiteral(store.statName("modularity__component__imports"))}
          AND file IN ${sqlIn(filePaths)}
          AND content IN ${sqlIn(nodes)}
      `)
      for (const r of rows) {
        const line = parseInt(String(r.begin_position).split(":")[0], 10)
        if (Number.isNaN(line)) continue
        const key = pairKey(r.file, r.content)
        const list = linesByFileTarget.get(key) ?? []
        list.push(line)
        linesByFileTarget.set(key, list)
      }
    }

    // One shared-commits query for every pair of the loop, either direction.
    const sharedByPair = new Map<string, number>()
    if (store.hasView("git_component_shared_commits")) {
      const predicate = base.map(e => {
        const a = sqlLiteral(e.from)
        const b = sqlLiteral(e.to)
        return `(pair_1 = ${a} AND pair_2 = ${b}) OR (pair_1 = ${b} AND pair_2 = ${a})`
      }).join(" OR ")
      const rows = await store.query<{ pair_1: string; pair_2: string; shared_commits: number }>(`
        SELECT pair_1, pair_2, shared_commits
        FROM git_component_shared_commits
        WHERE ${predicate}
      `)
      for (const r of rows) {
        const n = Number(r.shared_commits) || 0
        sharedByPair.set(pairKey(r.pair_1, r.pair_2), Math.max(n, sharedByPair.get(pairKey(r.pair_1, r.pair_2)) ?? 0))
        sharedByPair.set(pairKey(r.pair_2, r.pair_1), Math.max(n, sharedByPair.get(pairKey(r.pair_2, r.pair_1)) ?? 0))
      }
    }

    return base.map(e => ({
      from: e.from,
      to: e.to,
      referenceCount: e.referenceCount,
      sharedCommits: sharedByPair.get(pairKey(e.from, e.to)) ?? 0,
      files: Array.from(e.files.entries()).map(([file, count]) => {
        const lines = (linesByFileTarget.get(pairKey(file, e.to)) ?? []).sort((a, b) => a - b)
        return { file, count, ranges: toRanges(lines), firstLine: lines.length ? lines[0] : null }
      }).sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)),
    }))
  },
  [selectedCycleId],
  { initial: [] },
)

// The previous cycle's edges never show under the new cycle's nodes.
const edges = computed<EdgeDetail[]>(() => edgesLoading.value ? [] : loadedEdges.value)

const edgeKey = (e: { from: string; to: string }) => `${e.from}→${e.to}`

const sortedEdges = computed(() => [...edges.value].sort((a, b) => a.referenceCount - b.referenceCount))
const breakingPoint = computed<EdgeDetail | null>(() => sortedEdges.value[0] ?? null)
const tiedEdges = computed(() => {
  const bp = breakingPoint.value
  if (!bp) return []
  return sortedEdges.value.filter(e => e.referenceCount === bp.referenceCount)
})
const hasTies = computed(() => tiedEdges.value.length > 1)

const selectedEdge = ref<{ from: string; to: string } | null>(null)

// A freshly loaded cycle starts on its weakest link.
watch(edges, (list) => {
  const bp = breakingPoint.value
  selectedEdge.value = bp ? { from: bp.from, to: bp.to } : (list[0] ? { from: list[0].from, to: list[0].to } : null)
})

const activeInspectorEdge = computed<EdgeDetail | null>(() => {
  const sel = selectedEdge.value
  if (!sel) return breakingPoint.value
  return edges.value.find(e => e.from === sel.from && e.to === sel.to) ?? breakingPoint.value
})

function onSelectEdge(edge: { from: string; to: string }) {
  selectedEdge.value = edge
  activeTab.value = "diagnostics"
  isSidebarOpen.value = true
}

function isSelectedEdge(e: { from: string; to: string }): boolean {
  return !!selectedEdge.value && selectedEdge.value.from === e.from && selectedEdge.value.to === e.to
}

function isBreakingPoint(e: { from: string; to: string }): boolean {
  const bp = breakingPoint.value
  return !!bp && bp.from === e.from && bp.to === e.to
}

// ── Import locations ─────────────────────────────────────────────
const inlineSnippetLimit = 3
const expandedFiles = ref<Set<string>>(new Set())

function toggleFile(file: string) {
  const next = new Set(expandedFiles.value)
  if (next.has(file)) next.delete(file); else next.add(file)
  expandedFiles.value = next
}

watch(selectedEdge, () => { expandedFiles.value = new Set() })

function rangeStart(range: string): number | null {
  const n = parseInt(range.split("-")[0], 10)
  return Number.isNaN(n) ? null : n
}

function fileSourcePath(file: string, line: number | null): string {
  return `/views/files/${file}/source${line ? `#L${line}` : ""}`
}

// ── Names, groups ────────────────────────────────────────────────
function shortName(name: string): string {
  return store.getComponentName(name) || name
}

function componentPath(name: string): string {
  return `/views/components/${name}`
}

const lens = useLensStore()
const lensGroupsOf = (componentName: string) => groupsStore.getGroupsForComponent(componentName).filter(g => !lens.active || g.dimension === lens.active)
function groupDot(componentName: string): { backgroundColor: string } | null {
  const groups = lensGroupsOf(componentName)
  return groups.length ? { backgroundColor: groups[0].color } : null
}

const groupSpanParts = computed(() => {
  const cycle = selectedCycle.value
  if (!cycle) return []
  const counts = new Map<string, number>()
  let unassigned = 0
  for (const node of cycle.nodes) {
    const groups = lensGroupsOf(node)
    if (groups.length === 0) { unassigned++; continue }
    for (const g of groups) counts.set(g.name, (counts.get(g.name) || 0) + 1)
  }
  if (counts.size === 0) return []
  const parts = Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  if (unassigned > 0) parts.push({ name: "Unassigned", count: unassigned })
  return parts
})

// ── Save cycle as group ──────────────────────────────────────────
// The cycle's nodes become the selection and the shared tray names the group,
// so saving a cycle is the same gesture as creating a group anywhere else.
const trayRef = ref<{ startCreate: (name?: string) => void } | null>(null)
const traySelection = ref<string[]>([])

async function saveCycleAsGroup() {
  if (!selectedCycle.value) return
  traySelection.value = [...selectedCycle.value.nodes]
  await nextTick()
  trayRef.value?.startCreate(`Cycle ${selectedCycle.value.id}`)
}
</script>
