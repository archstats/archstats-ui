<template>
  <!-- A result as a data grid: only the rows in sight are drawn, columns
       size to their values and can be dragged wider, cells select like a
       spreadsheet's and copy as tab-separated text. A column of component or
       file names gets checkboxes for a group, and its names open. -->
  <div class="flex min-h-0 min-w-0 flex-1">
    <div class="flex min-w-0 flex-1 flex-col">
      <div
        ref="scroller"
        class="rg-scroll min-h-0 flex-1 overflow-auto outline-none"
        tabindex="0"
        role="grid"
        :aria-rowcount="rows.length + 1"
        :aria-colcount="columns.length"
        :aria-label="t('sql.resultGrid.result')"
        @scroll="onScroll"
        @keydown="onKey"
      >
        <table class="rg" :style="{ width: `${totalWidth}px` }">
          <colgroup>
            <col v-if="unit" :style="{ width: `${CHECK_W}px` }">
            <col :style="{ width: `${numW}px` }">
            <col v-for="(w, j) in widths" :key="j" :style="{ width: `${w}px` }">
          </colgroup>
          <thead>
            <tr>
              <th v-if="unit" class="rg-check rg-stick" :style="{ left: '0px' }">
                <Checkbox :model-value="allUnits" :aria-label="t('sql.resultGrid.selectEveryResult', { kind: unit.kind })" @update:model-value="toggleAll"/>
              </th>
              <th class="rg-num rg-stick" :style="{ left: `${unit ? CHECK_W : 0}px` }" :aria-label="t('sql.resultGrid.row')"></th>
              <th
                v-for="(c, j) in columns"
                :key="j"
                class="rg-head"
                :class="{ 'rg-head-sorted': sort?.col === j, 'text-right': numeric[j] }"
                :title="docOf(j) ? undefined : headTitle(j)"
                :aria-sort="sort?.col === j ? (sort.desc ? 'descending' : 'ascending') : 'none'"
                @click="$emit('sort', j)"
                @mouseenter="e => cardFor(j, e)"
                @mouseleave="cardLeave"
              >
                <span class="rg-head-in" :class="numeric[j] ? 'flex-row-reverse' : ''">
                  <span class="min-w-0 truncate" :class="{ 'rg-head-metric': docOf(j), 'rg-head-name': names && docOf(j) }">{{ names && docOf(j) ? docOf(j)!.name : c }}</span>
                  <ArrowDown v-if="sort?.col === j && sort.desc" :size="11" class="shrink-0"/>
                  <ArrowUp v-else-if="sort?.col === j" :size="11" class="shrink-0"/>
                </span>
                <span class="rg-resize" aria-hidden="true" @mousedown.stop.prevent="startResize($event, j)" @click.stop @dblclick.stop="fitColumn(j)"></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="start > 0" aria-hidden="true"><td :colspan="columns.length + (unit ? 2 : 1)" :style="{ height: `${start * ROW}px`, padding: 0 }"></td></tr>
            <tr v-for="(row, k) in visible" :key="start + k" class="rg-row" :class="[{ 'rg-row-unit': unit && units.has(String(row[unit.index])) }, diff ? `rg-d-${diff[start + k]?.status}` : '']" :aria-rowindex="start + k + 2">
              <td v-if="unit" class="rg-check rg-stick" :style="{ left: '0px' }">
                <Checkbox :model-value="units.has(String(row[unit.index]))" :aria-label="t('sql.resultGrid.select', { value: row[unit.index] })" @update:model-value="$emit('toggle-unit', String(row[unit.index]))"/>
              </td>
              <td class="rg-num rg-stick" :style="{ left: `${unit ? CHECK_W : 0}px` }" @mousedown.prevent="selectRow(start + k, $event)"><span v-if="diff" class="rg-mark" :title="STATUS[diff[start + k]?.status ?? 'same'].title">{{ STATUS[diff[start + k]?.status ?? "same"].mark }}</span>{{ start + k + 1 }}</td>
              <td
                v-for="(cell, j) in row"
                :key="j"
                class="rg-cell"
                :class="[cellClass(cell, j), { 'rg-sel': inSel(start + k, j), 'rg-focus': focus && focus.r === start + k && focus.c === j, 'rg-moved': moved(start + k, j) }]"
                :title="moved(start + k, j) ? t('sql.resultGrid.wasBaseline', { value: show(diff![start + k].before![j]) }) : undefined"
                @mousedown="onCellDown($event, start + k, j)"
                @mouseenter="onCellEnter(start + k, j)"
                @dblclick="onCellOpen(start + k, j)"
              ><span v-if="moved(start + k, j) && delta(start + k, j)" class="rg-delta">{{ delta(start + k, j) }}</span><template v-for="(part, p) in parts(cell)" :key="p"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></td>
            </tr>
            <tr v-if="end < rows.length" aria-hidden="true"><td :colspan="columns.length + (unit ? 2 : 1)" :style="{ height: `${(rows.length - end) * ROW}px`, padding: 0 }"></td></tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="rg-empty">{{ emptyText }}</p>
      </div>

      <!-- What is selected, the way an IDE's status line counts it. -->
      <div class="rg-status" role="status">
        <template v-if="stats">
          <span v-if="stats.cells === 1" class="min-w-0 truncate"><I18nT k="sql.resultGrid.row2"><template #value><span class="font-mono">{{ columns[focus!.c] }}</span></template><template #value2>{{ fmt(focus!.r + 1) }}</template><template #rowsLength>{{ fmt(rows.length) }}</template></I18nT></span>
          <span v-else>{{ t('sql.resultGrid.cells', { cells: fmt(stats.cells) }) }}<template v-if="stats.rows > 1">{{ ' ' + t('sql.resultGrid.rows', { rows: fmt(stats.rows) }) }}</template></span>
          <template v-if="stats.nums > 1">
            <span class="rg-agg">{{ t('sql.resultGrid.sum') }} <b>{{ fmt(stats.sum) }}</b></span>
            <span class="rg-agg">{{ t('sql.resultGrid.avg') }} <b>{{ fmt(stats.sum / stats.nums) }}</b></span>
            <span class="rg-agg">{{ t('sql.resultGrid.min') }} <b>{{ fmt(stats.min) }}</b></span>
            <span class="rg-agg">{{ t('sql.resultGrid.max') }} <b>{{ fmt(stats.max) }}</b></span>
          </template>
        </template>
        <span v-else class="text-neutral-400">{{ t('sql.resultGrid.clickCellExtendsC') }}</span>
      </div>
    </div>

    <!-- The value in full: long paths, file contents, JSON. -->
    <aside v-if="viewer" class="rg-viewer hairline-l" :aria-label="t('sql.resultGrid.value')">
      <header class="flex h-8 shrink-0 items-center gap-2 px-3 hairline-b">
        <div class="ui-segmented" role="group" :aria-label="t('sql.resultGrid.show')">
          <button type="button" :aria-pressed="viewerMode === 'value'" @click="viewerMode = 'value'">{{ t('sql.resultGrid.value') }}</button>
          <button type="button" :aria-pressed="viewerMode === 'row'" @click="viewerMode = 'row'">{{ t('sql.resultGrid.row') }}</button>
        </div>
        <span class="flex-1"></span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="!focus" :title="t('sql.resultGrid.copyValue')" :aria-label="t('sql.resultGrid.copyValue')" @click="copyValue"><Copy :size="12"/></button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :title="t('sql.resultGrid.hideValuePane')" :aria-label="t('sql.resultGrid.hideValuePane')" @click="$emit('update:viewer', false)"><X :size="12"/></button>
      </header>
      <dl v-if="viewerMode === 'row' && focus" class="rg-record min-h-0 flex-1 overflow-auto">
        <template v-for="(c, j) in columns" :key="j">
          <dt :class="{ 'rg-record-on': focus.c === j }" :title="define(c) ? `${define(c)!.name}: ${define(c)!.short}` : ''" @click="moveTo({ r: focus.r, c: j }, false)">{{ names && define(c) ? define(c)!.name : c }}</dt>
          <dd :class="[cellClass(rows[focus.r]?.[j], j), { 'rg-record-on': focus.c === j }]" @click="moveTo({ r: focus.r, c: j }, false)">{{ show(rows[focus.r]?.[j]) }}<span v-if="moved(focus.r, j)" class="rg-record-was">{{ t('sql.resultGrid.was', { value: show(diff![focus.r].before![j]) }) }}</span></dd>
        </template>
      </dl>
      <div v-else-if="focusValue" class="min-h-0 flex-1 overflow-auto p-3">
        <p class="font-mono text-[11.5px] font-medium text-neutral-900">{{ focusValue.column }}</p>
        <p class="mt-0.5 text-[11.5px] text-neutral-500">{{ focusValue.kind }}</p>
        <pre class="rg-value" :class="{ 'rg-null': focusValue.value === null }">{{ focusValue.text }}</pre>
        <section v-if="focusValue.doc" class="rg-def" :aria-label="t('sql.resultGrid.definition')">
          <p class="ui-section-title">{{ focusValue.doc.category || t('sql.resultGrid.metric') }}</p>
          <p class="rg-def-name">{{ focusValue.doc.name }}</p>
          <p v-if="focusValue.doc.short" class="rg-def-short">{{ focusValue.doc.short }}</p>
          <p v-if="focusValue.doc.long && focusValue.doc.long !== focusValue.doc.short" class="rg-def-long">{{ focusValue.doc.long }}</p>
          <button type="button" class="rg-def-link" @click="$emit('reference', focusValue.doc.id)">{{ t('sql.resultGrid.openMetricReference') }}</button>
        </section>
      </div>
      <p v-else class="p-3 text-xs text-neutral-500">{{ t('sql.resultGrid.selectCellRead', { value: viewerMode === "row" ? t('sql.resultGrid.rowList') : t('sql.resultGrid.valueFull') }) }}</p>
    </aside>

    <!-- A metric column's definition, on hovering its header. -->
    <Teleport to="body">
      <div v-if="card && docOf(card.j)" class="rg-card ui-popover" :style="{ left: `${card.x}px`, top: `${card.y}px` }" role="tooltip" @mouseenter="cardStay" @mouseleave="cardLeave">
        <p class="ui-section-title">{{ docOf(card.j)!.category || t('sql.resultGrid.metric') }}</p>
        <p class="rg-def-name">{{ docOf(card.j)!.name }}</p>
        <p class="font-mono text-[11px] text-neutral-500">{{ columns[card.j] }}</p>
        <p v-if="docOf(card.j)!.short" class="rg-def-short">{{ docOf(card.j)!.short }}</p>
        <p v-if="docOf(card.j)!.long && docOf(card.j)!.long !== docOf(card.j)!.short" class="rg-def-long rg-card-long">{{ docOf(card.j)!.long }}</p>
        <p class="rg-card-foot">
          <span>{{ t('sql.resultGrid.clickSortDragEdge') }}</span>
          <button type="button" class="rg-def-link" @click="$emit('reference', columns[card.j]); card = null">{{ t('sql.resultGrid.metricReference') }}</button>
        </p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDown, ArrowUp, Copy, X } from "lucide-vue-next";
import Checkbox from "~/shared/ui/Checkbox.vue";
import { t, intlLocale } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT";

const props = withDefaults(defineProps<{
  columns: string[]
  rows: unknown[][]
  sort?: { col: number; desc: boolean } | null
  /** A column of component or file names, and the ones ticked for a group. */
  unit?: { index: number; kind: "component" | "file" } | null
  units?: Set<string>
  /** Text to mark in the cells (the row filter). */
  highlight?: string
  viewer?: boolean
  /** A metric column's definition, when the snapshot defines it. */
  define?: (column: string) => { id: string; name: string; short: string; long: string; category: string } | null
  /** Headers read the metrics' names rather than their ids. */
  names?: boolean
  emptyText?: string
  /** Against a baseline: each row's status and the baseline's values, aligned with rows. */
  diff?: Array<{ status: "added" | "removed" | "changed" | "same"; before: unknown[] | null }> | null
}>(), { diff: null, sort: null, unit: null, units: () => new Set(), highlight: "", viewer: false, define: () => null, names: false, emptyText: t("sql.resultGrid.noRows") });
const emit = defineEmits<{
  (e: "sort", col: number): void
  (e: "toggle-unit", value: string): void
  (e: "set-units", values: string[]): void
  (e: "open-unit", kind: "component" | "file", value: string): void
  (e: "update:viewer", on: boolean): void
  (e: "copied", what: string): void
  (e: "reference", id: string): void
}>();

const ROW = 24;
const STATUS = {
  added: { mark: "+", title: t("sql.resultGrid.onlySnapshot") },
  removed: { mark: "−", title: t("sql.resultGrid.onlyBaseline") },
  changed: { mark: "~", title: t("sql.resultGrid.changedSinceBaseline") },
  same: { mark: "", title: t("sql.resultGrid.sameBoth") },
} as const;
const viewerMode = ref<"value" | "row">("value");
/** A cell whose value differs from the baseline's. */
function moved(r: number, j: number) {
  const d = props.diff?.[r];
  if (!d || d.status !== "changed" || !d.before) return false;
  const a = props.rows[r]?.[j], b = d.before[j];
  if (b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a));
  return String(a ?? "") !== String(b ?? "");
}
function delta(r: number, j: number) {
  const a = props.rows[r]?.[j], b = props.diff?.[r]?.before?.[j];
  if (typeof a !== "number" || typeof b !== "number") return "";
  const d = a - b;
  return `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`;
}
const CHECK_W = 30;
const CHAR = 7.25;
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString(intlLocale) : n.toLocaleString(intlLocale, { maximumFractionDigits: 4 }));
const show = (v: unknown) => (v === null || v === undefined ? "null" : typeof v === "number" ? fmt(v) : String(v).replace(/\r?\n/g, " ↵ "));

// ── Columns ─────────────────────────────────────────────────────────────
const numeric = computed(() => props.columns.map((_, j) => {
  let seen = false;
  for (const r of props.rows.slice(0, 300)) { const v = r[j]; if (v === null || v === undefined) continue; if (typeof v !== "number") return false; seen = true; }
  return seen;
}));
const natural = (j: number) => {
  let w = props.columns[j].length * CHAR + 30;
  for (const r of props.rows.slice(0, 200)) w = Math.max(w, Math.min(60, show(r[j]).length) * CHAR + 22);
  return Math.round(Math.max(64, Math.min(440, w)));
};
const resized = ref<Record<string, number>>({});
const shape = computed(() => props.columns.join("\u0001"));
watch(shape, () => { resized.value = {}; });
const widths = computed(() => props.columns.map((c, j) => resized.value[`${j}:${c}`] ?? natural(j)));
const numW = computed(() => Math.max(40, String(props.rows.length).length * CHAR + 20) + (props.diff ? 16 : 0));
const totalWidth = computed(() => widths.value.reduce((a, b) => a + b, 0) + numW.value + (props.unit ? CHECK_W : 0));

let drag: { j: number; x: number; w: number } | null = null;
function startResize(e: MouseEvent, j: number) {
  drag = { j, x: e.clientX, w: widths.value[j] };
  document.body.style.cursor = "col-resize";
  window.addEventListener("mousemove", onResize);
  window.addEventListener("mouseup", endResize, { once: true });
}
function onResize(e: MouseEvent) {
  if (!drag) return;
  resized.value = { ...resized.value, [`${drag.j}:${props.columns[drag.j]}`]: Math.max(48, Math.round(drag.w + e.clientX - drag.x)) };
}
function endResize() {
  drag = null;
  document.body.style.cursor = "";
  window.removeEventListener("mousemove", onResize);
}
/** Double-clicking a column's edge fits it to every loaded value, not only the first rows. */
function fitColumn(j: number) {
  let w = props.columns[j].length * CHAR + 30;
  for (const r of props.rows) w = Math.max(w, Math.min(120, show(r[j]).length) * CHAR + 22);
  resized.value = { ...resized.value, [`${j}:${props.columns[j]}`]: Math.round(Math.min(900, w)) };
}
function headTitle(j: number) {
  return t("sql.resultGrid.clickSortDragEdge2", { value: props.columns[j] });
}
const docOf = (j: number) => props.define(props.columns[j]);

// The definition card: opens after a short rest on a metric's header, and stays while the pointer is on it.
const card = ref<{ j: number; x: number; y: number } | null>(null);
let cardTimer: ReturnType<typeof setTimeout> | null = null;
function cardFor(j: number, e: MouseEvent) {
  if (cardTimer) clearTimeout(cardTimer);
  if (!docOf(j)) { card.value = null; return; }
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  cardTimer = setTimeout(() => {
    if (drag) return;
    card.value = { j, x: Math.max(8, Math.min(box.left, window.innerWidth - 368)), y: box.bottom + 4 };
  }, card.value ? 60 : 420);
}
function cardStay() { if (cardTimer) clearTimeout(cardTimer); }
function cardLeave() {
  if (cardTimer) clearTimeout(cardTimer);
  cardTimer = setTimeout(() => { card.value = null; }, 160);
}

// ── Rows in sight ───────────────────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewH = ref(400);
const start = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW) - 8));
const end = computed(() => Math.min(props.rows.length, Math.ceil((scrollTop.value + viewH.value) / ROW) + 8));
const visible = computed(() => props.rows.slice(start.value, end.value));
function onScroll() { scrollTop.value = scroller.value?.scrollTop ?? 0; }
let ro: ResizeObserver | null = null;
onMounted(() => {
  viewH.value = scroller.value?.clientHeight || 400;
  ro = new ResizeObserver(() => { viewH.value = scroller.value?.clientHeight ?? 400; });
  if (scroller.value) ro.observe(scroller.value);
});
onBeforeUnmount(() => { ro?.disconnect(); endResize(); if (cardTimer) clearTimeout(cardTimer); window.removeEventListener("mouseup", endSelect); });
watch(() => props.rows, () => { anchor.value = null; focus.value = null; if (scroller.value) scroller.value.scrollTop = 0; scrollTop.value = 0; });

// ── Selection ───────────────────────────────────────────────────────────
type Pos = { r: number; c: number };
const anchor = ref<Pos | null>(null);
const focus = ref<Pos | null>(null);
const box = computed(() => {
  if (!anchor.value || !focus.value) return null;
  return { r0: Math.min(anchor.value.r, focus.value.r), r1: Math.max(anchor.value.r, focus.value.r), c0: Math.min(anchor.value.c, focus.value.c), c1: Math.max(anchor.value.c, focus.value.c) };
});
const inSel = (r: number, c: number) => { const b = box.value; return !!b && r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1; };
let selecting = false;
function onCellDown(e: MouseEvent, r: number, c: number) {
  if (e.button !== 0) return;
  scroller.value?.focus({ preventScroll: true });
  if (e.shiftKey && anchor.value) focus.value = { r, c };
  else { anchor.value = { r, c }; focus.value = { r, c }; }
  selecting = true;
  window.addEventListener("mouseup", endSelect, { once: true });
}
function onCellEnter(r: number, c: number) { if (selecting) focus.value = { r, c }; }
function endSelect() { selecting = false; }
function selectRow(r: number, e: MouseEvent) {
  scroller.value?.focus({ preventScroll: true });
  const last = props.columns.length - 1;
  if (e.shiftKey && anchor.value) { anchor.value = { r: anchor.value.r, c: 0 }; focus.value = { r, c: last }; }
  else { anchor.value = { r, c: 0 }; focus.value = { r, c: last }; }
}
function moveTo(p: Pos, extend: boolean) {
  const r = Math.max(0, Math.min(props.rows.length - 1, p.r)), c = Math.max(0, Math.min(props.columns.length - 1, p.c));
  focus.value = { r, c };
  if (!extend) anchor.value = { r, c };
  void nextTick(() => {
    const el = scroller.value;
    if (!el) return;
    const top = r * ROW, head = 28;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW + head > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW + head - el.clientHeight;
    let x = numW.value + (props.unit ? CHECK_W : 0);
    for (let j = 0; j < c; j++) x += widths.value[j];
    const w = widths.value[c], sticky = numW.value + (props.unit ? CHECK_W : 0);
    if (x - sticky < el.scrollLeft) el.scrollLeft = x - sticky;
    else if (x + w > el.scrollLeft + el.clientWidth) el.scrollLeft = x + w - el.clientWidth;
  });
}
function onKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  const f = focus.value ?? { r: 0, c: 0 };
  const page = Math.max(1, Math.floor(viewH.value / ROW) - 2);
  const moves: Record<string, Pos> = {
    ArrowDown: { r: mod ? props.rows.length - 1 : f.r + 1, c: f.c },
    ArrowUp: { r: mod ? 0 : f.r - 1, c: f.c },
    ArrowRight: { r: f.r, c: mod ? props.columns.length - 1 : f.c + 1 },
    ArrowLeft: { r: f.r, c: mod ? 0 : f.c - 1 },
    PageDown: { r: f.r + page, c: f.c },
    PageUp: { r: f.r - page, c: f.c },
    Home: { r: mod ? 0 : f.r, c: 0 },
    End: { r: mod ? props.rows.length - 1 : f.r, c: props.columns.length - 1 },
  };
  if (moves[e.key] && props.rows.length) { e.preventDefault(); moveTo(focus.value ? moves[e.key] : { r: 0, c: 0 }, e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); anchor.value = { r: 0, c: 0 }; focus.value = { r: props.rows.length - 1, c: props.columns.length - 1 }; return; }
  if (mod && e.key.toLowerCase() === "c" && box.value) { e.preventDefault(); void copySelection(); return; }
  if (e.key === "Enter" && focus.value) { e.preventDefault(); onCellOpen(focus.value.r, focus.value.c); return; }
  if (e.key === " " && focus.value && props.unit) { e.preventDefault(); emit("toggle-unit", String(props.rows[focus.value.r][props.unit.index])); return; }
  if (e.key === "Escape") { anchor.value = null; focus.value = null; }
}

async function copyText(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); emit("copied", what); } catch { /* the webview refused the clipboard */ }
}
function raw(v: unknown) { return v === null || v === undefined ? "" : String(v); }
async function copySelection() {
  const b = box.value;
  if (!b) return;
  const lines: string[] = [];
  for (let r = b.r0; r <= b.r1; r++) lines.push(props.rows[r].slice(b.c0, b.c1 + 1).map(v => raw(v).replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  const n = (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1);
  // One cell copies as it is, newlines and all.
  await copyText(n === 1 ? raw(props.rows[b.r0][b.c0]) : lines.join("\n"), n === 1 ? "value" : t("sql.resultGrid.cells2", { n: fmt(n) }));
}
function copyValue() { if (focus.value) void copyText(raw(props.rows[focus.value.r][focus.value.c]), "value"); }

const stats = computed(() => {
  const b = box.value;
  if (!b) return null;
  let nums = 0, sum = 0, min = Infinity, max = -Infinity;
  const cells = (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1);
  if (cells <= 200_000) {
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) {
      const v = props.rows[r]?.[c];
      if (typeof v === "number") { nums++; sum += v; if (v < min) min = v; if (v > max) max = v; }
    }
  }
  return { cells, rows: b.r1 - b.r0 + 1, nums, sum, min, max };
});

const focusValue = computed(() => {
  const f = focus.value;
  if (!f) return null;
  const v = props.rows[f.r]?.[f.c];
  const column = props.columns[f.c];
  const text = v === null || v === undefined ? t("sql.resultGrid.null") : typeof v === "string" && /^[[{]/.test(v.trim()) ? pretty(v) : String(v);
  const kind = v === null || v === undefined ? "null" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "real") : t("sql.resultGrid.textCharacters", { length: fmt(String(v).length) });
  return { column, value: v ?? null, text, kind, doc: props.define(column) };
});
function pretty(s: string) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } }

// ── Cells ───────────────────────────────────────────────────────────────
function cellClass(v: unknown, j: number) {
  if (v === null || v === undefined) return "rg-null";
  if (numeric.value[j]) return "rg-numeric";
  if (props.unit?.index === j) return "rg-unit";
  return "";
}
const hl = computed(() => props.highlight.trim().toLowerCase());
function parts(v: unknown) {
  const text = show(v);
  const q = hl.value;
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return [{ text, hit: false }];
  return [{ text: text.slice(0, at), hit: false }, { text: text.slice(at, at + q.length), hit: true }, { text: text.slice(at + q.length), hit: false }];
}
function onCellOpen(r: number, c: number) {
  if (props.unit?.index === c) emit("open-unit", props.unit.kind, String(props.rows[r][c]));
}

const allUnits = computed(() => !!props.unit && props.rows.length > 0 && props.rows.every(r => props.units.has(String(r[props.unit!.index]))));
function toggleAll() {
  if (!props.unit) return;
  emit("set-units", allUnits.value ? [] : [...new Set(props.rows.map(r => String(r[props.unit!.index])))]);
}

defineExpose({ focus: () => scroller.value?.focus(), copySelection });
</script>

<style scoped>
.rg-scroll { position: relative; background: rgb(var(--c-surface)); }
.rg-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.rg-scroll::-webkit-scrollbar-thumb { background: rgb(var(--c-neutral-300)); border-radius: 5px; border: 2px solid rgb(var(--c-surface)); }
.rg-scroll::-webkit-scrollbar-corner { background: rgb(var(--c-surface)); }
.rg { table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.rg th, .rg td { height: 24px; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-100)); }
.rg thead th { position: sticky; top: 0; z-index: 2; height: 28px; background: rgb(var(--c-neutral-50)); box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-200)); }
.rg thead th.rg-stick { z-index: 3; }
.rg-stick { position: sticky; z-index: 1; background: rgb(var(--c-neutral-50)); }
.rg-head { position: relative; cursor: default; text-align: left; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; font-weight: 500; color: rgb(var(--c-neutral-700)); user-select: none; }
.rg-head:hover { background: rgb(var(--c-neutral-100)); }
.rg-head-sorted { color: rgb(var(--c-neutral-950)); }
.rg-head-in { display: flex; align-items: center; gap: 4px; min-width: 0; }
.rg-resize { position: absolute; top: 0; right: -3px; bottom: 0; width: 7px; cursor: col-resize; z-index: 4; }
.rg-resize:hover { background: linear-gradient(to right, transparent 3px, rgb(var(--c-accent-400)) 3px, rgb(var(--c-accent-400)) 4px, transparent 4px); }
.rg-num { text-align: right; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10.5px; color: rgb(var(--c-neutral-400)); font-variant-numeric: tabular-nums; cursor: default; user-select: none; }
.rg-check { padding: 0 !important; text-align: center; }
.rg-check > * { vertical-align: middle; }
.rg-row:hover td:not(.rg-stick):not(.rg-sel) { background: rgb(var(--c-neutral-50)); }
.rg-row-unit td:not(.rg-stick) { background: rgb(var(--c-accent-50) / 0.6); }
.rg-cell { font-family: "JetBrains Mono", ui-monospace, monospace; color: rgb(var(--c-neutral-800)); cursor: cell; user-select: none; }
.rg-numeric { text-align: right; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-700)); }
.rg-null { color: rgb(var(--c-neutral-400)); font-style: italic; }
.rg-unit { color: rgb(var(--c-neutral-950)); font-weight: 500; }
.rg-unit:hover { text-decoration: underline; text-decoration-color: rgb(var(--c-neutral-300)); text-underline-offset: 3px; }
.rg .rg-sel { background: rgb(var(--c-accent-50)); }
.rg-scroll:focus .rg-focus, .rg-scroll:focus-visible .rg-focus { box-shadow: inset 0 0 0 1px rgb(var(--c-accent-500)); }
.rg-focus { box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-400)); }
.rg-cell mark { background: rgb(var(--c-accent-200) / 0.8); color: inherit; border-radius: 2px; }
.rg-mark { display: inline-block; width: 12px; margin-right: 4px; text-align: center; font-weight: 600; font-size: 12px; }
.rg-d-added .rg-mark { color: rgb(var(--c-green-700)); }
.rg-d-removed .rg-mark { color: rgb(var(--c-red-700)); }
.rg-d-changed .rg-mark { color: rgb(var(--c-amber-800)); }
.rg-d-added td:not(.rg-stick) { background: rgb(var(--c-green-50) / 0.7); }
.rg-d-removed td:not(.rg-stick) { background: rgb(var(--c-red-50) / 0.6); color: rgb(var(--c-neutral-500)); }
.rg-d-removed .rg-unit { text-decoration: line-through; text-decoration-color: rgb(var(--c-neutral-400)); }
.rg .rg-moved { background: rgb(var(--c-amber-50)); }
.rg-delta { float: left; margin-right: 8px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.rg-numeric .rg-delta { float: none; margin: 0 8px 0 0; }
.rg-record { display: grid; grid-template-columns: minmax(90px, 40%) 1fr; align-content: start; font-size: 11.5px; }
.rg-record dt, .rg-record dd { padding: 4px 12px; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-100)); overflow-wrap: anywhere; cursor: default; }
.rg-record dt { font-family: "JetBrains Mono", ui-monospace, monospace; color: rgb(var(--c-neutral-600)); }
.rg-record dd { margin: 0; font-family: "JetBrains Mono", ui-monospace, monospace; color: rgb(var(--c-neutral-900)); user-select: text; }
.rg-record .rg-record-on { background: rgb(var(--c-accent-50)); }
.rg-record-was { display: block; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.rg-head-metric { text-decoration: underline dotted rgb(var(--c-neutral-400)); text-underline-offset: 4px; }
.rg-head-name { font-family: Inter, system-ui, sans-serif; font-size: 12px; }
.rg-def { margin-top: 14px; padding-top: 12px; box-shadow: inset 0 1px 0 rgb(var(--c-neutral-200)); }
.rg-def-name { margin-top: 2px; font-size: 13px; font-weight: 600; line-height: 18px; color: rgb(var(--c-neutral-950)); }
.rg-def-short { margin-top: 4px; font-size: 12px; line-height: 17px; color: rgb(var(--c-neutral-800)); }
.rg-def-long { margin-top: 6px; font-size: 11.5px; line-height: 17px; color: rgb(var(--c-neutral-600)); white-space: pre-line; }
.rg-def-link { margin-top: 8px; font-size: 11.5px; font-weight: 500; color: rgb(var(--c-accent-700)); }
.rg-def-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.rg-card { position: fixed; z-index: 80; width: 360px; padding: 10px 12px; animation: rg-in 140ms cubic-bezier(0.16, 1, 0.3, 1); }
.rg-card-long { display: -webkit-box; -webkit-line-clamp: 7; -webkit-box-orient: vertical; overflow: hidden; }
.rg-card-foot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 8px; padding-top: 6px; font-size: 11px; color: rgb(var(--c-neutral-500)); box-shadow: inset 0 1px 0 rgb(var(--c-neutral-100)); }
.rg-card-foot .rg-def-link { margin-top: 0; }
@keyframes rg-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rg-card { animation: none; } }
.rg-empty { padding: 20px 16px; font-size: 12.5px; color: rgb(var(--c-neutral-500)); }
.rg-status { display: flex; align-items: center; gap: 14px; height: 24px; flex-shrink: 0; padding: 0 12px; font-size: 11.5px; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-50)); box-shadow: inset 0 1px 0 rgb(var(--c-neutral-200)); white-space: nowrap; overflow: hidden; }
.rg-agg { font-size: 11px; color: rgb(var(--c-neutral-500)); }
.rg-agg b { font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 500; color: rgb(var(--c-neutral-900)); font-variant-numeric: tabular-nums; }
.rg-viewer { display: flex; width: 320px; flex-shrink: 0; flex-direction: column; background: rgb(var(--c-neutral-50)); }
.rg-value { margin-top: 10px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; line-height: 18px; color: rgb(var(--c-neutral-900)); user-select: text; }
.rg-value::selection { background: rgb(var(--c-accent-200)); }
</style>
