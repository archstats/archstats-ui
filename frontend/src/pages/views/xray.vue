<template>
  <ViewWorkspaceLayout :title="t('pages.xray.folderXRay')" :queryable="false" :show-config="false">
    <template #stats>
      <span v-if="dir && files.length">{{ t('pages.xray.filesLines', { prodCount: fmt(prodCount), totalLines: fmt(totalLines), topics: t('common.count.topic', { count: topicList.length }) }) }}</span>
    </template>

    <template #visualizer>
      <div class="h-full w-full overflow-y-auto">
        <div class="mx-auto w-full max-w-[1200px] px-8 py-6">
          <!-- Which folder -->
          <div class="flex flex-wrap items-center gap-2">
            <label class="ui-label" for="xray-dir">{{ t('pages.xray.folder') }}</label>
            <input id="xray-dir" v-model="draft" list="xray-dirs" class="ui-input ui-input-sm w-[420px] font-mono" placeholder="src/utils" spellcheck="false" @keydown.enter="open(draft)">
            <datalist id="xray-dirs"><option v-for="d in dirOptions" :key="d" :value="d"/></datalist>
            <button type="button" class="ui-btn ui-btn-sm" :disabled="!draft.trim()" @click="open(draft)">{{ t('pages.xray.xRay') }}</button>
            <nav v-if="dir" class="ml-2 flex min-w-0 items-center gap-1 font-mono text-sm text-neutral-500" :aria-label="t('pages.xray.parentFolders')">
              <template v-for="(p, i) in crumbs" :key="p.path">
                <span v-if="i" class="text-neutral-300">/</span>
                <button type="button" class="truncate hover:text-neutral-900" :class="{ 'text-neutral-900': p.path === dir }" @click="open(p.path)">{{ p.label }}</button>
              </template>
            </nav>
          </div>

          <EmptyState v-if="!dir" class="mt-10" icon="folder" :title="t('pages.xray.pickFolderXRay')" :text="t('pages.xray.xRayReadsEvery')"/>
          <LoadingState v-else-if="loading" class="mt-10" :text="t('pages.xray.readingFolder')"/>
          <EmptyState v-else-if="error" class="mt-10" icon="alert" :title="t('pages.xray.couldNotReadFolder')" :text="error"/>
          <EmptyState v-else-if="!files.length" class="mt-10" icon="folder" :title="t('pages.xray.noFilesHere')" :text="t('pages.xray.noFileSnapshotSits', { dir })"/>

          <template v-else>
            <!-- What the graph does not see here -->
            <p v-if="blind.length" class="mt-4 rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              <Icon icon="alert" :size="13" class="-mt-0.5 mr-1 inline text-neutral-500"/>
              {{ t('pages.xray.codeFilesHereHave', { blindLength: fmt(blind.length), codeCount: fmt(codeCount), blindExt }) }}
            </p>

            <!-- Topics -->
            <section class="mt-6">
              <div class="flex items-baseline justify-between">
                <h2 class="ui-section-title">{{ t('pages.xray.topics') }}</h2>
                <p class="text-sm text-neutral-500">{{ t('pages.xray.filesGroupedWhoUses') }}</p>
              </div>
              <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div v-for="topicList in topicList" :key="topicList.name + topicList.files[0]" class="ui-panel flex flex-col p-3" :class="{ 'ring-1 ring-accent-400': topicFilter === topicList.name }">
                  <div class="flex items-baseline gap-2">
                    <h3 class="truncate text-base font-medium text-neutral-900" :title="topicList.name">{{ topicList.name }}</h3>
                    <span class="ui-tag" :title="t('pages.xray.filesTests', { length: prodOf(topicList).length, value: topicList.files.length - prodOf(topicList).length })">{{ prodOf(topicList).length }}</span>
                    <span class="ml-auto whitespace-nowrap text-xs text-neutral-500" :title="t('pages.xray.shareTopicSTies')">{{ topicList.name === "Unclustered" ? t('pages.xray.noTies') : t('pages.xray.inside', { value: Math.round(topicList.cohesion * 100) }) }}</span>
                  </div>
                  <p class="mt-1 text-xs text-neutral-500">{{ t('pages.xray.lines', { lines: fmt(topicList.lines) }) }}</p>
                  <ul class="mt-2 flex flex-wrap gap-1">
                    <li v-for="f in prodOf(t).slice(0, 8)" :key="f" class="truncate rounded bg-neutral-100 px-1.5 font-mono text-[11px] leading-5 text-neutral-700" :title="f">{{ rel(f) }}</li>
                    <li v-if="prodOf(topicList).length > 8" class="text-[11px] leading-5 text-neutral-500">+{{ prodOf(topicList).length - 8 }}</li>
                  </ul>
                  <div class="mt-auto flex gap-1 pt-3">
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :aria-pressed="topicFilter === topicList.name" @click="topicFilter = topicFilter === topicList.name ? null : topicList.name">{{ topicFilter === topicList.name ? t('pages.xray.showAll') : t('pages.xray.showOnly') }}</button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.xray.selectTheseFilesThen')" @click="selectFiles(topicList.files)">{{ t('pages.xray.select') }}</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Files -->
            <section class="mt-8">
              <div class="flex items-baseline justify-between">
                <h2 class="ui-section-title">{{ t('pages.xray.files') }}<span v-if="topicFilter" class="ml-2 normal-case text-neutral-500">{{ t('pages.xray.in', { topicFilter }) }}</span></h2>
                <label class="flex items-center gap-2 text-sm text-neutral-600"><Checkbox v-model="showTests" :aria-label="t('pages.xray.showTests')"/>{{ ' ' + t('pages.xray.showTests') }}</label>
              </div>
              <table class="ui-table mt-2">
                <thead>
                  <tr>
                    <th class="w-8"><Checkbox :model-value="allSelected" :aria-label="t('pages.xray.selectAllShown')" @update:model-value="toggleAll"/></th>
                    <th v-for="c in columns" :key="c.id" :class="c.class">
                      <button type="button" class="hover:text-neutral-900" :aria-sort="sortBy === c.id ? (sortDesc ? 'descending' : 'ascending') : 'none'" @click="sort(c.id)">{{ c.label }}<span v-if="sortBy === c.id">{{ sortDesc ? " ↓" : " ↑" }}</span></button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in shown" :key="f.path" :class="{ 'is-selected': selected.has(f.path) }">
                    <td><Checkbox :model-value="selected.has(f.path)" :aria-label="t('pages.xray.select2', { path: f.path })" @update:model-value="toggle(f.path)"/></td>
                    <td class="max-w-[220px]">
                      <router-link :to="filePath(f.path)" class="block truncate font-mono text-sm text-neutral-900 hover:underline" :title="f.path">{{ rel(f.path) }}</router-link>
                      <span v-if="f.role !== 'production'" class="ui-tag mt-0.5">{{ f.role }}</span>
                    </td>
                    <td class="max-w-[320px] text-sm text-neutral-700"><span class="line-clamp-2" :title="f.summary">{{ f.summary || "—" }}</span></td>
                    <td class="max-w-[160px] text-sm"><span class="line-clamp-2 font-mono text-xs text-neutral-700" :title="f.exports.join(', ')">{{ f.exports.length ? `${f.exports.slice(0, 3).join(", ")}${f.exports.length > 3 ? ` +${f.exports.length - 3}` : ""}` : "—" }}</span></td>
                    <td class="max-w-[200px] text-sm"><AreaChips :areas="byArea(f.usedBy, dir)"/><span v-if="f.testedBy.length" class="block text-[11px] text-neutral-500" :title="f.testedBy.join('\n')">{{ t('pages.xray.text', { tests: t('common.count.test', { count: f.testedBy.length }) }) }}</span></td>
                    <td class="max-w-[200px] text-sm"><AreaChips :areas="byArea(f.uses, dir)"/></td>
                    <td class="max-w-[180px] text-sm">
                      <span v-if="!f.changesWith.length" class="text-neutral-400">—</span>
                      <span v-else class="line-clamp-2 font-mono text-xs text-neutral-700" :title="f.changesWith.map(c => `${c.file} (${c.shared})`).join('\n')">{{ f.changesWith.slice(0, 2).map(c => `${base(c.file)} ×${c.shared}`).join(", ") }}</span>
                    </td>
                    <td class="is-num text-right">{{ fmt(f.lines) }}</td>
                    <td class="is-num text-right">{{ fmt(f.commits) }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </template>
        </div>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="file" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { CODE_EXTENSIONS, extensionOf } from "~/features/snapshot/coverage";
import { filePath } from "~/features/navigation/routes";
import { byArea, loadXray, topics, type XrayFile } from "~/features/xray/xray";
import { t, intlLocale } from "~/shared/i18n";

// A folder, read file by file and grouped into topics: the first pass of a
// restructure, which by hand means opening every file in the folder.

const store = useDataStore();
const route = useRoute();
const router = useRouter();
const dir = computed(() => String(route.query.dir ?? "").replace(/\/+$/, ""));
const draft = ref(dir.value);
watch(dir, d => { draft.value = d; topicFilter.value = null; selected.value = new Set(); });
function open(d: string) { const v = d.trim().replace(/\/+$/, ""); if (v) void router.replace({ query: { ...route.query, dir: v } }); }

// Every folder that holds files, for the picker.
const { data: dirOptions } = useAsyncQuery<string[]>(async () => {
  const rows = await store.query<{ name: string }>("SELECT name FROM files");
  const dirs = new Set<string>();
  for (const r of rows) { const p = String(r.name).split("/"); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join("/")); }
  return [...dirs].sort();
}, [], { initial: [] });

const { data: files, loading, error } = useAsyncQuery<XrayFile[]>(
  () => (dir.value ? loadXray(sql => store.query<any>(sql), dir.value, (t, c) => (c ? store.hasColumn(t, c) : store.hasView(t))) : Promise.resolve([])),
  [dir],
  { initial: [] },
);

const topicList = computed(() => topics(files.value));
const roleByPath = computed(() => new Map(files.value.map(f => [f.path, f.role])));
const prodOf = (t: { files: string[] }) => t.files.filter(f => roleByPath.value.get(f) !== "test" && !/\.(test|spec)\.[a-z]+$/i.test(f));
const topicFilter = ref<string | null>(null);
const showTests = ref(false);
const prodCount = computed(() => files.value.filter(f => f.role === "production").length);
const totalLines = computed(() => files.value.reduce((n, f) => n + f.lines, 0));
const codeFiles = computed(() => files.value.filter(f => f.role === "production" && CODE_EXTENSIONS.has(extensionOf(f.path))));
const codeCount = computed(() => codeFiles.value.length);
// A code file the graph never mentions: no uses, no users, no exports.
const blind = computed(() => codeFiles.value.filter(f => !f.uses.length && !f.usedBy.length && !f.exports.length));
const blindExt = computed(() => {
  const c = new Map<string, number>();
  for (const f of blind.value) c.set(extensionOf(f.path), (c.get(extensionOf(f.path)) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${fmt(n)} .${e}`).join(", ");
});

const crumbs = computed(() => { const p = dir.value.split("/"); return p.map((label, i) => ({ label, path: p.slice(0, i + 1).join("/") })); });
const rel = (f: string) => (f.startsWith(dir.value + "/") ? f.slice(dir.value.length + 1) : f);
const base = (f: string) => f.slice(f.lastIndexOf("/") + 1);
const fmt = (n: number) => n.toLocaleString(intlLocale);

// Sorting and filtering.
const columns = [
  { id: "path", label: t("pages.xray.file") },
  { id: "summary", label: t("pages.xray.whatSays") },
  { id: "exports", label: t("pages.xray.exports") },
  { id: "usedBy", label: t("pages.xray.used") },
  { id: "uses", label: t("pages.xray.uses") },
  { id: "changesWith", label: t("pages.xray.changes") },
  { id: "lines", label: t("pages.xray.lines2"), class: "text-right" },
  { id: "commits", label: t("pages.xray.commits"), class: "text-right" },
] as const;
type Col = typeof columns[number]["id"];
const sortBy = ref<Col>("usedBy");
const sortDesc = ref(true);
function sort(c: Col) { if (sortBy.value === c) sortDesc.value = !sortDesc.value; else { sortBy.value = c; sortDesc.value = c !== "path" && c !== "summary"; } }
const key = (f: XrayFile, c: Col): string | number => {
  if (c === "path" || c === "summary") return f[c];
  if (c === "lines" || c === "commits") return f[c];
  return f[c].length;
};
const shown = computed(() => {
  const inTopic = topicFilter.value ? new Set(topicList.value.find(t => t.name === topicFilter.value)?.files ?? []) : null;
  const list = files.value.filter(f => (showTests.value || f.role !== "test") && (!inTopic || inTopic.has(f.path)));
  const dirn = sortDesc.value ? -1 : 1;
  return [...list].sort((a, b) => { const x = key(a, sortBy.value), y = key(b, sortBy.value); return (x < y ? -1 : x > y ? 1 : 0) * dirn || a.path.localeCompare(b.path); });
});

// Selection: the app-wide gesture, so a topic becomes a group in one step.
const selected = ref(new Set<string>());
function toggle(p: string) { const s = new Set(selected.value); s.has(p) ? s.delete(p) : s.add(p); selected.value = s; }
function selectFiles(fs: string[]) { selected.value = new Set(fs); }
const allSelected = computed(() => shown.value.length > 0 && shown.value.every(f => selected.value.has(f.path)));
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(shown.value.map(f => f.path)); }

// "pages ×5 · stores ×2", with the files on hover.
const AreaChips = defineComponent({
  props: { areas: { type: Array as () => Array<{ area: string; files: string[] }>, required: true } },
  setup(props) {
    return () => props.areas.length
      ? h("span", { class: "line-clamp-2 font-mono text-xs text-neutral-700", title: props.areas.map(a => `${a.area}: ${a.files.map(base).join(", ")}`).join("\n") },
          props.areas.slice(0, 3).map(a => `${a.area} ×${a.files.length}`).join(" · ") + (props.areas.length > 3 ? ` · +${props.areas.length - 3}` : ""))
      : h("span", { class: "text-neutral-400" }, "—");
  },
});
</script>
