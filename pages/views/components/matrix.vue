<template>

  <div class="h-screen flex flex-col relative">


  <div class="bg-gray-100 px-16 py-4 flex items-center gap-12 flex-shrink-0 z-40">

    <div class="flex gap-2 items-center ">
      <label class="font-semibold text-archstats-500">Order by</label>
      <div class="inline-flex gap-2">
        <SingleSelect v-model="orderBy" :options="distinctStats">
        </SingleSelect>

        <Checkbox v-model="reverse" class="inline">Reverse</Checkbox>
      </div>
    </div>

    <div class="flex gap-2 items-center">
      <label class="font-semibold text-archstats-500">Scale color by</label>
      <div class="inline-flex gap-2">
        <SingleSelect v-model="scaleColorWith" :options="colorScaleOptions">
        </SingleSelect>

      </div>
    </div>

    <div class="flex gap-2 items-center ">
      <label class="font-semibold text-archstats-500">Block Size</label>
      <div class="">
        <input type="number" class="w-20 px-4 py-2 bg-gray-100  box-border  border-archstats-500 border outline-archstats-900 outline-1 rounded"
               v-model="blockSize"> px
      </div>
    </div>

    <div class="flex gap-2 items-center">
      <label class="font-semibold text-archstats-500">Max Component Count</label>
      <div class="">
        <input type="number" class="w-20 px-4 py-2 bg-gray-100  box-border border-archstats-500 border  outline-archstats-900 outline-1 rounded"
               v-model="maxComponentCount"> of {{ store.currentComponentScope.length }}
      </div>
    </div>



  </div>

  <div class=" w-full flex-grow overflow-y-scroll">
    <ComponentMatrix :components="orderedComponents" :block-size="blockSize"
                     :scale-color-with="scaleColorWith"></ComponentMatrix>
  </div>

  </div>


</template>

<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import SimplePage from "~/components/ui/SimplePage.vue";
import ComponentMatrix from "~/components/views/matrix/ComponentMatrix.vue";
import Headline from "~/components/ui/Headline.vue";
import {computed} from "vue";
import Checkbox from "~/components/ui/Checkbox.vue";
import SingleSelect from "~/components/ui/SingleSelect.vue";

const store = useDataStore();


definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const maxComponentCount = ref(
    clamp(store.currentComponentScope.length, 0, 80)
)

const scaleColorWith = ref("coupling")

const colorScaleOptions = computed(() => {
  if (store.hasView("git_component_shared_commits")) {
    return ["coupling", "references", "shared_commits"]
  } else {
    return ["coupling", "references"]
  }
})
const orderBy = ref("name")
const reverse = ref(false)

const distinctStats = computed(() => {
  const properties: { [key: string]: boolean } = {}
  store.currentComponentScope.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => !["report_id", "report_timestamp"].includes(k))
})

const orderedComponents = computed(() => {
  return store.currentComponentScope.sort((a, b) => {
    const aValue = a[orderBy.value]
    const bValue = b[orderBy.value]
    const multiplier = reverse.value ? -1 : 1
    if (aValue < bValue) {
      return -1 * multiplier
    } else if (aValue > bValue) {
      return 1 * multiplier
    } else {
      return 0
    }
  }).slice(0, maxComponentCount.value)
})


const blockSize = ref(clamp(Math.floor(window.innerWidth / store.currentComponentScope.length), 12, 18))

function clamp(num: number, min: number, max: number) {
  return num <= min ? min : num >= max ? max : num;
}
</script>