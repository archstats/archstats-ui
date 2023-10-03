<template>

  <SimplePage>
    <DistanceMainSequenceChart :components = "store.currentComponentScope" ></DistanceMainSequenceChart>>

  </SimplePage>


</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import SimplePage from "~/components/ui/SimplePage.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>