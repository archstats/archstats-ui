<template>
  <ViewWorkspaceLayout
    title="Libraries"
    v-model:search-query="search"
    search-placeholder="Find a library"
    :tabs="[{ id: 'users', label: 'Used by' }]"
    active-tab="users"
    :is-sidebar-open="!!picked"
    sidebar-width="320px"
  >
    <template #stats>
      <span v-if="rows.length">Libraries <span class="text-neutral-800">{{ fmt(shown.length) }}</span><template v-if="shown.length !== libs.length"> of {{ fmt(libs.length) }}</template></span>
      <span v-if="rows.length" class="text-neutral-400">·</span>
      <span v-if="rows.length">Imports <span class="text-neutral-800">{{ fmt(rows.length) }}</span></span>
    </template>
    <template #switches>
      <span class="text-sm text-neutral-500">Roll up to</span>
      <div class="ui-segmented" role="group" aria-label="Roll-up depth">
        <button v-for="d in DEPTHS" :key="d.label" type="button" :aria-pressed="depth === d.value" :title="d.title" @click="depth = d.value">{{ d.label }}</button>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading imports…"/>
      <EmptyState v-else-if="!data.hasView('snippets')" title="No imports recorded" text="This snapshot kept no import snippets." icon="package"/>
      <EmptyState v-else-if="!rows.length" title="Nothing imported from outside" text="Every import in scope resolves to one of the project's own components." icon="package"/>
      <div v-else class="min-h-0 grow overflow-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th>Library <span class="font-normal text-neutral-400">as written in the import</span></th>
              <th></th>
              <th class="w-24 text-right" title="Import statements">Imports</th>
              <th class="w-24 text-right" title="Files with at least one">Files</th>
              <th class="w-28 text-right" title="Components with at least one">Components</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in visible" :key="l.name" class="cursor-default" :class="{ 'is-selected': picked?.name === l.name }" @click="pick(l)">
              <td class="max-w-[520px] truncate font-mono text-sm text-neutral-800" :title="l.name">{{ l.name }}</td>
              <td class="whitespace-nowrap">
                <span v-if="l.platform" class="ui-tag" :title="PLATFORM_TITLE[l.language ?? ''] ?? 'Shipped with the language'">Platform</span>
                <span v-if="l.internal" class="ui-tag" title="Starts where the project's own names start: probably one of its modules the scan did not resolve">Looks internal</span>
              </td>
              <td class="is-num text-right">{{ fmt(l.imports) }}</td>
              <td class="is-num text-right">{{ fmt(l.files) }}</td>
              <td class="is-num text-right">{{ fmt(l.components.size) }}</td>
            </tr>
          </tbody>
        </table>
        <button v-if="shown.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 300">Show {{ Math.min(300, shown.length - visible.length) }} more</button>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-users>
      <template v-if="picked">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ picked.name }}</h2>
        <p class="text-sm text-neutral-500">{{ fmt(picked.imports) }} imports in {{ fmt(picked.files) }} files of {{ fmt(picked.components.size) }} components</p>
        <div class="flex items-baseline gap-2">
          <h4 class="ui-label">Components that import it</h4>
          <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="selectAllUsers">{{ allUsersSelected ? "Clear" : "Select all" }}</button>
        </div>
        <ul class="flex flex-col">
          <li v-for="u in users" :key="u.name" class="flex h-7 items-center gap-2">
            <Checkbox :model-value="selected.has(u.name)" :aria-label="`Select ${u.name}`" @update:model-value="toggle(u.name)"/>
            <router-link :to="componentPath(u.name, 'connections')" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="u.name">{{ componentLabel(u.name, workspaces.active?.name) }}</router-link>
            <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ fmt(u.n) }}</span>
          </li>
        </ul>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useScopeStore } from "~/stores/scope";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { libraries, ownPrefixes, type ImportRow, type Library } from "~/utils/libraries";
import { componentLabel, componentPath } from "~/utils/routes";

// Which components are welded to which framework: every import that is not
// one of the project's own components, as written, rolled up to a depth.

const data = useDataStore();
const scope = useScopeStore();
const state = useStateStore();
const workspaces = useWorkspacesStore();
const fmt = (n: number) => n.toLocaleString("en-US");

const DEPTHS = [
  { label: "1", value: 1, title: "First segment: the vendor or top package" },
  { label: "2", value: 2, title: "First two segments" },
  { label: "3", value: 3, title: "First three segments" },
  { label: "As written", value: null, title: "Each import as the code writes it" },
] as const;
const PLATFORM_TITLE: Record<string, string> = {
  go: "Go standard library: no domain in the path",
  python: "Python standard library (sys.stdlib_module_names)",
  javascript: "Node built-in module",
  java: "java/ or jdk/: shipped with the JDK",
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

useExportables().register({
  kind: "table",
  get title() { return `Libraries${depth.value === null ? "" : ` to depth ${depth.value}`}`; },
  rows: () => shown.value.map(l => ({ library: l.name, platform: l.platform ? "yes" : "", looks_internal: l.internal ? "yes" : "", imports: l.imports, files: l.files, components: l.components.size })),
  columns: () => [{ id: "library", label: "Library" }, { id: "platform", label: "Platform" }, { id: "looks_internal", label: "Looks internal" }, { id: "imports", label: "Imports" }, { id: "files", label: "Files" }, { id: "components", label: "Components" }],
  notes: () => [["library", depth.value === null ? "as written in the import" : `the first ${depth.value} segments of the import as written`], ["counted", "imports of anything that is not one of the snapshot's components"]],
  disabledReason: () => (!shown.value.length ? "No libraries in scope." : null),
});
</script>
