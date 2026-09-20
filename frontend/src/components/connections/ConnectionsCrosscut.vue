<template>
  <div class="h-full w-full overflow-auto bg-surface" @mouseleave="emit('hover', null)">
    <table class="crosscut border-separate border-spacing-0 font-mono text-xs" :style="{ '--cell-w': CELL_W + 'px', '--cell-h': CELL_H + 'px' }">
      <thead>
        <tr>
          <th class="corner sticky left-0 top-0 z-30 bg-surface hairline-b hairline-r" :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: HEAD_H + 'px' }">
            <span class="flex h-full flex-col justify-end px-2 pb-1.5 text-left font-sans">
              <span class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{{ rowDimension }} <span class="text-neutral-300">rows</span></span>
              <span class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{{ colDimension }} <span class="text-neutral-300">columns</span></span>
            </span>
          </th>
          <th
            v-for="col in columns"
            :key="col.id ?? NONE"
            class="col sticky top-0 z-20 bg-surface hairline-b"
            :class="{ 'is-hover': hoverCol === col.id, 'is-none': col.id === null }"
            :style="{ width: CELL_W + 'px', minWidth: CELL_W + 'px', height: HEAD_H + 'px' }"
            :title="col.id === null ? `Files in no ${colDimension} group` : `${col.name} · ${cross.colFiles.get(col.id) ?? 0} files`"
          >
            <span class="flex h-full flex-col justify-end gap-1 px-1.5 pb-1.5 text-left">
              <span class="truncate font-sans text-xs font-medium text-neutral-800">{{ col.name }}</span>
              <span class="text-[10px] text-neutral-400">{{ col.id === null ? uncolumnedFiles : (cross.colFiles.get(col.id) ?? 0) }} files</span>
              <span class="h-[3px] rounded-sm" :style="{ backgroundColor: col.color ?? 'rgb(var(--c-neutral-300))' }"></span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rowsShown" :key="row.id ?? NONE" :class="{ 'is-hover': hoverRow === row.id }">
          <th
            class="row sticky left-0 z-10 bg-surface hairline-r"
            :class="{ 'is-none': row.id === null }"
            :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: CELL_H + 'px' }"
            :title="row.id === null ? `Files in no ${rowDimension} group` : `${row.name} · ${cross.rowFiles.get(row.id) ?? 0} files`"
          >
            <span class="flex h-full items-center gap-1.5 px-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: row.color ?? 'rgb(var(--c-neutral-300))' }"></span>
              <span class="min-w-0 truncate font-sans text-xs font-medium text-neutral-800">{{ row.name }}</span>
              <span class="ml-auto shrink-0 text-[10px] text-neutral-400">{{ row.id === null ? unrowedFiles : (cross.rowFiles.get(row.id) ?? 0) }}</span>
            </span>
          </th>
          <td
            v-for="col in columns"
            :key="col.id ?? NONE"
            class="cell"
            :class="{ 'is-empty': !cellAt(row.id, col.id), 'is-selected': selected === cellKey(row.id, col.id), 'is-partner': partnerShare(row.id, col.id) > 0, 'is-hover': hoverCol === col.id }"
            :style="cellStyle(row.id, col.id)"
            :title="cellTitle(row.id, col.id)"
            @click="emit('select', selected === cellKey(row.id, col.id) ? null : cellKey(row.id, col.id))"
            @dblclick="emit('open', { row: row.id, col: col.id })"
            @contextmenu.prevent="emit('context', { row: row.id, col: col.id, x: $event.clientX, y: $event.clientY })"
            @mouseenter="hover(row.id, col.id)"
          >
            <span v-if="cellAt(row.id, col.id)" class="value">{{ valueOf(row.id, col.id) }}</span>
            <span v-else class="text-neutral-200">·</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NONE, cellKey, type CrossCell, type CrossGroup, type Crosscut, type Measure } from "~/utils/crosscut";

// Two dimensions as a table: one row per group of the first, one column per
// group of the second, the intersection in each cell. Cells carry files,
// coupling or cycles; hovering a cell tints the cells it exchanges coupling
// with. A last row and column collect what neither dimension covers.

const props = defineProps<{
  rows: CrossGroup[]
  cols: CrossGroup[]
  cross: Crosscut
  measure: Measure
  rowDimension: string
  colDimension: string
  selected: string | null
  directed: boolean
}>();
const emit = defineEmits<{
  (e: "select", key: string | null): void
  (e: "hover", key: string | null): void
  (e: "open", cell: { row: string | null; col: string | null }): void
  (e: "context", payload: { row: string | null; col: string | null; x: number; y: number }): void
}>();

const CELL_W = 88;
const CELL_H = 40;
const HEAD_H = 76;
const LABEL_W = 200;

type Head = { id: string | null; name: string; color: string | null };
const unrowedFiles = computed(() => { let n = 0; props.cross.cells.forEach(c => { if (c.row === null) n += c.files; }); return n; });
const uncolumnedFiles = computed(() => { let n = 0; props.cross.cells.forEach(c => { if (c.col === null) n += c.files; }); return n; });
const rowsShown = computed<Head[]>(() => [
  ...props.rows.map(r => ({ id: r.id, name: r.name, color: r.color })),
  ...(unrowedFiles.value > 0 ? [{ id: null, name: `Not in ${props.rowDimension}`, color: null }] : []),
]);
const columns = computed<Head[]>(() => [
  ...props.cols.map(c => ({ id: c.id, name: c.name, color: c.color })),
  ...(uncolumnedFiles.value > 0 ? [{ id: null, name: `Not in ${props.colDimension}`, color: null }] : []),
]);

const hoverRow = ref<string | null | undefined>(undefined);
const hoverCol = ref<string | null | undefined>(undefined);
function hover(row: string | null, col: string | null) {
  hoverRow.value = row; hoverCol.value = col;
  emit("hover", cellAt(row, col) ? cellKey(row, col) : null);
}

function cellAt(row: string | null, col: string | null): CrossCell | undefined {
  const c = props.cross.cells.get(cellKey(row, col));
  return c && (c.files > 0 || c.components.size > 0) ? c : undefined;
}
function valueOf(row: string | null, col: string | null): string {
  const c = cellAt(row, col);
  if (!c) return "";
  const v = props.measure === "files" ? c.files : props.measure === "cycles" ? c.cycles : c.coupling;
  return v === 0 ? "0" : v >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
}
/** The focus cell: selected, else hovered. */
const focusKey = computed(() => props.selected ?? (hoverRow.value !== undefined && hoverCol.value !== undefined ? cellKey(hoverRow.value, hoverCol.value) : null));
function partnerShare(row: string | null, col: string | null): number {
  if (!focusKey.value) return 0;
  const focus = props.cross.cells.get(focusKey.value);
  if (!focus || focus.key === cellKey(row, col)) return 0;
  const w = focus.partners.get(cellKey(row, col)) ?? 0;
  if (w <= 0) return 0;
  let max = 0; focus.partners.forEach(x => { max = Math.max(max, x); });
  return max > 0 ? w / max : 0;
}
function cellStyle(row: string | null, col: string | null) {
  const c = cellAt(row, col);
  if (!c) return undefined;
  const share = partnerShare(row, col);
  if (share > 0) return { backgroundColor: `rgb(var(--c-accent-500) / ${(0.15 + 0.6 * share).toFixed(3)})` };
  const v = props.measure === "files" ? c.files : props.measure === "cycles" ? c.cycles : c.coupling;
  const max = props.cross.max[props.measure];
  if (v <= 0 || max <= 0) return undefined;
  const alpha = 0.1 + 0.8 * Math.sqrt(v / max);
  const hue = props.measure === "cycles" ? "--c-red-500" : "--c-blue-500";
  return { backgroundColor: `rgb(var(${hue}) / ${alpha.toFixed(3)})` };
}
function nameOf(list: CrossGroup[], id: string | null, dimension: string): string {
  return id === null ? `not in ${dimension}` : (list.find(g => g.id === id)?.name ?? id);
}
function cellTitle(row: string | null, col: string | null): string | undefined {
  const c = cellAt(row, col);
  if (!c) return undefined;
  const parts = [`${nameOf(props.rows, row, props.rowDimension)} × ${nameOf(props.cols, col, props.colDimension)}`, `${c.files} file${c.files === 1 ? "" : "s"} in ${c.components.size} component${c.components.size === 1 ? "" : "s"}`];
  if (c.coupling > 0) parts.push(props.directed ? `coupling out ${Math.round(c.out)}, in ${Math.round(c.in)}` : `coupling ${Math.round(c.coupling)}`);
  if (c.cycles > 0) parts.push(`${c.cycles} cycle${c.cycles === 1 ? "" : "s"} touch it`);
  parts.push("Click to inspect, double-click to open in the graph");
  return parts.join("\n");
}
</script>

<style scoped>
.crosscut th, .crosscut td {
  padding: 0;
}
.cell {
  width: var(--cell-w);
  height: var(--cell-h);
  text-align: center;
  vertical-align: middle;
  box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-100));
  cursor: pointer;
  transition: box-shadow 120ms ease-out;
}
.cell .value {
  color: rgb(var(--c-neutral-900));
  font-variant-numeric: tabular-nums;
}
.cell.is-empty {
  cursor: default;
}
tr.is-hover .cell:not(.is-empty), .cell.is-hover:not(.is-empty) {
  box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-100)), inset 0 0 0 100px rgb(var(--c-neutral-900) / 0.06);
}
.cell.is-selected {
  box-shadow: inset 0 0 0 2px rgb(var(--c-accent-500));
}
.row, .col {
  color: rgb(var(--c-neutral-700));
  text-align: left;
}
.col {
  vertical-align: bottom;
}
tr.is-hover .row, .col.is-hover {
  background: rgb(var(--c-neutral-50));
}
.row.is-none .font-sans, .col.is-none .font-sans {
  color: rgb(var(--c-neutral-500));
  font-style: italic;
}
</style>
