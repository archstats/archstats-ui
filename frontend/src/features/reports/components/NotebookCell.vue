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
    <div v-if="gutter" class="absolute -left-[96px] top-2.5 flex w-[58px] flex-col items-end gap-1 text-right">
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
      <button
        v-if="cell.spec.type === 'sql' && gutter"
        type="button"
        class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 self-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover/cell:opacity-100"
        :class="{ 'opacity-100': selected }"
        title="Open this query in the SQL console, with the schema, a full result grid and its plan; Update cell there writes it back"
        @mousedown.stop
        @click.stop="$emit('console')"
      ><TerminalSquare :size="13" class="text-neutral-500"/> Open in console</button>
      <span class="ui-tag shrink-0">{{ kindLabel }}</span>
    </div>

    <div class="px-4 pb-1 pt-2">
      <!-- SQL written in the cell, like a notebook's code cell. -->
      <div v-if="cell.spec.type === 'sql' && (selected || !cell.spec.sql.trim() || !cell.output)" class="mb-2">
        <SqlEditor
          v-model="sqlDraft"
          :scan-id="scanId"
          :error="cell.output?.error ?? null"
          compact
          :min-rows="3"
          :max-rows="16"
          aria-label="SQL"
          @mousedown.stop="$emit('select')"
          @blur="commitSql"
          @run="commitSql(); $emit('run')"
        />
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
        <p v-if="table && !table.rows.length && cell.output.table" class="mt-2 text-[13.5px] text-neutral-500">{{ EMPTY_TABLE }}</p>
        <div v-else-if="table" class="mt-2 overflow-x-auto">
          <table class="nb-data w-full">
            <thead><tr><th v-for="(c, i) in table.columns" :key="i" :class="[table.align[i] === 'r' ? 'text-right' : 'text-left', i === 0 ? 'w-full' : '']">{{ headParts(c)[0] }}<span v-if="headParts(c)[1]" class="ml-1.5 whitespace-normal font-mono text-[11px] font-normal text-neutral-400">all in {{ headParts(c)[1] }}</span></th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in shownRows" :key="i">
                <td v-for="(v, j) in r" :key="j" :class="[table.align[j] === 'r' ? 'whitespace-nowrap text-right font-mono tabular-nums' : '', j === 0 ? 'nb-name font-mono' : identifier(v) ? 'nb-ident font-mono' : '']" :title="j === 0 || identifier(v) || table.full?.[i]?.[j] !== v ? table.full?.[i]?.[j] ?? v : undefined"><span v-if="j === 0 || identifier(v)" class="flex min-w-0"><span class="min-w-0 truncate">{{ splitTail(v)[0] }}</span><span class="shrink-0 whitespace-pre">{{ splitTail(v)[1] }}</span></span><template v-else>{{ v }}</template></td>
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
import { computed, ref, watch } from "vue";
import SqlEditor from "~/features/sql/components/SqlEditor.vue";
import { Loader2, Play, TerminalSquare } from "lucide-vue-next";
import { EMPTY_TABLE, describeChange, displayTable, provenanceLine } from "~/features/reports/reportCells";
import type { Cell, CellSpec } from "~/features/reports/reportDoc";

const props = withDefaults(defineProps<{
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
  /** The snapshot a SQL cell's schema and values come from. */
  scanId?: string | null
}>(), { gutter: true, figureMissing: false, scanId: null });
const emit = defineEmits<{
  (e: "select"): void
  (e: "run"): void
  (e: "patch", patch: Partial<Cell>): void
  (e: "spec", spec: CellSpec): void
  (e: "console"): void
}>();

const ROWS = 12;
// The SQL being written; it becomes the cell's when the editor is left or run.
const sqlDraft = ref(props.cell.spec.type === "sql" ? props.cell.spec.sql : "");
watch(() => (props.cell.spec.type === "sql" ? props.cell.spec.sql : ""), v => { sqlDraft.value = v; });
function commitSql() {
  const s = props.cell.spec;
  if (s.type === "sql" && sqlDraft.value !== s.sql) emit("spec", { ...s, sql: sqlDraft.value });
}
const gutter = computed(() => props.gutter !== false);
const allRows = ref(false);
const runnable = computed(() => props.cell.spec.type !== "capture");
const kindLabel = computed(() => {
  const s = props.cell.spec;
  if (s.type === "pin") return "pin";
  if (s.type === "sql") return "SQL";
  if (s.type === "table") return s.source === "files" ? "files" : "components";
  if (s.type === "reading") return "computed";
  if (s.type === "slot") return "to add";
  return s.kind === "figure" ? "figure" : "captured table";
});
const defaultTitle = computed(() => props.cell.output?.pin?.title ?? (props.cell.spec.type === "capture" ? props.cell.spec.view : ""));
const title = computed(() => props.cell.title || defaultTitle.value);
const table = computed(() => displayTable(props.cell, props.label));
const shownRows = computed(() => (table.value ? (allRows.value ? table.value.rows : table.value.rows.slice(0, ROWS)) : []));
const totalNote = computed(() => {
  const t = props.cell.output?.table;
  if (!t) return "";
  const of = t.total < 0 ? `First ${t.rows.length} rows; the query returned more.` : t.total > t.rows.length ? `${t.rows.length} of ${t.total.toLocaleString("en-US")}.` : "";
  return [of, t.note ?? ""].filter(Boolean).join(" ");
});
const provenance = computed(() => provenanceLine(props.cell.ranOn, props.workspace));
const runLabel = computed(() => {
  const r = props.cell.ranOn;
  if (!r) return "—";
  const d = new Date(r.label);
  return Number.isNaN(d.getTime()) ? r.label.split(",")[0] : r.label.split(",")[0];
});
/** "Package (all in org.example)" as the label and the parent every row shares. */
function headParts(c: string): [string, string] {
  const m = /^(.*) \(all in (.+)\)$/.exec(c);
  return m ? [m[1], m[2]] : [c, ""];
}
/** A path or dotted name, which reads cut in the middle rather than wrapped mid-word. */
function identifier(v: unknown): boolean {
  const s = String(v ?? "");
  return s.length > 24 && !s.includes(" ") && /[./\\]/.test(s);
}
/** A name cut in the middle: the head can shrink to an ellipsis, the last segment always shows. */
function splitTail(v: unknown): [string, string] {
  const s = String(v ?? "");
  // A path splits at its last folder, a dotted name at its last dot; words are cut at the end.
  const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (slash <= 0 && s.includes(" ")) return [s, ""];
  const at = slash > 0 ? slash : s.lastIndexOf(".");
  // No separator, or a last segment too long to keep whole: an ordinary cut at the end.
  if (at <= 0 || s.length - at > 32) return [s, ""];
  return [s.slice(0, at), s.slice(at)];
}
const changeText = computed(() => describeChange(props.cell.previous, props.cell.output, props.label).replace(/^Unchanged.*$/, ""));
</script>

<style scoped>
.nb-data { border-collapse: collapse; font-size: 12.5px; }
.nb-data th { font-weight: 500; font-size: 11.5px; color: rgb(var(--c-neutral-500)); padding: 4px 10px 5px 0; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-300)); white-space: nowrap; }
.nb-data td { padding: 4px 10px 4px 0; color: rgb(var(--c-neutral-800)); box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-200)); }
.nb-data td:last-child, .nb-data th:last-child { padding-right: 0; }
/* The name takes what the numbers leave; when cut, the middle goes and the last segment stays. */
.nb-data td.nb-name { max-width: 0; width: 100%; min-width: 16ch; overflow: hidden; white-space: nowrap; }
/* Other text columns wrap rather than push the name column to nothing. */
.nb-data td:not(.nb-name):not(.nb-ident) { overflow-wrap: break-word; }
/* A path or dotted name in another column: one line, its middle cut, the whole on hover. */
.nb-data td.nb-ident { max-width: 30ch; overflow: hidden; white-space: nowrap; }
</style>
