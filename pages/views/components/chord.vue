<template>
  <div class="container mt-24 mx-auto">
    <ChordDiagram :components = "store.currentComponentScope" ></ChordDiagram>>

  </div>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import ChordDiagram from "~/components/components/chord/ChordDiagram.vue";
const store = useDataStore();

useSeoMeta({
  title: "Chord",
})
definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>