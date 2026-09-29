
<template>
  <div class="flex flex-col">
    <div class="w-full overflow-x-auto">
      <table class="ui-table">
        <thead>
        <tr>
          <th class="w-8" v-if="selectableElements">
            <Checkbox :model-value="selectedElements && selectedElements.length === limitedElements.length"
                      @update:model-value="toggleSelectAll" aria-label="Select all"/>
          </th>
          <th class="cursor-pointer select-none hover:text-neutral-900" @click="toggleSort('name')">
            <span class="inline-flex items-center gap-1">{{ nameColumn }}<Icon v-if="sortSettings.column === 'name'" :icon="sortSettings.ascending ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
          </th>
          <th v-if="showGroups">Groups</th>
          <th v-for="column in columns" :key="column.name"
              class="cursor-pointer select-none text-right hover:text-neutral-900"
              :class="[instrumented ? 'is-instrumented' : '', sortSettings.column === column.name ? 'text-neutral-900' : '']"
              :aria-sort="sortSettings.column === column.name ? (sortSettings.ascending ? 'ascending' : 'descending') : undefined"
              @click="toggleSort(column.name)">
            <span class="inline-flex items-center gap-1"><MetricHint :id="column.name" :focusable="false">{{ niceName(column.name) }}</MetricHint><Icon v-if="sortSettings.column === column.name" :icon="sortSettings.ascending ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
            <!-- How the column is spread across every row; the hovered row's bin is inked. -->
            <span v-if="instrumented && stats.get(column.name)" class="mt-1 flex h-3.5 items-end gap-px" :title="spreadTitle(column.name)" aria-hidden="true">
              <span v-for="(h, i) in stats.get(column.name)!.bins" :key="i"
                    class="min-w-[2px] flex-1 rounded-[1px]"
                    :class="hoveredBin(column.name) === i ? 'bg-neutral-900' : sortSettings.column === column.name ? 'bg-neutral-400' : 'bg-neutral-300'"
                    :style="{ height: h === 0 ? '0' : `${Math.max(12, h * 100)}%` }"></span>
            </span>
          </th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="element in pageOfElements" :key="element.name"
            :class="{ 'is-clickable': clickableElements, 'is-selected': selectedElements.indexOf(element.name) !== -1 }"
            @mouseenter="hoveredRow = element"
            @mouseleave="hoveredRow = null"
            @click="clickableElements ? emit('clicked-element', element) : checkboxToggle(element.name)">
          <td v-if="selectableElements" @click.stop="checkboxToggle(element.name)">
            <Checkbox :model-value="selectedElements.indexOf(element.name) !== -1"/>
          </td>
          <td v-if="instrumented && element.name !== '.' && element.name" class="max-w-[420px] truncate font-mono text-sm" :title="String(element.name)"><span class="text-neutral-400">{{ splitName(String(element.name)).head }}</span><span class="font-medium text-neutral-900">{{ splitName(String(element.name)).tail }}</span></td>
          <td v-else class="max-w-[420px] truncate font-mono text-sm font-medium text-neutral-900" :title="String(element.name)">{{ element.name === "." ? `${rootLabel} (root)` : element.name || "unknown" }}</td>
          <td v-if="showGroups">
            <div class="flex flex-wrap gap-1">
              <span v-for="g in getElementGroups(element.name)" :key="g.id" class="ui-tag text-white" :style="{ backgroundColor: g.color }">{{ g.name }}</span>
            </div>
          </td>
          <template v-if="instrumented">
            <td v-for="column in columns" :key="column.name" class="is-num is-bar text-right" :title="String(element[column.name] ?? '')">
              <span v-if="barWidth(column.name, element) > 0" class="bar" :class="{ 'is-sorted': sortSettings.column === column.name }" :style="{ width: `${barWidth(column.name, element)}%` }" aria-hidden="true"></span>
              <span class="relative inline-flex items-center gap-1.5">
                <span v-if="levelOf(column.name, element) !== null" class="h-1.5 w-1.5 shrink-0 rounded-full" :class="levelDotClass(levelOf(column.name, element)!)" aria-hidden="true"></span>
                <span :class="isMissing(column.name, element) ? 'text-neutral-400' : ''">{{ isMissing(column.name, element) ? "—" : formatReading(element[column.name]) }}</span>
              </span>
            </td>
          </template>
          <td v-else v-for="column in columns" :key="column.name" class="is-num text-right" :title="String(element[column.name] ?? '')">{{ formatReading(element[column.name]) }}</td>
        </tr>
        <tr v-if="pageOfElements.length === 0">
          <td :colspan="columns.length + 1 + (selectableElements ? 1 : 0) + (showGroups ? 1 : 0)" class="h-20 text-center text-neutral-500">{{ emptyText }}</td>
        </tr>
        </tbody>
      </table>
    </div>
    <div v-if="totalPages > 1" class="mt-3 flex items-center justify-end gap-2 text-sm text-neutral-500">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="currentPage <= 1" aria-label="Previous page" @click="goToPage(currentPage - 1)">
        <Icon :size="14" icon="chevron-left"/>
      </button>
      <span class="font-mono tabular-nums">{{ currentPage }} / {{ totalPages }}</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="currentPage >= totalPages" aria-label="Next page" @click="goToPage(currentPage + 1)">
        <Icon :size="14" icon="chevron-right"/>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import {formatReading} from "~/shared/format";
import {useWorkspacesStore} from "~/features/workspace/workspaces.store";
import {Component, computed, ComputedRef, defineProps, Ref, ref, watch} from "vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import MetricHint from "~/features/snapshot/components/MetricHint.vue";
import Icon from "~/shared/ui/Icon.vue";
import {useGroupsStore} from "~/features/groups/groups.store";
import {useDataStore} from "~/features/snapshot/data.store";
import {useExportables} from "~/features/export/useExportables";
import {binOf, histogram, metricValue, splitName} from "~/features/metrics/plotReading";
import {healthLevel, hotspotLevel, levelDotClass, type HealthLevel} from "~/features/metrics/useHealth";

const dataStore = useDataStore()
function niceName(column: string): string {
  return dataStore.statNiceName(column) || column
}

type Key = string | number;

interface Element {
  name: Key,

  [key: string | symbol]: any
}

const props = defineProps({
  nameColumn: {
    type: String,
    default: "Name"
  },
  limit: {
    type: Number,
    default: -1
  },
  clickableElements: {
    type: Boolean,
    default: false
  },
  selectableElements: {
    type: Boolean,
    default: true
  },
  elements: {
    type: Array as () => Element[],
    required: true
  },
  maxPageSize: {
    type: Number,
    default: 20
  },
  selectedElements: {
    type: Array as () => Key[],
    default: () => [],
  },
  onlyShowColumns: {
    type: Array as () => string[],
  },
  showGroups: {
    type: Boolean,
    default: false,
  },
  emptyText: {
    type: String,
    default: "Nothing matches.",
  },
  /** The column the table opens sorted by, largest first; the name column sorts A to Z. */
  initialSort: {
    type: String,
    default: "name",
  },
  /** Registers the table with the Export menu under this title: every row, in the table's sort. */
  exportTitle: {
    type: String,
    default: "",
  },
  /**
   * Reads as an instrument: names dim the path they live under, every number
   * sits on a bar scaled to its column's largest, health and hotspot scores
   * carry their level dot, and each header shows how its column is spread.
   */
  instrumented: {
    type: Boolean,
    default: false,
  },
})

const rootLabel = computed(() => useWorkspacesStore().active?.name ?? "project")

const groupsStore = useGroupsStore()

function getElementGroups(name: string) {
  const cGroups = groupsStore.componentGroupIndex.get(name) || []
  const fGroups = groupsStore.fileGroupIndex.get(name) || []
  return [...cGroups, ...fGroups]
}

const correctedLimit = computed(() => {
  if (props.limit <= 0) {
    return -1
  }
  return props.limit
})

const emit = defineEmits(["update:selected-elements", "clicked-element"])

const sortSettings = ref({
  column: props.initialSort,
  ascending: props.initialSort === "name",
})

const currentPage = ref(1)

const allElements: ComputedRef<Element[]> = computed(() => {
  return props.elements
})

const sortedElements = computed(() => {
  return [...allElements.value].sort((a, b) => {
    const aValue = a[sortSettings.value.column]
    const bValue = b[sortSettings.value.column]
    const multiplier = sortSettings.value.ascending ? 1 : -1
    if (aValue < bValue) {
      return -1 * multiplier
    } else if (aValue > bValue) {
      return 1 * multiplier
    } else {
      return 0
    }
  })
})

const limitedElements = computed(() => {
  if (correctedLimit.value <= 0) {
    return sortedElements.value
  }
  return sortedElements.value.slice(0, correctedLimit.value)
})
const elementLookup: ComputedRef<Map<Key, Element>> = computed(() => {
  const toReturn = new Map<Key, Element>()
  allElements.value.forEach(element => {
    toReturn.set(element.name, element)
  })
  return toReturn
})

watch(allElements, () => {
  goToPage(1)
})

const columns = computed(() => {
  if (props.onlyShowColumns) {
    return props.onlyShowColumns.map(column => ({
      name: column,
      type: typeof column,
    }))
  }
  const exampleElement = limitedElements.value[0];

  if (!exampleElement) return []
  return Object.keys(exampleElement).filter(column => column !== "timestamp"
      && column !== "report_id"
      && column !== "name"
      && typeof exampleElement[column] !== 'object'
      && typeof exampleElement[column] !== 'array').map(
      column => ({
        name: column,
        type: typeof column,
      })
  )
})

const pageOfElements = computed(() => {
  const pageSize = props.maxPageSize
  const page = currentPage.value - 1
  return limitedElements.value

      .slice(page * pageSize, (page + 1) * pageSize)
})

const totalPages = computed(() => {
  const pageSize: number = props.maxPageSize
  return Math.ceil(limitedElements.value.length / pageSize)
})

function checkboxToggle(element: Key) {
  if (props.selectedElements.indexOf(element) === -1) {
    setSelection([...props.selectedElements, element])
  } else {
    setSelection(props.selectedElements.filter(name => name !== element))
  }
}

function setSelection(selection: Key[]) {
  const available = new Set(elementLookup.value.keys())
  const selectionSet = new Set(selection)

  const newSelection = intersect(available, selectionSet);
  emit("update:selected-elements", newSelection)
}

function intersect(a: Set<Key>, b: Set<Key>): Key[] {
  const result = new Set<Key>()
  a.forEach(name => {
    if (b.has(name)) {
      result.add(name)
    }
  })
  return Array.from(result)
}

function toggleSort(column: string) {
  if (sortSettings.value.column === column) {
    sortSettings.value.ascending = !sortSettings.value.ascending
  } else {
    sortSettings.value.column = column
    sortSettings.value.ascending = column === "name"
  }
}

function toggleSelectAll() {
  if (props.selectedElements.length === limitedElements.value.length) {
    setSelection([])
  } else {
    setSelection(limitedElements.value.map(element => element.name))
  }
}

if (props.exportTitle) {
  useExportables().register({
    kind: "table",
    get title() { return props.exportTitle },
    rows: () => limitedElements.value.map(e => {
      const row: Record<string, unknown> = { name: e.name, ...Object.fromEntries(columns.value.map(c => [c.name, e[c.name]])) }
      if (props.showGroups) row.groups = getElementGroups(String(e.name)).map(g => g.name).join("; ")
      return row
    }),
    columns: () => [
      { id: "name", label: props.nameColumn },
      ...(props.showGroups ? [{ id: "groups", label: "Groups" }] : []),
      ...columns.value.map(c => ({ id: c.name, label: niceName(c.name) })),
    ],
  })
}

// ─── Instrumented readings ───
const BINS = 16
const hoveredRow = ref<Element | null>(null)

const stats = computed(() => {
  const out = new Map<string, { min: number; max: number; bins: number[]; median: number; count: number }>()
  if (!props.instrumented) return out
  for (const column of columns.value) {
    const values = limitedElements.value.map(e => metricValue(e, column.name)).filter(v => Number.isFinite(v))
    // Text columns (a file's component) carry no spread.
    if (values.length === 0 || values.length < limitedElements.value.length * 0.5) continue
    const sorted = [...values].sort((a, b) => a - b)
    const min = Math.min(0, sorted[0]), max = sorted[sorted.length - 1]
    const counts = histogram(values, BINS, min, max)
    const peak = Math.max(1, ...counts)
    out.set(column.name, { min, max, bins: counts.map(c => Math.sqrt(c / peak)), median: sorted[Math.floor(sorted.length / 2)], count: values.length })
  }
  return out
})

function spreadTitle(column: string): string {
  const s = stats.value.get(column)
  if (!s) return ""
  return `${s.count} values · median ${formatReading(s.median)} · largest ${formatReading(s.max)}`
}

function hoveredBin(column: string): number | null {
  const s = stats.value.get(column)
  const row = hoveredRow.value
  if (!s || !row) return null
  const v = metricValue(row, column)
  return Number.isFinite(v) ? binOf(v, BINS, s.min, s.max) : null
}

function isMissing(column: string, element: Element): boolean {
  return stats.value.has(column) && !Number.isFinite(metricValue(element, column))
}

function barWidth(column: string, element: Element): number {
  const s = stats.value.get(column)
  if (!s || s.max <= 0) return 0
  const v = metricValue(element, column)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.max(2, Math.min(100, (v / s.max) * 100))
}

function levelOf(column: string, element: Element): HealthLevel | null {
  if (column === "codesmells__code_health") return healthLevel(element[column])
  if (column === "codesmells__hotspot_score") return hotspotLevel(element[column])
  return null
}

function goToPage(page: number) {
  currentPage.value = Math.max(Math.min(page, totalPages.value), 1)
}

</script>

<style scoped>
/* A header over a spread wraps its label rather than widen the table. */
.ui-table th.is-instrumented {
  height: auto;
  min-width: 72px;
  max-width: 128px;
  padding-top: 6px;
  padding-bottom: 6px;
  vertical-align: bottom;
  white-space: normal;
  line-height: 16px;
}
.ui-table td.is-bar {
  position: relative;
}
.ui-table td.is-bar .bar {
  position: absolute;
  right: 4px;
  top: 5px;
  bottom: 5px;
  max-width: calc(100% - 8px);
  border-radius: 2px;
  background: rgb(var(--c-neutral-200) / 0.45);
  pointer-events: none;
}
.ui-table td.is-bar .bar.is-sorted {
  background: rgb(var(--c-neutral-200));
}
.ui-table tbody tr:hover td.is-bar .bar {
  background: rgb(var(--c-neutral-300) / 0.7);
}
</style>
