<template>
  <ExhibitFrame :exhibit="figure" fill>
    <div ref="root" class="relative h-full w-full" @mouseleave="hovered = null" @mousemove="mouseMove">
      <div
          v-if="dragAnchor == null && hovered"
          class="ui-popover fixed z-50 w-72 p-3"
          :style="{ top: `${hovered.posY}px`, left: `${hovered.posX}px` }"
          @mouseenter="isHoveringOverTooltip = true"
          @mouseleave="isHoveringOverTooltip = false"
      >
        <p class="truncate font-mono text-sm font-semibold text-neutral-900" :title="String(hovered.row.name)">{{ shortOf(hovered.row.name) }}</p>
        <p v-if="shortOf(hovered.row.name) !== hovered.row.name" class="mb-2 truncate font-mono text-xs text-neutral-500" :title="String(hovered.row.name)">{{ hovered.row.name }}</p>
        <div v-else class="mb-2"></div>
        <dl class="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] gap-x-2 gap-y-0.5 text-sm">
          <template v-for="key in tooltipKeys" :key="key">
            <dt class="truncate text-neutral-500" :title="niceName(key)">{{ niceName(key) }}</dt>
            <dd class="text-right font-mono tabular-nums text-neutral-900">{{ Number.isFinite(metricValue(hovered.row, key)) ? formatReading(hovered.row[key]) : "—" }}</dd>
            <dd class="text-right font-mono text-xs leading-[18px] tabular-nums text-neutral-400" :title="t('metrics.componentPlotterDiagram.rankAmong', { domainRowsLength: domainRows.length })">{{ rankOf(key, hovered.row) }}</dd>
          </template>
        </dl>
        <p v-if="cellOf(hovered.row.name)" class="mt-2 pt-2 text-xs text-neutral-500 hairline-t">{{ cellOf(hovered.row.name) }}</p>
      </div>

      <svg
          ref="svg"
          class="absolute inset-0 h-full w-full select-none"
          :class="{ 'is-gliding': gliding }"
          :viewBox="`${-margin.left} ${-margin.top} ${size.w} ${size.h}`"
          :width="size.w"
          :height="size.h"
          @mousedown="beginDragSelecting"
          @mousemove="updateMouseCoords"
      >
        <defs>
          <linearGradient v-for="grad in multiColorGradients" :key="grad.id" :id="grad.id">
            <stop v-for="(stop, idx) in grad.stops" :key="idx" :offset="stop.offset" :stop-color="stop.color"/>
          </linearGradient>
          <clipPath :id="clipId">
            <rect :x="0" :y="0" :width="width" :height="height"/>
          </clipPath>
          <clipPath :id="`${clipId}-x`">
            <rect :x="0" :y="-margin.top" :width="width" :height="margin.top"/>
          </clipPath>
          <clipPath :id="`${clipId}-y`">
            <rect :x="width" :y="0" :width="margin.right" :height="height"/>
          </clipPath>
        </defs>

        <g ref="xAxisElement"></g>
        <g ref="yAxisElement"></g>

        <text :x="-margin.left + 12" :y="height / 2" :transform="`rotate(-90, ${-margin.left + 12}, ${height / 2})`" text-anchor="middle" dominant-baseline="central"
              :fill="theme.inkSecondary" font-size="11" font-weight="500" :font-family="theme.fontSans">
          {{ niceName(yAxisProperty) }}<tspan v-if="yLog" :fill="theme.inkMuted" font-weight="400">{{ ' ' + t('metrics.componentPlotterDiagram.log') }}</tspan>
        </text>
        <text :x="width / 2" :y="height + 44" text-anchor="middle" dominant-baseline="central"
              :fill="theme.inkSecondary" font-size="11" font-weight="500" :font-family="theme.fontSans">
          {{ niceName(xAxisProperty) }}<tspan v-if="xLog" :fill="theme.inkMuted" font-weight="400">{{ ' ' + t('metrics.componentPlotterDiagram.log') }}</tspan>
        </text>

        <!-- Where the marks pile up along each axis; the selection overlays in blue. -->
        <g :clip-path="`url(#${clipId}-x)`">
          <rect v-for="(bar, i) in marginX.bars" :key="`mx${i}`"
                :x="bar.x0 + 0.5" :width="Math.max(0.5, bar.x1 - bar.x0 - 1)" :y="-6 - bar.h" :height="bar.h"
                :fill="bar.hot ? theme.ink : theme.hairlineStrong"/>
          <rect v-for="(bar, i) in marginX.sel" :key="`msx${i}`"
                :x="bar.x0 + 0.5" :width="Math.max(0.5, bar.x1 - bar.x0 - 1)" :y="-6 - bar.h" :height="bar.h" :fill="theme.blue"/>
        </g>
        <g :clip-path="`url(#${clipId}-y)`">
          <rect v-for="(bar, i) in marginY.bars" :key="`my${i}`"
                :y="bar.x0 + 0.5" :height="Math.max(0.5, bar.x1 - bar.x0 - 1)" :x="width + 6" :width="bar.h"
                :fill="bar.hot ? theme.ink : theme.hairlineStrong"/>
          <rect v-for="(bar, i) in marginY.sel" :key="`msy${i}`"
                :y="bar.x0 + 0.5" :height="Math.max(0.5, bar.x1 - bar.x0 - 1)" :x="width + 6" :width="bar.h" :fill="theme.blue"/>
        </g>

        <g :clip-path="`url(#${clipId})`">
          <!-- Guides: medians, or the main sequence and Martin's two zones. -->
          <g v-if="reading?.kind === 'main-sequence'">
            <polygon :points="zonePoints([[0, 0], [0.5, 0], [0, 0.5]])" :fill="withAlpha(theme.red, hoveredCell === 'pain' ? 0.16 : 0.07)"/>
            <polygon :points="zonePoints([[1, 1], [0.5, 1], [1, 0.5]])" :fill="withAlpha(theme.inkMuted, hoveredCell === 'useless' ? 0.2 : 0.09)"/>
            <line :x1="xz(0)" :y1="yz(1)" :x2="xz(1)" :y2="yz(0)" :stroke="theme.inkMuted" stroke-width="1" stroke-dasharray="4 3"/>
            <text :transform="`rotate(${mainSequenceAngle}, ${xz(0.5)}, ${yz(0.5)})`" :x="xz(0.5)" :y="yz(0.5)" text-anchor="middle" dy="-6"
                  font-size="10" :fill="theme.inkMuted" :font-family="theme.fontSans">{{ t('metrics.componentPlotterDiagram.mainSequence') }}</text>
          </g>
          <g v-else-if="reading?.kind === 'medians'">
            <line :x1="xz(reading.mx)" :x2="xz(reading.mx)" :y1="0" :y2="height" :stroke="theme.hairlineStrong" stroke-dasharray="3 3"/>
            <line :y1="yz(reading.my)" :y2="yz(reading.my)" :x1="0" :x2="width" :stroke="theme.hairlineStrong" stroke-dasharray="3 3"/>
          </g>

          <g
              v-for="mark in orderedMarks"
              :key="mark.row.name"
              class="mark"
              :style="{ transform: `translate(${mark.x}px, ${mark.y}px)` }"
          >
            <circle
                :r="mark.r"
                :style="{ fill: fillFor(mark), opacity: opacityFor(mark.row.name) }"
                :stroke="strokeFor(mark)"
                :stroke-width="isHighlighted(mark) ? 2 : 0.75"
                class="cursor-pointer"
                :class="{ 'pointer-events-none': !isSelectable(mark.row.name) }"
                @mouseenter="hoverOver(mark, $event)"
                @click.stop="markClicked($event, mark.row)"
                @dblclick.stop="emit('clicked', mark.row)"
            />
          </g>

          <!-- Crosshair from the hovered mark to both axes. -->
          <g v-if="hoveredMark" class="pointer-events-none">
            <line :x1="hoveredMark.x" :x2="hoveredMark.x" :y1="hoveredMark.y + hoveredMark.r" :y2="height" :stroke="theme.inkMuted" stroke-dasharray="2 2"/>
            <line :y1="hoveredMark.y" :y2="hoveredMark.y" :x1="0" :x2="hoveredMark.x - hoveredMark.r" :stroke="theme.inkMuted" stroke-dasharray="2 2"/>
          </g>

          <g class="pointer-events-none">
            <text
                v-for="label in labels"
                :key="label.id"
                class="mark-label"
                :x="label.x"
                :y="label.y"
                :text-anchor="label.anchor"
                dominant-baseline="central"
                font-size="10"
                :font-weight="selectedSet.has(label.id) || hovered?.row.name === label.id ? 600 : 400"
                :fill="selectedSet.has(label.id) || hovered?.row.name === label.id ? theme.ink : theme.inkSecondary"
                :stroke="theme.surface"
                stroke-width="3"
                stroke-linejoin="round"
                paint-order="stroke"
                :font-family="theme.fontMono"
                :opacity="labelOpacity(label.id)"
            >{{ label.text }}</text>
          </g>

          <rect
              v-if="dragRectangle"
              :x="dragRectangle.x" :y="dragRectangle.y" :width="dragRectangle.width" :height="dragRectangle.height"
              :fill="withAlpha(theme.blue, 0.1)" :stroke="theme.blue" stroke-width="0.75"
          />
        </g>

        <!-- Axis chips for the hovered mark. -->
        <g v-if="hoveredMark" class="pointer-events-none" :font-family="theme.fontMono" font-size="10">
          <rect :x="hoveredMark.x - chipWidth(xChip) / 2" :y="height + 1" :width="chipWidth(xChip)" height="16" rx="3" :fill="theme.ink"/>
          <text :x="hoveredMark.x" :y="height + 9" text-anchor="middle" dominant-baseline="central" :fill="theme.surface">{{ xChip }}</text>
          <rect :x="-chipWidth(yChip) - 1" :y="hoveredMark.y - 8" :width="chipWidth(yChip)" height="16" rx="3" :fill="theme.ink"/>
          <text :x="-5" :y="hoveredMark.y" text-anchor="end" dominant-baseline="central" :fill="theme.surface">{{ yChip }}</text>
        </g>

        <!-- Median values, said once at the end of each line. -->
        <g v-if="reading?.kind === 'medians'" class="pointer-events-none" :font-family="theme.fontMono" font-size="10" :fill="theme.inkMuted">
          <text v-if="inRange(xz(reading.mx), width)" :x="xz(reading.mx) + 4" :y="-10 - marginMax" dominant-baseline="auto">{{ t('metrics.componentPlotterDiagram.median', { mx: formatReading(reading.mx) }) }}</text>
          <text v-if="inRange(yz(reading.my), height)" :x="4" :y="yz(reading.my) - 5" :stroke="theme.surface" stroke-width="3" paint-order="stroke" stroke-linejoin="round">{{ t('metrics.componentPlotterDiagram.median2', { my: formatReading(reading.my) }) }}</text>
        </g>

        <!-- The reading in each corner: how many marks, and what the corner means. Click selects them. -->
        <g v-for="cell in cellLabels" :key="cell.id"
           class="cell-label cursor-pointer outline-none"
           role="button" tabindex="0"
           :aria-label="t('metrics.componentPlotterDiagram.select', { cellCount: cell.count, text: cell.text })"
           @mousedown.stop
           @click.stop="selectCell(cell.id, $event)"
           @keydown.enter.prevent="selectCell(cell.id, $event)"
           @mouseenter="hoveredCell = cell.id"
           @mouseleave="hoveredCell = null"
           @focus="hoveredCell = cell.id"
           @blur="hoveredCell = null">
          <rect :x="cell.boxX" :y="cell.boxY" :width="cell.boxW" height="20" rx="4"
                :fill="withAlpha(theme.surface, 0.9)"
                :stroke="hoveredCell === cell.id ? theme.inkMuted : theme.hairline"/>
          <text :x="cell.boxX + 8" :y="cell.boxY + 10" dominant-baseline="central" font-size="11" :font-family="theme.fontSans">
            <tspan :font-family="theme.fontMono" font-weight="600" :fill="theme.ink">{{ cell.count }}</tspan>
            <tspan v-if="cell.text" dx="6" :fill="hoveredCell === cell.id ? theme.ink : theme.inkSecondary">{{ cell.text }}</tspan>
          </text>
        </g>

      </svg>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { useSvgFigure } from "~/features/export/useExportables"
import type { LegendItem, LegendRamp } from "~/features/export/figure"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from "vue";
import * as d3 from "d3";
import { chartTheme, useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { useDataStore } from "~/features/snapshot/data.store";
import { useGroupsStore } from "~/features/groups/groups.store";
import { formatReading } from "~/shared/format";
import { distinctTails, logTicks, metricValue, placeLabels, type Box, type PlotReading } from "~/features/metrics/plotReading";
import { t } from "~/shared/i18n";

// Scatter plot over any rows that carry a `name` and numeric columns:
// components or files. It fills its pane, reads itself (medians and named
// quadrants, or the main sequence and its zones), shows where marks pile up
// along each axis, and names the marks furthest out. Axis domains come from
// `domainRows` so filtering never rescales the plot. Wheel zooms, alt-drag
// (or middle button) pans, plain drag box-selects, shift-click toggles one
// mark, and changing an axis glides the marks to their new places.

type Row = { name: string; [key: string]: any };
type Point = { x: number; y: number };
type Mark = { row: Row; x: number; y: number; r: number };
type CellId = PlotReading["cells"][number]["id"];

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  domainRows: { type: Array as PropType<Row[]>, required: true },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
  labelMode: { type: String as PropType<"auto" | "all" | "none">, default: "auto" },
  xAxisProperty: { type: String, required: true },
  yAxisProperty: { type: String, required: true },
  xLog: { type: Boolean, default: false },
  yLog: { type: Boolean, default: false },
  radiusProperty: { type: String as PropType<string | null>, default: null },
  colorProperty: { type: String as PropType<string | null>, default: null },
  reading: { type: Object as PropType<PlotReading | null>, default: null },
  /** What each corner or zone means, by cell id. */
  cellText: { type: Object as PropType<Partial<Record<CellId, string>>>, default: () => ({}) },
  searchQuery: { type: String, default: "" },
  hiddenGroups: { type: Object as PropType<Set<string>>, default: () => new Set<string>() },
  activeFilters: { type: Object as PropType<Set<string>>, default: () => new Set<string>() },
  hoveredGroupId: { type: String as PropType<string | null>, default: null },
});

const emit = defineEmits<{
  (e: "update:selected", names: string[]): void;
  (e: "clicked", row: Row): void;
}>();

const store = useDataStore();
const groupsStore = useGroupsStore();
const { theme, version: themeVersion } = useChartTheme();

// ─── Size: the plot fills its pane ───
const root = ref<HTMLDivElement | null>(null);
const size = ref({ w: 900, h: 600 });
const margin = { top: 40, right: 40, bottom: 60, left: 64 };
const width = computed(() => Math.max(200, size.value.w - margin.left - margin.right));
const height = computed(() => Math.max(160, size.value.h - margin.top - margin.bottom));
const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;
let observer: ResizeObserver | null = null;

const svg = ref<SVGSVGElement | null>(null);
const xAxisElement = ref<SVGGElement | null>(null);
const yAxisElement = ref<SVGGElement | null>(null);

function niceName(column: string): string {
  return store.statNiceName(column) || column;
}

// ─── Text measurement ───
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const monoFont = computed(() => `10px ${theme.value.fontMono}`);
const sansFont = computed(() => `11px ${theme.value.fontSans}`);
const monoBoldFont = computed(() => `600 11px ${theme.value.fontMono}`);

// ─── Names ───
const tails = computed(() => distinctTails(props.domainRows.map((r) => String(r.name))));
const shortOf = (name: string) => tails.value.get(name) ?? name;

// ─── Scales ───
const valuesOf = (rows: Row[], key: string) => rows.map((r) => metricValue(r, key)).filter((v) => Number.isFinite(v));

function domainOf(rows: Row[], key: string, log: boolean): [number, number] {
  const values = valuesOf(rows, key);
  if (values.length === 0) return [0, 1];
  const min = d3.min(values) as number;
  let max = d3.max(values) as number;
  if (max <= min) max = min + 1;
  if (log) return [Math.min(0, min), max * 1.25];
  const pad = (max - min) * 0.06;
  // Non-negative metrics start at zero so the origin means what it says.
  return [min >= 0 ? 0 : min - pad, max + pad];
}

function baseScale(log: boolean) {
  return log ? d3.scaleSymlog().constant(1) : d3.scaleLinear();
}

const xScale = computed(() => baseScale(props.xLog).domain(domainOf(props.domainRows, props.xAxisProperty, props.xLog)).range([0, width.value]));
const yScale = computed(() => baseScale(props.yLog).domain(domainOf(props.domainRows, props.yAxisProperty, props.yLog)).range([height.value, 0]));
const radiusScale = computed<(v: number) => number>(() => {
  const key = props.radiusProperty;
  const base = props.grain === "file" ? 3 : 4.5;
  if (!key) return () => base;
  const values = valuesOf(props.domainRows, key);
  if (values.length === 0) return () => base;
  const min = Math.max(0, d3.min(values) as number);
  const max = Math.max(min + 1, d3.max(values) as number);
  const scale = d3.scaleSqrt().domain([min, max]).range([3, 17]).clamp(true);
  return (v: number) => (Number.isFinite(v) ? scale(v) : 3);
});

// Zoomed copies of the scales; the zoom transform lives in SVG user space.
const transform = shallowRef<d3.ZoomTransform>(d3.zoomIdentity);
const xz = computed(() => transform.value.rescaleX(xScale.value));
const yz = computed(() => transform.value.rescaleY(yScale.value));

const marks = computed<Mark[]>(() => {
  const out: Mark[] = [];
  const rScale = radiusScale.value;
  for (const row of props.rows) {
    const xv = metricValue(row, props.xAxisProperty);
    const yv = metricValue(row, props.yAxisProperty);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const rv = props.radiusProperty ? metricValue(row, props.radiusProperty) : NaN;
    out.push({ row, x: xz.value(xv), y: yz.value(yv), r: rScale(rv) });
  }
  return out;
});

// Large marks underneath, selected and hovered on top.
const orderedMarks = computed(() => {
  const sel = selectedSet.value;
  return [...marks.value].sort((a, b) => (sel.has(a.row.name) ? 1 : 0) - (sel.has(b.row.name) ? 1 : 0) || b.r - a.r);
});

const hoveredMark = computed(() => (hovered.value ? marks.value.find((m) => m.row.name === hovered.value!.row.name) ?? null : null));

const mainSequenceAngle = computed(() => {
  const dx = xz.value(1) - xz.value(0);
  const dy = yz.value(0) - yz.value(1);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
});

function zonePoints(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${xz.value(x)},${yz.value(y)}`).join(" ");
}

const inRange = (v: number, max: number) => v >= 0 && v <= max;

const tooltipKeys = computed(() => {
  const keys = [props.xAxisProperty, props.yAxisProperty, props.radiusProperty, props.colorProperty].filter((k): k is string => !!k);
  return Array.from(new Set(keys));
});

// Rank among every row of the grain, largest first.
const sortedDesc = computed(() => {
  const out = new Map<string, number[]>();
  for (const key of tooltipKeys.value) {
    out.set(key, valuesOf(props.domainRows, key).sort((a, b) => b - a));
  }
  return out;
});

function rankOf(key: string, row: Row): string {
  const v = metricValue(row, key);
  const list = sortedDesc.value.get(key);
  if (!list || !Number.isFinite(v)) return "";
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] > v) lo = mid + 1; else hi = mid; }
  return `#${lo + 1}`;
}

// ─── Axes ───
const tickFormat = (v: d3.NumberValue) => {
  const n = Number(v);
  return Math.abs(n) >= 10000 ? d3.format("~s")(n) : formatReading(n);
};

function styleAxis(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  const t = chartTheme();
  g.selectAll("path.domain").attr("stroke", "none");
  g.selectAll(".tick line").attr("stroke", t.hairline);
  g.selectAll("text").attr("fill", t.inkMuted).attr("font-size", 10).attr("font-family", t.fontMono);
}

function drawAxes() {
  if (!xAxisElement.value || !yAxisElement.value) return;
  const xa = d3.axisBottom(xz.value).tickSize(-height.value).tickPadding(8).tickFormat(tickFormat);
  const ya = d3.axisLeft(yz.value).tickSize(-width.value).tickPadding(8).tickFormat(tickFormat);
  if (props.xLog) xa.tickValues(logTicks(xz.value.domain() as [number, number], Math.max(4, Math.floor(width.value / 70))));
  else xa.ticks(Math.max(3, Math.floor(width.value / 90)));
  if (props.yLog) ya.tickValues(logTicks(yz.value.domain() as [number, number], Math.max(4, Math.floor(height.value / 48))));
  else ya.ticks(Math.max(3, Math.floor(height.value / 60)));
  styleAxis(d3.select(xAxisElement.value).attr("transform", `translate(0,${height.value})`).call(xa));
  styleAxis(d3.select(yAxisElement.value).call(ya));
}

watch([xz, yz, themeVersion], () => {
  drawAxes();
});

// ─── Glide on an axis change ───
const gliding = ref(false);
let glideTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => [props.xAxisProperty, props.yAxisProperty, props.xLog, props.yLog, props.radiusProperty], (now, before) => {
  hovered.value = null;
  // A zoom window belongs to the axes it was taken on: new axes open on the whole plot.
  const axesChanged = !before || now.slice(0, 4).some((v, i) => v !== before[i]);
  if (axesChanged && svg.value && zoom) d3.select(svg.value).call(zoom.transform, d3.zoomIdentity);
  gliding.value = true;
  clearTimeout(glideTimer);
  glideTimer = setTimeout(() => { gliding.value = false; }, 650);
});

// ─── Marginal distributions ───
const BINS = 48;
type Bar = { x0: number; x1: number; h: number; hot?: boolean };
const marginMax = 22;

function margin1d(values: number[], selValues: number[], hotValue: number | null, span: number, apply: (v: number) => number): { bars: Bar[]; sel: Bar[] } {
  // Bin in the unzoomed pixel space, then carry each bin through the zoom.
  const counts = new Array(BINS).fill(0);
  const selCounts = new Array(BINS).fill(0);
  const binOf = (p: number) => Math.min(BINS - 1, Math.max(0, Math.floor((p / span) * BINS)));
  for (const p of values) counts[binOf(p)]++;
  for (const p of selValues) selCounts[binOf(p)]++;
  const hot = hotValue == null ? -1 : binOf(hotValue);
  const peak = Math.max(1, ...counts);
  const h = (c: number) => (c === 0 ? 0 : Math.max(1.5, Math.sqrt(c / peak) * marginMax));
  const edge = (i: number) => apply((i / BINS) * span);
  const bars: Bar[] = [];
  const sel: Bar[] = [];
  for (let i = 0; i < BINS; i++) {
    if (counts[i] > 0) bars.push({ x0: edge(i), x1: edge(i + 1), h: h(counts[i]), hot: i === hot });
    if (selCounts[i] > 0) sel.push({ x0: edge(i), x1: edge(i + 1), h: h(selCounts[i]) });
  }
  return { bars, sel };
}

const basePoints = computed(() => {
  const xs: number[] = [], ys: number[] = [], sxs: number[] = [], sys: number[] = [];
  const sel = selectedSet.value.size > 0 ? selectedSet.value : selecting.value;
  for (const row of props.rows) {
    const xv = metricValue(row, props.xAxisProperty);
    const yv = metricValue(row, props.yAxisProperty);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const px = xScale.value(xv), py = yScale.value(yv);
    xs.push(px); ys.push(py);
    if (sel.has(row.name)) { sxs.push(px); sys.push(py); }
  }
  return { xs, ys, sxs, sys };
});

const marginX = computed(() => {
  const hv = hovered.value ? xScale.value(metricValue(hovered.value.row, props.xAxisProperty)) : null;
  return margin1d(basePoints.value.xs, basePoints.value.sxs, hv, width.value, (p) => transform.value.applyX(p));
});
const marginY = computed(() => {
  const hv = hovered.value ? yScale.value(metricValue(hovered.value.row, props.yAxisProperty)) : null;
  return margin1d(basePoints.value.ys, basePoints.value.sys, hv, height.value, (p) => transform.value.applyY(p));
});

// ─── Labels ───
const labels = computed(() => {
  const sel = selectedSet.value;
  const hoveredName = hovered.value?.row.name ?? null;
  const within = marks.value.filter((m) => m.x >= 0 && m.x <= width.value && m.y >= 0 && m.y <= height.value && isSelectable(m.row.name));
  const byName = new Map(within.map((m) => [m.row.name, m]));
  const cand = (m: Mark) => ({ id: m.row.name, x: m.x, y: m.y, r: m.r, text: shortOf(m.row.name) });

  if (props.labelMode === "all") {
    return within.map((m) => ({ id: m.row.name, x: m.x + m.r + 4, y: m.y, anchor: "start" as const, text: shortOf(m.row.name) }));
  }
  const first: Mark[] = [];
  if (hoveredName && byName.has(hoveredName)) first.push(byName.get(hoveredName)!);
  for (const name of sel) if (name !== hoveredName && byName.has(name)) first.push(byName.get(name)!);
  const rest: Mark[] = [];
  if (props.labelMode === "auto") {
    // The furthest-out marks first, then any mark with room around it once zoomed in.
    const order = props.reading?.outliers ?? [];
    for (const name of order) {
      const m = byName.get(name);
      if (m && !sel.has(name) && name !== hoveredName) rest.push(m);
    }
  }
  const area = width.value * height.value;
  const budget = Math.max(6, Math.min(36, Math.round(area / 16000))) + first.length;
  const font = monoFont.value;
  return placeLabels([...first, ...rest].map(cand), within, { width: width.value, height: height.value }, {
    limit: budget,
    measure: (t) => measure(t, font) + 2,
    obstacles: labelObstacles.value,
  });
});

function labelOpacity(name: string): number {
  if (selectedSet.value.size > 0 && !selectedSet.value.has(name) && hovered.value?.row.name !== name) return 0.45;
  return Math.min(1, opacityFor(name) + 0.1);
}

// Corner readings and the median tag are drawn over the marks; labels keep clear of them.
const labelObstacles = computed<Box[]>(() => {
  const boxes: Box[] = cellLabels.value.map((c) => ({ x0: c.boxX - 2, y0: c.boxY - 2, x1: c.boxX + c.boxW + 2, y1: c.boxY + 22 }));
  const r = props.reading;
  if (r?.kind === "medians") {
    const y = yz.value(r.my);
    boxes.push({ x0: 0, y0: y - 16, x1: 4 + measure(`median ${formatReading(r.my)}`, monoFont.value) + 4, y1: y });
  }
  return boxes;
});

// ─── Hover chips ───
const xChip = computed(() => (hovered.value ? formatReading(hovered.value.row[props.xAxisProperty]) : ""));
const yChip = computed(() => (hovered.value ? formatReading(hovered.value.row[props.yAxisProperty]) : ""));
const chipWidth = (s: string) => s.length * 6 + 10;

// ─── The reading in the corners ───
const hoveredCell = ref<CellId | null>(null);
const cellMembers = computed(() => {
  const out = new Map<CellId, Set<string>>();
  for (const c of props.reading?.cells ?? []) out.set(c.id, new Set(c.names));
  return out;
});

function cellOf(name: string): string {
  for (const [id, set] of cellMembers.value) if (set.has(name)) return props.cellText[id] ?? "";
  return "";
}

const cellLabels = computed(() => {
  const r = props.reading;
  if (!r) return [];
  const w = width.value, h = height.value;
  const labels = r.cells
    .filter((c) => props.cellText[c.id])
    .map((c) => {
      const text = props.cellText[c.id]!;
      const count = String(c.names.length);
      const boxW = 8 + measure(count, monoBoldFont.value) + 6 + measure(text, sansFont.value) + 8;
      const corner = c.id === "pain" ? "bl" : c.id === "useless" ? "tr" : c.id;
      const left = corner === "tl" || corner === "bl";
      const top = corner === "tl" || corner === "tr";
      return {
        id: c.id,
        text,
        count: c.names.length,
        boxW,
        boxX: left ? 8 : w - 8 - boxW,
        boxY: top ? 8 : h - 28,
        left,
        top,
      };
    });
  // In a narrow plot the two labels of a row would collide: keep the counts, the words live in Reading.
  for (const top of [true, false]) {
    const row = labels.filter((l) => l.top === top);
    const l = row.find((q) => q.left), rr = row.find((q) => !q.left);
    if (l && rr && l.boxX + l.boxW + 8 > rr.boxX) {
      for (const q of [l, rr]) {
        q.text = "";
        q.boxW = 8 + measure(String(q.count), monoBoldFont.value) + 8;
        if (!q.left) q.boxX = w - 8 - q.boxW;
      }
    }
  }
  return labels;
});

function selectCell(id: CellId, event: MouseEvent | KeyboardEvent) {
  const names = props.reading?.cells.find((c) => c.id === id)?.names ?? [];
  const additive = event.shiftKey || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey;
  emit("update:selected", additive ? Array.from(new Set([...props.selected, ...names])) : names);
}

// ─── Keys ───
const sizeKey = computed(() => {
  const key = props.radiusProperty;
  if (!key) return null;
  const values = valuesOf(props.domainRows, key);
  if (values.length === 0) return null;
  const lo = Math.max(0, d3.min(values) as number);
  const hi = d3.max(values) as number;
  const r0 = radiusScale.value(lo), r1 = radiusScale.value(hi);
  const v0 = formatReading(lo), v1 = formatReading(hi);
  const x1 = 34 + r0 * 2 + v0.length * 6 + 10;
  return { r0, r1, v0, v1, x1 };
});

const colorScale = computed(() => {
  const key = props.colorProperty;
  if (!key) return null;
  const values = valuesOf(props.domainRows, key);
  if (values.length === 0) return null;
  const t = theme.value;
  // Health reads the other way: the hot end is the low score.
  const ramp = /hotspot/.test(key) ? t.heat : /code_health/.test(key) ? [...t.heat].reverse() : t.blues;
  const scale = d3.scaleQuantile<string>().domain(values).range(ramp);
  return { scale, values };
});

const colorKey = computed(() => {
  const c = colorScale.value;
  if (!c) return null;
  const q = c.scale.quantiles();
  const lo = d3.min(c.values) as number, hi = d3.max(c.values) as number;
  const edges = [lo, ...q, hi];
  const swatches = c.scale.range().map((color, i) => ({ color, range: `${formatReading(edges[i])} – ${formatReading(edges[i + 1])}` }));
  return { swatches, lo: formatReading(lo), hi: formatReading(hi) };
});

// ─── Zoom ───
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

function zoomIn() {
  if (svg.value && zoom) d3.select(svg.value).transition().duration(180).call(zoom.scaleBy, 1.4);
}
function zoomOut() {
  if (svg.value && zoom) d3.select(svg.value).transition().duration(180).call(zoom.scaleBy, 1 / 1.4);
}
function resetZoom() {
  if (svg.value && zoom) d3.select(svg.value).transition().duration(180).call(zoom.transform, d3.zoomIdentity);
}
defineExpose({ zoomIn, zoomOut, resetZoom, get figure() { return figure } });

watch([width, height], ([w, h]) => {
  // d3-zoom resolves its extent inside the transition's tween, and its
  // default reads the svg's own width: state the box instead.
  zoom?.extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]]);
});

onMounted(() => {
  if (root.value) {
    const measure = () => {
      const box = root.value!.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) size.value = { w: Math.round(box.width), h: Math.round(box.height) };
    };
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(root.value);
  }
  drawAxes();
  if (!svg.value) return;
  zoom = d3.zoom<SVGSVGElement, unknown>()
      // An axis chart has nothing outside its data: never smaller than the whole
      // plot, never panned past its edges.
      .scaleExtent([1, 60])
      .translateExtent([[0, 0], [width.value, height.value]])
      .extent([[0, 0], [width.value, height.value]])
      .filter((event: any) => {
        if (event.type === "wheel") return true;
        // Plain drag is box-select; pan needs alt or the middle button.
        if (event.type === "mousedown") return event.button === 1 || event.altKey;
        return !event.button;
      })
      .on("zoom", (event) => { transform.value = event.transform; });
  d3.select(svg.value).call(zoom).on("dblclick.zoom", null);
  window.addEventListener("mouseup", doneDragSelecting);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(glideTimer);
  window.removeEventListener("mouseup", doneDragSelecting);
  if (svg.value) d3.select(svg.value).on(".zoom", null);
});

// ─── Hover ───
type Hovered = { row: Row; posX: number; posY: number };
const hovered = ref<Hovered | null>(null);
const isHoveringOverTooltip = ref(false);

function hoverOver(mark: Mark, event: MouseEvent) {
  if (dragAnchor.value != null) return;
  if (hovered.value?.row.name === mark.row.name) return;
  const rect = (event.currentTarget as SVGCircleElement).getBoundingClientRect();
  const posX = rect.x + rect.width / 2 + 14;
  // Flip the card to the left of the mark near the window's right edge.
  hovered.value = { row: mark.row, posX: posX + 288 > window.innerWidth ? rect.x - 14 - 288 : posX, posY: Math.min(rect.y + rect.height / 2 + 10, window.innerHeight - 200) };
}

function mouseMove(event: MouseEvent) {
  if (!hovered.value || isHoveringOverTooltip.value) return;
  const m = hoveredMark.value;
  const el = svg.value;
  if (!m || !el) { hovered.value = null; return; }
  const box = el.getBoundingClientRect();
  const dx = event.clientX - (box.x + margin.left + m.x);
  const dy = event.clientY - (box.y + margin.top + m.y);
  if (Math.hypot(dx, dy) > m.r + 18) hovered.value = null;
}

// ─── Box selection ───
const mouseCoords = ref<Point>({ x: 0, y: 0 });
const dragAnchor = ref<Point | null>(null);

function userPoint(evt: MouseEvent): Point | null {
  const el = svg.value;
  if (!el) return null;
  const ctm = el.getScreenCTM();
  if (!ctm) return null;
  const pt = el.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function updateMouseCoords(evt: MouseEvent) {
  if (dragAnchor.value == null) return;
  const p = userPoint(evt);
  if (p) mouseCoords.value = p;
}

function beginDragSelecting(event: MouseEvent) {
  if (event.button !== 0 || event.altKey) return;
  const p = userPoint(event);
  if (!p) return;
  dragAnchor.value = p;
  mouseCoords.value = p;
  hovered.value = null;
}

const dragRectangle = computed(() => {
  const a = dragAnchor.value;
  if (!a) return null;
  const b = mouseCoords.value;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
});

const selecting = computed<Set<string>>(() => {
  const rect = dragRectangle.value;
  if (!rect || (rect.width < 3 && rect.height < 3)) return new Set();
  const out = new Set<string>();
  for (const m of marks.value) {
    if (m.x > rect.x && m.x < rect.x + rect.width && m.y > rect.y && m.y < rect.y + rect.height && isSelectable(m.row.name)) out.add(m.row.name);
  }
  return out;
});

function doneDragSelecting(event: MouseEvent) {
  if (dragAnchor.value == null) return;
  const rect = dragRectangle.value;
  const isClick = !rect || (rect.width < 3 && rect.height < 3);
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  const picked = Array.from(selecting.value);
  dragAnchor.value = null;
  if (isClick) {
    // A click on empty canvas clears the selection unless a modifier says keep it.
    if (!additive && props.selected.length > 0) emit("update:selected", []);
    return;
  }
  emit("update:selected", additive ? Array.from(new Set([...props.selected, ...picked])) : picked);
}

// ─── Groups, colours, visibility ───
const selectedSet = computed(() => new Set(props.selected));

const groupIndex = computed(() => (props.grain === "file" ? groupsStore.fileGroupIndex : groupsStore.componentGroupIndex));

function visibleGroupsOf(name: string) {
  const groups = groupIndex.value.get(name) || [];
  return groups.filter((g) => !props.hiddenGroups.has(g.id));
}

const multiColorGradients = computed(() => {
  if (props.colorProperty) return [];
  const seen = new Map<string, { id: string; stops: Array<{ offset: string; color: string }> }>();
  for (const row of props.rows) {
    const groups = visibleGroupsOf(row.name);
    if (groups.length <= 1) continue;
    const colors = groups.map((g) => g.color);
    const key = colors.join("-");
    if (seen.has(key)) continue;
    const stops: Array<{ offset: string; color: string }> = [];
    const n = colors.length;
    for (let i = 0; i < n; i++) {
      stops.push({ offset: `${(i / n) * 100}%`, color: colors[i] });
      stops.push({ offset: `${((i + 1) / n) * 100}%`, color: colors[i] });
    }
    seen.set(key, { id: `mg-plot-${key.replace(/[^a-zA-Z0-9]/g, "")}`, stops });
  }
  return Array.from(seen.values());
});

function isSelectable(name: string): boolean {
  if (props.searchQuery) {
    const q = props.searchQuery.trim().toLowerCase();
    if (q && !name.toLowerCase().includes(q)) return false;
  }
  if (props.activeFilters.size > 0) {
    if (!visibleGroupsOf(name).some((g) => props.activeFilters.has(g.id))) return false;
  }
  return true;
}

function isHighlighted(mark: Mark): boolean {
  const name = mark.row.name;
  return hovered.value?.row.name === name || selecting.value.has(name) || selectedSet.value.has(name);
}

function fillFor(mark: Mark): string {
  const name = mark.row.name;
  const t = theme.value;
  const c = colorScale.value;
  if (c && props.colorProperty) {
    const v = metricValue(mark.row, props.colorProperty);
    return Number.isFinite(v) ? c.scale(v) : withAlpha(t.inkMuted, 0.4);
  }
  const groups = visibleGroupsOf(name);
  if (groups.length === 0) return withAlpha(t.inkMuted, 0.55);
  if (groups.length === 1) return groups[0].color;
  const key = groups.map((g) => g.color).join("-");
  return `url(#mg-plot-${key.replace(/[^a-zA-Z0-9]/g, "")})`;
}

function strokeFor(mark: Mark): string {
  const t = theme.value;
  if (selecting.value.has(mark.row.name) || selectedSet.value.has(mark.row.name)) return t.blue;
  if (hovered.value?.row.name === mark.row.name) return t.ink;
  return withAlpha(t.surface, 0.9);
}

function opacityFor(name: string): number {
  if (props.searchQuery) {
    const q = props.searchQuery.trim().toLowerCase();
    if (q && !name.toLowerCase().includes(q)) return 0.08;
  }
  const groups = visibleGroupsOf(name);
  if (props.hoveredGroupId) return groups.some((g) => g.id === props.hoveredGroupId) ? 1 : 0.08;
  if (props.activeFilters.size > 0) return groups.some((g) => props.activeFilters.has(g.id)) ? 1 : 0.08;
  if (hoveredCell.value) return cellMembers.value.get(hoveredCell.value)?.has(name) ? 1 : 0.12;
  const focus = selecting.value.size > 0 ? selecting.value : selectedSet.value;
  if (focus.size > 0) return focus.has(name) ? 1 : 0.22;
  return 0.9;
}

function markClicked(event: MouseEvent, row: Row) {
  if (!isSelectable(row.name)) return;
  // A click selects; a double-click or the inspector opens.
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    const next = new Set(props.selected);
    if (next.has(row.name)) next.delete(row.name);
    else next.add(row.name);
    emit("update:selected", Array.from(next));
  } else {
    emit("update:selected", [row.name]);
  }
}

// ─── Legend: what colour, size and the guides mean ───
const figure = useSvgFigure({
  title: t("metrics.componentPlotterDiagram.metricsPlot"),
  svg: () => svg.value,
  legend: () => {
    const theme2 = theme.value;
    const items: LegendItem[] = [];
    const ramps: LegendRamp[] = [];
    const notes: string[] = [];
    const ck = colorKey.value;
    if (ck && props.colorProperty) {
      for (const sw of ck.swatches) items.push({ label: sw.range, color: sw.color, mark: "dot" });
      notes.push(t("metrics.componentPlotterDiagram.colourFifthsMarks", { colorProperty: niceName(props.colorProperty) }));
    } else {
      const counts = new Map<string, { name: string; color: string; n: number }>();
      let none = 0;
      for (const row of props.rows) {
        const groups = visibleGroupsOf(row.name);
        if (!groups.length) none++;
        for (const g of groups) {
          const c = counts.get(g.id) ?? { name: g.name, color: g.color, n: 0 };
          c.n++;
          counts.set(g.id, c);
        }
      }
      const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
      for (const g of ranked.slice(0, 12)) items.push({ label: g.name, color: g.color, mark: "dot", count: g.n });
      if (ranked.length > 12) notes.push(t("metrics.componentPlotterDiagram.moreGroupsDrawnTheir", { value: ranked.length - 12 }));
      if (none && ranked.length) items.push({ label: t("metrics.componentPlotterDiagram.noGroup"), color: withAlpha(theme2.inkMuted, 0.55), mark: "dot", count: none });
      if (ranked.length && props.rows.some(r => visibleGroupsOf(r.name).length > 1)) notes.push(t("metrics.componentPlotterDiagram.markSeveralGroupsSplit"));
    }
    if (props.reading?.kind === "main-sequence") {
      items.push(
        { label: t("metrics.componentPlotterDiagram.mainSequence"), color: theme2.inkMuted, mark: "dashed" },
        { label: t("metrics.componentPlotterDiagram.zonePain"), color: withAlpha(theme2.red, 0.35) },
        { label: t("metrics.componentPlotterDiagram.zoneUselessness"), color: withAlpha(theme2.inkMuted, 0.35) },
      );
    } else if (props.reading?.kind === "medians") {
      items.push({ label: t("metrics.componentPlotterDiagram.medians"), color: theme2.hairlineStrong, mark: "dashed" });
    }
    const sk = sizeKey.value;
    if (props.radiusProperty && sk) notes.push(t("metrics.componentPlotterDiagram.size", { radiusProperty: niceName(props.radiusProperty), v0: sk.v0, v1: sk.v1 }));
    notes.push(t("metrics.componentPlotterDiagram.acrossUpOneMark", { xAxisProperty: niceName(props.xAxisProperty), value: props.xLog ? t("metrics.componentPlotterDiagram.log2") : "", yAxisProperty: niceName(props.yAxisProperty), value2: props.yLog ? t("metrics.componentPlotterDiagram.log2") : "", grain: props.grain }));
    return { items, ramps, notes };
  },
})
</script>

<style scoped>
.mark {
  transition: none;
}
.is-gliding .mark {
  transition: transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mark circle {
  transition: fill 200ms linear, opacity 160ms linear;
}
.mark-label {
  animation: label-in 200ms ease-out;
}
.cell-label:focus-visible rect {
  stroke: rgb(var(--c-accent-400));
  stroke-width: 2;
}
@keyframes label-in {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .is-gliding .mark, .mark circle, .mark-label {
    transition: none;
    animation: none;
  }
}
</style>
