<template>

  <SimplePage>

    <Headline>{{ component.name }}</Headline>

    <section>
      <InfoTable :component="component"></InfoTable>
    </section>

    <section class="mt-20">
      <div class="">

        <Headline class="text-xl mb-4 it">Files</Headline>

        <div class="flex items-center gap-2">
          <label class="text-archstats-500">Columns</label>
          <MultiSelect :options="distinctStatsForFiles" limit="" v-model="selectedStatsForFiles" placeholder=""/>

        </div>

      </div>
      <div class="w-full">
        <ElementTable :elements="files"
                      :only-show-columns="selectedStatsForFiles"
                      :selectable-elements="false"
                      v-model:selected-elements="selectedCycles"
                      class="w-full"></ElementTable>
      </div>
    </section>

    <section class="mt-20">

      <div class="flex mt-4 h-full ">
        <div class="w-1/2  h-full">
          <Headline class="text-xl mb-2">Shortest Cycles</Headline>
          <p class="text-gray-500"><span class="font-mono text-archstats-800">{{ component.name }}</span> is part of
            <span class="text-archstats-800">{{ cyclesIncludedIn.length }}</span>+ short cycles.</p>
          <ElementTable class="mt-4 mb-20 h-[500px]" v-model:selected-elements="selectedCycles"
                        :selectable-elements="true"
                        :max-page-size="12"
                        :elements="cyclesIncludedIn"></ElementTable>
        </div>
        <div v-if="selectedCycleGraph" class="items-center w-full">
          <ConnectionChart class="h-full" :components="selectedCycleGraph" relative-size="line_count"
                           :connections="[]"/>
        </div>
      </div>
    </section>




  </SimplePage>

</template>

<script setup lang="ts">

import {useDataStore} from "~/stores/data";
import SimplePage from "~/components/ui/common/SimplePage.vue";
import Headline from "~/components/ui/common/Headline.vue";
import {Component} from "~/utils/components";
import InfoTable from "~/components/ui/tables/InfoTable.vue";
import ElementTable from "~/components/ui/tables/ElementTable.vue";
import {findCommonPrefix} from "#imports";
import ConnectionChart from "~/components/components/ConnectionChart.vue";
import Comparison from "~/pages/views/components/comparison.vue";
import ComponentComparisonView from "~/components/components/comparison/ComponentComparisonView.vue";
import MultiSelect from "~/components/ui/common/MultiSelect.vue";

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ],
})
const route = useRoute();
const store = useDataStore();

const nameInRoute = computed(() => route.params.name as string);

const component = computed<Component>(() => store.allComponents.find(c => c.name === nameInRoute.value)!)

const files = computed(() => {
  const files = store.query(`
    SELECT *
    FROM files
    WHERE component = '${component.value.name}'
  `) as {
    name: string,
    [key: string]: any
  }[];

  const fileNames = files.map(f => f.name)

  const dir = findCommonPrefix(fileNames)

  return files.map(f => {
    return {
      ...f,
      name: f.name.replace(dir, "../")
    }
  })
})

interface Cycle {
  name: number,
  cycle_size: number,
  cycle: string
}

const cyclesIncludedIn = computed(() => {
  const cycles = store.query(`
    SELECT distinct cycle_nr as name, cycle_size, cycle
    FROM component_cycles_shortest
    WHERE component = '${component.value.name}'
  `) as Cycle[];

  return cycles
})

const cycleIndex = computed(() => {
  const toReturn = new Map<number, Cycle>()
  for (let i = 0; i < cyclesIncludedIn.value.length; i++) {
    const c = cyclesIncludedIn.value[i]
    toReturn.set(c.name, c)

  }
  return toReturn
})

const distinctStatsForFiles = computed(() => {
  const properties = {}
  files.value.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => k !== 'name')
})

const selectedStatsForFiles = ref<string[]>(distinctStatsForFiles.value)


function cycleToComponents(cycle: Cycle): string[] {
  if (!cycle) return []
  return cycle.cycle.split('->').map(c => c.trim())
}


const selectedCycles = ref<number[]>([])

const selectedCycleGraph = computed(() => {

  if (!selectedCycles.value) return null

  const cycles = new Array(selectedCycles.value.length)

  selectedCycles.value.forEach((c, i) => {
    cycles[i] = cycleIndex.value.get(c)
  })

  const components = new Set(cycles.flatMap(c => cycleToComponents(c)))


  return store.componentSubGraph(Array.from(components))
})
</script>

<style scoped>

</style>