<template>
  <div class="flex h-full flex-col overflow-hidden">
    <ViewWorkspaceLayout
      title="Hotspots"
      :nodes-count="units.length"
      :stats-labels="{ nodes: grainLabel }"
      v-model:search-query="searchQuery"
      v-model:is-sidebar-open="sidebarExpanded"
      v-model:active-tab="activeSidebarTab"
      :tabs="[
        { id: 'perspectives', label: 'Perspectives' },
        { id: 'inspector', label: 'Inspector' }
      ]"
      :show-config="false"
      sidebar-width="340px"
    >
      <template #stats>
        <span v-if="scoped">of <span class="text-neutral-800">{{ allUnits.length }}</span></span>
      </template>

      <template #switches>
        <div class="ui-segmented" role="group" aria-label="Grain">
          <button v-for="g in GRAINS" :key="g.id" type="button" :aria-pressed="grain === g.id" @click="grain = g.id">{{ g.label }}</button>
        </div>
        <div class="ui-segmented" role="group" aria-label="Layout">
          <button v-for="l in LAYOUTS" :key="l.id" type="button" :aria-pressed="layout === l.id" @click="layout = l.id">{{ l.label }}</button>
        </div>
      </template>

      <template #visualizer>
        <div class="relative flex h-full w-full flex-col overflow-hidden">
          <!-- Group legend -->
          <div v-if="legendGroups.length > 0" class="flex shrink-0 flex-wrap items-center gap-1.5 px-4 py-2 hairline-b">
            <span class="ui-label mr-1">Groups</span>
            <span
              v-for="group in legendGroups"
              :key="group.id"
              class="ui-chip cursor-pointer"
              :class="{ 'is-active': activeFilters.has(group.id), 'is-muted': hiddenGroups.has(group.id) }"
              role="button"
              tabindex="0"
              :aria-pressed="activeFilters.has(group.id)"
              :title="hiddenGroups.has(group.id) ? `Show ${group.name}` : `Filter to ${group.name}`"
              @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
              @keydown.enter.prevent="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
              @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
              @mouseleave="hoveredGroupId = null"
            >
              <span class="h-2 w-2 shrink-0 rounded-full" :class="{ 'opacity-30': hiddenGroups.has(group.id) }" :style="{ backgroundColor: group.color }"></span>
              <span :class="{ 'line-through': hiddenGroups.has(group.id) }">{{ group.name }}</span>
              <span class="font-mono text-xs text-neutral-400">{{ group.members.length }}</span>
              <button
                type="button"
                class="-mr-1 flex h-4 w-4 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900"
                :aria-label="hiddenGroups.has(group.id) ? `Show ${group.name}` : `Hide ${group.name}`"
                :title="hiddenGroups.has(group.id) ? 'Show group' : 'Hide group'"
                @click.stop="toggleGroupVisibility(group.id)"
              >
                <Icon :icon="hiddenGroups.has(group.id) ? 'eye' : 'eye-off'" :size="11"/>
              </button>
            </span>
            <button v-if="activeFilters.size > 0 || hiddenGroups.size > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="activeFilters.clear(); hiddenGroups.clear()">Clear</button>
          </div>

          <!-- Canvas -->
          <div class="relative min-h-0 w-full grow">
            <LoadingState v-if="loading" :text="`Reading ${grainLabel.toLowerCase()}…`"/>
            <EmptyState v-else-if="error" :title="`Could not read ${grainLabel.toLowerCase()}`" :text="error" icon="alert"/>
            <EmptyState
              v-else-if="units.length === 0 && scoped"
              title="Nothing in this scope"
              :text="`Clear the scope to see all ${grainLabel.toLowerCase()}.`"
              icon="filter"
            >
              <button type="button" class="ui-btn ui-btn-sm" @click="scope.clear(); scope.setFacet('all')">Clear scope</button>
            </EmptyState>
            <EmptyState
              v-else-if="units.length === 0"
              :title="`No ${grainLabel.toLowerCase()} in this snapshot`"
              :text="`The scan recorded no ${grainLabel.toLowerCase()} to pack.`"
              icon="flame"
            />
            <EmptyState
              v-else-if="!sizeMetric || !colorMetric"
              title="No metrics to map"
              :text="`The ${grainLabel.toLowerCase()} table has no numeric columns for size and heat.`"
              icon="flame"
            />
            <HotspotsTreemap
              v-else
              ref="treemap"
              :units="units"
              :grain="grain"
              :layout="layout"
              :size-metric="sizeMetric"
              :color-metric="colorMetric"
              :heat-inverted="heatInverted"
              :highlighted-unit="highlightedUnit"
              :label-high="labelHigh"
              :label-low="labelLow"
              :search-query="searchQuery"
              :selected-units="ringSelection"
              :hidden-groups="hiddenForPlot"
              :active-filters="activeFilters"
              :hovered-group-id="hoveredGroupId"
              @select="onSelect"
              @open="openUnit"
              @toggle-selection="toggleSelection"
              @replace-selection="replaceSelection"
            />
            <GroupActionBar
              v-if="grain !== 'directories'"
              :selected-items="ringSelection"
              :kind="grain === 'files' ? 'file' : 'component'"
              @clear="selected = null; multiSelection = []"
            />
          </div>
        </div>
      </template>

      <template #visualizer-overlays>
        <ZoomControls v-if="units.length > 0" @zoom-in="treemap?.zoomIn()" @zoom-out="treemap?.zoomOut()" @reset="treemap?.resetZoom()"/>
      </template>

      <!-- Perspectives -->
      <template #tab-perspectives>
        <div class="flex flex-col gap-1.5">
          <h3 class="ui-section-title">Perspectives</h3>
          <ul class="-mx-2 flex flex-col">
            <li v-for="preset in presets" :key="preset.id">
              <button
                type="button"
                class="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors"
                :class="activePresetId === preset.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
                :aria-pressed="activePresetId === preset.id"
                @click="selectPreset(preset)"
              >
                <Icon :icon="preset.icon" :size="14" class="mt-px shrink-0 text-neutral-500"/>
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium leading-4 text-neutral-900">{{ preset.label }}</span>
                  <span class="mt-0.5 block text-sm leading-4 text-neutral-500">{{ preset.description }}</span>
                  <span class="mt-1 block font-mono text-xs leading-4 text-neutral-500">Size: {{ store.statNiceName(preset.sizeMetric) }} · Heat: {{ store.statNiceName(preset.colorMetric) }}</span>
                </span>
              </button>
              <div v-if="activePresetId === preset.id && preset.windowed && commitWindows.length > 1" class="mb-2 ml-8 mr-2 mt-1 flex flex-col gap-1.5">
                <span class="ui-label">Volatility window</span>
                <div class="ui-segmented w-full" role="group" aria-label="Volatility window">
                  <button v-for="opt in commitWindows" :key="opt.value" type="button" class="flex-1" :aria-pressed="commitWindow === opt.value" @click="commitWindow = opt.value">{{ opt.label }}</button>
                </div>
              </div>
            </li>
            <li>
              <button
                type="button"
                class="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors"
                :class="activePresetId === 'custom' ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
                :aria-pressed="activePresetId === 'custom'"
                @click="customPinned = true"
              >
                <Icon icon="settings" :size="14" class="mt-px shrink-0 text-neutral-500"/>
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium leading-4 text-neutral-900">Custom</span>
                  <span class="mt-0.5 block text-sm leading-4 text-neutral-500">Choose the size and heat metrics yourself.</span>
                </span>
              </button>
              <div v-if="activePresetId === 'custom'" class="mb-2 ml-8 mr-2 mt-1 flex flex-col gap-2">
                <label class="flex flex-col gap-1">
                  <span class="ui-label">Circle size</span>
                  <StatSelectSingle v-model="sizeMetric" :options="columns" class="w-full"/>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="ui-label">Heat</span>
                  <StatSelectSingle v-model="colorMetric" :options="columns" :align-right="true" class="w-full"/>
                </label>
              </div>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-2 pt-3 hairline-t">
          <h3 class="ui-section-title">Reading the chart</h3>
          <dl class="ui-kv">
            <dt>Circle size</dt><dd class="font-sans text-neutral-600">{{ sizeMetric ? store.statNiceName(sizeMetric) : '—' }}</dd>
            <dt>Colour</dt><dd class="font-sans text-neutral-600">{{ colorMetric ? store.statNiceName(colorMetric) : '—' }}{{ heatInverted ? ', low is hot' : '' }}</dd>
            <dt>Outer rings</dt><dd class="font-sans text-neutral-600">{{ layout === 'packed' ? 'Namespaces and saved groups' : 'Saved groups' }}</dd>
            <dt>Grey</dt><dd class="font-sans text-neutral-600">No activity</dd>
          </dl>
          <p class="text-sm leading-4 text-neutral-500">Click selects, double-click opens. Shift-click or shift-drag selects several. Right-click for group actions.</p>
        </div>
      </template>

      <!-- Inspector -->
      <template #tab-inspector>
        <template v-if="selectedUnit">
          <div class="flex flex-col gap-1">
            <span class="ui-label">{{ unitKind }}</span>
            <span class="break-all font-mono text-sm text-neutral-900">{{ selectedUnit.name }}</span>
          </div>
          <dl class="ui-kv">
            <dt>{{ store.statNiceName(sizeMetric) }}</dt>
            <dd>{{ formatNumber(selectedUnit[sizeMetric]) }}</dd>
            <dt>{{ store.statNiceName(colorMetric) }}</dt>
            <dd>{{ formatNumber(selectedUnit[colorMetric]) }}</dd>
            <template v-if="hasColumn('codesmells__code_health')">
              <dt>Code health</dt>
              <dd class="flex items-center justify-end gap-1.5">
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(selectedUnit.codesmells__code_health))"></span>
                <span :class="levelTextClass(healthLevel(selectedUnit.codesmells__code_health))">{{ formatHealth(selectedUnit.codesmells__code_health) }}</span>
              </dd>
            </template>
            <template v-if="hasColumn('codesmells__hotspot_score')">
              <dt>Hotspot score</dt>
              <dd class="flex items-center justify-end gap-1.5">
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(hotspotLevel(selectedUnit.codesmells__hotspot_score))"></span>
                <span :class="levelTextClass(hotspotLevel(selectedUnit.codesmells__hotspot_score))">{{ formatHotspot(selectedUnit.codesmells__hotspot_score) }}</span>
              </dd>
            </template>
            <template v-if="grain === 'directories' && hasColumn('complexity__files')">
              <dt>Files</dt>
              <dd>{{ formatNumber(selectedUnit.complexity__files, 0) }}</dd>
            </template>
            <template v-if="grain === 'files' && selectedUnit.component">
              <dt>Component</dt>
              <dd class="truncate"><router-link :to="componentPath(selectedUnit.component)" class="text-neutral-800 hover:underline">{{ selectedUnit.component }}</router-link></dd>
            </template>
          </dl>
          <div class="flex items-center gap-2">
            <router-link :to="detailRoute(selectedUnit.name)" class="ui-btn ui-btn-sm">
              <Icon :icon="grain === 'directories' ? 'table' : 'arrow-up-right'" :size="13" class="text-neutral-500"/>
              <span>{{ grain === 'directories' ? 'Files in directory' : 'Open' }}</span>
            </router-link>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = null">Deselect</button>
          </div>
        </template>
        <p v-else class="text-sm leading-4 text-neutral-500">Click a circle to inspect it. Double-click opens it.</p>

        <div v-if="callouts.length > 0" class="flex flex-col gap-1.5 pt-3 hairline-t">
          <h3 class="ui-section-title">Callouts</h3>
          <ul class="-mx-2 flex flex-col">
            <li v-for="c in callouts" :key="c.id">
              <button
                type="button"
                class="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-100"
                :class="{ 'bg-accent-50': selected === c.unit.name }"
                @mouseenter="highlightedUnit = c.unit.name"
                @mouseleave="highlightedUnit = null"
                @click="onSelect(c.unit.name)"
                @dblclick="openUnit(c.unit.name)"
              >
                <span class="flex items-center gap-1.5 text-sm">
                  <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(c.level)"></span>
                  <span class="font-medium text-neutral-800">{{ c.title }}</span>
                </span>
                <span class="truncate font-mono text-xs text-neutral-700" :title="c.unit.name">{{ c.unit.name }}</span>
                <span class="font-mono text-xs tabular-nums text-neutral-500">{{ store.statNiceName(sizeMetric) }} {{ formatNumber(c.unit[sizeMetric]) }} · {{ store.statNiceName(colorMetric) }} {{ formatNumber(c.unit[colorMetric]) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </ViewWorkspaceLayout>

    <GroupsGroupActionBar
      v-if="grain !== 'directories'"
      :selected-items="multiSelection"
      :kind="grain === 'files' ? 'file' : 'component'"
      @clear="multiSelection = []"
    />
  </div>
</template>

<script setup lang="ts">
import { LAST_CHANGED, useCodeAge } from "~/composables/useCodeAge"
import { componentPath } from "~/utils/routes"
import { computed, reactive, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useLensStore } from "~/stores/lens"
import { useGroupsStore } from "~/stores/groups"
import { useScopeStore } from "~/stores/scope"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { formatHealth, formatHotspot, healthLevel, hotspotLevel, levelDotClass, levelTextClass, type HealthLevel } from "~/composables/useHealth"
import { formatNumber } from "~/utils/format"
import Icon from "~/components/ui/common/Icon.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import ZoomControls from "~/components/ui/common/ZoomControls.vue"
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue"
import HotspotsTreemap, { type HotspotGrain, type HotspotLayout, type HotspotUnit } from "~/components/components/hotspots/HotspotsTreemap.vue"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"

const store = useDataStore()
const router = useRouter()
const route = useRoute()
const groupsStore = useGroupsStore()
const scope = useScopeStore()

const treemap = ref<InstanceType<typeof HotspotsTreemap> | null>(null)

// ---------------------------------------------------------------------------
// Grain and layout, mirrored into the query string so links survive.

const GRAINS: Array<{ id: HotspotGrain; label: string }> = [
  { id: "components", label: "Components" },
  { id: "directories", label: "Directories" },
  { id: "files", label: "Files" },
]
const LAYOUTS: Array<{ id: HotspotLayout; label: string }> = [
  { id: "packed", label: "Packed" },
  { id: "flat", label: "Flat" },
]

function parseGrain(v: unknown): HotspotGrain {
  return v === "directories" || v === "files" ? v : "components"
}
function parseLayout(v: unknown): HotspotLayout {
  return v === "flat" ? "flat" : "packed"
}

const grain = ref<HotspotGrain>(parseGrain(route.query.grain))
const layout = ref<HotspotLayout>(parseLayout(route.query.layout))
const grainLabel = computed(() => GRAINS.find(g => g.id === grain.value)?.label || "Components")
const unitKind = computed(() => grain.value === "components" ? "Component" : grain.value === "files" ? "File" : "Directory")

watch(() => route.query.grain, v => { const g = parseGrain(v); if (g !== grain.value) grain.value = g })
watch(() => route.query.layout, v => { const l = parseLayout(v); if (l !== layout.value) layout.value = l })
watch([grain, layout], ([g, l]) => {
  const query: Record<string, any> = { ...route.query }
  if (g === "components") delete query.grain; else query.grain = g
  if (l === "packed") delete query.layout; else query.layout = l
  if (query.grain !== route.query.grain || query.layout !== route.query.layout) router.replace({ query })
})

// A detail page can hand over a unit to focus: /hotspots?focus=<name>.
const searchQuery = ref("")
watch(() => route.query.focus, focus => { if (typeof focus === "string" && focus) searchQuery.value = focus }, { immediate: true })

const sidebarExpanded = ref(true)
const activeSidebarTab = ref("perspectives")

// ---------------------------------------------------------------------------
// Rows of the active grain. Components come from the store; directories and
// files are read on demand. The table name is one of three fixed literals.

const { data: queried, loading, error } = useAsyncQuery<HotspotUnit[]>(
  async () => {
    if (grain.value === "components") return []
    const table = grain.value === "directories" ? "directories" : "files"
    return store.query<HotspotUnit>(`SELECT * FROM ${table} ORDER BY name`)
  },
  [grain],
  { initial: [] },
)

const codeAge = useCodeAge()
const allUnits = computed<HotspotUnit[]>(() => {
  const units = grain.value === "components" ? store.allComponents as unknown as HotspotUnit[] : queried.value
  if (grain.value === "directories" || !codeAge.available.value) return units
  const ages = grain.value === "files" ? codeAge.byFile.value : codeAge.byComponent.value
  if (ages.size === 0) return units
  return units.map(u => ({ ...u, [LAST_CHANGED]: ages.get(String((u as any).name)) ?? null }) as HotspotUnit)
})

// Directories are not scoped: a saved group names components or files.
const scoped = computed(() => scope.isActive && grain.value !== "directories")

const units = computed<HotspotUnit[]>(() => {
  const rows = allUnits.value
  if (!scoped.value) return rows
  if (grain.value === "components") return rows.filter(r => scope.componentInScope(r.name))
  return rows.filter(r => scope.fileInScope(r.name, r.component))
})

// Metric columns of the active grain: the store knows the component columns;
// for the other tables read them off the rows.
const columns = computed<string[]>(() => {
  if (!store.hasData) return []
  const age = codeAge.available.value && grain.value !== "directories" ? [LAST_CHANGED] : []
  if (grain.value === "components") return [...(store.getDistinctComponentColumns as string[]), ...age]
  const seen = new Set<string>(age)
  for (const row of queried.value.slice(0, 200)) {
    for (const [key, value] of Object.entries(row)) {
      if (key === "name" || key === "component") continue
      if (typeof value === "number") seen.add(key)
    }
  }
  return Array.from(seen).sort()
})
const hasColumn = (c: string) => columns.value.includes(c)

// ---------------------------------------------------------------------------
// Perspectives: named size/heat pairs detected by exact column ids.

interface HotspotPreset {
  id: string
  label: string
  description: string
  icon: string
  sizeMetric: string
  colorMetric: string
  heatInverted?: boolean
  /** The size stat follows the volatility window. */
  windowed?: boolean
  labelHigh: string
  labelLow: string
}

const COMMIT_WINDOW = /^git__commits__last_(\d+)_days$/

const commitWindows = computed<Array<{ label: string; value: string }>>(() => {
  const out: Array<{ label: string; value: string; days: number }> = []
  if (hasColumn("git__commits__total")) out.push({ label: "All time", value: "git__commits__total", days: Infinity })
  for (const c of columns.value) {
    const m = c.match(COMMIT_WINDOW)
    if (m) out.push({ label: `Last ${m[1]} days`, value: c, days: Number(m[1]) })
  }
  return out.sort((a, b) => a.days - b.days).map(({ label, value }) => ({ label, value }))
})

const commitWindow = ref("git__commits__total")
watch(commitWindows, opts => {
  if (opts.length > 0 && !opts.some(o => o.value === commitWindow.value)) {
    commitWindow.value = opts.find(o => o.value === "git__commits__total")?.value || opts[0].value
  }
}, { immediate: true })

const presets = computed<HotspotPreset[]>(() => {
  const list: HotspotPreset[] = []
  const lines = "complexity__lines"
  if (hasColumn(lines) && hasColumn("codesmells__hotspot_score")) {
    list.push({
      id: "hotspots",
      label: "Hotspots",
      description: "Large units with a high hotspot score, the engine's combined risk signal.",
      icon: "flame",
      sizeMetric: lines,
      colorMetric: "codesmells__hotspot_score",
      labelHigh: "Hottest",
      labelLow: "Coolest",
    })
  }
  if (commitWindows.value.length > 0 && hasColumn("codesmells__code_health")) {
    list.push({
      id: "churn",
      label: "Churn against health",
      description: "Frequently changed units, hot where code health is low. Big and hot is where refactoring pays.",
      icon: "git-commit",
      sizeMetric: commitWindow.value,
      colorMetric: "codesmells__code_health",
      heatInverted: true,
      windowed: true,
      labelHigh: "Churning, unhealthy",
      labelLow: "Churning, healthy",
    })
  }
  if (hasColumn(lines) && hasColumn("modularity__instability")) {
    list.push({
      id: "instability",
      label: "Instability",
      description: "Units that depend on more than depends on them; a change here fans out.",
      icon: "scale",
      sizeMetric: lines,
      colorMetric: "modularity__instability",
      labelHigh: "Most unstable",
      labelLow: "Most stable",
    })
  }
  if (hasColumn(lines) && codeAge.available.value && grain.value !== "directories") {
    list.push({
      id: "age",
      label: "Code age",
      description: "Sized by lines, hot where nothing has changed for longest: the code nobody has touched, and fewer people remember.",
      icon: "history",
      sizeMetric: lines,
      colorMetric: LAST_CHANGED,
      labelHigh: "Untouched longest",
      labelLow: "Changed recently",
    })
  }
  if (hasColumn(lines) && hasColumn("complexity__indentation__max")) {
    list.push({
      id: "nesting",
      label: "Nesting depth",
      description: "Deeply indented logic that is hard to read and to test.",
      icon: "list-tree",
      sizeMetric: lines,
      colorMetric: "complexity__indentation__max",
      labelHigh: "Deepest nesting",
      labelLow: "Flattest",
    })
  }
  return list
})

const sizeMetric = ref("")
const colorMetric = ref("")
const customPinned = ref(false)

const matchedPreset = computed(() => presets.value.find(p => p.sizeMetric === sizeMetric.value && p.colorMetric === colorMetric.value) || null)
const activePresetId = computed(() => customPinned.value ? "custom" : (matchedPreset.value?.id ?? "custom"))
const activePreset = computed(() => customPinned.value ? null : matchedPreset.value)
const heatInverted = computed(() => !!activePreset.value?.heatInverted)
const labelHigh = computed(() => activePreset.value?.labelHigh || "Hottest")
const labelLow = computed(() => activePreset.value?.labelLow || "Coolest")

function selectPreset(preset: HotspotPreset) {
  customPinned.value = false
  sizeMetric.value = preset.sizeMetric
  colorMetric.value = preset.colorMetric
}

// The volatility window swaps the size stat of the churn perspective in place.
watch(commitWindow, (value, previous) => {
  if (sizeMetric.value === previous) sizeMetric.value = value
})

// When the grain changes the column set changes with it; keep the current
// pair when it still exists, otherwise fall back to the first perspective.
watch(columns, cols => {
  if (cols.length === 0) return
  const stillValid = cols.includes(sizeMetric.value) && cols.includes(colorMetric.value)
  if (stillValid) return
  // Without commit history every hotspot score is 0 and the chart opens grey;
  // open on something the snapshot can colour instead.
  const first = commitWindows.value.length === 0
    ? presets.value.find(p => p.id === "nesting") ?? presets.value.find(p => p.id === "instability") ?? presets.value[0]
    : presets.value[0]
  if (first) {
    selectPreset(first)
    return
  }
  customPinned.value = true
  sizeMetric.value = cols.includes("complexity__lines") ? "complexity__lines" : cols[0]
  colorMetric.value = cols.includes("git__commits__total") ? "git__commits__total" : (cols[1] || cols[0])
}, { immediate: true })

// ---------------------------------------------------------------------------
// Groups legend: component groups at component grain, file groups at file grain.

const lens = useLensStore()
const hoveredGroupId = ref<string | null>(null)
const activeFilters = reactive(new Set<string>())
const hiddenGroups = reactive(new Set<string>())
const hiddenForPlot = computed(() => new Set([...hiddenGroups, ...groupsStore.groups.filter(g => lens.active && g.dimension !== lens.active).map(g => g.id)]))

const legendGroups = computed(() => {
  if (grain.value === "directories") return []
  return groupsStore.groups.filter(g => !lens.active || g.dimension === lens.active)
})

function toggleFilter(groupId: string) {
  if (activeFilters.has(groupId)) activeFilters.delete(groupId)
  else activeFilters.add(groupId)
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.has(groupId)) hiddenGroups.delete(groupId)
  else hiddenGroups.add(groupId)
}

// ---------------------------------------------------------------------------
// Selection: one unit in the inspector, many in the group action bar.

const selected = ref<string | null>(null)
const multiSelection = ref<string[]>([])
const highlightedUnit = ref<string | null>(null)

const ringSelection = computed(() => selected.value && !multiSelection.value.includes(selected.value)
  ? [...multiSelection.value, selected.value]
  : multiSelection.value)

const selectedUnit = computed<HotspotUnit | null>(() => selected.value ? units.value.find(u => u.name === selected.value) || null : null)

watch(grain, () => {
  selected.value = null
  multiSelection.value = []
  highlightedUnit.value = null
  activeFilters.clear()
  hiddenGroups.clear()
})

function onSelect(name: string) {
  selected.value = name
  activeSidebarTab.value = "inspector"
  sidebarExpanded.value = true
}

function toggleSelection(name: string) {
  const idx = multiSelection.value.indexOf(name)
  if (idx !== -1) multiSelection.value.splice(idx, 1)
  else multiSelection.value.push(name)
}

function replaceSelection(names: string[]) {
  multiSelection.value = [...names]
}

function detailRoute(name: string): string {
  if (grain.value === "components") return componentPath(name)
  if (grain.value === "files") return `/views/files/${name}`
  return `/views/metrics?grain=files&q=${encodeURIComponent(name)}`
}

function openUnit(name: string) {
  router.push(detailRoute(name))
}

// ---------------------------------------------------------------------------
// Callouts: the units the chart flags, listed for the inspector.

const callouts = computed<Array<{ id: string; title: string; unit: HotspotUnit; level: HealthLevel }>>(() => {
  const rows = units.value
  if (rows.length === 0 || !sizeMetric.value || !colorMetric.value) return []
  const sizeKey = sizeMetric.value
  const heatKey = colorMetric.value
  const sign = heatInverted.value ? -1 : 1
  const heat = (u: HotspotUnit) => sign * (Number(u[heatKey]) || 0)
  const withHeat = rows.filter(u => (Number(u[heatKey]) || 0) !== 0)
  const pool = withHeat.length > 0 ? withHeat : rows

  const hottest = pool.reduce((best, u) => heat(u) > heat(best) ? u : best, pool[0])
  const coolest = pool.reduce((best, u) => heat(u) < heat(best) ? u : best, pool[0])
  const largest = rows.reduce((best, u) => (Number(u[sizeKey]) || 0) > (Number(best[sizeKey]) || 0) ? u : best, rows[0])

  const out: Array<{ id: string; title: string; unit: HotspotUnit; level: HealthLevel }> = []
  if (hottest) out.push({ id: "hot", title: labelHigh.value, unit: hottest, level: "bad" })
  if (coolest && coolest !== hottest) out.push({ id: "cool", title: labelLow.value, unit: coolest, level: "good" })
  if (largest && largest !== hottest && largest !== coolest) out.push({ id: "large", title: `Largest by ${store.statNiceName(sizeKey).toLowerCase()}`, unit: largest, level: "none" })
  return out
})
</script>
