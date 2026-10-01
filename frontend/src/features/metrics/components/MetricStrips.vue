<template>
  <ExhibitFrame :exhibit="figure" legend-class="px-3 pb-2" fill>
    <div ref="box" class="relative h-full min-h-0 w-full select-none">
      <canvas
          ref="canvas"
          class="absolute inset-0"
          :class="dragging ? 'cursor-ew-resize' : hoverName ? 'cursor-pointer' : 'cursor-crosshair'"
          @mousemove="onMove"
          @mouseleave="onLeave"
          @mousedown="onDown"
          @dblclick="onDouble"
      ></canvas>

      <!-- One label per strip: click sorts the ranked list by it. -->
      <button
          v-for="(m, i) in layout.strips"
          :key="m.key"
          type="button"
          class="absolute left-0 flex flex-col items-start justify-center rounded-r px-3 text-left hover:bg-neutral-100"
          :class="sortKey === m.key ? 'text-neutral-900' : 'text-neutral-700'"
          :style="{ top: `${m.top}px`, height: `${m.height}px`, width: `${LABEL_W - 8}px` }"
          :title="t('metrics.metricStrips.sortList', { key: niceName(m.key) })"
          @click="emit('sort', m.key)"
      >
        <span class="flex w-full items-center gap-1.5 truncate text-sm font-medium leading-4">
          <span class="truncate">{{ niceName(m.key) }}</span>
          <Icon v-if="sortKey === m.key" icon="arrow-down" :size="11" class="shrink-0 text-neutral-500"/>
        </span>
        <span class="truncate font-mono text-xs leading-4 text-neutral-500">
          {{ t('metrics.metricStrips.median', { median: formatReading(m.median) }) }}<template v-if="m.scale.log">{{ ' ' + t('metrics.metricStrips.log') }}</template>
        </span>
        <span v-if="brushes[m.key]" class="truncate font-mono text-xs leading-4 text-blue-700">{{ formatReading(brushes[m.key][0]) }} – {{ formatReading(brushes[m.key][1]) }}</span>
      </button>

      <div v-if="hoverName && hoverPoint" class="ui-tooltip pointer-events-none fixed z-50 max-w-[420px] truncate font-mono" :style="{ left: `${hoverPoint.x + 14}px`, top: `${hoverPoint.y + 14}px` }">{{ hoverName }}</div>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, ref, watch, watchEffect, type PropType } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { useDataStore } from "~/features/snapshot/data.store";
import { formatReading } from "~/shared/format";
import { metricValue, median } from "~/features/metrics/plotReading";
import { jitter, metricScale, passes, type Brushes, type MetricScale } from "~/features/metrics/lab";
import { useCanvas } from "~/features/metrics/useCanvas";
import { useFigure } from "~/features/export/useExportables";
import type { FigureOutput } from "~/features/export/figure";
import { PRINT_W, printCanvas, printTheme, wrapText } from "~/features/metrics/printCanvas";
import type { LegendItem } from "~/features/export/figure";
import { t } from "~/shared/i18n";

// Every metric as one strip of dots, one dot per row, on a shared left-to-
// right scale. Hovering a dot threads that row through every strip, so its
// profile reads top to bottom. Dragging along a strip brushes a range; rows
// outside any brush fade on every strip. Click selects, double-click opens.

type Row = { name: string; [key: string]: any };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  domainRows: { type: Array as PropType<Row[]>, required: true },
  metrics: { type: Array as PropType<string[]>, required: true },
  brushes: { type: Object as PropType<Brushes>, required: true },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  hovered: { type: String as PropType<string | null>, default: null },
  sortKey: { type: String as PropType<string | null>, default: null },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
});

const emit = defineEmits<{
  (e: "update:brushes", b: Brushes): void;
  (e: "update:selected", names: string[]): void;
  (e: "update:hovered", name: string | null): void;
  (e: "sort", key: string): void;
  (e: "open", name: string): void;
}>();

const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;
const { theme, version } = useChartTheme();

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const { size, context, local } = useCanvas(box, canvas);
const figure = useFigure({
  title: t("metrics.metricStrips.metricsStrips"),
  // Drawn for the page, not captured from the window: see printStrips.
  ready: () => !!canvas.value && props.rows.length > 0 && props.metrics.length > 0,
  render: (opts) => printStrips(opts.light),
  svg: false,
  legend: () => {
    const theme2 = theme.value;
    const brushed = Object.keys(props.brushes).length > 0;
    const items: LegendItem[] = [{ label: brushed ? t("metrics.metricStrips.insideEveryBrushedRange") : `A ${props.grain}`, color: withAlpha(theme2.inkSecondary, 0.85), mark: "dot" }];
    if (brushed) items.push({ label: t("metrics.metricStrips.outsideBrushedRange"), color: withAlpha(theme2.inkMuted, 0.25), mark: "dot" }, { label: t("metrics.metricStrips.brushedRange"), color: withAlpha(theme2.blue, 0.2) });
    if (props.selected.length) items.push({ label: t("metrics.metricStrips.selected"), color: theme2.blue, mark: "dot" });
    items.push({ label: t("metrics.metricStrips.median2"), color: theme2.inkMuted, mark: "line" });
    return {
      items,
      notes: [
        t("metrics.metricStrips.oneStripPerMetric", { grain: props.grain }),
        ...(props.selected.length ? [t("metrics.metricStrips.selectedDrawnOverRest", { value: props.grain === "file" ? t("metrics.metricStrips.files") : t("metrics.metricStrips.components") })] : []),
      ],
    };
  },
});
defineExpose({ figure });

const LABEL_W = 200;
const RIGHT = 24;

const scales = computed(() => new Map(props.metrics.map((k) => [k, metricScale(props.domainRows, k)] as const)));

const layout = computed(() => {
  const n = Math.max(1, props.metrics.length);
  const h = Math.max(36, Math.min(76, (size.value.h - 16) / n));
  const top0 = Math.max(8, (size.value.h - h * n) / 2);
  return {
    x0: LABEL_W,
    x1: Math.max(LABEL_W + 40, size.value.w - RIGHT),
    strips: props.metrics.map((key, i) => ({
      key,
      top: top0 + i * h,
      height: h,
      scale: scales.value.get(key)! as MetricScale,
      median: median(props.domainRows.map((r) => metricValue(r, key))),
    })),
  };
});

const xOf = (s: MetricScale, v: number) => layout.value.x0 + s.at(v) * (layout.value.x1 - layout.value.x0);
const yOf = (strip: { top: number; height: number }, name: string) => strip.top + 7 + jitter(name) * (strip.height - 14);

const brushing = computed(() => Object.keys(props.brushes).length > 0);
const survivors = computed(() => {
  if (!brushing.value) return null;
  return new Set(props.rows.filter((r) => passes(r, props.brushes)).map((r) => r.name));
});
const selectedSet = computed(() => new Set(props.selected));

// ─── Drawing ───
function draw() {
  const ctx = context();
  if (!ctx) return;
  const t = theme.value;
  const { x0, x1, strips } = layout.value;
  const r = props.grain === "file" ? 1.7 : 2.6;
  const surv = survivors.value;
  const sel = selectedSet.value;
  const focus = hoverName.value ?? props.hovered;

  for (const [i, strip] of strips.entries()) {
    const s = strip.scale;
    // Separator and axis.
    if (i > 0) {
      ctx.fillStyle = t.hairline;
      ctx.fillRect(0, Math.round(strip.top) - 0.5, size.value.w, 1);
    }
    // Ticks: the scale's own, faint, labelled on the first strip only when there's room.
    ctx.font = `10px ${t.fontMono}`;
    ctx.textBaseline = "alphabetic";
    for (const tick of s.ticks) {
      const x = xOf(s, tick);
      ctx.fillStyle = withAlpha(t.hairline, 0.9);
      ctx.fillRect(Math.round(x), strip.top + 4, 1, strip.height - 8);
    }
    ctx.fillStyle = t.inkMuted;
    ctx.textAlign = "left";
    ctx.fillText(formatReading(s.domain[0]), x0, strip.top + strip.height - 2);
    ctx.textAlign = "right";
    ctx.fillText(formatReading(s.domain[1]), x1, strip.top + strip.height - 2);

    // Brush band.
    const b = props.brushes[strip.key];
    if (b) {
      const bx0 = xOf(s, b[0]), bx1 = xOf(s, b[1]);
      ctx.fillStyle = withAlpha(t.blue, 0.1);
      ctx.fillRect(bx0, strip.top + 2, Math.max(2, bx1 - bx0), strip.height - 4);
      ctx.fillStyle = t.blue;
      ctx.fillRect(bx0, strip.top + 2, 1, strip.height - 4);
      ctx.fillRect(bx1 - 1, strip.top + 2, 1, strip.height - 4);
    }

    // Median.
    const mx = xOf(s, strip.median);
    if (Number.isFinite(mx)) {
      ctx.fillStyle = t.inkMuted;
      ctx.fillRect(Math.round(mx), strip.top + 3, 1, 5);
      ctx.fillRect(Math.round(mx), strip.top + strip.height - 8, 1, 5);
    }

    // Dots: the faded first, then those in play, then the selection.
    const drawn: Array<[Row, number, number]> = [];
    for (const row of props.rows) {
      const v = metricValue(row, strip.key);
      if (!Number.isFinite(v)) continue;
      drawn.push([row, xOf(s, v), yOf(strip, row.name)]);
    }
    const pass = (n: string) => !surv || surv.has(n);
    ctx.fillStyle = withAlpha(t.inkMuted, 0.1);
    for (const [row, x, y] of drawn) if (!pass(row.name)) dot(ctx, x, y, r);
    ctx.fillStyle = withAlpha(t.inkSecondary, surv ? 0.85 : 0.55);
    for (const [row, x, y] of drawn) if (pass(row.name) && !sel.has(row.name)) dot(ctx, x, y, r);
    ctx.fillStyle = t.blue;
    for (const [row, x, y] of drawn) if (sel.has(row.name)) dot(ctx, x, y, r + 1);
  }

  // The focused row, threaded through its own dot in every strip. It was drawn
  // on each strip's centre line, but the dots are spread across the strip's
  // height, so the highlight sat on some other component's dot and never on
  // the one under the pointer.
  if (focus) {
    const row = props.domainRows.find((r) => r.name === focus);
    if (row) {
      const pts = strips.map((strip) => {
        const v = metricValue(row, strip.key);
        return { x: xOf(strip.scale, v), y: yOf(strip, row.name), v, strip };
      });
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!Number.isFinite(p.x)) { pen = false; continue; }
        if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      ctx.stroke();
      ctx.font = `600 10px ${t.fontMono}`;
      ctx.textBaseline = "middle";
      for (const p of pts) {
        if (!Number.isFinite(p.x)) continue;
        ctx.fillStyle = t.surface;
        dot(ctx, p.x, p.y, 5);
        ctx.fillStyle = t.ink;
        dot(ctx, p.x, p.y, 3.5);
        const label = formatReading(p.v);
        const right = p.x < x1 - 60;
        ctx.textAlign = right ? "left" : "right";
        const lx = right ? p.x + 8 : p.x - 8;
        ctx.lineWidth = 3;
        ctx.strokeStyle = t.surface;
        ctx.strokeText(label, lx, p.y - 9);
        ctx.fillText(label, lx, p.y - 9);
      }
    }
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}


// ─── The figure for the page ───
// The window's strips take the window's height and carry their names in HTML
// beside the canvas, so a report got a tall, mostly empty figure with no
// metric named. This draws compact rows at a fixed width: the name and median
// in a label column, each strip's lowest and highest reading at its two ends,
// and a selection leading while the rest recede.
function printStrips(light: boolean): FigureOutput | null {
  const keys = props.metrics;
  if (!keys.length || !props.rows.length) return null;
  const theme = printTheme(light);
  const LABEL = 180, END = 44, ROW = 34, PAD = 6, INSET = 12;
  const W = PRINT_W, H = PAD * 2 + ROW * keys.length;
  const x0 = LABEL + END, x1 = W - END;
  const { canvas: cv, g, scale } = printCanvas(W, H);
  g.fillStyle = theme.surface;
  g.fillRect(0, 0, W, H);
  const files = props.grain === "file";
  const r = files ? 1.5 : 2.2;
  const surv = survivors.value;
  const sel = selectedSet.value;
  const lead = new Set(sel);
  const focus = props.hovered;
  if (focus) lead.add(focus);
  const xP = (sc: MetricScale, v: number) => x0 + sc.at(v) * (x1 - x0);
  const yP = (top: number, name: string) => top + 6 + jitter(name) * (ROW - 12);
  const leadPts: Array<Array<{ x: number; y: number; v: number } | null>> = [...lead].map(() => []);
  const leadRows = [...lead].map((n) => props.domainRows.find((q) => q.name === n) ?? null);

  keys.forEach((key, i) => {
    const sc = scales.value.get(key)!;
    const top = PAD + i * ROW;
    if (i > 0) { g.fillStyle = theme.hairline; g.fillRect(0, top - 0.5, W, 1); }
    // The label column: the metric, then its median.
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `600 11px ${theme.fontSans}`;
    g.fillStyle = props.brushes[key] ? theme.blue : theme.ink;
    g.fillText(wrapText(g, niceName(key), LABEL - INSET - 12, 1)[0] ?? "", INSET, top + 14);
    const med = median(props.domainRows.map((q) => metricValue(q, key)));
    g.font = `10px ${theme.fontMono}`;
    g.fillStyle = theme.inkMuted;
    g.fillText(t("metrics.metricStrips.median3", { med: formatReading(med), value: sc.log ? " · log" : "" }), INSET, top + 27);
    // The ends of the strip, in words.
    g.textBaseline = "middle";
    g.fillStyle = theme.inkSecondary;
    g.textAlign = "right";
    g.fillText(formatReading(sc.domain[0]), x0 - 6, top + ROW / 2);
    g.textAlign = "left";
    g.fillText(formatReading(sc.domain[1]), x1 + 6, top + ROW / 2);
    g.fillStyle = theme.hairlineStrong;
    g.fillRect(x0, top + 5, 1, ROW - 10);
    g.fillRect(x1 - 1, top + 5, 1, ROW - 10);
    for (const tick of sc.ticks) { g.fillStyle = withAlpha(theme.hairline, 0.9); g.fillRect(Math.round(xP(sc, tick)), top + 5, 1, ROW - 10); }
    const b = props.brushes[key];
    if (b) {
      const bx0 = xP(sc, b[0]), bx1 = xP(sc, b[1]);
      g.fillStyle = withAlpha(theme.blue, 0.1);
      g.fillRect(bx0, top + 3, Math.max(2, bx1 - bx0), ROW - 6);
      g.fillStyle = theme.blue;
      g.fillRect(bx0, top + 3, 1, ROW - 6);
      g.fillRect(bx1 - 1, top + 3, 1, ROW - 6);
    }
    // Dots: out of a brush barely there, the rest quiet under a selection.
    for (const row of props.rows) {
      const v = metricValue(row, key);
      if (!Number.isFinite(v) || lead.has(row.name)) continue;
      const out = surv && !surv.has(row.name);
      g.fillStyle = out ? withAlpha(theme.inkMuted, 0.12) : withAlpha(theme.inkSecondary, lead.size ? 0.22 : surv ? 0.85 : 0.55);
      g.beginPath(); g.arc(xP(sc, v), yP(top, row.name), r, 0, Math.PI * 2); g.fill();
    }
    const mx = xP(sc, med);
    if (Number.isFinite(mx)) { g.fillStyle = theme.inkMuted; g.fillRect(Math.round(mx), top + 3, 1.5, 5); g.fillRect(Math.round(mx), top + ROW - 8, 1.5, 5); }
    leadRows.forEach((row, k) => {
      const v = row ? metricValue(row, key) : NaN;
      leadPts[k].push(row && Number.isFinite(v) ? { x: xP(sc, v), y: yP(top, row.name), v } : null);
    });
  });

  // What leads: threaded through its own dot in every strip, with its reading when few lead.
  // A reading goes right of its dot, or left when the right is taken or runs off the strip.
  const taken: Array<{ x0: number; x1: number; y: number }> = [];
  leadRows.forEach((row, k) => {
    if (!row) return;
    const color = row.name === focus && !sel.has(row.name) ? theme.ink : theme.blue;
    const pts = leadPts[k];
    g.strokeStyle = withAlpha(color, 0.55);
    g.lineWidth = 1;
    g.beginPath();
    let pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } if (pen) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); pen = true; }
    g.stroke();
    for (const p of pts) {
      if (!p) continue;
      g.fillStyle = theme.surface; g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, 3, 0, Math.PI * 2); g.fill();
      if (leadRows.length <= 3) {
        g.font = `600 10px ${theme.fontMono}`;
        g.textBaseline = "middle";
        const text = formatReading(p.v), w = g.measureText(text).width;
        const fits = (a: number, b: number) => !taken.some((q) => Math.abs(q.y - p.y) < 11 && a < q.x1 && b > q.x0);
        let right = p.x < x1 - 50 && fits(p.x + 7, p.x + 7 + w);
        if (!right && !fits(p.x - 7 - w, p.x - 7)) right = true;
        g.textAlign = right ? "left" : "right";
        const lx = right ? p.x + 7 : p.x - 7;
        taken.push(right ? { x0: lx, x1: lx + w, y: p.y } : { x0: lx - w, x1: lx, y: p.y });
        g.lineWidth = 3; g.strokeStyle = theme.surface; g.strokeText(formatReading(p.v), lx, p.y);
        g.fillStyle = theme.ink; g.fillText(formatReading(p.v), lx, p.y);
      }
    }
  });
  return { kind: "canvas", canvas: cv, width: W, height: H, scale };
}

// ─── Pointer ───
const hoverName = ref<string | null>(null);
const hoverPoint = ref<{ x: number; y: number } | null>(null);
const dragging = ref<null | { key: string; from: number; to: number; moved: boolean }>(null);

function stripAt(y: number) {
  return layout.value.strips.find((s) => y >= s.top && y < s.top + s.height) ?? null;
}

function nearest(x: number, y: number): string | null {
  const strip = stripAt(y);
  if (!strip || x < layout.value.x0 - 6) return null;
  let best: string | null = null;
  let bestD = 64;
  for (const row of props.rows) {
    const v = metricValue(row, strip.key);
    if (!Number.isFinite(v)) continue;
    const dx = xOf(strip.scale, v) - x;
    const dy = yOf(strip, row.name) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = row.name; }
  }
  return best;
}

function onMove(e: MouseEvent) {
  const p = local(e);
  if (dragging.value) {
    dragging.value.to = p.x;
    dragging.value.moved = dragging.value.moved || Math.abs(p.x - dragging.value.from) > 3;
    if (dragging.value.moved) applyDrag();
    return;
  }
  const name = nearest(p.x, p.y);
  hoverName.value = name;
  hoverPoint.value = name ? { x: e.clientX, y: e.clientY } : null;
  emit("update:hovered", name);
}

function onLeave() {
  if (dragging.value) return;
  hoverName.value = null;
  hoverPoint.value = null;
  emit("update:hovered", null);
}

function onDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const p = local(e);
  const strip = stripAt(p.y);
  if (!strip || p.x < layout.value.x0 - 6) return;
  dragging.value = { key: strip.key, from: p.x, to: p.x, moved: false };
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onUp, { once: true });
}

function onWindowMove(e: MouseEvent) {
  if (!dragging.value || !canvas.value) return;
  const p = local(e);
  dragging.value.to = p.x;
  dragging.value.moved = dragging.value.moved || Math.abs(p.x - dragging.value.from) > 3;
  if (dragging.value.moved) applyDrag();
}

function applyDrag() {
  const d = dragging.value!;
  const s = scales.value.get(d.key)!;
  const span = layout.value.x1 - layout.value.x0;
  const a = s.invert((Math.min(d.from, d.to) - layout.value.x0) / span);
  const b = s.invert((Math.max(d.from, d.to) - layout.value.x0) / span);
  emit("update:brushes", { ...props.brushes, [d.key]: [a, b] });
}

function onUp(e: MouseEvent) {
  window.removeEventListener("mousemove", onWindowMove);
  const d = dragging.value;
  dragging.value = null;
  if (!d || d.moved) return;
  // A click: select the dot under the pointer, or clear this strip's brush.
  const name = hoverName.value;
  if (name) {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      const next = new Set(props.selected);
      next.has(name) ? next.delete(name) : next.add(name);
      emit("update:selected", [...next]);
    } else emit("update:selected", [name]);
  } else if (props.brushes[d.key]) {
    const { [d.key]: _, ...rest } = props.brushes;
    emit("update:brushes", rest);
  } else if (props.selected.length) {
    emit("update:selected", []);
  }
}

function onDouble() {
  if (hoverName.value) emit("open", hoverName.value);
}

watch(() => props.metrics, () => { hoverName.value = null; });

// Redraw whenever anything the drawing reads changes; declared last so every ref exists.
watchEffect(() => {
  // Track everything draw() reads.
  void [size.value, props.rows, props.metrics, props.brushes, props.selected, props.hovered, hoverName.value, version.value, layout.value];
  requestAnimationFrame(draw);
});
</script>
