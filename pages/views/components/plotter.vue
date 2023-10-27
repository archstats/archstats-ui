<template>
  <div class="flex flex-col">

    <div class="h-20 bg-archstats-50 flex px-16 gap-8 items-center">
      <ArchstatsButton class="primary h-fit" @click="selectionToCurrentScope">Selection to current scope
      </ArchstatsButton>
      <div class="flex items-center gap-2">
        <label class="text-archstats-500">X-axis</label>
        <SingleSelect v-model="xAxisProperty" :options="distinctStats" class="">
        </SingleSelect>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-archstats-500">Y-axis</label>
        <SingleSelect v-model="yAxisProperty" :options="distinctStats" class="">
        </SingleSelect>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-archstats-500">Radius</label>
        <SingleSelect v-model="radiusProperty" :options="distinctStats" placeholder="Select statistic" class="">
        </SingleSelect>
      </div>

      <Checkbox v-model="showText" class="inline">Show names</Checkbox>


    </div>
    <div class="flex px-16 py-5 bg-gray-200 gap-4 items-center overflow-x-auto">
      <div class="text-archstats-500">Presets:</div>


      <LongHover v-for="preset in presets"
                 :disabled="!preset.description"
                 :time="1000"
           @click="selectPreset(preset)"
           class="px-4 text-archstats-800 whitespace-nowrap py-1 cursor-pointer border border-archstats-500 transition-all bg-tertiary-50 rounded-full hover:bg-tertiary-100">
        {{ preset.name }}

        <template #hovered-content>
          <div class="fixed w-96  p-4 bg-black shadow z-[1000] rounded text-sm">
            <div class="text-white whitespace-normal">{{ preset.description }}</div>
          </div>
        </template>
      </LongHover>

    </div>

    <main class="flex-grow items-center justify-center px-20 mt-10">
      <ComponentPlotterDiagram class="mx-40"
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

  </div>


</template>
<script setup lang="ts">
import SimplePage from "~/components/ui/common/SimplePage.vue";
import Headline from "~/components/ui/common/Headline.vue";
import {useDataStore} from "~/stores/data";
import ComponentPlotterDiagram from "~/components/components/plotter/ComponentPlotterDiagram.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import {computed} from "vue";
import ArchstatsButton from "~/components/ui/buttons/ArchstatsButton.vue";
import SingleSelect from "~/components/ui/common/SingleSelect.vue";

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
const radiusProperty = ref<string | null>("line_count")
const selectedComponents = ref<RawComponent[]>([])

const distinctStats = computed(() => {
  const properties: { [key: string]: boolean } = {}
  store.currentComponentScope.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => !["report_id", "report_timestamp", "name"].includes(k))
})

function selectionToCurrentScope() {
  store.setCurrentScope(selectedComponents.value)
  selectedComponents.value = []
}

interface Preset {
  name: string,
  xAxis: string,
  yAxis: string,
  radius?: string | undefined,
  description?: string
}

function selectPreset(preset: Preset) {
  xAxisProperty.value = preset.xAxis
  yAxisProperty.value = preset.yAxis
  radiusProperty.value = preset.radius
}

function statAvailable(stat: string) {
  return distinctStats.value.includes(stat)
}

const presets = computed(() => {
  let presetsToReturn: Preset[] = [
    {
      name: "Distance to Main Sequence (DMS)", xAxis: "instability", yAxis: "abstractness", radius: 'line_count',
      description: 'The main sequence is the ideal position for a component. It signifies a perfect balance between abstractness and instability. The closer a component is to the main sequence, the better.'
    },
    {
      name: "Age vs Churn vs DMS", xAxis: "age_in_days", yAxis: "commit_count", radius: 'distance_main_sequence',
      description: 'Older components tend to have more churn. This is because they have been around for longer and have been changed more often. But if that component does not have a good balance between abstractness and instability, it is likely that further changes will be more painful.'
    },
    {
      name: "Betweenness vs Churn", xAxis: "betweenness", yAxis: "commit_count"
    },
    {
      name: "Betweenness vs Avg. Indentation", xAxis: "betweenness", yAxis: "indentation_avg"
    },
    {
      name: "Betweenness vs Max Indentation", xAxis: "betweenness", yAxis: "indentation_max"
    },
    {
      name:"Avg. Indentation vs Line Count", yAxis: "line_count", xAxis: "indentation_avg"
    },
    {
      name:"Max Indentation vs Line Count", yAxis: "line_count", xAxis: "indentation_max"
    },
    {
      name: "DMS vs Betweenness", xAxis: "instability", yAxis: "abstractness", radius: 'betweenness',
    },
    {
      name: "DMS vs Churn", xAxis: "instability", yAxis: "abstractness", radius: 'commit_count',
    },
    {
      name: "Authors vs Churn", xAxis: "author_count", yAxis: "commit_count",
    },
  ]

  return presetsToReturn.filter(p => {
    return statAvailable(p.xAxis) && statAvailable(p.yAxis) && (p.radius === undefined || statAvailable(p.radius))
  })

})


</script>