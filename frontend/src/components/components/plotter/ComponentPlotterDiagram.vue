<template>
  <div class="relative h-full w-full" @mouseleave="hovered = null" @mousemove="mouseMove">
    <div
        v-if="dragAnchor == null && hovered"
        class="ui-popover fixed z-50 w-64 p-3"
        :style="{ top: `${hovered.posY}px`, left: `${hovered.posX}px` }"
        @mouseenter="isHoveringOverTooltip = true"
        @mouseleave="isHoveringOverTooltip = false"
    >
      <h3 class="mb-2 truncate font-mono text-sm font-semibold text-neutral-900" :title="String(hovered.row.name)">{{ hovered.row.name }}</h3>
      <dl class="ui-kv">
        <template v-for="key in tooltipKeys" :key="key">
          <dt class="truncate" :title="key">{{ niceName(key) }}</dt>
          <dd>{{ round(hovered.row[key], 3) }}</dd>
        </template>
      </dl>
    </div>

    <svg
        ref="svg"
        class="h-full w-full"
        :viewBox="`${-margin.left} ${-margin.top} ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`"
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
      </defs>

      <g ref="xAxisElement" class="select-none"></g>
      <g ref="yAxisElement" class="select-none"></g>

      <text :x="-52" :y="height / 2" :transform="`rotate(-90, -52, ${height / 2})`" text-anchor="middle" dominant-baseline="central"
            class="select-none" :fill="theme.inkSecondary" font-size="11" font-weight="500" :font-family="theme.fontSans">
        {{ niceName(yAxisProperty) }}
      </text>
      <text :x="width / 2" :y="height + 48" text-anchor="middle"
            class="select-none" :fill="theme.inkSecondary" font-size="11" font-weight="500" :font-family="theme.fontSans">
        {{ niceName(xAxisProperty) }}
      </text>

      <g :clip-path="`url(#${clipId})`">
        <g v-if="isDistanceMainSequence">
          <line :x1="xz(0)" :y1="yz(1)" :x2="xz(1)" :y2="yz(0)" :stroke="theme.hairlineStrong" stroke-width="1" stroke-dasharray="4 3"/>
          <text :transform="`rotate(45, ${xz(0.5)}, ${yz(0.5)})`" :x="xz(0.5)" :y="yz(0.5)" text-anchor="middle" dy="-6"
                font-size="10" class="select-none" :fill="theme.inkMuted" :font-family="theme.fontSans">
            Main sequence
          </text>
        </g>

        <g v-for="mark in marks" :key="mark.row.name">
          <circle
              :cx="mark.x"
              :cy="mark.y"
              :r="mark.r"
              :fill="fillFor(mark)"
              :stroke="isHighlighted(mark) ? theme.ink : withAlpha(theme.ink, 0.35)"
              :stroke-width="isHighlighted(mark) ? 1.5 : 0.75"
              :opacity="opacityFor(mark.row.name)"
              class="cursor-pointer"
              :class="{ 'pointer-events-none': !isSelectable(mark.row.name) }"
              @mouseenter="hoverOver(mark, $event)"
              @click.stop="markClicked($event, mark.row)"
          />
          <text
              v-if="showText"
              :x="mark.x + mark.r + 4"
              :y="mark.y"
              dominant-baseline="central"
              font-size="9"
              :fill="theme.inkSecondary"
              :font-family="theme.fontMono"
              :opacity="opacityFor(mark.row.name)"
              class="pointer-events-none select-none"
          >{{ mark.row.name }}</text>
        </g>

        <rect
            v-if="dragRectangle"
            :x="dragRectangle.x" :y="dragRectangle.y" :width="dragRectangle.width" :height="dragRectangle.height"
            :fill="withAlpha(theme.blue, 0.12)" :stroke="theme.blue" stroke-width="0.75"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from "vue";
import * as d3 from "d3";
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme";
import { useDataStore } from "~/stores/data";
import { useGroupsStore } from "~/stores/groups";
import { round } from "~/utils/text";

// Scatter plot over any rows that carry a `name` and numeric columns:
// components or files. Axis domains come from `domainRows` so filtering the
// visible rows never rescales the plot. Wheel zooms, alt-drag (or middle
// button) pans, plain drag box-selects, shift-click toggles one mark.

type Row = { name: string; [key: string]: any };
type Point = { x: number; y: number };
type Mark = { row: Row; x: number; y: number; r: number };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  domainRows: { type: Array as PropType<Row[]>, required: true },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
  showText: { type: Boolean, default: false },
  xAxisProperty: { type: String, required: true },
  yAxisProperty: { type: String, required: true },
  radiusProperty: { type: String as PropType<string | null>, default: null },
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

const width = 500;
const height = 500;
const margin = { top: 12, right: 24, bottom: 64, left: 70 };
const clipId = `plot-clip-${Math.random().toString(36).slice(2, 8)}`;

const svg = ref<SVGSVGElement | null>(null);
const xAxisElement = ref<SVGGElement | null>(null);
const yAxisElement = ref<SVGGElement | null>(null);

function niceName(column: string): string {
  return store.statNiceName(column) || column;
}

// ─── Scales ───
function domainOf(rows: Row[], key: string): [number, number] {
  const values = rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
  if (values.length === 0) return [0, 1];
  const min = d3.min(values) as number;
  let max = d3.max(values) as number;
  if (max <= min) max = min + 1;
  const pad = (max - min) * 0.08;
  // Non-negative metrics start at zero so the origin means what it says.
  return [min >= 0 ? 0 : min - pad, max + pad];
}

const xScale = computed(() => d3.scaleLinear().domain(domainOf(props.domainRows, props.xAxisProperty)).range([0, width]));
const yScale = computed(() => d3.scaleLinear().domain(domainOf(props.domainRows, props.yAxisProperty)).range([height, 0]));
const radiusScale = computed<(v: number) => number>(() => {
  const key = props.radiusProperty;
  if (!key) return () => 5;
  const values = props.domainRows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
  if (values.length === 0) return () => 5;
  const min = Math.max(0, d3.min(values) as number);
  const max = Math.max(min + 1, d3.max(values) as number);
  const scale = d3.scaleSqrt().domain([min, max]).range([4, 18]).clamp(true);
  return (v: number) => (Number.isFinite(v) ? scale(v) : 4);
});

// Zoomed copies of the scales; the zoom transform lives in SVG user space.
const transform = shallowRef<d3.ZoomTransform>(d3.zoomIdentity);
const xz = computed(() => transform.value.rescaleX(xScale.value));
const yz = computed(() => transform.value.rescaleY(yScale.value));

const marks = computed<Mark[]>(() => {
  const out: Mark[] = [];
  const rScale = radiusScale.value;
  for (const row of props.rows) {
    const xv = Number(row[props.xAxisProperty]);
    const yv = Number(row[props.yAxisProperty]);
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const rv = props.radiusProperty ? Number(row[props.radiusProperty]) : NaN;
    out.push({ row, x: xz.value(xv), y: yz.value(yv), r: rScale(rv) });
  }
  return out;
});

const isDistanceMainSequence = computed(() =>
    props.xAxisProperty === store.statName("modularity__instability") && props.yAxisProperty === store.statName("modularity__abstractness"),
);

const tooltipKeys = computed(() => {
  const keys = [props.xAxisProperty, props.yAxisProperty, props.radiusProperty].filter((k): k is string => !!k);
  return Array.from(new Set(keys));
});

// ─── Axes ───
function styleAxis(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  const t = chartTheme();
  g.selectAll("path.domain").attr("stroke", t.hairlineStrong);
  g.selectAll("line").attr("stroke", t.hairline);
  g.selectAll("text").attr("fill", t.inkSecondary).attr("font-size", 10).attr("font-family", t.fontMono);
}

function drawAxes() {
  if (!xAxisElement.value || !yAxisElement.value) return;
  const xAxis = d3.axisBottom(xz.value).ticks(8).tickSize(-height).tickPadding(8);
  const yAxis = d3.axisLeft(yz.value).ticks(8).tickSize(-width).tickPadding(8);
  styleAxis(d3.select(xAxisElement.value).attr("transform", `translate(0,${height})`).call(xAxis));
  styleAxis(d3.select(yAxisElement.value).call(yAxis));
}

watch([xz, yz, themeVersion], () => {
  drawAxes();
  hovered.value = null;
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
defineExpose({ zoomIn, zoomOut, resetZoom });

onMounted(() => {
  drawAxes();
  if (!svg.value) return;
  zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 60])
      // d3-zoom resolves its extent inside the transition's tween, and its
      // default reads the svg's own width: on a CSS-sized element that throws
      // mid-frame and the transition dies silently. State the box instead.
      .extent([[0, 0], [width, height]])
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
  hovered.value = { row: mark.row, posX: 10 + rect.x + rect.width / 2, posY: 10 + rect.y + rect.height / 2 };
}

function mouseMove(event: MouseEvent) {
  if (!hovered.value || isHoveringOverTooltip.value) return;
  const dx = event.clientX - hovered.value.posX;
  const dy = event.clientY - hovered.value.posY;
  if (Math.sqrt(dx * dx + dy * dy) > 120) hovered.value = null;
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
  if (!rect) return new Set();
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
  dragAnchor.value = null;
  if (isClick) {
    // A click on empty canvas clears the selection unless a modifier says keep it.
    if (!additive && props.selected.length > 0) emit("update:selected", []);
    return;
  }
  const picked = Array.from(selecting.value);
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
  if (selecting.value.has(name) || selectedSet.value.has(name)) return t.blue;
  if (hovered.value?.row.name === name) return t.inkMuted;
  const groups = visibleGroupsOf(name);
  if (groups.length === 0) return t.hairlineStrong;
  if (groups.length === 1) return groups[0].color;
  const key = groups.map((g) => g.color).join("-");
  return `url(#mg-plot-${key.replace(/[^a-zA-Z0-9]/g, "")})`;
}

function opacityFor(name: string): number {
  if (props.searchQuery) {
    const q = props.searchQuery.trim().toLowerCase();
    if (q && !name.toLowerCase().includes(q)) return 0.08;
  }
  const groups = visibleGroupsOf(name);
  if (props.hoveredGroupId) return groups.some((g) => g.id === props.hoveredGroupId) ? 1 : 0.08;
  if (props.activeFilters.size > 0) return groups.some((g) => props.activeFilters.has(g.id)) ? 1 : 0.08;
  return 0.9;
}

function markClicked(event: MouseEvent, row: Row) {
  if (!isSelectable(row.name)) return;
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    const next = new Set(props.selected);
    if (next.has(row.name)) next.delete(row.name);
    else next.add(row.name);
    emit("update:selected", Array.from(next));
  } else {
    emit("clicked", row);
  }
}
</script>
