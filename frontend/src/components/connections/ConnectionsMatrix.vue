<template>
  <div ref="scroller" class="h-full w-full overflow-auto bg-surface" @mouseleave="hover(null, null)">
    <!-- Hover is one delegated listener that toggles classes on the row and
         column it touches. Bound per cell and kept in reactive state, every
         mouse-enter re-rendered the whole grid: 40,000 cells at the cap, and
         the pointer crosses one per 22 pixels. -->
    <table ref="table" class="matrix border-separate border-spacing-0 font-mono text-xs" :style="{ '--cell': CELL + 'px', '--head': HEAD_H + 'px' }">
      <thead @mouseover="onOver">
        <tr>
          <th class="corner sticky left-0 top-0 z-30 bg-surface hairline-b hairline-r" :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: HEAD_H + 'px' }">
            <span class="block px-2 pb-1 text-left text-[10px] font-medium uppercase tracking-wider text-neutral-500">{{ directed ? 'row uses column' : 'coupled pairs' }}</span>
          </th>
          <th
            v-for="col in orderedCols"
            :key="col.id"
            class="col sticky top-0 z-20 cursor-pointer bg-surface hairline-b"
            :class="headClass(col.id)"
            :style="{ width: CELL + 'px', minWidth: CELL + 'px', height: HEAD_H + 'px' }"
            :title="col.label"
            @click="select(col.id, $event)"
            @dblclick="emit('activate', col.id)"
            @contextmenu.prevent="emit('context', { id: col.id, x: $event.clientX, y: $event.clientY })"
          >
            <span class="col-label">{{ short(col.label) }}</span>
            <span class="stripe" :style="{ backgroundColor: col.color ?? 'transparent' }"></span>
          </th>
        </tr>
      </thead>
      <tbody @mouseover="onOver">
        <tr v-for="row in orderedRows" :key="row.id" :data-row="row.id">
          <th
            class="row sticky left-0 z-10 cursor-pointer bg-surface hairline-r"
            :class="headClass(row.id)"
            :style="{ width: LABEL_W + 'px', minWidth: LABEL_W + 'px', height: CELL + 'px' }"
            :title="row.label"
            @click="select(row.id, $event)"
            @dblclick="emit('activate', row.id)"
            @contextmenu.prevent="emit('context', { id: row.id, x: $event.clientX, y: $event.clientY })"
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
            v-for="col in orderedCols"
            :key="col.id"
            class="cell"
            :class="{ 'is-self': row.id === col.id, 'is-pair': isSelectedPair(row.id, col.id), 'is-cycle': cycleKeys?.has(edgeKey(row.id, col.id)) }"
            :style="cellStyle(row.id, col.id)"
            :title="cellTitle(row.id, col.id)"
            @click="clickCell(row.id, col.id)"
          ></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { type CEdge, type CNode, edgeKey, orderNodes } from "~/utils/connections";

// A dependency structure matrix: rows use columns when the source is
// directed; otherwise the grid is symmetric. Cells shade on the blue data
// ramp by edge weight. Headers select nodes, cells select pairs.

const props = defineProps<{
  nodes: CNode[]
  /**
   * Separate axes, for a grid whose two sides are different sets of nodes.
   * A lane-to-lane region is one: its rows import, its columns are imported,
   * and drawn square every row on the imported side comes out empty.
   * Omitted, the grid is symmetric as Connections uses it.
   */
  rowNodes?: CNode[]
  colNodes?: CNode[]
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
const table = ref<HTMLTableElement | null>(null);
// Not reactive on purpose: see the note on the table.
let hoverRow: string | null = null;
let hoverCol: string | null = null;

// Explicit axes arrive in the order the caller chose -- for a region that is
// most-connected first, which is the whole point of picking them. Only the
// symmetric case gets the default group-then-name ordering.
const orderedRows = computed(() => props.rowNodes ?? orderNodes(props.nodes));
const orderedCols = computed(() => props.colNodes ?? orderNodes(props.nodes));

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

/** Node labels by id: an id is a component's name here and a file path at
 *  file grain, and a tooltip reading two full paths is unreadable. */
const labelOf = computed(() => {
  const m = new Map<string, string>();
  for (const n of [...props.nodes, ...(props.rowNodes ?? []), ...(props.colNodes ?? [])]) {
    m.set(n.id, n.label);
  }
  return m;
});

function cellTitle(row: string, col: string): string | undefined {
  const e = edgeAt(row, col);
  if (!e) return undefined;
  const parts = [];
  if (e.references) parts.push(`${e.references} reference${e.references === 1 ? "" : "s"}`);
  if (e.sharedCommits) parts.push(`${e.sharedCommits} shared commit${e.sharedCommits === 1 ? "" : "s"}`);
  const from = labelOf.value.get(row) ?? row;
  const to = labelOf.value.get(col) ?? col;
  return `${from} ${props.directed ? "uses" : "with"} ${to}: ${parts.join(", ")}`;
}

function isSelectedPair(row: string, col: string): boolean {
  const p = props.selectedPair;
  if (!p) return false;
  return (p[0] === row && p[1] === col) || (!props.directed && p[0] === col && p[1] === row);
}

function headClass(id: string) {
  return {
    "is-selected": props.selectedId === id || props.multi.has(id),
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

function onOver(event: MouseEvent) {
  const cell = (event.target as HTMLElement | null)?.closest("td, th") as HTMLTableCellElement | null;
  if (!cell) return;
  const tr = cell.parentElement as HTMLTableRowElement;
  const col = cell.cellIndex > 0 ? orderedCols.value[cell.cellIndex - 1]?.id ?? null : null;
  const row = tr.dataset.row ?? null;
  hover(row, col);
}

function hover(row: string | null, col: string | null) {
  if (row === hoverRow && col === hoverCol) return;
  paint(hoverRow, hoverCol, false);
  hoverRow = row;
  hoverCol = col;
  paint(row, col, true);
  emit("hover", row ?? col);
}

/** Row and column positions by id, for reaching their elements without a search. */
const rowIndex = computed(() => new Map(orderedRows.value.map((n, i) => [n.id, i])));
const colIndex = computed(() => new Map(orderedCols.value.map((n, i) => [n.id, i])));

function paint(row: string | null, col: string | null, on: boolean) {
  const t = table.value;
  if (!t) return;
  const body = t.tBodies[0];
  const r = row === null ? undefined : rowIndex.value.get(row);
  if (r !== undefined) {
    const tr = body?.rows[r];
    tr?.classList.toggle("is-hover", on);
    tr?.cells[0]?.classList.toggle("is-hover", on);
  }
  const c = col === null ? undefined : colIndex.value.get(col);
  if (c !== undefined) {
    t.tHead?.rows[0]?.cells[c + 1]?.classList.toggle("is-hover", on);
    if (body) for (const tr of body.rows) tr.cells[c + 1]?.classList.toggle("is-hover", on);
  }
}

// A node hovered elsewhere lights its two headers, as the matrix's own hover does.
let external: string | null = null;
function paintExternal(id: string | null, on: boolean) {
  const t = table.value;
  if (!t || id === null) return;
  const r = rowIndex.value.get(id);
  if (r !== undefined) t.tBodies[0]?.rows[r]?.cells[0]?.classList.toggle("is-hover", on);
  const c = colIndex.value.get(id);
  if (c !== undefined) t.tHead?.rows[0]?.cells[c + 1]?.classList.toggle("is-hover", on);
}
watch(() => props.hovered, (id) => { paintExternal(external, false); external = id; paintExternal(id, true); });
// A re-render rebuilds classes from the template, which knows nothing of hover.
watch([orderedRows, orderedCols], () => { hoverRow = null; hoverCol = null; external = null; });
onMounted(() => { external = props.hovered; paintExternal(external, true); });

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