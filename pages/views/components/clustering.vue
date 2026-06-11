<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ClusteringDiagram :components="store.allComponents" class="flex-1 min-h-0"></ClusteringDiagram>
  </div>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ClusteringDiagram from "~/components/components/clustering/ClusteringDiagram.vue";
const store = useDataStore();

useSeoMeta({
  title: "Clustering",
})
definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>
