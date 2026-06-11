<template>
  <div class="flex flex-col gap-6">
    <div v-if="component" class="flex flex-col gap-6 flow-element">
      <!-- Symmetrical Connection Flow map -->
      <CouplingFlow :component="component" />
    </div>
    
    <div v-else class="text-center py-12 text-slate-400 font-medium italic">
      Component data is loading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import CouplingFlow from "~/components/components/single-component/CouplingFlow.vue"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find(c => c.name === nameInRoute.value)!)
</script>

<style scoped>
.flow-element {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
