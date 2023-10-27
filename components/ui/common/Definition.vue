<template>

  <div v-html="definitionRendered"/>

</template>
<script lang="ts" setup>

import {useDataStore} from "~/stores/data";
import {marked} from "marked"

const store = useDataStore();

const props = defineProps<{
  definition: string,
  mode: "short" | "long"
}>()

const definition = computed(() => {
  return store.definitions.get(props.definition)?.[props.mode] ?? null
})
const definitionRendered = computed(() => {
  if (!definition.value) {
    return marked(
        `No definition found for '${props.definition}'`
    )
  }
  return marked(definition.value)
})

</script>