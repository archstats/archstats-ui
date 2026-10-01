<template>
  <!-- One component, read in the rail: whom to ask, and who wrote it. -->
  <div v-if="row" class="flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-5 pt-3" @keydown.esc="emit('close')">
    <button type="button" class="-ml-1.5 flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" @click="emit('close')">
      <Icon icon="chevron-left" :size="13"/>{{ t('git.knowledgeInspector.allPeople') }}
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
      <h3 class="ui-section-title mb-1">{{ t('git.knowledgeInspector.activeContributors') }}</h3>
      <template v-if="askList.length">
        <router-link v-for="h in askList" :key="h.author" :to="authors.authorPath(h.author)" class="-mx-1.5 flex items-center gap-2.5 rounded px-1.5 py-1 hover:bg-neutral-100">
          <Monogram :name="authors.display(h.author)" here size="sm"/>
          <span class="min-w-0 flex-1 truncate text-sm text-neutral-900">{{ authors.display(h.author) }}</span>
          <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500" :title="t('git.knowledgeInspector.commitsLines', { recent: h.recent, windowWords, share: pct(h.share) })">
            {{ h.recent ? t('git.knowledgeInspector.text', { commits: t('common.count.commit', { count: h.recent }) }) : t('git.knowledgeInspector.wrote', { share: pct(h.share) }) }}
          </span>
        </router-link>
      </template>
      <p v-else class="text-sm leading-5 text-neutral-500">{{ t('git.knowledgeInspector.noActiveContributorWrote', { windowWords }) }}</p>
    </section>

    <section class="flex flex-col gap-1">
      <h3 class="ui-section-title mb-1">{{ t('git.knowledgeInspector.authors') }}</h3>
      <div v-for="h in row.holders.filter(x => x.added > 0).slice(0, 6)" :key="h.author" class="flex items-center gap-2.5 py-1">
        <Monogram :name="authors.display(h.author)" :here="h.here" size="sm"/>
        <span class="flex min-w-0 flex-1 flex-col">
          <router-link :to="authors.authorPath(h.author)" class="truncate text-sm hover:underline" :class="h.here ? 'text-neutral-900' : 'text-neutral-600'">{{ authors.display(h.author) }}</router-link>
          <span class="text-xs text-neutral-500">{{ h.here ? t('git.knowledgeInspector.active') : t('git.knowledgeInspector.lastCommit', { idle: ago(h.idle) }) }}</span>
        </span>
        <span class="flex w-16 shrink-0 flex-col items-end gap-1">
          <span class="font-mono text-xs tabular-nums text-neutral-700">{{ pct(h.share) }}</span>
          <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100"><span class="block h-full rounded-full" :class="h.here ? 'bg-blue-500' : 'bg-neutral-300'" :style="{ width: `${Math.max(4, h.share * 100)}%` }"></span></span>
        </span>
      </div>
    </section>

    <div class="flex flex-wrap gap-1.5">
      <router-link :to="componentPath(row.component)" class="ui-btn ui-btn-sm ui-btn-primary"><Icon icon="arrow-up-right" :size="13"/><span>{{ t('git.knowledgeInspector.open') }}</span></router-link>
      <router-link :to="componentPath(row.component, 'history')" class="ui-btn ui-btn-sm">{{ t('git.knowledgeInspector.history') }}</router-link>
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
import { t } from "~/shared/i18n"

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
const windowWords = computed(() => (props.windowDays === 365 ? t("git.knowledgeInspector.lastYear") : props.windowDays === 730 ? t("git.knowledgeInspector.lastTwoYears") : t("git.knowledgeInspector.lastDays", { windowDays: props.windowDays })))
function ago(days: number): string {
  if (days < 60) return t("git.knowledgeInspector.dAgo", { days: Math.round(days) })
  if (days < 540) return t("git.knowledgeInspector.moAgo", { value: Math.round(days / 30) })
  return t("git.knowledgeInspector.yAgo", { value: (days / 365).toFixed(1) })
}
const reading = computed(() => {
  const r = props.row
  if (!r) return ""
  const size = t("git.knowledgeInspector.lines", { lines: formatNumber(r.lines, 0) })
  const here = pct(r.hereShare)
  if (r.state === "wrote") return t("git.knowledgeInspector.activeContributorsWrote", { size, here })
  if (r.state === "works") return t("git.knowledgeInspector.activeContributorsChangedTimes", { size, hereCommits: r.hereCommits, windowWords: windowWords.value, here })
  if (r.state === "once") return t("git.knowledgeInspector.changedOnceActiveContributors", { size, windowWords: windowWords.value, here })
  return t("git.knowledgeInspector.activeContributorsWroteHaven", { size, here, windowWords: windowWords.value })
})
</script>
