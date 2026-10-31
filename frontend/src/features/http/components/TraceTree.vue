<template>
  <!-- A route's path through the code: each function under the one that
       called it, ending in the tables it changes or reads and the systems it
       calls. Shared code most routes reach is shown, not followed. -->
  <ul class="flex flex-col">
    <li v-for="s in steps" :key="s.unit + s.function" class="min-w-0">
      <div class="flex min-w-0 items-baseline gap-1.5 py-[1px]" :style="{ paddingLeft: `${s.depth * 12}px` }">
        <span v-if="s.depth" class="shrink-0 text-neutral-300" aria-hidden="true">└</span>
        <router-link :to="sourceAt(s.file, s.line)" class="min-w-0 truncate font-mono text-xs hover:underline" :class="s.plumbing ? 'text-neutral-400' : 'text-neutral-800'" :title="`${s.unit} · ${s.file}:${s.line}`">{{ fnName(s) }}</router-link>
        <span v-if="s.plumbing" class="ui-tag shrink-0 !text-[10px]" :title="t('http.trace.sharedTitle')">{{ t('http.trace.shared') }}</span>
      </div>
      <div v-if="s.writes.length || s.mayWrite.length || s.reads.length || s.systems.length" class="flex min-w-0 flex-wrap gap-1 pb-1" :style="{ paddingLeft: `${s.depth * 12 + (s.depth ? 16 : 0)}px` }">
        <span v-for="x in s.writes" :key="'w' + x" class="ui-tag !bg-blue-50 !text-[10px] !text-blue-700" :title="x">{{ t('http.trace.writes', { name: shortName(x) }) }}</span>
        <span v-for="x in s.mayWrite" :key="'m' + x" class="ui-tag !bg-transparent !text-[10px] !text-blue-700 ring-1 ring-inset ring-blue-200" :title="`${x} · ${t('http.trace.mayTitle')}`">{{ t('http.trace.mayChange', { name: shortName(x) }) }}</span>
        <span v-for="x in s.reads" :key="'r' + x" class="ui-tag !text-[10px]" :title="x">{{ t('http.trace.reads', { name: shortName(x) }) }}</span>
        <span v-for="x in s.systems" :key="'s' + x" class="ui-tag !bg-amber-50 !text-[10px] !text-amber-700" :title="x">{{ t('http.trace.calls', { name: systemName(x) }) }}</span>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { filePath } from "~/features/navigation/routes"
import { t } from "~/shared/i18n"
import { shortName } from "../http"
import type { TraceStep } from "../surface"

const props = defineProps<{ root: TraceStep; systemName: (key: string) => string }>()

// The tree in reading order, depth first.
const steps = computed(() => {
  const out: TraceStep[] = []
  const visit = (s: TraceStep) => { out.push(s); s.children.forEach(visit) }
  visit(props.root)
  return out
})
const fnName = (s: TraceStep) => (s.function.includes(".") ? s.function : `${shortName(s.unit)}.${s.function}`)
const sourceAt = (file: string, line: number) => `${filePath(file, "source")}${line ? `#L${line}` : ""}`
</script>
