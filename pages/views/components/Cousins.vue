

<template>

  <div class="p-8 h-full">

    <CousinsDiagram :component="component" color-scale="graph__betweenness" :all-components="components" :all-paths="connections2" :direction="'from'"></CousinsDiagram>
  </div>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import CousinsDiagram from "~/components/components/cousins/CousinsDiagram.vue";

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
const components = computed(() => store.currentComponentScope)
const component = computed(() => store.currentComponentScope.find(c =>  c["modularity__coupling__efferent"] > 2 )!);

const connections2 = computed(() => store.query(`select * from component_connections_indirect where "from" = '${component.value.name}' or "to" = '${component.value.name}'`))


</script>
<style scoped>

</style>