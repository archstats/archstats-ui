<template>
  <div class="flex min-h-0 grow flex-col overflow-y-auto">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" aria-label="Window">
        <button v-for="p in HISTORY_PERIODS" :key="p.id" type="button" :aria-pressed="effort.windowId.value === p.id" :title="anchorLabel(p.days, anchorObj)" @click="effort.windowId.value = p.id">{{ p.label }}</button>
      </div>
      <label class="flex items-center gap-2 text-sm text-neutral-600">
        Health below
        <input
          type="number"
          min="1"
          max="10"
          step="0.5"
          class="ui-input ui-input-sm w-16 font-mono"
          :value="effort.threshold.value"
          aria-label="Health threshold"
          @change="setThreshold(($event.target as HTMLInputElement).value)"
        >
      </label>
      <router-link to="/views/components/hotspots?grain=files&preset=churn" class="ml-auto text-sm text-neutral-500 hover:text-neutral-900">Churn against health →</router-link>
    </div>

    <LoadingState v-if="effort.loading.value && !effort.rows.value.length" text="Adding up changed lines…"/>
    <EmptyState v-else-if="!effort.available.value" title="Nothing to add up" text="Effort needs git history and the dependency analysis in the snapshot." icon="git-branch"/>
    <EmptyState v-else-if="!effort.rows.value.length" title="No changes recorded" text="No human commits touch the files in scope." icon="git-branch"/>
    <div v-else class="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 pb-12 pt-5">
      <div class="flex items-start gap-3">
        <p class="max-w-[72ch] text-lg leading-7 text-neutral-900">{{ effort.lede.value }}</p>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" :title="copied ? 'Copied' : 'Copy the sentence'" @click="copy">
          <Icon :icon="copied ? 'check' : 'copy'" :size="13"/>
        </button>
      </div>

      <StatStrip :cells="cells"/>
      <p class="-mt-4 text-sm text-neutral-500">
        Changed lines are additions plus deletions, per file, from {{ formatNumber(s.commits) }} human commits{{ scoped ? " touching the files in scope" : "" }}. The shares overlap: a line into a low-health tangle member counts in both.
        The hotspot score is left out: it is built from churn, so its share would restate its own input.
      </p>

      <section>
        <h3 class="ui-section-title mb-2">By window</h3>
        <table class="ui-table">
          <thead>
            <tr>
              <th>Window</th>
              <th class="text-right">Changed lines</th>
              <th class="text-right">Health below {{ effort.threshold.value }}</th>
              <th class="text-right">Tangle members</th>
              <th class="text-right" :title="`Subject matching /${effort.fix.value.source}/i`">Fix pattern</th>
              <th class="text-right">Not in the snapshot</th>
              <th class="text-right">No health reading</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in windows" :key="w.id" :class="{ 'is-selected': w.id === effort.windowId.value }">
              <td>{{ w.label }}</td>
              <td class="is-num text-right">{{ formatNumber(w.s.lines) }}</td>
              <td class="is-num text-right">{{ pct(w.s.low, w.s.lines) }}</td>
              <td class="is-num text-right">{{ pct(w.s.tangle, w.s.lines) }}</td>
              <td class="is-num text-right">{{ pct(w.s.fix, w.s.lines) }}</td>
              <td class="is-num text-right">{{ pct(w.s.gone, w.s.lines) }}</td>
              <td class="is-num text-right">{{ pct(w.s.noHealth, w.s.lines) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="months.length > 1">
        <h3 class="ui-section-title mb-2">Share into health below {{ effort.threshold.value }}, by month</h3>
        <div ref="barsHost" class="w-full">
          <svg ref="barsSvg" :viewBox="`0 0 ${barsWidth} 120`" :width="barsWidth" height="120" class="block max-w-full" role="img" :aria-label="`Monthly share of changed lines into files with health below ${effort.threshold.value}`">
            <line x1="0" :x2="barsWidth" y1="100" y2="100" stroke="currentColor" class="text-neutral-200"/>
            <g v-for="g in [0.25, 0.5]" :key="g">
              <line x1="28" :x2="barsWidth" :y1="100 - g * 96" :y2="100 - g * 96" stroke="currentColor" stroke-dasharray="2 3" class="text-neutral-200"/>
              <text x="0" :y="103 - g * 96" font-size="10" class="fill-neutral-400 font-mono">{{ g * 100 }}%</text>
            </g>
            <g v-for="(m, i) in months" :key="m.month">
              <rect
                :x="i * step + 1"
                :y="100 - m.share * 96"
                :width="Math.max(1, step - 2)"
                :height="m.share * 96"
                :fill="m.lines ? 'rgb(var(--c-accent-500))' : 'none'"
                :opacity="m.lines ? 0.75 : 0"
              ><title>{{ m.month }}: {{ m.lines ? `${Math.round(m.share * 100)}% of ${formatNumber(m.lines)} lines` : "no changes" }}</title></rect>
            </g>
            <text v-for="t in monthTicks" :key="t.i" :x="t.i * step" y="116" font-size="10" class="fill-neutral-500 font-mono">{{ t.label }}</text>
          </svg>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import StatStrip, { type StatCell } from "~/components/detail/StatStrip.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useEffort } from "~/composables/useEffort";
import { useExportables, useSvgFigure } from "~/composables/useExportables";
import { monthlyLowShare, pctText, share } from "~/utils/effort";
import { formatNumber } from "~/utils/format";
import { HISTORY_PERIODS, anchorLabel, historyAnchor } from "~/utils/history";
import { scopeWhere } from "~/utils/scopeSql";

// Where change effort goes: one sentence to quote, the strip it summarises,
// the same shares for every window, and the low-health share month by month.

const effort = useEffort();
const s = computed(() => effort.shares.value);
const anchorObj = computed(() => { void effort.anchor.value; return historyAnchor(); });
const scoped = computed(() => !!scopeWhere());
const pct = (part: number, whole: number) => (whole ? pctText(share(part, whole)) : "—");

function setThreshold(v: string) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0 && n <= 10) effort.threshold.value = n;
}

const cells = computed<StatCell[]>(() => [
  { label: "Changed lines", value: formatNumber(s.value.lines), title: `${formatNumber(s.value.commits)} commits` },
  { label: `Health below ${effort.threshold.value}`, value: pct(s.value.low, s.value.lines), title: effort.lowFiles.value === null ? "" : `These files are ${pctText(effort.lowFiles.value)} of the files with a health reading` },
  { label: "Tangle members", value: pct(s.value.tangle, s.value.lines), title: "Files of components in a tangle of two or more" },
  { label: "Fix pattern", value: pct(s.value.fix, s.value.lines), title: `Commits whose subject matches /${effort.fix.value.source}/i` },
  { label: "Not in the snapshot", value: pct(s.value.gone, s.value.lines), title: "Files deleted, or moved where renames were not followed" },
  { label: "No health reading", value: pct(s.value.noHealth, s.value.lines), title: "Files the snapshot has but did not rate: configuration, templates, data" },
]);

const windows = computed(() => HISTORY_PERIODS.map(p => ({ id: p.id, label: p.title, s: effort.sharesFor(p.days) })));

// Monthly bars: the window, or the last year when the window is shorter.
const months = computed(() => {
  const d = effort.days.value;
  const r = effort.rangeOf(d === null ? null : Math.max(d, 365));
  return monthlyLowShare(effort.rows.value, r.from, r.to);
});
const barsHost = ref<HTMLElement | null>(null);
const barsSvg = ref<SVGSVGElement | null>(null);
const hostWidth = ref(900);
let ro: ResizeObserver | null = null;
// The chart appears after the rows load, so the observer follows the element.
watch(barsHost, (el, old) => {
  ro ??= new ResizeObserver(e => { hostWidth.value = Math.max(320, Math.floor(e[0].contentRect.width)); });
  if (old) ro.unobserve(old);
  if (el) ro.observe(el);
}, { flush: "post" });
onBeforeUnmount(() => ro?.disconnect());
const barsWidth = computed(() => hostWidth.value);
const step = computed(() => barsWidth.value / Math.max(1, months.value.length));
const monthTicks = computed(() => {
  const every = Math.max(1, Math.ceil(months.value.length / Math.floor(barsWidth.value / 70)));
  return months.value.map((m, i) => ({ i, label: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m.month.slice(5)) - 1]} ’${m.month.slice(2, 4)}` })).filter(t => t.i % every === 0);
});
useSvgFigure(() => `Share of changed lines into health below ${effort.threshold.value}, by month`, () => barsSvg.value);

const copied = ref(false);
async function copy() {
  try { await navigator.clipboard.writeText(effort.lede.value); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* clipboard refused */ }
}

useExportables().register({
  kind: "table",
  title: "Where change effort goes",
  rows: () => windows.value.map(w => ({ window: w.label, lines: w.s.lines, low: share(w.s.low, w.s.lines), tangle: share(w.s.tangle, w.s.lines), fix: share(w.s.fix, w.s.lines), gone: share(w.s.gone, w.s.lines), no_health: share(w.s.noHealth, w.s.lines) })),
  columns: () => [
    { id: "window", label: "Window" },
    { id: "lines", label: "Changed lines" },
    { id: "low", label: `Share into health below ${effort.threshold.value}` },
    { id: "tangle", label: "Share into tangle members" },
    { id: "fix", label: "Share in commits matching the fix pattern" },
    { id: "gone", label: "Share into files not in the snapshot" },
    { id: "no_health", label: "Share into files with no health reading" },
  ],
  disabledReason: () => (!effort.rows.value.length ? "No changes recorded." : null),
});
</script>
