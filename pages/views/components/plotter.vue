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

      <!-- Search filter -->
      <div class="relative flex items-center shrink-0">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search components..." 
          class="bg-white border border-slate-200 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[10px] font-semibold pl-7 pr-7 py-2 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs w-44 md:w-56"
        />
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
        </svg>
        <button 
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
        >
          ✕
        </button>
      </div>

      <div class="ml-auto text-xs text-archstats-500 italic bg-archstats-100/50 px-3 py-1.5 rounded-lg border border-archstats-200">
        💡 Shift+Click to select multiple, or drag a selection box
      </div>
    </div>
    <div class="flex flex-grow px-16 py-5 gap-4 items-center overflow-x-auto bg-archstats-50">
      <LongHover v-for="preset in presets"
                 :disabled="!preset.description"
                 :time="1000"
                 @click="selectPreset(preset)"
                 class="px-4 text-archstats-800 whitespace-nowrap py-1 w-fit cursor-pointer border border-archstats-500 transition-all rounded-full hover:bg-archstats-100"
                 :class="{ 'border-secondary-500 bg-secondary-50 hover:bg-secondary-100 text-secondary-800': presetIsActive(preset)}"
      >
        {{ preset.name }}
        <template #hovered-content>
          <div class="fixed w-96  p-4 bg-black shadow z-[1000] rounded text-sm">
            <div class="text-white whitespace-normal">{{ preset.description }}</div>
          </div>
        </template>
      </LongHover>

    </div>
    
    <!-- Group Legend -->
    <div
      v-if="groupsStore.componentGroups.length > 0"
      class="bg-white border-b border-archstats-100 px-16 py-2.5 flex flex-wrap items-center gap-2 shrink-0"
    >
      <span class="text-[10px] font-bold text-archstats-300 uppercase tracking-wider mr-1">Groups:</span>
      <div
        v-for="group in groupsStore.componentGroups"
        :key="group.id"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer transition-all select-none"
        :class="[
          hiddenGroups.has(group.id)
            ? 'border-archstats-100 text-archstats-200 bg-archstats-50/50'
            : activeFilters.has(group.id)
              ? 'border-archstats-500 bg-archstats-50 text-archstats-800'
              : 'border-archstats-200 text-archstats-400 hover:border-archstats-400 hover:text-archstats-600'
        ]"
        @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
        @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
        @mouseleave="hoveredGroupId = null"
      >
        <div class="w-2.5 h-2.5 rounded-full transition-opacity" :style="{ backgroundColor: group.color }" :class="hiddenGroups.has(group.id) ? 'opacity-20' : ''"></div>
        <span :class="hiddenGroups.has(group.id) ? 'line-through' : ''">{{ group.name }}</span>
        <span class="text-archstats-300 ml-0.5">({{ group.members.length }})</span>
        <button
          v-if="!hiddenGroups.has(group.id)"
          @click.stop="toggleGroupVisibility(group.id)"
          class="ml-0.5 text-archstats-300 hover:text-archstats-600 transition-colors cursor-pointer"
          title="Hide group from view"
        >✕</button>
      </div>

      <button
        v-if="activeFilters.size > 0 || hiddenGroups.size > 0"
        @click="activeFilters.clear(); hiddenGroups.clear()"
        class="ml-auto text-[10px] font-bold text-archstats-400 hover:text-red-500 cursor-pointer"
      >
        ✕ Clear
      </button>
    </div>

    <main class="flex-grow items-center justify-center px-20 mt-20">
      <ComponentPlotterDiagram class="mx-40 h-[70vh]"
                               @component-clicked="navToComponent($event)"
                               :all-components="store.allComponents"
                               :componentsInScope="store.allComponents"
                               :x-axis-property="xAxisProperty"
                               :y-axis-property="yAxisProperty"
                               :radius-property="radiusProperty"
                               :show-text="showText"
                               :selected-components="selectedComponents"
                               :search-query="searchQuery"
                               :hidden-groups="hiddenGroups"
                               :active-filters="activeFilters"
                               :hovered-group-id="hoveredGroupId"
                               @components-selected="selectedComponents = $event;"

      />
      <GroupsGroupActionBar :selected-items="selectedComponentsNames" type="component" @clear="selectedComponents = []" />
    </main>

  </div>


</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentPlotterDiagram from "~/components/components/plotter/ComponentPlotterDiagram.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import {ref, computed, reactive} from "vue";
import ArchstatsButton from "~/components/ui/buttons/ArchstatsButton.vue";
import LongHover from "~/components/ui/common/LongHover.vue";
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue";
import {useGroupsStore} from "~/stores/groups";
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
const searchQuery = ref('')
const xAxisProperty = ref(store.statName("modularity__instability"))
const yAxisProperty = ref(store.statName("modularity__abstractness"))
const radiusProperty = ref<string | null>(store.statName('complexity__lines'))
const selectedComponents = ref<RawComponent[]>([])
const selectedComponentsNames = computed(() => selectedComponents.value.map(c => c.name))

const groupsStore = useGroupsStore()
const hoveredGroupId = ref<string | null>(null)
const activeFilters = reactive(new Set<string>())
const hiddenGroups = reactive(new Set<string>())

function toggleFilter(groupId: string) {
  if (activeFilters.has(groupId)) activeFilters.delete(groupId)
  else activeFilters.add(groupId)
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.has(groupId)) hiddenGroups.delete(groupId)
  else hiddenGroups.add(groupId)
}

const distinctStats = computed(() => store.getDistinctComponentColumns)



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
      name: "Distance to Main Sequence (DMS)",
      xAxis: "modularity__instability",
      yAxis: "modularity__abstractness",
      radius: 'complexity__lines',
      description: 'The main sequence is the ideal position for a component. It signifies a perfect balance between abstractness and instability. The closer a component is to the main sequence, the better.'
    },
    {
      name: "DMS vs Code Changes",
      xAxis: "modularity__instability",
      yAxis: "modularity__abstractness",
      radius: 'git__commits__total',
    },
    {
      name: "Age vs Churn vs DMS",
      xAxis: "git__age_in_days",
      yAxis: "git__commits:total",
      radius: 'modularity__distance_main_sequence',
      description: 'Older components tend to have more churn. This is because they have been around for longer and have been changed more often. But if that component does not have a good balance between abstractness and instability, it is likely that further changes will be more painful.'
    },
    {
      name: "Betweenness vs Churn", xAxis: "graph__betweenness", yAxis: "git__commits__total"
    },
    {
      name: "Betweenness vs Avg. Indentation", xAxis: "graph__betweenness", yAxis: "complexity__indentation__avg"
    },
    {
      name: "Betweenness vs Max Indentation", xAxis: "graph__betweenness", yAxis: "complexity__indentation__max"
    },
    {
      name: "Avg. Indentation vs Line Count", yAxis: "complexity__lines", xAxis: "complexity__indentation__avg"
    },
    {
      name: "Max Indentation vs Line Count", yAxis: "complexity__lines", xAxis: "complexity__indentation__max"
    },
    {
      name: "DMS vs Betweenness",
      xAxis: "modularity__instability",
      yAxis: "modularity__abstractness",
      radius: 'graph__betweenness',
    },
    {
      name: "DMS vs Churn",
      xAxis: "modularity__instability",
      yAxis: "modularity__abstractness",
      radius: 'git__commits__total',
    },
    {
      name: "Authors vs Churn", xAxis: "git__authors:total", yAxis: "git__commits__total",
    },
  ]

  return presetsToReturn.filter(p => {
    return statAvailable(p.xAxis) && statAvailable(p.yAxis) && (p.radius === undefined || statAvailable(p.radius))
  })

})

function presetIsActive(preset: Preset) {
  return xAxisProperty.value === preset.xAxis && yAxisProperty.value === preset.yAxis && radiusProperty.value === preset.radius
}

const router = useRouter();

function navToComponent(component: RawComponent) {
  router.push("/views/components/" + component.name)
}

</script>
