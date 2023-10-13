<template>
  <SimplePage>

    <Headline class="mb-8">Component Matrix</Headline>

    <div class="grid grid-cols-2 gap-1 w-1/2" >
      <label for="">Order by</label>
      <div class="inline-flex gap-2">
        <select v-model="orderBy"
                class=" p-2 box-border bg-gray-100 border-tertiary-400 rounded border-2 outline-tertiary-700">
          <option v-for="stat in distinctStats" :key="stat" :value="stat">{{ stat }}</option>
        </select>

        <Checkbox v-model="reverse" class="inline">Reverse</Checkbox>
      </div>


      <label for="">Block Size</label>
      <div class="">
        <input type="number" class="w-20 px-4 py-2 bg-gray-100  box-border outline-archstats-900 outline-1 rounded"
               v-model="blockSize"> px
      </div>

      <label for="">Max Component Count</label>
      <div class="">
        <input type="number" class="w-20 px-4 py-2 bg-gray-100  box-border outline-archstats-900 outline-1 rounded"
               v-model="maxComponentCount"> of {{ store.currentComponentScope.length }}
      </div>
    </div>





    <div class=" w-full h-[768px] border overflow-scroll">
      <ComponentMatrix :components="orderedComponents" :block-size="blockSize"></ComponentMatrix>

    </div>

  </SimplePage>

</template>

<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import SimplePage from "~/components/ui/SimplePage.vue";
import ComponentMatrix from "~/components/views/matrix/ComponentMatrix.vue";
import Headline from "~/components/ui/Headline.vue";
import {computed} from "vue";
import Checkbox from "~/components/ui/Checkbox.vue";

const store = useDataStore();


definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const maxComponentCount = computed(() => {
  return clamp(store.currentComponentScope.length, 0, 80)
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