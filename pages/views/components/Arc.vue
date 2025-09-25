<template>

  <div class="p-8 h-full">

    <ArcDiagram class="h-full overflow-y-scroll" :components="components"  :connections = "connections" relative-size="relativeSize"></ArcDiagram>
  </div>

</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentComparisonView from "~/components/components/comparison/ComponentComparisonView.vue";
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue";
import ArcDiagram from "~/components/components/arc/ArcDiagram.vue";

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

const relativeSize = ref(store.statName('complexity__files'))
const components = computed(() => store.currentComponentScope)
const connections = computed(() => store.currentComponentConnections)

</script>