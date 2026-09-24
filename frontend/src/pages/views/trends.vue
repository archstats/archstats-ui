<template>
  <ViewWorkspaceLayout :queryable="false" title="Changes">
    <template #stats>
      <span v-if="points.length">Snapshots <span class="text-neutral-800">{{ points.length }}</span></span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Changes">
        <router-link to="/views/changes" custom v-slot="{ navigate }"><button type="button" aria-pressed="false" @click="navigate">Compare</button></router-link>
        <router-link to="/views/trends" custom v-slot="{ navigate }"><button type="button" aria-pressed="true" @click="navigate">Over time</button></router-link>
      </div>
      <div v-if="points.length > 1" class="ui-segmented" role="group" aria-label="Show as">
        <button type="button" :aria-pressed="mode === 'chart'" @click="mode = 'chart'">Chart</button>
        <button type="button" :aria-pressed="mode === 'table'" @click="mode = 'table'">Table</button>
      </div>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow flex-col overflow-y-auto">
        <LoadingState v-if="loading" :text="`Reading ${complete} snapshots…`"/>
        <EmptyState v-else-if="error" title="Could not read the snapshots" :text="error" icon="alert"/>
        <EmptyState v-else-if="points.length < 2" title="Over time needs two snapshots" text="Each point is one snapshot. Scan again after the code moves, or rebuild an earlier commit from a scan's menu (Rescan this commit…)." icon="history"/>
        <div v-else class="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 pb-12 pt-5">
          <p v-if="onlyOneSinceBreak" class="text-sm text-neutral-600">
            One point since {{ lastBreak?.reason }}; the lines start again there. Rescan an earlier commit to extend them.
          </p>
          <p v-if="failed.length" class="text-sm text-amber-700">{{ failed.length }} snapshot{{ failed.length === 1 ? "" : "s" }} could not be read and {{ failed.length === 1 ? "is" : "are" }} left out.</p>

          <TrendRows v-if="mode === 'chart'" ref="chart" :points="points" :series="series" :breaks="breaks" :basis="basis" :selected="selected" @pick="pick"/>

          <div v-else class="overflow-x-auto rounded-lg hairline">
            <table class="ui-table">
              <thead>
                <tr>
                  <th>Snapshot</th>
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

          <!-- The picked snapshots: open one, or compare two. -->
          <div v-if="selected.length" class="flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 hairline">
            <span class="text-sm text-neutral-700">{{ selected.map(i => pointLabel(points[i])).join(" and ") }}</span>
            <span class="ml-auto flex items-center gap-2">
              <span v-if="selected.length === 1" class="text-sm text-neutral-500">Shift-click another to compare.</span>
              <button v-if="selected.length === 1" type="button" class="ui-btn ui-btn-sm" :disabled="points[selected[0]].scanId === workspaces.openScanId" @click="openPoint(selected[0])">Open this snapshot</button>
              <button v-if="selected.length === 2" type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="compare">Compare these two</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = []">Clear</button>
            </span>
          </div>
          <p class="text-sm text-neutral-500">Readings are the app's own, computed per snapshot; each is defined, with the SQL that reproduces it, in the <router-link to="/views/reference?m=app__propagation_cost" class="underline-offset-2 hover:underline">Metric reference</router-link>. Lines break where the analysis or the ignore rules changed; hollow dots are snapshots of unknown analysis.</p>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Readings } from "wailsjs/go/app/ChangesService";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import TrendRows from "~/components/trends/TrendRows.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useExportables } from "~/composables/useExportables";
import { useWorkspacesStore } from "~/stores/workspaces";
import { formatScanTime } from "~/utils/time";
import { TREND_SERIES, breaksOf, dedupePoints, xBasis, type TrendPoint } from "~/utils/trends";

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
  if (s.percent) return `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: s.digits })}%`;
  return v.toLocaleString("en-US", { maximumFractionDigits: s.digits, minimumFractionDigits: s.digits });
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

const { register } = useExportables();
register({
  kind: "figure",
  title: "Over time",
  ready: () => mode.value === "chart" && !!chart.value?.svg,
  svg: true,
  render: () => {
    const svg = (chart.value as any)?.svg as SVGSVGElement | null;
    if (!svg) return null;
    const { width, height } = (chart.value as any).size();
    return { kind: "svg", svg, width, height };
  },
});
register({
  kind: "table",
  title: "Readings over time",
  rows: () => points.value.map(p => ({ snapshot: pointLabel(p), commit: p.headCommit, revision: p.analysisRevision, ...Object.fromEntries(series.value.map(s => [s.id, p.readings?.[s.id] ?? null])) })),
  columns: () => [{ id: "snapshot", label: "Snapshot" }, { id: "commit", label: "Commit" }, { id: "revision", label: "Analysis" }, ...series.value.map(s => ({ id: s.id, label: s.label }))],
});
</script>
