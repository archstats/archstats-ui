<template>
  <div class="flex h-full min-h-0 flex-col">
    <LoadingState v-if="loading" :text="loadingText"/>
    <EmptyState v-else-if="rows.length === 0" :title="emptyTitle" :text="emptyText" icon="network"/>
    <template v-else>
      <div class="min-h-0 grow overflow-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="min-w-[160px] cursor-pointer select-none hover:text-neutral-900" @click="toggleSort('name')">
                <span class="inline-flex items-center gap-1">{{ nameLabel }}<Icon v-if="sort.column === 'name'" :icon="sort.ascending ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
              </th>
              <th v-if="hasGroup" class="whitespace-nowrap">{{ groupLabel }}</th>
              <th v-for="col in activeColumns" :key="col.key" class="cursor-pointer select-none text-right hover:text-neutral-900" :title="col.title" @click="toggleSort(col.key)">
                <span class="inline-flex items-center gap-1">{{ col.label }}<Icon v-if="sort.column === col.key" :icon="sort.ascending ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pageRows"
              :key="row.name"
              class="group"
              :class="{ 'is-clickable': !!row.to, 'is-selected': selected?.has(row.name) }"
              @click="onRowClick($event, row)"
            >
              <td class="min-w-[160px] max-w-0">
                <span class="flex min-w-0 items-center gap-2">
                  <router-link v-if="row.to" :to="row.to" class="min-w-0 truncate font-mono text-sm text-neutral-900 hover:underline" :title="row.name" @click.stop>{{ row.label ?? row.name }}</router-link>
                  <span v-else class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="row.name">{{ row.label ?? row.name }}</span>
                  <button
                    v-if="inspectable"
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet -my-1 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    :class="{ 'opacity-100': inspecting === row.name }"
                    :title="`Why are these two connected?`"
                    :aria-label="`Evidence for ${row.name}`"
                    @click.stop="emit('inspect', row.name)"
                  >
                    <Icon icon="focus" :size="13"/>
                  </button>
                </span>
              </td>
              <td v-if="hasGroup" class="whitespace-nowrap">
                <router-link v-if="row.groupTo" :to="row.groupTo" class="text-neutral-600 hover:text-neutral-900 hover:underline" @click.stop>{{ row.group }}</router-link>
                <span v-else class="text-neutral-600">{{ row.group }}</span>
              </td>
              <td v-for="col in activeColumns" :key="col.key" class="is-num text-right">{{ col.format(row[col.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex h-9 shrink-0 items-center justify-between px-4 text-sm text-neutral-500 hairline-t">
        <span class="flex items-center gap-1"><span><span class="font-mono text-neutral-700">{{ formatNumber(rows.length) }}</span> {{ rows.length === 1 ? 'pair' : 'pairs' }}</span>
          <TableExportMenu :title="exportTitle || nameLabel + ' pairs'" :columns="exportColumns" :rows="exportRows"/></span>
        <div v-if="totalPages > 1" class="flex items-center gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="page <= 1" aria-label="Previous page" @click="page--"><Icon icon="chevron-left" :size="14"/></button>
          <span class="font-mono tabular-nums">{{ page }} / {{ totalPages }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="page >= totalPages" aria-label="Next page" @click="page++"><Icon icon="chevron-right" :size="14"/></button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import TableExportMenu from "~/components/ui/TableExportMenu.vue";
import { formatNumber } from "~/utils/format";

// A ranked list of "this unit against that unit" with whichever weights the
// data has. One table serves component pairs, file pairs and coupling
// partners; columns appear only when at least one row carries the value.
export interface PairRow {
  name: string
  label?: string
  to?: string
  group?: string
  groupTo?: string
  references?: number | null
  sharedCommits?: number | null
  coChangeRate?: number | null
  similarity?: number | null
  pathDistance?: number | null
  hops?: number | null
  [key: string]: any
}

const props = withDefaults(defineProps<{
  rows: PairRow[]
  loading?: boolean
  loadingText?: string
  nameLabel?: string
  /** The title an exported copy carries. */
  exportTitle?: string
  groupLabel?: string
  emptyTitle?: string
  emptyText?: string
  pageSize?: number
  defaultSort?: string
  /** Rows in a selection the owner may turn into a group; shift or cmd-click toggles. */
  selected?: Set<string>
  /** Adds a per-row action that reports the row rather than opening it. */
  inspectable?: boolean
  /** The row whose evidence is on screen, kept visible while it is. */
  inspecting?: string | null
}>(), {
  inspectable: false,
  inspecting: null,
  loading: false,
  loadingText: "Reading pairs…",
  nameLabel: "Name",
  groupLabel: "Component",
  emptyTitle: "No pairs",
  emptyText: "",
  pageSize: 50,
  defaultSort: "",
})

import { useRouter } from "vue-router"
const router = useRouter()
const emit = defineEmits<{ (e: "toggle", name: string): void; (e: "inspect", name: string): void }>()

function onRowClick(event: MouseEvent, row: PairRow) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) { emit("toggle", row.name); return }
  if (row.to) router.push(row.to)
}

const columns = [
  { key: "references", label: "Refs", title: "Import references between the two", format: (v: any) => formatNumber(v, 0) },
  { key: "hops", label: "Hops", title: "Shortest dependency path length", format: (v: any) => formatNumber(v, 0) },
  { key: "sharedCommits", label: "Shared", title: "Commits that touched both", format: (v: any) => formatNumber(v, 0) },
  { key: "coChangeRate", label: "Co-change", title: "Share of this unit's commits that also touched the other", format: (v: any) => (v === null || v === undefined) ? "—" : `${Math.round(Number(v) * 100)}%` },
  { key: "similarity", label: "Similarity", title: "Linguistic similarity of the names inside (0–1)", format: (v: any) => (v === null || v === undefined) ? "—" : Number(v).toFixed(2) },
  { key: "pathDistance", label: "Path", title: "Directory distance between the two", format: (v: any) => (v === null || v === undefined || Number(v) < 0) ? "—" : formatNumber(v, 0) },
]

// A column earns its width only when some row has something to say in it: a
// project where every pair scores 0.00 similarity should not spend a column
// saying so 1,017 times.
const activeColumns = computed(() => columns.filter(col => props.rows.some(r => {
  const v = r[col.key]
  return v !== undefined && v !== null && Number(v) !== 0
})))
const hasGroup = computed(() => props.rows.some(r => r.group))

const sort = ref({ column: props.defaultSort || (activeColumns.value[0]?.key ?? "name"), ascending: false })
watch(activeColumns, cols => {
  if (!cols.some(c => c.key === sort.value.column) && sort.value.column !== "name") {
    sort.value = { column: props.defaultSort || (cols[0]?.key ?? "name"), ascending: false }
  }
})

function toggleSort(column: string) {
  if (sort.value.column === column) {
    sort.value.ascending = !sort.value.ascending
  } else {
    sort.value = { column, ascending: column === "name" }
  }
}

const sortedRows = computed(() => {
  const { column, ascending } = sort.value
  const dir = ascending ? 1 : -1
  return [...props.rows].sort((a, b) => {
    if (column === "name") return a.name.localeCompare(b.name) * dir
    const av = a[column], bv = b[column]
    const an = (av === null || av === undefined) ? Number.NEGATIVE_INFINITY : Number(av)
    const bn = (bv === null || bv === undefined) ? Number.NEGATIVE_INFINITY : Number(bv)
    if (an === bn) return a.name.localeCompare(b.name)
    return (an - bn) * dir
  })
})

const page = ref(1)
watch(() => props.rows, () => { page.value = 1 })
const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / props.pageSize)))
const exportColumns = computed(() => [
  { id: "name", label: props.nameLabel },
  ...(hasGroup.value ? [{ id: "group", label: props.groupLabel }] : []),
  ...activeColumns.value.map(c => ({ id: c.key, label: c.label })),
])
const exportRows = computed(() => sortedRows.value.map(r => ({ ...r, name: r.name })))
const pageRows = computed(() => sortedRows.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
</script>
