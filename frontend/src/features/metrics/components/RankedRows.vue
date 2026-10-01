<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
      <span class="ui-section-title">{{ title }}</span>
      <span class="ui-tag">{{ rows.length }}</span>
      <span class="ml-auto truncate text-xs text-neutral-500">{{ t('metrics.rankedRows.by', { sortKey: niceName(sortKey) }) }}</span>
    </div>
    <ul class="min-h-0 grow overflow-y-auto py-1" @mouseleave="emit('update:hovered', null)">
      <li v-for="row in ranked" :key="row.name">
        <button
            type="button"
            class="group flex h-7 w-full items-center gap-2 px-3 text-left"
            :class="selectedSet.has(row.name) ? 'bg-accent-50' : hovered === row.name ? 'bg-neutral-100' : 'hover:bg-neutral-100'"
            :title="row.name"
            @mouseenter="emit('update:hovered', row.name)"
            @click="click($event, row.name)"
            @dblclick="emit('open', row.name)"
        >
          <span class="flex min-w-0 grow font-mono text-sm">
            <span class="min-w-0 truncate text-neutral-400">{{ split(row.name).head }}</span><span class="shrink-0 text-neutral-900">{{ split(row.name).tail }}</span>
          </span>
          <span class="relative h-1 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200">
            <span class="absolute inset-y-0 left-0 rounded-full bg-neutral-500" :style="{ width: `${share(row)}%` }"></span>
          </span>
          <span class="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-700">{{ formatReading(row[sortKey]) }}</span>
        </button>
      </li>
      <li v-if="rows.length > LIMIT" class="px-3 py-2 text-xs text-neutral-500">{{ t('metrics.rankedRows.moreBrushStripNarrow', { value: rows.length - LIMIT }) }}</li>
      <li v-if="rows.length === 0" class="px-3 py-6 text-center text-sm text-neutral-500">{{ t('metrics.rankedRows.nothingPassesEveryBrush') }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { formatReading } from "~/shared/format";
import { metricValue, splitName } from "~/features/metrics/plotReading";
import { t } from "~/shared/i18n";

// The rows still in play, ranked by one metric: the list half of an overview.
// Hover links back to the drawing; click selects; double-click opens.

type Row = { name: string; [key: string]: any };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  sortKey: { type: String, required: true },
  title: { type: String, default: t("metrics.rankedRows.play") },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  hovered: { type: String as PropType<string | null>, default: null },
});

const emit = defineEmits<{
  (e: "update:selected", names: string[]): void;
  (e: "update:hovered", name: string | null): void;
  (e: "open", name: string): void;
}>();

const LIMIT = 200;
const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;
const selectedSet = computed(() => new Set(props.selected));
const split = (n: string) => splitName(n);

// Health reads best from the bottom: the lowest score is the one to look at.
const ascending = computed(() => props.sortKey === "codesmells__code_health");

const ranked = computed(() => {
  const k = props.sortKey;
  const val = (r: Row) => metricValue(r, k);
  return [...props.rows]
    .filter((r) => Number.isFinite(val(r)))
    .sort((a, b) => (ascending.value ? val(a) - val(b) : val(b) - val(a)))
    .slice(0, LIMIT);
});

const max = computed(() => Math.max(1e-9, ...props.rows.map((r) => metricValue(r, props.sortKey)).filter(Number.isFinite)));
const share = (r: Row) => Math.max(2, (metricValue(r, props.sortKey) / max.value) * 100);

function click(e: MouseEvent, name: string) {
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const next = new Set(props.selected);
    next.has(name) ? next.delete(name) : next.add(name);
    emit("update:selected", [...next]);
  } else emit("update:selected", [name]);
}
</script>
