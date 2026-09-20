<template>
  <div ref="scroller" class="h-full w-full overflow-auto bg-surface" @mouseleave="hover(null, null)">
    <table class="matrix border-separate border-spacing-0 font-mono text-xs" :style="{ '--cell': CELL + 'px', '--head': HEAD_H + 'px' }">
      <thead>
        <tr>
          <th class="corner sticky left-0 top-0 z-30 bg-surface hairline-b hairline-r" :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: HEAD_H + 'px' }">
            <span class="block px-2 pb-1 text-left text-[10px] font-medium uppercase tracking-wider text-neutral-400">{{ directed ? 'row uses column' : 'coupled pairs' }}</span>
          </th>
          <th
            v-for="col in ordered"
            :key="col.id"
            class="col sticky top-0 z-20 cursor-pointer bg-surface hairline-b"
            :class="headClass(col.id, hoverCol)"
            :style="{ width: CELL + 'px', minWidth: CELL + 'px', height: HEAD_H + 'px' }"
            :title="col.label"
            @click="select(col.id, $event)"
            @dblclick="emit('activate', col.id)"
            @contextmenu.prevent="emit('context', { id: col.id, x: $event.clientX, y: $event.clientY })"
            @mouseenter="hover(null, col.id)"
          >
            <span class="col-label">{{ short(col.label) }}</span>
            <span class="stripe" :style="{ backgroundColor: col.color ?? 'transparent' }"></span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ordered" :key="row.id" :data-row="row.id" :class="{ 'is-hover': hoverRow === row.id }">
          <th
            class="row sticky left-0 z-10 cursor-pointer bg-surface hairline-r"
            :class="headClass(row.id, hoverRow)"
            :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: CELL + 'px' }"
            :title="row.label"
            @click="select(row.id, $event)"
            @dblclick="emit('activate', row.id)"
            @contextmenu.prevent="emit('context', { id: row.id, x: $event.clientX, y: $event.clientY })"
            @mouseenter="hover(row.id, null)"
          >
            <span class="flex h-full items-center gap-1.5 px-2">
              <span
                class="shrink-0"
                :class="row.kind === 'group' ? 'h-2 w-2 rounded-[3px] border' : row.kind === 'file' ? 'h-1.5 w-1.5 rounded-full border' : 'h-1.5 w-1.5 rounded-full'"
                :style="row.kind === 'component'
                  ? { backgroundColor: row.color ?? 'rgb(var(--c-neutral-300))' }
                  : { borderColor: row.color ?? 'rgb(var(--c-neutral-300))', backgroundColor: row.kind === 'group' ? (row.color ?? 'rgb(var(--c-neutral-300))') : 'transparent', opacity: row.kind === 'group' ? 0.85 : 1 }"
                :title="row.kind"
              ></span>
              <span class="min-w-0 truncate">{{ row.label }}</span>
              <span v-if="badges?.get(row.id)" class="ml-auto rounded-full bg-red-600 px-1.5 font-mono text-[10px] font-semibold leading-4 text-white" :title="`${badges.get(row.id)} cycles inside`">{{ badges.get(row.id) }}</span>
            </span>
          </th>
          <td
            v-for="col in ordered"
            :key="col.id"
            class="cell"
            :class="{ 'is-self': row.id === col.id, 'is-hover': hoverCol === col.id, 'is-pair': isSelectedPair(row.id, col.id), 'is-cycle': cycleKeys?.has(edgeKey(row.id, col.id)) }"
            :style="cellStyle(row.id, col.id)"
            :title="cellTitle(row.id, col.id)"
            @click="clickCell(row.id, col.id)"
            @mouseenter="hover(row.id, col.id)"
          ></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type CEdge, type CNode, edgeKey, orderNodes } from "~/utils/connections";

// A dependency structure matrix: rows use columns when the source is
// directed; otherwise the grid is symmetric. Cells shade on the blue data
// ramp by edge weight. Headers select nodes, cells select pairs.

const props = defineProps<{
  nodes: CNode[]
  edges: CEdge[]
  directed: boolean
  selectedId: string | null
  selectedPair: [string, string] | null
  multi: Set<string>
  hovered: string | null
  cycleKeys?: Set<string>
  cycleNodes?: Set<string>
  badges?: Map<string, number>
}>();

const emit = defineEmits<{
  (e: "select", id: string | null, mods: { shift: boolean; meta: boolean }): void
  (e: "select-pair", from: string, to: string): void
  (e: "hover", id: string | null): void
  (e: "activate", id: string): void
  (e: "context", payload: { id: string; x: number; y: number }): void
}>();

const CELL = 22;
const HEAD_H = 132;
const LABEL_W = 224;
const KEY = "::";

const scroller = ref<HTMLElement | null>(null);
const hoverRow = ref<string | null>(null);
const hoverCol = ref<string | null>(null);

const ordered = computed(() => orderNodes(props.nodes));

const cellIndex = computed(() => {
  const map = new Map<string, CEdge>();
  for (const e of props.edges) {
    map.set(e.from + KEY + e.to, e);
    if (!props.directed) map.set(e.to + KEY + e.from, e);
  }
  return map;
});

function edgeAt(row: string, col: string): CEdge | undefined {
  return cellIndex.value.get(row + KEY + col);
}

function cellStyle(row: string, col: string) {
  const e = edgeAt(row, col);
  if (!e) return undefined;
  const alpha = 0.18 + 0.82 * Math.min(1, e.weight);
  return { backgroundColor: `rgb(var(--c-blue-500) / ${alpha.toFixed(3)})` };
}

function cellTitle(row: string, col: string): string | undefined {
  const e = edgeAt(row, col);
  if (!e) return undefined;
  const parts = [];
  if (e.references) parts.push(`${e.references} reference${e.references === 1 ? "" : "s"}`);
  if (e.sharedCommits) parts.push(`${e.sharedCommits} shared commit${e.sharedCommits === 1 ? "" : "s"}`);
  return `${row} ${props.directed ? "uses" : "with"} ${col}: ${parts.join(", ")}`;
}

function isSelectedPair(row: string, col: string): boolean {
  const p = props.selectedPair;
  if (!p) return false;
  return (p[0] === row && p[1] === col) || (!props.directed && p[0] === col && p[1] === row);
}

function headClass(id: string, hoverId: string | null) {
  return {
    "is-selected": props.selectedId === id || props.multi.has(id),
    "is-hover": hoverId === id || props.hovered === id,
    "is-cycle": !!props.cycleNodes?.has(id),
  };
}

function short(label: string): string {
  return label.length > 28 ? "…" + label.slice(-27) : label;
}

function select(id: string, event: MouseEvent) {
  emit("select", id, { shift: event.shiftKey, meta: event.metaKey || event.ctrlKey });
}

function clickCell(row: string, col: string) {
  if (row === col) { emit("select", row, { shift: false, meta: false }); return; }
  if (edgeAt(row, col)) emit("select-pair", row, col);
}

function hover(row: string | null, col: string | null) {
  hoverRow.value = row;
  hoverCol.value = col;
  emit("hover", row ?? col);
}

/** The matrix answer to focusing a node: put its row on screen. */
function focusNode(id: string) {
  const row = scroller.value?.querySelector(`[data-row="${CSS.escape(id)}"]`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
}

defineExpose({ focusNode });
</script>

<style scoped>
.matrix th, .matrix td {
  padding: 0;
}
.cell {
  width: var(--cell);
  height: var(--cell);
  box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-100));
  cursor: crosshair;
}
.cell.is-self {
  background: rgb(var(--c-neutral-100));
  cursor: default;
}
tr.is-hover .cell, .cell.is-hover {
  box-shadow: inset -1px -1px 0 rgb(var(--c-neutral-100)), inset 0 0 0 100px rgb(var(--c-neutral-900) / 0.06);
}
.cell.is-cycle {
  box-shadow: inset 0 0 0 1.5px rgb(var(--c-red-500));
}
.cell.is-pair {
  box-shadow: inset 0 0 0 2px rgb(var(--c-accent-500));
}
.col {
  position: relative;
  vertical-align: bottom;
}
.col-label {
  display: block;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  height: calc(var(--head) - 14px);
  padding-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(var(--c-neutral-700));
  text-align: left;
}
.stripe {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 3px;
  height: 3px;
  border-radius: 2px;
}
.row {
  color: rgb(var(--c-neutral-700));
  text-align: left;
}
.row.is-hover, .col.is-hover {
  background: rgb(var(--c-neutral-50));
  color: rgb(var(--c-neutral-900));
}
.row.is-cycle, .col.is-cycle .col-label {
  color: rgb(var(--c-red-700));
}
.row.is-selected, .col.is-selected {
  color: rgb(var(--c-accent-700));
  font-weight: 600;
  background: rgb(var(--c-accent-50));
}
.col.is-selected .col-label {
  color: rgb(var(--c-accent-700));
}
</style>