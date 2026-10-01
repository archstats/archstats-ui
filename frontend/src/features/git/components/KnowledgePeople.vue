<template>
  <!-- The people still here, by how much code they are the one to ask about.
       Hovering one lights their parts of the map; clicking keeps it lit. -->
  <div class="flex min-h-0 flex-col">
    <div class="flex flex-col gap-1 px-4 pb-3 pt-4">
      <h3 class="ui-section-title">{{ t('git.knowledgePeople.activeContributors') }}</h3>
      <p v-if="people.length" class="text-sm leading-5 text-neutral-600">
        <template v-if="half <= 1">{{ t('git.knowledgePeople.onePerson') }}</template><template v-else>{{ t('git.knowledgePeople.people', { half }) }}</template>
        {{ t('git.knowledgePeople.mostActiveHalfCode') }}
      </p>
      <p v-else class="text-sm leading-5 text-neutral-500">{{ t('git.knowledgePeople.noActiveContributorMost') }}</p>
    </div>
    <ul class="flex min-h-0 flex-col overflow-y-auto pb-2" @mouseleave="emit('hover', null)">
      <li v-for="p in people" :key="p.author">
        <button type="button" class="group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-neutral-100"
                :class="{ 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': pinned === p.author }"
                :aria-pressed="pinned === p.author" @mouseenter="emit('hover', p.author)" @click="emit('pin', pinned === p.author ? null : p.author)">
          <Monogram :name="authors.display(p.author)" here/>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{{ authors.display(p.author) }}</span>
              <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ p.components.length }}</span>
            </span>
            <!-- Their share of the known code, split by how they know it. -->
            <span class="flex h-1.5 overflow-hidden rounded-full bg-neutral-100" :style="{ width: `${Math.max(6, (p.lines / maxLines) * 100)}%` }">
              <span v-for="st in KNOWN" :key="st" class="h-full" :style="{ width: `${(p.byState[st] / p.lines) * 100}%`, background: palette.fill[st] }"></span>
            </span>
            <span class="text-xs text-neutral-500">
              {{ t('git.knowledgePeople.code', { value: pct(p.lines / known) }) }}<template v-if="p.only">{{ ' ' + t('git.knowledgePeople.soleActiveContributor', { only: p.only }) }}</template>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useAuthorsStore } from "../authors.store"
import type { PersonToAsk } from "../knowledgeLeft"
import Monogram from "./Monogram.vue"
import { useKnowledgePalette } from "./knowledgeColors"
import { t } from "~/shared/i18n"

const props = defineProps<{ people: PersonToAsk[]; known: number; half: number; pinned: string | null }>()
const emit = defineEmits<{ (e: "hover", author: string | null): void; (e: "pin", author: string | null): void }>()

const authors = useAuthorsStore()
const palette = useKnowledgePalette()
const KNOWN = ["wrote", "works", "once"] as const
const maxLines = computed(() => Math.max(1, ...props.people.map(p => p.lines)))
const pct = (v: number) => `${v > 0 && v < 0.01 ? "<1" : Math.round(v * 100)}%`
</script>
