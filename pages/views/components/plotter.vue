<template>
  <div class="flex flex-col">

    <div class="h-20 bg-archstats-50 flex px-16 gap-8 items-center">

      <div class="flex items-center gap-2">
        <label class="text-archstats-500">X-axis</label>
        <StatSelectSingle v-model="xAxisProperty" :options="distinctStats" class="">
        </StatSelectSingle>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-archstats-500">Y-axis</label>
        <StatSelectSingle v-model="yAxisProperty" :options="distinctStats" class="">
        </StatSelectSingle>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-archstats-500">Radius</label>
        <StatSelectSingle v-model="radiusProperty" :options="distinctStats" placeholder="Select statistic" class="">
        </StatSelectSingle>
      </div>

      <Checkbox v-model="showText" class="inline">Show names</Checkbox>

      <ArchstatsButton class="primary h-fit" @click="selectionToCurrentScope">Selection to current scope
      </ArchstatsButton>

    </div>
    <div class="flex flex-grow px-16 py-5 bg-gray-200 gap-4 items-center overflow-x-auto">
      <div class="text-archstats-500">Presets:</div>
      <LongHover v-for="preset in presets"
                 :disabled="!preset.description"
                 :time="1000"
           @click="selectPreset(preset)"
           class="px-4 text-archstats-800 whitespace-nowrap py-1 w-fit cursor-pointer border border-archstats-500 transition-all bg-tertiary-50 rounded-full hover:bg-tertiary-100">
        {{ preset.name }}

        <template #hovered-content>
          <div class="fixed w-96  p-4 bg-black shadow z-[1000] rounded text-sm">
            <div class="text-white whitespace-normal">{{ preset.description }}</div>
          </div>
        </template>
      </LongHover>

    </div>

    <main class="flex-grow items-center justify-center px-20 mt-10">
      <ComponentPlotterDiagram class="mx-40 h-[70vh]"
                               @component-clicked="navToComponent($event)"
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
import {useDataStore} from "~/stores/data";
import ComponentPlotterDiagram from "~/components/components/plotter/ComponentPlotterDiagram.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import {computed} from "vue";
import ArchstatsButton from "~/components/ui/buttons/ArchstatsButton.vue";
import LongHover from "~/components/ui/common/LongHover.vue";
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue";
import {RawComponent} from "~/utils/components";
useSeoMeta({
  title: "Plotter",
})
definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const store = useDataStore();
const showText = ref(false)
const xAxisProperty = ref(store.statName("modularity:instability"))
const yAxisProperty = ref(store.statName("modularity:abstractness"))
const radiusProperty = ref<string | null>(store.statName('complexity:lines'))
const selectedComponents = ref<RawComponent[]>([])

const distinctStats = computed(() => {

  return store.getDistinctComponentColumns.filter(k => !["report_id", "report_timestamp", "name"].includes(k))
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
  return distinctStats.value.includes(store.statName(stat))
}

const presets = computed(() => {
  let presetsToReturn: Preset[] = [
    {
      name: "Distance to Main Sequence (DMS)", xAxis: "modularity:instability", yAxis: "modularity:abstractness", radius: 'complexity:lines',
      description: 'The main sequence is the ideal position for a component. It signifies a perfect balance between abstractness and instability. The closer a component is to the main sequence, the better.'
    },
    {
      name: "Age vs Churn vs DMS", xAxis: "git:age_in_days", yAxis: "git:commits:total", radius: 'modularity:distance_main_sequence',
      description: 'Older components tend to have more churn. This is because they have been around for longer and have been changed more often. But if that component does not have a good balance between abstractness and instability, it is likely that further changes will be more painful.'
    },
    {
      name: "Betweenness vs Churn", xAxis: "graph:betweenness", yAxis: "git:commits:total"
    },
    {
      name: "Betweenness vs Avg. Indentation", xAxis: "graph:betweenness", yAxis: "complexity:indentation:avg"
    },
    {
      name: "Betweenness vs Max Indentation", xAxis: "graph:betweenness", yAxis: "complexity:indentation:max"
    },
    {
      name:"Avg. Indentation vs Line Count", yAxis: "complexity:lines", xAxis: "complexity:indentation:avg"
    },
    {
      name:"Max Indentation vs Line Count", yAxis: "complexity:lines", xAxis: "complexity:indentation:max"
    },
    {
      name: "DMS vs Betweenness", xAxis: "modularity:instability", yAxis: "modularity:abstractness", radius: 'graph:betweenness',
    },
    {
      name: "DMS vs Churn", xAxis: "modularity:instability", yAxis: "modularity:abstractness", radius: 'git:commits:total',
    },
    {
      name: "Authors vs Churn", xAxis: "git:authors:total", yAxis: "git:commits:total",
    },
  ]

  return presetsToReturn.filter(p => {
    return statAvailable(p.xAxis) && statAvailable(p.yAxis) && (p.radius === undefined || statAvailable(p.radius))
  })

})

const router = useRouter();
function navToComponent(component: RawComponent) {
  router.push("/views/components/" + component.name)
}

</script>