<template>
  <div class="mt-24">
    <ChordDiagram :components = "store.currentComponentScope" ></ChordDiagram>>

  </div>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import ChordDiagram from "~/components/ChordDiagram.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>