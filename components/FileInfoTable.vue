
<template>

</template>

<script setup lang="ts">

import {useDataStore} from "~/stores/data";
import {computed} from "vue";

const props = defineProps<{
  file: string
}>()
const store = useDataStore();

const file = computed(() =>{
  return store.query(
      `
        SELECT *
        FROM files
        WHERE name = '${props.file}'
      `
  )
})
</script>