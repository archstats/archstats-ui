<template>
  <Card class="w-2/3 mt-24 bg-white">
    <div class="px-4 mt-8 mb-12">
      <input class="w-full px-4 py-2 bg-gray-100  box-border outline-archstats-500 outline-1" v-model="searchText" placeholder="Search..." @keyup.esc="closeModal">

    </div>
    <div class="h-[512px]">
      <ElementTable v-if="filteredComponents.length" @clicked-element='select' :selectable-elements="false" :clickable-elements="true" :max-page-size="12"
                    :elements="filteredComponents"/>
      <div v-else class="flex justify-center items-center h-96">
        <p class="text-gray-500">No components found</p>
      </div>
    </div>

  </Card>
</template>
<script lang="ts" setup>

import {useDataStore} from "~/stores/data";
import {RawComponent} from "~/utils/components";
import Card from "~/components/ui/Card.vue";
import useEmitter from "~/utils/useEmitter";
import {closeModalKey} from "~/utils/modal";

const store = useDataStore()
const props = defineProps<{
  components?: RawComponent[]
}>()

const loadedComponents = computed(() => {
  return props.components ?? store.currentComponentScope ?? []
})
const closeModal = inject(closeModalKey)

const emit = defineEmits(['component-selected'])

const searchText = ref("")

const filteredComponents = computed(() => {
  if (searchText.value.length < 3) {
    return loadedComponents.value
  }
  // filter with regex
  const regex = new RegExp(searchText.value, "i")
  return loadedComponents.value.filter(c => regex.test(c.name))
})

function select(component: RawComponent){
  emit('component-selected', component)
  closeModal?.()
}
</script>