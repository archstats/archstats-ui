<template>
  <FileCodeViewer :file-path="filePath"/>
</template>

<script setup lang="ts">
import FileCodeViewer from "~/components/files/FileCodeViewer.vue"
import { useFileRoute } from "~/composables/useFileRoute"

const { filePath } = useFileRoute()
</script>
