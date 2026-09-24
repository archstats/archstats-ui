<template><span></span></template>

<script setup lang="ts">
import { componentPath } from "~/utils/routes"
// The dependencies tab folded into connections. Kept as a redirect so links, bookmarks
// and history entries from before the merge still land somewhere true.
import { watch } from "vue"
import { useRoute, useRouter } from "vue-router"

const route = useRoute()
const router = useRouter()

watch(() => route.params.name, name => {
  if (name) void router.replace(`${componentPath(name)}/connections`)
}, { immediate: true })
</script>
