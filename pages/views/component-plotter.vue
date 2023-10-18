<template>
  <SimplePage>
    <Headline>Component Plotter</Headline>
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

    <ComponentPlotterDiagram :components="store.currentComponentScope"
                             :x-axis-property="xAxisProperty"
                             :y-axis-property="yAxisProperty"
                             :radius-property="radiusProperty"
    ></ComponentPlotterDiagram>

  </SimplePage>
</template>
<script setup lang="ts">
import SimplePage from "~/components/ui/SimplePage.vue";
import Headline from "~/components/ui/Headline.vue";
import {useDataStore} from "~/stores/data";
import ComponentPlotterDiagram from "~/components/views/plotter/ComponentPlotterDiagram.vue";
import Checkbox from "~/components/ui/Checkbox.vue";
import {computed} from "vue";

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const store = useDataStore();

const xAxisProperty = ref("line_count")
const yAxisProperty = ref("line_count")
const radiusProperty = ref("line_count")

const distinctStats = computed(() => {
  const properties: { [key: string]: boolean } = {}
  store.currentComponentScope.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => !["report_id", "report_timestamp"].includes(k))
})
</script>