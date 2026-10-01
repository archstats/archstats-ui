<template>
  <div class="flex min-h-0 grow flex-col overflow-y-auto">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" :aria-label="t('git.effortShare.window')">
        <button v-for="p in HISTORY_PERIODS" :key="p.id" type="button" :aria-pressed="effort.windowId.value === p.id" :title="anchorLabel(p.days, anchorObj)" @click="effort.windowId.value = p.id">{{ p.label }}</button>
      </div>
      <label class="flex items-center gap-2 text-sm text-neutral-600">
        {{ t('git.effortShare.healthBelow') }}
        <input
          type="number"
          min="1"
          max="10"
          step="0.5"
          class="ui-input ui-input-sm w-16 font-mono"
          :value="effort.threshold.value"
          :aria-label="t('git.effortShare.healthThreshold')"
          @change="setThreshold(($event.target as HTMLInputElement).value)"
        >
      </label>
      <router-link to="/views/components/hotspots?grain=files&preset=churn" class="ml-auto text-sm text-neutral-500 hover:text-neutral-900">{{ t('git.effortShare.churnAgainstHealth') }}</router-link>
    </div>

    <LoadingState v-if="effort.loading.value && !effort.rows.value.length" :text="t('git.effortShare.addingUpChangedLines')"/>
    <EmptyState v-else-if="!effort.available.value" :title="t('git.effortShare.nothingAddUp')" :text="t('git.effortShare.effortNeedsGitHistory')" icon="git-branch"/>
    <EmptyState v-else-if="!effort.rows.value.length" :title="t('git.effortShare.noChangesRecorded')" :text="t('git.effortShare.noHumanCommitsTouch')" icon="git-branch"/>
    <div v-else class="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 pb-12 pt-5">
      <div class="flex items-start gap-3">
        <p class="max-w-[72ch] text-lg leading-7 text-neutral-900">{{ effort.lede.value }}</p>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" :title="copied ? t('git.effortShare.copied') : t('git.effortShare.copySentence')" @click="copy">
          <Icon :icon="copied ? 'check' : 'copy'" :size="13"/>
        </button>
      </div>

      <StatStrip :cells="cells"/>
      <p class="-mt-4 text-sm text-neutral-500">
        {{ t('git.effortShare.changedLinesAdditionsPlus', { commits: formatNumber(s.commits), value: scoped ? t('git.effortShare.touchingFilesScope') : "" }) }}
      </p>

      <section>
        <ExhibitFrame :exhibit="windowTable" :title="t('git.effortShare.window2')">
          <table class="ui-table">
            <thead>
              <tr>
                <th>{{ t('git.effortShare.window') }}</th>
                <th class="text-right">{{ t('git.effortShare.changedLines') }}</th>
                <th class="text-right">{{ t('git.effortShare.healthBelow2', { threshold: effort.threshold.value }) }}</th>
                <th class="text-right">{{ t('git.effortShare.tangleMembers') }}</th>
                <th class="text-right" :title="t('git.effortShare.subjectMatchingI', { source: effort.fix.value.source })">{{ t('git.effortShare.fixPattern') }}</th>
                <th class="text-right">{{ t('git.effortShare.notSnapshot') }}</th>
                <th class="text-right">{{ t('git.effortShare.noHealthReading') }}</th>
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
        </ExhibitFrame>
      </section>

      <section v-if="months.length > 1">
        <ExhibitFrame :exhibit="figure" :title="t('git.effortShare.whereEachMonthS')">
          <div ref="barsHost" class="w-full">
            <svg ref="barsSvg" :viewBox="`0 0 ${barsWidth} ${H}`" :width="barsWidth" :height="H" class="block max-w-full" role="img" :aria-label="t('git.effortShare.eachMonthSChanged')">
              <!-- The split: every column is the whole of its month. -->
              <g v-for="g in [0, 0.5, 1]" :key="g">
                <line :x1="AXIS" :x2="barsWidth" :y1="SPLIT_Y + SPLIT_H * (1 - g)" :y2="SPLIT_Y + SPLIT_H * (1 - g)" stroke="currentColor" :stroke-dasharray="g === 0 ? '' : '2 3'" class="text-neutral-200"/>
                <text x="0" :y="SPLIT_Y + SPLIT_H * (1 - g) + 3" font-size="10" class="fill-neutral-400 font-mono">{{ g * 100 }}%</text>
              </g>
              <g v-for="(m, i) in months" :key="m.month">
                <title>{{ monthTitle(m) }}</title>
                <rect v-for="p in parts(m)" :key="p.key" :x="AXIS + i * step + 1" :y="p.y" :width="Math.max(1, step - 2)" :height="p.h" :fill="p.color"/>
              </g>
              <polyline v-if="tangleLine" :points="tangleLine" fill="none" stroke="rgb(var(--c-accent-700))" stroke-width="1.75" stroke-linejoin="round"/>
              <!-- The volume under it: how much there was to split. -->
              <text x="0" :y="VOL_Y + 9" font-size="10" class="fill-neutral-400 font-mono">{{ t('git.effortShare.lines2') }}</text>
              <rect v-for="(m, i) in months" :key="`v${m.month}`" :x="AXIS + i * step + 1" :y="VOL_Y + VOL_H - volH(m)" :width="Math.max(1, step - 2)" :height="volH(m)" fill="rgb(var(--c-neutral-400))"/>
              <text v-for="monthTick in monthTicks" :key="monthTick.i" :x="AXIS + monthTick.i * step" :y="H - 2" font-size="10" class="fill-neutral-500 font-mono">{{ monthTick.label }}</text>
            </svg>
          </div>
        </ExhibitFrame>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import StatStrip, { type StatCell } from "~/features/metrics/components/StatStrip.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useEffort } from "~/features/git/useEffort";
import { REPORT_FIGURE_WIDTH, useSvgFigure, useTable } from "~/features/export/useExportables";
import { monthlyBreakdown, pctText, share, type MonthBreakdown } from "~/features/git/effort";
import { formatNumber } from "~/shared/format";
import { HISTORY_PERIODS, anchorLabel, historyAnchor } from "~/features/git/history";
import { scopeWhere } from "~/features/groups/scopeSql";
import { t } from "~/shared/i18n";

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
  { label: t("git.effortShare.changedLines"), value: formatNumber(s.value.lines), title: t("git.effortShare.commits", { commits: formatNumber(s.value.commits) }) },
  { label: t("git.effortShare.healthBelow2", { threshold: effort.threshold.value }), value: pct(s.value.low, s.value.lines), title: effort.lowFiles.value === null ? "" : t("git.effortShare.theseFilesFilesHealth", { lowFiles: pctText(effort.lowFiles.value) }) },
  { label: t("git.effortShare.tangleMembers"), value: pct(s.value.tangle, s.value.lines), title: t("git.effortShare.filesComponentsTangleTwo") },
  { label: t("git.effortShare.fixPattern"), value: pct(s.value.fix, s.value.lines), title: t("git.effortShare.commitsWhoseSubjectMatches", { source: effort.fix.value.source }) },
  { label: t("git.effortShare.notSnapshot"), value: pct(s.value.gone, s.value.lines), title: t("git.effortShare.filesDeletedMovedWhere") },
  { label: t("git.effortShare.noHealthReading"), value: pct(s.value.noHealth, s.value.lines), title: t("git.effortShare.filesSnapshotHasBut") },
]);

const windows = computed(() => HISTORY_PERIODS.map(p => ({ id: p.id, label: p.title, s: effort.sharesFor(p.days) })));

// Monthly bars: the window, or the last year when the window is shorter.
const months = computed(() => {
  const d = effort.days.value;
  const r = effort.rangeOf(d === null ? null : Math.max(d, 365));
  return monthlyBreakdown(effort.rows.value, r.from, r.to);
});
// The split on top, the volume under it, the months along the bottom.
const AXIS = 30, SPLIT_Y = 10, SPLIT_H = 120, VOL_Y = 138, VOL_H = 34, H = 190;
const PARTS = computed(() => [
  { key: "low", label: t("git.effortShare.healthBelow2", { threshold: effort.threshold.value }), color: "rgb(var(--c-red-500))" },
  { key: "rated", label: t("git.effortShare.healthMore", { threshold: effort.threshold.value }), color: "rgb(var(--c-neutral-300))" },
  { key: "noHealth", label: t("git.effortShare.noHealthReading"), color: "rgb(var(--c-neutral-200))" },
  { key: "gone", label: t("git.effortShare.filesNoLongerSnapshot"), color: "rgb(var(--c-amber-300))" },
] as const);
function parts(m: MonthBreakdown) {
  if (!m.lines) return [];
  let y = SPLIT_Y;
  return PARTS.value.map(p => {
    const h = (m[p.key] / m.lines) * SPLIT_H;
    const out = { key: p.key, color: p.color, y, h };
    y += h;
    return out;
  }).filter(p => p.h > 0);
}
const maxLines = computed(() => {
  // A sweeping month (an import, a reformat) would flatten the rest: the scale tops out at three times the median busy month.
  const v = months.value.map(m => m.lines).filter(Boolean).sort((a, b) => a - b);
  return Math.max(1, Math.min(v[v.length - 1] ?? 1, (v[Math.floor(v.length / 2)] ?? 1) * 3));
});
const volH = (m: MonthBreakdown) => (m.lines ? Math.max(1, Math.min(1, m.lines / maxLines.value) * VOL_H) : 0);
const tangleLine = computed(() => months.value
  .map((m, i) => (m.lines ? `${AXIS + i * step.value + step.value / 2},${SPLIT_Y + SPLIT_H * (1 - m.tangle / m.lines)}` : null))
  .filter(Boolean).join(" "));
const monthTitle = (m: MonthBreakdown) => (m.lines
  ? t("git.effortShare.changedLinesHealthBelow", { month: m.month, lines: formatNumber(m.lines), share: pctText(share(m.low, m.lines)), threshold: effort.threshold.value, share2: pctText(share(m.tangle, m.lines)) })
  : t("git.effortShare.noChanges2", { month: m.month }));
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
// Drawn for export at a report page's width; otherwise the width it is given.
const exportWidth = ref<number | null>(null);
const barsWidth = computed(() => exportWidth.value ?? hostWidth.value);
const step = computed(() => (barsWidth.value - AXIS) / Math.max(1, months.value.length));
const monthTicks = computed(() => {
  const every = Math.max(1, Math.ceil(months.value.length / Math.floor(barsWidth.value / 70)));
  return months.value.map((m, i) => ({ i, label: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m.month.slice(5)) - 1]} ’${m.month.slice(2, 4)}` })).filter(t => t.i % every === 0);
});
const figure = useSvgFigure({
  title: () => t("git.effortShare.whereEachMonthS"),
  svg: () => barsSvg.value,
  exportWidth: REPORT_FIGURE_WIDTH,
  relayout: width => { exportWidth.value = width; },
  legend: () => ({
    items: [
      ...PARTS.value.map(p => ({ label: p.label, color: p.color })),
      { label: t("git.effortShare.shareTangleMembers"), color: "rgb(var(--c-accent-700))", mark: "line" as const },
    ],
    notes: [t("git.effortShare.eachColumnOneMonth")],
  }),
});

const copied = ref(false);
async function copy() {
  try { await navigator.clipboard.writeText(effort.lede.value); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* clipboard refused */ }
}

const windowTable = useTable({
  title: t("git.effortShare.whereChangeEffortGoes"),
  rows: () => windows.value.map(w => ({ window: w.label, lines: w.s.lines, low: share(w.s.low, w.s.lines), tangle: share(w.s.tangle, w.s.lines), fix: share(w.s.fix, w.s.lines), gone: share(w.s.gone, w.s.lines), no_health: share(w.s.noHealth, w.s.lines) })),
  columns: () => [
    { id: "window", label: t("git.effortShare.window") },
    { id: "lines", label: t("git.effortShare.changedLines") },
    { id: "low", label: t("git.effortShare.shareHealthBelow", { threshold: effort.threshold.value }) },
    { id: "tangle", label: t("git.effortShare.shareTangleMembers") },
    { id: "fix", label: t("git.effortShare.shareCommitsMatchingFix") },
    { id: "gone", label: t("git.effortShare.shareFilesNotSnapshot") },
    { id: "no_health", label: t("git.effortShare.shareFilesNoHealth") },
  ],
  // Nothing is said while the commits still load: a report's take reads a reason as "there is nothing here".
  disabledReason: () => (!effort.loading.value && !effort.rows.value.length ? t("git.effortShare.noChangesRecorded2") : null),
  ready: () => !effort.loading.value,
});
</script>
