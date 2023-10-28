<template>
  <div class="flex flex-col justify-between">

    <div class="w-full overflow-x-scroll text-archstats-900">
      <table class="mb-4">
        <thead>
        <tr>
          <th class="px-2 py-1  h-full justify-center" v-if="selectableElements">
            <div class="flex gap-2 align-middle justify-center">
              <Checkbox :model-value="selectedElements && selectedElements.length === limitedElements.length"
                        @update:model-value="toggleSelectAll"/>
            </div>
          </th>
          <th class="py-1 px-2 text-left cursor-pointer hover:text-secondary-200 whitespace-nowrap"
              @click="toggleSort('name')">{{ nameColumn }} <span
              v-if="sortSettings.column === 'name'"
              v-html="sortSettings.ascending ? '&#8593':'&#8595'"></span>
          </th>
          <th class="py-1 px-2 cursor-pointer hover:text-secondary-500 text-left whitespace-nowrap"
              v-for="column in columns"
              @click="toggleSort(column.name)"><span>{{
              column.name
            }}</span><span v-if="sortSettings.column === column.name"
                           v-html="sortSettings.ascending ? '&#8593':'&#8595'"></span></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="element in pageOfElements" class="hover:bg-secondary-50"
            :class="{'cursor-pointer': clickableElements}"
            @click="clickableElements? emit('clicked-element', element) : checkboxToggle(element.name)">
          <td v-if="selectableElements" class="px-2">
            <Checkbox type="checkbox"
                      :model-value="selectedElements.indexOf(element.name) !== -1"
            />
          </td>
          <td class="py-1 px-2 font-semibold py-1 px-2">{{ element.name || "unknown" }}</td>

          <td v-for="column in columns" class="py-1 px-2 " nowrap>{{ round(element[column.name], 5) }}</td>

        </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-8 flex justify-center items-center">
      <button class="mr-2 font-bold hover:text-archstats-500 text-archstats-900" @click="goToPage(currentPage - 1)">
        <Icon :size="20" icon="chevron-left"/>
      </button>
      <div class=""><span>{{ currentPage }}</span> of <span>{{ totalPages }}</span></div>
      <button class="ml-2 font-bold hover:text-archstats-500 text-archstats-900" @click="goToPage(currentPage + 1)">
        <Icon :size="20" icon="chevron-right"/>
      </button>

    </div>
  </div>
</template>
<script setup lang="ts">
import {round} from "~/utils/text";
import {Component, computed, ComputedRef, defineProps, Ref, ref, watch} from "vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";

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
  }
})

const correctedLimit = computed(() => {
  if (props.limit <= 0) {
    return -1
  }
  return props.limit
})

const emit = defineEmits(["update:selected-elements", "clicked-element"])

const sortSettings = ref({
  column: "name",
  ascending: true
})

const currentPage = ref(1)

const allElements: ComputedRef<Element[]> = computed(() => {
  return props.elements
})

const sortedElements = computed(() => {
  return allElements.value.sort((a, b) => {
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
