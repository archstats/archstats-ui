<template>
  <ViewWorkspaceLayout
    :title="t('pages.libraries.libraries')"
    v-model:search-query="search"
    :search-placeholder="t('pages.libraries.findLibrary')"
    :tabs="[{ id: 'users', label: t('pages.libraries.used') }]"
    active-tab="users"
    :is-sidebar-open="!!picked"
    sidebar-width="320px"
  >
    <template #stats>
      <span v-if="rows.length">{{ t('pages.libraries.libraries') }} <span class="text-neutral-800">{{ fmt(shown.length) }}</span><template v-if="shown.length !== libs.length">{{ ' ' + t('pages.libraries.of', { libsLength: fmt(libs.length) }) }}</template></span>
      <span v-if="rows.length" class="text-neutral-400">·</span>
      <span v-if="rows.length">{{ t('pages.libraries.imports') }} <span class="text-neutral-800">{{ fmt(rows.length) }}</span></span>
    </template>
    <template #switches>
      <span class="text-sm text-neutral-500">{{ t('pages.libraries.rollUp') }}</span>
      <div class="ui-segmented" role="group" :aria-label="t('pages.libraries.rollUpDepth')">
        <button v-for="d in DEPTHS" :key="d.label" type="button" :aria-pressed="depth === d.value" :title="d.title" @click="depth = d.value">{{ d.label }}</button>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" :text="t('pages.libraries.readingImports')"/>
      <EmptyState v-else-if="!data.hasView('snippets')" :title="t('pages.libraries.noImportsRecorded')" :text="t('pages.libraries.snapshotKeptNoImport')" icon="package"/>
      <EmptyState v-else-if="!rows.length" :title="t('pages.libraries.nothingImportedOutside')" :text="t('pages.libraries.everyImportScopeResolves')" icon="package"/>
      <ExhibitFrame v-else :exhibit="libraryTable" class="grow" fill header-class="h-9 shrink-0 px-4 hairline-b">
        <template #aside>{{ shown.length.toLocaleString(intlLocale) }} {{t('common.noun.library', { count: shown.length })}}</template>
        <div class="absolute inset-0 overflow-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th>{{ t('pages.libraries.library') }} <span class="font-normal text-neutral-400">{{ t('pages.libraries.writtenImport') }}</span></th>
                <th></th>
                <th class="w-24 text-right" :title="t('pages.libraries.importStatements')">{{ t('pages.libraries.imports') }}</th>
                <th class="w-24 text-right" :title="t('pages.libraries.filesLeastOne')">{{ t('pages.libraries.files') }}</th>
                <th class="w-28 text-right" :title="t('pages.libraries.componentsLeastOne')">{{ t('pages.libraries.components') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in visible" :key="l.name" class="cursor-default" :class="{ 'is-selected': picked?.name === l.name }" @click="pick(l)">
                <td class="max-w-[520px] truncate font-mono text-sm text-neutral-800" :title="displayName(l.name, l.language)">{{ displayName(l.name, l.language) }}</td>
                <td class="whitespace-nowrap">
                  <span v-if="l.platform" class="ui-tag" :title="PLATFORM_TITLE[l.language ?? ''] ?? t('pages.libraries.shippedLanguage')">{{ t('pages.libraries.platform') }}</span>
                  <span v-if="l.internal" class="ui-tag" :title="t('pages.libraries.startsWhereProjectS')">{{ t('pages.libraries.looksInternal') }}</span>
                </td>
                <td class="is-num text-right">{{ fmt(l.imports) }}</td>
                <td class="is-num text-right">{{ fmt(l.files) }}</td>
                <td class="is-num text-right">{{ fmt(l.components.size) }}</td>
              </tr>
            </tbody>
          </table>
          <button v-if="shown.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 300">{{ t('pages.libraries.showMore', { min: Math.min(300, shown.length - visible.length) }) }}</button>
        </div>
      </ExhibitFrame>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-users>
      <template v-if="picked">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ displayName(picked.name, picked.language) }}</h2>
        <p class="text-sm text-neutral-500">{{ t('pages.libraries.importsFilesComponents', { imports: fmt(picked.imports), files: fmt(picked.files), componentsSize: fmt(picked.components.size) }) }}</p>
        <div class="flex items-baseline gap-2">
          <h4 class="ui-label">{{ t('pages.libraries.componentsImport') }}</h4>
          <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="selectAllUsers">{{ allUsersSelected ? t('pages.libraries.clear') : t('pages.libraries.selectAll') }}</button>
        </div>
        <ul class="flex flex-col">
          <li v-for="u in users" :key="u.name" class="flex h-7 items-center gap-2">
            <Checkbox :model-value="selected.has(u.name)" :aria-label="t('pages.libraries.select', { uName: u.name })" @update:model-value="toggle(u.name)"/>
            <router-link :to="componentPath(u.name, 'connections')" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="u.name">{{ componentLabel(u.name, workspaces.active?.name) }}</router-link>
            <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ fmt(u.n) }}</span>
          </li>
        </ul>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { computed, ref, watch } from "vue";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useTable } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useStateStore } from "~/platform/state.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { displayName, libraries, ownPrefixes, type ImportRow, type Library } from "~/features/libraries/libraries";
import { componentLabel, componentPath } from "~/features/navigation/routes";
import { t, intlLocale } from "~/shared/i18n";

// Which components are welded to which framework: every import that is not
// one of the project's own components, as written, rolled up to a depth.

const data = useDataStore();
const scope = useScopeStore();
const state = useStateStore();
const workspaces = useWorkspacesStore();
const fmt = (n: number) => n.toLocaleString(intlLocale);

const DEPTHS = [
  { label: "1", value: 1, title: t("pages.libraries.firstSegmentVendorTop") },
  { label: "2", value: 2, title: t("pages.libraries.firstTwoSegments") },
  { label: "3", value: 3, title: t("pages.libraries.firstThreeSegments") },
  { label: t("pages.libraries.written"), value: null, title: t("pages.libraries.eachImportCodeWrites") },
] as const;
const PLATFORM_TITLE: Record<string, string> = {
  go: t("pages.libraries.goStandardLibraryNo"),
  python: t("pages.libraries.pythonStandardLibrarySys"),
  javascript: t("pages.libraries.nodeBuiltModule"),
  java: t("pages.libraries.javaJdkShippedJdk"),
};
const depth = computed<number | null>({
  get: () => { const v = state.get<number | string>("libraries.depth", 2); return v === "written" ? null : Number(v) || 2; },
  set: (v) => state.set("libraries.depth", v === 2 ? null : v === null ? "written" : v),
});

const { data: raw, loading } = useAsyncQuery<ImportRow[]>(
  () => (data.hasView("snippets")
    ? data.query(`SELECT content, file, component FROM snippets WHERE snippet_type = 'modularity__component__imports' AND content NOT IN (SELECT name FROM components)`)
    : Promise.resolve([])),
  [() => data.datasetKey],
  { initial: [] },
);
const rows = computed(() => raw.value.filter(r => scope.fileInScope(r.file, r.component)));
const own = computed(() => ownPrefixes(data.allComponents.map(c => c.name)));
const libs = computed(() => libraries(rows.value, depth.value, own.value));

const search = ref("");
const shown = computed(() => { const q = search.value.trim().toLowerCase(); return q ? libs.value.filter(l => l.name.toLowerCase().includes(q)) : libs.value; });
const limit = ref(300);
const visible = computed(() => shown.value.slice(0, limit.value));
watch([search, depth], () => { limit.value = 300; });

const picked = ref<Library | null>(null);
function pick(l: Library) { picked.value = picked.value?.name === l.name ? null : l; }
watch(libs, list => { if (picked.value) picked.value = list.find(l => l.name === picked.value!.name) ?? null; });
const users = computed(() => [...(picked.value?.components ?? [])].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)));

const selected = ref<Set<string>>(new Set());
function toggle(k: string) { const s = new Set(selected.value); s.has(k) ? s.delete(k) : s.add(k); selected.value = s; }
const allUsersSelected = computed(() => users.value.length > 0 && users.value.every(u => selected.value.has(u.name)));
function selectAllUsers() {
  const s = new Set(selected.value);
  if (allUsersSelected.value) users.value.forEach(u => s.delete(u.name)); else users.value.forEach(u => s.add(u.name));
  selected.value = s;
}

const libraryTable = useTable({
  get title() { return t("pages.libraries.libraries2", { value: depth.value === null ? "" : t("pages.libraries.depth", { depth: depth.value }) }); },
  rows: () => shown.value.map(l => ({ library: displayName(l.name, l.language), platform: l.platform ? "yes" : "", looks_internal: l.internal ? "yes" : "", imports: l.imports, files: l.files, components: l.components.size })),
  columns: () => [{ id: "library", label: t("pages.libraries.library") }, { id: "platform", label: t("pages.libraries.platform") }, { id: "looks_internal", label: t("pages.libraries.looksInternal") }, { id: "imports", label: t("pages.libraries.imports") }, { id: "files", label: t("pages.libraries.files") }, { id: "components", label: t("pages.libraries.components") }],
  notes: () => [["library", depth.value === null ? t("pages.libraries.writtenImport") : t("pages.libraries.firstSegmentsImportWritten", { depth: depth.value })], ["counted", t("pages.libraries.importsAnythingNotOne")]],
  disabledReason: () => (!shown.value.length ? t("pages.libraries.noLibrariesScope") : null),
});
</script>
