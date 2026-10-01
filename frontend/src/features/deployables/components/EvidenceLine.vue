<template>
  <!-- Where a fact was read, and how firmly: every row in this view says
       which file and line it came from, and a join made on a name alone
       says so. -->
  <span class="inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
    <router-link v-if="file" :to="filePath(file.replace(/^\.\//, ''))" class="min-w-0 truncate font-mono hover:text-neutral-900 hover:underline" :title="`${file}${line ? ':' + line : ''}`">{{ shortFile }}<span v-if="line" class="text-neutral-400">:{{ line }}</span></router-link>
    <OpenInEditor v-if="file" :file="file.replace(/^\.\//, '')" :line="line || undefined" button-class="!h-5 !w-5"/>
    <span v-if="resolution && weak" class="ui-tag !text-[11px]" :title="RESOLUTION_LABEL[resolution] ?? resolution">{{ RESOLUTION_SHORT[resolution] ?? resolution }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { filePath } from "~/features/navigation/routes"
import { RESOLUTION_LABEL, WEAK_RESOLUTIONS } from "../deployables"
import { t } from "~/shared/i18n"

const props = defineProps<{ file: string; line?: number; resolution?: string }>()

const RESOLUTION_SHORT: Record<string, string> = { name: t("deployables.evidenceLine.name"), shared_config: t("deployables.evidenceLine.sharedConfigmap"), paths: t("deployables.evidenceLine.pathFilter") }
const weak = computed(() => !!props.resolution && WEAK_RESOLUTIONS.has(props.resolution))
// The last two segments are enough to recognise a file in a narrow rail.
const shortFile = computed(() => {
  const parts = props.file.replace(/^\.\//, "").split("/")
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/")
})
</script>
