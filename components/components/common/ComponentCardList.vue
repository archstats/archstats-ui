<template>

  <div class="flex flex-col h-full">
    <div class="flex-shrink-0 border-b-2 py-4">
      <slot name="header"></slot>
      <div class="px-4 ">
        <input class="w-full px-4 py-2 bg-archstats-50  box-border outline-archstats-500 outline-1 rounded border border-archstats-100"
               v-model="searchText" placeholder="Search...">

      </div>
    </div>
    <div class="px-4 flex-grow overflow-y-scroll">

      <Card class="h-96 mt-4" @click="select(component);" v-for="component in filteredComponents">

        <h1 class="text-xs font-mono font-bold mb-4 text-archstats-900" :title="component.name">{{
            component.name
          }}</h1>

        <ComponentInfoTable class="w-full" :component="component"
                            :only-show="store.statNames(['references', 'modularity:coupling:afferent', 'modularity:coupling:efferent', 'complexity:files'])"
        ></ComponentInfoTable>
      </Card>
    </div>
  </div>

</template>
<script setup lang="ts">
import Card from "~/components/ui/card/Card.vue";
import ComponentInfoTable from "~/components/ui/tables/InfoTable.vue";
import {RawComponent} from "~/utils/components";
import {useDataStore} from "~/stores/data";

const props = defineProps<{
  components: RawComponent[]
}>()

const searchText = ref("")
const emit = defineEmits(["component-selected"]);

const store = useDataStore();

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
