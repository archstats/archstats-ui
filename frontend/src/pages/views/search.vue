<template>
  <ViewWorkspaceLayout
    :title="t('pages.search.findCode')"
    :queryable="true"
    :tabs="[{ id: 'hits', label: t('pages.search.hits') }]"
    active-tab="hits"
    :is-sidebar-open="!!inspected"
  >
    <template #stats>
      <template v-if="result && !error">
        <span><I18nT k="pages.search.hitsFiles"><template #intlLocale><span class="text-neutral-800">{{ totalHits.toLocaleString(intlLocale) }}</span></template><template #intlLocale2><span class="text-neutral-800">{{ fileRows.length.toLocaleString(intlLocale) }}</span></template><template #intlLocale3>{{ result.searched.toLocaleString(intlLocale) }}</template></I18nT></span>
        <span class="text-neutral-400">·</span>
        <span>{{ t('pages.search.ms', { elapsedMs: result.elapsedMs }) }}</span>
        <span v-if="result.truncated" class="text-amber-700" :title="t('pages.search.onlyFilesMostHits', { value: FILE_CAP.toLocaleString(intlLocale) })">{{ t('pages.search.firstFiles', { value: FILE_CAP.toLocaleString(intlLocale) }) }}</span>
        <span v-if="outOfScope" class="text-neutral-500" :title="t('pages.search.filesScopeFilesSwitch')">{{ t('pages.search.outScope', { value: outOfScope.toLocaleString(intlLocale) }) }}</span>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.search.rollUp')">
        <button v-for="g in GRAINS" :key="g.id" type="button" :aria-pressed="grain === g.id" @click="setRoute({ grain: g.id === 'components' ? undefined : g.id })">{{ g.label }}</button>
      </div>
    </template>
    <template #actions>
      <button
        type="button"
        class="ui-btn ui-btn-sm"
        :disabled="!canKeep"
        :title="canKeep ? t('pages.search.liveGroupEverythingContains', { needle }) : t('pages.search.liveGroupKeepsPlain')"
        @click="keepLive"
      >
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span>{{ t('pages.search.keepLiveGroup') }}</span>
      </button>
    </template>

    <template #visualizer>
      <div class="flex shrink-0 flex-col gap-1 px-4 pb-2 pt-3">
        <div class="flex items-center gap-2">
          <label class="relative flex min-w-0 flex-1 items-center">
            <Icon icon="search-code" :size="14" class="pointer-events-none absolute left-2.5 text-neutral-400"/>
            <input
              ref="inputEl"
              :value="typed"
              type="text"
              spellcheck="false"
              autocomplete="off"
              class="ui-input h-8 w-full pl-8 font-mono"
              :class="error ? '!border-red-400' : ''"
              :placeholder="t('pages.search.textCodeClassCall')"
              :aria-label="t('pages.search.textFind')"
              :aria-invalid="!!error"
              @input="typed = ($event.target as HTMLInputElement).value"
              @keydown.enter="commit"
            >
          </label>
          <div class="ui-segmented" role="group" :aria-label="t('pages.search.matchOptions')">
            <button type="button" :aria-pressed="opts.caseSensitive" :title="t('pages.search.matchCase')" class="font-mono" @click="setRoute({ case: opts.caseSensitive ? undefined : '1' })">{{ t('pages.search.aa') }}</button>
            <button type="button" :aria-pressed="opts.word" :title="t('pages.search.wholeWord')" class="font-mono" @click="setRoute({ word: opts.word ? undefined : '1' })">W</button>
            <button type="button" :aria-pressed="opts.regex" :title="t('pages.search.regularExpressionRe2')" class="font-mono" @click="setRoute({ regex: opts.regex ? undefined : '1' })">.*</button>
          </div>
        </div>
        <p v-if="error" class="font-mono text-sm text-red-700" role="alert">{{ error }}</p>
        <p v-else-if="!hasSource" class="text-sm text-neutral-500">{{ t('pages.search.snapshotKeptNoSource') }}</p>
      </div>

      <!-- Hits are an exhibit: a strip names them and ends in their export button. -->
      <ExhibitFrame v-if="needle && rows.length && !(loading && !result) && !(grain === 'groups' && !lens.active)"
                    :exhibit="hitTable" class="grow" fill header-class="h-9 shrink-0 px-4 hairline-b">
        <template #aside>{{ rows.length.toLocaleString(intlLocale) }} {{ grain === "files" ? "files" : grain === "groups" ? "groups" : "components" }}</template>
        <div class="absolute inset-0 overflow-y-auto">
          <table class="ui-table w-full">
            <thead>
              <tr>
                <th v-if="selectable" class="w-8"><Checkbox :model-value="allSelected" :aria-label="t('pages.search.selectAll')" @update:model-value="toggleAll"/></th>
                <th class="text-left">{{ grain === 'files' ? t('pages.search.file') : grain === 'groups' ? t('pages.search.group') : t('pages.search.component') }}</th>
                <th v-if="grain !== 'files'" class="w-20 text-right">{{ t('pages.search.files') }}</th>
                <th class="w-20 text-right">{{ t('pages.search.hits') }}</th>
                <th class="w-40"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in shownRows"
                :key="r.key"
                class="cursor-default"
                :class="inspected?.key === r.key ? 'bg-accent-50' : ''"
                @click="inspect(r)"
              >
                <td v-if="selectable" @click.stop><Checkbox :model-value="selected.has(r.key)" :aria-label="t('pages.search.select', { label: r.label })" @update:model-value="toggle(r.key)"/></td>
                <td class="max-w-0 truncate font-mono text-sm" :title="r.key">
                  <span v-if="r.color" class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" :style="{ background: r.color }" aria-hidden="true"></span>{{ r.label }}
                </td>
                <td v-if="grain !== 'files'" class="text-right font-mono text-sm tabular-nums">{{ r.files.length.toLocaleString(intlLocale) }}</td>
                <td class="text-right font-mono text-sm tabular-nums">{{ r.hits.toLocaleString(intlLocale) }}</td>
                <td><span class="block h-1.5 rounded-sm bg-accent-400/70" :style="{ width: `${Math.max(2, (r.hits / maxHits) * 100)}%` }"></span></td>
              </tr>
            </tbody>
          </table>
          <button v-if="rows.length > shownRows.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 500">{{ t('pages.search.showMore', { min: Math.min(500, rows.length - shownRows.length), value: (rows.length - shownRows.length).toLocaleString(intlLocale) }) }}</button>
        </div>
      </ExhibitFrame>
      <div v-else class="min-h-0 grow overflow-y-auto">
        <EmptyState v-if="!needle" class="h-full" :title="t('pages.search.findTextCode')" :text="t('pages.search.wherePaymentGatewayCalled')" icon="search"/>
        <LoadingState v-else-if="loading && !result" class="h-full"/>
        <EmptyState v-else-if="result && !rows.length && !error" class="h-full" :title="t('pages.search.noScope', { needle })" :text="outOfScope ? t('pages.search.filesOutsideScopeHold', { value: outOfScope.toLocaleString(intlLocale) }) : t('pages.search.notAnyFileSnapshot')" icon="search"/>
        <EmptyState v-else-if="grain === 'groups' && !lens.active" class="h-full" :title="t('pages.search.pickLens')" :text="t('pages.search.hitsRollUpGroups')" icon="layers"/>
      </div>
      <GroupActionBar v-if="selectable && selected.size" :selected-items="[...selected]" :kind="grain === 'files' ? 'file' : 'component'" :show-in-except="['search']" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-hits>
      <template v-if="inspected">
        <div class="flex items-baseline gap-2">
          <h2 class="min-w-0 flex-1 truncate font-mono text-base font-medium text-neutral-900" :title="inspected.key">{{ inspected.label }}</h2>
          <router-link v-if="inspected.to" :to="inspected.to" class="shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ t('pages.search.open') }}</router-link>
        </div>
        <p class="text-sm text-neutral-500">{{ t('pages.search.hits2', { value: inspected.hits.toLocaleString(intlLocale), files: t('common.count.file', { count: inspected.files.length }) }) }}</p>
        <section v-for="f in inspectedFiles" :key="f.file" class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <router-link :to="filePath(f.file, 'source')" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800 hover:text-neutral-950" :title="f.file">{{ basename(f.file) }}</router-link>
            <span class="shrink-0 font-mono text-xs text-neutral-400">{{ f.hits }}</span>
          </div>
          <ol v-if="lines[f.file]" class="overflow-x-auto rounded border border-neutral-200 bg-neutral-50 font-mono text-xs leading-5">
            <template v-for="(l, i) in lines[f.file]" :key="l.line">
              <li v-if="i > 0 && l.line > lines[f.file][i - 1].line + 1" class="px-2 text-neutral-300" aria-hidden="true">⋯</li>
              <li>
                <router-link :to="`${filePath(f.file, 'source')}#L${l.line}`" class="flex gap-2 px-2 hover:bg-neutral-100" :class="l.context ? 'text-neutral-400' : 'text-neutral-800'">
                  <span class="w-9 shrink-0 select-none text-right text-neutral-400">{{ l.line }}</span>
                  <span class="min-w-0 whitespace-pre"><template v-for="(part, j) in pieces(l)" :key="j"><mark v-if="part.hit" class="rounded-sm bg-accent-200 text-neutral-950">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                </router-link>
              </li>
            </template>
          </ol>
          <p v-else-if="lineErrors[f.file]" class="text-xs text-neutral-500">{{ lineErrors[f.file] }}</p>
          <p v-else class="text-xs text-neutral-400">{{ t('pages.search.reading') }}</p>
        </section>
        <p v-if="inspected.files.length > inspectedFiles.length" class="text-sm text-neutral-500">{{ t('pages.search.moreFilesChooseFiles', { value: (inspected.files.length - inspectedFiles.length).toLocaleString(intlLocale) }) }}</p>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useTable } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { DEFAULT_DIMENSION, useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { findInCode, findLines, type FindOptions, type FindResult, type HitLine } from "~/features/files/codeSearch";
import { componentLabel, componentPath, filePath, groupPath } from "~/features/navigation/routes";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { t, intlLocale } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT";

// Where a text lives in the code, rolled up the way the architect slices it:
// by component, by the groups of the lens, or file by file. Reached from ⌘P's
// last row. The search runs over the source the snapshot kept, not the disk.

interface Row { key: string; label: string; files: Array<{ file: string; hits: number }>; hits: number; to?: string; color?: string | null }

const FILE_CAP = 5000;
const GRAINS = [{ id: "components", label: t("pages.search.components") }, { id: "groups", label: t("pages.search.groups") }, { id: "files", label: t("pages.search.files") }] as const;

const route = useRoute();
const router = useRouter();
const data = useDataStore();
const scope = useScopeStore();
const lens = useLensStore();
const groups = useGroupsStore();
const workspaces = useWorkspacesStore();

const needle = computed(() => (typeof route.query.q === "string" ? route.query.q : ""));
const grain = computed(() => (route.query.grain === "files" || route.query.grain === "groups" ? route.query.grain : "components"));
const opts = computed<FindOptions>(() => ({ regex: route.query.regex === "1", caseSensitive: route.query.case === "1", word: route.query.word === "1" }));
function setRoute(patch: Record<string, string | undefined>) {
  const q: Record<string, any> = { ...route.query, ...patch };
  for (const k of Object.keys(q)) if (q[k] === undefined || q[k] === "") delete q[k];
  void router.replace({ query: q });
}

// Typing searches after a pause; Enter searches now.
const typed = ref(needle.value);
watch(needle, v => { if (v !== typed.value) typed.value = v; });
let timer: ReturnType<typeof setTimeout> | null = null;
watch(typed, v => { if (timer) clearTimeout(timer); timer = setTimeout(() => setRoute({ q: v.trim() || undefined }), 300); });
function commit() { if (timer) clearTimeout(timer); setRoute({ q: typed.value.trim() || undefined }); }

// Declared before the search watch below, which resets them on every new search.
const inspected = shallowRef<Row | null>(null);
const selected = ref<Set<string>>(new Set());
const limit = ref(500);

const result = shallowRef<FindResult | null>(null);
const error = ref("");
const loading = ref(false);
const hasSource = computed(() => !result.value || result.value.searched > 0);
let asked = 0;
watch([needle, opts, () => data._openScanId], async ([n, o, scanId]) => {
  const mine = ++asked;
  error.value = "";
  inspected.value = null;
  selected.value = new Set();
  limit.value = 500;
  if (!n || !scanId) { result.value = null; return; }
  loading.value = true;
  try {
    const r = await findInCode(String(scanId), n, o);
    if (mine === asked) result.value = r;
  } catch (e: any) {
    if (mine === asked) { result.value = null; error.value = String(e?.message ?? e); }
  } finally {
    if (mine === asked) loading.value = false;
  }
}, { immediate: true, deep: true });

// ── Rows ───────────────────────────────────────────────────────────────
const inScope = computed(() => {
  const r = result.value;
  if (!r) return [];
  const comp = data.fileComponentIndex;
  return r.files.filter(f => scope.fileInScope(f.file, comp.get(f.file)));
});
const outOfScope = computed(() => (result.value?.files.length ?? 0) - inScope.value.length);
const fileRows = computed(() => inScope.value);
const totalHits = computed(() => inScope.value.reduce((s, f) => s + f.hits, 0));

function rollup(keyOf: (file: string) => string[], label: (k: string) => string, to: (k: string) => string | undefined, color?: (k: string) => string | null): Row[] {
  const by = new Map<string, Row>();
  for (const f of inScope.value) {
    for (const k of keyOf(f.file)) {
      let r = by.get(k);
      if (!r) { r = { key: k, label: label(k), files: [], hits: 0, to: to(k), color: color?.(k) }; by.set(k, r); }
      r.files.push(f);
      r.hits += f.hits;
    }
  }
  return [...by.values()].sort((a, b) => b.hits - a.hits || b.files.length - a.files.length || a.label.localeCompare(b.label));
}

const NO_GROUP = "\u0000none";
const lensGroups = computed(() => {
  const dim = lens.active;
  if (!dim) return [];
  return groups.groups.filter(g => g.dimension === dim).map(g => {
    const members = groups.membership.get(g.id) ?? [];
    return { g, files: new Set(members.filter(m => m.kind === "file").map(m => m.name)), components: new Set(members.filter(m => m.kind === "component").map(m => m.name)) };
  });
});

const rows = computed<Row[]>(() => {
  const comp = data.fileComponentIndex;
  const project = workspaces.active?.name ?? "";
  if (grain.value === "files") {
    return inScope.value.map(f => ({ key: f.file, label: f.file, files: [f], hits: f.hits, to: filePath(f.file) }));
  }
  if (grain.value === "groups") {
    if (!lens.active) return [];
    const byId = new Map(lensGroups.value.map(x => [x.g.id, x.g]));
    return rollup(
      file => {
        const c = comp.get(file);
        const ids = lensGroups.value.filter(x => x.files.has(file) || (!!c && x.components.has(c))).map(x => x.g.id);
        return ids.length ? ids : [NO_GROUP];
      },
      k => (k === NO_GROUP ? t("pages.search.noGroup") : byId.get(k)?.name ?? k),
      k => (k === NO_GROUP ? undefined : groupPath(k)),
      k => (k === NO_GROUP ? null : byId.get(k)?.color ?? null),
    );
  }
  return rollup(file => [comp.get(file) ?? "(no component)"], k => (k === "(no component)" ? t("pages.search.noComponent") : componentLabel(k, project)), k => (k === "(no component)" ? undefined : componentPath(k)));
});
const shownRows = computed(() => rows.value.slice(0, limit.value));
const maxHits = computed(() => rows.value[0]?.hits || 1);

// ── Selection: components or files become a group ─────────────────────
const selectable = computed(() => grain.value !== "groups");
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.has(r.key) || r.key === "(no component)"));
function toggle(key: string) { const s = new Set(selected.value); s.has(key) ? s.delete(key) : s.add(key); selected.value = s; }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(rows.value.map(r => r.key).filter(k => k !== "(no component)")); }
watch(grain, () => { selected.value = new Set(); inspected.value = null; limit.value = 500; });

// A plain text becomes a group that is answered again on every scan.
const canKeep = computed(() => !!needle.value && !opts.value.regex && !opts.value.word && !needle.value.includes('"') && !!result.value?.files.length);
function keepLive() {
  if (!canKeep.value) return;
  const g = groups.createGroup(needle.value, [], lens.active ?? DEFAULT_DIMENSION);
  groups.setQuery(g.id, t("pages.search.contains", { needle: needle.value }), "live");
  void router.push(groupPath(g.id));
}

// ── Inspector ───────────────────────────────────────────────────────────
const lines = ref<Record<string, HitLine[]>>({});
const lineErrors = ref<Record<string, string>>({});
const inspectedFiles = computed(() => (inspected.value?.files ?? []).slice(0, 12));
function inspect(r: Row) { inspected.value = inspected.value?.key === r.key ? null : r; }
watch(inspectedFiles, async (files) => {
  const scanId = String(data._openScanId ?? "");
  for (const f of files) {
    if (lines.value[f.file] || lineErrors.value[f.file]) continue;
    try { lines.value = { ...lines.value, [f.file]: await findLines(scanId, f.file, needle.value, opts.value) }; }
    catch (e: any) { lineErrors.value = { ...lineErrors.value, [f.file]: String(e?.message ?? e) }; }
  }
});
watch([needle, opts], () => { lines.value = {}; lineErrors.value = {}; }, { deep: true });

function pieces(l: HitLine): Array<{ text: string; hit: boolean }> {
  const out: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (const [a, b] of l.ranges ?? []) {
    if (a > at) out.push({ text: l.text.slice(at, a), hit: false });
    out.push({ text: l.text.slice(a, b), hit: true });
    at = b;
  }
  if (at < l.text.length) out.push({ text: l.text.slice(at), hit: false });
  return out;
}
const basename = (f: string) => f.slice(f.lastIndexOf("/") + 1);

// ── Export ──────────────────────────────────────────────────────────────
const hitTable = useTable({
  get title() { return t("pages.search.find", { needle: needle.value, grain: grain.value }); },
  rows: () => rows.value.map(r => ({ [grain.value === "files" ? "file" : grain.value === "groups" ? "group" : "component"]: r.label, files: r.files.length, hits: r.hits })),
  columns: () => [
    { id: grain.value === "files" ? "file" : grain.value === "groups" ? "group" : "component", label: grain.value === "files" ? t("pages.search.file") : grain.value === "groups" ? t("pages.search.group") : t("pages.search.component") },
    { id: "files", label: t("pages.search.files") },
    { id: "hits", label: t("pages.search.hits") },
  ],
  disabledReason: () => (!rows.value.length ? t("pages.search.nothingFoundYet") : null),
});
</script>
