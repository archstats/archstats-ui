<template>
  <!-- A result drawn: ranked bars for a name and a number, a scatter for two
       numbers. It is a figure like any view's, so Export saves it and Add to
       report puts it in a report with its legend. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="rc-bar hairline-b">
      <div class="ui-segmented" role="group" :aria-label="t('sql.resultChart.chart')">
        <button type="button" :aria-pressed="form === 'bars'" :disabled="!numCols.length" @click="form = 'bars'">{{ t('sql.resultChart.bars') }}</button>
        <button type="button" :aria-pressed="form === 'scatter'" :disabled="numCols.length < 2" :title="numCols.length < 2 ? t('sql.resultChart.scatterNeedsTwoNumber') : ''" @click="form = 'scatter'">{{ t('sql.resultChart.scatter') }}</button>
      </div>
      <template v-if="form === 'bars'">
        <label class="rc-field">{{ t('sql.resultChart.name') }} <select v-model.number="labelCol" class="rc-select"><option v-for="j in textCols" :key="j" :value="j">{{ columns[j] }}</option><option v-if="!textCols.length" :value="-1">{{ t('sql.resultChart.rowNumber') }}</option></select></label>
        <label class="rc-field">{{ t('sql.resultChart.length') }} <select v-model.number="valueCol" class="rc-select"><option v-for="j in numCols" :key="j" :value="j">{{ columns[j] }}</option></select></label>
        <div class="ui-segmented" role="group" :aria-label="t('sql.resultChart.barsShown')">
          <button v-for="n in [10, 25, 50]" :key="n" type="button" :aria-pressed="top === n" @click="top = n">{{ n }}</button>
        </div>
      </template>
      <template v-else>
        <label class="rc-field">{{ t('sql.resultChart.across') }} <select v-model.number="xCol" class="rc-select"><option v-for="j in numCols" :key="j" :value="j">{{ columns[j] }}</option></select></label>
        <label class="rc-field">{{ t('sql.resultChart.up') }} <select v-model.number="yCol" class="rc-select"><option v-for="j in numCols" :key="j" :value="j">{{ columns[j] }}</option></select></label>
        <label class="rc-field" :title="canLog ? '' : t('sql.resultChart.logScalesNeedEvery')"><Checkbox v-model="log" :disabled="!canLog" :aria-label="t('sql.resultChart.logScales')"/>{{ ' ' + t('sql.resultChart.log') }}</label>
      </template>
      <span class="ml-auto truncate text-[11px] text-neutral-500">{{ t('sql.resultChart.saveAddReportPin') }}</span>
    </div>

    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden" @mouseleave="hover = null">
      <p v-if="!numCols.length" class="p-4 text-[13px] text-neutral-600">{{ t('sql.resultChart.nothingDrawResultHas') }}</p>
      <ExhibitFrame v-else :exhibit="figure" header="overlay" fill>
      <div ref="host" class="absolute inset-0">
      <svg v-if="w > 40 && h > 40" ref="svgEl" :width="w" :height="h" class="block select-none" role="img" :aria-label="ariaLabel" @mousemove="onMove">
        <rect :width="w" :height="h" :fill="theme.surface"/>

        <!-- Bars -->
        <g v-if="form === 'bars' && bars">
          <g :font-family="theme.fontMono" font-size="10.5" :fill="theme.inkMuted">
            <g v-for="tick in bars.ticks" :key="tick" :transform="`translate(${bars.x(tick)},0)`">
              <line :y1="PAD_T - 4" :y2="bars.bottom" :stroke="tick === 0 ? theme.hairlineStrong : theme.hairline" stroke-width="1"/>
              <text :y="PAD_T - 9" text-anchor="middle">{{ short(tick) }}</text>
            </g>
          </g>
          <text :x="bars.left" :y="14" :font-family="theme.fontMono" font-size="11" :fill="theme.inkSecondary">{{ columns[valueCol] }}<tspan v-if="nice(columns[valueCol])" :font-family="theme.fontSans" :fill="theme.inkMuted"> · {{ nice(columns[valueCol]) }}</tspan></text>
          <g v-for="(b, i) in bars.items" :key="i">
            <text :x="bars.left - 8" :y="b.y + b.h / 2" dominant-baseline="central" text-anchor="end" :font-family="theme.fontMono" font-size="11" :fill="hover?.i === i ? theme.ink : theme.inkSecondary">{{ b.labelShort }}</text>
            <path :d="b.path" :fill="theme.blue" :opacity="hover && hover.i !== i ? 0.55 : 1"/>
            <text v-if="bars.values" :x="b.end + (b.v < 0 ? -5 : 5)" :y="b.y + b.h / 2" dominant-baseline="central" :text-anchor="b.v < 0 ? 'end' : 'start'" :font-family="theme.fontMono" font-size="10.5" :fill="theme.inkSecondary">{{ fmt(b.v) }}</text>
          </g>
          <text v-if="bars.more" :x="bars.left" :y="h - 8" :font-family="theme.fontSans" font-size="11" :fill="theme.inkMuted">{{ t('sql.resultChart.firstRowsResultS', { itemsLength: bars.items.length, of: fmt(bars.of) }) }}</text>
        </g>

        <!-- Scatter -->
        <g v-else-if="form === 'scatter' && dots">
          <g :font-family="theme.fontMono" font-size="10.5" :fill="theme.inkMuted">
            <g v-for="tick in dots.xt" :key="`x${tick}`" :transform="`translate(${dots.x(tick)},0)`">
              <line :y1="SC.t" :y2="h - SC.b" :stroke="theme.hairline"/>
              <text :y="h - SC.b + 15" text-anchor="middle">{{ short(tick) }}</text>
            </g>
            <g v-for="tick in dots.yt" :key="`y${tick}`" :transform="`translate(0,${dots.y(tick)})`">
              <line :x1="SC.l" :x2="w - SC.r" :stroke="theme.hairline"/>
              <text :x="SC.l - 8" dominant-baseline="central" text-anchor="end">{{ short(tick) }}</text>
            </g>
          </g>
          <text :x="w - SC.r" :y="h - 8" text-anchor="end" :font-family="theme.fontMono" font-size="11" :fill="theme.inkSecondary">{{ columns[xCol] }} →</text>
          <text :x="SC.l" :y="16" :font-family="theme.fontMono" font-size="11" :fill="theme.inkSecondary">↑ {{ columns[yCol] }}</text>
          <circle v-for="(d, i) in dots.items" :key="i" :cx="d.cx" :cy="d.cy" r="4" :fill="theme.blue" :fill-opacity="hover && hover.i !== i ? 0.5 : 0.9" :stroke="theme.surface" stroke-width="1.5"/>
          <circle v-if="hover && dots.items[hover.i]" :cx="dots.items[hover.i].cx" :cy="dots.items[hover.i].cy" r="6" fill="none" :stroke="theme.ink" stroke-width="1.5"/>
          <text v-for="d in dots.labelled" :key="`l${d.i}`" :x="d.cx + 8" :y="d.cy - 7" :font-family="theme.fontMono" font-size="10.5" :fill="theme.inkSecondary" :stroke="theme.surface" stroke-width="3" paint-order="stroke">{{ d.labelShort }}</text>
          <text v-if="dots.dropped" :x="SC.l" :y="h - 8" :font-family="theme.fontSans" font-size="11" :fill="theme.inkMuted">{{ t('sql.resultChart.rowsWithoutBothNumbers', { dropped: fmt(dots.dropped), value: log ? t('sql.resultChart.aboveZero') : "" }) }}</text>
        </g>
      </svg>
      </div>
      </ExhibitFrame>
      <div v-if="hover" class="pointer-events-none fixed z-50 max-w-[380px] rounded-md bg-neutral-950 px-2.5 py-1.5 text-[11.5px] leading-4 text-neutral-50 shadow-lg dark:bg-neutral-100 dark:text-neutral-900" :style="{ left: `${hover.x + 14}px`, top: `${hover.y + 12}px` }">
        <p class="break-all font-mono font-medium">{{ hover.label }}</p>
        <p v-for="l in hover.lines" :key="l" class="mt-0.5 font-mono opacity-80">{{ l }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { scaleLinear, scaleLog } from "d3";
import Checkbox from "~/shared/ui/Checkbox.vue";
import { chartTheme, useChartTheme } from "~/shared/ui/useChartTheme";
import { useSvgFigure } from "~/features/export/useExportables";
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { t, intlLocale } from "~/shared/i18n";

const props = defineProps<{
  columns: string[]
  rows: unknown[][]
  /** The chart's title in exports and reports: the tab's name. */
  title: string
  sql: string
  scan: string
  define: (column: string) => { name: string; short: string } | null
}>();

const { version } = useChartTheme();
const theme = computed(() => { void version.value; return chartTheme(); });
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString(intlLocale) : n.toLocaleString(intlLocale, { maximumFractionDigits: 3 }));
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${+(n / 1e3).toFixed(1)}k` : fmt(n));
const nice = (c: string) => props.define(c)?.name ?? null;
/** "Code Health: A rating from 1.0 to 10.0 …" for each plotted metric the snapshot defines. */
const definitions = (cols: string[]) => [...new Set(cols)].flatMap(c => { const d = props.define(c); return d?.short ? [`${d.name}: ${d.short}`] : []; });
const middle = (s: string, max: number) => (s.length <= max ? s : `…${s.slice(-(max - 1))}`);

// ── Columns: which hold names, which hold numbers ──────────────────────
const kinds = computed(() => props.columns.map((_, j) => {
  let num = 0, text = 0;
  for (const r of props.rows.slice(0, 300)) { const v = r[j]; if (typeof v === "number") num++; else if (v !== null && v !== undefined) text++; }
  return num && !text ? "num" : text ? "text" : "empty";
}));
const numCols = computed(() => kinds.value.flatMap((k, j) => (k === "num" ? [j] : [])));
const textCols = computed(() => kinds.value.flatMap((k, j) => (k === "text" ? [j] : [])));

const form = ref<"bars" | "scatter">("bars");
const labelCol = ref(-1), valueCol = ref(-1), xCol = ref(-1), yCol = ref(-1);
const top = ref(25);
const log = ref(false);
watch(() => props.columns.join("\u0001"), () => {
  labelCol.value = textCols.value[0] ?? -1;
  valueCol.value = numCols.value[0] ?? -1;
  xCol.value = numCols.value[0] ?? -1;
  yCol.value = numCols.value[1] ?? numCols.value[0] ?? -1;
  if (numCols.value.length < 2) form.value = "bars";
  log.value = false;
}, { immediate: true });

// ── Size ────────────────────────────────────────────────────────────────
const host = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const w = ref(0), h = ref(0);
const ro: ResizeObserver | null = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
function measure() { w.value = Math.floor(host.value?.clientWidth ?? 0); h.value = Math.floor(host.value?.clientHeight ?? 0); }
// Measured now as well as observed: an observer only reports once the window next paints.
watch(host, el => {
  ro?.disconnect();
  if (!el) return;
  measure();
  ro?.observe(el);
}, { flush: "post" });
onBeforeUnmount(() => ro?.disconnect());

// ── Bars ────────────────────────────────────────────────────────────────
const PAD_T = 44;
const labelOf = (row: unknown[], i: number) => (labelCol.value >= 0 ? String(row[labelCol.value] ?? "null") : `#${i + 1}`);
const bars = computed(() => {
  if (form.value !== "bars" || valueCol.value < 0 || w.value < 40) return null;
  const rows = props.rows.filter(r => typeof r[valueCol.value] === "number");
  const shown = rows.slice(0, top.value);
  if (!shown.length) return null;
  const vals = shown.map(r => r[valueCol.value] as number);
  const labelW = Math.min(Math.max(120, w.value * 0.34), 300);
  const left = labelW + 16, right = w.value - 56;
  const x = scaleLinear().domain([Math.min(0, ...vals), Math.max(0, ...vals)]).nice().range([left, right]);
  const bottomSpace = rows.length > shown.length ? 26 : 12;
  const band = Math.max(8, Math.min(24, (h.value - PAD_T - bottomSpace) / shown.length));
  const bh = Math.max(4, band - 2);
  const chars = Math.floor(labelW / 6.6);
  const items = shown.map((r, i) => {
    const v = vals[i];
    const y = PAD_T + i * band;
    const x0 = x(0), x1 = x(v);
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    const rr = Math.min(4, bh / 2, b - a);
    // Rounded at the data end only; the end at zero stays square on the axis.
    const path = v >= 0
      ? `M${a},${y}H${b - rr}Q${b},${y} ${b},${y + rr}V${y + bh - rr}Q${b},${y + bh} ${b - rr},${y + bh}H${a}Z`
      : `M${b},${y}H${a + rr}Q${a},${y} ${a},${y + rr}V${y + bh - rr}Q${a},${y + bh} ${a + rr},${y + bh}H${b}Z`;
    const label = labelOf(r, i);
    return { v, y, h: bh, end: x1, path, label, labelShort: middle(label, chars) };
  });
  return { x, items, ticks: x.ticks(Math.max(2, Math.floor((right - left) / 90))), left, bottom: PAD_T + shown.length * band - 2, values: shown.length <= 25 && bh >= 12, more: rows.length > shown.length, of: rows.length };
});

// ── Scatter ─────────────────────────────────────────────────────────────
const SC = { l: 64, r: 24, t: 30, b: 34 };
const canLog = computed(() => xCol.value >= 0 && yCol.value >= 0 && props.rows.some(r => typeof r[xCol.value] === "number") && props.rows.every(r => typeof r[xCol.value] !== "number" || (r[xCol.value] as number) > 0 || typeof r[yCol.value] !== "number"));
const dots = computed(() => {
  if (form.value !== "scatter" || xCol.value < 0 || yCol.value < 0 || w.value < 80) return null;
  const pts = props.rows.map((r, i) => ({ r, i, xv: r[xCol.value], yv: r[yCol.value] }))
    .filter(p => typeof p.xv === "number" && typeof p.yv === "number" && (!log.value || ((p.xv as number) > 0 && (p.yv as number) > 0))) as Array<{ r: unknown[]; i: number; xv: number; yv: number }>;
  if (!pts.length) return null;
  const ext = (vs: number[]) => [Math.min(...vs), Math.max(...vs)] as [number, number];
  const mk = (d: [number, number], range: [number, number]) => (log.value ? scaleLog().domain(d[0] === d[1] ? [d[0] / 2, d[1] * 2] : d).range(range).nice() : scaleLinear().domain(d[0] === d[1] ? [d[0] - 1, d[1] + 1] : [Math.min(0, d[0]), d[1]]).range(range).nice());
  const x = mk(ext(pts.map(p => p.xv)), [SC.l, w.value - SC.r]);
  const y = mk(ext(pts.map(p => p.yv)), [h.value - SC.b, SC.t]);
  const items = pts.map(p => ({ cx: x(p.xv), cy: y(p.yv), label: labelOf(p.r, p.i), xv: p.xv, yv: p.yv, i: 0 })).map((d, i) => ({ ...d, i }));
  // The three highest get their names; the rest on hover.
  const labelled = [...items].sort((a, b) => b.yv - a.yv || b.xv - a.xv).slice(0, textCols.value.length ? 3 : 0).map(d => ({ ...d, labelShort: middle(d.label, 34) }));
  const count = Math.max(2, Math.floor((w.value - SC.l - SC.r) / 90));
  return { x, y, items, labelled, xt: x.ticks(count).slice(0, 12), yt: y.ticks(Math.max(2, Math.floor((h.value - SC.t - SC.b) / 50))), dropped: props.rows.length - pts.length };
});

// ── Hover ───────────────────────────────────────────────────────────────
const hover = ref<{ i: number; x: number; y: number; label: string; lines: string[] } | null>(null);
function onMove(e: MouseEvent) {
  const box = svgEl.value?.getBoundingClientRect();
  if (!box) return;
  const mx = e.clientX - box.left, my = e.clientY - box.top;
  if (bars.value) {
    const i = bars.value.items.findIndex(b => my >= b.y - 1 && my <= b.y + b.h + 1);
    const b = bars.value.items[i];
    hover.value = b ? { i, x: e.clientX, y: e.clientY, label: b.label, lines: [`${props.columns[valueCol.value]}  ${fmt(b.v)}`] } : null;
  } else if (dots.value) {
    let best = -1, bd = 14 * 14;
    dots.value.items.forEach((d, i) => { const dd = (d.cx - mx) ** 2 + (d.cy - my) ** 2; if (dd < bd) { bd = dd; best = i; } });
    const d = dots.value.items[best];
    hover.value = d ? { i: best, x: e.clientX, y: e.clientY, label: d.label, lines: [`${props.columns[xCol.value]}  ${fmt(d.xv)}`, `${props.columns[yCol.value]}  ${fmt(d.yv)}`] } : null;
  }
}

// ── As a figure ─────────────────────────────────────────────────────────
const ariaLabel = computed(() => (form.value === "bars" ? t("sql.resultChart.bars2", { value: props.columns[valueCol.value], value2: props.columns[labelCol.value] ?? t("sql.resultChart.row") }) : t("sql.resultChart.scatterAgainst", { value: props.columns[yCol.value], value2: props.columns[xCol.value] })));
const figure = useSvgFigure({
  title: () => props.title,
  svg: () => svgEl.value,
  legendInUi: false,
  legend: () => ({
    notes: [
      form.value === "bars"
        ? t("sql.resultChart.barLengthPerQuery", { value: props.columns[valueCol.value], value2: nice(props.columns[valueCol.value]) ? ` (${nice(props.columns[valueCol.value])})` : "", value3: props.columns[labelCol.value] ?? t("sql.resultChart.row"), value4: bars.value?.more ? t("sql.resultChart.firstRows", { itemsLength: bars.value.items.length, of: fmt(bars.value.of) }) : t("sql.resultChart.everyRow") })
        : t("sql.resultChart.eachDotRowAcross", { value: props.columns[xCol.value], value2: props.columns[yCol.value], value3: log.value ? t("sql.resultChart.bothLogScales") : "" }),
      ...definitions(form.value === "bars" ? [props.columns[valueCol.value]] : [props.columns[xCol.value], props.columns[yCol.value]]),
      t("sql.resultChart.query", { replace: props.sql.replace(/\s+/g, " ").trim() }),
    ],
  }),
});
</script>

<style scoped>
.rc-bar { display: flex; height: 38px; flex-shrink: 0; align-items: center; gap: 12px; padding: 0 12px; }
.rc-field { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: rgb(var(--c-neutral-600)); white-space: nowrap; }
.rc-select { height: 24px; max-width: 200px; padding: 0 6px; border-radius: 4px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; color: rgb(var(--c-neutral-900)); background: rgb(var(--c-surface)); box-shadow: 0 0 0 1px rgb(var(--c-neutral-300)); outline: none; }
.rc-select:focus-visible { box-shadow: 0 0 0 2px rgb(var(--c-accent-400)); }
</style>
