<template>
  <div class="w-full overflow-x-scroll">
    <table class="mb-4">
      <thead>
      <tr>
        <th class="px-2 py-1  h-full justify-center" v-if="selectableElements">
          <div class="flex gap-2 align-middle justify-center">
            <input type="checkbox" :checked="selectedElements && selectedElements.length === allElements.length"
                   @change="toggleSelectAll">
          </div>
        </th>
        <th class="py-1 px-2 text-left cursor-pointer hover:text-archstats-tertiary-500" @click="toggleSort('name')">Name <span
            v-if="sortSettings.column === 'name'"
            v-html="sortSettings.ascending ? '&#8593':'&#8595'"></span>
        </th>
        <th class="py-1 px-2 cursor-pointer cursor-pointer hover:text-archstats-tertiary-500 text-left" v-for="column in columns"
            @click="toggleSort(column.name)"><span>{{
            column.name
          }}</span><span v-if="sortSettings.column === column.name"
                         v-html="sortSettings.ascending ? '&#8593':'&#8595'"></span></th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="element in pageOfElements" class="hover:bg-archstats-tertiary-50" :class="{'cursor-pointer': clickableElements}"
          @click="emit('clicked-element', element)">
        <td v-if="selectableElements" class="px-2"><input type="checkbox"
                                                          :checked="selectedElements.indexOf(element.name) !== -1"
                                                          @click="checkboxToggle(element.name)"></td>
        <td class="py-1 px-2 font-semibold py-1 px-2">{{ element.name || "unknown" }}</td>

        <td v-for="column in columns" class="py-1 px-2 " nowrap>{{ round(element[column.name], 5) }}</td>

      </tr>
      </tbody>
    </table>
  </div>
  <div class="mt-8 flex justify-center">
    <button class="mr-2 font-bold" @click="goToPage(currentPage - 1)">&lt;</button>
    <span>{{ currentPage }}</span> / <span>{{ totalPages }}</span>
    <button class="ml-2 font-bold" @click="goToPage(currentPage + 1)">&gt;</button>

  </div>
</template>
<script setup lang="ts">
import {round} from "~/utils/text";
import {Component, computed, ComputedRef, defineProps, Ref, ref, watch} from "vue";

interface Element {
  name: string,

  [key: string | symbol]: any
}

const props = defineProps({
  columnRenderers: {
    type: Object as () => { [column: string]: (data: number|string) => Component },
    default: () => ({})
  },
  clickableElements: {
    type: Boolean,
    default: true
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
    type: Array as () => string[],
    default: () => [],
  }
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

const elementLookup: ComputedRef<{
  [key: string]: Element
}> = computed(() => {
  return allElements.value.reduce((acc: { [key: string]: Element }, element) => {
    acc[element.name] = element
    return acc
  }, {})
})

watch(allElements, () => {
  goToPage(1)
})

const columns = computed(() => {
  const exampleElement = allElements.value[0];

  if(!exampleElement) return []
  return Object.keys(exampleElement).filter(column => column !== "timestamp" && column !== "report_id" && column !== "name" && typeof exampleElement[column] === 'string' || typeof exampleElement[column] === 'number').map(
      column => ({
        name: column,
        type: typeof column,
      })
  )
})

const pageOfElements = computed(() => {
  const pageSize = props.maxPageSize
  const page = currentPage.value - 1
  return allElements.value
      .sort((a, b) => {
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
      }).slice(page * pageSize, (page + 1) * pageSize)
})

const totalPages = computed(() => {
  const pageSize: number = props.maxPageSize
  return Math.ceil(allElements.value.length / pageSize)
})

function checkboxToggle(element: string) {
  if (props.selectedElements.indexOf(element) === -1) {
    setSelection([...props.selectedElements, element])
  } else {
    setSelection(props.selectedElements.filter(name => name !== element))
  }
}

function setSelection(selection: string[]) {
  const available = new Set(Object.keys(elementLookup.value))

  emit("update:selected-elements", intersect(available, new Set(selection)))
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  const result = new Set<string>()
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

// TODO fix this
function toggleSelectAll() {
  if (props.selectedElements.length === allElements.value.length) {
    setSelection([])
  } else {
    setSelection(allElements.value.map(element => element.name))
  }
}

function goToPage(page: number) {
  currentPage.value = Math.max(Math.min(page, totalPages.value), 1)
}

interface Column {
  name: string
  type: string
}

</script>
