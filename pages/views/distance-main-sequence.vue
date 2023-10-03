<template>
  <DistanceMainSequenceChart :components = "store.currentComponentScope" ></DistanceMainSequenceChart>>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>