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
        <MetricFindings class="rounded-lg bg-surface hairline" :rows="rows" :findings="findings" @go="emit('go', $event)" @open="emit('open', $event)"/>
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
import { finiteSorted, metricValue, quantile } from "~/features/metrics/plotReading";
import { summarize, type Go } from "~/features/metrics/summary";
import MetricFindings from "~/features/metrics/components/MetricFindings.vue";
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
