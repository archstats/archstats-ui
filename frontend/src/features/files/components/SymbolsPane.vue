<template>
  <aside class="flex w-[260px] shrink-0 flex-col bg-ground hairline-l" :aria-label="t('files.symbolsPane.symbols')">
    <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
      <span class="ui-section-title">{{ t('files.symbolsPane.symbols') }}</span>
      <span class="ui-tag">{{ formatNumber(symbols.length) }}</span>
      <div class="ui-segmented ml-auto" role="group" :aria-label="t('files.symbolsPane.order')">
        <button type="button" :aria-pressed="order === 'file'" :title="t('files.symbolsPane.inOrderTitle')" @click="order = 'file'">{{ t('files.symbolsPane.inOrder') }}</button>
        <button type="button" :aria-pressed="order === 'complex'" :title="t('files.symbolsPane.mostComplexTitle')" @click="order = 'complex'">{{ t('files.symbolsPane.mostComplex') }}</button>
      </div>
    </div>
    <div class="shrink-0 px-3 py-2">
      <input v-model="filter" type="search" class="ui-input ui-input-sm w-full" :placeholder="t('files.symbolsPane.filterSymbols')" :aria-label="t('files.symbolsPane.filterSymbols')" @keydown.enter="jumpFirst"/>
    </div>
    <div ref="listRef" class="min-h-0 grow overflow-y-auto px-1.5 pb-2">
      <EmptyState v-if="!symbols.length" icon="braces" :title="t('files.symbolsPane.noFunctions')" :text="t('files.symbolsPane.noFunctionsText')"/>
      <EmptyState v-else-if="!rows.length" icon="search" :title="t('files.symbolsPane.noMatch')" :text="t('files.symbolsPane.noMatchText', { filter })"/>
      <button
        v-for="s in rows"
        :key="s.begin"
        type="button"
        class="symbol-row"
        :class="{ 'is-active': active && s.begin === active.begin }"
        :data-begin="s.begin"
        :title="t('files.symbolsPane.rowTitle', { name: s.name || anonymous(s), begin: s.begin, end: s.end, cognitive: s.cognitive })"
        @click="emit('jump', s)"
      >
        <span class="min-w-0 grow truncate font-mono text-sm"><span class="text-neutral-900">{{ own(s) }}</span><span v-if="innerOwner(s)" class="ml-1.5 text-xs text-neutral-400">{{ innerOwner(s) }}</span></span>
        <span class="shrink-0 font-mono text-xs tabular-nums" :class="s.cognitive > COMPLEX ? 'text-red-700' : 'text-neutral-400'">{{ s.cognitive }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
// The file's functions, GitHub's Symbols panel in the tool window: filter
// them, take them in order or worst first, click one to jump to it. The row
// of the function on screen follows the scroll.
import { computed, nextTick, ref, watch } from "vue"
import type { FileSymbol } from "~/features/files/complexityAnnotations"
import EmptyState from "~/shared/ui/EmptyState.vue"
import { formatNumber } from "~/shared/format"
import { t } from "~/shared/i18n"

const props = defineProps<{ symbols: FileSymbol[]; active: FileSymbol | null }>()
const emit = defineEmits<{ jump: [symbol: FileSymbol] }>()

const COMPLEX = 15
const filter = ref("")
const order = ref<"file" | "complex">("file")
const listRef = ref<HTMLElement | null>(null)

const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const list = q ? props.symbols.filter(s => (s.name || "").toLowerCase().includes(q)) : props.symbols
  return order.value === "complex" ? [...list].sort((a, b) => b.cognitive - a.cognitive || a.begin - b.begin) : list
})

function owner(s: FileSymbol): string {
  const i = s.name.lastIndexOf(".")
  return i > 0 && !s.name.endsWith(":") ? s.name.slice(0, i) : ""
}
// The file's own class is said once by the file name; a row names only an
// inner one.
const mainOwner = computed(() => {
  const counts = new Map<string, number>()
  for (const s of props.symbols) { const o = owner(s); if (o) counts.set(o, (counts.get(o) ?? 0) + 1) }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
})
function own(s: FileSymbol): string {
  return s.name ? s.name.slice(owner(s) ? owner(s).length + 1 : 0) : anonymous(s)
}
function innerOwner(s: FileSymbol): string {
  const o = owner(s)
  if (!o || o === mainOwner.value) return ""
  return o.startsWith(mainOwner.value + ".") ? o.slice(mainOwner.value.length + 1) : o
}
function anonymous(s: FileSymbol): string {
  return t("files.symbolsPane.anonymous", { line: s.begin })
}
function jumpFirst() {
  if (rows.value[0]) emit("jump", rows.value[0])
}

// Keep the function on screen visible in the list as the code scrolls.
watch(() => props.active?.begin, async begin => {
  if (begin === undefined) return
  await nextTick()
  listRef.value?.querySelector<HTMLElement>(`[data-begin="${begin}"]`)?.scrollIntoView({ block: "nearest" })
})
</script>

<style scoped>
.symbol-row { display: flex; width: 100%; align-items: center; gap: 0.5rem; height: 1.625rem; padding: 0 0.5rem; border-radius: 0.25rem; text-align: left; }
.symbol-row:hover { background: rgb(var(--c-neutral-100)); }
.symbol-row:focus-visible { outline: 2px solid rgb(var(--c-accent-500)); outline-offset: -2px; }
.symbol-row.is-active { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
</style>
