<template>
  <div class="bg-gray-100 px-16 py-4 flex items-center">
    <div class="flex gap-2 items-center">
      <label class="text-archstats-500">Relative Size</label>
      <StatSelectSingle :options="store.getDistinctComponentColumns" v-model="relativeSize" class="w-64"></StatSelectSingle>
    </div>
  </div>
  <div class="p-8">
    <ComponentComparisonView class="h-[60vh] w-[60vh] mx-auto" :components="components"
                             :relative-size="relativeSize"></ComponentComparisonView>
  </div>

</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentComparisonView from "~/components/components/comparison/ComponentComparisonView.vue";
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue";

const store = useDataStore();
useSeoMeta({
  title: "Comparison",
})
definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const relativeSize = ref(store.statName('complexity:files'))
const components = computed(() => store.currentComponentScope)

</script>