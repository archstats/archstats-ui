<template>
  <!-- Areas against areas, row imports column, drawn as the newer snapshot
       stands: grey where a link held, blue where one started between areas
       that had none, a blue ring where links between already-linked areas
       came or went, a dashed outline where every link is gone. The margin
       counts the commits that touched each area in the range. -->
  <ExhibitFrame :exhibit="figure" :title="title">
    <template #aside><slot name="aside"/></template>
  <div ref="host" class="relative w-full overflow-x-auto" @mouseleave="hover = null" @mousemove="onMove">
    <svg ref="svgRef" :width="w" :height="h" class="block select-none" role="img" :aria-label="title">
      <rect :width="w" :height="h" :fill="theme.surface"/>
      <g :transform="`translate(${LABEL_W},${HEAD})`">
        <!-- Inside an area: the diagonal. -->
        <rect v-for="(_, i) in order" :key="`d${i}`" :x="i * s" :y="i * s" :width="s" :height="s" :fill="theme.ground"/>
        <template v-if="hover">
          <rect :x="0" :y="hover.r * s" :width="n * s" :height="s" :fill="theme.accentSoft" opacity="0.25"/>
          <rect :x="hover.c * s" :y="0" :width="s" :height="n * s" :fill="theme.accentSoft" opacity="0.25"/>
        </template>
        <!-- Rows and columns of the area picked by its name. -->
        <template v-if="areaIndex !== null">
          <rect :x="0" :y="areaIndex * s" :width="n * s" :height="s" :fill="theme.accentSoft" opacity="0.35"/>
          <rect :x="areaIndex * s" :y="0" :width="s" :height="n * s" :fill="theme.accentSoft" opacity="0.35"/>
        </template>
        <line :x1="0" :y1="0" :x2="n * s" :y2="n * s" :stroke="theme.hairline" stroke-width="1"/>
        <g v-for="c in drawn" :key="c.key" class="cursor-pointer" @mouseenter="hover = { r: c.r, c: c.c, text: c.title }" @click="$emit('select', c.isSelected ? null : { from: c.cell.from, to: c.cell.to })">
          <rect :x="c.c * s" :y="c.r * s" :width="s" :height="s" fill="transparent"/>
          <rect
            :x="c.c * s + inset(c)"
            :y="c.r * s + inset(c)"
            :width="s - 2 * inset(c)"
            :height="s - 2 * inset(c)"
            :rx="2"
            :fill="c.fill"
            :fill-opacity="c.opacity"
            :stroke="c.stroke"
            :stroke-width="c.stroke === 'none' ? 0 : 1.5"
            :stroke-dasharray="c.dashed ? '2.5 2' : undefined"
          />
          <text v-if="c.mark && s >= 20" :x="c.c * s + s / 2" :y="c.r * s + s / 2 + 3.5" text-anchor="middle" :font-family="theme.fontMono" font-size="10" font-weight="500" :fill="c.markInk" pointer-events="none">{{ c.mark }}</text>
          <rect v-if="c.isSelected" :x="c.c * s + 0.75" :y="c.r * s + 0.75" :width="s - 1.5" :height="s - 1.5" rx="3" fill="none" :stroke="theme.accent" stroke-width="2" pointer-events="none"/>
        </g>
        <rect :x="0" :y="0" :width="n * s" :height="n * s" fill="none" :stroke="theme.hairlineStrong" stroke-width="1"/>
      </g>

      <!-- Row names with their numbers; the columns go by the numbers. -->
      <g :transform="`translate(0,${HEAD})`">
        <g v-for="(key, i) in order" :key="key" class="cursor-pointer" @click="$emit('selectArea', selectedArea === key ? null : key)">
          <rect :x="0" :y="i * s" :width="LABEL_W - 4" :height="s" fill="transparent"/>
          <text :x="LABEL_W - 26" :y="i * s + s / 2 + 3.5" text-anchor="end" :font-family="theme.fontMono" font-size="11"
                :fill="selectedArea === key || hover?.r === i || hover?.c === i ? theme.ink : theme.inkSecondary" :font-weight="selectedArea === key ? 600 : 400">{{ short(label(key)) }}</text>
          <text :x="LABEL_W - 6" :y="i * s + s / 2 + 3.5" text-anchor="end" :font-family="theme.fontMono" font-size="9.5" :fill="theme.inkMuted">{{ i + 1 }}</text>
          <title>{{ label(key) }} · {{ t('common.count.component', { count: size(key) }) }}</title>
        </g>
      </g>
      <g :transform="`translate(${LABEL_W},${HEAD - 8})`">
        <text v-for="(_, i) in order" :key="`c${i}`" :x="i * s + s / 2" y="0" text-anchor="middle" :font-family="theme.fontMono" font-size="9.5" :fill="hover?.c === i ? theme.ink : theme.inkMuted">{{ i + 1 }}</text>
      </g>

      <!-- Commits in the range, per area. -->
      <g v-if="commits" :transform="`translate(${LABEL_W + n * s + 16},${HEAD})`">
        <text x="0" :y="-8" :font-family="theme.fontSans" font-size="11" :fill="theme.inkSecondary">{{ t('trends.changeMatrix.commits') }}</text>
        <g v-for="(key, i) in order" :key="`w${key}`">
          <rect x="0" :y="i * s + s / 2 - 3" :width="Math.max(commitsOf(key) ? 2 : 0, (BAR * commitsOf(key)) / maxCommits)" height="6" rx="1" :fill="theme.inkMuted" opacity="0.7"/>
          <text :x="BAR + 8" :y="i * s + s / 2 + 3.5" :font-family="theme.fontMono" font-size="10.5" :fill="commitsOf(key) ? theme.inkSecondary : theme.inkMuted">{{ commitsOf(key) ? fmt(commitsOf(key)) : "–" }}</text>
        </g>
      </g>
    </svg>
    <div v-if="hover" class="ui-tooltip pointer-events-none fixed z-50 max-w-[380px]" :style="tipStyle">{{ hover.text }}</div>
  </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useSvgFigure } from "~/features/export/useExportables";
import { chartTheme, useChartTheme } from "~/shared/ui/useChartTheme";
import type { AreaCell } from "~/features/trends/areas";
import { t, intlLocale } from "~/shared/i18n";

const props = defineProps<{
  order: string[]
  cells: AreaCell[]
  label: (key: string) => string
  size: (key: string) => number
  commits: Map<string, number> | null
  selected: { from: string; to: string } | null
  selectedArea: string | null
  title: string
}>();
defineEmits<{ (e: "select", cell: { from: string; to: string } | null): void; (e: "selectArea", key: string | null): void }>();

const { version } = useChartTheme();
const theme = computed(() => { void version.value; return chartTheme(); });
const LABEL_W = 232;
const HEAD = 24;
const BAR = 56;
const host = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const avail = ref(900);
const hover = ref<{ r: number; c: number; text: string } | null>(null);
const mouse = ref({ x: 0, y: 0 });

const n = computed(() => props.order.length);
const margin = computed(() => (props.commits ? BAR + 56 : 8));
// As large as the width allows, but a cell never grows past what a count needs.
const s = computed(() => Math.max(12, Math.min(30, Math.floor((avail.value - LABEL_W - margin.value - 16) / Math.max(1, n.value)))));
const w = computed(() => LABEL_W + n.value * s.value + margin.value + 16);
const h = computed(() => HEAD + n.value * s.value + 6);
// A long path keeps its last segments whole: "…/features/exhibit-catalog", never "…src/features/exhibit-catalog" cut mid-word.
const short = (x: string) => {
  if (x.length <= 30) return x;
  const parts = x.split(/(?<=[/.\\])/);
  let tail = "";
  for (let i = parts.length - 1; i >= 0 && (parts[i] + tail).length <= 28; i--) tail = parts[i] + tail;
  return tail ? `…${tail.startsWith("/") || tail.startsWith(".") ? "" : "/"}${tail}` : `…${x.slice(-29)}`;
};
const fmt = (v: number) => v.toLocaleString(intlLocale);
const commitsOf = (key: string) => props.commits?.get(key) ?? 0;
const maxCommits = computed(() => Math.max(1, ...props.order.map(commitsOf)));
const areaIndex = computed(() => (props.selectedArea ? props.order.indexOf(props.selectedArea) : -1) >= 0 ? props.order.indexOf(props.selectedArea!) : null);

const pos = computed(() => new Map(props.order.map((k, i) => [k, i])));
const maxRefs = computed(() => Math.max(1, ...props.cells.map(c => c.refs)));
const drawn = computed(() => {
  const th = theme.value;
  return props.cells.flatMap(cell => {
    const r = pos.value.get(cell.from), c = pos.value.get(cell.to);
    if (r === undefined || c === undefined) return [];
    const weight = 0.24 + 0.5 * Math.log1p(cell.refs) / Math.log1p(maxRefs.value);
    const isSelected = !!props.selected && props.selected.from === cell.from && props.selected.to === cell.to;
    const base = { key: `${cell.from}\u0000${cell.to}`, cell, r, c, isSelected, dashed: false, mark: "", markInk: th.ink };
    const delta = [cell.added ? `+${cell.added}` : "", cell.removed ? `−${cell.removed}` : ""].filter(Boolean).join(" ");
    const title = t("trends.changeMatrix.cellTitle", {
      from: props.label(cell.from), to: props.label(cell.to),
      links: t("trends.changeMatrix.links", { count: cell.links }), refs: t("common.count.ref", { count: cell.refs }),
      change: cell.state === "new" ? t("trends.changeMatrix.newLink") : cell.state === "gone" ? t("trends.changeMatrix.goneLink") : cell.state === "changed" ? t("trends.changeMatrix.changedLink", { added: fmt(cell.added), removed: fmt(cell.removed) }) : t("trends.changeMatrix.sameLink"),
    });
    if (cell.state === "new") return [{ ...base, title, fill: th.blue, opacity: 0.9, stroke: "none", mark: `+${cell.added}`, markInk: th.surface }];
    if (cell.state === "gone") return [{ ...base, title, fill: "none", opacity: 0, stroke: th.inkSecondary, dashed: true, mark: `−${cell.removed}`, markInk: th.inkSecondary }];
    if (cell.state === "changed") return [{ ...base, title, fill: th.inkSecondary, opacity: weight, stroke: cell.added ? th.blue : th.inkSecondary, dashed: !cell.added, mark: s.value >= 26 || delta.length <= 3 ? (cell.added ? `+${cell.added}` : `−${cell.removed}`) : "" }];
    return [{ ...base, title, fill: th.inkSecondary, opacity: weight, stroke: "none" }];
  });
});
const inset = (c: { cell: AreaCell }) => (c.cell.state === "same" ? 3 : 1.5);

const tipStyle = computed(() => ({ left: `${mouse.value.x + 14}px`, top: `${mouse.value.y + 14}px` }));
const onMove = (e: MouseEvent) => { mouse.value = { x: e.clientX, y: e.clientY }; };

let ro: ResizeObserver | null = null;
onMounted(() => {
  const measure = () => { avail.value = host.value!.getBoundingClientRect().width; };
  ro = new ResizeObserver(measure);
  ro.observe(host.value!);
  measure();
});
onBeforeUnmount(() => ro?.disconnect());

const figure = useSvgFigure({
  title: () => props.title,
  svg: () => svgRef.value,
  legend: () => ({
    items: [
      { label: t("trends.changeMatrix.legendSame"), color: theme.value.inkSecondary },
      { label: t("trends.changeMatrix.legendNew"), color: theme.value.blue },
      { label: t("trends.changeMatrix.legendChanged"), color: theme.value.blue, mark: "ring" },
      { label: t("trends.changeMatrix.legendGone"), color: theme.value.inkSecondary, mark: "dashed" },
    ],
    notes: [t("trends.changeMatrix.legendOrder"), ...(props.commits ? [t("trends.changeMatrix.legendCommits")] : [])],
  }),
});
</script>
