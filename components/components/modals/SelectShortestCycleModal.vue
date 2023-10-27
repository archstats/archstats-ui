<template>
  <Card class="w-2/3 mt-24 bg-white">
    <div class="px-4 mt-8 mb-12">
      <input class="w-full px-4 py-2 bg-gray-100  box-border outline-archstats-900 outline-1 rounded"
             v-model="searchText" placeholder="Search..." @keyup.esc="closeModal">

    </div>
    <div class="h-[512px]">
      <ElementTable v-if="filteredCycles.length" @clicked-element='select' :selectable-elements="false"
                    :clickable-elements="true" :max-page-size="12"
                    :elements="filteredCycles"/>
      <div v-else class="flex justify-center items-center h-96">
        <p class="text-archstats-900">No components found</p>
      </div>
    </div>

  </Card>
</template>
<script lang="ts" setup>

import {useDataStore} from "~/stores/data";
import {RawComponent} from "~/utils/components";
import Card from "~/components/ui/card/Card.vue";
import {closeModalKey} from "~/utils/modal";
import ElementTable from "~/components/ui/tables/ElementTable.vue";

interface Cycle {
  name: number,
  cycle_size: number,
  cycle: string
}

const store = useDataStore()
const props = defineProps<{}>()

const cycles = computed(() => {
  return store.query(`
    select distinct cycle_nr as name, cycle_size, cycle
    from component_cycles_shortest
  `) as Cycle[]
})
const closeModal = inject(closeModalKey)

const emit = defineEmits(['cycle-selected'])

const searchText = ref("")

const filteredCycles = computed(() => {
  if (searchText.value.length < 3) {
    return cycles.value
  }
  // filter with regex
  const regex = new RegExp(searchText.value, "i")
  return cycles.value.filter(c => regex.test(c.cycle))
})

function select(component: RawComponent) {
  emit('cycle-selected', component)
  closeModal?.()
}
</script>
