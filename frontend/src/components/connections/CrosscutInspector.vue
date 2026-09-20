<template>
  <div v-if="!cell" class="flex flex-col gap-3 text-sm text-neutral-500">
    <p>Each cell is where a {{ rowDimension }} group and a {{ colDimension }} group meet. Click a cell to see what sits there and what it talks to; double-click to open it in the graph.</p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt class="ui-label">Files</dt><dd class="text-neutral-800">{{ totals.files }} in cells</dd>
      <dt class="ui-label">Uncovered</dt><dd class="text-neutral-800">{{ cross.unrowed.size }} component{{ cross.unrowed.size === 1 ? '' : 's' }} in no {{ rowDimension }} group · {{ cross.uncolumned.size }} in no {{ colDimension }} group</dd>
      <dt v-if="directed" class="ui-label">Cycles</dt><dd v-if="directed" class="text-neutral-800">{{ cross.crossingCycles }} cross a cell boundary</dd>
    </dl>
  </div>
  <div v-else class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: rowGroup?.color ?? 'rgb(var(--c-neutral-300))' }"></span>
        <span class="text-base font-semibold text-neutral-900">{{ rowGroup?.name ?? `Not in ${rowDimension}` }}</span>
        <span class="text-neutral-400">×</span>
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: colGroup?.color ?? 'rgb(var(--c-neutral-300))' }"></span>
        <span class="text-base font-semibold text-neutral-900">{{ colGroup?.name ?? `Not in ${colDimension}` }}</span>
      </div>
      <span class="text-sm text-neutral-500">{{ rowDimension }} × {{ colDimension }}</span>
    </div>

    <StatStrip :cells="cells"/>

    <div class="flex flex-wrap gap-2">
      <button v-if="cell.row && cell.col" type="button" class="ui-btn ui-btn-sm" title="Scope every view to this intersection" @click="emit('scope', { row: cell.row, col: cell.col })">
        <Icon icon="scale" :size="13"/><span>Scope views</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" title="Open these components in the graph" @click="emit('open', { row: cell.row, col: cell.col })">
        <Icon icon="network" :size="13"/><span>Open in graph</span>
      </button>
    </div>

    <div v-if="partners.length" class="flex flex-col gap-1">
      <span class="ui-label">Talks to</span>
      <ul class="flex flex-col">
        <li v-for="p in partners" :key="p.key" class="flex items-center gap-2 py-0.5">
          <button type="button" class="min-w-0 truncate text-left text-sm text-neutral-800 hover:underline" @click="emit('select', p.key)">{{ p.label }}</button>
          <span class="ml-auto h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100"><span class="block h-full bg-blue-500" :style="{ width: (p.share * 100) + '%' }"></span></span>
          <span class="w-10 shrink-0 text-right font-mono text-xs text-neutral-500">{{ Math.round(p.weight) }}</span>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-1">
      <span class="ui-label">Components <span class="font-mono text-neutral-400">{{ cell.components.size }}</span></span>
      <ul class="flex max-h-56 flex-col overflow-y-auto">
        <li v-for="c in Array.from(cell.components).sort()" :key="c">
          <router-link :to="`/views/components/${c}`" class="block truncate py-0.5 font-mono text-sm text-neutral-700 hover:text-accent-700" :title="c">{{ c }}</router-link>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import StatStrip from "~/components/detail/StatStrip.vue";
import { NONE, type CrossGroup, type Crosscut } from "~/utils/crosscut";
import { formatNumber } from "~/utils/format";

// The selected cross-cut cell: what sits in the intersection, how much it
// exchanges with other cells and with which, and the way into scope or graph.

const props = defineProps<{
  cross: Crosscut
  rows: CrossGroup[]
  cols: CrossGroup[]
  rowDimension: string
  colDimension: string
  selected: string | null
  directed: boolean
}>();
const emit = defineEmits<{
  (e: "select", key: string): void
  (e: "scope", cell: { row: string; col: string }): void
  (e: "open", cell: { row: string | null; col: string | null }): void
}>();

const cell = computed(() => (props.selected ? props.cross.cells.get(props.selected) ?? null : null));
const rowGroup = computed(() => (cell.value?.row ? props.rows.find(g => g.id === cell.value!.row) ?? null : null));
const colGroup = computed(() => (cell.value?.col ? props.cols.find(g => g.id === cell.value!.col) ?? null : null));
const totals = computed(() => { let files = 0; props.cross.cells.forEach(c => { files += c.files; }); return { files }; });

const cells = computed(() => {
  const c = cell.value;
  if (!c) return [];
  const out: Array<{ label: string; value: string }> = [
    { label: "Files", value: formatNumber(c.files, 0) },
    { label: "Components", value: formatNumber(c.components.size, 0) },
  ];
  if (props.directed) { out.push({ label: "Out", value: formatNumber(c.out, 0) }); out.push({ label: "In", value: formatNumber(c.in, 0) }); }
  else out.push({ label: "Coupling", value: formatNumber(c.coupling, 0) });
  if (props.directed) out.push({ label: "Cycles", value: formatNumber(c.cycles, 0) });
  return out;
});

function labelOf(key: string): string {
  const [r, c] = key.split("|");
  const rn = r === NONE ? `not in ${props.rowDimension}` : props.rows.find(g => g.id === r)?.name ?? r;
  const cn = c === NONE ? `not in ${props.colDimension}` : props.cols.find(g => g.id === c)?.name ?? c;
  return `${rn} × ${cn}`;
}
const partners = computed(() => {
  const c = cell.value;
  if (!c) return [];
  const list = Array.from(c.partners.entries()).map(([key, weight]) => ({ key, weight, label: labelOf(key) })).sort((a, b) => b.weight - a.weight).slice(0, 8);
  const max = list[0]?.weight ?? 1;
  return list.map(p => ({ ...p, share: p.weight / max }));
});
</script>
