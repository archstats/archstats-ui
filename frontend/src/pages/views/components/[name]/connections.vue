<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Controls: how neighbours are rolled up, and where the walk stands. -->
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <span class="ui-label">Roll up by</span>
      <div class="ui-segmented" role="group" aria-label="Grouping">
        <button v-for="m in modes" :key="m.value" type="button" :aria-pressed="mode === m.value" :disabled="!m.available" @click="mode = m.value">{{ m.label }}</button>
      </div>
      <template v-if="mode === 'path'">
        <span class="ui-label">Segments</span>
        <div class="ui-segmented" role="group" aria-label="Name segments to group by" :title="segmentsHint">
          <button v-for="d in DEPTHS" :key="d" type="button" :aria-pressed="depth === d" @click="depth = d">{{ d }}</button>
        </div>
        <span v-if="segmentsExample" class="ui-toolbar-meta truncate">{{ segmentsExample }}</span>
      </template>
      <span class="ui-toolbar-meta ml-auto flex items-center gap-1.5">
        <span>Dependents <span class="font-mono text-neutral-800">{{ formatNumber(dependents.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>Dependencies <span class="font-mono text-neutral-800">{{ formatNumber(dependencies.length) }}</span></span>
      </span>
    </div>

    <!-- The subject: which component the diagram and the list are about, how
         the reader got there, and the two ways to change it. Always on
         screen — a jump used to move the subject and leave no trace. -->
    <div class="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto px-4 hairline-b" aria-label="Subject">
      <span class="ui-label shrink-0">Showing</span>
      <template v-for="(step, i) in trail" :key="i">
        <span v-if="i > 0" class="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
          <Icon icon="chevron-right" :size="12" class="text-neutral-300"/>{{ trail[i - 1].relationship }}<Icon icon="chevron-right" :size="12" class="text-neutral-300"/>
        </span>
        <button
          type="button"
          class="ui-chip shrink-0 font-mono"
          :class="{ 'is-active': i === position, 'is-muted': i > position }"
          :title="step.name"
          @click="rewind(i)"
        >{{ leaf(step.name) }}</button>
      </template>
      <button v-if="awayFromPage" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="reset">
        <Icon icon="rotate" :size="13" class="text-neutral-500"/><span>Back to {{ leaf(pageName) }}</span>
      </button>
      <span v-else class="ui-toolbar-meta min-w-0 truncate">Select a neighbour, then Walk here to follow the chain</span>
      <span class="ml-auto shrink-0 pl-3">
        <ModalTrigger>
          <template #trigger>
            <button type="button" class="ui-btn ui-btn-sm" title="Point this view at a different component, without leaving this page">
              <Icon icon="footprints" :size="13" class="text-neutral-500"/><span>Show another…</span>
            </button>
          </template>
          <template #modal>
            <SelectComponentModal @component-selected="startFrom($event.name)"/>
          </template>
        </ModalTrigger>
      </span>
    </div>

    <LoadingState v-if="loading && neighbours.length === 0" text="Reading connections…"/>
    <div v-else class="flex min-h-0 grow overflow-hidden">
      <!-- Main column: the shape, then the names behind it. -->
      <div class="min-w-0 grow overflow-y-auto">
        <section class="px-4 pt-4">
          <CouplingFlow
            :dependents="flowIn"
            :dependencies="flowOut"
            :centre-label="leaf(current)"
            :total-in="dependents.length"
            :total-out="dependencies.length"
            :selected="selectedGroup"
            :colored="mode === 'groups'"
            @select="pickGroup"
          />
        </section>

        <section class="mt-2">
          <div class="sticky top-0 z-10 flex h-9 items-center gap-2 bg-surface px-4 hairline-b hairline-t">
            <h3 class="ui-section-title">{{ activeDirection.title }}</h3>
            <span class="font-mono text-xs text-neutral-400">{{ formatNumber(visibleGroups.length) }} {{ visibleGroups.length === 1 ? "group" : "groups" }}</span>
            <div class="ui-segmented ml-auto" role="group" aria-label="Direction">
              <button v-for="d in directions" :key="d.value" type="button" :aria-pressed="direction === d.value" :disabled="!d.count" @click="direction = d.value">
                {{ d.label }} <span class="font-mono text-neutral-400">{{ formatNumber(d.count) }}</span>
              </button>
            </div>
          </div>

          <EmptyState v-if="visibleGroups.length === 0" class="py-10" :title="activeDirection.emptyTitle" :text="activeDirection.emptyText" icon="network"/>
          <ul v-else class="flex flex-col">
            <li v-for="group in visibleGroups" :key="group.key" :ref="el => setGroupRow(group.key, el)" class="hairline-b">
              <!-- Group row: opens the group, and nothing else. -->
              <button
                type="button"
                class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-neutral-50"
                :class="{ 'bg-accent-50': group.key === selectedGroup }"
                :aria-expanded="expanded.has(group.key)"
                @click="toggleGroup(group.key)"
              >
                <Icon icon="chevron-right" :size="12" class="shrink-0 text-neutral-400 transition-transform" :class="{ 'rotate-90': expanded.has(group.key) }"/>
                <span v-if="group.color" class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: group.color }"></span>
                <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900" :title="group.label">{{ group.label }}</span>
                <span class="h-1 w-[120px] shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  <span
                    class="block h-full rounded-full"
                    :class="group.color ? '' : mode === 'groups' ? 'bg-neutral-400' : direction === 'out' ? 'bg-accent-500' : 'bg-blue-500'"
                    :style="{ width: `${share(group)}%`, backgroundColor: group.color }"
                  ></span>
                </span>
                <span class="w-[120px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">
                  {{ formatNumber(group.components) }} · {{ formatNumber(group.references) }} refs
                </span>
              </button>

              <!-- Member rows: selecting one fills the inspector; it never navigates. -->
              <ul v-if="expanded.has(group.key)" class="bg-ground pb-1">
                <li v-for="member in group.rows" :key="member.name">
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 py-1 pl-10 pr-4 text-left transition-colors hover:bg-neutral-200"
                    :class="{ 'bg-accent-50': member.name === selectedName, 'ring-1 ring-inset ring-accent-300': selection.has(member.name) }"
                    :title="member.name"
                    @click="pickMember($event, member.name)"
                  >
                    <span class="min-w-0 grow truncate font-mono text-sm" :title="member.name"><span class="text-neutral-500">{{ member.shared }}</span><span class="text-neutral-800">{{ member.own }}</span></span>
                    <span v-if="member.direction === 'both'" class="ui-tag shrink-0" title="These two import each other">both ways</span>
                    <span class="w-[92px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">{{ member.references ? `${formatNumber(member.references)} refs` : "—" }}</span>
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <!-- Lookups the analysis saw but could not tie to a component: a string
             naming a module that is not in the scan. Each is a dependency the
             numbers above leave out. -->
        <section v-if="unplaced.length" class="px-4 pb-6 pt-5">
          <h3 class="ui-section-title">Dependencies it can't place</h3>
          <p class="mt-1 max-w-[70ch] text-sm text-neutral-500">Names used at runtime that match no module in this scan, so they count in no coupling number here.</p>
          <div class="mt-2 overflow-hidden rounded-lg hairline">
            <table class="ui-table">
              <thead><tr><th>Where</th><th>Name used</th><th>Why it is unplaced</th></tr></thead>
              <tbody>
                <tr v-for="u in unplaced" :key="`${u.file}:${u.line}:${u.names}`">
                  <td class="max-w-0"><router-link :to="`${filePath(u.file, 'source')}#L${u.line}`" class="block truncate font-mono text-sm text-neutral-900 hover:underline" :title="`${u.file}:${u.line}`">{{ u.file.split("/").pop() }}:{{ u.line }}</router-link></td>
                  <td class="font-mono text-sm text-neutral-800">{{ u.names }}</td>
                  <td class="text-sm text-neutral-600">{{ u.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Inspector: the one place a selection explains itself, and the only
           place that offers to leave. -->
      <aside class="flex w-[340px] shrink-0 flex-col overflow-y-auto bg-ground hairline-l">
        <template v-if="selectedName">
          <div class="px-4 pb-3 pt-4 hairline-b">
            <p class="ui-label">{{ selectedNeighbour?.direction === "out" ? "This depends on" : selectedNeighbour?.direction === "in" ? "Depends on this" : "Both ways" }}</p>
            <p class="mt-1 break-all font-mono text-sm font-medium text-neutral-900">{{ selectedName }}</p>
            <div class="mt-3 flex gap-2">
              <router-link :to="componentPath(selectedName)" class="ui-btn ui-btn-sm">
                <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/><span>Open</span>
              </router-link>
              <button type="button" class="ui-btn ui-btn-sm" @click="walkTo(selectedName)">
                <Icon icon="footprints" :size="13" class="text-neutral-500"/><span>Walk here</span>
              </button>
              <router-link
                v-if="selectedNeighbour?.direction === 'both'"
                :to="`${componentPath(pageName)}/cycles?with=${encodeURIComponent(selectedName)}`"
                class="ui-btn ui-btn-sm"
                title="These two import each other — show the cycles they share"
              >
                <Icon icon="route" :size="13" class="text-neutral-500"/><span>Cycle</span>
              </router-link>
            </div>
          </div>

          <dl class="ui-kv gap-y-1.5 px-4 py-3 hairline-b">
            <template v-for="row in neighbourFacts" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>

          <div class="px-4 py-4">
            <LoadingState v-if="evidenceLoading" text="Reading imports…"/>
            <template v-else>
              <div v-for="side in evidenceSides" :key="side.key" class="mb-5 last:mb-0">
                <h4 class="ui-label">{{ side.title }}</h4>
                <p v-if="side.files.length === 0" class="mt-1.5 text-sm text-neutral-500">{{ side.empty }}</p>
                <ul v-else class="mt-1.5 flex flex-col">
                  <li v-for="f in side.files" :key="f.file" class="flex h-6 items-center gap-2">
                    <router-link :to="`/views/files/${f.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="f.file">{{ basename(f.file) }}</router-link>
                    <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(f.references) }}</span>
                  </li>
                </ul>
              </div>

              <div v-for="path in evidencePaths" :key="path.key" class="mb-5 last:mb-0">
                <h4 class="ui-label">{{ path.title }}</h4>
                <div class="mt-1.5 flex flex-wrap items-center gap-1">
                  <template v-for="(step, i) in path.steps" :key="`${path.key}-${i}`">
                    <Icon v-if="i > 0" icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
                    <button type="button" class="ui-chip font-mono" :class="{ 'is-active': step === current }" :title="step" @click="walkTo(step)">{{ leaf(step) }}</button>
                  </template>
                </div>
              </div>

              <p v-if="!hasEvidence" class="text-sm text-neutral-500">
                No import runs between these two. They are related by shared commits or directory distance alone.
              </p>
            </template>
          </div>
        </template>

        <!-- A group is selected, but no single component in it. -->
        <template v-else-if="selectedGroupRow">
          <div class="px-4 pb-3 pt-4 hairline-b">
            <p class="ui-label">{{ direction === "out" ? "Dependency group" : "Dependent group" }}</p>
            <p class="mt-1 flex items-center gap-2">
              <span v-if="selectedGroupRow.color" class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: selectedGroupRow.color }"></span>
              <span class="min-w-0 break-all font-mono text-sm font-medium text-neutral-900">{{ selectedGroupRow.label }}</span>
            </p>
          </div>
          <dl class="ui-kv gap-y-1.5 px-4 py-3 hairline-b">
            <dt>Components</dt><dd>{{ formatNumber(selectedGroupRow.components) }}</dd>
            <dt>References</dt><dd>{{ formatNumber(selectedGroupRow.references) }}</dd>
            <dt>Share of this side</dt><dd>{{ share(selectedGroupRow) }}%</dd>
          </dl>
          <div class="px-4 py-4">
            <h4 class="ui-label">Heaviest in this group</h4>
            <ul class="mt-1.5 flex flex-col">
              <li v-for="m in selectedGroupRow.rows.slice(0, 10)" :key="m.name">
                <button type="button" class="flex h-6 w-full items-center gap-2 text-left" @click="selectedName = m.name">
                  <span class="min-w-0 truncate font-mono text-sm hover:underline" :title="m.name"><span class="text-neutral-500">{{ m.shared }}</span><span class="text-neutral-800">{{ m.own }}</span></span>
                  <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(m.references) }}</span>
                </button>
              </li>
            </ul>
          </div>
        </template>

        <!-- Nothing selected: the component's own coupling, and how to read the page. -->
        <template v-else>
          <div class="px-4 pb-3 pt-4 hairline-b">
            <p class="ui-label">Selected</p>
            <p class="mt-1 break-all font-mono text-sm font-medium text-neutral-900">{{ current }}</p>
          </div>
          <dl class="ui-kv gap-y-1.5 px-4 py-3 hairline-b">
            <template v-for="row in centreFacts" :key="row.label">
              <dt :title="row.title">{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
          <p class="px-4 py-4 text-sm text-neutral-500">
            Click a band or a name to see why the two are connected: which files carry the import, and the path between them when there is none.
          </p>
        </template>
      </aside>
    </div>
  </div>
  <GroupActionBar :selected-items="selectionList" kind="component" @clear="selection = new Set()"/>
</template>

<script setup lang="ts">
import { TRUSTED_PAIR_SQL } from "~/utils/cochange"
import { componentPath, filePath } from "~/utils/routes"
import { computed, nextTick, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { pathSteps } from "~/composables/useComponentPosition"
import { detectSeparator } from "~/utils/subject"
import { FOLDED_KEY, foldTail, groupByLens, groupByPath, segmentPrefix, splitSharedPrefix, type Neighbour, type NeighbourGroup } from "~/utils/neighbours"
import Icon from "~/components/ui/common/Icon.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import ModalTrigger from "~/components/ui/modals/ModalTrigger.vue"
import SelectComponentModal from "~/components/components/modals/SelectComponentModal.vue"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"
import CouplingFlow from "~/components/component/CouplingFlow.vue"
import { hopsOf } from "~/utils/hops"

type Relationship = "depends on" | "is depended on by"

const route = useRoute()
const store = useDataStore()
const groupsStore = useGroupsStore()

const pageName = computed(() => String(route.params.name ?? ""))

// ── The walk: only ever moved by an explicit action ────────────────
const trail = ref<Array<{ name: string; relationship?: Relationship }>>([{ name: pageName.value }])
const position = ref(0)
const current = computed(() => trail.value[position.value]?.name ?? pageName.value)

watch(pageName, name => { trail.value = [{ name }]; position.value = 0 })

function walkTo(name: string) {
  if (name === current.value) return
  const relationship: Relationship = dependencies.value.some(d => d.name === name) ? "depends on" : "is depended on by"
  trail.value = trail.value.slice(0, position.value + 1)
  trail.value[position.value].relationship = relationship
  trail.value.push({ name })
  position.value = trail.value.length - 1
}
function rewind(i: number) { position.value = i }
function reset() { trail.value = [{ name: pageName.value }]; position.value = 0 }
function startFrom(name: string) { trail.value = [{ name }]; position.value = 0 }

/** True whenever the view has left the component named in the page header. */
const awayFromPage = computed(() => current.value !== pageName.value)

const separator = computed(() => detectSeparator(store.allComponents.map((c: any) => c.name)))

// Depth counts segments after the prefix every component shares, or a Java
// codebase answers "org" at depth 1 and "org.broadleafcommerce" at depth 2.
const sharedPrefix = computed(() => segmentPrefix(store.getProjectPrefixIfAny, separator.value))

/** The last segment, for chips and headings where the full name will not fit. */
function leaf(name: string): string {
  if (!separator.value) return name
  const parts = name.split(separator.value).filter(Boolean)
  return parts.length > 1 ? parts.slice(-2).join(separator.value) : name
}

// ── The snapshot's answer for this component ───────────────────────
interface DirectRow { from: string; to: string; references: number }
interface IndirectRow { from: string; to: string; hops: number }
interface MatrixRow { from: string; to: string; git_co_changes: number | null }
interface SharedRow { pair_1: string; pair_2: string; shared_commits: number; percentage_of_all_commits_pair_1: number | null; percentage_of_all_commits_pair_2: number | null }

const hasIndirect = computed(() => store.hasView("component_connections_indirect"))

const { data: unplaced } = useAsyncQuery<Array<{ file: string; line: number; names: string; reason: string }>>(
  () => store.hasView("unresolved_edges")
    ? store.query(`SELECT file, line, names, reason FROM unresolved_edges WHERE "from" = ${sqlLiteral(current.value)} ORDER BY file, line`)
    : Promise.resolve([]),
  [current],
  { initial: [] },
)

const { data, loading } = useAsyncQuery(
  async () => {
    const lit = sqlLiteral(current.value)
    const direct = await store.query<DirectRow>(`
      select "from", "to", sum(reference_count) as "references"
      from ${store.runtimeComponentEdges}
      where "from" = ${lit} or "to" = ${lit}
      group by 1, 2`)
    // Hops from the path itself: older engines stored the components on the
    // path, current ones the steps, and subtracting one here was only right
    // for the first.
    const indirect: IndirectRow[] = hasIndirect.value
      ? (await store.query<{ from: string; to: string; shortest_path: string | null; shortest_path_length: number }>(`
          select "from", "to", shortest_path, shortest_path_length
          from component_connections_indirect
          where "from" = ${lit} or "to" = ${lit}`))
          .map(r => ({ from: r.from, to: r.to, hops: hopsOf(r.shortest_path, r.shortest_path_length) }))
      : []
    const matrix = store.hasView("component_matrix")
      ? await store.query<MatrixRow>(`select "from", "to", git_co_changes from component_matrix where "from" = ${lit} or "to" = ${lit}`)
      : []
    const shared = store.hasView("git_component_shared_commits")
      ? await store.query<SharedRow>(`select pair_1, pair_2, shared_commits, percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2 from git_component_shared_commits where (pair_1 = ${lit} or pair_2 = ${lit}) and ${TRUSTED_PAIR_SQL}`)
      : []
    return { direct, indirect, matrix, shared }
  },
  [current],
  { initial: { direct: [] as DirectRow[], indirect: [] as IndirectRow[], matrix: [] as MatrixRow[], shared: [] as SharedRow[] } },
)

// One neighbour per component, whatever the evidence for it was.
const neighbours = computed<Neighbour[]>(() => {
  const me = current.value
  const byName = new Map<string, Neighbour>()
  const get = (name: string): Neighbour => {
    let row = byName.get(name)
    if (!row) {
      row = { name, direction: "in", references: 0, sharedCommits: null, coChangeRate: null, hops: null }
      byName.set(name, row)
    }
    return row
  }

  const outgoing = new Set<string>(), incoming = new Set<string>()
  for (const r of data.value.direct) {
    const other = r.from === me ? r.to : r.from
    if (other === me) continue
    const row = get(other)
    row.references += Number(r.references) || 0
    row.hops = 1
    if (r.from === me) outgoing.add(other); else incoming.add(other)
  }
  for (const r of data.value.indirect) {
    const other = r.from === me ? r.to : r.from
    if (other === me || !byName.has(other)) continue
    const row = get(other)
    const hops = Number(r.hops)
    if (Number.isFinite(hops)) row.hops = Math.min(row.hops ?? hops, hops)
  }
  for (const r of data.value.matrix) {
    const other = r.from === me ? r.to : r.from
    if (other === me || !byName.has(other)) continue
    if (r.git_co_changes !== null && r.git_co_changes !== undefined) get(other).sharedCommits = Number(r.git_co_changes)
  }
  for (const r of data.value.shared) {
    const other = r.pair_1 === me ? r.pair_2 : r.pair_1
    if (other === me || !byName.has(other)) continue
    const row = get(other)
    row.sharedCommits = Number(r.shared_commits) || 0
    const pct = r.pair_1 === me ? r.percentage_of_all_commits_pair_1 : r.percentage_of_all_commits_pair_2
    if (pct !== null && pct !== undefined) row.coChangeRate = Number(pct) > 1 ? Number(pct) / 100 : Number(pct)
  }

  for (const row of byName.values()) {
    const out = outgoing.has(row.name), inc = incoming.has(row.name)
    row.direction = out && inc ? "both" : out ? "out" : "in"
  }
  return Array.from(byName.values())
})

const dependents = computed(() => neighbours.value.filter(n => n.direction !== "out"))
const dependencies = computed(() => neighbours.value.filter(n => n.direction !== "in"))

// ── Rolling the names up ───────────────────────────────────────────
const hasUserGroups = computed(() => groupsStore.componentGroupIndex.size > 0)
const modes = computed(() => [
  { value: "path" as const, label: "Name", available: true },
  { value: "groups" as const, label: "Groups", available: hasUserGroups.value },
])
const mode = ref<"path" | "groups">("path")
// The depth opens where this component's neighbours split into a readable
// handful: not one band holding everything (Broadleaf's 121 dependents all
// read "org.broadleafcommerce" at a fixed 2), not a list as long as the
// neighbours themselves. A depth the architect picks stays picked.
const DEPTHS = [1, 2, 3, 4]
const pickedDepth = ref<number | null>(null)
watch(pageName, () => { pickedDepth.value = null })
const autoDepth = computed(() => {
  const all = [...dependents.value, ...dependencies.value]
  if (all.length < 6) return 2
  let fallback = 2
  for (const d of DEPTHS) {
    const groups = groupByPath(all, separator.value, d, sharedPrefix.value)
    const largest = Math.max(0, ...groups.map(g => g.members.length))
    if (groups.length <= 15) fallback = d
    if (groups.length >= 3 && groups.length <= 15 && largest <= all.length * 0.6) return d
    if (groups.length > 15) break
  }
  return fallback
})
const depth = computed({ get: () => pickedDepth.value ?? autoDepth.value, set: (d: number) => { pickedDepth.value = d } })
watch(hasUserGroups, has => { if (!has && mode.value === "groups") mode.value = "path" })

function rollUp(list: Neighbour[]): NeighbourGroup[] {
  if (mode.value === "groups") {
    return groupByLens(list, name => {
      const group = groupsStore.componentGroupIndex.get(name)?.[0]
      return group ? { name: group.name, color: group.color } : null
    })
  }
  return groupByPath(list, separator.value, depth.value, sharedPrefix.value)
}

const segmentsHint = computed(() =>
  `Group by the first ${depth.value} ${depth.value === 1 ? "segment" : "segments"} of the component name${sharedPrefix.value ? `, after the shared ${sharedPrefix.value}` : ""}. Not a hop count.`)

/** What the current depth actually produces, so the control explains itself. */
const segmentsExample = computed(() => {
  const first = (visibleGroups.value[0] ?? inGroups.value[0])?.label
  return first ? `e.g. ${first}` : ""
})

const inGroups = computed(() => rollUp(dependents.value))
const outGroups = computed(() => rollUp(dependencies.value))

const FLOW_BANDS = 7
const flowIn = computed(() => foldTail(inGroups.value, FLOW_BANDS))
const flowOut = computed(() => foldTail(outGroups.value, FLOW_BANDS))

const directions = computed(() => [
  { value: "in" as const, label: "Dependents", count: dependents.value.length },
  { value: "out" as const, label: "Dependencies", count: dependencies.value.length },
])
const direction = ref<"in" | "out">("in")
watch(directions, list => {
  const active = list.find(d => d.value === direction.value)
  if (!active?.count) direction.value = list.find(d => d.count)?.value ?? "in"
}, { immediate: true })

const activeDirection = computed(() => direction.value === "out"
  ? { title: "What this depends on", emptyTitle: "Imports nothing", emptyText: "This component imports no other component in the snapshot." }
  : { title: "What depends on this", emptyTitle: "Nothing imports it", emptyText: "No component in the snapshot imports this one." })

const rawGroups = computed(() => direction.value === "out" ? outGroups.value : inGroups.value)

/** Each member carries the full name, split into what its group already said
 *  and what makes it itself. */
const visibleGroups = computed(() => rawGroups.value.map(group => ({
  ...group,
  rows: group.members.map(member => ({ ...member, ...splitSharedPrefix(member.name, group.key, separator.value, sharedPrefix.value) })),
})))

function share(group: NeighbourGroup): number {
  const total = visibleGroups.value.reduce((a, g) => a + g.components, 0)
  return total ? Math.round((group.components / total) * 100) : 0
}

// ── Selection: one click, one meaning ──────────────────────────────
const selectedGroup = ref<string | null>(null)
const selectedName = ref<string | null>(null)
const expanded = ref(new Set<string>())

// A tray selection is still built with shift or cmd, as everywhere else.
const selection = ref(new Set<string>())
const selectionList = computed(() => Array.from(selection.value))

watch(current, () => {
  selectedGroup.value = null
  selectedName.value = null
  expanded.value = new Set()
  selection.value = new Set()
})
watch(direction, () => { selectedGroup.value = null; selectedName.value = null })

const selectedGroupRow = computed(() => visibleGroups.value.find(g => g.key === selectedGroup.value) ?? null)
const selectedNeighbour = computed(() => neighbours.value.find(n => n.name === selectedName.value) ?? null)

function toggleGroup(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key); else next.add(key)
  expanded.value = next
  selectedGroup.value = key
  selectedName.value = null
}

const groupRows = new Map<string, HTMLElement>()
function setGroupRow(key: string, el: unknown) {
  if (el instanceof HTMLElement) groupRows.set(key, el)
  else groupRows.delete(key)
}

// A band in the diagram opens its group in the list, switching side if needed.
function pickGroup(key: string) {
  const inIn = flowIn.value.some(g => g.key === key)
  direction.value = inIn ? "in" : "out"
  selectedGroup.value = key
  selectedName.value = null
  const folded = (inIn ? flowIn.value : flowOut.value).find(g => g.key === key)
  const keys = folded && folded.key.startsWith(" ")
    ? (inIn ? inGroups.value : outGroups.value).slice(FLOW_BANDS - 1).map(g => g.key)
    : [key]
  const next = new Set(expanded.value)
  for (const k of keys) next.add(k)
  expanded.value = next

  // Take the reader to what they just clicked.
  void nextTick(() => groupRows.get(keys[0])?.scrollIntoView({ behavior: "smooth", block: "nearest" }))
}

function pickMember(event: MouseEvent, name: string) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    const next = new Set(selection.value)
    if (next.has(name)) next.delete(name); else next.add(name)
    selection.value = next
    return
  }
  selectedName.value = name
}

const neighbourFacts = computed(() => {
  const n = selectedNeighbour.value
  if (!n) return []
  const rows: Array<{ label: string; value: string }> = [
    { label: "References", value: n.references ? formatNumber(n.references) : "—" },
  ]
  if (n.hops !== null) rows.push({ label: "Shortest path", value: n.hops === 1 ? "Direct import" : `${formatNumber(n.hops)} hops` })
  if (n.sharedCommits !== null) rows.push({ label: "Shared commits", value: formatNumber(n.sharedCommits) })
  if (n.coChangeRate !== null) rows.push({ label: "Co-change", value: `${Math.round(n.coChangeRate * 100)}%` })
  return rows
})

const cycleCount = computed(() => (store.allCyclesExpanded as Array<{ nodes: string[] }>).filter(c => c.nodes.includes(current.value)).length)

const centreFacts = computed(() => {
  const c: any = store.allComponentsIndex.get(current.value)
  const num = (k: string) => { const v = Number(c?.[k]); return Number.isFinite(v) ? v : null }
  const def = (k: string) => store.definitions.get(k)?.short_description || ""
  const rows: Array<{ label: string; value: string; title: string }> = [
    { label: "Dependents", value: formatNumber(dependents.value.length), title: "Components that import this one" },
    { label: "Dependencies", value: formatNumber(dependencies.value.length), title: "Components this one imports" },
  ]
  const afferent = num("modularity__coupling__afferent")
  if (afferent !== null) rows.push({ label: "Importing files", value: formatNumber(afferent), title: "Files elsewhere that import this component" })
  const instability = num("modularity__instability")
  if (instability !== null) rows.push({ label: "Instability", value: instability.toFixed(2), title: def("modularity__instability") })
  rows.push({ label: "Cycles", value: cycleCount.value ? formatNumber(cycleCount.value) : "None", title: "Dependency cycles this component appears in" })
  return rows
})

// ── Evidence for the selected pair ─────────────────────────────────
interface EvidenceFile { file: string; references: number }
interface EvidenceLoad { out: EvidenceFile[]; in: EvidenceFile[]; outPath: string[]; inPath: string[] }
const EMPTY_EVIDENCE: EvidenceLoad = { out: [], in: [], outPath: [], inPath: [] }

const { data: evidence, loading: evidenceLoading } = useAsyncQuery<EvidenceLoad>(
  async () => {
    const other = selectedName.value
    if (!other) return EMPTY_EVIDENCE
    const me = sqlLiteral(current.value)
    const them = sqlLiteral(other)

    const files = await store.query<{ from: string; to: string; file: string; references: number }>(`
      SELECT "from", "to", file, SUM(reference_count) AS "references"
      FROM ${store.runtimeComponentEdges}
      WHERE ("from" = ${me} AND "to" = ${them}) OR ("from" = ${them} AND "to" = ${me})
      GROUP BY "from", "to", file
      ORDER BY "references" DESC LIMIT 40`)

    const paths = hasIndirect.value
      ? await store.query<{ from: string; to: string; shortest_path: string | null }>(`
          SELECT "from", "to", shortest_path
          FROM component_connections_indirect
          WHERE ("from" = ${me} AND "to" = ${them}) OR ("from" = ${them} AND "to" = ${me})`)
      : []

    const mine = current.value
    return {
      out: files.filter(f => f.from === mine).map(f => ({ file: f.file, references: Number(f.references) || 0 })),
      in: files.filter(f => f.to === mine).map(f => ({ file: f.file, references: Number(f.references) || 0 })),
      outPath: pathSteps(paths.find(p => p.from === mine)?.shortest_path),
      inPath: pathSteps(paths.find(p => p.to === mine)?.shortest_path),
    }
  },
  [selectedName, current],
  { initial: EMPTY_EVIDENCE },
)

const evidenceSides = computed(() => {
  const other = selectedName.value ? leaf(selectedName.value) : ""
  return [
    { key: "out", title: `Files here that import ${other}`, files: evidence.value.out, empty: `Nothing here imports ${other}.` },
    { key: "in", title: `Files in ${other} that import this`, files: evidence.value.in, empty: `No file in ${other} imports this component.` },
  ].filter(side => side.files.length > 0 || evidence.value.out.length + evidence.value.in.length > 0)
})

const evidencePaths = computed(() => {
  const other = selectedName.value ? leaf(selectedName.value) : ""
  const out: Array<{ key: string; title: string; steps: string[] }> = []
  if (evidence.value.out.length === 0 && evidence.value.outPath.length > 2) {
    out.push({ key: "outPath", title: `How it reaches ${other}`, steps: evidence.value.outPath })
  }
  if (evidence.value.in.length === 0 && evidence.value.inPath.length > 2) {
    out.push({ key: "inPath", title: `How ${other} reaches it`, steps: evidence.value.inPath })
  }
  return out
})

const hasEvidence = computed(() =>
  evidence.value.out.length > 0 || evidence.value.in.length > 0 || evidencePaths.value.length > 0)

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}
</script>
