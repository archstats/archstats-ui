<template>
  <SimplePage>

    <Headline class="mb-8">Component Matrix</Headline>
    <div class=" w-full h-[512px]">
      <ComponentMatrix :components="store.currentComponentScope"></ComponentMatrix>

    </div>

  </SimplePage>

</template>

<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import DistanceMainSequenceChart from "~/components/views/distance-main-sequence/DistanceMainSequenceChart.vue";
import SimplePage from "~/components/ui/SimplePage.vue";
import ComponentMatrix from "~/components/views/matrix/ComponentMatrix.vue";
import Headline from "~/components/ui/Headline.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

</script>