<template>
  <FilesFileCodeViewer :file-path="filePath" />
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()

// Resolving filePath from name parameter (supports nested layout routing)
const filePath = computed(() => {
  const parts = route.params.name
  let list = Array.isArray(parts) ? [...parts] : [parts as string]
  const last = list[list.length - 1]
  if (["contents", "git", "imports", "java"].includes(last)) {
    list.pop()
  }
  return list.join('/')
})
</script>
