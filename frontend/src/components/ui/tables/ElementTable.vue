
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
          <th class="cursor-pointer select-none text-right hover:text-neutral-900" v-for="column in columns" :key="column.name" @click="toggleSort(column.name)">
            <span class="inline-flex items-center gap-1" :title="column.name">{{ niceName(column.name) }}<Icon v-if="sortSettings.column === column.name" :icon="sortSettings.ascending ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
          </th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="element in pageOfElements" :key="element.name"
            :class="{ 'is-clickable': clickableElements, 'is-selected': selectedElements.indexOf(element.name) !== -1 }"
            @click="clickableElements ? emit('clicked-element', element) : checkboxToggle(element.name)">
          <td v-if="selectableElements" @click.stop="checkboxToggle(element.name)">
            <Checkbox :model-value="selectedElements.indexOf(element.name) !== -1"/>
          </td>
          <td class="max-w-[420px] truncate font-mono text-sm font-medium text-neutral-900" :title="String(element.name)">{{ element.name === "." ? `${rootLabel} (root)` : element.name || "unknown" }}</td>
          <td v-if="showGroups">
            <div class="flex flex-wrap gap-1">
              <span v-for="g in getElementGroups(element.name)" :key="g.id" class="ui-tag text-white" :style="{ backgroundColor: g.color }">{{ g.name }}</span>
            </div>
          </td>
          <td v-for="column in columns" :key="column.name" class="is-num text-right" :title="String(element[column.name] ?? '')">{{ formatReading(element[column.name]) }}</td>
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
import {formatReading} from "~/utils/format";
import {useWorkspacesStore} from "~/stores/workspaces";
import {Component, computed, ComputedRef, defineProps, Ref, ref, watch} from "vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import {useGroupsStore} from "~/stores/groups";
import {useDataStore} from "~/stores/data";

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

function goToPage(page: number) {
  currentPage.value = Math.max(Math.min(page, totalPages.value), 1)
}

</script>
