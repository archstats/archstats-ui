<template>
  <!-- An evidence cell: frozen at the run in its gutter, re-runnable, with a
       title and caption that belong to the report. -->
  <figure
    class="nb-cell group/cell relative my-3 rounded-lg transition-shadow"
    :class="selected ? 'shadow-[0_0_0_1px_rgb(var(--c-accent-400)),inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hairline hover:shadow-[0_0_0_1px_rgb(var(--c-neutral-300))]'"
    :aria-label="`${number}${title ? `: ${title}` : ''}`"
    @mousedown="$emit('select')"
  >
    <!-- The run gutter, outside the reading column: like a notebook's In [n]. -->
    <div v-if="gutter" class="absolute -left-[104px] top-2.5 flex w-[64px] flex-col items-end gap-1 text-right">
      <button
        v-if="runnable"
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
        :class="stale ? 'bg-accent-500 text-white hover:bg-accent-600' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800'"
        :aria-label="stale ? `Run on ${kernelLabel}` : 'Run again'"
        :title="stale ? `Ran on ${cell.ranOn?.label ?? 'nothing yet'}; run on ${kernelLabel} (⇧↵)` : `Run again on ${kernelLabel} (⇧↵)`"
        :disabled="running"
        @mousedown.stop
        @click.stop="$emit('run')"
      >
        <Loader2 v-if="running" :size="12" class="animate-spin"/>
        <Play v-else :size="10" :stroke-width="2.4" fill="currentColor" class="translate-x-[1px]"/>
      </button>
      <span class="font-mono text-[10px] leading-3 text-neutral-400" :title="cell.ranOn ? `Ran on the snapshot of ${cell.ranOn.label}` : 'Not run yet'">{{ runLabel }}</span>
    </div>

    <div class="flex items-baseline gap-2 px-4 pt-3">
      <span class="shrink-0 text-xs font-medium text-neutral-500">{{ number }}</span>
      <input
        :value="cell.title"
        class="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
        :placeholder="defaultTitle || 'Title'"
        aria-label="Cell title"
        @mousedown.stop="$emit('select')"
        @change="$emit('patch', { title: ($event.target as HTMLInputElement).value })"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <span v-if="stale && runnable" class="ui-tag shrink-0" :title="`Ran on ${cell.ranOn?.label ?? 'nothing yet'}; the report runs on ${kernelLabel}`">{{ cell.ranOn ? "older snapshot" : "not run" }}</span>
      <span v-else-if="changeText" class="ui-tag shrink-0" :title="changeText">changed</span>
      <span class="ui-tag shrink-0">{{ kindLabel }}</span>
    </div>

    <div class="px-4 pb-1 pt-2">
      <!-- SQL written in the cell, like a notebook's code cell. -->
      <div v-if="cell.spec.type === 'sql'" class="mb-2">
        <textarea
          :value="cell.spec.sql"
          rows="3"
          spellcheck="false"
          class="block w-full resize-y rounded-md bg-neutral-50 px-3 py-2 font-mono text-[12px] leading-5 text-neutral-800 outline-none focus:shadow-[0_0_0_1px_rgb(var(--c-accent-400))]"
          aria-label="SQL"
          @mousedown.stop="$emit('select')"
          @change="$emit('spec', { ...cell.spec, sql: ($event.target as HTMLTextAreaElement).value })"
          @keydown.shift.enter.prevent="$emit('spec', { ...cell.spec, sql: ($event.target as HTMLTextAreaElement).value }); $emit('run')"
        ></textarea>
      </div>

      <p v-if="!cell.output" class="py-6 text-center text-sm text-neutral-500">
        <template v-if="runnable">Not run yet. <button type="button" class="font-medium text-accent-700 hover:underline" @click.stop="$emit('run')">Run on {{ kernelLabel }}</button></template>
        <template v-else>Nothing captured.</template>
      </p>
      <p v-else-if="cell.output.error" class="rounded-md bg-red-50 px-3 py-2 font-mono text-xs text-red-800" role="alert">{{ cell.output.error }}</p>
      <template v-else>
        <img v-if="figure" :src="figure" :alt="title || defaultTitle" class="max-h-[520px] w-full rounded-md object-contain object-left">
        <p v-else-if="cell.output.figure && figureMissing" class="py-4 text-sm text-neutral-500">The figure file is missing. <template v-if="cell.spec.type === 'capture'">Open {{ cell.spec.view }} and add it again.</template></p>
        <div v-else-if="cell.output.figure" class="h-40 w-full animate-pulse rounded-md bg-neutral-100" role="img" aria-label="Loading figure"></div>
        <p v-if="cell.output.pin?.note" class="mt-2 text-[14px] leading-6 text-neutral-700">{{ cell.output.pin.note }}</p>
        <div v-if="table" class="mt-2 overflow-x-auto">
          <table class="nb-data w-full">
            <thead><tr><th v-for="(c, i) in table.columns" :key="i" :class="[table.align[i] === 'r' ? 'text-right' : 'text-left', i === 0 ? 'w-full' : '']">{{ c }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in shownRows" :key="i">
                <td v-for="(v, j) in r" :key="j" :class="[table.align[j] === 'r' ? 'whitespace-nowrap text-right font-mono tabular-nums' : '', j === 0 ? 'nb-name font-mono' : '']" :title="j === 0 ? v : undefined">{{ v }}</td>
              </tr>
            </tbody>
          </table>
          <button v-if="table.rows.length > ROWS && !allRows" type="button" class="mt-1 text-xs font-medium text-neutral-500 hover:text-neutral-900" @click.stop="allRows = true">Show all {{ table.rows.length }} rows</button>
          <p v-if="totalNote" class="mt-1 text-xs text-neutral-500">{{ totalNote }}</p>
        </div>
      </template>
    </div>

    <figcaption class="px-4 pb-3">
      <input
        :value="cell.caption"
        class="w-full bg-transparent text-[13px] italic leading-5 text-neutral-600 outline-none placeholder:not-italic placeholder:text-neutral-400"
        placeholder="Add a caption"
        aria-label="Caption"
        @mousedown.stop="$emit('select')"
        @change="$emit('patch', { caption: ($event.target as HTMLInputElement).value })"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <p class="mt-1 truncate font-mono text-[10.5px] leading-4 text-neutral-400" :title="provenance">{{ provenance }}</p>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Loader2, Play } from "lucide-vue-next";
import { describeChange, displayTable, provenanceLine } from "~/utils/reportCells";
import type { Cell, CellSpec } from "~/utils/reportDoc";

const props = defineProps<{
  cell: Cell
  number: string
  selected: boolean
  running: boolean
  stale: boolean
  kernelLabel: string
  figure: string | null
  workspace: string
  label: (id: string) => string
  /** The figure could not be read; until then it is loading. */
  figureMissing?: boolean
  /** The run gutter; a preview outside the notebook goes without. */
  gutter?: boolean
}>();
defineEmits<{
  (e: "select"): void
  (e: "run"): void
  (e: "patch", patch: Partial<Cell>): void
  (e: "spec", spec: CellSpec): void
}>();

const ROWS = 12;
const gutter = computed(() => props.gutter !== false);
const allRows = ref(false);
const runnable = computed(() => props.cell.spec.type !== "capture");
const kindLabel = computed(() => {
  const s = props.cell.spec;
  if (s.type === "pin") return "pin";
  if (s.type === "sql") return "SQL";
  if (s.type === "table") return s.source === "files" ? "files" : "components";
  return s.kind === "figure" ? "figure" : "captured table";
});
const defaultTitle = computed(() => props.cell.output?.pin?.title ?? (props.cell.spec.type === "capture" ? props.cell.spec.view : ""));
const title = computed(() => props.cell.title || defaultTitle.value);
const table = computed(() => displayTable(props.cell, props.label));
const shownRows = computed(() => (table.value ? (allRows.value ? table.value.rows : table.value.rows.slice(0, ROWS)) : []));
const totalNote = computed(() => {
  const t = props.cell.output?.table;
  if (!t) return "";
  if (t.total < 0) return `First ${t.rows.length} rows; the query returned more.`;
  return t.total > t.rows.length ? `${t.rows.length} of ${t.total.toLocaleString("en-US")}.` : "";
});
const provenance = computed(() => provenanceLine(props.cell.ranOn, props.workspace));
const runLabel = computed(() => {
  const r = props.cell.ranOn;
  if (!r) return "—";
  const d = new Date(r.label);
  return Number.isNaN(d.getTime()) ? r.label.split(",")[0] : r.label.split(",")[0];
});
const changeText = computed(() => describeChange(props.cell.previous, props.cell.output, props.label).replace(/^Unchanged.*$/, ""));
</script>

<style scoped>
.nb-data { border-collapse: collapse; font-size: 12.5px; }
.nb-data th { font-weight: 500; font-size: 11.5px; color: rgb(var(--c-neutral-500)); padding: 4px 10px 5px 0; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-300)); white-space: nowrap; }
.nb-data td { padding: 4px 10px 4px 0; color: rgb(var(--c-neutral-800)); box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-200)); }
.nb-data td:last-child, .nb-data th:last-child { padding-right: 0; }
/* The name takes what the numbers leave, and keeps its tail when cut. */
.nb-data td.nb-name { max-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
</style>
