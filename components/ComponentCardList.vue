<template>

  <div class="flex flex-col h-full">
    <div class="flex-shrink-0 border-b-2 py-4">
      <slot name="header"></slot>
      <div class="px-4 ">
        <input class="w-full px-4 py-2 bg-gray-100  box-border outline-archstats-500 outline-1" v-model="searchText" placeholder="Search...">

      </div>
    </div>
    <div class="px-4 flex-grow overflow-y-scroll">

      <Card class="h-96 mt-4" @click="select(component);" v-for="component in filteredComponents">

        <h1 class="text-xs font-mono font-bold mb-4" :title="component.name">{{ component.name }}</h1>

        <ComponentInfoTable class="w-full" :component="component"
                            :only-show="['references', 'afferent_couplings', 'efferent_couplings', 'file_count']"
        ></ComponentInfoTable>
      </Card>
    </div>
  </div>

</template>
<script setup lang="ts">
import Card from "~/components/ui/Card.vue";
import ComponentInfoTable from "~/components/InfoTable.vue";
import {RawComponent} from "~/utils/components";

const props = defineProps<{
  components: RawComponent[]
}>()

const searchText = ref("")
const emit = defineEmits(["component-selected"]);

const filteredComponents = computed(() => {
  if (searchText.value.length < 3) {
    return props.components
  }
  // filter with regex
  const regex = new RegExp(searchText.value, "i")
  return props.components.filter(c => regex.test(c.name))
})

function select(component: RawComponent) {
  emit("component-selected", component);
}
</script>