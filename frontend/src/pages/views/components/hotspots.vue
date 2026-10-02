<template>
  <div class="flex h-full flex-col overflow-hidden">
    <ViewWorkspaceLayout
      :title="t('pages.componentsHotspots.hotspots')"
      :nodes-count="units.length"
      :stats-labels="{ nodes: grainLabel }"
      v-model:search-query="searchQuery"
      v-model:is-sidebar-open="sidebarExpanded"
      v-model:active-tab="activeSidebarTab"
      :tabs="[
        { id: 'perspectives', label: t('pages.componentsHotspots.perspectives') },
        { id: 'inspector', label: t('pages.componentsHotspots.inspector') }
      ]"
      :show-config="false"
      sidebar-width="340px"
    >
      <template #stats>
        <span v-if="scoped">{{ t('pages.componentsHotspots.of') }} <span class="text-neutral-800">{{ allUnits.length }}</span></span>
        <template v-if="leftOut > 0">
          <span class="text-neutral-300">·</span>
          <span :title="leftOutNote ?? undefined">{{ t('pages.componentsHotspots.notCodeLeftOut', { leftOut: formatNumber(leftOut, 0) }) }}</span>
        </template>
      </template>

      <template #switches>
        <div class="ui-segmented" role="group" :aria-label="t('pages.componentsHotspots.grain')">
          <button v-for="g in GRAINS" :key="g.id" type="button" :aria-pressed="grain === g.id" @click="grain = g.id">{{ g.label }}</button>
        </div>
        <div class="ui-segmented" role="group" :aria-label="t('pages.componentsHotspots.layout')">
          <button v-for="l in LAYOUTS" :key="l.id" type="button" :aria-pressed="layout === l.id" @click="layout = l.id">{{ l.label }}</button>
        </div>
      </template>

      <template #visualizer>
        <div class="relative flex h-full w-full flex-col overflow-hidden">
          <!-- Group legend -->
          <div v-if="legendGroups.length > 0" class="flex shrink-0 flex-wrap items-center gap-1.5 px-4 py-2 hairline-b">
            <span class="ui-label mr-1">{{ t('pages.componentsHotspots.groups') }}</span>
            <span
              v-for="group in legendGroups"
              :key="group.id"
              class="ui-chip cursor-pointer"
              :class="{ 'is-active': activeFilters.has(group.id), 'is-muted': hiddenGroups.has(group.id) }"
              role="button"
              tabindex="0"
              :aria-pressed="activeFilters.has(group.id)"
              :title="hiddenGroups.has(group.id) ? t('pages.componentsHotspots.show', { groupName: group.name }) : t('pages.componentsHotspots.filter', { groupName: group.name })"
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
                :aria-label="hiddenGroups.has(group.id) ? t('pages.componentsHotspots.show', { groupName: group.name }) : t('pages.componentsHotspots.hide', { groupName: group.name })"
                :title="hiddenGroups.has(group.id) ? t('pages.componentsHotspots.showGroup') : t('pages.componentsHotspots.hideGroup')"
                @click.stop="toggleGroupVisibility(group.id)"
              >
                <Icon :icon="hiddenGroups.has(group.id) ? 'eye' : 'eye-off'" :size="11"/>
              </button>
            </span>
            <button v-if="activeFilters.size > 0 || hiddenGroups.size > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="activeFilters.clear(); hiddenGroups.clear()">{{ t('pages.componentsHotspots.clear') }}</button>
          </div>

          <!-- Canvas -->
          <div class="relative min-h-0 w-full grow">
            <LoadingState v-if="loading" :text="t('pages.componentsHotspots.reading', { grainLabel: grainLabel.toLowerCase() })"/>
            <EmptyState v-else-if="error" :title="t('pages.componentsHotspots.couldNotRead', { grainLabel: grainLabel.toLowerCase() })" :text="error" icon="alert"/>
            <EmptyState
              v-else-if="units.length === 0 && scoped"
              :title="t('pages.componentsHotspots.nothingScope')"
              :text="t('pages.componentsHotspots.clearScopeSeeAll', { grainLabel: grainLabel.toLowerCase() })"
              icon="filter"
            >
              <button type="button" class="ui-btn ui-btn-sm" @click="scope.clear(); scope.setFacet('all')">{{ t('pages.componentsHotspots.clearScope') }}</button>
            </EmptyState>
            <EmptyState
              v-else-if="units.length === 0"
              :title="t('pages.componentsHotspots.noSnapshot', { grainLabel: grainLabel.toLowerCase() })"
              :text="t('pages.componentsHotspots.scanRecordedNoPack', { grainLabel: grainLabel.toLowerCase() })"
              icon="flame"
            />
            <EmptyState
              v-else-if="!sizeMetric || !colorMetric"
              :title="t('pages.componentsHotspots.noMetricsMap')"
              :text="t('pages.componentsHotspots.tableHasNoNumeric', { grainLabel: grainLabel.toLowerCase() })"
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
              :zero-label="zeroLabel"
              :ranked="ranked.map(u => u.name)"
              :ranked-note="rankedNote"
              :left-out-note="leftOutNote"
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
              :universe="units.map(u => u.name)"
              :show-in-except="['hotspots']"
              @replace="selected = null; multiSelection = $event"
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
          <h3 class="ui-section-title">{{ t('pages.componentsHotspots.perspectives') }}</h3>
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
                  <span v-if="activePresetId === preset.id" class="mt-1 block font-mono text-xs leading-4 text-neutral-500">{{ t('pages.componentsHotspots.sizeHeat', { sizeMetric: store.statNiceName(preset.sizeMetric), colorMetric: store.statNiceName(preset.colorMetric) }) }}</span>
                </span>
              </button>
              <div v-if="activePresetId === preset.id && preset.windowed && commitWindows.length > 1" class="mb-2 ml-8 mr-2 mt-1 flex flex-col gap-1.5">
                <span class="ui-label">{{ t('pages.componentsHotspots.volatilityWindow') }}</span>
                <div class="ui-segmented w-full" role="group" :aria-label="t('pages.componentsHotspots.volatilityWindow')">
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
                  <span class="block text-base font-medium leading-4 text-neutral-900">{{ t('pages.componentsHotspots.custom') }}</span>
                  <span class="mt-0.5 block text-sm leading-4 text-neutral-500">{{ t('pages.componentsHotspots.chooseSizeHeatMetrics') }}</span>
                </span>
              </button>
              <div v-if="activePresetId === 'custom'" class="mb-2 ml-8 mr-2 mt-1 flex flex-col gap-2">
                <label class="flex flex-col gap-1">
                  <span class="ui-label">{{ t('pages.componentsHotspots.circleSize') }}</span>
                  <StatSelectSingle v-model="sizeMetric" :options="columns" class="w-full"/>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="ui-label">{{ t('pages.componentsHotspots.heat') }}</span>
                  <StatSelectSingle v-model="colorMetric" :options="columns" :align-right="true" class="w-full"/>
                </label>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="ranked.length > 0" class="flex flex-col gap-1.5 pt-3 hairline-t">
          <div class="flex flex-col gap-0.5">
            <h3 class="ui-section-title">{{ labelHigh }}</h3>
            <p v-if="rankedNote" class="text-sm leading-4 text-neutral-500">{{ rankedNote }}</p>
          </div>
          <ol class="-mx-2 flex flex-col">
            <li v-for="(u, i) in ranked" :key="u.name">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-100"
                :class="{ 'bg-accent-50': selected === u.name }"
                :title="u.name"
                @mouseenter="highlightedUnit = u.name"
                @mouseleave="highlightedUnit = null"
                @click="onSelect(u.name)"
                @dblclick="openUnit(u.name)"
              >
                <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold leading-none text-surface tabular-nums">{{ i + 1 }}</span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-mono text-sm font-medium leading-4 text-neutral-900">{{ leafName(u.name) }}</span>
                  <span v-if="parentName(u.name)" class="truncate font-mono text-xs leading-4 text-neutral-500">{{ tailOf(parentName(u.name), 38) }}</span>
                </span>
                <span class="shrink-0 font-mono text-sm tabular-nums text-neutral-700">{{ formatNumber(u[colorMetric], 1) }}</span>
              </button>
            </li>
          </ol>
        </div>
        <p class="pt-3 text-sm leading-4 text-neutral-500 hairline-t">{{ t('pages.componentsHotspots.clickCircleInspectDouble') }}</p>
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
              <dt>{{ t('pages.componentsHotspots.codeHealth') }}</dt>
              <dd class="flex items-center justify-end gap-1.5">
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(selectedUnit.codesmells__code_health))"></span>
                <span :class="levelTextClass(healthLevel(selectedUnit.codesmells__code_health))">{{ formatHealth(selectedUnit.codesmells__code_health) }}</span>
              </dd>
            </template>
            <template v-if="grain !== 'files' && hasColumn('codesmells__code_health__worst_file') && selectedUnit.codesmells__code_health__worst_file !== null">
              <dt>{{ t('pages.componentsHotspots.leastHealthyFile') }}</dt>
              <dd class="flex items-center justify-end gap-1.5">
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(selectedUnit.codesmells__code_health__worst_file))"></span>
                <span :class="levelTextClass(healthLevel(selectedUnit.codesmells__code_health__worst_file))">{{ formatHealth(selectedUnit.codesmells__code_health__worst_file) }}</span>
              </dd>
            </template>
            <template v-if="hasColumn('codesmells__hotspot_score')">
              <dt>{{ t('pages.componentsHotspots.hotspotScore') }}</dt>
              <dd class="flex items-center justify-end gap-1.5">
                <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(hotspotLevel(selectedUnit.codesmells__hotspot_score))"></span>
                <span :class="levelTextClass(hotspotLevel(selectedUnit.codesmells__hotspot_score))">{{ formatHotspot(selectedUnit.codesmells__hotspot_score) }}</span>
              </dd>
            </template>
            <template v-if="grain === 'directories' && hasColumn('complexity__files')">
              <dt>{{ t('pages.componentsHotspots.files') }}</dt>
              <dd>{{ formatNumber(selectedUnit.complexity__files, 0) }}</dd>
            </template>
            <template v-if="grain === 'files' && selectedUnit.component">
              <dt>{{ t('pages.componentsHotspots.component') }}</dt>
              <dd class="truncate"><router-link :to="componentPath(selectedUnit.component)" class="text-neutral-800 hover:underline">{{ selectedUnit.component }}</router-link></dd>
            </template>
          </dl>
          <div class="flex items-center gap-2">
            <router-link :to="detailRoute(selectedUnit.name)" class="ui-btn ui-btn-sm">
              <Icon :icon="grain === 'directories' ? 'table' : 'arrow-up-right'" :size="13" class="text-neutral-500"/>
              <span>{{ grain === 'directories' ? t('pages.componentsHotspots.filesDirectory') : t('pages.componentsHotspots.open') }}</span>
            </router-link>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = null">{{ t('pages.componentsHotspots.deselect') }}</button>
          </div>
        </template>
        <p v-else class="text-sm leading-4 text-neutral-500">{{ t('pages.componentsHotspots.clickCircleInspectDouble2') }}</p>
        <button v-if="ranked.length > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet -ml-2 self-start" @click="activeSidebarTab = 'perspectives'">
          <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
          <span>{{ labelHigh }}</span>
        </button>

      </template>
    </ViewWorkspaceLayout>

  </div>
</template>

<script setup lang="ts">
import { LAST_CHANGED, useCodeAge } from "~/features/git/useCodeAge"
import { componentPath } from "~/features/navigation/routes"
import { computed, reactive, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useLensStore } from "~/features/groups/lens.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useScopeStore } from "~/features/groups/scope.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { isSourceFile } from "~/features/snapshot/fileRole"
import { formatHealth, formatHotspot, healthLevel, hotspotLevel, levelDotClass, levelTextClass } from "~/features/metrics/useHealth"
import { formatNumber } from "~/shared/format"
import Icon from "~/shared/ui/Icon.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import ZoomControls from "~/shared/ui/ZoomControls.vue"
import StatSelectSingle from "~/features/metrics/components/StatSelectSingle.vue"
import HotspotsTreemap, { type HotspotGrain, type HotspotLayout, type HotspotUnit } from "~/features/metrics/components/HotspotsTreemap.vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { useIncomingSelection } from "~/features/navigation/useIncomingSelection"
import { choosePreset, presetForUrl } from "~/features/metrics/hotspotPreset"
import { t } from "~/shared/i18n"

const store = useDataStore()
const router = useRouter()
const route = useRoute()
const groupsStore = useGroupsStore()
const scope = useScopeStore()

const treemap = ref<InstanceType<typeof HotspotsTreemap> | null>(null)

// ---------------------------------------------------------------------------
// Grain and layout, mirrored into the query string so links survive.

const GRAINS: Array<{ id: HotspotGrain; label: string }> = [
  { id: "components", label: t("pages.componentsHotspots.components") },
  { id: "directories", label: t("pages.componentsHotspots.directories") },
  { id: "files", label: t("pages.componentsHotspots.files") },
]
const LAYOUTS: Array<{ id: HotspotLayout; label: string }> = [
  { id: "packed", label: t("pages.componentsHotspots.packed") },
  { id: "flat", label: t("pages.componentsHotspots.flat") },
]

function parseGrain(v: unknown): HotspotGrain {
  return v === "directories" || v === "files" ? v : "components"
}
function parseLayout(v: unknown): HotspotLayout {
  return v === "flat" ? "flat" : "packed"
}

const grain = ref<HotspotGrain>(parseGrain(route.query.grain))
const layout = ref<HotspotLayout>(parseLayout(route.query.layout))
const grainLabel = computed(() => GRAINS.find(g => g.id === grain.value)?.label || t("pages.componentsHotspots.components"))
const unitKind = computed(() => grain.value === "components" ? t("pages.componentsHotspots.component") : grain.value === "files" ? t("pages.componentsHotspots.file") : t("pages.componentsHotspots.directory"))

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

// The rows carry the grain they were read for, so the columns of the grain
// being left are never taken for the new one's.
const { data: queried, loading, error } = useAsyncQuery<{ grain: HotspotGrain | null; rows: HotspotUnit[] }>(
  async () => {
    const g = grain.value
    if (g === "components") return { grain: g, rows: [] }
    const table = g === "directories" ? "directories" : "files"
    return { grain: g, rows: await store.query<HotspotUnit>(`SELECT * FROM ${table} ORDER BY name`) }
  },
  [grain],
  { initial: { grain: null, rows: [] } },
)

// Whether the active grain's columns are all known yet.
const columnsSettled = computed(() => store.hasData && (grain.value === "components" || (queried.value.grain === grain.value && !loading.value)))

// The file grain ranks source code only: a LICENSE, a plan in Markdown or a
// vendored library has lines and nesting too, and led every list before.
const grainRows = computed<HotspotUnit[]>(() => grain.value === "files" ? queried.value.rows.filter(isSourceFile) : queried.value.rows)
const leftOut = computed(() => grain.value === "files" ? queried.value.rows.length - grainRows.value.length : 0)
const leftOutNote = computed(() => leftOut.value > 0
  ? t("pages.componentsHotspots.notSourceCodeLeft", { filesThatAre: t("common.count.fileThatIs", { count: leftOut.value }) })
  : null)

const codeAge = useCodeAge()
const allUnits = computed<HotspotUnit[]>(() => {
  const units = grain.value === "components" ? store.allComponents as unknown as HotspotUnit[] : grainRows.value
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
// for the other tables read them off the rows. None until they are all known.
const columns = computed<string[]>(() => {
  if (!columnsSettled.value) return []
  const age = codeAge.available.value && grain.value !== "directories" ? [LAST_CHANGED] : []
  if (grain.value === "components") return [...(store.getDistinctComponentColumns as string[]), ...age]
  const seen = new Set<string>(age)
  for (const row of queried.value.rows.slice(0, 200)) {
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
  /** What a heat of 0 means when it is no value at all; such units are drawn hollow. */
  zeroLabel?: string
  /** Rank only the busier half by size, so the flagged units are the big ones the description promises. */
  rankBusierHalf?: boolean
}

const COMMIT_WINDOW = /^git__commits__last_(\d+)_days$/

const commitWindows = computed<Array<{ label: string; value: string }>>(() => {
  const out: Array<{ label: string; value: string; days: number }> = []
  if (hasColumn("git__commits__total")) out.push({ label: t("pages.componentsHotspots.allTime"), value: "git__commits__total", days: Infinity })
  for (const c of columns.value) {
    const m = c.match(COMMIT_WINDOW)
    if (m) out.push({ label: t("pages.componentsHotspots.lastDays", { value: m[1] }), value: c, days: Number(m[1]) })
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
      label: t("pages.componentsHotspots.hotspots"),
      description: t("pages.componentsHotspots.largeUnitsHighHotspot"),
      icon: "flame",
      sizeMetric: lines,
      colorMetric: "codesmells__hotspot_score",
      labelHigh: t("pages.componentsHotspots.hottest"),
      labelLow: t("pages.componentsHotspots.coolest"),
      // The engine scores a file without commits 0.
      zeroLabel: t("pages.componentsHotspots.noCommits"),
    })
  }
  if (commitWindows.value.length > 0 && hasColumn("codesmells__code_health")) {
    list.push({
      id: "churn",
      label: t("pages.componentsHotspots.churnAgainstHealth"),
      description: t("pages.componentsHotspots.frequentlyChangedUnitsHot"),
      icon: "git-commit",
      sizeMetric: commitWindow.value,
      colorMetric: "codesmells__code_health",
      heatInverted: true,
      windowed: true,
      labelHigh: t("pages.componentsHotspots.churningUnhealthy"),
      labelLow: t("pages.componentsHotspots.churningHealthy"),
      // Code health runs 1 to 10; 0 is a unit without a score.
      zeroLabel: t("pages.componentsHotspots.noHealthScore"),
      rankBusierHalf: true,
    })
  }
  if (hasColumn(lines) && hasColumn("modularity__instability")) {
    list.push({
      id: "instability",
      label: t("pages.componentsHotspots.instability"),
      description: t("pages.componentsHotspots.unitsDependMoreThan"),
      icon: "scale",
      sizeMetric: lines,
      colorMetric: "modularity__instability",
      labelHigh: t("pages.componentsHotspots.mostUnstable"),
      labelLow: t("pages.componentsHotspots.mostStable"),
    })
  }
  if (hasColumn(lines) && codeAge.available.value && grain.value !== "directories") {
    list.push({
      id: "age",
      label: t("pages.componentsHotspots.codeAge"),
      description: t("pages.componentsHotspots.sizedLinesHotWhere"),
      icon: "history",
      sizeMetric: lines,
      colorMetric: LAST_CHANGED,
      labelHigh: t("pages.componentsHotspots.untouchedLongest"),
      labelLow: t("pages.componentsHotspots.changedRecently"),
    })
  }
  if (hasColumn(lines) && hasColumn("complexity__lines__complex")) {
    list.push({
      id: "complex-code",
      label: t("pages.componentsHotspots.complexCode"),
      description: t("pages.componentsHotspots.linesInComplexFunctions"),
      icon: "braces",
      sizeMetric: lines,
      colorMetric: "complexity__lines__complex",
      labelHigh: t("pages.componentsHotspots.mostComplexCode"),
      labelLow: t("pages.componentsHotspots.simplest"),
    })
  }
  if (hasColumn(lines) && hasColumn("complexity__indentation__max")) {
    list.push({
      id: "nesting",
      label: t("pages.componentsHotspots.nestingDepth"),
      description: t("pages.componentsHotspots.deeplyIndentedLogicHard"),
      icon: "list-tree",
      sizeMetric: lines,
      colorMetric: "complexity__indentation__max",
      labelHigh: t("pages.componentsHotspots.deepestNesting"),
      labelLow: t("pages.componentsHotspots.flattest"),
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
const labelHigh = computed(() => activePreset.value?.labelHigh || t("pages.componentsHotspots.hottest"))
const labelLow = computed(() => activePreset.value?.labelLow || t("pages.componentsHotspots.coolest"))
const zeroLabel = computed(() => activePreset.value?.zeroLabel ?? null)
const rankedNote = computed(() => activePreset.value?.rankBusierHalf
  ? t("pages.componentsHotspots.amongHalfMost", { replace: store.statNiceName(sizeMetric.value).toLowerCase().replace(/ count$/, "s") })
  : null)

function selectPreset(preset: HotspotPreset) {
  customPinned.value = false
  sizeMetric.value = preset.sizeMetric
  colorMetric.value = preset.colorMetric
}

// The volatility window swaps the size stat of the churn perspective in place.
watch(commitWindow, (value, previous) => {
  if (sizeMetric.value === previous) sizeMetric.value = value
})

// The perspective a link asked for (?preset=churn). It stays in the URL while it
// is the one shown, so a capture of this view says which perspective it holds.
const routePreset = computed(() => (typeof route.query.preset === "string" ? route.query.preset : null))

// One rule for every way the view gets here: a first load, a grain switch, and
// a link (report slot, Show in, capture) changing grain and preset together
// while the view stays open. It waits for the grain's columns, then the
// perspective the link asked for wins once its columns exist.
function applyPreset() {
  // Without commit history every hotspot score is 0 and the chart opens grey;
  // open on something the snapshot can colour instead.
  const fallback = commitWindows.value.length === 0 ? ["nesting", "instability"] : []
  const choice = choosePreset(columns.value, presets.value, routePreset.value, {
    sizeMetric: sizeMetric.value,
    colorMetric: colorMetric.value,
    customPinned: customPinned.value,
  }, fallback)
  if (choice.kind === "preset") {
    const p = presets.value.find(x => x.id === choice.id)
    if (p) selectPreset(p)
  } else if (choice.kind === "custom") {
    customPinned.value = true
    sizeMetric.value = choice.sizeMetric
    colorMetric.value = choice.colorMetric
  }
}
watch([columns, presets, routePreset], applyPreset, { immediate: true })

// The URL follows the perspective shown: a later choice replaces the link's, and
// a custom pair of metrics drops it. Never while the columns load, when the
// pair on screen is the one being left.
watch([activePresetId, columnsSettled], ([id, settled]) => {
  const want = presetForUrl(id, settled, routePreset.value)
  if (want === undefined) return
  const query: Record<string, any> = { ...route.query }
  if (want) query.preset = want
  else delete query.preset
  void router.replace({ query })
})

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

// Arriving from Show in: one id is the inspected unit, several a selection.
useIncomingSelection(ids => {
  if (ids.length === 1) onSelect(ids[0])
  else multiSelection.value = ids
})

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
// The units the perspective flags: the five hottest, numbered the same on the
// chart and in the list. A unit of size 0 (no commits in the churn window)
// has nothing to flag, and a blank heat is not a value.

const RANKED = 5

const ranked = computed<HotspotUnit[]>(() => {
  const sizeKey = sizeMetric.value
  const heatKey = colorMetric.value
  if (!sizeKey || !heatKey) return []
  const sign = heatInverted.value ? -1 : 1
  const heat = (u: HotspotUnit) => sign * (Number(u[heatKey]) || 0)
  let pool = units.value.filter(u => (Number(u[sizeKey]) || 0) > 0 && (!zeroLabel.value || (Number(u[heatKey]) || 0) !== 0))
  if (activePreset.value?.rankBusierHalf && pool.length > RANKED) {
    const middle = median(pool.map(u => Number(u[sizeKey]) || 0))
    pool = pool.filter(u => (Number(u[sizeKey]) || 0) >= middle)
  }
  return pool
    .sort((a, b) => heat(b) - heat(a) || (Number(b[sizeKey]) || 0) - (Number(a[sizeKey]) || 0))
    .slice(0, RANKED)
})

// A component name is dotted; a file path keeps its extension on the leaf.
const SEPARATORS = /[\\/.]/
function leafName(name: string): string {
  const parts = name.split(grain.value === "files" ? /[\\/]/ : SEPARATORS)
  return parts[parts.length - 1] || name
}
function tailOf(text: string, max: number): string {
  return text.length > max ? "…" + text.slice(text.length - max + 1) : text
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function parentName(name: string): string {
  const leaf = leafName(name)
  return name.length > leaf.length ? name.slice(0, name.length - leaf.length - 1) : ""
}
</script>
