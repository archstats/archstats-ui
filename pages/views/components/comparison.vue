<template>
  <SimplePage>
    <ComponentComparisonView :components = "store.currentComponentScope"></ComponentComparisonView>

  </SimplePage>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentComparisonView from "~/components/views/component-comparison/ComponentComparisonView.vue";
import SimplePage from "~/components/ui/SimplePage.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>