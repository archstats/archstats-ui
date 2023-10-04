<template>

  <div class="w-full h-fit">
    <div class="flex mb-4 border-b-2 pb-4 justify-between items-center gap-6">
      <div class="flex gap-4 items-center">
        <div class="" v-if="selectableComponents ">
          <span>{{ selectedComponents.length }}/{{ allComponents.length }} selected</span>
        </div>

      </div>
      <div class="flex items-center gap-6">
        <div>
          <label class="mr-2">Search</label>
          <input type="search" v-model="search"
                 class="p-2 box-border bg-gray-100 border-archstats-tertiary-400 rounded border-2 outline-archstats-tertiary-700">
        </div>
      </div>
    </div>
    <ElementTable :selectable-elements="selectableComponents" :elements="components" :max-page-size="maxPageSize"
                  :selected-elements="selectedComponents"></ElementTable>
  </div>


</template>

<script setup lang="ts">
import "css.gg/icons/icons.css"
import {defineProps, ref, computed} from "vue";
import {Component} from "~/utils/components";

const props = defineProps({
  selectableComponents: {
    type: Boolean,
    default: true
  },
  components: {
    type: Array as () => Component[],
    required: true
  },
  maxPageSize: {
    type: Number,
    default: 20
  },
  selectedComponents: {
    type: Array as () => string[],
    default: () => [],
  }
})

const search = ref("")
const allComponents = computed(() => {
  return props.components?.filter(c => c.name.toLowerCase().includes(search.value.toLowerCase())) ?? []
})

</script>

<style scoped>

</style>
