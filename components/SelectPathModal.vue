<template>
  <Card class="w-2/3 mt-24 bg-white">
    <h1 class="text-lg ">Walk <span class="border-b-2 border-b-sky-500 inline-flex items-center gap-1">{{ column }}<Icon
        icon="pencil" :size="12"/></span> <span class="font-mono font-normal">{{ component }}</span></h1>
    <div class="mt-8 mb-12 flex">

      <input class="w-full px-4 py-2 bg-gray-100  box-border outline-sky-500 outline-1" v-model="searchText"
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

const column = computed(() => 'to')
const oppositeColumn = computed(() => column.value === 'from' ? 'to' : 'from')
const loadedComponents = computed(() => {
  const results = store.query(`
    SELECT "${oppositeColumn.value}" as name, shortest_path_length, shortest_path
    FROM component_connections_indirect
    where "${column.value}" = '${props.component}'
  `) as RawPath[]

  if (column.value === 'from')
    return results

  return results.map(r => {
    return {
      name: r.name,
      shortest_path_length: r.shortest_path_length,
      shortest_path: r.shortest_path.replaceAll('->', '<-'),
    }
  })
})
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
</script>