<template>
  <!-- Every pipeline, by repository: what starts it, what its steps reach, and whether it was read in full. -->
  <nav class="flex min-h-0 flex-col overflow-y-auto py-2" :aria-label="t('cicd.page.pipelines')">
    <p v-if="!groups.length && search" class="px-3 py-2 text-sm text-neutral-500">{{ t('cicd.list.noMatch', { q: search }) }}</p>
    <section v-for="g in groups" :key="g.repository" class="pb-2">
      <h3 v-if="groups.length > 1" class="truncate px-3 pb-1 pt-2 font-mono text-[11px] text-neutral-500" :title="g.repository">{{ g.repository }}</h3>
      <ul>
        <li v-for="r in g.rows" :key="r.pipeline.id"><PipelineRow :row="r" :selected="r.pipeline.id === selected" @pick="emit('pick', r.pipeline.id)"/></li>
      </ul>
      <template v-if="g.used.length">
        <button type="button" class="flex w-full items-center gap-1 px-3 pb-0.5 pt-1.5 text-[11px] text-neutral-500 hover:text-neutral-800" :aria-expanded="openUsed.has(g.repository)" @click="toggleUsed(g.repository)">
          <Icon :icon="openUsed.has(g.repository) ? 'chevron-down' : 'chevron-right'" :size="12"/>
          <span>{{ t('cicd.list.usedByOthers') }}</span><span class="font-mono text-neutral-400">{{ g.used.length }}</span>
        </button>
        <ul v-if="openUsed.has(g.repository) || g.used.some(r => r.pipeline.id === selected)">
          <li v-for="r in g.used" :key="r.pipeline.id"><PipelineRow :row="r" :selected="r.pipeline.id === selected" @pick="emit('pick', r.pipeline.id)"/></li>
        </ul>
      </template>
    </section>
  </nav>
</template>

<script setup lang="ts">
import { ref } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import PipelineRow from "./PipelineRow.vue"
import type { ListGroup } from "../cicd"
import { t } from "~/shared/i18n"

defineProps<{ groups: ListGroup[]; selected: string | null; search: string }>()
const emit = defineEmits<{ pick: [id: string] }>()
const openUsed = ref(new Set<string>())
function toggleUsed(repo: string) {
  const s = new Set(openUsed.value)
  if (s.has(repo)) s.delete(repo)
  else s.add(repo)
  openUsed.value = s
}
</script>
