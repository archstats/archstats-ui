<template>
  <div ref="box" class="relative h-full min-h-0 w-full select-none">
    <canvas
        ref="canvas"
        class="absolute inset-0"
        :class="nearAxis ? 'cursor-ns-resize' : hoverName ? 'cursor-pointer' : 'cursor-default'"
        @mousemove="onMove"
        @mouseleave="onLeave"
        @mousedown="onDown"
        @dblclick="onDouble"
    ></canvas>

    <!-- Axis titles: drag sideways to reorder, the arrows flip the axis. -->
    <div
        v-for="(axis, i) in axes"
        :key="axis.key"
        class="group absolute flex -translate-x-1/2 flex-col items-center text-center"
        :class="moving?.key === axis.key ? 'z-10 cursor-grabbing' : 'cursor-grab'"
        :style="{ left: `${axis.x + (moving?.key === axis.key ? moving.dx : 0)}px`, top: '6px', width: `${titleWidth}px` }"
        @pointerdown="startMove($event, axis.key)"
    >
      <span class="line-clamp-2 text-xs font-medium leading-4" :class="brushes[axis.key] ? 'text-blue-700' : 'text-neutral-800'" :title="`${niceName(axis.key)} · drag to reorder`">{{ niceName(axis.key) }}</span>
      <span class="flex items-center gap-1 font-mono text-[11px] leading-4 text-neutral-500">
        <template v-if="axis.scale.log">log</template>
        <button type="button" class="rounded px-0.5 text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 group-hover:opacity-100"
                :class="{ 'opacity-100 text-neutral-700': flipped.has(axis.key) }"
                :aria-label="`Flip ${niceName(axis.key)}`" :title="flipped.has(axis.key) ? 'Unflip: largest at the top' : 'Flip: largest at the bottom'"
                @pointerdown.stop @click.stop="flip(axis.key)">
          <Icon icon="arrow-up-down" :size="11"/>
        </button>
        <button v-if="brushes[axis.key]" type="button" class="rounded px-0.5 text-blue-700 hover:bg-neutral-100" :aria-label="`Clear the ${niceName(axis.key)} brush`" title="Clear this brush" @pointerdown.stop @click.stop="clearBrush(axis.key)">
          <Icon icon="x" :size="11"/>
        </button>
      </span>
    </div>

    <div v-if="hoverName && hoverPoint" class="ui-tooltip pointer-events-none fixed z-50 max-w-[420px] truncate font-mono" :style="{ left: `${hoverPoint.x + 14}px`, top: `${hoverPoint.y + 14}px` }">{{ hoverName }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect, type PropType } from "vue";
import * as d3 from "d3";
import Icon from "~/shared/ui/Icon.vue";
import { useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { useDataStore } from "~/features/snapshot/data.store";
import { formatReading } from "~/shared/format";
import { median, metricValue } from "~/features/metrics/plotReading";
import { metricScale, passes, type Brushes } from "~/features/metrics/lab";
import { useCanvas } from "~/features/metrics/useCanvas";
import { useCanvasFigure } from "~/features/export/useExportables";

// Every row as one line across a vertical axis per metric: its shape is its
// profile. Lines take the heat of their hotspot score. Drag along an axis to
// brush a range; lines outside any brush fade. Titles drag to reorder axes;
// the arrows flip one. Click selects a line, double-click opens it.

type Row = { name: string; [key: string]: any };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  domainRows: { type: Array as PropType<Row[]>, required: true },
  metrics: { type: Array as PropType<string[]>, required: true },
  brushes: { type: Object as PropType<Brushes>, required: true },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  hovered: { type: String as PropType<string | null>, default: null },
  colorKey: { type: String as PropType<string | null>, default: "codesmells__hotspot_score" },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
});

const emit = defineEmits<{
  (e: "update:metrics", keys: string[]): void;
  (e: "update:brushes", b: Brushes): void;
  (e: "update:selected", names: string[]): void;
  (e: "update:hovered", name: string | null): void;
  (e: "open", name: string): void;
}>();

const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;
const { theme, version } = useChartTheme();

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const { size, context, local } = useCanvas(box, canvas);
useCanvasFigure("Metrics profiles", () => canvas.value);

const TOP = 72, BOTTOM = 26, SIDE = 64;
const flipped = reactive(new Set<string>());

const axes = computed(() => {
  const n = props.metrics.length;
  const step = n > 1 ? (size.value.w - SIDE * 2) / (n - 1) : 0;
  return props.metrics.map((key, i) => ({
    key,
    x: n > 1 ? SIDE + i * step : size.value.w / 2,
    scale: metricScale(props.domainRows, key),
    median: median(props.domainRows.map((r) => metricValue(r, key))),
  }));
});
const step = computed(() => (axes.value.length > 1 ? axes.value[1].x - axes.value[0].x : 1));
const titleWidth = computed(() => Math.max(72, Math.min(140, step.value - 8)));

const yOf = (key: string, t01: number) => {
  const t = flipped.has(key) ? 1 - t01 : t01;
  return TOP + (1 - t) * (size.value.h - TOP - BOTTOM);
};
const tOf = (key: string, y: number) => {
  const t = 1 - (y - TOP) / (size.value.h - TOP - BOTTOM);
  return flipped.has(key) ? 1 - t : t;
};

const survivors = computed(() => (Object.keys(props.brushes).length ? new Set(props.rows.filter((r) => passes(r, props.brushes)).map((r) => r.name)) : null));
const selectedSet = computed(() => new Set(props.selected));

const heat = computed(() => {
  const key = props.colorKey;
  const t = theme.value;
  if (!key) return () => t.inkSecondary;
  const values = props.domainRows.map((r) => metricValue(r, key)).filter(Number.isFinite);
  if (!values.length) return () => t.inkSecondary;
  const ramp = /code_health/.test(key) ? [...t.heat].reverse() : t.heat;
  const q = d3.scaleQuantile<string>().domain(values).range(ramp);
  return (row: Row) => {
    const v = metricValue(row, key);
    return Number.isFinite(v) ? q(v) : t.hairlineStrong;
  };
});

// Points per row, NaN where a reading is missing (the line breaks there).
const lines = computed(() => props.rows.map((row) => ({
  row,
  ys: axes.value.map((a) => yOf(a.key, a.scale.at(metricValue(row, a.key)))),
  hot: metricValue(row, props.colorKey ?? "") || 0,
})).sort((a, b) => a.hot - b.hot));

// ─── Drawing ───
function stroke(ctx: CanvasRenderingContext2D, ys: number[]) {
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (!Number.isFinite(y)) { pen = false; continue; }
    if (pen) ctx.lineTo(axes.value[i].x, y); else ctx.moveTo(axes.value[i].x, y);
    pen = true;
  }
  ctx.stroke();
}

function draw() {
  const ctx = context();
  if (!ctx) return;
  const t = theme.value;
  const surv = survivors.value;
  const sel = selectedSet.value;
  const focus = hoverName.value ?? props.hovered;
  const files = props.grain === "file";
  const H = size.value.h;

  // Axes, brushes, medians, ends.
  for (const a of axes.value) {
    ctx.fillStyle = t.hairlineStrong;
    ctx.fillRect(Math.round(a.x) - 0.5, TOP, 1, H - TOP - BOTTOM);
    const b = props.brushes[a.key];
    if (b) {
      const y0 = yOf(a.key, a.scale.at(b[0])), y1 = yOf(a.key, a.scale.at(b[1]));
      const top = Math.min(y0, y1), h = Math.max(2, Math.abs(y1 - y0));
      ctx.fillStyle = withAlpha(t.blue, 0.16);
      ctx.fillRect(a.x - 8, top, 16, h);
      ctx.fillStyle = t.blue;
      ctx.fillRect(a.x - 8, top, 16, 1);
      ctx.fillRect(a.x - 8, top + h - 1, 16, 1);
    }
    const my = yOf(a.key, a.scale.at(a.median));
    if (Number.isFinite(my)) {
      ctx.fillStyle = t.inkMuted;
      ctx.fillRect(a.x - 5, Math.round(my) - 0.5, 10, 1);
    }
    ctx.font = `10px ${t.fontMono}`;
    ctx.fillStyle = t.inkMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const hiLabel = formatReading(a.scale.domain[1]), loLabel = formatReading(a.scale.domain[0]);
    const flip = flipped.has(a.key);
    ctx.fillText(flip ? loLabel : hiLabel, a.x, TOP - 12);
    ctx.fillText(flip ? hiLabel : loLabel, a.x, H - BOTTOM + 4);
  }

  // Lines: those outside a brush faint, those in play by heat (hottest on top), selection, focus.
  ctx.lineJoin = "round";
  if (surv) {
    ctx.strokeStyle = withAlpha(t.inkMuted, files ? 0.04 : 0.08);
    ctx.lineWidth = 1;
    for (const l of lines.value) if (!surv.has(l.row.name)) stroke(ctx, l.ys);
  }
  ctx.lineWidth = 1;
  ctx.globalAlpha = files ? (surv ? 0.35 : 0.14) : surv ? 0.85 : 0.45;
  for (const l of lines.value) {
    if (surv && !surv.has(l.row.name)) continue;
    if (sel.has(l.row.name)) continue;
    ctx.strokeStyle = heat.value(l.row);
    stroke(ctx, l.ys);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t.blue;
  ctx.lineWidth = 1.75;
  for (const l of lines.value) if (sel.has(l.row.name)) stroke(ctx, l.ys);

  if (focus) {
    const l = lines.value.find((q) => q.row.name === focus)
      ?? (() => { const row = props.domainRows.find((r) => r.name === focus); return row ? { row, ys: axes.value.map((a) => yOf(a.key, a.scale.at(metricValue(row, a.key)))), hot: 0 } : null; })();
    if (l) {
      ctx.strokeStyle = t.surface;
      ctx.lineWidth = 5;
      stroke(ctx, l.ys);
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 2;
      stroke(ctx, l.ys);
      ctx.font = `600 10px ${t.fontMono}`;
      ctx.textBaseline = "middle";
      axes.value.forEach((a, i) => {
        const y = l.ys[i];
        if (!Number.isFinite(y)) return;
        ctx.fillStyle = t.ink;
        ctx.beginPath();
        ctx.arc(a.x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        const label = formatReading(l.row[a.key]);
        const last = i === axes.value.length - 1;
        ctx.textAlign = last ? "right" : "left";
        const lx = last ? a.x - 7 : a.x + 7;
        ctx.lineWidth = 3;
        ctx.strokeStyle = t.surface;
        ctx.strokeText(label, lx, y - 8);
        ctx.fillText(label, lx, y - 8);
      });
    }
  }
}


// ─── Pointer: hover, select, brush ───
const hoverName = ref<string | null>(null);
const hoverPoint = ref<{ x: number; y: number } | null>(null);
const nearAxis = ref<string | null>(null);
const brushDrag = ref<null | { key: string; y0: number; y1: number; moved: boolean }>(null);

function axisNear(x: number, y: number): string | null {
  if (y < TOP - 4 || y > size.value.h - BOTTOM + 4) return null;
  const a = axes.value.find((q) => Math.abs(q.x - x) <= 10);
  return a?.key ?? null;
}

function lineNear(x: number, y: number): string | null {
  const as = axes.value;
  if (as.length < 2) return null;
  let i = as.findIndex((a, k) => k < as.length - 1 && x >= a.x && x <= as[k + 1].x);
  if (i < 0) i = x < as[0].x ? 0 : as.length - 2;
  const f = Math.max(0, Math.min(1, (x - as[i].x) / (as[i + 1].x - as[i].x)));
  const surv = survivors.value;
  let best: string | null = null, bestD = 5;
  for (const l of lines.value) {
    if (surv && !surv.has(l.row.name)) continue;
    const a = l.ys[i], b = l.ys[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = Math.abs(a + (b - a) * f - y);
    if (d < bestD) { bestD = d; best = l.row.name; }
  }
  return best;
}

function onMove(e: MouseEvent) {
  if (brushDrag.value || moving.value) return;
  const p = local(e);
  nearAxis.value = axisNear(p.x, p.y);
  const name = nearAxis.value ? null : lineNear(p.x, p.y);
  hoverName.value = name;
  hoverPoint.value = name ? { x: e.clientX, y: e.clientY } : null;
  emit("update:hovered", name);
}

function onLeave() {
  if (brushDrag.value) return;
  hoverName.value = null;
  hoverPoint.value = null;
  nearAxis.value = null;
  emit("update:hovered", null);
}

function onDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const p = local(e);
  const key = axisNear(p.x, p.y);
  if (key) {
    brushDrag.value = { key, y0: p.y, y1: p.y, moved: false };
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", onBrushUp, { once: true });
    return;
  }
  const name = hoverName.value;
  if (name) {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      const next = new Set(props.selected);
      next.has(name) ? next.delete(name) : next.add(name);
      emit("update:selected", [...next]);
    } else emit("update:selected", [name]);
  } else if (props.selected.length) emit("update:selected", []);
}

function onWindowMove(e: MouseEvent) {
  const d = brushDrag.value;
  if (!d) return;
  const p = local(e);
  d.y1 = Math.max(TOP, Math.min(size.value.h - BOTTOM, p.y));
  d.moved = d.moved || Math.abs(d.y1 - d.y0) > 3;
  if (!d.moved) return;
  const s = axes.value.find((a) => a.key === d.key)!.scale;
  const a = s.invert(tOf(d.key, d.y0)), b = s.invert(tOf(d.key, d.y1));
  emit("update:brushes", { ...props.brushes, [d.key]: [Math.min(a, b), Math.max(a, b)] });
}

function onBrushUp() {
  window.removeEventListener("mousemove", onWindowMove);
  const d = brushDrag.value;
  brushDrag.value = null;
  // A click on an axis clears its brush.
  if (d && !d.moved && props.brushes[d.key]) clearBrush(d.key);
}

function clearBrush(key: string) {
  const { [key]: _, ...rest } = props.brushes;
  emit("update:brushes", rest);
}

function flip(key: string) {
  flipped.has(key) ? flipped.delete(key) : flipped.add(key);
}

function onDouble() {
  if (hoverName.value) emit("open", hoverName.value);
}

// ─── Reordering by dragging a title ───
const moving = ref<null | { key: string; startX: number; dx: number }>(null);

function startMove(e: PointerEvent, key: string) {
  if (e.button !== 0) return;
  moving.value = { key, startX: e.clientX, dx: 0 };
  const move = (ev: PointerEvent) => { if (moving.value) moving.value = { ...moving.value, dx: ev.clientX - moving.value.startX }; };
  const up = () => {
    window.removeEventListener("pointermove", move);
    const m = moving.value;
    moving.value = null;
    if (!m || Math.abs(m.dx) < 6) return;
    const from = props.metrics.indexOf(m.key);
    const to = Math.max(0, Math.min(props.metrics.length - 1, from + Math.round(m.dx / step.value)));
    if (to === from) return;
    const next = [...props.metrics];
    next.splice(from, 1);
    next.splice(to, 0, m.key);
    emit("update:metrics", next);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

// Redraw whenever anything the drawing reads changes; declared last so every ref exists.
watchEffect(() => {
  void [size.value, props.rows, props.metrics, props.brushes, props.selected, props.hovered, hoverName.value, version.value, lines.value, flipped.size];
  requestAnimationFrame(draw);
});
</script>
