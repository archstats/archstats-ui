<template>
  <SimplePage>
    <Headline>{{ component.name }}</Headline>
    <TabPanel :tabs="tabConfig">
      <template #info>
        <GitActivityChart :end-date="Date.now()" :commits="gitCommits" class="">

        </GitActivityChart>
        <section class="p-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            <div v-for="stat in topLevelStats">
              <ComponentInfoListNode class="h-full" :stat="stat" :component="component"></ComponentInfoListNode>
            </div>
          </div>
        </section>
      </template>

      <template #files>
        <section class="p-4">
          <div class="flex items-center  gap-2 justify-end mb-3">
            <label class="text-archstats-500">Columns</label>
            <StatSelectMulti :options="distinctStatsForFiles" limit="" v-model="selectedStatsForFiles" placeholder=""/>

          </div>

          <div class="w-full">
            <ElementTable :elements="files"
                          :only-show-columns="selectedStatsForFiles"
                          :selectable-elements="false"
                          v-model:selected-elements="selectedCycles"
                          class="w-full"></ElementTable>
          </div>
        </section>
      </template>

      <template #cycles>
        <section class="p-4">

          <div class="flex h-full ">
            <div class="w-1/2  h-full">
              <ElementTable class="h-[500px]" v-model:selected-elements="selectedCycles"
                            :selectable-elements="true"
                            :max-page-size="12"
                            :elements="cyclesIncludedIn"></ElementTable>
            </div>
            <div v-if="selectedCycleGraph" class="items-center w-full">
              <ConnectionChart class="h-full" :components="selectedCycleGraph"
                               :connections="[]"/>
            </div>
          </div>
        </section>
      </template>

      <template #static-coupling>

        <CousinsDiagram :component="component" color-scale="graph__betweenness" :all-components="components" :all-paths="connections" :direction="'from'"></CousinsDiagram>

      </template>

    </TabPanel>


  </SimplePage>

</template>

<script setup lang="ts">

import {useDataStore} from "~/stores/data";
import SimplePage from "~/components/ui/common/SimplePage.vue";
import Headline from "~/components/ui/common/Headline.vue";
import {Component} from "~/utils/components";
import ElementTable from "~/components/ui/tables/ElementTable.vue";
import {columnsToStats, findCommonPrefix} from "#imports";
import ConnectionChart from "~/components/components/ConnectionChart.vue";
import MultiSelect from "~/components/ui/common/MultiSelect.vue";
import TabPanel from "~/components/ui/tab-panel/tab-panel.vue";
import {computed} from "vue";
import ComponentSinglePageInfo from "~/components/components/single-component/ComponentSinglePageInfo.vue";
import StatSelectMulti from "~/components/ui/stat-select/StatSelectMulti.vue";
import ComponentInfoListNode from "~/components/components/info-list/ComponentInfoListNode.vue";
import GitActivityChart from "~/components/components/git/git-activity/GitActivityChart.vue";
import CousinsDiagram from "~/components/components/cousins/CousinsDiagram.vue";
import type {GitCommit} from "~/utils/git";

const nameInRoute = computed(() => route.params.name as string);

const component = computed<Component>(() => store.allComponents.find(c => c.name === nameInRoute.value)!)


onMounted(() => {
  useSeoMeta({
    title: nameInRoute.value,
  })
})

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ],
})
const route = useRoute();
const store = useDataStore();

const tabConfig = [
  {
    title: "Info",
    tabId: "info"
  },
  {
    title: "Files",
    tabId: "files"
  },
  {
    title: "Cycles",
    tabId: "cycles"
  },
  {
    title: "Static Coupling",
    tabId: "static-coupling"
  },
  {
    title: "Git",
    tabId: "git"
  }
]


const files = computed(() => {
  const files = store.query(`
    SELECT *
    FROM files
    WHERE component = '${component.value.name}'
  `) as {
    name: string,
    [key: string]: any
  }[];

  return files.map(f => {

    return {
      ...f,
      name: f.name.replace(f[store.statName("directory")], "..")
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

const topLevelStats = computed(() => {
  return columnsToStats(store.getDistinctComponentColumns).filter(stat => stat.level === 1)
})

const gitCommits = computed(() => store.query(
    `select commit_hash,
            commit_time,
            commit_message,
            author_name,
            author_email,
            count(file)         as files_changed,
            sum(file_additions) as additions,
            sum(file_deletions) as deletions
     from git_commits
     where component = '${component.value.name}'
     group by commit_hash
    `
) as GitCommit[]);


const components = computed(() => store.currentComponentScope)

const connections = computed(() => store.query(`select * from component_connections_indirect where "from" = '${component.value.name}' or "to" = '${component.value.name}'`))
</script>

<style scoped>

</style>
