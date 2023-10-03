<style>

.splitpanes--horizontal > .splitpanes__splitter {
  height: 4px;
  background-color: #e2e8f0;
}

.splitpanes--vertical > .splitpanes__splitter {
  width: 4px;
  background-color: #e2e8f0;
}
</style>
<template>

  <Splitpanes>

    <Pane size="25" min-size="1" v-if="selectedComponent">
      <ComponentCardList :components="afferentCoupling" @component-selected="walkTo('is depended on by', $event)">
        <template #header>
          <div class="p-4 text-center">
            <h3 class="text-xl text-blue-500 mb-4 font-semibold">Afferent Coupling</h3>
            <p class="text-sm"><span class="font-mono text-xs font-bold text">{{ selectedComponent.name }}</span><br>
              is referenced
              <span class="text-blue-500 font-semibold">{{ totalAfferentCoupling }}</span> times by <span
                  class="font-semibold text-blue-500">{{ afferentCoupling.length }}</span> other components.</p>
          </div>
        </template>
      </ComponentCardList>
    </Pane>

    <Pane size="50" class="h-screen">
      <Splitpanes horizontal>
        <Pane size="80">

          <div class="flex flex-col flex-shrink-0 h-full  align-middle justify-center items-center">
            <ModalTrigger>
              <template #trigger>
                <ArchstatsButton icon="pencil" class=" mb-4 px-4 py-4 tertiary">
                  <h1 class="text-md text-center font-mono font-bold  ">{{ selectedComponent.name }}</h1>
                </ArchstatsButton>
              </template>

              <template #modal>
                <SelectComponentModal @component-selected="selectComponent"></SelectComponentModal>
              </template>
            </ModalTrigger>

            <Card class="self-center relative">
              <ComponentInfoTable class="w-full" :component="selectedComponent"/>
              <div class="absolute top-1/2 -right-40 font-semibold text-red-500 text-center ">
                <h2>Dependencies</h2>
              </div>
              <div class="absolute top-1/2 -left-40 font-semibold text-blue-500">
                <h2>Dependents</h2>
              </div>
            </Card>
          </div>

        </Pane>


        <Pane size="20" min-size="2" max-size="90" class="bg-gray-100 text-sm flex-grow   rounded-none flex flex-col">

          <div class="bg-gray-200 py-2 px-2 flex justify-between">
            <h3 class="font-semibold self-center">Path</h3>
            <div class="flex gap-4">

              <ArchstatsButton icon="rotate" :icon-size="14" class="tertiary" @click="resetPath">
                Reset path
              </ArchstatsButton>

              <ModalTrigger>
                <template #trigger>
                  <ArchstatsButton icon="footprints" :icon-size="14" class="tertiary">Walk</ArchstatsButton>
                </template>

                <template #modal>
                    <SelectPathModal :component="path[positionInPath].currentComponent" @path-selected="pathSelected" ></SelectPathModal>
                </template>
              </ModalTrigger>

              <ModalTrigger>
                <template #trigger>
                  <ArchstatsButton icon="pencil" :icon-size="14" class="tertiary">
                    Select new component
                  </ArchstatsButton>
                </template>

                <template #modal>
                  <SelectComponentModal @component-selected="selectComponent"></SelectComponentModal>
                </template>
              </ModalTrigger>



              <!--              <Icon icon="more-vertical"></Icon>-->
            </div>
          </div>
          <div id="current-path" class="h-full w-full overflow-y-scroll">
            <table class="overflow-x-scroll w-full  mb-12 text-xs">
              <tbody>
              <PathTableRow
                  v-for="(segment, i) in path"
                  :user-selected-position-in-path="positionInPath"
                  :segment="segment"
                  :nr="i + 1"
                  :pathOccurrences="pathOccurrences[i]"
                  @select="selectIndex(i)"
              />
              </tbody>
            </table>
          </div>

        </Pane>
      </Splitpanes>
    </Pane>


    <Pane size="25" min-size="1" v-if="selectedComponent">
      <ComponentCardList :components="efferentCoupling" @component-selected="walkTo('depends on', $event)">
        <template #header>
          <div class="p-4 text-center">
            <h3 class="text-xl text-red-500 mb-4 font-semibold">Efferent Coupling</h3>
            <p class="text-sm">
              <span class="font-mono text-xs font-bold text">{{ selectedComponent.name }}</span><br> has
              <span class="text-red-500 font-semibold">{{ totalEfferentCoupling }}</span> references to <span
                class="font-semibold text-red-500">{{ efferentCoupling.length }}</span> other components.</p>
          </div>
        </template>
      </ComponentCardList>
    </Pane>
  </Splitpanes>
</template>

<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {RawComponent} from "~/utils/components";
import {Splitpanes, Pane} from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import {computed} from "vue";
import ComponentInfoTable from "~/components/InfoTable.vue";
import ComponentCardList from "~/components/ComponentCardList.vue";
import Card from "~/components/ui/Card.vue";
import {getOccurrencesForPathSegments, PathSegment, Relationship, stringToPath} from "~/utils/path";
import PathTableRow from "~/components/PathTableRow.vue";
import ArchstatsButton from "~/components/ui/ArchstatsButton.vue";


definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})


const positionInPath = ref(0)
const store = useDataStore();
const selectedComponent = ref<RawComponent>(store.currentComponentScope[0])
const path = ref<PathSegment[]>([{
  currentComponent: selectedComponent.value.name,
}])

const pathOccurrences = computed(() => getOccurrencesForPathSegments(path.value))

const afferentCoupling = computed(() => {
  return store.query(`
    WITH connections_ignoring_files AS (SELECT "from", "to", sum(reference_count) AS count
    FROM component_connections_direct
    GROUP BY 1, 2)
    SELECT c.*, conn.count as "references"
    FROM connections_ignoring_files conn
           LEFT JOIN components c ON c.name = conn."from"
    WHERE "to" = '${selectedComponent.value.name}'
    ORDER BY count DESC
  `) as RawComponent[]
})

const totalAfferentCoupling = computed(() => {
  return afferentCoupling.value.reduce((acc, component) => acc + component["references"], 0)
})

const efferentCoupling = computed(() => {
  return store.query(`
    WITH connections_ignoring_files AS (SELECT "from", "to", sum(reference_count) AS count
    FROM component_connections_direct
    GROUP BY 1, 2)
    SELECT c.*, conn.count as "references"
    FROM connections_ignoring_files conn
           LEFT JOIN components c ON c.name = conn."to"
    WHERE "from" = '${selectedComponent.value.name}'
    ORDER BY count DESC
  `) as RawComponent[]
})

const totalEfferentCoupling = computed(() => {
  return efferentCoupling.value.reduce((acc, component) => acc + component["references"], 0)
})

function walkTo(relationship: Relationship, component: RawComponent) {
  path.value[positionInPath.value].relationship = relationship
  path.value[positionInPath.value].otherComponent = component.name
  selectedComponent.value = store.currentComponentScope.find(c => c.name == component.name)!
  if (path.value.length !== positionInPath.value) {
    path.value = path.value.slice(0, positionInPath.value + 1)
  }
  positionInPath.value = path.value.length
  path.value.push({
    currentComponent: selectedComponent.value.name,
  })
  scrollToBottom()
}

function scrollToBottom() {
  const el = document.getElementById("current-path")
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

function selectIndex(index: number) {
  if (index > path.value.length || index < 0) {
    return
  }
  selectedComponent.value = store.currentComponentScope.find(c => c.name == path.value[index].currentComponent)!
  positionInPath.value = index
}

function resetPath() {
  path.value = [{
    currentComponent: selectedComponent.value.name,
  }]
  positionInPath.value = 0;
}

function selectComponent(component: RawComponent) {
  selectedComponent.value = component
  resetPath()
}

function pathSelected(addedPathRaw: string ){
  const compiledPath = stringToPath(addedPathRaw)
  // clear path from the positionInPath onwards
  path.value = path.value.slice(0, positionInPath.value)
  path.value.push(...compiledPath)
  selectIndex(path.value.length - 1)
  scrollToBottom()
}

</script>