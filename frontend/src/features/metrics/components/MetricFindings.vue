<template>
  <!-- What stands out, one finding per row: a small figure, the fact in
       words, the rows it is about, and the view that shows it best. Shared by
       the Metrics summary and the Overview, so both say the same thing. -->
  <ol class="flex flex-col">
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
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useChartTheme, withAlpha } from "~/shared/ui/useChartTheme";
import { distinctTails, metricValue } from "~/features/metrics/plotReading";
import { metricScale } from "~/features/metrics/lab";
import type { Figure, Finding, Go } from "~/features/metrics/summary";

type Row = { name: string; [key: string]: any };

const props = defineProps({
  /** The rows the findings were read off, which the figures draw. */
  rows: { type: Array as PropType<Row[]>, required: true },
  findings: { type: Array as PropType<Finding[]>, required: true },
});

const emit = defineEmits<{
  (e: "go", go: Go): void;
  (e: "open", name: string): void;
}>();

const { theme } = useChartTheme();
const tails = computed(() => distinctTails(props.rows.map((r) => String(r.name))));
const tail = (n: string) => tails.value.get(n) ?? n;

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
</script>
