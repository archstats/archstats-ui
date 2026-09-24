<template>
  <ViewWorkspaceLayout :queryable="false" title="Changes">
    <template #stats>
      <span v-if="changeSet && !gated">{{ summary }}</span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Changes">
        <router-link to="/views/changes" custom v-slot="{ navigate }"><button type="button" aria-pressed="true" @click="navigate">Compare</button></router-link>
        <router-link to="/views/trends" custom v-slot="{ navigate }"><button type="button" aria-pressed="false" @click="navigate">Over time</button></router-link>
      </div>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow flex-col overflow-y-auto">
        <EmptyState v-if="!data.hasData" title="No snapshot open" text="Open a scan to compare it with an earlier one." icon="history"/>
        <EmptyState v-else-if="!sides.base" title="Changes needs a second snapshot" text="Compare reads what changed between two snapshots of this workspace. Scan again after the code moves, or rebuild an earlier commit." icon="history">
          <div class="flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="workspaces.isScanning" @click="workspaces.startScan()">Scan again</button>
          </div>
        </EmptyState>
        <template v-else>
          <!-- The two sides. -->
          <div class="mx-auto flex w-full max-w-[1040px] flex-wrap items-center gap-2 px-6 pt-5">
            <SingleSelect :model-value="baseOption" :options="options" @update:model-value="(o: any) => setSide('base', o?.id)"/>
            <Icon icon="arrow-right" :size="14" class="text-neutral-400"/>
            <SingleSelect :model-value="headOption" :options="options" @update:model-value="(o: any) => setSide('head', o?.id)"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Swap the two sides" @click="swap">Swap</button>
            <span v-if="sides.swapped" class="text-sm text-neutral-500">The older code is on the left.</span>
          </div>
          <p v-if="warnings.length && !gated" class="mx-auto w-full max-w-[1040px] px-6 pt-2 text-sm text-neutral-500">{{ warnings.join(" ") }}</p>

          <ComparabilityGate v-if="gated" :reasons="blockers" :base-id="sides.base.id" :base-commit="(sides.base as any).headCommit" @anyway="comparedAnyway.add(pairKey); comparedAnyway = new Set(comparedAnyway)"/>
          <template v-else>
            <div v-if="blockers.length" class="mx-auto mt-3 flex w-full max-w-[1040px] items-center gap-3 border-y border-accent-200 bg-accent-50 px-6 py-1.5 text-sm text-neutral-800" role="status">
              <Icon icon="alert" :size="13" class="shrink-0 text-accent-700"/>
              <span class="min-w-0 flex-1 truncate" :title="blockers.join(' ')">Compared anyway: {{ blockers[0] }}</span>
              <button type="button" class="ui-btn ui-btn-sm" @click="workspaces.requestRescan(sides.base.id)">Rescan baseline</button>
            </div>

            <LoadingState v-if="loading" text="Comparing snapshots…"/>
            <EmptyState v-else-if="error" title="Could not compare" :text="error" icon="alert"/>
            <EmptyState v-else-if="changeSet && unchanged && !moves.length" title="No structural changes between these snapshots" text="The same components, dependencies, tangles and rule findings, and no reading moved." icon="check"/>
            <div v-else-if="changeSet" class="mx-auto flex w-full max-w-[1040px] flex-col gap-9 px-6 pb-16 pt-6">
              <p v-if="unchanged" class="text-base text-neutral-700">No component, dependency, tangle or rule finding changed; only readings moved.</p>

              <!-- 1. Components. -->
              <section v-if="compRows.length">
                <h2 class="ui-section-title">Components added and removed</h2>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th class="w-16"></th><th>Component</th></tr></thead>
                    <tbody>
                      <tr v-for="r in page(compRows, 'comp')" :key="r.kind + r.name" :class="{ 'is-selected': selected.has(r.name) }">
                        <td @click.stop><Checkbox :model-value="selected.has(r.name)" @update:model-value="toggle(r.name)"/></td>
                        <td class="font-mono text-neutral-500">{{ r.kind === "added" ? "+" : "−" }}</td>
                        <td class="font-mono text-sm">
                          <router-link v-if="r.kind === 'added'" :to="componentLink(r.name)" class="text-neutral-900 hover:underline">{{ r.name }}</router-link>
                          <span v-else class="text-neutral-500 line-through decoration-neutral-300">{{ r.name }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <MoreButton :total="compRows.length" section="comp"/>
              </section>

              <!-- 2. Dependencies. -->
              <section v-if="edgeRows.length">
                <h2 class="ui-section-title">Dependencies added and removed</h2>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th class="w-16"></th><th>From</th><th>To</th><th class="w-[120px] text-right">Refs</th><th class="w-[90px] text-right">Files</th></tr></thead>
                    <tbody>
                      <template v-for="r in page(edgeRows, 'edge')" :key="r.key">
                        <tr class="is-clickable" :class="{ 'is-selected': selected.has(r.from) && selected.has(r.to) }" @click="expanded = expanded === r.key ? null : r.key">
                          <td @click.stop><Checkbox :model-value="selected.has(r.from) && selected.has(r.to)" @update:model-value="toggleEdge(r)"/></td>
                          <td class="font-mono text-neutral-500">{{ r.kind === "added" ? "+" : r.kind === "removed" ? "−" : "~" }}</td>
                          <td class="max-w-0 truncate font-mono text-sm" :title="r.from">{{ r.from }}</td>
                          <td class="max-w-0 truncate font-mono text-sm" :title="r.to">{{ r.to }}<span v-if="r.dynamic" class="ui-tag ml-2" title="Joined only by a runtime lookup">lookup</span></td>
                          <td class="is-num text-right">{{ r.kind === "changed" ? `${fmt(r.before)} → ${fmt(r.after)}` : fmt(r.refs) }}</td>
                          <td class="is-num text-right">{{ r.files.length || "" }}</td>
                        </tr>
                        <tr v-if="expanded === r.key && r.files.length">
                          <td></td><td></td>
                          <td colspan="4" class="!py-2">
                            <ul class="flex flex-col gap-0.5">
                              <li v-for="f in r.files" :key="f"><router-link :to="filePath(f, 'imports')" class="font-mono text-sm text-neutral-700 hover:underline">{{ f }}</router-link></li>
                            </ul>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <MoreButton :total="edgeRows.length" section="edge"/>
              </section>

              <!-- 3. Tangles. -->
              <section v-if="changeSet.tangles?.length">
                <h2 class="ui-section-title">Tangles</h2>
                <ul class="mt-2 flex flex-col gap-3">
                  <li v-for="(t, i) in changeSet.tangles" :key="i" class="rounded-lg p-3 hairline">
                    <p class="text-base text-neutral-900"><span class="font-medium capitalize">{{ t.kind }}</span>
                      <span class="ml-2 font-mono text-sm text-neutral-500">{{ t.before.length }} → {{ t.after.length }} components</span></p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <router-link v-for="m in (t.after.length ? t.after : t.before)" :key="m" :to="componentLink(m)" class="ui-chip font-mono"
                                   :class="{ 'text-green-700': t.kind !== 'formed' && t.joined.includes(m) }" :title="t.joined.includes(m) && t.kind !== 'formed' ? 'Joined the tangle' : m">
                        {{ t.joined.includes(m) && t.kind !== "formed" ? "+ " : "" }}{{ m }}
                      </router-link>
                      <span v-for="m in (t.kind !== 'dissolved' ? t.left : [])" :key="'left-' + m" class="ui-chip font-mono text-neutral-400 line-through" title="Left the tangle">{{ m }}</span>
                    </div>
                  </li>
                </ul>
              </section>

              <!-- 4. Rule findings. -->
              <section v-if="ruleRows.length || !changeSet.rulesChecked?.base">
                <h2 class="ui-section-title">Rule findings</h2>
                <p v-if="!changeSet.rulesChecked?.base" class="mt-2 text-sm text-neutral-500">Rules were not checked in the baseline.</p>
                <div v-if="ruleRows.length" class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-16"></th><th>Rule</th><th>From → to</th><th>Where</th></tr></thead>
                    <tbody>
                      <tr v-for="r in page(ruleRows, 'rule')" :key="r.key">
                        <td class="text-sm" :class="r.kind === 'new' ? 'text-neutral-900' : 'text-neutral-500'">{{ r.kind === "new" ? "New" : "Gone" }}</td>
                        <td class="text-sm">{{ r.rule }}</td>
                        <td class="max-w-0 truncate font-mono text-sm" :title="`${r.from} → ${r.to}`">{{ r.from }} → {{ r.to }}</td>
                        <td class="max-w-0 truncate font-mono text-sm"><router-link v-if="r.kind === 'new'" :to="`${filePath(r.file, 'source')}#L${r.line}`" class="hover:underline">{{ r.file.split("/").pop() }}:{{ r.line }}</router-link><span v-else class="text-neutral-500">{{ r.file.split("/").pop() }}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <!-- 5. Largest moves. -->
              <section v-if="moves.length">
                <div class="flex items-center gap-3">
                  <h2 class="ui-section-title">Largest moves</h2>
                  <SingleSelect :model-value="metricOption" :options="metricOptions" @update:model-value="(o: any) => (metric = o?.id ?? metric)"/>
                </div>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th>Component</th><th class="w-[200px] text-right">Before → after</th><th class="w-[110px] text-right">Change</th></tr></thead>
                    <tbody>
                      <tr v-for="m in page(metricMoves, 'move')" :key="m.component" :class="{ 'is-selected': selected.has(m.component) }">
                        <td @click.stop><Checkbox :model-value="selected.has(m.component)" @update:model-value="toggle(m.component)"/></td>
                        <td class="max-w-0 truncate font-mono text-sm"><router-link :to="componentLink(m.component)" class="text-neutral-900 hover:underline" :title="m.component">{{ m.component }}</router-link></td>
                        <td class="is-num text-right">{{ fmtMetric(m.before) }} → {{ fmtMetric(m.after) }}</td>
                        <td class="is-num text-right">{{ m.after >= m.before ? "+" : "−" }}{{ fmtMetric(Math.abs(m.after - m.before)) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <MoreButton :total="metricMoves.length" section="move"/>
              </section>
            </div>
          </template>
        </template>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Compare } from "wailsjs/go/app/ChangesService";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import ComparabilityGate from "~/components/changes/ComparabilityGate.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import SingleSelect from "~/components/ui/common/SingleSelect.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { changesMarkdown, countChanges, isUnchanged, pickSides, summaryLine, type ChangeSet, type Move } from "~/utils/changes";
import { comparability } from "~/utils/comparability";
import { buildProvenance, provenanceShort } from "~/utils/provenance";
import { componentPath, filePath } from "~/utils/routes";
import { newestFirst } from "~/utils/scanOrder";
import { formatScanTime } from "~/utils/time";

// What changed between two snapshots: components, dependencies, tangles,
// rule findings, and which readings moved most. Neutral ink throughout: a
// new dependency is a fact, not an alarm.

const data = useDataStore();
const workspaces = useWorkspacesStore();
const route = useRoute();
const router = useRouter();

const complete = computed(() => newestFirst(workspaces.scans.filter((s: any) => s.status === "complete")) as any[]);
const sides = computed(() => pickSides(complete.value, {
  head: typeof route.query.head === "string" ? route.query.head : workspaces.openScanId,
  base: typeof route.query.base === "string" ? route.query.base : null,
  baseline: (workspaces.active as any)?.baselineScanId ?? null,
}));

const labelOf = (s: any) => (s ? `${s.label ? s.label + " · " : ""}${formatScanTime(s.headTime ?? s.startedAt)}${s.headCommit ? ` · ${s.headCommit.slice(0, 7)}` : ""}` : "");
// Two scans of one commit read alike; the scan time tells them apart.
const options = computed(() => {
  const base = complete.value.map(s => ({ id: s.id, name: labelOf(s), scan: s }));
  const seen = new Map<string, number>();
  for (const o of base) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  return base.map(o => ({ id: o.id, name: (seen.get(o.name) ?? 0) > 1 ? `${o.name} · scanned ${formatScanTime(o.scan.startedAt)}` : o.name }));
});
const baseOption = computed(() => options.value.find(o => o.id === sides.value.base?.id) ?? null);
const headOption = computed(() => options.value.find(o => o.id === sides.value.head?.id) ?? null);
function setSide(side: "base" | "head", id?: string) {
  if (!id) return;
  void router.replace({ query: { ...route.query, base: sides.value.base?.id, head: sides.value.head?.id, [side]: id } });
}
function swap() {
  if (!sides.value.base || !sides.value.head) return;
  void router.replace({ query: { ...route.query, base: sides.value.head.id, head: sides.value.base.id } });
}

const check = computed(() => (sides.value.base && sides.value.head ? comparability(sides.value.base as any, sides.value.head as any) : { ok: true, reasons: [] }));
const blockers = computed(() => check.value.reasons.filter(r => r.level === "block").map(r => r.text));
const warnings = computed(() => check.value.reasons.filter(r => r.level === "warn").map(r => r.text));
const pairKey = computed(() => `${sides.value.base?.id}|${sides.value.head?.id}`);
const comparedAnyway = ref(new Set<string>());
const gated = computed(() => blockers.value.length > 0 && !comparedAnyway.value.has(pairKey.value));

const changeSet = ref<ChangeSet | null>(null);
const loading = ref(false);
const error = ref("");
watch([() => sides.value.base?.id, () => sides.value.head?.id, gated], async ([b, hd, g]) => {
  changeSet.value = null; error.value = "";
  if (!b || !hd || g) return;
  loading.value = true;
  try { changeSet.value = (await Compare(b, hd)) as any; } catch (e) { error.value = e instanceof Error ? e.message : String(e); } finally { loading.value = false; }
}, { immediate: true });

const counts = computed(() => (changeSet.value ? countChanges(changeSet.value) : null));
const unchanged = computed(() => !!counts.value && isUnchanged(counts.value));
const summary = computed(() => (counts.value ? summaryLine(counts.value) : ""));

const fmt = (n: number) => n.toLocaleString("en-US");
const componentLink = (name: string) => `${componentPath(name)}?baseline=${sides.value.base?.id ?? ""}`;

// ── Rows ────────────────────────────────────────────────────────────────
const compRows = computed(() => [
  ...(changeSet.value?.componentsAdded ?? []).map(name => ({ kind: "added" as const, name })),
  ...(changeSet.value?.componentsRemoved ?? []).map(name => ({ kind: "removed" as const, name })),
]);
const edgeRows = computed(() => [
  ...(changeSet.value?.edgesAdded ?? []).map(e => ({ kind: "added" as const, key: `+${e.from}>${e.to}`, ...e, before: 0, after: e.refs })),
  ...(changeSet.value?.edgesRemoved ?? []).map(e => ({ kind: "removed" as const, key: `-${e.from}>${e.to}`, ...e, before: e.refs, after: 0 })),
  ...(changeSet.value?.edgesChanged ?? []).map(e => ({ kind: "changed" as const, key: `~${e.from}>${e.to}`, from: e.from, to: e.to, refs: e.after, files: [] as string[], dynamic: false, before: e.before, after: e.after })),
]);
const ruleRows = computed(() => [
  ...(changeSet.value?.rulesNew ?? []).map(f => ({ kind: "new" as const, key: `n${f.rule}${f.file}${f.from}${f.to}`, ...f })),
  ...(changeSet.value?.rulesGone ?? []).map(f => ({ kind: "gone" as const, key: `g${f.rule}${f.file}${f.from}${f.to}`, ...f })),
]);
const moves = computed<Move[]>(() => changeSet.value?.moves ?? []);
const expanded = ref<string | null>(null);

// ── Largest moves: one metric at a time, no composite ───────────────────
const metric = ref("modularity__instability");
const metricOptions = computed(() => [...new Set(moves.value.map(m => m.metric))].map(id => ({ id, name: data.statNiceName(id) || id })));
const metricOption = computed(() => metricOptions.value.find(o => o.id === metric.value) ?? metricOptions.value[0] ?? null);
watch(metricOptions, opts => { if (opts.length && !opts.some(o => o.id === metric.value)) metric.value = opts[0].id; });
const metricMoves = computed(() => moves.value.filter(m => m.metric === (metricOption.value?.id ?? metric.value)).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)));
const fmtMetric = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

// ── Paging: 50 rows, then all ───────────────────────────────────────────
const PAGE = 50;
const showAll = ref(new Set<string>());
function page<T>(rows: T[], section: string): T[] {
  return showAll.value.has(section) ? rows : rows.slice(0, PAGE);
}
const MoreButton = defineComponent({
  props: { total: { type: Number, required: true }, section: { type: String, required: true } },
  setup(props) {
    return () => props.total > PAGE && !showAll.value.has(props.section)
      ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-2", onClick: () => { showAll.value = new Set([...showAll.value, props.section]); } }, `Show all ${props.total.toLocaleString("en-US")}`)
      : null;
  },
});

// ── Selection into a group ──────────────────────────────────────────────
const selected = ref(new Set<string>());
function toggle(name: string) {
  const next = new Set(selected.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  selected.value = next;
}
function toggleEdge(r: { from: string; to: string }) {
  const next = new Set(selected.value);
  const on = next.has(r.from) && next.has(r.to);
  for (const n of [r.from, r.to]) if (on) next.delete(n); else next.add(n);
  selected.value = next;
}

// ── Exports ─────────────────────────────────────────────────────────────
const { register } = useExportables();
register({
  kind: "document",
  title: "Changes summary",
  label: "Copy changes summary",
  savable: true,
  markdown: () => changesMarkdown(changeSet.value!, labelOf(sides.value.base), labelOf(sides.value.head), provenanceShort(buildProvenance())),
  disabledReason: () => (changeSet.value ? null : "Nothing compared yet."),
});
register({
  kind: "table", title: "Dependencies changed",
  rows: () => edgeRows.value.map(r => ({ change: r.kind, from: r.from, to: r.to, refs_before: r.before, refs_after: r.after, runtime_lookup_only: r.dynamic, files: r.files.join("; ") })),
  columns: () => ["change", "from", "to", "refs_before", "refs_after", "runtime_lookup_only", "files"].map(id => ({ id, label: id.replace(/_/g, " ") })),
});
register({
  kind: "table", title: "Components added and removed",
  rows: () => compRows.value.map(r => ({ change: r.kind, component: r.name })),
  columns: () => [{ id: "change", label: "Change" }, { id: "component", label: "Component" }],
});
register({
  kind: "table", title: "Rule findings, new and gone",
  rows: () => ruleRows.value.map(r => ({ change: r.kind, rule: r.rule, from: r.from, to: r.to, file: r.file, line: r.line })),
  columns: () => ["change", "rule", "from", "to", "file", "line"].map(id => ({ id, label: id })),
});
register({
  kind: "table", get title() { return `Largest moves: ${metricOption.value?.name ?? ""}`; },
  rows: () => metricMoves.value.map(m => ({ component: m.component, [`${m.metric}_before`]: m.before, [`${m.metric}_after`]: m.after })),
  columns: () => { const id = metricOption.value?.id ?? metric.value; return [{ id: "component", label: "Component" }, { id: `${id}_before`, label: "Before" }, { id: `${id}_after`, label: "After" }]; },
});
</script>
