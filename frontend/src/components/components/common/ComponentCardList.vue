<template>

  <div class="flex flex-col h-full">
    <div class="flex-shrink-0 hairline-b pb-3">
      <slot name="header"></slot>
      <div class="px-4">
        <input class="ui-input ui-input-sm"
               v-model="searchText" placeholder="Search...">

      </div>
    </div>
    <div class="flex-grow overflow-y-auto px-4 py-3">

      <Card class="mb-3 cursor-pointer p-4 transition-colors hover:bg-neutral-50" @click="select(component);" v-for="component in filteredComponents">

        <h1 class="mb-2 truncate font-mono text-sm font-medium text-neutral-900" :title="component.name">{{
            component.name
          }}</h1>

        <ComponentInfoTable class="w-full" :component="component"
                            :only-show="store.statNames(['references', 'modularity__coupling__afferent', 'modularity__coupling__efferent', 'complexity__files'])"
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
