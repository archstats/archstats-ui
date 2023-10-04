<template>
  <Card class="w-2/3 mt-24 bg-white">
    <h1 class="text-lg ">Walk <span
        class="border-b-2  inline-flex items-center cursor-pointer gap-1 w-10 text-center justify-center"
        :class="{ 'text-archstats-tertiary-500': column == 'to','border-b-archstats-tertiary-500': column=='to',  'text-archstats-secondary-500': column == 'from', 'border-b-archstats-secondary-500': column=='from'}"
        @click="toggleDirection">{{ column }}</span> <span
        class="font-mono font-normal">{{ component }} <Icon class="inline"
                                                            :class="{ 'text-archstats-tertiary-500': column == 'to', 'text-archstats-secondary-500': column == 'from'}"
                                                            :icon="column == 'from' ? 'arrow-right-from-line' :'arrow-left-to-line'"
                                                            :size="20"/> <span class="font-mono italic font-light">&lsaquo;component(s)&rsaquo;</span></span>

    </h1>
    <div class="mt-8 mb-12 flex">

      <input class="w-full px-4 py-2 bg-gray-100  box-border outline-archstats-tertiary-500 outline-1" v-model="searchText"
             placeholder="Search..." @keyup.esc="closeModal">

    </div>
    <div class="h-[512px]">
      <ElementTable v-if="filteredComponents.length" @clicked-element='select' :selectable-elements="false"
                    :clickable-elements="true" :max-page-size="12"
                    :elements="filteredComponents"/>
      <div v-else class="flex justify-center items-center h-96">
        <p class="text-gray-500">No components found</p>
      </div>
    </div>

  </Card>
</template>
<script setup lang="ts">

import {useDataStore} from "~/stores/data";
import {RawComponent} from "~/utils/components";
import Card from "~/components/ui/Card.vue";
import useEmitter from "~/utils/useEmitter";
import {closeModalKey} from "~/utils/modal";
import {computed} from "vue";

const store = useDataStore()
const props = defineProps<{
  component: string
}>()

interface RawPath {
  name: string,
  shortest_path: string,
  shortest_path_length: number
}

const column = ref('from')
const oppositeColumn = computed(() => column.value === 'from' ? 'to' : 'from')
const loadedComponents = computed(() => {
  let query: string

  if (column.value === 'from') {
    query = `
      SELECT "to" as name, shortest_path_length, shortest_path
      FROM component_connections_indirect
      WHERE "from" = '${props.component}'
    `


  } else {
    query = `
      SELECT "from" as name, shortest_path_length, shortest_path
      FROM component_connections_indirect
      WHERE "to" = '${props.component}'
    `

  }
  const results = store.query(
      query
  ) as RawPath[]

  if (column.value === 'from')
    return results

  return results.map(r => {
    return {
      name: r.name,
      shortest_path_length: r.shortest_path_length,
      shortest_path: flipPath(r.shortest_path),
    }
  })
})

function flipPath(path: string): string {
  const nodes = path.split(' -> ');
  return nodes.reverse().join(' <- ');
}

const closeModal = inject(closeModalKey)

const emit = defineEmits(['path-selected'])

const searchText = ref("")

const filteredComponents = computed(() => {
  if (searchText.value.length < 2) {
    return loadedComponents.value
  }
  // filter with regex
  const regex = new RegExp(searchText.value, "i")
  return loadedComponents.value.filter(c => regex.test(c.name))
})

function select(path: RawPath) {
  emit('path-selected', path.shortest_path)
  closeModal?.()
}

function toggleDirection() {
  column.value = oppositeColumn.value
}
</script>
