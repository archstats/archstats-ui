<template>

  <div class="">
    <ComponentInfoListNode  v-for="statCategory in mainCategories" :stat="statCategory" :component="component">

    </ComponentInfoListNode>
  </div>

</template>
<script setup lang="ts">
import {columnsToStats} from "~/utils/stat-tree";
import ComponentInfoListNode from "~/components/components/info-list/ComponentInfoListNode.vue";
import {RawComponent} from "~/utils/components";

const props = defineProps<{
  component: RawComponent,
  columns: string[]
}>()

const stats = computed(() => {
  return columnsToStats(props.columns)
})

const mainCategories = computed(() => {
  return stats.value.filter(s => s.level === 1)
})

</script>