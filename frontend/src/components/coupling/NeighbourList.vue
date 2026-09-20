<template>
  <div class="flex min-h-0 flex-col overflow-hidden">
    <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
      <h3 class="ui-section-title">{{ title }}</h3>
      <span class="font-mono text-xs text-neutral-400">{{ rows.length }}</span>
      <span class="ml-auto truncate text-xs text-neutral-400" :title="hint">{{ hint }}</span>
    </div>
    <div class="shrink-0 px-3 py-2 hairline-b">
      <label class="relative flex items-center">
        <Icon icon="search" :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input v-model="query" type="search" class="ui-input ui-input-sm w-full pl-6" :placeholder="`Filter ${title.toLowerCase()}`"/>
      </label>
    </div>
    <EmptyState v-if="rows.length === 0" :title="emptyText" class="min-h-0"/>
    <EmptyState v-else-if="filtered.length === 0" title="No match" class="min-h-0"/>
    <ul v-else class="min-h-0 grow overflow-y-auto py-1">
      <li
        v-for="row in filtered"
        :key="row.name"
        class="group flex h-8 items-center gap-2 px-3 transition-colors hover:bg-neutral-50"
        :class="{ 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': selected?.has(row.name) }"
      >
        <button type="button" class="min-w-0 flex-1 truncate text-left font-mono text-sm text-neutral-800 group-hover:text-neutral-900" :title="`Walk to ${row.name} (shift-click to select)`" @click="onClick($event, row.name)">{{ shortName(row.name) }}</button>
        <span v-if="hops > 1" class="ui-tag" :title="`${row.hops} hop${row.hops === 1 ? '' : 's'} away`">{{ row.hops }}h</span>
        <span v-if="row.references" class="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500" :title="`${row.references} references`">{{ formatNumber(row.references) }}</span>
        <router-link :to="`/views/components/${row.name}`" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" :title="`Open ${row.name}`" :aria-label="`Open ${row.name}`">
          <Icon icon="arrow-up-right" :size="13"/>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useDataStore } from "~/stores/data"
import { formatNumber } from "~/utils/format"
import Icon from "~/components/ui/common/Icon.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"

export interface NeighbourRow { name: string; references: number; hops: number }

const props = defineProps<{ title: string; hint?: string; rows: NeighbourRow[]; hops: number; emptyText: string; selected?: Set<string> }>()
const emit = defineEmits<{ (e: "walk", name: string): void; (e: "toggle", name: string): void }>()

// Plain click walks; shift or cmd/ctrl click adds the row to a selection the
// owner can turn into a group.
function onClick(event: MouseEvent, name: string) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) emit("toggle", name)
  else emit("walk", name)
}

const store = useDataStore()
const query = ref("")

const prefix = computed(() => store.getProjectPrefixIfAny)
function shortName(name: string): string {
  return prefix.value && name.startsWith(prefix.value) ? name.substring(prefix.value.length) || name : name
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.rows
  return props.rows.filter(r => r.name.toLowerCase().includes(q))
})
</script>
