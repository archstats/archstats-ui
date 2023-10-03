<template>
  <div :id="chartId" class="relative" ref="chartElement">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import {ref} from "vue";

const chartId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2, 10)
const chartElement = ref(null) as HTMLElement

defineExpose({
  chartId,
  chartElement
})
</script>

<style scoped>

</style>