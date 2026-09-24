<template>
  <div ref="host" class="w-full">
    <svg v-if="width > 0" ref="svgEl" :width="width" :height="height" class="block select-none" role="img" :aria-label="`Readings of ${points.length} snapshots over time`">
      <!-- Breaks: where the analysis or the ignore rules changed, lines stop. -->
      <g v-for="b in breaks" :key="'b' + b.index">
        <line :x1="breakX(b.index)" :x2="breakX(b.index)" :y1="TOP - 4" :y2="height - AXIS" :stroke="t.hairlineStrong" stroke-dasharray="2 3"/>
        <text :x="breakX(b.index) + 4" :y="TOP - 8" :fill="t.inkMuted" font-size="10" :font-family="t.fontSans">{{ b.reason }}</text>
      </g>
      <!-- The selected snapshots. -->
      <line v-for="i in selected" :key="'s' + i" :x1="x(i)" :x2="x(i)" :y1="TOP" :y2="height - AXIS" :stroke="t.accent" stroke-opacity="0.5"/>

      <g v-for="(row, r) in rows" :key="row.id" :transform="`translate(0, ${TOP + r * ROW})`">
        <line :x1="0" :x2="width" :y1="ROW - 0.5" :y2="ROW - 0.5" :stroke="t.hairline"/>
        <text :x="0" :y="22" :fill="t.ink" font-size="12" :font-family="t.fontSans">{{ row.label }}</text>
        <text :x="0" :y="40" :fill="t.inkMuted" font-size="11" :font-family="t.fontSans">{{ row.note }}</text>
        <text :x="width" :y="22" text-anchor="end" :fill="t.ink" font-size="13" :font-family="t.fontMono">{{ row.latestText }}</text>
        <text v-if="row.changeText" :x="width" :y="40" text-anchor="end" :fill="t.inkSecondary" font-size="11" :font-family="t.fontMono">{{ row.changeText }}</text>
        <polyline v-for="(seg, s) in row.segments" :key="s" :points="seg" fill="none" :stroke="t.inkSecondary" stroke-width="1.5" stroke-linejoin="round"/>
        <circle v-for="d in row.dots" :key="'d' + d.index" :cx="x(d.index)" :cy="d.y" :r="selected.includes(d.index) ? 4 : 2.5"
                :fill="d.loose ? t.surface : (selected.includes(d.index) ? t.accent : t.inkSecondary)" :stroke="d.loose ? t.inkMuted : 'none'" stroke-width="1.2"/>
      </g>

      <!-- Time axis. -->
      <g :transform="`translate(0, ${height - AXIS})`">
        <text v-for="tick in ticks" :key="tick.x" :x="tick.x" y="16" text-anchor="middle" :fill="t.inkMuted" font-size="10" :font-family="t.fontSans">{{ tick.label }}</text>
        <text :x="LABEL_W" y="32" :fill="t.inkMuted" font-size="10" :font-family="t.fontSans">{{ basis === "commit" ? "by commit time" : "by scan time" }}</text>
      </g>
      <!-- Hit areas: one column per snapshot. -->
      <rect v-for="(p, i) in points" :key="'h' + p.scanId" :x="hitX(i)" :y="TOP" :width="hitW(i)" :height="height - AXIS - TOP" fill="transparent" class="cursor-pointer"
            @click="emit('pick', i, $event.shiftKey)">
        <title>{{ pointTitle(p) }}</title>
      </rect>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useChartTheme } from "~/composables/useChartTheme";
import { formatScanTime } from "~/utils/time";
import { latestChange, segmentsOf, type Break, type TrendPoint } from "~/utils/trends";

// Small multiples on one time axis: each reading gets a 72 px strip, its own
// scale, its latest value and its change since the first comparable point.
// Neutral ink: whether more tangles is worse is the reader's to say.

const props = defineProps<{
  points: TrendPoint[]
  series: ReadonlyArray<{ id: string; label: string; digits: number; percent?: boolean }>
  breaks: Break[]
  basis: "commit" | "scan"
  selected: number[]
}>();
const emit = defineEmits<{ (e: "pick", index: number, shift: boolean): void }>();

const { theme } = useChartTheme();
const t = computed(() => theme.value);
const host = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(() => { width.value = host.value?.clientWidth ?? 0; });
  if (host.value) { observer.observe(host.value); width.value = host.value.clientWidth; }
});
onBeforeUnmount(() => observer?.disconnect());
defineExpose({ svg: svgEl, size: () => ({ width: width.value, height: height.value }) });

const ROW = 72, TOP = 22, AXIS = 40, LABEL_W = 190, VALUE_W = 120, PAD = 10;
const height = computed(() => TOP + props.series.length * ROW + AXIS);

const times = computed(() => props.points.map(p => new Date(props.basis === "commit" && p.headTime ? p.headTime : p.startedAt).getTime()));
const plotL = LABEL_W + PAD;
const plotR = computed(() => Math.max(plotL + 40, width.value - VALUE_W - PAD));
function x(i: number): number {
  const ts = times.value;
  const lo = Math.min(...ts), hi = Math.max(...ts);
  if (!(hi > lo)) return (plotL + plotR.value) / 2;
  return plotL + ((ts[i] - lo) / (hi - lo)) * (plotR.value - plotL);
}
const breakX = (i: number) => (i > 0 ? (x(i - 1) + x(i)) / 2 : x(i));
function hitX(i: number) { return i === 0 ? plotL - 8 : (x(i - 1) + x(i)) / 2; }
function hitW(i: number) { const right = i === props.points.length - 1 ? plotR.value + 8 : (x(i) + x(i + 1)) / 2; return Math.max(4, right - hitX(i)); }

function fmt(v: number | null, s: { digits: number; percent?: boolean }): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (s.percent) return `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: s.digits })}%`;
  return v.toLocaleString("en-US", { maximumFractionDigits: s.digits, minimumFractionDigits: s.digits });
}

const rows = computed(() => props.series.map(s => {
  const { segments, loose } = segmentsOf(props.points, s.id, props.breaks);
  const all = [...segments.flatMap(g => g.points), ...loose].map(p => p.value);
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const y = (v: number) => (hi > lo ? 58 - ((v - lo) / (hi - lo)) * 44 : 36);
  const { latest, change } = latestChange({ segments });
  const changeText = change === null ? "" : change === 0 ? "no change" : `${change > 0 ? "+" : "−"}${fmt(Math.abs(change), s)}`;
  return {
    id: s.id,
    label: s.label,
    note: all.length ? `${fmt(lo, s)} – ${fmt(hi, s)}` : "not measured",
    latestText: fmt(latest, s),
    changeText,
    segments: segments.filter(g => g.points.length > 1).map(g => g.points.map(p => `${x(p.index)},${y(p.value)}`).join(" ")),
    dots: [...segments.flatMap(g => g.points).map(p => ({ index: p.index, y: y(p.value), loose: false })), ...loose.map(p => ({ index: p.index, y: y(p.value), loose: true }))],
  };
}));

const ticks = computed(() => {
  const ts = times.value;
  if (!ts.length) return [];
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const n = Math.max(2, Math.min(6, Math.floor((plotR.value - plotL) / 120)));
  const fmtDate = (d: number) => new Date(d).toLocaleDateString("en-GB", hi - lo > 400 * 86400000 ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  if (!(hi > lo)) return [{ x: (plotL + plotR.value) / 2, label: fmtDate(lo) }];
  return Array.from({ length: n }, (_, i) => {
    const v = lo + ((hi - lo) * i) / (n - 1);
    return { x: plotL + ((v - lo) / (hi - lo)) * (plotR.value - plotL), label: fmtDate(v) };
  });
});

function pointTitle(p: TrendPoint): string {
  return [p.label, `${props.basis === "commit" && p.headTime ? "committed" : "scanned"} ${formatScanTime(props.basis === "commit" && p.headTime ? p.headTime : p.startedAt)}`, p.headCommit ? p.headCommit.slice(0, 7) : "", `analysis r${p.analysisRevision}`].filter(Boolean).join(" · ");
}
</script>
