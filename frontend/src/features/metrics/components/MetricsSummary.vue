<template>
  <div class="min-h-0 grow overflow-y-auto">
    <div class="mx-auto flex max-w-[1080px] flex-col gap-7 px-6 pb-14 pt-6">
      <header class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold leading-[26px] tracking-[-0.01em] text-neutral-900">{{ rows.length.toLocaleString("en-US") }} {{ rows.length === 1 ? one : noun }}, {{ metrics.length }} metrics</h2>
        <p class="max-w-[72ch] text-base leading-5 text-neutral-600">What stands out in this snapshot, each with the view that shows it best. These are facts about the numbers; what they mean for your code is yours to judge.</p>
      </header>

      <section class="flex flex-col gap-2">
        <h3 class="ui-section-title">The median {{ one }}</h3>
        <StatStrip :cells="medianCells"/>
      </section>

      <section v-if="findings.length" class="flex flex-col gap-2">
        <h3 class="ui-section-title">What stands out</h3>
        <ol class="flex flex-col rounded-lg bg-surface hairline">
          <li v-for="(f, i) in findings" :key="f.id" class="grid grid-cols-[176px_minmax(0,1fr)_auto] items-center gap-5 px-4 py-4" :class="{ 'hairline-t': i > 0 }">
            <button type="button" class="rounded focus-visible:outline-2" :aria-label="f.action.label" @click="emit('go', f.action.go)">
              <svg :viewBox="`0 0 ${FW} ${FH}`" :width="FW" :height="FH" class="block overflow-visible" aria-hidden="true">
                <!-- bars: every row by value, the finding's share inked -->
                <template v-if="f.figure.kind === 'bars'">
                  <rect v-for="(b, k) in bars(f.figure)" :key="k" :x="b.x" :y="FH - b.h" :width="b.w" :height="b.h" rx="0.5" :fill="b.hot ? theme.ink : theme.hairlineStrong"/>
                </template>
                <template v-else-if="f.figure.kind === 'scatter'">
                  <rect x="0.5" y="0.5" :width="FW - 1" :height="FH - 1" rx="3" fill="none" :stroke="theme.hairline"/>
                  <circle v-for="(p, k) in scatter(f.figure)" :key="k" :cx="p.x" :cy="p.y" :r="p.hot ? 2 : 1.4"
                          :fill="p.hot ? theme.ink : f.figure.hot.length ? theme.hairlineStrong : withAlpha(theme.inkSecondary, 0.55)"/>
                </template>
                <template v-else-if="f.figure.kind === 'profiles'">
                  <line v-for="(x, k) in profileAxes(f.figure)" :key="`a${k}`" :x1="x" :x2="x" y1="2" :y2="FH - 2" :stroke="theme.hairline"/>
                  <polyline v-for="(l, k) in profiles(f.figure)" :key="k" :points="l.points" fill="none"
                            :stroke="l.hot ? theme.ink : withAlpha(theme.inkMuted, 0.25)" :stroke-width="l.hot ? 1.25 : 0.75" stroke-linejoin="round"/>
                </template>
                <template v-else-if="f.figure.kind === 'hbars'">
                  <g v-for="(b, k) in hbars(f.figure)" :key="k">
                    <text x="0" :y="b.y + 5" font-size="9.5" :font-family="theme.fontMono" :fill="theme.inkSecondary">{{ b.label }}</text>
                    <rect :x="HB_X" :y="b.y" :width="b.w" height="8" rx="1" :fill="k === 0 ? theme.ink : theme.hairlineStrong"/>
                  </g>
                  <line :x1="hbarMedian(f.figure)" :x2="hbarMedian(f.figure)" y1="0" :y2="FH" :stroke="theme.inkMuted" stroke-dasharray="2 2"/>
                </template>
              </svg>
            </button>
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-base font-semibold leading-5 text-neutral-900">{{ f.title }}</p>
              <p class="text-base leading-5 text-neutral-700">{{ f.text }}</p>
              <p v-for="line in f.more" :key="line" class="text-sm leading-4 text-neutral-500">{{ line }}</p>
              <div v-if="f.names.length" class="mt-1 flex flex-wrap gap-1">
                <button v-for="n in f.names" :key="n" type="button" class="ui-tag max-w-[280px] truncate hover:text-neutral-900" :title="`${n} · open`" @click="emit('open', n)">{{ tail(n) }}</button>
              </div>
            </div>
            <button type="button" class="ui-btn ui-btn-sm whitespace-nowrap" @click="emit('go', f.action.go)">
              {{ f.action.label }}<Icon icon="arrow-right" :size="12" class="text-neutral-500"/>
            </button>
          </li>
        </ol>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="ui-section-title">Five ways to look</h3>
        <ul class="flex flex-col rounded-lg bg-surface hairline">
          <li v-for="(w, i) in WAYS" :key="w.view" :class="{ 'hairline-t': i > 0 }">
            <button type="button" class="group flex h-14 w-full items-center gap-4 px-4 text-left hover:bg-neutral-50" @click="emit('go', { view: w.view })">
              <svg viewBox="0 0 64 40" width="64" height="40" class="shrink-0 rounded bg-neutral-50 hairline" aria-hidden="true">
                <g :stroke="theme.inkMuted" :fill="theme.inkMuted" stroke-width="1">
                  <template v-if="w.view === 'table'">
                    <line v-for="k in 5" :key="k" x1="8" x2="56" :y1="6 + k * 5.5" :y2="6 + k * 5.5" :stroke="theme.hairlineStrong"/>
                    <rect v-for="k in 5" :key="`b${k}`" :x="56 - (k * 7) % 22 - 8" :y="3.5 + k * 5.5" :width="(k * 7) % 22 + 8" height="3" rx="0.5" :fill="theme.hairlineStrong" stroke="none"/>
                    <rect v-for="k in 5" :key="`n${k}`" x="8" :y="3.5 + k * 5.5" width="14" height="3" rx="0.5" :fill="theme.inkSecondary" stroke="none"/>
                  </template>
                  <template v-else-if="w.view === 'plot'">
                    <line x1="32" x2="32" y1="6" y2="34" stroke-dasharray="2 2" :stroke="theme.hairlineStrong"/>
                    <line x1="10" x2="54" y1="21" y2="21" stroke-dasharray="2 2" :stroke="theme.hairlineStrong"/>
                    <circle v-for="(p, k) in THUMB_DOTS" :key="k" :cx="p[0]" :cy="p[1]" :r="p[2]" stroke="none" :fill="k > 7 ? theme.inkSecondary : theme.inkMuted"/>
                  </template>
                  <template v-else-if="w.view === 'matrix'">
                    <rect v-for="k in 9" :key="k" :x="15 + ((k - 1) % 3) * 12" :y="4 + Math.floor((k - 1) / 3) * 11" width="10" height="10" rx="1"
                          :fill="(k - 1) % 3 > Math.floor((k - 1) / 3) ? withAlpha(theme.blue, 0.25 + ((k * 13) % 5) / 10) : 'none'"
                          :stroke="(k - 1) % 3 > Math.floor((k - 1) / 3) ? 'none' : theme.hairlineStrong"/>
                  </template>
                  <template v-else-if="w.view === 'strips'">
                    <g v-for="row in 3" :key="row">
                      <circle v-for="k in 9" :key="k" :cx="9 + ((k * 17 + row * 11) % 46)" :cy="5 + row * 9 + ((k * 7) % 4)" r="1.3" stroke="none"/>
                    </g>
                    <polyline points="40,9 22,18 47,27" fill="none" :stroke="theme.inkSecondary" stroke-width="1.25"/>
                  </template>
                  <template v-else>
                    <line v-for="k in 4" :key="k" :x1="8 + (k - 1) * 16" :x2="8 + (k - 1) * 16" y1="5" y2="35" :stroke="theme.hairlineStrong"/>
                    <polyline points="8,10 24,28 40,14 56,30" fill="none"/>
                    <polyline points="8,26 24,12 40,24 56,9" fill="none" :stroke="theme.inkSecondary" stroke-width="1.25"/>
                    <polyline points="8,18 24,22 40,31 56,19" fill="none"/>
                  </template>
                </g>
              </svg>
              <span class="flex min-w-0 grow flex-col">
                <span class="text-base font-medium leading-5 text-neutral-900">{{ w.name }}</span>
                <span class="truncate text-sm leading-4 text-neutral-500">{{ w.text(one) }}</span>
              </span>
              <Icon icon="chevron-right" :size="14" class="shrink-0 text-neutral-400 group-hover:text-neutral-700"/>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import StatStrip, { type StatCell } from "~/features/metrics/components/StatStrip.vue";
import { useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { useDataStore } from "~/features/snapshot/data.store";
import { formatReading } from "~/shared/format";
import { distinctTails, finiteSorted, metricValue, quantile } from "~/features/metrics/plotReading";
import { metricScale } from "~/features/metrics/lab";
import { summarize, type Figure, type Go } from "~/features/metrics/summary";
import { healthLevel, hotspotLevel } from "~/features/metrics/useHealth";

// The Metrics entry page: the median row, what stands out in words with a
// small figure each, and the five ways to look, each one click away and
// opened already set up for the finding that sent you there.

type Row = { name: string; [key: string]: any };

const props = defineProps({
  rows: { type: Array as PropType<Row[]>, required: true },
  metrics: { type: Array as PropType<string[]>, required: true },
  grain: { type: String as PropType<"component" | "file">, default: "component" },
});

const emit = defineEmits<{
  (e: "go", go: Go): void;
  (e: "open", name: string): void;
}>();

const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;
const { theme } = useChartTheme();
const noun = computed(() => (props.grain === "file" ? "files" : "components"));
const one = computed(() => (props.grain === "file" ? "file" : "component"));
const tails = computed(() => distinctTails(props.rows.map((r) => String(r.name))));
const tail = (n: string) => tails.value.get(n) ?? n;

const findings = computed(() => summarize(props.rows, props.metrics, { niceName, noun: noun.value, one: one.value }));

const MEDIAN_KEYS = ["complexity__lines", "git__commits__total", "git__authors__total", "codesmells__code_health", "codesmells__hotspot_score", "modularity__coupling__dependents", "modularity__coupling__afferent"];
const medianCells = computed<StatCell[]>(() => {
  const keys = MEDIAN_KEYS.filter((k) => props.metrics.includes(k)).slice(0, 6);
  return keys.map((key) => {
    const m = quantile(finiteSorted(props.rows.map((r) => metricValue(r, key))), 0.5);
    const level = key === "codesmells__code_health" ? healthLevel(m) : key === "codesmells__hotspot_score" ? hotspotLevel(m) : undefined;
    return { key, label: niceName(key), value: Number.isFinite(m) ? formatReading(m) : "—", level };
  });
});

// ─── Figures ───
const FW = 176, FH = 64, HB_X = 72;

function bars(f: Extract<Figure, { kind: "bars" }>) {
  const n = f.values.length;
  const count = Math.min(n, 60);
  const w = FW / count;
  const peak = Math.max(1, f.values[0] ?? 1);
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * n) / count), to = Math.max(from + 1, Math.floor(((i + 1) * n) / count));
    const v = Math.max(...f.values.slice(from, to));
    return { x: i * w + 0.5, w: Math.max(0.8, w - 1), h: Math.max(1, (v / peak) * (FH - 2)), hot: from < f.hot };
  });
}

function scatter(f: Extract<Figure, { kind: "scatter" }>) {
  const sx = metricScale(props.rows, f.x), sy = metricScale(props.rows, f.y);
  const hot = new Set(f.hot);
  const out: Array<{ x: number; y: number; hot: boolean }> = [];
  for (const r of props.rows) {
    const x = sx.at(metricValue(r, f.x)), y = sy.at(metricValue(r, f.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x: 4 + x * (FW - 8), y: FH - 4 - y * (FH - 8), hot: hot.has(r.name) });
  }
  return out.sort((a, b) => Number(a.hot) - Number(b.hot));
}

function profileAxes(f: Extract<Figure, { kind: "profiles" }>) {
  const n = f.keys.length;
  return f.keys.map((_, i) => 2 + (i * (FW - 4)) / Math.max(1, n - 1));
}

function profiles(f: Extract<Figure, { kind: "profiles" }>) {
  const xs = profileAxes(f);
  const scales = f.keys.map((k) => metricScale(props.rows, k));
  const hot = new Set(f.hot);
  const faint = props.rows.length > 300 ? props.rows.filter((_, i) => i % Math.ceil(props.rows.length / 300) === 0) : props.rows;
  const line = (r: Row) => scales.map((s, i) => {
    const t = s.at(metricValue(r, f.keys[i]));
    return Number.isFinite(t) ? `${xs[i]},${(FH - 3 - t * (FH - 6)).toFixed(1)}` : null;
  }).filter(Boolean).join(" ");
  return [
    ...faint.filter((r) => !hot.has(r.name)).map((r) => ({ points: line(r), hot: false })),
    ...props.rows.filter((r) => hot.has(r.name)).map((r) => ({ points: line(r), hot: true })),
  ];
}

function hbars(f: Extract<Figure, { kind: "hbars" }>) {
  const peak = Math.max(1, f.items[0]?.value ?? 1);
  const label = (n: string) => { const t = tail(n); return t.length > 11 ? `${t.slice(0, 10)}…` : t; };
  return f.items.map((it, k) => ({ y: 2 + k * 12.5, w: Math.max(2, (it.value / peak) * (FW - HB_X)), label: label(it.name) }));
}

function hbarMedian(f: Extract<Figure, { kind: "hbars" }>) {
  const peak = Math.max(1, f.items[0]?.value ?? 1);
  return HB_X + (f.median / peak) * (FW - HB_X);
}

// ─── Ways to look ───
const WAYS: Array<{ view: Go["view"]; name: string; text: (one: string) => string }> = [
  { view: "table", name: "Table", text: (o) => `Every number for every ${o}. Sort, pick columns, export.` },
  { view: "plot", name: "Plot", text: () => "Two metrics against each other, split at the medians into named corners." },
  { view: "matrix", name: "Matrix", text: () => "Every pair of metrics at once, and how strongly each pair moves together." },
  { view: "strips", name: "Strips", text: (o) => `Each metric as a strip of dots. Follow one ${o} across all of them; brush to narrow.` },
  { view: "profiles", name: "Profiles", text: (o) => `Each ${o} as one line across every metric. Compare shapes; filter on several axes.` },
];

const THUMB_DOTS: Array<[number, number, number]> = [
  [14, 10, 1.6], [18, 13, 1.4], [22, 9, 1.8], [26, 15, 1.4], [16, 17, 1.2], [20, 12, 1.5], [28, 11, 1.3], [12, 14, 1.3],
  [40, 26, 2.2], [46, 29, 2.6], [50, 24, 1.8], [44, 31, 1.6],
];
</script>
