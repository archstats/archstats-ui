<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Controls: hop depth, change the walked component, counts. -->
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <span class="ui-label">Hops</span>
      <div class="ui-segmented" role="group" aria-label="Hop depth">
        <button v-for="h in hopOptions" :key="h.value" type="button" :aria-pressed="hops === h.value" :disabled="h.value > 1 && !hasIndirect" @click="hops = h.value">{{ h.label }}</button>
      </div>
      <ModalTrigger>
        <template #trigger>
          <button type="button" class="ui-btn ui-btn-sm"><Icon icon="pencil" :size="13" class="text-neutral-500"/><span>Walk from…</span></button>
        </template>
        <template #modal>
          <SelectComponentModal @component-selected="startFrom($event.name)"/>
        </template>
      </ModalTrigger>
      <span class="ui-toolbar-meta ml-auto flex items-center gap-1.5">
        <span>Dependents <span class="font-mono text-neutral-800">{{ formatNumber(dependents.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>Dependencies <span class="font-mono text-neutral-800">{{ formatNumber(dependencies.length) }}</span></span>
      </span>
    </div>

    <!-- Trail: every step of the walk; click a step to rewind. -->
    <div class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto px-4 hairline-b" aria-label="Walk trail">
      <template v-for="(step, i) in trail" :key="i">
        <span v-if="i > 0" class="flex shrink-0 items-center gap-1 text-xs text-neutral-400">
          <Icon icon="chevron-right" :size="12" class="text-neutral-300"/>{{ trail[i - 1].relationship }}<Icon icon="chevron-right" :size="12" class="text-neutral-300"/>
        </span>
        <button type="button" class="ui-chip shrink-0 font-mono" :class="{ 'is-active': i === position, 'is-muted': i > position }" :title="step.name" @click="rewind(i)">{{ shortName(step.name) }}</button>
      </template>
      <button v-if="trail.length > 1" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-2 shrink-0" @click="reset"><Icon icon="rotate" :size="13" class="text-neutral-500"/><span>Reset</span></button>
    </div>

    <LoadingState v-if="loading && !current" text="Reading connections…"/>
    <div v-else class="grid min-h-0 grow grid-cols-[minmax(200px,0.8fr)_minmax(600px,2.2fr)_minmax(200px,0.8fr)] overflow-hidden">
      <!-- Dependents: who imports the current component. -->
      <NeighbourList
        :selected="selection"
        @toggle="toggleSelect"
        title="Dependents"
        :hint="`import ${shortName(current)}`"
        :rows="dependents"
        :hops="hops"
        empty-text="Nothing imports this component."
        @walk="walk('is depended on by', $event)"
      />

      <!-- Centre: the current component and every pair it is part of. -->
      <div class="flex min-h-0 flex-col overflow-hidden hairline-l hairline-r">
        <div class="flex h-9 shrink-0 items-center gap-2 px-4 hairline-b">
          <span class="min-w-0 truncate font-mono text-sm font-medium text-neutral-900" :title="current">{{ current }}</span>
          <router-link v-if="current !== pageName" :to="`/views/components/${current}`" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto shrink-0" title="Open this component's detail">
            <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/><span>Open</span>
          </router-link>
        </div>
        <dl class="ui-kv shrink-0 grid-cols-[repeat(4,minmax(0,1fr))] gap-x-4 px-4 py-3 hairline-b">
          <template v-for="s in centreStats" :key="s.label">
            <div class="flex flex-col gap-0.5">
              <dt :title="s.title">{{ s.label }}</dt>
              <dd class="text-left">{{ s.value }}</dd>
            </div>
          </template>
        </dl>
        <div class="flex h-9 shrink-0 items-center gap-2 px-4 hairline-b">
          <h3 class="ui-section-title">Related components</h3>
          <div class="ui-segmented ml-auto" role="group" aria-label="Relation filter">
            <button v-for="f in relationFilters" :key="f.value" type="button" :aria-pressed="relation === f.value" @click="relation = f.value">{{ f.label }}</button>
          </div>
        </div>
        <PairTable
          :selected="selection"
          @toggle="toggleSelect"
          class="min-h-0 grow"
          :rows="pairRows"
          :loading="loading"
          name-label="Component"
          group-label="Relation"
          default-sort="references"
          empty-title="No related components"
          empty-text="No imports, shared commits or matrix rows connect this component to another."
        />
      </div>

      <!-- Dependencies: what the current component imports. -->
      <NeighbourList
        :selected="selection"
        @toggle="toggleSelect"
        title="Dependencies"
        :hint="`imported by ${shortName(current)}`"
        :rows="dependencies"
        :hops="hops"
        empty-text="This component imports nothing."
        @walk="walk('depends on', $event)"
      />
    </div>
  </div>
  <GroupActionBar :selected-items="selectionList" kind="component" @clear="selection = new Set()"/>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import Icon from "~/components/ui/common/Icon.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import ModalTrigger from "~/components/ui/modals/ModalTrigger.vue"
import SelectComponentModal from "~/components/components/modals/SelectComponentModal.vue"
import PairTable, { type PairRow } from "~/components/coupling/PairTable.vue"
import NeighbourList, { type NeighbourRow } from "~/components/coupling/NeighbourList.vue"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"

// Shift-click on any neighbour builds a selection; the shared tray makes it a group.
const selection = ref(new Set<string>())
const selectionList = computed(() => Array.from(selection.value))
function toggleSelect(name: string) {
  const next = new Set(selection.value)
  if (next.has(name)) next.delete(name); else next.add(name)
  selection.value = next
}

type Relationship = "depends on" | "is depended on by"

const route = useRoute()
const store = useDataStore()

const pageName = computed(() => String(route.params.name ?? ""))

// The walk: a trail of components and how each was reached. The page stays
// on the component in the URL; walking changes the centre, not the route.
const trail = ref<Array<{ name: string; relationship?: Relationship }>>([{ name: pageName.value }])
const position = ref(0)
const current = computed(() => trail.value[position.value]?.name ?? pageName.value)

watch(pageName, name => { trail.value = [{ name }]; position.value = 0 })

function walk(relationship: Relationship, name: string) {
  trail.value = trail.value.slice(0, position.value + 1)
  trail.value[position.value].relationship = relationship
  trail.value.push({ name })
  position.value = trail.value.length - 1
}
function rewind(i: number) { position.value = i }
function reset() { trail.value = [{ name: pageName.value }]; position.value = 0 }
function startFrom(name: string) { trail.value = [{ name }]; position.value = 0 }

const prefix = computed(() => store.getProjectPrefixIfAny)
function shortName(name: string): string {
  return prefix.value && name.startsWith(prefix.value) ? name.substring(prefix.value.length) || name : name
}

// Hop depth for the two neighbour lists; beyond one hop the indirect table
// supplies the shortest path length.
const hasIndirect = computed(() => store.hasView("component_connections_indirect"))
const hopOptions = [
  { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }, { value: 99, label: "All" },
]
const hops = ref(1)

interface DirectRow { from: string; to: string; references: number }
interface IndirectRow { from: string; to: string; hops: number }
interface MatrixRow { from: string; to: string; linguistic_similarity: number | null; git_co_changes: number | null; path_distance: number | null }
interface SharedRow { pair_1: string; pair_2: string; shared_commits: number; percentage_of_all_commits_pair_1: number | null; percentage_of_all_commits_pair_2: number | null }

const { data, loading } = useAsyncQuery(
  async () => {
    const lit = sqlLiteral(current.value)
    const direct = await store.query<DirectRow>(`
      select "from", "to", sum(reference_count) as "references"
      from component_connections_direct
      where "from" = ${lit} or "to" = ${lit}
      group by 1, 2`)
    const indirect = hasIndirect.value
      ? await store.query<IndirectRow>(`
          select "from", "to", shortest_path_length - 1 as hops
          from component_connections_indirect
          where "from" = ${lit} or "to" = ${lit}`)
      : []
    const matrix = store.hasView("component_matrix")
      ? await store.query<MatrixRow>(`select "from", "to", linguistic_similarity, git_co_changes, path_distance from component_matrix where "from" = ${lit} or "to" = ${lit}`)
      : []
    const shared = store.hasView("git_component_shared_commits")
      ? await store.query<SharedRow>(`select pair_1, pair_2, shared_commits, percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2 from git_component_shared_commits where pair_1 = ${lit} or pair_2 = ${lit}`)
      : []
    return { direct, indirect, matrix, shared }
  },
  [current],
  { initial: { direct: [] as DirectRow[], indirect: [] as IndirectRow[], matrix: [] as MatrixRow[], shared: [] as SharedRow[] } },
)

function neighbourRows(direction: "in" | "out"): NeighbourRow[] {
  const me = current.value
  const byName = new Map<string, NeighbourRow>()
  for (const r of data.value.direct) {
    const other = direction === "in" ? (r.to === me ? r.from : null) : (r.from === me ? r.to : null)
    if (!other || other === me) continue
    byName.set(other, { name: other, references: Number(r.references) || 0, hops: 1 })
  }
  if (hops.value > 1) {
    for (const r of data.value.indirect) {
      const other = direction === "in" ? (r.to === me ? r.from : null) : (r.from === me ? r.to : null)
      if (!other || other === me || Number(r.hops) > hops.value) continue
      const existing = byName.get(other)
      if (existing) { existing.hops = Math.min(existing.hops, Number(r.hops) || 1) }
      else byName.set(other, { name: other, references: 0, hops: Number(r.hops) || 1 })
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.hops - b.hops || b.references - a.references || a.name.localeCompare(b.name))
}

const dependents = computed(() => neighbourRows("in"))
const dependencies = computed(() => neighbourRows("out"))

const relationFilters = [
  { value: "all", label: "All" }, { value: "depends on", label: "Uses" }, { value: "is depended on by", label: "Used by" }, { value: "other", label: "Other" },
]
const relation = ref("all")

// Every pair the current component is part of, whatever the evidence.
const pairRows = computed<PairRow[]>(() => {
  const me = current.value
  const rows = new Map<string, PairRow>()
  const get = (other: string): PairRow => {
    let row = rows.get(other)
    if (!row) {
      row = { name: other, label: shortName(other), to: `/views/components/${other}` }
      rows.set(other, row)
    }
    return row
  }
  const outgoing = new Set<string>(), incoming = new Set<string>()
  for (const r of data.value.direct) {
    const other = r.from === me ? r.to : r.from
    if (other === me) continue
    const row = get(other)
    row.references = (row.references ?? 0) + (Number(r.references) || 0)
    if (r.from === me) outgoing.add(other); else incoming.add(other)
  }
  if (hasIndirect.value) {
    for (const r of data.value.indirect) {
      const other = r.from === me ? r.to : r.from
      if (other === me) continue
      const row = get(other)
      row.hops = row.hops === undefined || row.hops === null ? Number(r.hops) : Math.min(Number(row.hops), Number(r.hops))
    }
  }
  for (const r of data.value.matrix) {
    const other = r.from === me ? r.to : r.from
    if (other === me) continue
    const row = get(other)
    row.similarity = r.linguistic_similarity
    row.pathDistance = r.path_distance
    if (r.git_co_changes !== null && r.git_co_changes !== undefined) row.sharedCommits = Number(r.git_co_changes)
  }
  for (const r of data.value.shared) {
    const other = r.pair_1 === me ? r.pair_2 : r.pair_1
    if (other === me) continue
    const row = get(other)
    row.sharedCommits = Number(r.shared_commits) || 0
    const pct = r.pair_1 === me ? r.percentage_of_all_commits_pair_1 : r.percentage_of_all_commits_pair_2
    if (pct !== null && pct !== undefined) row.coChangeRate = Number(pct) > 1 ? Number(pct) / 100 : Number(pct)
  }
  for (const row of rows.values()) {
    const out = outgoing.has(row.name), inc = incoming.has(row.name)
    row.group = out && inc ? "both" : out ? "uses" : inc ? "used by" : "other"
  }
  let list = Array.from(rows.values())
  if (relation.value === "other") list = list.filter(r => r.group === "other")
  else if (relation.value === "depends on") list = list.filter(r => r.group === "uses" || r.group === "both")
  else if (relation.value === "is depended on by") list = list.filter(r => r.group === "used by" || r.group === "both")
  return list
})

const centreStats = computed(() => {
  const c: any = store.allComponentsIndex.get(current.value)
  const num = (k: string) => { const v = Number(c?.[k]); return Number.isFinite(v) ? v : null }
  const def = (k: string) => store.definitions.get(k)?.short_description || ""
  return [
    { label: "Afferent", title: def("modularity__coupling__afferent"), value: num("modularity__coupling__afferent") === null ? "—" : formatNumber(num("modularity__coupling__afferent")) },
    { label: "Efferent", title: def("modularity__coupling__efferent"), value: num("modularity__coupling__efferent") === null ? "—" : formatNumber(num("modularity__coupling__efferent")) },
    { label: "Instability", title: def("modularity__instability"), value: num("modularity__instability") === null ? "—" : (num("modularity__instability") as number).toFixed(2) },
    { label: "Lines", title: def("complexity__lines"), value: num("complexity__lines") === null ? "—" : formatNumber(num("complexity__lines")) },
  ]
})
</script>
