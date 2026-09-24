<template>
  <FileCodeViewer :file-path="filePath"/>
</template>

<script setup lang="ts">
import FileCodeViewer from "~/features/files/components/FileCodeViewer.vue"
import { useFileRoute } from "~/features/files/useFileRoute"

const { filePath } = useFileRoute()
</script>
