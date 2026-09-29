<template>
  <!-- One component, read in the rail: whom to ask, and who wrote it. -->
  <div v-if="row" class="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-5 pt-3" @keydown.esc="emit('close')">
    <button type="button" class="-ml-1.5 flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" @click="emit('close')">
      <Icon icon="chevron-left" :size="13"/>All people
    </button>

    <div class="flex flex-col gap-2">
      <router-link :to="componentPath(row.component)" class="break-all font-mono text-[13px] font-medium leading-5 text-neutral-900 hover:underline">{{ row.component }}</router-link>
      <span class="inline-flex items-center gap-2 self-start rounded px-2 py-0.5 text-xs font-medium"
            :class="{ hairline: row.state === 'nobody' || row.state === 'once' }"
            :style="{ background: stateBackground(row.state, palette), color: palette.ink[row.state] }">
        {{ STATES.find(s => s.id === row!.state)!.label }}
      </span>
      <p class="text-sm leading-5 text-neutral-600">{{ reading }}</p>
    </div>

    <section class="flex flex-col gap-1">
      <h3 class="ui-section-title mb-1">Active contributors</h3>
      <template v-if="askList.length">
        <router-link v-for="h in askList" :key="h.author" :to="authors.authorPath(h.author)" class="-mx-1.5 flex items-center gap-2.5 rounded px-1.5 py-1 hover:bg-neutral-100">
          <Monogram :name="authors.display(h.author)" here size="sm"/>
          <span class="min-w-0 flex-1 truncate text-sm text-neutral-900">{{ authors.display(h.author) }}</span>
          <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500" :title="`${h.recent} commits to it in the ${windowWords}; ${pct(h.share)} of its lines`">
            {{ h.recent ? `${h.recent} commit${h.recent === 1 ? "" : "s"}` : `wrote ${pct(h.share)}` }}
          </span>
        </router-link>
      </template>
      <p v-else class="text-sm leading-5 text-neutral-500">No active contributor wrote much of it or changed it in the {{ windowWords }}.</p>
    </section>

    <section class="flex flex-col gap-1">
      <h3 class="ui-section-title mb-1">Authors</h3>
      <div v-for="h in row.holders.filter(x => x.added > 0).slice(0, 6)" :key="h.author" class="flex items-center gap-2.5 py-1">
        <Monogram :name="authors.display(h.author)" :here="h.here" size="sm"/>
        <span class="flex min-w-0 flex-1 flex-col">
          <router-link :to="authors.authorPath(h.author)" class="truncate text-sm hover:underline" :class="h.here ? 'text-neutral-900' : 'text-neutral-600'">{{ authors.display(h.author) }}</router-link>
          <span class="text-xs text-neutral-500">{{ h.here ? "active" : `last commit ${ago(h.idle)}` }}</span>
        </span>
        <span class="flex w-16 shrink-0 flex-col items-end gap-1">
          <span class="font-mono text-xs tabular-nums text-neutral-700">{{ pct(h.share) }}</span>
          <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100"><span class="block h-full rounded-full" :class="h.here ? 'bg-blue-500' : 'bg-neutral-300'" :style="{ width: `${Math.max(4, h.share * 100)}%` }"></span></span>
        </span>
      </div>
    </section>

    <div class="flex flex-wrap gap-1.5">
      <router-link :to="componentPath(row.component)" class="ui-btn ui-btn-sm ui-btn-primary"><Icon icon="arrow-up-right" :size="13"/><span>Open</span></router-link>
      <router-link :to="componentPath(row.component, 'history')" class="ui-btn ui-btn-sm">History</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { componentPath } from "~/features/navigation/routes"
import Icon from "~/shared/ui/Icon.vue"
import { formatNumber } from "~/shared/format"
import { useAuthorsStore } from "../authors.store"
import { STATES, type KnowledgeRow } from "../knowledgeLeft"
import Monogram from "./Monogram.vue"
import { stateBackground, useKnowledgePalette } from "./knowledgeColors"

const props = defineProps<{ row: KnowledgeRow | null; windowDays: number }>()
const emit = defineEmits<{ (e: "close"): void }>()
const authors = useAuthorsStore()
const palette = useKnowledgePalette()

// People still here who committed to it in the window or wrote a tenth of it, most commits first.
const askList = computed(() => (props.row?.holders ?? [])
  .filter(h => h.here && (h.recent > 0 || h.share >= 0.1))
  .sort((a, b) => b.recent - a.recent || b.added - a.added)
  .slice(0, 6))
const pct = (v: number) => `${v > 0 && v < 0.01 ? "<1" : Math.round(v * 100)}%`
const windowWords = computed(() => (props.windowDays === 365 ? "last year" : props.windowDays === 730 ? "last two years" : `last ${props.windowDays} days`))
function ago(days: number): string {
  if (days < 60) return `${Math.round(days)} d ago`
  if (days < 540) return `${Math.round(days / 30)} mo ago`
  return `${(days / 365).toFixed(1)} y ago`
}
const reading = computed(() => {
  const r = props.row
  if (!r) return ""
  const size = `${formatNumber(r.lines, 0)} lines`
  const here = pct(r.hereShare)
  if (r.state === "wrote") return `${size}. Active contributors wrote ${here} of it.`
  if (r.state === "works") return `${size}. Active contributors changed it ${r.hereCommits} times in the ${windowWords.value} and wrote ${here} of it.`
  if (r.state === "once") return `${size}. Changed once in the ${windowWords.value}. Active contributors wrote ${here} of it.`
  return `${size}. Active contributors wrote ${here} of it and haven't changed it in the ${windowWords.value}.`
})
</script>
