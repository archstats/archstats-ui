<template>
  <ViewWorkspaceLayout :queryable="false" :title="t('pages.changes.changes')">
    <template #stats>
      <span v-if="changeSet && !gated">{{ summary }}</span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.changes.changes')">
        <router-link to="/views/changes" custom v-slot="{ navigate }"><button type="button" aria-pressed="true" @click="navigate">{{ t('pages.changes.compare') }}</button></router-link>
        <router-link to="/views/trends" custom v-slot="{ navigate }"><button type="button" aria-pressed="false" @click="navigate">{{ t('pages.changes.overTime') }}</button></router-link>
      </div>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow flex-col overflow-y-auto">
        <EmptyState v-if="!data.hasData" :title="t('pages.changes.noSnapshotOpen')" :text="t('pages.changes.openScanCompareEarlier')" icon="history"/>
        <EmptyState v-else-if="!sides.base" :title="t('pages.changes.changesNeedsSecondSnapshot')" :text="t('pages.changes.compareReadsWhatChanged')" icon="history">
          <div class="flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="workspaces.isScanning" @click="workspaces.startScan()">{{ t('pages.changes.scanAgain') }}</button>
          </div>
        </EmptyState>
        <template v-else>
          <!-- The two sides. -->
          <div class="mx-auto flex w-full max-w-[1040px] flex-wrap items-center gap-2 px-6 pt-5">
            <SingleSelect :model-value="baseOption" :options="options" @update:model-value="(o: any) => setSide('base', o?.id)"/>
            <Icon icon="arrow-right" :size="14" class="text-neutral-400"/>
            <SingleSelect :model-value="headOption" :options="options" @update:model-value="(o: any) => setSide('head', o?.id)"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.changes.swapTwoSides')" @click="swap">{{ t('pages.changes.swap') }}</button>
            <span v-if="sides.swapped" class="text-sm text-neutral-500">{{ t('pages.changes.olderCodeLeft') }}</span>
          </div>
          <p v-if="warnings.length && !gated" class="mx-auto w-full max-w-[1040px] px-6 pt-2 text-sm text-neutral-500">{{ warnings.join(" ") }}</p>

          <ComparabilityGate v-if="gated" :reasons="blockers" :base-id="sides.base.id" :base-commit="(sides.base as any).headCommit" @anyway="comparedAnyway.add(pairKey); comparedAnyway = new Set(comparedAnyway)"/>
          <template v-else>
            <div v-if="blockers.length" class="mx-auto mt-3 flex w-full max-w-[1040px] items-center gap-3 border-y border-accent-200 bg-accent-50 px-6 py-1.5 text-sm text-neutral-800" role="status">
              <Icon icon="alert" :size="13" class="shrink-0 text-accent-700"/>
              <span class="min-w-0 flex-1 truncate" :title="blockers.join(' ')">{{ t('pages.changes.comparedAnyway', { value: blockers[0] }) }}</span>
              <button type="button" class="ui-btn ui-btn-sm" @click="workspaces.requestRescan(sides.base.id)">{{ t('pages.changes.rescanBaseline') }}</button>
            </div>

            <LoadingState v-if="loading" :text="t('pages.changes.comparingSnapshots')"/>
            <EmptyState v-else-if="error" :title="t('pages.changes.couldNotCompare')" :text="error" icon="alert"/>
            <EmptyState v-else-if="changeSet && unchanged && !moves.length" :title="t('pages.changes.noStructuralChangesBetween')" :text="t('pages.changes.sameComponentsDependenciesTangles')" icon="check"/>
            <div v-else-if="changeSet" class="mx-auto flex w-full max-w-[1040px] flex-col gap-9 px-6 pb-16 pt-6">
              <p v-if="unchanged" class="text-base text-neutral-700">{{ t('pages.changes.noComponentDependencyTangle') }}</p>

              <!-- 1. Components. -->
              <section v-if="compRows.length">
                <div class="flex min-h-7 items-center gap-3">
                  <h2 class="ui-section-title">{{ t('pages.changes.componentsAddedRemoved') }}</h2>
                  <ExhibitButton :exhibit="compTable" class="ml-auto"/>
                </div>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th class="w-16"></th><th>{{ t('pages.changes.component') }}</th></tr></thead>
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
                <div class="flex min-h-7 items-center gap-3">
                  <h2 class="ui-section-title">{{ t('pages.changes.dependenciesAddedRemoved') }}</h2>
                  <ExhibitButton :exhibit="edgeTable" class="ml-auto"/>
                </div>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th class="w-16"></th><th>{{ t('pages.changes.from') }}</th><th>{{ t('pages.changes.to') }}</th><th class="w-[120px] text-right">{{ t('pages.changes.refs') }}</th><th class="w-[90px] text-right">{{ t('pages.changes.files') }}</th></tr></thead>
                    <tbody>
                      <template v-for="r in page(edgeRows, 'edge')" :key="r.key">
                        <tr class="is-clickable" :class="{ 'is-selected': selected.has(r.from) && selected.has(r.to) }" @click="expanded = expanded === r.key ? null : r.key">
                          <td @click.stop><Checkbox :model-value="selected.has(r.from) && selected.has(r.to)" @update:model-value="toggleEdge(r)"/></td>
                          <td class="font-mono text-neutral-500">{{ r.kind === "added" ? "+" : r.kind === "removed" ? "−" : "~" }}</td>
                          <td class="max-w-0 truncate font-mono text-sm" :title="r.from">{{ r.from }}</td>
                          <td class="max-w-0 truncate font-mono text-sm" :title="r.to">{{ r.to }}<span v-if="r.dynamic" class="ui-tag ml-2" :title="t('pages.changes.joinedOnlyRuntimeLookup')">{{ t('pages.changes.lookup') }}</span></td>
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
                <h2 class="ui-section-title">{{ t('pages.changes.tangles') }}</h2>
                <ul class="mt-2 flex flex-col gap-3">
                  <li v-for="(tangle2, i) in changeSet.tangles" :key="i" class="rounded-lg p-3 hairline">
                    <p class="text-base text-neutral-900"><span class="font-medium capitalize">{{ tangle2.kind }}</span>
                      <span class="ml-2 font-mono text-sm text-neutral-500">{{ t('pages.changes.components', { value: tangle2.before?.length ?? 0, value2: tangle2.after?.length ?? 0 }) }}</span></p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <router-link v-for="m in (t.after?.length ? t.after : t.before ?? [])" :key="m" :to="componentLink(m)" class="ui-chip font-mono"
                                   :class="{ 'text-green-700': tangle2.kind !== 'formed' && tangle2.joined.includes(m) }" :title="tangle2.joined.includes(m) && tangle2.kind !== 'formed' ? t('pages.changes.joinedTangle') : m">
                        {{ tangle2.joined.includes(m) && tangle2.kind !== "formed" ? "+ " : "" }}{{ m }}
                      </router-link>
                      <span v-for="m in (t.kind !== 'dissolved' ? t.left : [])" :key="'left-' + m" class="ui-chip font-mono text-neutral-400 line-through" :title="t('pages.changes.leftTangle')">{{ m }}</span>
                    </div>
                  </li>
                </ul>
              </section>

              <!-- 4. Rule findings. -->
              <section v-if="ruleRows.length || !changeSet.rulesChecked?.base">
                <div class="flex min-h-7 items-center gap-3">
                  <h2 class="ui-section-title">{{ t('pages.changes.ruleFindings') }}</h2>
                  <ExhibitButton :exhibit="ruleTable" class="ml-auto"/>
                </div>
                <p v-if="!changeSet.rulesChecked?.base" class="mt-2 text-sm text-neutral-500">{{ t('pages.changes.rulesWereNotChecked') }}</p>
                <div v-if="ruleRows.length" class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-16"></th><th>{{ t('pages.changes.rule') }}</th><th>{{ t('pages.changes.fromTo') }}</th><th>{{ t('pages.changes.where') }}</th></tr></thead>
                    <tbody>
                      <tr v-for="r in page(ruleRows, 'rule')" :key="r.key">
                        <td class="text-sm" :class="r.kind === 'new' ? 'text-neutral-900' : 'text-neutral-500'">{{ r.kind === "new" ? t('pages.changes.new') : t('pages.changes.gone') }}</td>
                        <td class="text-sm">{{ r.rule }}</td>
                        <td class="max-w-0 truncate font-mono text-sm" :title="`${r.from} → ${r.to}`">{{ r.from }} → {{ r.to }}</td>
                        <td class="max-w-0 truncate font-mono text-sm"><router-link v-if="r.kind === 'new'" :to="`${filePath(r.file, 'source')}#L${r.line}`" class="hover:underline">{{ r.file.split("/").pop() }}:{{ r.line }}</router-link><span v-else class="text-neutral-500">{{ r.file.split("/").pop() }}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <!-- 4b. The active lens's declared order, new and gone crossings. -->
              <section v-if="lensDiff">
                <h2 class="ui-section-title">{{ t('pages.changes.lensFindings', { active: lens.active }) }}</h2>
                <p v-if="!lensDiff.added.length && !lensDiff.gone.length" class="mt-2 text-sm text-neutral-500">{{ t('pages.changes.noImportStartedStopped') }}</p>
                <div v-else class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-16"></th><th>{{ t('pages.changes.fromTo') }}</th><th>{{ t('pages.changes.groups') }}</th><th>{{ t('pages.changes.where') }}</th></tr></thead>
                    <tbody>
                      <tr v-for="f in [...lensDiff.added.map(e => ({ e, kind: 'new' })), ...lensDiff.gone.map(e => ({ e, kind: 'gone' }))]" :key="f.kind + f.e.fromComponent + f.e.toComponent + f.e.file">
                        <td class="text-sm" :class="f.kind === 'new' ? 'text-neutral-900' : 'text-neutral-500'">{{ f.kind === "new" ? t('pages.changes.new') : t('pages.changes.gone') }}</td>
                        <td class="max-w-0 truncate font-mono text-sm" :title="`${f.e.fromComponent} → ${f.e.toComponent}`">{{ f.e.fromComponent }} → {{ f.e.toComponent }}</td>
                        <td class="text-sm text-neutral-600">{{ groupName(f.e.fromGroup) }} → {{ groupName(f.e.toGroup) }}</td>
                        <td class="max-w-0 truncate font-mono text-sm"><router-link v-if="f.kind === 'new'" :to="`${filePath(f.e.file, 'source')}${f.e.line ? `#L${f.e.line}` : ''}`" class="hover:underline">{{ f.e.file.split("/").pop() }}{{ f.e.line ? `:${f.e.line}` : "" }}</router-link><span v-else class="text-neutral-500">{{ f.e.file.split("/").pop() }}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <!-- 4c. Through the lens's groups. -->
              <section v-if="structure.available.value">
                <div class="flex items-center gap-3">
                  <h2 class="ui-section-title">{{ t('pages.changes.structure') }}</h2>
                  <span class="text-sm text-neutral-500">{{ t('pages.changes.throughLens', { active: lens.active }) }}</span>
                </div>
                <p class="mt-1 max-w-[760px] text-sm text-neutral-500">{{ t('pages.changes.bothSnapshotsReadThrough') }}</p>
                <LoadingState v-if="structure.loading.value" :text="t('pages.changes.readingBothSnapshotsImports')"/>
                <p v-else-if="structure.error.value" class="mt-2 text-sm text-red-700">{{ structure.error.value }}</p>
                <template v-else-if="structure.diff.value">
                  <div class="mt-2 overflow-hidden rounded-lg hairline">
                    <table class="ui-table">
                      <thead><tr><th>{{ t('pages.changes.check') }}</th><th class="text-right">{{ t('pages.changes.before') }}</th><th class="text-right">{{ t('pages.changes.after') }}</th></tr></thead>
                      <tbody>
                        <tr v-for="r in structure.diff.value.rows" :key="r.label">
                          <td :title="r.why">{{ r.label }}</td>
                          <td class="is-num text-right text-neutral-500">{{ r.before.toLocaleString(intlLocale) }}</td>
                          <td class="is-num text-right" :class="r.better === 'lower' && r.after !== r.before ? (r.after < r.before ? 'text-green-700' : 'text-red-700') : 'text-neutral-900'">{{ r.after.toLocaleString(intlLocale) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <ul class="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
                    <li v-if="structure.diff.value.mutualGone.length">{{ t('pages.changes.noLongerImportingEach', { value: structure.diff.value.mutualGone.map(m => `${structure.name(m.a)} ⇄ ${structure.name(m.b)}`).join(", ") }) }}</li>
                    <li v-if="structure.diff.value.mutualNew.length" class="text-neutral-900">{{ t('pages.changes.nowImportingEachOther', { value: structure.diff.value.mutualNew.map(m => `${structure.name(m.a)} ⇄ ${structure.name(m.b)}`).join(", ") }) }}</li>
                    <li v-if="structure.diff.value.depsNew.length">{{ t('pages.changes.newDependencies', { value: structure.diff.value.depsNew.slice(0, 8).map(d => `${structure.name(d.from)} → ${structure.name(d.to)} (${d.imports})`).join(", "), value2: structure.diff.value.depsNew.length > 8 ? t('pages.changes.more', { value: structure.diff.value.depsNew.length - 8 }) : "" }) }}</li>
                    <li v-if="structure.diff.value.depsGone.length">{{ t('pages.changes.gone2', { value: structure.diff.value.depsGone.slice(0, 8).map(d => `${structure.name(d.from)} → ${structure.name(d.to)} (${d.imports})`).join(", "), value2: structure.diff.value.depsGone.length > 8 ? t('pages.changes.more', { value: structure.diff.value.depsGone.length - 8 }) : "" }) }}</li>
                  </ul>
                </template>
              </section>

              <!-- 5. Largest moves. -->
              <section v-if="moves.length">
                <div class="flex min-h-7 items-center gap-3">
                  <h2 class="ui-section-title">{{ t('pages.changes.largestMoves') }}</h2>
                  <SingleSelect :model-value="metricOption" :options="metricOptions" @update:model-value="(o: any) => (metric = o?.id ?? metric)"/>
                  <ExhibitButton :exhibit="movesTable" class="ml-auto"/>
                </div>
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th class="w-8"></th><th>{{ t('pages.changes.component') }}</th><th class="w-[200px] text-right">{{ t('pages.changes.beforeAfter') }}</th><th class="w-[110px] text-right">{{ t('pages.changes.change') }}</th></tr></thead>
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
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import { computed, defineComponent, h, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Compare } from "wailsjs/go/app/ChangesService";
import { QueryIn } from "wailsjs/go/app/QueryService";
import { lensGroups } from "~/features/groups/lensEdges";
import { checkLens } from "~/features/rules/useLensFindings";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { findingKey } from "~/features/rules/lensRules";
import { useStructureCompare } from "~/features/trends/useStructureCompare";
import type { GroupEdge } from "~/features/groups/groupEdges";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import ComparabilityGate from "~/features/trends/components/ComparabilityGate.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import SingleSelect from "~/shared/ui/SingleSelect.vue";
import { useExportables, useTable } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { changesMarkdown, countChanges, isUnchanged, normalizeChangeSet, pickSides, summaryLine, type ChangeSet, type Move } from "~/features/trends/changes";
import { comparability } from "~/features/trends/comparability";
import { buildProvenance, provenanceShort } from "~/features/export/provenance";
import { componentPath, filePath } from "~/features/navigation/routes";
import { newestFirst } from "~/features/workspace/scanOrder";
import { formatScanTime } from "~/shared/time";
import { t, intlLocale } from "~/shared/i18n";

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
  return base.map(o => ({ id: o.id, name: (seen.get(o.name) ?? 0) > 1 ? t("pages.changes.scanned", { name: o.name, startedAt: formatScanTime(o.scan.startedAt) }) : o.name }));
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
  try { changeSet.value = normalizeChangeSet((await Compare(b, hd)) as any); } catch (e) { error.value = e instanceof Error ? e.message : String(e); } finally { loading.value = false; }
}, { immediate: true });

const counts = computed(() => (changeSet.value ? countChanges(changeSet.value) : null));
const unchanged = computed(() => !!counts.value && isUnchanged(counts.value));
const summary = computed(() => (counts.value ? summaryLine(counts.value) : ""));

const fmt = (n: number) => n.toLocaleString(intlLocale);
const componentLink = (name: string) => `${componentPath(name)}?baseline=${sides.value.base?.id ?? ""}`;

// ── Rows ────────────────────────────────────────────────────────────────
const compRows = computed(() => [
  ...(changeSet.value?.componentsAdded ?? []).map(name => ({ kind: "added" as const, name })),
  ...(changeSet.value?.componentsRemoved ?? []).map(name => ({ kind: "removed" as const, name })),
]);
const edgeRows = computed(() => [
  // Go sends an empty list as null: an edge's files, a tangle's other side.
  ...(changeSet.value?.edgesAdded ?? []).map(e => ({ kind: "added" as const, key: `+${e.from}>${e.to}`, ...e, files: e.files ?? [], before: 0, after: e.refs })),
  ...(changeSet.value?.edgesRemoved ?? []).map(e => ({ kind: "removed" as const, key: `-${e.from}>${e.to}`, ...e, files: e.files ?? [], before: e.refs, after: 0 })),
  ...(changeSet.value?.edgesChanged ?? []).map(e => ({ kind: "changed" as const, key: `~${e.from}>${e.to}`, from: e.from, to: e.to, refs: e.after, files: [] as string[], dynamic: false, before: e.before, after: e.after })),
]);
const ruleRows = computed(() => [
  ...(changeSet.value?.rulesNew ?? []).map(f => ({ kind: "new" as const, key: `n${f.rule}${f.file}${f.from}${f.to}`, ...f })),
  ...(changeSet.value?.rulesGone ?? []).map(f => ({ kind: "gone" as const, key: `g${f.rule}${f.file}${f.from}${f.to}`, ...f })),
]);
const moves = computed<Move[]>(() => changeSet.value?.moves ?? []);
const expanded = ref<string | null>(null);

// ── Lens findings: the active lens's declaration, run on both sides ─────
const lens = useLensStore();
const groupsStore = useGroupsStore();
const groupName = (id: string) => groupsStore.getGroupById(id)?.name ?? id;
const lensDiff = ref<{ added: GroupEdge[]; gone: GroupEdge[] } | null>(null);
watch([() => changeSet.value, () => lens.active, () => groupsStore.dimensionRecords], async () => {
  lensDiff.value = null;
  const cs = changeSet.value;
  const dim = lens.active;
  const declared = dim ? groupsStore.dimensionRecords.find(d => d.name === dim)?.declared : null;
  if (!cs || !dim || !declared) return;
  const groupsOfLens = lensGroups(dim);
  const [base, head] = await Promise.all([
    checkLens(sql => QueryIn(cs.baseId, sql) as Promise<any[]>, groupsOfLens, declared),
    checkLens(sql => QueryIn(cs.headId, sql) as Promise<any[]>, groupsOfLens, declared),
  ]);
  const key = (e: GroupEdge) => `${e.fromGroup}>${e.toGroup}|${findingKey(e)}`;
  const baseKeys = new Set(base.crossings.flatMap(c => c.edges).map(key));
  const headKeys = new Set(head.crossings.flatMap(c => c.edges).map(key));
  lensDiff.value = {
    added: head.crossings.flatMap(c => c.edges).filter(e => !baseKeys.has(key(e))),
    gone: base.crossings.flatMap(c => c.edges).filter(e => !headKeys.has(key(e))),
  };
}, { immediate: true });

// ── Structure: both sides through the lens ──────────────────────────────
const structure = useStructureCompare(
  computed(() => (changeSet.value ? { base: changeSet.value.baseId, head: changeSet.value.headId } : null)),
  (scanId, sql) => QueryIn(scanId, sql) as Promise<any[]>,
);

// ── Largest moves: one metric at a time, no composite ───────────────────
const metric = ref("modularity__instability");
const metricOptions = computed(() => [...new Set(moves.value.map(m => m.metric))].map(id => ({ id, name: data.statNiceName(id) || id })));
const metricOption = computed(() => metricOptions.value.find(o => o.id === metric.value) ?? metricOptions.value[0] ?? null);
watch(metricOptions, opts => { if (opts.length && !opts.some(o => o.id === metric.value)) metric.value = opts[0].id; });
const metricMoves = computed(() => moves.value.filter(m => m.metric === (metricOption.value?.id ?? metric.value)).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)));
const fmtMetric = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString(intlLocale) : v.toLocaleString(intlLocale, { maximumFractionDigits: 2 }));

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
      ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-2", onClick: () => { showAll.value = new Set([...showAll.value, props.section]); } }, t("pages.changes.showAll", { value: props.total.toLocaleString(intlLocale) }))
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
  title: t("pages.changes.changesSummary"),
  label: t("pages.changes.copyChangesSummary"),
  savable: true,
  markdown: () => changesMarkdown(changeSet.value!, labelOf(sides.value.base), labelOf(sides.value.head), provenanceShort(buildProvenance())),
  disabledReason: () => (changeSet.value ? null : t("pages.changes.nothingComparedYet")),
});
const edgeTable = useTable({
  title: t("pages.changes.dependenciesChanged"),
  rows: () => edgeRows.value.map(r => ({ change: r.kind, from: r.from, to: r.to, refs_before: r.before, refs_after: r.after, runtime_lookup_only: r.dynamic, files: r.files.join("; ") })),
  columns: () => ["change", "from", "to", "refs_before", "refs_after", "runtime_lookup_only", "files"].map(id => ({ id, label: id.replace(/_/g, " ") })),
});
const compTable = useTable({
  title: t("pages.changes.componentsAddedRemoved"),
  rows: () => compRows.value.map(r => ({ change: r.kind, component: r.name })),
  columns: () => [{ id: "change", label: t("pages.changes.change") }, { id: "component", label: t("pages.changes.component") }],
});
const ruleTable = useTable({
  title: t("pages.changes.ruleFindingsNewGone"),
  rows: () => ruleRows.value.map(r => ({ change: r.kind, rule: r.rule, from: r.from, to: r.to, file: r.file, line: r.line })),
  columns: () => ["change", "rule", "from", "to", "file", "line"].map(id => ({ id, label: id })),
});
const movesTable = useTable({
  get title() { return t("pages.changes.largestMoves2", { value: metricOption.value?.name ?? "" }); },
  rows: () => metricMoves.value.map(m => ({ component: m.component, [`${m.metric}_before`]: m.before, [`${m.metric}_after`]: m.after })),
  columns: () => { const id = metricOption.value?.id ?? metric.value; return [{ id: "component", label: t("pages.changes.component") }, { id: `${id}_before`, label: t("pages.changes.before") }, { id: `${id}_after`, label: t("pages.changes.after") }]; },
});
</script>
