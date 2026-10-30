<template>
  <!-- The lines a fact was read from, a few either side, from the snapshot's copy of the file. -->
  <div class="flex flex-col gap-1">
    <h4 class="ui-label">{{ t('cicd.inspector.source') }}</h4>
    <p v-if="missing" class="text-xs text-neutral-500">{{ t('cicd.inspector.noSource') }}</p>
    <pre v-else-if="lines.length" class="overflow-x-auto rounded bg-ground py-1.5 font-mono text-[11.5px] leading-[18px] ring-1 ring-neutral-200"><code><span
      v-for="l in lines" :key="l.n" class="flex px-2" :class="l.n >= from && l.n <= (to || from) ? 'border-l-2 border-accent-500 bg-accent-50 text-neutral-900' : 'border-l-2 border-transparent text-neutral-600'"><span class="w-9 shrink-0 select-none pr-2 text-right text-neutral-400">{{ l.n }}</span><span class="whitespace-pre">{{ l.text }}</span></span></code></pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { cleanFile } from "../cicd"
import { t } from "~/shared/i18n"

const props = withDefaults(defineProps<{ file: string; from: number; to?: number; around?: number }>(), { to: 0, around: 4 })
const data = useDataStore()
const lines = ref<Array<{ n: number; text: string }>>([])
const missing = ref(false)

watch(() => [props.file, props.from, props.to, data.datasetKey] as const, async () => {
  lines.value = []
  missing.value = false
  if (!props.file || !data.hasView("file_contents")) {
    missing.value = true
    return
  }
  const clean = cleanFile(props.file).replace(/'/g, "''")
  const rows = await data.query<{ content: string }>(`SELECT content FROM file_contents WHERE file IN ('${clean}', './${clean}') LIMIT 1`)
  const content = rows[0]?.content
  if (content == null) {
    missing.value = true
    return
  }
  const all = String(content).split("\n")
  const end = Math.max(props.to || props.from, props.from)
  const first = Math.max(1, props.from - props.around)
  const last = Math.min(all.length, end + props.around, first + 40)
  lines.value = all.slice(first - 1, last).map((text, i) => ({ n: first + i, text }))
}, { immediate: true })
</script>
