<template>
  <div v-if="rows.length" class="flex flex-col gap-1">
    <div class="flex items-baseline gap-2">
      <Icon v-if="icon" :icon="icon" :size="12" class="shrink-0 self-center text-neutral-400"/>
      <span class="ui-label">{{ title }}</span>
      <span class="font-mono text-xs text-neutral-400">{{ rows.length }}</span>
      <span class="ml-auto font-mono text-xs text-neutral-400">{{ formatNumber(total, 0) }} {{ unit }}</span>
      <TableExportMenu class="-my-1 self-center" :title="title" :columns="[{ id: 'id', label: 'Name' }, { id: 'kind', label: 'Kind' }, { id: 'value', label: unit }, { id: 'inCycle', label: 'In a cycle with it' }]" :rows="rows as any"/>
    </div>
    <ul class="flex flex-col">
      <li v-for="r in shown" :key="r.id" class="flex h-6 items-center gap-2">
        <KindMark :kind="r.kind" :color="r.color" :title="`${r.kind}${r.inCycle ? ' · in the same cycle' : ''}`"/>
        <button
          type="button"
          class="min-w-0 truncate text-left font-mono text-sm hover:underline"
          :class="r.inCycle ? 'text-red-700' : 'text-neutral-800'"
          :title="r.inCycle ? `${r.id} · closes a cycle with this one` : r.id"
          @click="emit('select', r.id)"
        >{{ r.label }}</button>
        <span class="ml-auto h-1 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100" :title="`${formatNumber(r.value, 0)} ${unit}`">
          <span class="block h-full rounded-full" :class="r.inCycle ? 'bg-red-500' : 'bg-blue-500'" :style="{ width: Math.max(4, (r.value / max) * 100) + '%' }"></span>
        </span>
        <span class="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(r.value, 0) }}</span>
      </li>
    </ul>
    <button v-if="rows.length > LIMIT" type="button" class="self-start text-xs text-neutral-500 hover:text-neutral-900" @click="expanded = !expanded">
      {{ expanded ? 'Show fewer' : `Show all ${rows.length}` }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import KindMark from "~/components/connections/KindMark.vue";
import TableExportMenu from "~/components/ui/TableExportMenu.vue";
import { formatNumber } from "~/utils/format";

// One direction of a node's dependencies, strongest first: who it is, how
// much of the total weight it carries, and whether it closes a cycle with
// the selected node. The bar is relative to the strongest partner here, so
// the shape of the list is readable before any number is.

export interface PartnerRow {
  id: string
  label: string
  kind: string
  color?: string | null
  value: number
  inCycle: boolean
}

const props = defineProps<{
  title: string
  rows: PartnerRow[]
  unit: string
  icon?: string
}>();
const emit = defineEmits<{ (e: "select", id: string): void }>();

const LIMIT = 8;
const expanded = ref(false);
watch(() => props.rows, () => { expanded.value = false; });

const shown = computed(() => (expanded.value ? props.rows : props.rows.slice(0, LIMIT)));
const max = computed(() => Math.max(1, ...props.rows.map(r => r.value)));
const total = computed(() => props.rows.reduce((s, r) => s + r.value, 0));
</script>
