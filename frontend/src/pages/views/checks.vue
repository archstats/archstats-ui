<template>
  <ViewWorkspaceLayout
    title="Structure checks"
    :queryable="false"
    :tabs="PANEL"
    active-tab="findings"
    v-model:is-sidebar-open="panelOpen"
    sidebar-width="380px"
  >
    <template #stats>
      <span v-if="data.files.length">Files <span class="text-neutral-800">{{ fmt(readableProd.size) }}</span></span>
      <span v-if="data.files.length" class="text-neutral-300">·</span>
      <span v-if="data.files.length">Imports <span class="text-neutral-800">{{ fmt(edges.length) }}</span></span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Check">
        <button v-for="t in TABS" :key="t.id" type="button" :aria-pressed="tab === t.id" :title="t.title" @click="setTab(t.id)">
          {{ t.label }}<span v-if="t.count() != null" class="ml-1.5 font-mono text-neutral-500">{{ fmt(t.count()!) }}</span>
        </button>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading the import graph…"/>
      <EmptyState v-else-if="error" icon="alert" title="Could not read the snapshot" :text="error"/>
      <EmptyState v-else-if="!data.edges.length" icon="network" title="No file imports recorded" text="This snapshot has no file-level import graph, so there is nothing to check. Rescan with a current engine."/>

      <div v-else class="flex min-h-0 grow flex-col">
        <!-- ── Layers: the stack, and where each layer lives ── -->
        <div v-if="tab === 'layers'" class="flex min-h-0 grow">
          <section class="flex w-[440px] shrink-0 flex-col overflow-y-auto px-4 pb-6 pt-3 hairline-r" aria-label="How the layers use each other">
            <div class="flex items-baseline gap-2">
              <h3 class="text-base font-semibold text-neutral-900">How the layers use each other</h3>
            </div>
            <p class="mt-1 text-sm text-neutral-600">A layer may use the ones below it. <span class="font-medium text-red-700">Red</span> climbs the stack: code that was meant to sit lower reaches up.</p>
            <StackDiagram
              class="mt-3"
              :floors="layerFloors"
              :flows="layerFlows"
              :selected="stackSel"
              up-label="points up"
              aria-label="Layers as floors, with the imports between them"
              @select="onStackSelect"
            />
            <div v-if="offLayers.size || (layerCounts.get('') ?? 0)" class="mt-4 flex flex-col gap-2 text-sm text-neutral-600">
              <p v-if="layerCounts.get('')"><span class="font-mono text-neutral-800">{{ fmt(layerCounts.get("") ?? 0) }}</span> files name no layer and sit outside the stack.</p>
              <div v-if="offLayers.size" class="flex flex-wrap items-center gap-1.5">
                <span class="text-neutral-500">Not read as layers here:</span>
                <button v-for="l in LAYERS.filter(x => offLayers.has(x.id))" :key="l.id" type="button" class="ui-chip is-muted" :title="`Read ${short(l)} as a layer again`" @click="toggleLayer(l.id)">
                  {{ short(l) }}<Icon icon="rotate" :size="11" class="ml-1"/>
                </button>
              </div>
            </div>
          </section>
          <section class="flex min-w-0 grow flex-col" aria-label="Where each layer lives">
            <div class="flex h-9 shrink-0 items-center gap-3 px-3 hairline-b">
              <h3 class="ui-section-title shrink-0">Where each layer lives</h3>
              <span class="flex min-w-0 items-center gap-1.5 truncate text-xs text-neutral-600"><span class="h-2 w-2 shrink-0 rounded-sm bg-neutral-200"/>No layer</span>
            </div>
            <div class="min-h-0 grow p-2">
              <FolderMap
                :files="prodList" :lines="data.lines" :paint="layerPaint" :highlight="layerHighlight" :selected="mapSel?.path ?? null"
                :describe="f => layerOf(f, activeLayers)?.label ?? 'names no layer'"
                aria-label="Production files by folder, coloured by the layer they announce"
                @select="onMapSelect" @open="openFile"
              />
            </div>
          </section>
        </div>

        <!-- ── Reachability and duplicates: the map carries the finding ── -->
        <section v-else class="flex min-h-0 grow flex-col" :aria-label="tab === 'reach' ? 'What the entry points reach' : 'Names written twice'">
          <div class="flex h-9 shrink-0 items-center gap-1 px-3 hairline-b">
            <template v-if="tab === 'reach'">
              <button
                v-for="s in REACH_STATES" :key="s.id" type="button"
                class="flex h-6 items-center gap-1.5 rounded px-2 text-xs"
                :class="reachFilter === s.id ? 'bg-accent-50 text-neutral-900 ring-1 ring-inset ring-accent-300' : 'text-neutral-600 hover:bg-neutral-100'"
                :aria-pressed="reachFilter === s.id" :title="s.title"
                @click="reachFilter = reachFilter === s.id ? null : s.id"
              >
                <span class="h-2 w-2 rounded-sm" :style="{ background: s.color }"/>{{ s.label }}
                <span class="font-mono text-neutral-500">{{ fmt(reachCount(s.id)) }}</span>
              </button>
            </template>
            <template v-else>
              <span class="flex items-center gap-1.5 px-2 text-xs text-neutral-600"><span class="h-2 w-2 rounded-sm" :style="{ background: DUP_NAME }"/>Declares a name another file declares</span>
              <span class="flex items-center gap-1.5 px-2 text-xs text-neutral-600"><span class="h-2 w-2 rounded-sm" :style="{ background: DUP_FILE }"/>Shares its file name</span>
            </template>
            <span v-if="mapSel" class="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-neutral-600">
              <span class="min-w-0 truncate font-mono" :title="mapSel.path">{{ mapSel.path }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear the folder" @click="mapSel = null"><Icon icon="x" :size="12"/></button>
            </span>
          </div>
          <div class="min-h-0 grow p-2">
            <FolderMap
              v-if="tab === 'reach'"
              :files="prodList" :lines="data.lines" :paint="reachPaint" :highlight="reachHighlight" :selected="mapSel?.path ?? null"
              :describe="f => STATE_WORDS[statusOf(f)]"
              aria-label="Production files by folder, coloured by whether an entry point reaches them"
              @select="onMapSelect" @open="openFile"
            />
            <FolderMap
              v-else
              :files="prodList" :lines="data.lines" :paint="dupPaint" :highlight="dupHighlight" :selected="mapSel?.path ?? null" :echo="dupSel?.files ?? null"
              :describe="dupDescribe"
              aria-label="Production files by folder, marking names declared in more than one file"
              @select="onMapSelect" @open="openFile"
            />
          </div>
        </section>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="file" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <!-- ── The inspector: the findings behind the picture ── -->
    <template #tab-findings>
      <template v-if="!loading && data.edges.length">
        <!-- Layers -->
        <template v-if="tab === 'layers'">
          <template v-if="pickedFlow">
            <div>
              <h2 class="text-base font-semibold text-neutral-900">{{ layerName(pickedFlow.from) }} <span class="text-neutral-400">→</span> {{ layerName(pickedFlow.to) }}</h2>
              <p class="mt-1 text-sm" :class="pickedFlow.bad ? 'text-red-700' : 'text-neutral-600'">
                {{ plural(pickedFlow.edges.length, "import") }} from {{ plural(new Set(pickedFlow.edges.map(e => e.from)).size, "file") }}.
                {{ pickedFlow.bad ? `${cap(layerName(pickedFlow.from))} sits lower and should not know ${layerName(pickedFlow.to)}: move the importing code up, or what it needs down.` : "This runs the way the stack allows." }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="ui-btn ui-btn-sm" @click="selected = new Set(pickedFlow.edges.map(e => e.from))">Select importers</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="stackSel = null">Back to all findings</button>
            </div>
            <EdgeList :edges="pickedFlow.edges" @hover="hoverEdge = $event"/>
          </template>

          <template v-else-if="pickedFloor">
            <div>
              <h2 class="text-base font-semibold text-neutral-900">{{ pickedFloor.label }}</h2>
              <p class="mt-1 text-sm text-neutral-600">{{ plural(layerCounts.get(pickedFloor.id) ?? 0, "file") }} announce this layer, by folder name<template v-if="pickedFloor.suffix"> or a class name ending {{ suffixWords(pickedFloor) }}</template>.</p>
            </div>
            <dl class="ui-kv">
              <template v-for="r in floorRows" :key="r.label"><dt>{{ r.label }}</dt><dd :class="r.bad ? 'text-red-700' : ''">{{ fmt(r.count) }}</dd></template>
            </dl>
            <div class="flex items-center gap-2">
              <button type="button" class="ui-btn ui-btn-sm" @click="selected = new Set(prodList.filter(f => layerOf(f, activeLayers)?.id === pickedFloor!.id))">Select its files</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="`The naming says ${short(pickedFloor)} but this codebase means something else by it`" @click="toggleLayer(pickedFloor.id); stackSel = null">Not a layer here</button>
            </div>
          </template>

          <template v-else>
            <div>
              <h2 class="text-base font-semibold text-neutral-900">{{ inversionList.length ? `${plural(inversionTotal, "import")} point up` : "Nothing points up" }}</h2>
              <p class="mt-1 text-sm text-neutral-600">
                <template v-if="inversionList.length">Each is lower code reaching into a layer above it: where a "utility" turns out to be feature code. Pick one to see the imports.</template>
                <template v-else>Every import between named layers runs down the stack. The map shows whether the layers also sit where their names say.</template>
              </p>
            </div>
            <ul v-if="inversionList.length" class="flex flex-col">
              <li v-for="inv in inversionList" :key="inv.from.id + inv.to.id">
                <button type="button" class="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-neutral-200/60" @click="stackSel = { kind: 'flow', id: `${inv.from.id}>${inv.to.id}` }">
                  <span class="min-w-0 truncate text-neutral-900">{{ short(inv.from) }} <span class="text-neutral-400">→</span> {{ short(inv.to) }}</span>
                  <span class="ml-auto font-mono text-xs text-red-700">{{ fmt(inv.edges.length) }}</span>
                </button>
              </li>
            </ul>
            <div>
              <h3 class="ui-section-title">Layers read from the names</h3>
              <ul class="mt-1 flex flex-col">
                <li v-for="f in layerFloors" :key="f.id">
                  <button type="button" class="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-neutral-200/60" @click="stackSel = { kind: 'floor', id: f.id }">
                    <span class="h-2 w-2 shrink-0 rounded-sm" :style="{ background: f.color }"/>
                    <span class="min-w-0 truncate text-neutral-800">{{ f.label }}</span>
                    <span class="ml-auto font-mono text-xs text-neutral-500">{{ fmt(f.weight) }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </template>

        <!-- Reachability -->
        <template v-else-if="tab === 'reach'">
          <div>
            <h2 class="text-base font-semibold text-neutral-900">{{ plural(reachScoped.unreachable.length, "file") }} reached by nothing</h2>
            <p class="mt-1 text-sm text-neutral-600">
              {{ fmt(sumLines(reachScoped.unreachable)) }} lines no entry point imports<template v-if="reachScoped.testOnly.length">, and {{ plural(reachScoped.testOnly.length, "file") }} only tests keep alive</template><template v-if="mapSel"> in <span class="font-mono text-neutral-800">{{ mapSel.path }}</span></template>.
              Candidates, not verdicts: reflection, string lookups and config wiring are invisible here.
            </p>
          </div>
          <FileGroups title="Reached by nothing" :files="reachScoped.unreachable" :lines="data.lines" :selected="selected" @toggle="toggle" @select-all="fs => selected = new Set(fs)" @open="openFile" @hover="hoverFile = $event"/>
          <FileGroups title="Reached only by tests" :files="reachScoped.testOnly" :lines="data.lines" :selected="selected" @toggle="toggle" @select-all="fs => selected = new Set(fs)" @open="openFile" @hover="hoverFile = $event"/>
          <details class="group">
            <summary class="flex h-7 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900">
              <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform group-open:rotate-90"/>
              Entry points <span class="font-mono text-xs text-neutral-500">{{ fmt(reach.roots.size) }}</span>
            </summary>
            <ul class="mt-1 flex flex-col gap-1 text-sm text-neutral-700">
              <li v-for="r in reach.byRule" :key="r.rule.id" class="flex gap-3"><span class="w-10 shrink-0 text-right font-mono text-xs text-neutral-500">{{ fmt(r.files) }}</span><span>{{ r.rule.label }}</span></li>
              <li v-if="!reach.byRule.length" class="text-neutral-500">None found. Add the files your framework calls below.</li>
            </ul>
            <label class="ui-label mt-3 block" for="extra-roots">More entry points, one glob per line</label>
            <textarea id="extra-roots" v-model="extraDraft" rows="3" class="ui-input mt-1 h-auto min-h-[64px] w-full py-1.5 font-mono text-xs" placeholder="src/workers/**&#10;**/*.stories.ts" spellcheck="false" @blur="applyExtra"/>
          </details>
        </template>

        <!-- Duplicates -->
        <template v-else>
          <div>
            <h2 class="text-base font-semibold text-neutral-900">{{ plural(dupNamesScoped.length, "name") }} declared more than once</h2>
            <p class="mt-1 text-sm text-neutral-600">A rule written twice, or two things that deserve different names. Pick one to tie its files together on the map. Common names (main, init, Props) are left out.</p>
          </div>
          <DupList title="Declared in several files" :items="dupNamesScoped" :picked="dupSel" @pick="pickDup" @select="fs => selected = new Set(fs)" @open="openFile"/>
          <DupList title="Same file name, several folders" :items="dupFilesScoped" :picked="dupSel" @pick="pickDup" @select="fs => selected = new Set(fs)" @open="openFile"/>
        </template>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, type PropType } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import FolderMap from "~/features/checks/components/FolderMap.vue";
import StackDiagram, { type Floor, type Flow, type StackSelection } from "~/features/checks/components/StackDiagram.vue";
import { filesUnder } from "~/features/checks/folderTree";
import { useDataStore } from "~/features/snapshot/data.store";
import { useFileGraph } from "~/features/checks/useFileGraph";
import { filePath } from "~/features/navigation/routes";
import { LAYERS, duplicateNames, globRegExp, inversions, layerOf, reachability, sameNamedFiles, type Duplicate, type FileEdge, type Layer } from "~/features/checks/checks";

// Three questions to answer before a restructure moves anything: which
// imports point the wrong way, what nothing uses, and what is written twice.
// Each is drawn on the codebase's own folders, so a finding is a place.

const store = useDataStore();
const route = useRoute();
const router = useRouter();

const { data, loading, error, codeFiles, production: readableProd, edges } = useFileGraph();
const prodList = computed(() => [...readableProd.value]);

const PANEL = [{ id: "findings", label: "Findings" }];
const panelOpen = ref(true);

const TABS = [
  { id: "layers", label: "Layers", title: "Imports that point from a lower layer up into a higher one", count: () => (loading.value ? null : inversionTotal.value) },
  { id: "reach", label: "Reachability", title: "Files no entry point reaches, and files only tests reach", count: () => (loading.value ? null : reach.value.unreachable.length) },
  { id: "dupes", label: "Duplicates", title: "Names declared in several files, and file names used in several folders", count: () => (loading.value ? null : dupNames.value.length) },
] as const;
type Tab = typeof TABS[number]["id"];
const tab = computed<Tab>(() => (TABS.some(t => t.id === route.query.tab) ? route.query.tab as Tab : "layers"));
function setTab(t: Tab) { mapSel.value = null; void router.replace({ query: { ...route.query, tab: t }, hash: route.hash }); }

// ── Map selection, shared by every check ──
const mapSel = ref<{ path: string; kind: "file" | "folder" } | null>(null);
function onMapSelect(path: string | null, kind: "file" | "folder") {
  if (!path) { mapSel.value = null; return; }
  if (kind === "file" && tab.value !== "layers") { toggle(path); return; }
  mapSel.value = mapSel.value?.path === path ? null : { path, kind };
}
const underSel = (fs: string[]) => (mapSel.value ? filesUnder(mapSel.value.path, fs) : fs);
function openFile(f: string) { void router.push(filePath(f)); }

// ── Layers ──
const offLayers = ref(new Set<string>());
function toggleLayer(id: string) { const s = new Set(offLayers.value); s.has(id) ? s.delete(id) : s.add(id); offLayers.value = s; }
const activeLayers = computed(() => LAYERS.filter(l => !offLayers.value.has(l.id)));
const layerCounts = computed(() => {
  const m = new Map<string, number>();
  for (const f of readableProd.value) { const id = layerOf(f, activeLayers.value)?.id ?? ""; m.set(id, (m.get(id) ?? 0) + 1); }
  return m;
});
const inversionList = computed(() => inversions(edges.value, readableProd.value, activeLayers.value));
const inversionTotal = computed(() => inversionList.value.reduce((n, i) => n + i.edges.length, 0));
const short = (l: Layer) => l.label.replace(/ \(.*\)$/, "");
const layerName = (id: string) => { const l = LAYERS.find(x => x.id === id); return l ? short(l).toLowerCase() : id; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const suffixWords = (l: Layer) => (l.suffix?.source.match(/\(([^)]*)\)/)?.[1] ?? "").split("|").slice(0, 3).join(", ");

// An ordered ramp: the stack's top is the deepest blue, its bottom the palest.
// Steps are spread over the whole ramp, so four floors read as four blues.
const RAMP = [800, 700, 600, 500, 400, 300, 200];
const layerColor = computed(() => {
  const present = activeLayers.value.filter(l => (layerCounts.value.get(l.id) ?? 0) > 0).sort((a, b) => b.rank - a.rank);
  const step = (i: number) => RAMP[present.length < 2 ? 0 : Math.round((i * (RAMP.length - 1)) / (present.length - 1))];
  return new Map(present.map((l, i) => [l.id, `rgb(var(--c-blue-${step(i)}))`]));
});
const NO_LAYER = "rgb(var(--c-neutral-200))";

/** Every import between two layers, by pair: down the stack, and up it. */
const layerPairs = computed(() => {
  const by = new Map<string, FileEdge[]>();
  const cache = new Map<string, Layer | null>();
  const of = (f: string) => { if (!cache.has(f)) cache.set(f, layerOf(f, activeLayers.value)); return cache.get(f)!; };
  for (const e of edges.value) {
    if (!readableProd.value.has(e.from) || !readableProd.value.has(e.to)) continue;
    const a = of(e.from), b = of(e.to);
    if (!a || !b || a.id === b.id) continue;
    const k = `${a.id}>${b.id}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(e);
  }
  return by;
});
const layerFloors = computed<Floor[]>(() => activeLayers.value
  .filter(l => (layerCounts.value.get(l.id) ?? 0) > 0)
  .sort((a, b) => b.rank - a.rank)
  .map(l => ({ id: l.id, label: short(l), sub: `${fmt(layerCounts.value.get(l.id) ?? 0)} files`, weight: layerCounts.value.get(l.id) ?? 0, color: layerColor.value.get(l.id) })));
const layerFlows = computed<Flow[]>(() => [...layerPairs.value].map(([key, es]) => {
  const [a, b] = key.split(">");
  const ra = LAYERS.find(l => l.id === a)!.rank, rb = LAYERS.find(l => l.id === b)!.rank;
  return { key, from: a, to: b, count: es.length, bad: rb > ra, title: `${layerName(a)} uses ${layerName(b)}: ${plural(es.length, "import")}` };
}));

const stackSel = ref<StackSelection>(null);
function onStackSelect(s: StackSelection) {
  stackSel.value = s && stackSel.value?.kind === s.kind && stackSel.value.id === s.id ? null : s;
  panelOpen.value = true;
}
const pickedFlow = computed(() => {
  const s = stackSel.value;
  if (s?.kind !== "flow") return null;
  const es = layerPairs.value.get(s.id);
  if (!es) return null;
  const [from, to] = s.id.split(">");
  return { from, to, edges: es, bad: LAYERS.find(l => l.id === to)!.rank > LAYERS.find(l => l.id === from)!.rank };
});
const pickedFloor = computed(() => (stackSel.value?.kind === "floor" ? activeLayers.value.find(l => l.id === stackSel.value!.id) ?? null : null));
const floorRows = computed(() => {
  const l = pickedFloor.value;
  if (!l) return [];
  const rows: Array<{ label: string; count: number; bad: boolean }> = [];
  for (const [k, es] of layerPairs.value) {
    const [a, b] = k.split(">");
    if (a === l.id) rows.push({ label: `Uses ${layerName(b)}`, count: es.length, bad: LAYERS.find(x => x.id === b)!.rank > l.rank });
    if (b === l.id) rows.push({ label: `Used by ${layerName(a)}`, count: es.length, bad: l.rank > LAYERS.find(x => x.id === a)!.rank });
  }
  return rows.sort((x, y) => Number(y.bad) - Number(x.bad) || y.count - x.count);
});
watch(offLayers, () => { stackSel.value = null; });

const hoverEdge = ref<FileEdge | null>(null);
const layerPaint = (f: string) => layerColor.value.get(layerOf(f, activeLayers.value)?.id ?? "") ?? NO_LAYER;
const layerHighlight = computed<Set<string> | null>(() => {
  if (hoverEdge.value) return new Set([hoverEdge.value.from, hoverEdge.value.to]);
  if (pickedFlow.value) return new Set(pickedFlow.value.edges.flatMap(e => [e.from, e.to]));
  if (pickedFloor.value) return new Set(prodList.value.filter(f => layerOf(f, activeLayers.value)?.id === pickedFloor.value!.id));
  return null;
});

// ── Reachability ──
const extraDraft = ref(String(route.query.roots ?? ""));
function applyExtra() { const v = extraDraft.value.trim(); void router.replace({ query: { ...route.query, roots: v || undefined }, hash: route.hash }); }
const extraRoots = computed(() => String(route.query.roots ?? "").split("\n").map(s => s.trim()).filter(Boolean).map(globRegExp));
const reach = computed(() => reachability(codeFiles.value, data.value.tests, edges.value, data.value.markers, { extraRoots: extraRoots.value }));
const sumLines = (fs: string[]) => fs.reduce((n, f) => n + (data.value.lines.get(f) ?? 0), 0);
const unreachSet = computed(() => new Set(reach.value.unreachable));
const testOnlySet = computed(() => new Set(reach.value.testOnly));

type ReachState = "root" | "reached" | "tests" | "none";
const REACH_STATES: Array<{ id: ReachState; label: string; title: string; color: string }> = [
  { id: "root", label: "Entry point", title: "Called by a framework or a program's main, without an import", color: "rgb(var(--c-blue-500))" },
  { id: "reached", label: "Reached", title: "Imported, directly or not, from an entry point", color: "rgb(var(--c-neutral-300))" },
  { id: "tests", label: "Only tests", title: "Only tests import it: kept alive by its tests", color: "rgb(var(--c-amber-400))" },
  { id: "none", label: "Reached by nothing", title: "No entry point and no test reaches it", color: "rgb(var(--c-red-500))" },
];
const STATE_COLOR = Object.fromEntries(REACH_STATES.map(s => [s.id, s.color])) as Record<ReachState, string>;
const STATE_WORDS: Record<ReachState, string> = { root: "an entry point", reached: "reached from an entry point", tests: "reached only by tests", none: "reached by nothing" };
function statusOf(f: string): ReachState {
  if (reach.value.roots.has(f)) return "root";
  if (unreachSet.value.has(f)) return "none";
  if (testOnlySet.value.has(f)) return "tests";
  return "reached";
}
const reachCounts = computed(() => {
  const c: Record<ReachState, number> = { root: 0, reached: 0, tests: 0, none: 0 };
  for (const f of underSel(prodList.value)) c[statusOf(f)]++;
  return c;
});
const reachCount = (s: ReachState) => reachCounts.value[s];
const reachFilter = ref<ReachState | null>(null);
const hoverFile = ref<string | null>(null);
const reachPaint = (f: string) => STATE_COLOR[statusOf(f)];
const reachHighlight = computed<Set<string> | null>(() => {
  if (hoverFile.value) return new Set([hoverFile.value]);
  if (!reachFilter.value) return selected.value.size ? new Set(selected.value) : null;
  return new Set(prodList.value.filter(f => statusOf(f) === reachFilter.value));
});
const reachScoped = computed(() => ({ unreachable: underSel(reach.value.unreachable), testOnly: underSel(reach.value.testOnly) }));

// ── Duplicates ──
const dupNames = computed(() => duplicateNames(data.value.units, readableProd.value));
const dupFiles = computed(() => sameNamedFiles([...readableProd.value]));
const dupNameFiles = computed(() => new Set(dupNames.value.flatMap(d => d.files)));
const dupFileFiles = computed(() => new Set(dupFiles.value.flatMap(d => d.files)));
const DUP_NAME = "rgb(var(--c-violet-500))";
const DUP_FILE = "rgb(var(--c-violet-200))";
const dupPaint = (f: string) => (dupNameFiles.value.has(f) ? DUP_NAME : dupFileFiles.value.has(f) ? DUP_FILE : "rgb(var(--c-neutral-200))");
const dupSel = ref<Duplicate | null>(null);
function pickDup(d: Duplicate) { dupSel.value = dupSel.value?.name === d.name && dupSel.value.files.join() === d.files.join() ? null : d; }
const dupHighlight = computed<Set<string> | null>(() => (dupSel.value ? new Set(dupSel.value.files) : null));
const scopeDups = (ds: Duplicate[]) => (mapSel.value ? ds.filter(d => underSel(d.files).length > 0) : ds);
const dupNamesScoped = computed(() => scopeDups(dupNames.value));
const dupFilesScoped = computed(() => scopeDups(dupFiles.value));
const namesByFile = computed(() => {
  const m = new Map<string, string[]>();
  for (const d of dupNames.value) for (const f of d.files) m.set(f, [...(m.get(f) ?? []), d.name]);
  return m;
});
const dupDescribe = (f: string) => {
  const ns = namesByFile.value.get(f);
  if (ns?.length) return `declares ${ns.slice(0, 3).join(", ")}${ns.length > 3 ? ` +${ns.length - 3}` : ""} elsewhere too`;
  return dupFileFiles.value.has(f) ? "its file name is used in another folder" : "nothing repeated";
};

// ── Selection: every list feeds the same tray, so a finding becomes a group ──
const selected = ref(new Set<string>());
function toggle(p: string) { const s = new Set(selected.value); s.has(p) ? s.delete(p) : s.add(p); selected.value = s; }
watch(() => store.datasetKey, () => { selected.value = new Set(); mapSel.value = null; stackSel.value = null; dupSel.value = null; });

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;
const dirOf = (f: string) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".");
const baseOf = (f: string) => f.slice(f.lastIndexOf("/") + 1);

// The imports behind one arrow: importer, imported, and the names it uses.
const EdgeList = defineComponent({
  props: { edges: { type: Array as PropType<FileEdge[]>, required: true } },
  emits: ["hover"],
  setup(props, { emit }) {
    const limit = ref(60);
    return () => h("div", { class: "flex flex-col" }, [
      h("ul", { class: "flex flex-col" }, props.edges.slice(0, limit.value).map(e => h("li", {
        key: e.from + ">" + e.to,
        class: ["flex cursor-default flex-col gap-0.5 rounded px-2 py-1.5", selected.value.has(e.from) ? "bg-accent-50" : "hover:bg-neutral-200/60"],
        onMouseenter: () => emit("hover", e), onMouseleave: () => emit("hover", null),
        onClick: () => toggle(e.from), onDblclick: () => openFile(e.from),
      }, [
        h("div", { class: "flex min-w-0 items-center gap-1.5 font-mono text-xs" }, [
          h("span", { class: "min-w-0 truncate text-neutral-900", title: e.from }, baseOf(e.from)),
          h("span", { class: "shrink-0 text-neutral-400" }, "→"),
          h("span", { class: "min-w-0 truncate text-neutral-700", title: e.to }, baseOf(e.to)),
        ]),
        h("div", { class: "flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500" }, [
          e.inferred ? h("span", { class: "ui-tag !h-4 !text-[10px]", title: "Read from the file's text: the engine did not parse this file type" }, "text") : null,
          h("span", { class: "min-w-0 truncate font-mono", title: e.names.join(", ") || dirOf(e.from) }, e.names.length ? e.names.join(", ") : dirOf(e.from)),
        ]),
      ]))),
      props.edges.length > limit.value ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1 self-start", onClick: () => { limit.value += 100; } }, `Show more · ${fmt(props.edges.length - limit.value)} left`) : null,
    ]);
  },
});

// Files grouped by folder: a click selects for a group, a double-click opens.
const FileGroups = defineComponent({
  props: {
    title: { type: String, required: true },
    files: { type: Array as PropType<string[]>, required: true },
    lines: { type: Map as unknown as PropType<ReadonlyMap<string, number>>, required: true },
    selected: { type: Set as unknown as PropType<ReadonlySet<string>>, required: true },
  },
  emits: ["toggle", "select-all", "open", "hover"],
  setup(props, { emit }) {
    const limit = ref(8);
    const byDir = computed(() => {
      const m = new Map<string, string[]>();
      for (const f of props.files) m.set(dirOf(f), [...(m.get(dirOf(f)) ?? []), f]);
      return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    });
    return () => h("section", { class: "flex flex-col" }, [
      h("div", { class: "flex h-7 items-center gap-2" }, [
        h("h3", { class: "ui-section-title" }, props.title),
        h("span", { class: "font-mono text-xs text-neutral-500" }, fmt(props.files.length)),
        props.files.length ? h("button", { type: "button", class: "ml-auto text-xs text-neutral-500 hover:text-neutral-900", onClick: () => emit("select-all", props.files) }, "Select all") : null,
      ]),
      !props.files.length ? h("p", { class: "text-sm text-neutral-500" }, "None.") : null,
      ...byDir.value.slice(0, limit.value).map(([d, fs]) => h("div", { key: d, class: "mt-1.5" }, [
        h("div", { class: "truncate px-2 font-mono text-[11px] text-neutral-500", title: d }, `${d}/`),
        h("ul", {}, fs.map(f => h("li", {
          key: f,
          class: ["flex h-7 cursor-default items-center gap-2 rounded px-2", props.selected.has(f) ? "bg-accent-50" : "hover:bg-neutral-200/60"],
          onClick: () => emit("toggle", f), onDblclick: () => emit("open", f),
          onMouseenter: () => emit("hover", f), onMouseleave: () => emit("hover", null),
        }, [
          h("span", { class: "min-w-0 truncate font-mono text-xs text-neutral-900", title: f }, baseOf(f)),
          h("span", { class: "ml-auto shrink-0 font-mono text-[11px] text-neutral-500" }, fmt(props.lines.get(f) ?? 0)),
        ]))),
      ])),
      byDir.value.length > limit.value ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1 self-start", onClick: () => { limit.value += 20; } }, `Show more folders · ${fmt(byDir.value.length - limit.value)} left`) : null,
    ]);
  },
});

// Repeated names: a click ties the files together on the map.
const DupList = defineComponent({
  props: {
    title: { type: String, required: true },
    items: { type: Array as PropType<Duplicate[]>, required: true },
    picked: { type: Object as PropType<Duplicate | null>, default: null },
  },
  emits: ["pick", "select", "open"],
  setup(props, { emit }) {
    const limit = ref(40);
    return () => h("section", { class: "flex flex-col" }, [
      h("div", { class: "flex h-7 items-center gap-2" }, [h("h3", { class: "ui-section-title" }, props.title), h("span", { class: "font-mono text-xs text-neutral-500" }, fmt(props.items.length))]),
      !props.items.length ? h("p", { class: "text-sm text-neutral-500" }, "None.") : null,
      h("ul", { class: "flex flex-col" }, props.items.slice(0, limit.value).map(d => {
        const on = props.picked?.name === d.name && props.picked.files.join() === d.files.join();
        return h("li", { key: d.name + d.files[0] }, [
          h("button", { type: "button", class: ["flex h-7 w-full items-center gap-2 rounded px-2 text-left", on ? "bg-accent-50" : "hover:bg-neutral-200/60"], "aria-expanded": on, onClick: () => emit("pick", d) }, [
            h("span", { class: "min-w-0 truncate font-mono text-xs text-neutral-900" }, d.name),
            h("span", { class: "ml-auto shrink-0 font-mono text-[11px] text-neutral-500" }, `${d.files.length} files`),
          ]),
          on ? h("div", { class: "mb-2 ml-2 flex flex-col border-l border-violet-300 pl-2" }, [
            ...d.files.map(f => h("button", { type: "button", key: f, class: "truncate py-0.5 text-left font-mono text-[11px] text-neutral-700 hover:text-neutral-900 hover:underline", title: `${f} · double-click to open`, onDblclick: () => emit("open", f) }, f)),
            h("button", { type: "button", class: "ui-btn ui-btn-sm mt-1 self-start", onClick: () => emit("select", d.files) }, "Select these files"),
          ]) : null,
        ]);
      })),
      props.items.length > limit.value ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1 self-start", onClick: () => { limit.value += 50; } }, `Show more · ${fmt(props.items.length - limit.value)} left`) : null,
    ]);
  },
});
</script>
