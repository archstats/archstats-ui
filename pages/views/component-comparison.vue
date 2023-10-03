<template>
    <ComponentComparisonView :components = "store.currentComponentScope"></ComponentComparisonView>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentComparisonView from "~/components/views/component-comparison/ComponentComparisonView.vue";
const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>