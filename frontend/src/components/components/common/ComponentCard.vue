<template>
  <Card>
    <h1 class="text-xs font-mono font-bold mb-4">{{ component.name }}</h1>

    <ComponentInfoTable class="w-full" :component="component"
                        :only-show="onlyShow"></ComponentInfoTable>
  </Card>
</template>

<script lang="ts" setup>
import ComponentInfoTable from "~/components/ui/tables/InfoTable.vue";
import {RawComponent} from "~/utils/components";
import {useDataStore} from "~/stores/data";
import Card from "~/components/ui/card/Card.vue";

const store = useDataStore();
const props = defineProps<{
  component: RawComponent,
  onlyShow?: string[]
}>()

const name = computed(() => store.getComponentName(props.component));


</script>