<template>
  <!-- Where a fact was read: every row in this view names its file and line. -->
  <span class="inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
    <router-link v-if="file" :to="filePath(cleanFile(file))" class="min-w-0 truncate font-mono hover:text-neutral-900 hover:underline" :title="`${cleanFile(file)}${line ? ':' + line : ''}`">{{ shortFile(file) }}<span v-if="line" class="text-neutral-400">:{{ line }}</span></router-link>
    <OpenInEditor v-if="file" :file="cleanFile(file)" :line="line || undefined" button-class="!h-5 !w-5"/>
  </span>
</template>

<script setup lang="ts">
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { filePath } from "~/features/navigation/routes"
import { cleanFile, shortFile } from "../cicd"

defineProps<{ file: string; line?: number }>()
</script>
