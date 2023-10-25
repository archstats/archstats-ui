<template>
  <div class="bg-gray-100 px-16 py-4 flex items-center">
    <div class="flex gap-2 items-center">
      <label class="text-archstats-500">Relative Size</label>
      <SingleSelect :options="distinctStats" v-model="relativeSize" class="w-64"></SingleSelect>
    </div>
  </div>
  <div class="p-8">
    <ComponentComparisonView class="h-[60vh] w-[60vh] mx-auto" :components="components" :relative-size="relativeSize"></ComponentComparisonView>
  </div>

</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import ComponentComparisonView from "~/components/views/component-comparison/ComponentComparisonView.vue";
import SingleSelect from "~/components/ui/SingleSelect.vue";

const store = useDataStore();

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const relativeSize = ref("file_count")
const components = computed(() => store.currentComponentScope)
const distinctStats = computed(() => {
  const properties = {}
  components.value.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => k !== 'name')
})
</script>