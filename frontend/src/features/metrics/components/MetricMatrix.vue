<template>
  <ExhibitFrame :exhibit="figure" legend-class="px-3 pb-2" fill>
    <div ref="box" class="relative h-full min-h-0 w-full select-none">
      <canvas ref="canvas" class="pointer-events-none absolute inset-0"></canvas>
      <canvas
          ref="overlay"
          class="absolute inset-0"
          :class="hover?.kind === 'point' || hover?.kind === 'rho' ? 'cursor-pointer' : 'cursor-crosshair'"
          @mousemove="onMove"
          @mouseleave="onLeave"
          @mousedown="onDown"
          @dblclick="onDouble"
      ></canvas>
      <div v-if="tip" class="ui-tooltip pointer-events-none fixed z-50 max-w-[340px]" :style="{ left: `${tip.x + 14}px`, top: `${tip.y + 14}px` }">
        <span v-if="tip.mono" class="font-mono">{{ tip.text }}</span>
        <span v-else>{{ tip.text }}</span>
      </div>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, ref, watchEffect, type PropType } from "vue";
import { useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { useDataStore } from "~/features/snapshot/data.store";
import { formatReading } from "~/shared/format";
import { metricValue } from "~/features/metrics/plotReading";
import { metricScale, passes, rankOrder, readings, spearmanOf, strengthWord, type Brushes, type MetricScale } from "~/features/metrics/lab";
import { useCanvas } from "~/features/metrics/useCanvas";
import { useCanvasFigure } from "~/features/export/useExportables";
import type { LegendItem } from "~/features/export/figure";
import { t } from "~/shared/i18n";

// Every pair of the overview's metrics at once. Below the diagonal, a small
// scatter per pair; on it, each metric's spread; above it, the rank
// correlation of the pair, tinted by strength. Clicking a cell opens that
// pair in the focus plot beside the matrix. Dragging in a scatter brushes
// both of its metrics; every cell shows the brushes and fades what fails them.
//
// Two canvases: the dots, spreads and correlations below, redrawn only when
// the rows, metrics, brushes or selection change; the pointer's marks (hovered
// frame, focus rings, a drag) above, so moving the mouse never repaints dots.

type Row = { name: string; [key: string]: any };
type Cell = { r: number; c: number; x: number; y: number; s: number };
type Hover =
  | { kind: "point"; name: string; cell: Cell }
  | { kind: "rho"; cell: Cell }
  | { kind: "cell"; cell: Cell };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  domainRows: { type: Array as PropType<Row[]>, required: true },
  metrics: { type: Array as PropType<string[]>, required: true },
  brushes: { type: Object as PropType<Brushes>, required: true },
  selected: { type: Array as PropType<string[]>, default: () => [] },
  hovered: { type: String as PropType<string | null>, default: null },
  pair: { type: Array as unknown as PropType<[string | null, string | null]>, default: () => [null, null] },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
});

const emit = defineEmits<{
  (e: "update:brushes", b: Brushes): void;
  (e: "update:selected", names: string[]): void;
  (e: "update:hovered", name: string | null): void;
  (e: "pair", xy: [string, string]): void;
  (e: "open", name: string): void;
}>();

const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;
const noun = computed(() => (props.grain === "file" ? t("common.noun.file", { count: 2 }) : t("common.noun.component", { count: 2 })));
const { theme, version } = useChartTheme();

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const overlay = ref<HTMLCanvasElement | null>(null);
const { size, context } = useCanvas(box, canvas);
const { size: overlaySize, context: overlayContext, local } = useCanvas(box, overlay);
const figure = useCanvasFigure({
  title: t("metrics.metricMatrix.metricsMatrix"),
  canvas: () => canvas.value,
  legend: () => {
    const theme2 = theme.value;
    const items: LegendItem[] = [{ label: `A ${props.grain}`, color: withAlpha(theme2.inkSecondary, 0.8), mark: "dot" }];
    if (props.selected.length) items.push({ label: t("metrics.metricMatrix.selected"), color: theme2.blue, mark: "dot" });
    items.push({ label: t("metrics.metricMatrix.riseTogetherPositive"), color: withAlpha(theme2.blue, 0.5) }, { label: t("metrics.metricMatrix.oneRisesOtherFalls"), color: withAlpha(theme2.violet, 0.5) });
    return {
      items,
      notes: [
        t("metrics.metricMatrix.belowDiagonalOneMetric"),
        t("metrics.metricMatrix.aboveDiagonalSpearmanS"),
      ],
    };
  },
});
defineExpose({ figure });

const GAP = 6;
const PAD = 12;

const scales = computed(() => new Map(props.metrics.map((k) => [k, metricScale(props.domainRows, k)] as const)));

const grid = computed(() => {
  const n = Math.max(1, props.metrics.length);
  const side = Math.max(120, Math.min(size.value.w, size.value.h) - PAD * 2);
  const s = (side - GAP * (n - 1)) / n;
  const ox = PAD;
  const oy = Math.max(PAD, (size.value.h - side) / 2);
  const cells: Cell[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push({ r, c, s, x: ox + c * (s + GAP), y: oy + r * (s + GAP) });
  return { n, s, cells };
});

// ─── Indexes ───
// Read once per row set, so a redraw or a pointer move walks arrays by row
// index: each metric's readings, its 0..1 position on its axis, and its rows
// in reading order (each metric is sorted once, not once per pair).
const values = computed(() => new Map(props.metrics.map((k) => [k, readings(props.rows, k)] as const)));
const positions = computed(() => new Map(props.metrics.map((k) => {
  const v = values.value.get(k)!, s = scales.value.get(k)!;
  const at = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) at[i] = s.at(v[i]);
  return [k, at] as const;
})));
const domainByName = computed(() => new Map(props.domainRows.map((r) => [r.name, r] as const)));

const rho = computed(() => {
  const out = new Map<string, { rho: number; n: number }>();
  const m = props.metrics;
  const v = m.map((k) => values.value.get(k)!);
  const order = v.map(rankOrder);
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) out.set(`${i}:${j}`, spearmanOf(v[i], v[j], order[i], order[j]));
  return out;
});

// Row indexes per layer, bottom to top: failing a brush, in play, selected.
// `passing` marks every row inside the brushes, selected or not, for the spreads.
const layers = computed(() => {
  const brushed = Object.keys(props.brushes).length > 0;
  const chosen = new Set(props.selected);
  const passing = brushed ? new Uint8Array(props.rows.length) : null;
  const faded: number[] = [], play: number[] = [], selected: number[] = [];
  props.rows.forEach((row, i) => {
    const pass = !passing || passes(row, props.brushes);
    if (passing && pass) passing[i] = 1;
    if (chosen.has(row.name)) selected.push(i);
    else (pass ? play : faded).push(i);
  });
  return { brushed, passing, faded, play, selected };
});

// Each metric's spread: 16 bins along its own scale, all rows, then those in play.
const BINS = 16;
const spreads = computed(() => new Map(props.metrics.map((k) => {
  const at = positions.value.get(k)!, passing = layers.value.passing;
  const counts = new Array(BINS).fill(0), inPlay = new Array(BINS).fill(0);
  for (let i = 0; i < at.length; i++) {
    if (!Number.isFinite(at[i])) continue;
    const b = Math.min(BINS - 1, Math.floor(at[i] * BINS));
    counts[b]++;
    if (passing?.[i]) inPlay[b]++;
  }
  return [k, { counts, inPlay }] as const;
})));

// Inset inside a scatter cell so edge marks are not cut.
const IN = 5;
const px = (cell: Cell, s: MetricScale, v: number) => cell.x + IN + s.at(v) * (cell.s - IN * 2);
const py = (cell: Cell, s: MetricScale, v: number) => cell.y + cell.s - IN - s.at(v) * (cell.s - IN * 2);

function pairOf(cell: Cell): [string, string] {
  const m = props.metrics;
  return cell.r > cell.c ? [m[cell.c], m[cell.r]] : [m[cell.r], m[cell.c]];
}

function isActive(cell: Cell): boolean {
  if (cell.r === cell.c) return false;
  const [x, y] = pairOf(cell);
  return props.pair[0] === x && props.pair[1] === y && cell.r > cell.c;
}

// ─── Drawing ───
const dotRadius = () => (props.grain === "file" ? 1.2 : 1.9);

function draw() {
  const ctx = context();
  if (!ctx) return;
  const t = theme.value;
  const m = props.metrics;
  const L = layers.value;
  const dotR = dotRadius();
  // One fill per dot, not one path per layer: overlapping dots darken, which shows density.
  // (Stamping a pre-drawn dot with drawImage measured seven times slower.)
  const dots: Array<[number[], string, number]> = [
    [L.faded, withAlpha(t.inkMuted, 0.12), dotR],
    [L.play, withAlpha(t.inkSecondary, L.brushed ? 0.8 : 0.5), dotR],
    [L.selected, t.blue, dotR + 0.8],
  ];

  for (const cell of grid.value.cells) {
    const { r, c, x, y, s } = cell;
    ctx.fillStyle = r === c ? t.ground : t.surface;
    ctx.fillRect(x, y, s, s);

    if (r === c) {
      drawDiagonal(ctx, cell, m[r]);
    } else if (r > c) {
      const sx = scales.value.get(m[c])!, sy = scales.value.get(m[r])!;
      // Brush ranges on either metric, as bands.
      const bx = props.brushes[m[c]], by = props.brushes[m[r]];
      ctx.fillStyle = withAlpha(t.blue, 0.08);
      if (bx) ctx.fillRect(px(cell, sx, bx[0]), y, Math.max(1, px(cell, sx, bx[1]) - px(cell, sx, bx[0])), s);
      if (by) ctx.fillRect(x, py(cell, sy, by[1]), s, Math.max(1, py(cell, sy, by[0]) - py(cell, sy, by[1])));

      // The same arithmetic as px/py, inlined over the position arrays.
      const xs = positions.value.get(m[c])!, ys = positions.value.get(m[r])!;
      const span = s - IN * 2, left = x + IN, bottom = y + s - IN;
      for (const [rows, fill, rad] of dots) {
        ctx.fillStyle = fill;
        for (const i of rows) {
          const tx = xs[i], ty = ys[i];
          if (tx !== tx || ty !== ty) continue; // NaN: no reading on one of the two
          ctx.beginPath();
          ctx.arc(left + tx * span, bottom - ty * span, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      drawRho(ctx, cell);
    }

    // Frame: hairline, the focused pair in the accent. The hovered cell is the overlay's.
    ctx.lineWidth = isActive(cell) ? 2 : 1;
    ctx.strokeStyle = isActive(cell) ? t.accent : t.hairline;
    const o = isActive(cell) ? 1 : 0.5;
    ctx.strokeRect(x + o, y + o, s - o * 2, s - o * 2);
  }
}

function drawOverlay() {
  const ctx = overlayContext();
  if (!ctx) return;
  const t = theme.value;
  const m = props.metrics;
  const h = hover.value;
  if (h && h.cell.r !== h.cell.c && !isActive(h.cell)) {
    const { x, y, s } = h.cell;
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.inkMuted;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  // The focused row, ringed in every scatter.
  const focus = h?.kind === "point" ? h.name : props.hovered;
  const row = focus ? domainByName.value.get(focus) : undefined;
  if (row) {
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 1.5;
    for (const cell of grid.value.cells) {
      if (cell.r <= cell.c) continue;
      const vx = metricValue(row, m[cell.c]), vy = metricValue(row, m[cell.r]);
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
      ctx.beginPath();
      ctx.arc(px(cell, scales.value.get(m[cell.c])!, vx), py(cell, scales.value.get(m[cell.r])!, vy), dotRadius() + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // A drag in progress.
  const d = drag.value;
  if (d && d.moved && d.cell.r > d.cell.c) {
    ctx.fillStyle = withAlpha(t.blue, 0.1);
    ctx.strokeStyle = t.blue;
    ctx.lineWidth = 1;
    const rx = Math.min(d.x0, d.x1), ry = Math.min(d.y0, d.y1);
    ctx.fillRect(rx, ry, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    ctx.strokeRect(rx + 0.5, ry + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
  }
}

function drawDiagonal(ctx: CanvasRenderingContext2D, cell: Cell, key: string) {
  const t = theme.value;
  const s = scales.value.get(key)!;
  const { x, y } = cell;
  const side = cell.s;
  // Name, wrapped to two lines.
  ctx.fillStyle = t.ink;
  ctx.font = `500 11px ${t.fontSans}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const words = niceName(key).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > side - 16 && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, x + 8, y + 8 + i * 14));
  ctx.fillStyle = t.inkMuted;
  ctx.font = `10px ${t.fontMono}`;
  const rangeY = y + 10 + Math.min(2, lines.length) * 14;
  if (side >= 96 || lines.length < 2) ctx.fillText(`${formatReading(s.domain[0])}–${formatReading(s.domain[1])}${s.log ? " log" : ""}`, x + 8, rangeY);

  // Spread: all rows, then those in play.
  const { counts, inPlay } = spreads.value.get(key)!;
  const surv = layers.value.passing;
  const peak = Math.max(1, ...counts);
  const hTop = Math.max(y + side * 0.45, (side >= 96 || lines.length < 2 ? rangeY + 14 : rangeY) + 2), hBottom = y + side - IN;
  const w = (side - IN * 2) / BINS;
  for (let i = 0; i < BINS; i++) {
    const h = Math.sqrt(counts[i] / peak) * (hBottom - hTop);
    ctx.fillStyle = t.hairlineStrong;
    ctx.fillRect(x + IN + i * w + 0.5, hBottom - h, w - 1, h);
    if (surv && inPlay[i]) {
      const hi = Math.sqrt(inPlay[i] / peak) * (hBottom - hTop);
      ctx.fillStyle = t.blue;
      ctx.fillRect(x + IN + i * w + 0.5, hBottom - hi, w - 1, hi);
    }
  }
}

function drawRho(ctx: CanvasRenderingContext2D, cell: Cell) {
  const t = theme.value;
  const q = rho.value.get(`${cell.r}:${cell.c}`);
  const cx = cell.x + cell.s / 2, cy = cell.y + cell.s / 2;
  if (!q || !Number.isFinite(q.rho)) {
    ctx.fillStyle = t.inkMuted;
    ctx.font = `11px ${t.fontSans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", cx, cy);
    return;
  }
  const a = Math.abs(q.rho);
  const hue = q.rho >= 0 ? t.blue : t.violet;
  ctx.fillStyle = withAlpha(hue, 0.04 + a * 0.26);
  ctx.fillRect(cell.x, cell.y, cell.s, cell.s);
  // A bar from the centre: its length is the strength, its side the sign.
  const half = cell.s / 2 - 14;
  ctx.fillStyle = withAlpha(hue, 0.7);
  const bw = Math.max(2, a * half);
  ctx.fillRect(q.rho >= 0 ? cx : cx - bw, cell.y + cell.s - 16, bw, 3);
  ctx.fillStyle = t.hairlineStrong;
  ctx.fillRect(cx - 0.5, cell.y + cell.s - 19, 1, 9);

  ctx.fillStyle = withAlpha(t.ink, 0.45 + a * 0.55);
  ctx.font = `${a >= 0.4 ? 600 : 400} ${Math.round(12 + a * 8)}px ${t.fontMono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(q.rho.toFixed(2), cx, cy - 4);
  ctx.fillStyle = t.inkSecondary;
  ctx.font = `10px ${t.fontSans}`;
  ctx.fillText(strengthWord(q.rho), cx, cy + 12);
}


// ─── Pointer ───
const hover = ref<Hover | null>(null);
const tip = ref<{ x: number; y: number; text: string; mono: boolean } | null>(null);
const drag = ref<null | { cell: Cell; x0: number; y0: number; x1: number; y1: number; moved: boolean }>(null);

function cellAt(x: number, y: number): Cell | null {
  return grid.value.cells.find((c) => x >= c.x && x < c.x + c.s && y >= c.y && y < c.y + c.s) ?? null;
}

// A linear walk of two position arrays: a few microseconds even for every
// file of a large codebase, so no spatial index is worth keeping in step.
function nearestIn(cell: Cell, x: number, y: number): string | null {
  const m = props.metrics;
  const xs = positions.value.get(m[cell.c])!, ys = positions.value.get(m[cell.r])!;
  const span = cell.s - IN * 2, left = cell.x + IN - x, bottom = cell.y + cell.s - IN - y;
  let best = -1, bestD = 36;
  for (let i = 0; i < xs.length; i++) {
    const tx = xs[i], ty = ys[i];
    if (tx !== tx || ty !== ty) continue;
    const dx = left + tx * span, dy = bottom - ty * span;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : props.rows[best].name;
}

function onMove(e: MouseEvent) {
  const p = local(e);
  if (drag.value) return;
  const cell = cellAt(p.x, p.y);
  if (!cell || cell.r === cell.c) { setHover(null, e); return; }
  if (cell.r < cell.c) { setHover({ kind: "rho", cell }, e); return; }
  const name = nearestIn(cell, p.x, p.y);
  setHover(name ? { kind: "point", name, cell } : { kind: "cell", cell }, e);
}

const hoveredName = (h: Hover | null) => (h?.kind === "point" ? h.name : null);
const sameHover = (a: Hover | null, b: Hover | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.cell.r === b.cell.r && a.cell.c === b.cell.c && hoveredName(a) === hoveredName(b));

function setHover(h: Hover | null, e: MouseEvent) {
  // Only a change of target repaints the overlay or tells the page; the tooltip follows every move.
  if (!sameHover(hover.value, h)) {
    if (hoveredName(hover.value) !== hoveredName(h)) emit("update:hovered", hoveredName(h));
    hover.value = h;
  }
  if (!h) { tip.value = null; return; }
  if (h.kind === "point") {
    const [kx, ky] = pairOf(h.cell);
    const row = domainByName.value.get(h.name);
    tip.value = { x: e.clientX, y: e.clientY, mono: true, text: `${h.name} · ${formatReading(row?.[kx])} · ${formatReading(row?.[ky])}` };
  } else if (h.kind === "rho") {
    const [a, b] = pairOf(h.cell);
    const q = rho.value.get(`${h.cell.r}:${h.cell.c}`);
    const text = !q || !Number.isFinite(q.rho)
      ? t("metrics.metricMatrix.tooFewBothReadings", { a: niceName(a), b: niceName(b), noun: noun.value })
      : t("metrics.metricMatrix.rankClickPlot", { a: niceName(a), b: niceName(b), rho: strengthWord(q.rho), value: Math.abs(q.rho) >= 0.2 ? (q.rho > 0 ? t("metrics.metricMatrix.risingTogether") : t("metrics.metricMatrix.oneFallsOtherRises")) : "", value2: q.rho.toFixed(2), n: q.n, noun: noun.value });
    tip.value = { x: e.clientX, y: e.clientY, mono: false, text };
  } else {
    const [a, b] = pairOf(h.cell);
    tip.value = { x: e.clientX, y: e.clientY, mono: false, text: t("metrics.metricMatrix.clickPlotDragBrush", { a: niceName(a), b: niceName(b) }) };
  }
}

function onLeave() {
  if (drag.value) return;
  if (hoveredName(hover.value)) emit("update:hovered", null);
  hover.value = null;
  tip.value = null;
}

function onDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const p = local(e);
  const cell = cellAt(p.x, p.y);
  if (!cell || cell.r === cell.c) return;
  drag.value = { cell, x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false };
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onUp, { once: true });
}

function onWindowMove(e: MouseEvent) {
  const d = drag.value;
  if (!d || d.cell.r < d.cell.c) return;
  const p = local(e);
  d.x1 = Math.max(d.cell.x, Math.min(d.cell.x + d.cell.s, p.x));
  d.y1 = Math.max(d.cell.y, Math.min(d.cell.y + d.cell.s, p.y));
  d.moved = d.moved || Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 4;
  drag.value = { ...d };
  tip.value = null;
}

function onUp(e: MouseEvent) {
  window.removeEventListener("mousemove", onWindowMove);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  const [kx, ky] = pairOf(d.cell);
  if (d.moved) {
    const sx = scales.value.get(kx)!, sy = scales.value.get(ky)!;
    const span = d.cell.s - IN * 2;
    const tx = (v: number) => sx.invert((v - d.cell.x - IN) / span);
    const ty = (v: number) => sy.invert((d.cell.y + d.cell.s - IN - v) / span);
    emit("update:brushes", {
      ...props.brushes,
      [kx]: [tx(Math.min(d.x0, d.x1)), tx(Math.max(d.x0, d.x1))],
      [ky]: [ty(Math.max(d.y0, d.y1)), ty(Math.min(d.y0, d.y1))],
    });
    return;
  }
  // A click: select the mark under the pointer, and open the pair either way.
  const h = hover.value;
  if (h?.kind === "point") {
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      const next = new Set(props.selected);
      next.has(h.name) ? next.delete(h.name) : next.add(h.name);
      emit("update:selected", [...next]);
    } else emit("update:selected", [h.name]);
  }
  emit("pair", [kx, ky]);
}

function onDouble() {
  if (hover.value?.kind === "point") emit("open", hover.value.name);
}

// At most one paint per canvas per frame, however many changes arrive in it.
function onEachFrame(paint: () => void): () => void {
  let frame = 0;
  return () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); });
  };
}
const paintBase = onEachFrame(draw);
const paintOverlay = onEachFrame(drawOverlay);

// Repaint a canvas whenever anything it reads changes; declared last so every ref exists.
watchEffect(() => {
  void [size.value, grid.value, positions.value, layers.value, spreads.value, rho.value, props.brushes, props.pair, props.grain, version.value];
  paintBase();
});
watchEffect(() => {
  void [overlaySize.value, grid.value, scales.value, hover.value, drag.value, props.hovered, props.pair, domainByName.value, version.value];
  paintOverlay();
});
</script>
