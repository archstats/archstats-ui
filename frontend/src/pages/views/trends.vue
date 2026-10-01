<template>
  <ViewWorkspaceLayout :queryable="false" :title="t('pages.trends.changes')">
    <template #stats>
      <span v-if="points.length">{{ t('pages.trends.snapshots') }} <span class="text-neutral-800">{{ points.length }}</span></span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.trends.changes')">
        <router-link to="/views/changes" custom v-slot="{ navigate }"><button type="button" aria-pressed="false" @click="navigate">{{ t('pages.trends.compare') }}</button></router-link>
        <router-link to="/views/trends" custom v-slot="{ navigate }"><button type="button" aria-pressed="true" @click="navigate">{{ t('pages.trends.overTime') }}</button></router-link>
      </div>
      <div v-if="points.length > 1" class="ui-segmented" role="group" :aria-label="t('pages.trends.show')">
        <button type="button" :aria-pressed="mode === 'chart'" @click="mode = 'chart'">{{ t('pages.trends.chart') }}</button>
        <button type="button" :aria-pressed="mode === 'table'" @click="mode = 'table'">{{ t('pages.trends.table') }}</button>
      </div>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow flex-col overflow-y-auto">
        <LoadingState v-if="loading" :text="t('pages.trends.readingSnapshots', { complete })"/>
        <EmptyState v-else-if="error" :title="t('pages.trends.couldNotReadSnapshots')" :text="error" icon="alert"/>
        <EmptyState v-else-if="points.length < 2" :title="t('pages.trends.overTimeNeedsTwo')" :text="t('pages.trends.eachPointOneSnapshot')" icon="history"/>
        <div v-else class="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 pb-12 pt-5">
          <p v-if="onlyOneSinceBreak" class="text-sm text-neutral-600">
            {{ t('pages.trends.onePointSinceLines', { reason: lastBreak?.reason }) }}
          </p>
          <p v-if="failed.length" class="text-sm text-amber-700">{{ t('pages.trends.couldNotReadLeft', { snapshots: t('common.count.snapshot', { count: failed.length }), are: t('common.noun.is', { count: failed.length }) }) }}</p>

          <ExhibitFrame v-if="mode === 'chart'" :exhibit="figure" :title="t('pages.trends.readingsOverTime')">
            <TrendRows ref="chart" :points="points" :series="series" :breaks="breaks" :basis="basis" :selected="selected" @pick="pick"/>
          </ExhibitFrame>

          <ExhibitFrame v-else :exhibit="readingsTable" :title="t('pages.trends.readingsOverTime')">
            <div class="overflow-x-auto rounded-lg hairline">
              <table class="ui-table">
                <thead>
                  <tr>
                    <th>{{ t('pages.trends.snapshot') }}</th>
                    <th v-for="s in series" :key="s.id" class="text-right">{{ s.label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in points" :key="p.scanId" class="is-clickable" :class="{ 'is-selected': selected.includes(i) }" @click="pick(i, ($event as MouseEvent).shiftKey)">
                    <td class="whitespace-nowrap font-mono text-sm">{{ pointLabel(p) }}<span v-if="breakAt.has(i)" class="ui-tag ml-2">{{ breakAt.get(i) }}</span></td>
                    <td v-for="s in series" :key="s.id" class="is-num text-right">{{ fmt(p.readings?.[s.id] ?? null, s) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ExhibitFrame>

          <!-- The picked snapshots: open one, or compare two. -->
          <div v-if="selected.length" class="flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 hairline">
            <span class="text-sm text-neutral-700">{{ listOf(selected.map(i => pointLabel(points[i]))) }}</span>
            <span class="ml-auto flex items-center gap-2">
              <span v-if="selected.length === 1" class="text-sm text-neutral-500">{{ t('pages.trends.shiftClickAnotherCompare') }}</span>
              <button v-if="selected.length === 1" type="button" class="ui-btn ui-btn-sm" :disabled="points[selected[0]].scanId === workspaces.openScanId" @click="openPoint(selected[0])">{{ t('pages.trends.openSnapshot') }}</button>
              <button v-if="selected.length === 2" type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="compare">{{ t('pages.trends.compareTheseTwo') }}</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = []">{{ t('pages.trends.clear') }}</button>
            </span>
          </div>
          <p class="text-sm text-neutral-500">{{ t('pages.trends.readingsAppSOwn') }} <router-link to="/views/reference?m=app__propagation_cost" class="underline-offset-2 hover:underline">{{ t('pages.trends.metricReference') }}</router-link>.</p>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Readings } from "wailsjs/go/app/ChangesService";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import TrendRows from "~/features/trends/components/TrendRows.vue";
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { chartTheme } from "~/shared/ui/useChartTheme";
import EmptyState from "~/shared/ui/EmptyState.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useFigure, useTable } from "~/features/export/useExportables";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { formatScanTime } from "~/shared/time";
import { TREND_SERIES, breaksOf, dedupePoints, xBasis, type TrendPoint } from "~/features/trends/trends";
import { t, intlLocale, listOf } from "~/shared/i18n";

// Is the architecture getting better or worse: the app's readings of every
// snapshot, one strip each, on the time axis of the code they read.

const workspaces = useWorkspacesStore();
const router = useRouter();
const raw = ref<TrendPoint[]>([]);
const loading = ref(false);
const error = ref("");
const mode = ref<"chart" | "table">("chart");
const selected = ref<number[]>([]);
const chart = ref<InstanceType<typeof TrendRows> | null>(null);

const complete = computed(() => workspaces.scans.filter((s: any) => s.status === "complete").length);
watch([() => workspaces.activeWorkspaceId, complete], async ([ws]) => {
  selected.value = [];
  if (!ws) { raw.value = []; return; }
  loading.value = true; error.value = "";
  try { raw.value = ((await Readings(ws)) ?? []) as any; } catch (e) { error.value = e instanceof Error ? e.message : String(e); } finally { loading.value = false; }
}, { immediate: true });

const failed = computed(() => raw.value.filter(p => p.error));
const points = computed(() => dedupePoints(raw.value));
const breaks = computed(() => breaksOf(points.value));
const breakAt = computed(() => new Map(breaks.value.map(b => [b.index, b.reason])));
const lastBreak = computed(() => breaks.value[breaks.value.length - 1] ?? null);
const onlyOneSinceBreak = computed(() => !!lastBreak.value && lastBreak.value.index === points.value.length - 1);
const basis = computed(() => xBasis(points.value));
const series = computed(() => TREND_SERIES.filter(s => points.value.some(p => p.readings?.[s.id] !== null && p.readings?.[s.id] !== undefined)));

function fmt(v: number | null, s: { digits: number; percent?: boolean }): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (s.percent) return `${(v * 100).toLocaleString(intlLocale, { maximumFractionDigits: s.digits })}%`;
  return v.toLocaleString(intlLocale, { maximumFractionDigits: s.digits, minimumFractionDigits: s.digits });
}
const pointLabel = (p: TrendPoint) => `${p.label ? p.label + " · " : ""}${formatScanTime(p.headTime ?? p.startedAt)}${p.headCommit ? ` · ${p.headCommit.slice(0, 7)}` : ""} · r${p.analysisRevision}`;

function pick(i: number, shift: boolean) {
  if (shift && selected.value.length === 1 && selected.value[0] !== i) selected.value = [selected.value[0], i].sort((a, b) => a - b);
  else selected.value = selected.value.length === 1 && selected.value[0] === i ? [] : [i];
}
async function openPoint(i: number) {
  await workspaces.openSnapshot(points.value[i].scanId);
}
function compare() {
  const [a, b] = selected.value;
  void router.push({ path: "/views/changes", query: { base: points.value[a].scanId, head: points.value[b].scanId } });
}

const figure = useFigure({
  title: t("pages.trends.overTime"),
  ready: () => mode.value === "chart" && !!chart.value?.svg,
  svg: true,
  render: () => {
    const svg = (chart.value as any)?.svg as SVGSVGElement | null;
    if (!svg) return null;
    const { width, height } = (chart.value as any).size();
    return { kind: "svg", svg, width, height };
  },
  legend: () => {
    const theme = chartTheme();
    return {
      items: [
        { label: t("pages.trends.snapshot2"), color: theme.inkSecondary, mark: "dot" as const },
        { label: t("pages.trends.snapshotUnknownAnalysis"), color: theme.inkMuted, mark: "ring" as const },
        ...(selected.value.length ? [{ label: t("pages.trends.picked"), color: theme.accent, mark: "dot" as const }] : []),
        ...(breaks.value.length ? [{ label: t("pages.trends.analysisIgnoreRulesChanged"), color: theme.hairlineStrong, mark: "dashed" as const }] : []),
      ],
      notes: [t("pages.trends.oneRowPerReading", { value: basis.value === "commit" ? t("pages.trends.commitTime") : t("pages.trends.scanTime") })],
    };
  },
});
const readingsTable = useTable({
  title: t("pages.trends.readingsOverTime"),
  rows: () => points.value.map(p => ({ snapshot: pointLabel(p), commit: p.headCommit, revision: p.analysisRevision, ...Object.fromEntries(series.value.map(s => [s.id, p.readings?.[s.id] ?? null])) })),
  columns: () => [{ id: "snapshot", label: t("pages.trends.snapshot") }, { id: "commit", label: t("pages.trends.commit") }, { id: "revision", label: t("pages.trends.analysis") }, ...series.value.map(s => ({ id: s.id, label: s.label }))],
});
</script>
