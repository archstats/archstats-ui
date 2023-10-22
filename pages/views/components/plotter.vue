<template>
  <div class="flex">
    <main class="h-screen w-full flex items-center justify-center px-20">
      <ComponentPlotterDiagram class="flex-grow"
                               :all-components="store.allComponents"
                               :componentsInScope="store.currentComponentScope"
                               :x-axis-property="xAxisProperty"
                               :y-axis-property="yAxisProperty"
                               :radius-property="radiusProperty"
                               :show-text="showText"
                               :selected-components="selectedComponents"
                               @components-selected="selectedComponents = $event;"

      />

    </main>
    <aside class="px-10 py-10 bg-archstats-100 h-screen">
      <Headline class="text-xl">Component Plotter</Headline>
      <div class="">

      </div>
      <div class="flex gap-2">
        <label>X-axis</label>
        <select v-model="xAxisProperty"
                class=" p-2 box-border bg-gray-100 border-tertiary-400 rounded border-2 outline-tertiary-700">
          <option v-for="stat in distinctStats" :key="stat" :value="stat">{{ stat }}</option>
        </select>

      </div>
      <div class="flex gap-2">
        <label>Y-axis</label>
        <select v-model="yAxisProperty"
                class=" p-2 box-border bg-gray-100 border-tertiary-400 rounded border-2 outline-tertiary-700">
          <option v-for="stat in distinctStats" :key="stat" :value="stat">{{ stat }}</option>
        </select>

      </div>

      <div class="flex gap-2">
        <label>Radius</label>

        <select v-model="radiusProperty"
                class=" p-2 box-border bg-gray-100 border-tertiary-400 rounded border-2 outline-tertiary-700">
          <option v-for="stat in distinctStats" :key="stat" :value="stat">{{ stat }}</option>
        </select>

      </div>
      <div class="flex gap-2 mt-2">
        <Checkbox v-model="showText" class="inline">Show names</Checkbox>
      </div>

      <div class="">
        <ArchstatsButton class="primary" @click="selectionToCurrentScope">Selection to current scope</ArchstatsButton>
      </div>
    </aside>

  </div>




</template>
<script setup lang="ts">
import SimplePage from "~/components/ui/SimplePage.vue";
import Headline from "~/components/ui/Headline.vue";
import {useDataStore} from "~/stores/data";
import ComponentPlotterDiagram from "~/components/views/plotter/ComponentPlotterDiagram.vue";
import Checkbox from "~/components/ui/Checkbox.vue";
import {computed} from "vue";
import ArchstatsButton from "~/components/ui/ArchstatsButton.vue";

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const store = useDataStore();
const showText = ref(false)
const xAxisProperty = ref("instability")
const yAxisProperty = ref("abstractness")
const radiusProperty = ref("line_count")
const selectedComponents = ref<RawComponent[]>([])

const distinctStats = computed(() => {
  const properties: { [key: string]: boolean } = {}
  store.currentComponentScope.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => !["report_id", "report_timestamp"].includes(k))
})

function selectionToCurrentScope() {
  console.log(selectedComponents.value)
  store.setCurrentScope(selectedComponents.value)
  selectedComponents.value = []
}
</script>