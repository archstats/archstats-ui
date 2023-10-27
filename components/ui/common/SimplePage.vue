
<template>

  <div class="container mx-auto mt-24" >
    <slot></slot>
  </div>
</template>

<script setup lang="ts">

const props = defineProps<{
  size?: "small" | "medium" | "large"
}>()


</script>
<style scoped>

</style>