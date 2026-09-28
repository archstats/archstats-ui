<template>
  <ViewWorkspaceLayout title="Structure checks" :queryable="false" :show-config="false">
    <template #stats>
      <span v-if="data.files.length">{{ fmt(readableProd.size) }} production code files read · {{ fmt(edges.length) }} file imports</span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Check">
        <button v-for="t in TABS" :key="t.id" type="button" :aria-pressed="tab === t.id" :title="t.title" @click="setTab(t.id)">{{ t.label }}<span v-if="t.count() != null" class="ml-1.5 text-neutral-500">{{ fmt(t.count()!) }}</span></button>
      </div>
    </template>

    <template #visualizer>
      <div class="h-full w-full overflow-y-auto">
        <div class="mx-auto w-full max-w-[1100px] px-8 py-6">
          <LoadingState v-if="loading" class="mt-10" text="Reading the import graph…"/>
          <EmptyState v-else-if="error" class="mt-10" icon="alert" title="Could not read the snapshot" :text="error"/>
          <EmptyState v-else-if="!data.edges.length" class="mt-10" icon="network" title="No file imports recorded" text="This snapshot has no file-level import graph (unit_connections), so there is nothing to check. Rescan with a current engine."/>

          <template v-else>
            <!-- What the answers leave out -->
            <p v-if="blindExt.length || coverageShare < 0.95" class="rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              <Icon icon="alert" :size="13" class="-mt-0.5 mr-1 inline text-neutral-500"/>
              The engine parsed imports for {{ Math.round(coverageShare * 100) }}% of code files.
              <template v-if="blindExt.length">The engine did not parse {{ blindExt.map(b => `${fmt(b.files)} .${b.ext}`).join(", ") }} files, so their imports are read from their text instead: import paths, component tags and auto-imported names ({{ fmt(inferred.length) }} imports, marked <span class="ui-tag">read from text</span>).</template>
              <template v-else>A file the graph misses can look unreachable, and an import it misses can hide an inversion.</template>
              <router-link to="/views/snapshot#coverage" class="ml-1 underline">Coverage by file type</router-link>
            </p>

            <!-- ── Layers ── -->
            <section v-if="tab === 'layers'" class="mt-4">
              <h2 class="ui-section-title">Layer inversions</h2>
              <p class="mt-1 max-w-[760px] text-sm text-neutral-600">
                Folder and class names announce a layer. A page may use a store, a store may use a utility; the reverse is an inversion, and it is where a "utility" turns out to be feature code. Untick a layer the naming gets wrong here.
              </p>
              <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <label v-for="l in LAYERS" :key="l.id" class="flex items-center gap-1.5 text-sm text-neutral-700" :title="`${l.folders.source}${l.suffix ? ' · names ending ' + l.suffix.source : ''}`">
                  <Checkbox :model-value="!offLayers.has(l.id)" :aria-label="l.label" @update:model-value="toggleLayer(l.id)"/>
                  {{ l.label }} <span class="text-neutral-400">{{ fmt(layerCounts.get(l.id) ?? 0) }}</span>
                </label>
                <span class="text-sm text-neutral-400">{{ fmt(layerCounts.get("") ?? 0) }} files name no layer</span>
              </div>

              <EmptyState v-if="!inversionList.length" class="mt-8" icon="check" title="No inversions" text="Every import between named layers points downward."/>
              <div v-for="inv in inversionList" :key="inv.from.id + inv.to.id" class="ui-panel mt-4 p-3">
                <div class="flex items-baseline gap-2">
                  <h3 class="text-base font-medium text-neutral-900">{{ short(inv.from) }} → {{ short(inv.to) }}</h3>
                  <span class="text-sm text-neutral-500">{{ fmt(inv.edges.length) }} import{{ inv.edges.length === 1 ? "" : "s" }} from {{ fmt(new Set(inv.edges.map(e => e.from)).size) }} file{{ new Set(inv.edges.map(e => e.from)).size === 1 ? "" : "s" }}</span>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" title="Select the importing files, then Create group or Send to planner" @click="selected = new Set(inv.edges.map(e => e.from))">Select importers</button>
                </div>
                <table class="ui-table mt-2">
                  <thead><tr><th>Importing file</th><th>Imports</th><th>Names used</th></tr></thead>
                  <tbody>
                    <tr v-for="e in inv.edges.slice(0, openInv.has(inv.from.id + inv.to.id) ? undefined : 8)" :key="e.from + e.to" :class="{ 'is-selected': selected.has(e.from) }">
                      <td class="max-w-[360px]"><router-link :to="filePath(e.from)" class="block truncate font-mono text-sm hover:underline" :title="e.from">{{ e.from }}</router-link></td>
                      <td class="max-w-[360px]"><router-link :to="filePath(e.to)" class="block truncate font-mono text-sm hover:underline" :title="e.to">{{ e.to }}</router-link></td>
                      <td class="max-w-[220px] truncate font-mono text-xs text-neutral-700" :title="e.names.join(', ')"><span v-if="e.inferred" class="ui-tag mr-1 font-sans" title="Read from the file's text: the engine did not parse this file type">read from text</span>{{ e.names.join(", ") || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <button v-if="inv.edges.length > 8" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="toggleOpen(inv.from.id + inv.to.id)">{{ openInv.has(inv.from.id + inv.to.id) ? "Show fewer" : `Show all ${fmt(inv.edges.length)}` }}</button>
              </div>
            </section>

            <!-- ── Reachability ── -->
            <section v-if="tab === 'reach'" class="mt-4">
              <h2 class="ui-section-title">Reachability</h2>
              <p class="mt-1 max-w-[760px] text-sm text-neutral-600">
                Walks the imports from what a framework calls without an import: pages, main, Spring beans, Django apps. What no walk reaches is a candidate for deletion; what only tests reach is kept alive by its tests. Candidates, not verdicts: reflection, string lookups and config wiring are invisible here.
              </p>
              <div class="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
                <div>
                  <h3 class="ui-label">Entry points found</h3>
                  <ul class="mt-1 text-sm text-neutral-700">
                    <li v-for="r in reach.byRule" :key="r.rule.id"><span class="is-num inline-block w-12 text-right">{{ fmt(r.files) }}</span> <span class="ml-2">{{ r.rule.label }}</span></li>
                    <li v-if="!reach.byRule.length" class="text-neutral-500">None. Add the files your framework calls on the right.</li>
                  </ul>
                </div>
                <div>
                  <label class="ui-label" for="extra-roots">More entry points, one glob per line</label>
                  <textarea id="extra-roots" v-model="extraDraft" rows="3" class="ui-input mt-1 h-auto min-h-[64px] w-full py-1.5 font-mono text-xs" placeholder="src/workers/**&#10;**/*.stories.ts" spellcheck="false" @blur="applyExtra"/>
                </div>
              </div>

              <div class="mt-6 flex items-baseline gap-2">
                <h3 class="text-base font-medium text-neutral-900">Reached by nothing</h3>
                <span class="text-sm text-neutral-500">{{ fmt(reach.unreachable.length) }} files · {{ fmt(sumLines(reach.unreachable)) }} lines</span>
                <button v-if="reach.unreachable.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="selected = new Set(reach.unreachable)">Select all</button>
              </div>
              <FileList :files="reach.unreachable" :lines="data.lines" :selected="selected" @toggle="toggle"/>

              <div class="mt-6 flex items-baseline gap-2">
                <h3 class="text-base font-medium text-neutral-900">Reached only by tests</h3>
                <span class="text-sm text-neutral-500">{{ fmt(reach.testOnly.length) }} files · {{ fmt(sumLines(reach.testOnly)) }} lines</span>
                <button v-if="reach.testOnly.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="selected = new Set(reach.testOnly)">Select all</button>
              </div>
              <FileList :files="reach.testOnly" :lines="data.lines" :selected="selected" @toggle="toggle"/>

            </section>

            <!-- ── Duplicates ── -->
            <section v-if="tab === 'dupes'" class="mt-4">
              <h2 class="ui-section-title">Declared more than once</h2>
              <p class="mt-1 max-w-[760px] text-sm text-neutral-600">
                The same top-level name declared in several production files: a rule written twice, or two things that should have different names. Common names (main, init, render, Props) are left out.
              </p>
              <EmptyState v-if="!dupNames.length" class="mt-6" icon="check" title="No repeated names"/>
              <table v-else class="ui-table mt-3">
                <thead><tr><th>Name</th><th>Declared in</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="d in dupNames.slice(0, dupLimit)" :key="d.name">
                    <td class="font-mono text-sm text-neutral-900">{{ d.name }}</td>
                    <td><router-link v-for="f in d.files" :key="f" :to="filePath(f)" class="block truncate font-mono text-xs text-neutral-700 hover:underline" :title="f">{{ f }}</router-link></td>
                    <td class="text-right"><button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = new Set(d.files)">Select</button></td>
                  </tr>
                </tbody>
              </table>
              <button v-if="dupNames.length > dupLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="dupLimit += 50">Show 50 more of {{ fmt(dupNames.length - dupLimit) }}</button>

              <h2 class="ui-section-title mt-8">Same file name, several folders</h2>
              <p class="mt-1 max-w-[760px] text-sm text-neutral-600">A name reused across folders: parallel implementations, or one concept split by layer. index, __init__, types and the like are left out.</p>
              <EmptyState v-if="!dupFiles.length" class="mt-6" icon="check" title="No repeated file names"/>
              <table v-else class="ui-table mt-3">
                <thead><tr><th>File name</th><th>Found in</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="d in dupFiles.slice(0, fileLimit)" :key="d.name">
                    <td class="font-mono text-sm text-neutral-900">{{ d.name }}</td>
                    <td><router-link v-for="f in d.files" :key="f" :to="filePath(f)" class="block truncate font-mono text-xs text-neutral-700 hover:underline" :title="f">{{ f }}</router-link></td>
                    <td class="text-right"><button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = new Set(d.files)">Select</button></td>
                  </tr>
                </tbody>
              </table>
              <button v-if="dupFiles.length > fileLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="fileLimit += 50">Show 50 more of {{ fmt(dupFiles.length - fileLimit) }}</button>
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
import { RouterLink, useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { useFileGraph } from "~/features/checks/useFileGraph";
import { filePath } from "~/features/navigation/routes";
import {
  LAYERS, duplicateNames, globRegExp, inversions, layerOf, loadChecks, inferEdges, loadUnseenContents, reachability, sameNamedFiles,
  type ChecksData, type Layer,
} from "~/features/checks/checks";

// Three questions to answer before a restructure moves anything: which
// imports point the wrong way, what nothing uses, and what is written twice.

const store = useDataStore();
const route = useRoute();
const router = useRouter();

const { data, loading, error, codeFiles, production: readableProd, blindExt, coverageShare, inferred, edges } = useFileGraph();
const readable = codeFiles;

// Tabs, kept in the URL so a finding can be linked.
const TABS = [
  { id: "layers", label: "Layers", title: "Imports that point from a lower layer up into a higher one", count: () => (loading.value ? null : inversionList.value.reduce((n, i) => n + i.edges.length, 0)) },
  { id: "reach", label: "Reachability", title: "Files no entry point reaches, and files only tests reach", count: () => (loading.value ? null : reach.value.unreachable.length) },
  { id: "dupes", label: "Duplicates", title: "Names declared in several files, and file names used in several folders", count: () => (loading.value ? null : dupNames.value.length) },
] as const;
type Tab = typeof TABS[number]["id"];
const tab = computed<Tab>(() => (TABS.some(t => t.id === route.query.tab) ? route.query.tab as Tab : "layers"));
function setTab(t: Tab) { void router.replace({ query: { ...route.query, tab: t }, hash: route.hash }); }

// Layers.
const offLayers = ref(new Set<string>());
function toggleLayer(id: string) { const s = new Set(offLayers.value); s.has(id) ? s.delete(id) : s.add(id); offLayers.value = s; }
const activeLayers = computed(() => LAYERS.filter(l => !offLayers.value.has(l.id)));
const layerCounts = computed(() => {
  const m = new Map<string, number>();
  for (const f of readableProd.value) { const id = layerOf(f, activeLayers.value)?.id ?? ""; m.set(id, (m.get(id) ?? 0) + 1); }
  return m;
});
const inversionList = computed(() => inversions(edges.value, readableProd.value, activeLayers.value));
const short = (l: Layer) => l.label.replace(/ \(.*\)$/, "").toLowerCase();
const openInv = ref(new Set<string>());
function toggleOpen(k: string) { const s = new Set(openInv.value); s.has(k) ? s.delete(k) : s.add(k); openInv.value = s; }

// Reachability.
const extraDraft = ref(String(route.query.roots ?? ""));
function applyExtra() { const v = extraDraft.value.trim(); void router.replace({ query: { ...route.query, roots: v || undefined }, hash: route.hash }); }
const extraRoots = computed(() => String(route.query.roots ?? "").split("\n").map(s => s.trim()).filter(Boolean).map(globRegExp));
const reach = computed(() => reachability(readable.value, data.value.tests, edges.value, data.value.markers, { extraRoots: extraRoots.value }));
const sumLines = (fs: string[]) => fs.reduce((n, f) => n + (data.value.lines.get(f) ?? 0), 0);

// Duplicates.
const dupNames = computed(() => duplicateNames(data.value.units, readableProd.value));
const dupFiles = computed(() => sameNamedFiles([...readableProd.value]));
const dupLimit = ref(50);
const fileLimit = ref(50);

// Selection: every list feeds the same tray, so a finding becomes a group.
const selected = ref(new Set<string>());
function toggle(p: string) { const s = new Set(selected.value); s.has(p) ? s.delete(p) : s.add(p); selected.value = s; }
watch(() => store.datasetKey, () => { selected.value = new Set(); });

const fmt = (n: number) => n.toLocaleString("en-US");

// Files grouped by folder, with lines and a checkbox each.
const FileList = defineComponent({
  props: {
    files: { type: Array as () => string[], required: true },
    lines: { type: Map as unknown as () => Map<string, number>, required: true },
    selected: { type: Set as unknown as () => Set<string>, required: true },
  },
  emits: ["toggle"],
  setup(props, { emit }) {
    const limit = ref(12);
    const byDir = computed(() => {
      const m = new Map<string, string[]>();
      for (const f of props.files) { const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "."; m.set(d, [...(m.get(d) ?? []), f]); }
      return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    });
    return () => {
      if (!props.files.length) return h("p", { class: "mt-2 text-sm text-neutral-500" }, "None.");
      const dirs = byDir.value.slice(0, limit.value);
      return h("div", { class: "mt-2" }, [
        ...dirs.map(([d, fs]) => h("div", { class: "mt-2", key: d }, [
          h("div", { class: "font-mono text-xs text-neutral-500" }, `${d}/ · ${fs.length}`),
          h("ul", {}, fs.map(f => h("li", { key: f, class: "flex items-center gap-2 py-0.5" }, [
            h(Checkbox, { modelValue: props.selected.has(f), "aria-label": `Select ${f}`, "onUpdate:modelValue": () => emit("toggle", f) }),
            h(RouterLink, { to: filePath(f), class: "truncate font-mono text-sm text-neutral-900 hover:underline", title: f }, () => f.slice(f.lastIndexOf("/") + 1)),
            h("span", { class: "is-num ml-auto text-xs text-neutral-500" }, `${(props.lines.get(f) ?? 0).toLocaleString("en-US")} lines`),
          ]))),
        ])),
        byDir.value.length > limit.value
          ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-2", onClick: () => { limit.value += 20; } }, `Show more folders (${byDir.value.length - limit.value} left)`)
          : null,
      ]);
    };
  },
});
</script>
