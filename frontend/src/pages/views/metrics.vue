<template>
  <ViewWorkspaceLayout
      title="Metrics"
      v-model:search-query="searchQuery"
    :search-placeholder="grain === 'files' ? 'Find a file' : 'Find a component'"
      v-model:is-sidebar-open="isSidebarOpen"
      v-model:active-tab="activeTab"
      :tabs="inspectorTabs"
      :show-config="true"
      sidebar-width="300px"
  >
    <template #stats>
      <span>{{ grainLabel }} <span class="text-neutral-800">{{ countText }}</span></span>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Grain">
        <button type="button" :aria-pressed="grain === 'components'" @click="grain = 'components'">Components</button>
        <button type="button" :aria-pressed="grain === 'files'" @click="grain = 'files'">Files</button>
      </div>
      <div class="ui-segmented" role="group" aria-label="View">
        <button type="button" :aria-pressed="view === 'table'" @click="view = 'table'">Table</button>
        <button type="button" :aria-pressed="view === 'plot'" @click="view = 'plot'">Plot</button>
      </div>
    </template>

    <template #config-popover>
      <div class="flex flex-col gap-2">
        <span class="ui-label">Table columns</span>
        <StatSelectMulti :key="pickerKey" v-model="visibleColumns" :options="columnOptions"/>
        <button type="button" class="ui-btn ui-btn-sm self-start" @click="resetColumns">Reset to defaults</button>
      </div>
    </template>

    <template #visualizer>
      <!-- Plot controls: a second toolbar row under the frame. -->
      <div v-if="view === 'plot'" class="flex h-10 shrink-0 items-center gap-2 overflow-x-auto px-3 hairline-b">
        <span class="ui-label">X</span>
        <StatSelectSingle v-model="xAxis" :options="numericColumns"/>
        <span class="ui-label">Y</span>
        <StatSelectSingle v-model="yAxis" :options="numericColumns"/>
        <span class="ui-label">R</span>
        <StatSelectSingle v-model="radius" :options="numericColumns" placeholder="None"/>
        <button v-if="radius" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear radius" title="Clear radius" @click="radius = null">
          <Icon icon="x" :size="12"/>
        </button>
        <span class="ui-toolbar-sep"></span>
        <span class="ui-label">Preset</span>
        <SingleSelect :model-value="activePreset?.name ?? null" :options="presetNames" placeholder="Choose" @update:model-value="selectPresetByName"/>
        <span class="ui-toolbar-sep"></span>
        <Checkbox v-model="showNames">Names</Checkbox>
        <span class="ml-auto hidden min-w-0 truncate text-sm text-neutral-500 2xl:inline" title="Drag to box-select · shift-click to toggle · wheel to zoom · alt-drag to pan">Drag to box-select · shift-click to toggle · wheel to zoom · alt-drag to pan</span>
      </div>

      <LoadingState v-if="loading" :text="grain === 'files' ? 'Loading files…' : 'Loading components…'"/>
      <EmptyState
          v-else-if="allRows.length === 0"
          :title="grain === 'files' ? 'No file metrics in this snapshot.' : 'No components in this snapshot.'"
          :text="grain === 'files' ? 'The snapshot has no files table; run a scan with file metrics enabled.' : 'Open a snapshot with at least one component.'"
          icon="table"
      />
      <EmptyState
          v-else-if="filteredRows.length === 0"
          title="Nothing matches."
          :text="scope.isActive ? 'The active scope and search leave nothing to show. Clear one of them.' : 'No name matches the search.'"
          icon="search"
      >
        <button v-if="searchQuery" type="button" class="ui-btn ui-btn-sm" @click="searchQuery = ''">Clear search</button>
        <button v-if="scope.isActive" type="button" class="ui-btn ui-btn-sm" @click="scope.clear()">Clear scope</button>
      </EmptyState>
      <div v-else-if="view === 'table'" class="min-h-0 grow overflow-y-auto px-4 py-3">
        <ElementTable
            :elements="filteredRows"
            :only-show-columns="visibleColumns"
            :clickable-elements="true"
            :selectable-elements="true"
            :show-groups="true"
            :max-page-size="25"
            :name-column="grain === 'files' ? 'File' : 'Component'"
            :export-title="grain === 'files' ? 'Metrics: files' : 'Metrics: components'"
            :initial-sort="visibleColumns?.includes('codesmells__hotspot_score') ? 'codesmells__hotspot_score' : 'name'"
            :key="grain"
            :selected-elements="selectedNames"
            @update:selected-elements="selectedNames = $event"
            @clicked-element="openRow"
        />
      </div>
      <div v-else-if="xAxis && yAxis" class="relative min-h-0 grow p-3">
        <p v-if="abstractnessCaveat" class="pointer-events-none absolute left-1/2 top-4 z-10 max-w-[60ch] -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-center text-xs text-neutral-500 backdrop-blur-sm">{{ abstractnessCaveat }}</p>
        <ComponentPlotterDiagram
            ref="plot"
            class="h-full w-full"
            :rows="filteredRows"
            :domain-rows="allRows"
            :selected="selectedNames"
            :grain="grain === 'files' ? 'file' : 'component'"
            :show-text="showNames"
            :x-axis-property="xAxis"
            :y-axis-property="yAxis"
            :radius-property="radius"
            :hidden-groups="hiddenForPlot"
            :active-filters="activeFilters"
            :hovered-group-id="hoveredGroupId"
            @update:selected="selectedNames = $event"
            @clicked="openRow"
        />
      </div>
      <EmptyState v-else title="Pick two metrics to plot." text="Choose an X and a Y metric above, or a preset." icon="settings"/>

      <GroupActionBar :selected-items="selectedNames" :kind="grain === 'files' ? 'file' : 'component'" @clear="selectedNames = []"/>
    </template>

    <template #visualizer-overlays>
      <ZoomControls v-if="view === 'plot' && filteredRows.length > 0" @zoom-in="plot?.zoomIn()" @zoom-out="plot?.zoomOut()" @reset="plot?.resetZoom()"/>
    </template>

    <template #tab-selection>
      <div class="flex items-center justify-between">
        <h3 class="ui-section-title">Selection <span class="ui-tag ml-1">{{ selectedNames.length }}</span></h3>
        <button v-if="selectedNames.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selectedNames = []">Clear</button>
      </div>
      <p v-if="selectedNames.length === 0" class="text-sm leading-4 text-neutral-500">Nothing selected. Drag a box across the plot or shift-click marks.</p>
      <ul v-else class="-mx-2 flex flex-col">
        <li v-for="name in selectedNames" :key="name">
          <router-link :to="detailRoute(name)" class="flex h-7 items-center rounded px-2 font-mono text-sm text-neutral-800 hover:bg-neutral-100 hover:text-neutral-900" :title="name">
            <span class="truncate">{{ name }}</span>
          </router-link>
        </li>
      </ul>
    </template>

    <template #tab-legend>
      <div class="flex items-center justify-between">
        <h3 class="ui-section-title">Groups</h3>
        <button v-if="activeFilters.size > 0 || hiddenGroups.size > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="activeFilters.clear(); hiddenGroups.clear()">Clear</button>
      </div>
      <p v-if="grainGroups.length === 0" class="text-sm leading-4 text-neutral-500">No groups yet. Select marks and use Add to group.</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
            v-for="group in grainGroups"
            :key="group.id"
            type="button"
            class="ui-chip"
            :class="{ 'is-muted': hiddenGroups.has(group.id), 'is-active': !hiddenGroups.has(group.id) && activeFilters.has(group.id) }"
            :title="hiddenGroups.has(group.id) ? 'Show group' : 'Click to filter to this group'"
            @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
            @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
            @mouseleave="hoveredGroupId = null"
        >
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: group.color }" :class="hiddenGroups.has(group.id) ? 'opacity-30' : ''"></span>
          <span :class="hiddenGroups.has(group.id) ? 'line-through' : ''">{{ group.name }}</span>
          <span class="font-mono text-xs text-neutral-500">{{ group.members.length }}</span>
          <span v-if="!hiddenGroups.has(group.id)" class="ml-0.5 text-neutral-400 hover:text-neutral-700" title="Hide group" @click.stop="toggleGroupVisibility(group.id)"><Icon icon="x" :size="11"/></span>
        </button>
      </div>
      <p class="text-sm leading-4 text-neutral-500">Marks take the colour of their group; a mark in several groups is striped. Click a chip to filter, hover to highlight.</p>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { componentPath } from "~/utils/routes";
import { computed, reactive, ref, watch } from "vue";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import ElementTable from "~/components/ui/tables/ElementTable.vue";
import StatSelectMulti from "~/components/ui/stat-select/StatSelectMulti.vue";
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue";
import SingleSelect from "~/components/ui/common/SingleSelect.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import ZoomControls from "~/components/ui/common/ZoomControls.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import ComponentPlotterDiagram from "~/components/components/plotter/ComponentPlotterDiagram.vue";
import { implicitAbstractionLanguage } from "~/utils/abstraction";
import { useDataStore } from "~/stores/data";
import { useLensStore } from "~/stores/lens";
import { useGroupsStore } from "~/stores/groups";
import { useScopeStore } from "~/stores/scope";
import { useAsyncQuery } from "~/composables/useAsyncQuery";

// Metrics: every number for every component or file, as a table or a plot.
// One grain switch, one filter (scope + search), one column picker, one
// selection shared by both representations.

type Row = { name: string; [key: string]: any };
type Grain = "components" | "files";
type View = "table" | "plot";

const store = useDataStore();
const groupsStore = useGroupsStore();
const scope = useScopeStore();
const route = useRoute();
const router = useRouter();

// ─── State from the URL ───
const grain = ref<Grain>(route.query.grain === "files" ? "files" : "components");
const view = ref<View>(route.query.view === "plot" ? "plot" : "table");
let pendingPreset: string | null = typeof route.query.preset === "string" ? route.query.preset : null;

const searchQuery = ref(typeof route.query.q === "string" ? route.query.q : "");
const isSidebarOpen = ref(true);
const activeTab = ref("selection");
const inspectorTabs = computed(() => (view.value === "plot" ? [{ id: "selection", label: "Selection" }, { id: "legend", label: "Legend" }] : []));

// ─── Rows ───
const HIDDEN_COLUMNS = new Set(["report_id", "report_timestamp", "timestamp", "name", "connections"]);

// Files load once per snapshot, and only after the grain is first switched to files.
const filesRequested = ref(grain.value === "files");
watch(grain, (g) => { if (g === "files") filesRequested.value = true; });

const filesQuery = useAsyncQuery<{ rows: Row[]; columns: string[] }>(async () => {
  if (!filesRequested.value || !store.hasView("files")) return { rows: [], columns: [] };
  const cols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('files') ORDER BY 1");
  const rows = await store.query<Row>("SELECT * FROM files");
  return { rows, columns: cols.map((c) => c.name).filter((c) => !HIDDEN_COLUMNS.has(c)) };
}, [filesRequested], { initial: { rows: [], columns: [] } });

const loading = computed(() => grain.value === "files" && filesQuery.loading.value);

const allRows = computed<Row[]>(() => (grain.value === "files" ? filesQuery.data.value.rows : (store.allComponents as Row[])));

const scopedRows = computed<Row[]>(() => {
  if (!scope.isActive) return allRows.value;
  return grain.value === "files"
      ? allRows.value.filter((r) => scope.fileInScope(r.name, r.component))
      : allRows.value.filter((r) => scope.componentInScope(r.name));
});

const filteredRows = computed<Row[]>(() => {
  const q = searchQuery.value.trim();
  if (!q) return scopedRows.value;
  let test: (name: string) => boolean;
  try {
    const re = new RegExp(q, "i");
    test = (name) => re.test(name);
  } catch {
    const lower = q.toLowerCase();
    test = (name) => name.toLowerCase().includes(lower);
  }
  return scopedRows.value.filter((r) => test(String(r.name ?? "")));
});

const grainLabel = computed(() => (grain.value === "files" ? "Files" : "Components"));
const countText = computed(() =>
    scope.isActive || searchQuery.value.trim() ? `${filteredRows.value.length} of ${allRows.value.length}` : `${allRows.value.length}`,
);

// ─── Columns ───
const columnOptions = computed<string[]>(() =>
    grain.value === "files" ? filesQuery.data.value.columns : store.getDistinctComponentColumns.filter((c) => !HIDDEN_COLUMNS.has(c)),
);

// Columns that hold a number somewhere in the loaded rows: the plot's axes.
const numericColumns = computed<string[]>(() => {
  const rows = allRows.value;
  if (rows.length === 0) return columnOptions.value;
  const sample = rows.slice(0, 200);
  return columnOptions.value.filter((c) => sample.some((r) => typeof r[c] === "number" && Number.isFinite(r[c])));
});

const DEFAULT_COLUMNS: Record<Grain, string[]> = {
  components: [
    "complexity__files", "complexity__lines", "codesmells__code_health", "codesmells__hotspot_score",
    "modularity__coupling__afferent", "modularity__coupling__efferent", "modularity__instability", "git__commits__total",
  ],
  files: ["complexity__lines", "codesmells__code_health", "codesmells__hotspot_score", "git__commits__total", "git__authors__total", "component"],
};

const storageKey = (g: Grain) => `archstats-metrics-columns-${g}`;

function loadStoredColumns(g: Grain): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(g));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

// null means "never chosen": fall back to the grain's defaults.
const chosenColumns = reactive<Record<Grain, string[] | null>>({
  components: loadStoredColumns("components"),
  files: loadStoredColumns("files"),
});

const visibleColumns = computed<string[]>({
  get() {
    const available = new Set(columnOptions.value);
    const chosen = chosenColumns[grain.value];
    const base = chosen ?? DEFAULT_COLUMNS[grain.value];
    return base.filter((c) => available.has(c));
  },
  set(cols) {
    chosenColumns[grain.value] = cols;
    try {
      localStorage.setItem(storageKey(grain.value), JSON.stringify(cols));
    } catch { /* storage unavailable; the choice lives for the session */ }
  },
});

const pickerReset = ref(0);
// StatSelectMulti reads its model once, so re-key it when the grain, the
// available columns or a reset change what it should show.
const pickerKey = computed(() => `${grain.value}:${columnOptions.value.length}:${pickerReset.value}`);

function resetColumns() {
  chosenColumns[grain.value] = null;
  try {
    localStorage.removeItem(storageKey(grain.value));
  } catch { /* nothing stored */ }
  pickerReset.value++;
}

// ─── Plot axes and presets ───
const xAxis = ref<string | null>(null);
const yAxis = ref<string | null>(null);
const radius = ref<string | null>(null);
const showNames = ref(false);

interface Preset { id: string; name: string; x: string; y: string; r?: string }

const ALL_PRESETS: Preset[] = [
  { id: "dms", name: "Distance to Main Sequence (DMS)", x: "modularity__instability", y: "modularity__abstractness", r: "complexity__lines" },
  { id: "dms-changes", name: "DMS vs Code Changes", x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "age-churn-dms", name: "Age vs Churn vs DMS", x: "git__age_in_days", y: "git__commits__total", r: "modularity__distance_main_sequence" },
  { id: "betweenness-churn", name: "Betweenness vs Churn", x: "graph__betweenness", y: "git__commits__total" },
  { id: "betweenness-avg-indentation", name: "Betweenness vs Avg. Indentation", x: "graph__betweenness", y: "complexity__indentation__avg" },
  { id: "betweenness-max-indentation", name: "Betweenness vs Max Indentation", x: "graph__betweenness", y: "complexity__indentation__max" },
  { id: "avg-indentation-lines", name: "Avg. Indentation vs Line Count", x: "complexity__indentation__avg", y: "complexity__lines" },
  { id: "max-indentation-lines", name: "Max Indentation vs Line Count", x: "complexity__indentation__max", y: "complexity__lines" },
  { id: "dms-betweenness", name: "DMS vs Betweenness", x: "modularity__instability", y: "modularity__abstractness", r: "graph__betweenness" },
  { id: "dms-churn", name: "DMS vs Churn", x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "authors-churn", name: "Authors vs Churn", x: "git__authors__total", y: "git__commits__total" },
  { id: "churn-health", name: "Churn against health", x: "git__commits__total", y: "codesmells__code_health", r: "complexity__lines" },
  { id: "churn-complexity", name: "Churn against complexity", x: "git__commits__total", y: "codesmells__static_complexity_score", r: "complexity__lines" },
];

const presets = computed<Preset[]>(() => {
  const have = new Set(numericColumns.value);
  return ALL_PRESETS.filter((p) => have.has(p.x) && have.has(p.y) && (!p.r || have.has(p.r)));
});
const presetNames = computed(() => presets.value.map((p) => p.name));

const activePreset = computed<Preset | null>(() =>
    presets.value.find((p) => p.x === xAxis.value && p.y === yAxis.value && (p.r ?? null) === (radius.value ?? null)) ?? null,
);

function selectPreset(preset: Preset) {
  xAxis.value = preset.x;
  yAxis.value = preset.y;
  radius.value = preset.r ?? null;
}

function selectPresetByName(name: string) {
  const preset = presets.value.find((p) => p.name === name);
  if (preset) selectPreset(preset);
}

// ─── Abstractness where the language declares none ───
// Python, plain JavaScript and Ruby have no abstract types to count, so every
// component reads abstractness 0 and distance 1 - instability. A main-sequence
// chart of such a codebase is a row of dots on the floor; it opens on churn
// against health instead, and says why if someone picks one anyway.
const ABSTRACTNESS_KEYS = new Set(["modularity__abstractness", "modularity__distance_main_sequence"]);
const implicitLanguage = computed(() => {
  const files: string[] = [];
  for (const list of (store.componentFilesIndex as Map<string, string[]>).values()) files.push(...list);
  return implicitAbstractionLanguage(files);
});
const usesAbstractness = (p: { x: string | null; y: string | null; r?: string | null }) =>
  [p.x, p.y, p.r].some((k) => !!k && ABSTRACTNESS_KEYS.has(k));
const abstractnessCaveat = computed(() => {
  const lang = implicitLanguage.value;
  if (!lang || grain.value !== "components" || !usesAbstractness({ x: xAxis.value, y: yAxis.value, r: radius.value })) return "";
  return `${lang} has no abstract types to count, so abstractness is 0 for every component here and distance from the main sequence is only instability turned around.`;
});

// Axes that no longer exist at this grain fall back to a preset or the first two metrics.
watch([grain, numericColumns], () => {
  const have = new Set(numericColumns.value);
  if (have.size === 0) return;
  if (pendingPreset) {
    const preset = presets.value.find((p) => p.id === pendingPreset);
    pendingPreset = null;
    if (preset) { selectPreset(preset); return; }
  }
  const xOk = xAxis.value !== null && have.has(xAxis.value);
  const yOk = yAxis.value !== null && have.has(yAxis.value);
  if (radius.value !== null && !have.has(radius.value)) radius.value = null;
  if (xOk && yOk) return;
  const opening = grain.value === "components" && !implicitLanguage.value ? "dms" : "churn-health";
  const fallback = presets.value.find((p) => p.id === opening) ?? presets.value.find((p) => !usesAbstractness(p)) ?? presets.value[0];
  if (fallback) { selectPreset(fallback); return; }
  const cols = numericColumns.value;
  xAxis.value = cols[0];
  yAxis.value = cols[1] ?? cols[0];
  radius.value = null;
}, { immediate: true });

// ─── URL sync ───
watch([grain, view, activePreset], () => {
  const want = {
    grain: grain.value === "files" ? "files" : undefined,
    view: view.value === "plot" ? "plot" : undefined,
    preset: activePreset.value?.id,
  };
  const cur = route.query;
  const same = (Object.keys(want) as Array<keyof typeof want>).every((k) => (cur[k] ?? undefined) === want[k]);
  if (!same) router.replace({ query: { ...cur, ...want } });
});

// Sidebar or history changes to the query re-enter the view without a remount.
watch(() => route.query, (q) => {
  if (typeof q.q === "string" && q.q !== searchQuery.value) searchQuery.value = q.q;
  const g: Grain = q.grain === "files" ? "files" : "components";
  const v: View = q.view === "plot" ? "plot" : "table";
  if (g !== grain.value) grain.value = g;
  if (v !== view.value) view.value = v;
  if (typeof q.preset === "string" && q.preset !== activePreset.value?.id) {
    const preset = presets.value.find((p) => p.id === q.preset);
    if (preset) selectPreset(preset);
    else pendingPreset = q.preset;
  }
});

// ─── Selection and navigation ───
const selectedNames = ref<string[]>([]);
watch(grain, () => { selectedNames.value = []; });

function detailRoute(name: string): string {
  return grain.value === "files" ? `/views/files/${name}` : componentPath(name);
}

function openRow(row: Row) {
  router.push(detailRoute(String(row.name)));
}

const plot = ref<InstanceType<typeof ComponentPlotterDiagram> | null>(null);

// ─── Group legend ───
const lens = useLensStore();
const grainGroups = computed(() => groupsStore.groups.filter(g => !lens.active || g.dimension === lens.active));
// Marks colour by the lens dimension only; other dimensions stay hidden from the plot.
const hiddenForPlot = computed(() => new Set([...hiddenGroups, ...groupsStore.groups.filter(g => lens.active && g.dimension !== lens.active).map(g => g.id)]));
const hoveredGroupId = ref<string | null>(null);
const activeFilters = reactive(new Set<string>());
const hiddenGroups = reactive(new Set<string>());
watch(grain, () => { activeFilters.clear(); hiddenGroups.clear(); hoveredGroupId.value = null; });

function toggleFilter(groupId: string) {
  if (activeFilters.has(groupId)) activeFilters.delete(groupId);
  else activeFilters.add(groupId);
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.has(groupId)) hiddenGroups.delete(groupId);
  else hiddenGroups.add(groupId);
}
</script>
