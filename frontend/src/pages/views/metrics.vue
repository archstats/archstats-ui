<template>
  <ViewWorkspaceLayout
      title="Metrics"
      v-model:search-query="searchQuery"
    :search-placeholder="grain === 'files' ? 'Find a file' : grain === 'directories' ? 'Find a directory' : 'Find a component'"
      v-model:is-sidebar-open="isSidebarOpen"
      v-model:active-tab="activeTab"
      :tabs="inspectorTabs"
      :show-config="true"
      sidebar-width="300px"
  >
    <template #stats>
      <span v-if="grain !== 'directories'">{{ grainLabel }} <span class="text-neutral-800">{{ countText }}</span></span>
      <button v-if="isOverview && brushTotal > 0" type="button" class="ui-chip is-active" :title="'Clear every brush'" @click="brushes = {}">
        <span>{{ brushTotal }} {{ brushTotal === 1 ? 'brush' : 'brushes' }}</span><Icon icon="x" :size="11"/>
      </button>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Grain">
        <button type="button" :aria-pressed="grain === 'components'" @click="grain = 'components'">Components</button>
        <button type="button" :aria-pressed="grain === 'files'" @click="grain = 'files'">Files</button>
        <button type="button" :aria-pressed="grain === 'directories'" title="An outline by directory, every number rolled up" @click="grain = 'directories'">Directories</button>
      </div>
      <div class="ui-segmented" role="group" aria-label="View">
        <button type="button" :aria-pressed="view === 'summary' && grain !== 'directories'" :disabled="grain === 'directories'" title="What stands out, and where to look next" @click="view = 'summary'">Summary</button>
        <button type="button" :aria-pressed="view === 'table' || grain === 'directories'" @click="view = 'table'">Table</button>
        <button type="button" :aria-pressed="view === 'plot' && grain !== 'directories'" :disabled="grain === 'directories'" :title="grain === 'directories' ? 'Directories have no plot: their numbers are rollups, not measurements' : undefined" @click="view = 'plot'">Plot</button>
      </div>
      <div class="ui-segmented" role="group" aria-label="Overview prototypes">
        <button type="button" :aria-pressed="view === 'matrix' && grain !== 'directories'" :disabled="grain === 'directories'" title="Prototype: every metric pair at once, one opened as the full plot" @click="view = 'matrix'">Matrix</button>
        <button type="button" :aria-pressed="view === 'strips' && grain !== 'directories'" :disabled="grain === 'directories'" title="Prototype: every metric as a strip of dots, brushed together" @click="view = 'strips'">Strips</button>
        <button type="button" :aria-pressed="view === 'profiles' && grain !== 'directories'" :disabled="grain === 'directories'" title="Prototype: every row as one line across every metric" @click="view = 'profiles'">Profiles</button>
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
      <!-- Plot controls: a second toolbar row under the frame; groups wrap whole rather than clip. -->
      <div v-if="(view === 'plot' || view === 'matrix') && grain !== 'directories'" class="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 hairline-b">
        <div class="flex items-center gap-2">
          <span class="ui-label">Preset</span>
          <SingleSelect :model-value="activePreset?.name ?? null" :options="presetNames" placeholder="Custom" @update:model-value="selectPresetByName"/>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="flex items-center gap-2">
          <span class="ui-label">X</span>
          <StatSelectSingle v-model="xAxis" :options="numericColumns"/>
          <button type="button" class="ui-btn ui-btn-sm ui-log-toggle" :aria-pressed="xLog" title="Log scale on X" @click="xLog = !xLog">log</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Swap axes" title="Swap X and Y" @click="swapAxes">
            <Icon icon="arrow-left-right" :size="13"/>
          </button>
          <span class="ui-label">Y</span>
          <StatSelectSingle v-model="yAxis" :options="numericColumns"/>
          <button type="button" class="ui-btn ui-btn-sm ui-log-toggle" :aria-pressed="yLog" title="Log scale on Y" @click="yLog = !yLog">log</button>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="flex items-center gap-2">
          <span class="ui-label">Size</span>
          <StatSelectSingle v-model="radius" :options="numericColumns" placeholder="Even"/>
          <button v-if="radius" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear size" title="Clear size" @click="radius = null">
            <Icon icon="x" :size="12"/>
          </button>
          <span class="ui-label">Colour</span>
          <StatSelectSingle v-model="colour" :options="numericColumns" placeholder="Groups"/>
          <button v-if="colour" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Colour by group" title="Colour by group" @click="colour = null">
            <Icon icon="x" :size="12"/>
          </button>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="ui-segmented" role="group" aria-label="Labels">
          <button type="button" :aria-pressed="labelMode === 'auto'" title="Name the marks furthest out, and whatever you select" @click="labelMode = 'auto'">Outliers</button>
          <button type="button" :aria-pressed="labelMode === 'all'" @click="labelMode = 'all'">All</button>
          <button type="button" :aria-pressed="labelMode === 'none'" title="Only the selection and the mark under the pointer" @click="labelMode = 'none'">None</button>
        </div>
        <!-- These are the plot's controls, so the plot exports from their end. -->
        <ExhibitButton :exhibit="plotFigure" class="ml-auto"/>
      </div>

      <DirectoryTree v-if="grain === 'directories'" :search="searchQuery"/>
      <LoadingState v-else-if="loading" :text="grain === 'files' ? 'Loading files…' : 'Loading components…'"/>
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
        <button v-if="scope.isActive" type="button" class="ui-btn ui-btn-sm" @click="scope.clear(); scope.setFacet('all')">Clear scope</button>
      </EmptyState>
      <MetricsSummary v-else-if="view === 'summary'" :rows="filteredRows" :metrics="overviewKeys" :grain="grain === 'files' ? 'file' : 'component'" @go="go" @open="openName"/>
      <div v-else-if="view === 'table'" class="min-h-0 grow overflow-y-auto px-4 py-3">
        <ElementTable
            :elements="filteredRows"
            :only-show-columns="tableColumns"
            :clickable-elements="true"
            :selectable-elements="true"
            :show-groups="grainGroups.length > 0"
            :instrumented="true"
            :max-page-size="25"
            :name-column="grain === 'files' ? 'File' : 'Component'"
            :export-title="grain === 'files' ? 'Metrics: files' : 'Metrics: components'"
            :initial-sort="tableSort ?? (visibleColumns?.includes('codesmells__hotspot_score') ? 'codesmells__hotspot_score' : 'name')"
            :key="`${grain}:${tableSort ?? ''}`"
            :selected-elements="selectedNames"
            @update:selected-elements="selectedNames = $event"
            @clicked-element="openRow"
        />
      </div>
      <!-- Prototype: matrix of every pair, the chosen pair as the full plot, the rows in play below. -->
      <div v-else-if="view === 'matrix'" class="flex min-h-0 grow flex-col">
        <MetricSetBar v-model="matrixSet" :options="numericColumns" :defaults="defaultSet('matrix')" :view-name="SET_LIMITS.matrix.name"
                      :min="SET_LIMITS.matrix.min" :max="SET_LIMITS.matrix.max" @reset="resetSet('matrix')">
          <template #end><ExhibitButton :exhibit="matrixRef?.figure ?? null"/></template>
        </MetricSetBar>
        <div class="flex min-h-0 shrink-0 basis-[64%]">
          <div class="aspect-square h-full max-w-[55%] shrink-0 hairline-r">
            <ExhibitFrame header="custom" fill>
              <MetricMatrix
                  ref="matrixRef"
                  :rows="filteredRows" :domain-rows="allRows" :metrics="matrixSet"
                  v-model:brushes="brushes" v-model:hovered="hoveredName" :selected="selectedNames" @update:selected="selectedNames = $event"
                  :pair="[xAxis, yAxis]" :grain="grain === 'files' ? 'file' : 'component'"
                  @pair="setPair" @open="openName"/>
            </ExhibitFrame>
          </div>
          <div class="relative min-w-0 grow px-3 pb-2 pt-3">
            <ExhibitFrame v-if="xAxis && yAxis" header="custom" fill>
              <ComponentPlotterDiagram ref="plot" class="h-full w-full" v-bind="plotProps" :rows="playRows" @update:selected="selectedNames = $event" @clicked="openRow"/>
            </ExhibitFrame>
          </div>
        </div>
        <div class="min-h-0 grow overflow-y-auto px-4 py-2 hairline-t">
          <ElementTable :key="`m-${grain}`" :elements="playRows" :only-show-columns="matrixSet" :clickable-elements="true" :selectable-elements="true" :instrumented="true" :max-page-size="25"
                        :export-title="brushTotal ? 'In the brushes' : 'Metrics in play'"
                        :name-column="grain === 'files' ? 'File' : 'Component'" initial-sort="codesmells__hotspot_score"
                        :selected-elements="selectedNames" @update:selected-elements="selectedNames = $event" @clicked-element="openRow"/>
        </div>
      </div>

      <!-- Prototype: one strip per metric, the ranked rows in play beside them. -->
      <div v-else-if="view === 'strips'" class="flex min-h-0 grow">
        <div class="flex min-w-0 grow flex-col">
        <MetricSetBar v-model="stripSet" :options="numericColumns" :defaults="defaultSet('strips')" :view-name="SET_LIMITS.strips.name"
                      :min="SET_LIMITS.strips.min" :max="SET_LIMITS.strips.max" @reset="resetSet('strips')">
          <template #end><ExhibitButton :exhibit="stripsRef?.figure ?? null"/></template>
        </MetricSetBar>
        <div class="min-h-0 grow py-2">
          <ExhibitFrame header="custom" fill>
            <MetricStrips
                ref="stripsRef"
                :rows="filteredRows" :domain-rows="allRows" :metrics="stripSet"
                v-model:brushes="brushes" v-model:hovered="hoveredName" :selected="selectedNames" @update:selected="selectedNames = $event"
                :sort-key="stripSort" :grain="grain === 'files' ? 'file' : 'component'"
                @sort="stripSort = $event" @open="openName"/>
          </ExhibitFrame>
        </div>
        </div>
        <aside class="w-[340px] shrink-0 bg-ground hairline-l">
          <RankedRows :rows="playRows" :sort-key="stripSort" :title="brushTotal ? 'In the brushes' : 'All'"
                      :selected="selectedNames" @update:selected="selectedNames = $event"
                      v-model:hovered="hoveredName" @open="openName"/>
        </aside>
      </div>

      <!-- Prototype: parallel axes, one line per row, the rows in play below. -->
      <div v-else-if="view === 'profiles'" class="flex min-h-0 grow flex-col">
        <MetricSetBar v-model="profileSet" :options="numericColumns" :defaults="defaultSet('profiles')" :view-name="SET_LIMITS.profiles.name"
                      :min="SET_LIMITS.profiles.min" :max="SET_LIMITS.profiles.max" @reset="resetSet('profiles')">
          <template #end><ExhibitButton :exhibit="profilesRef?.figure ?? null"/></template>
        </MetricSetBar>
        <div class="min-h-0 shrink-0 basis-[62%] px-2 pt-1">
          <ExhibitFrame header="custom" fill>
            <MetricProfiles
                ref="profilesRef"
                :rows="filteredRows" :domain-rows="allRows" v-model:metrics="profileSet"
                v-model:brushes="brushes" v-model:hovered="hoveredName" :selected="selectedNames" @update:selected="selectedNames = $event"
                :grain="grain === 'files' ? 'file' : 'component'" @open="openName"/>
          </ExhibitFrame>
        </div>
        <div class="min-h-0 grow overflow-y-auto px-4 py-2 hairline-t">
          <ElementTable :key="`p-${grain}`" :elements="playRows" :only-show-columns="profileSet" :clickable-elements="true" :selectable-elements="true" :instrumented="true" :max-page-size="25"
                        :export-title="brushTotal ? 'In the brushes' : 'Metrics in play'"
                        :name-column="grain === 'files' ? 'File' : 'Component'" initial-sort="codesmells__hotspot_score"
                        :selected-elements="selectedNames" @update:selected-elements="selectedNames = $event" @clicked-element="openRow"/>
        </div>
      </div>

      <div v-else-if="xAxis && yAxis" class="relative min-h-0 grow px-3 pb-2 pt-3">
        <p v-if="abstractnessCaveat" class="pointer-events-none absolute left-1/2 top-16 z-10 max-w-[60ch] -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-center text-xs text-neutral-500 backdrop-blur-sm">{{ abstractnessCaveat }}</p>
        <ExhibitFrame header="custom" fill>
          <ComponentPlotterDiagram
              ref="plot"
              class="h-full w-full"
              :rows="filteredRows"
              :domain-rows="allRows"
              :selected="selectedNames"
              :grain="grain === 'files' ? 'file' : 'component'"
              :label-mode="labelMode"
              :x-axis-property="xAxis"
              :y-axis-property="yAxis"
              :x-log="xLog"
              :y-log="yLog"
              :radius-property="radius"
              :color-property="colour"
              :reading="reading"
              :cell-text="cellText"
              :hidden-groups="hiddenForPlot"
              :active-filters="activeFilters"
              :hovered-group-id="hoveredGroupId"
              @update:selected="selectedNames = $event"
              @clicked="openRow"
          />
        </ExhibitFrame>
      </div>
      <EmptyState v-else title="Pick two metrics to plot." text="Choose an X and a Y metric above, or a preset." icon="settings"/>

      <GroupActionBar v-if="grain !== 'directories'" :selected-items="selectedNames" :kind="grain === 'files' ? 'file' : 'component'" :universe="filteredRows.map(r => String(r.name))" :show-in-except="['metrics']" @replace="selectedNames = $event" @clear="selectedNames = []"/>
    </template>

    <template #visualizer-overlays>
      <ZoomControls v-if="view === 'plot' && filteredRows.length > 0" @zoom-in="plot?.zoomIn()" @zoom-out="plot?.zoomOut()" @reset="plot?.resetZoom()"/>
    </template>

    <template #tab-reading>
      <template v-if="reading && xAxis && yAxis">
        <section class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ reading.kind === 'main-sequence' ? 'Zones' : 'Split at the medians' }}</h3>
          <p v-if="reading.kind === 'medians'" class="text-sm leading-4 text-neutral-500">
            Half of all {{ grainNoun }} sit either side of each line: {{ niceName(xAxis) }} <span class="font-mono text-neutral-700">{{ formatReading(reading.mx) }}</span>, {{ niceName(yAxis) }} <span class="font-mono text-neutral-700">{{ formatReading(reading.my) }}</span>.
          </p>
          <p v-else class="text-sm leading-4 text-neutral-500">Distance from the main sequence above 0.5, on either side of the line.</p>
          <div class="-mx-2 flex flex-col">
            <button v-for="cell in readingCells" :key="cell.id" type="button"
                    class="group flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-neutral-200/60"
                    :title="`Select these ${cell.names.length}`"
                    @click="selectedNames = [...cell.names]">
              <span class="w-8 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-neutral-900">{{ cell.names.length }}</span>
              <span class="min-w-0 grow truncate text-sm text-neutral-700 group-hover:text-neutral-900">{{ cellText[cell.id] }}</span>
              <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200"><span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${cellShare(cell.names.length)}%` }"></span></span>
            </button>
          </div>
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="ui-section-title">Furthest out</h3>
          <ul class="-mx-2 flex flex-col">
            <li v-for="name in reading.outliers.slice(0, 10)" :key="name">
              <button type="button"
                      class="flex h-7 w-full items-center gap-2 rounded px-2 text-left hover:bg-neutral-200/60"
                      :class="{ 'bg-accent-50': selectedNames.includes(name) }"
                      :title="name"
                      @click="selectedNames = [name]"
                      @dblclick="router.push(detailRoute(name))">
                <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ shortNames.get(name) ?? name }}</span>
                <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatReading(rowByName.get(name)?.[xAxis]) }} · {{ formatReading(rowByName.get(name)?.[yAxis]) }}</span>
              </button>
            </li>
          </ul>
          <p class="text-sm leading-4 text-neutral-500">{{ reading.kind === 'main-sequence' ? 'Ranked by distance from the main sequence.' : 'Ranked by how far each sits from both medians, in interquartile ranges.' }}</p>
        </section>
        <p v-if="reading.missing > 0" class="text-sm leading-4 text-neutral-500">
          <span class="font-mono text-neutral-700">{{ reading.missing }}</span> {{ reading.missing === 1 ? grainNoun.slice(0, -1) : grainNoun }} without {{ missingAxes }} {{ reading.missing === 1 ? 'is' : 'are' }} not drawn.
        </p>
      </template>
    </template>

    <template #tab-selection>
      <div class="flex items-center justify-between">
        <h3 class="ui-section-title">Selection <span class="ui-tag ml-1">{{ selectedNames.length }}</span></h3>
        <button v-if="selectedNames.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selectedNames = []">Clear</button>
      </div>
      <p v-if="selectedNames.length === 0" class="text-sm leading-4 text-neutral-500">Nothing selected. Click a mark, drag a box across the plot, or pick a corner.</p>
      <template v-else>
        <dl v-if="xAxis && yAxis && selectionMedians" class="ui-kv">
          <dt class="truncate">Median {{ niceName(xAxis) }}</dt><dd>{{ formatReading(selectionMedians.x) }}</dd>
          <dt class="truncate">Median {{ niceName(yAxis) }}</dt><dd>{{ formatReading(selectionMedians.y) }}</dd>
        </dl>
        <ul class="-mx-2 flex flex-col">
          <li v-for="name in selectedNames" :key="name">
            <router-link :to="detailRoute(name)" class="flex h-7 items-center gap-2 rounded px-2 hover:bg-neutral-200/60" :title="`${name} · open`">
              <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ shortNames.get(name) ?? name }}</span>
              <span v-if="xAxis && yAxis" class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatReading(rowByName.get(name)?.[xAxis]) }} · {{ formatReading(rowByName.get(name)?.[yAxis]) }}</span>
            </router-link>
          </li>
        </ul>
      </template>
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
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import { LAST_CHANGED, useCodeAge } from "~/features/git/useCodeAge";
import { componentPath } from "~/features/navigation/routes";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { ARRIVAL_KEYS, arrivalFrom } from "~/features/metrics/link";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import ElementTable from "~/features/metrics/components/ElementTable.vue";
import StatSelectMulti from "~/features/metrics/components/StatSelectMulti.vue";
import StatSelectSingle from "~/features/metrics/components/StatSelectSingle.vue";
import SingleSelect from "~/shared/ui/SingleSelect.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import ZoomControls from "~/shared/ui/ZoomControls.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import { useIncomingSelection } from "~/features/navigation/useIncomingSelection";
import DirectoryTree from "~/features/metrics/components/DirectoryTree.vue";
import ComponentPlotterDiagram from "~/features/metrics/components/ComponentPlotterDiagram.vue";
import MetricMatrix from "~/features/metrics/components/MetricMatrix.vue";
import MetricStrips from "~/features/metrics/components/MetricStrips.vue";
import MetricProfiles from "~/features/metrics/components/MetricProfiles.vue";
import RankedRows from "~/features/metrics/components/RankedRows.vue";
import MetricsSummary from "~/features/metrics/components/MetricsSummary.vue";
import MetricSetBar from "~/features/metrics/components/MetricSetBar.vue";
import type { Go } from "~/features/metrics/summary";
import { overviewMetrics, passes, type Brushes } from "~/features/metrics/lab";
import { implicitAbstractionLanguage } from "~/features/metrics/abstraction";
import { useDataStore } from "~/features/snapshot/data.store";
import { useLensStore } from "~/features/groups/lens.store";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { formatReading } from "~/shared/format";
import { distinctTails, finiteSorted, metricValue, quantile, readPlot, suggestLog, type PlotReading } from "~/features/metrics/plotReading";

// Metrics: every number for every component or file, as a table or a plot.
// One grain switch, one filter (scope + search), one column picker, one
// selection shared by both representations.

type Row = { name: string; [key: string]: any };
type Grain = "components" | "files" | "directories";
type View = "summary" | "table" | "plot" | "matrix" | "strips" | "profiles";
const VIEWS: View[] = ["summary", "table", "plot", "matrix", "strips", "profiles"];
// A plain visit opens on the summary; a link that carries a search or a
// selection meant the rows, so it keeps opening on the table.
const viewOf = (q: Record<string, unknown>): View => {
  if (VIEWS.includes(q.view as View)) return q.view as View;
  return q.q || q.hl ? "table" : "summary";
};

const store = useDataStore();
const groupsStore = useGroupsStore();
const lens = useLensStore();
const grainGroups = computed(() => groupsStore.groups.filter(g => !lens.active || g.dimension === lens.active));
const scope = useScopeStore();
const route = useRoute();
const router = useRouter();

// ─── State from the URL ───
const grain = ref<Grain>(route.query.grain === "files" || route.query.grain === "directories" ? route.query.grain : "components");
const view = ref<View>(viewOf(route.query));
let pendingPreset: string | null = typeof route.query.preset === "string" ? route.query.preset : null;

const searchQuery = ref(typeof route.query.q === "string" ? route.query.q : "");
const isSidebarOpen = ref(true);
const activeTab = ref("reading");
const inspectorTabs = computed(() => ((view.value === "plot" || view.value === "matrix") && grain.value !== "directories"
  ? [{ id: "reading", label: "Reading" }, { id: "selection", label: selectedNames.value.length ? `Selection ${selectedNames.value.length}` : "Selection" }, { id: "legend", label: "Groups" }]
  : []));

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

// Days since last change joins every row, computed from history when the
// snapshot does not carry it.
const codeAge = useCodeAge();
const allRows = computed<Row[]>(() => {
  const rows = grain.value === "files" ? filesQuery.data.value.rows : (store.allComponents as Row[]);
  if (!codeAge.available.value) return rows;
  const ages = grain.value === "files" ? codeAge.byFile.value : codeAge.byComponent.value;
  if (ages.size === 0) return rows;
  return rows.map((r) => ({ ...r, [LAST_CHANGED]: ages.get(String(r.name)) ?? null }));
});

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

const grainLabel = computed(() => (grain.value === "files" ? "Files" : grain.value === "directories" ? "Files" : "Components"));
const countText = computed(() => {
  if (isOverview.value && brushTotal.value) return `${playRows.value.length} of ${allRows.value.length}`;
  return scope.isActive || searchQuery.value.trim() ? `${filteredRows.value.length} of ${allRows.value.length}` : `${allRows.value.length}`;
});

// ─── Columns ───
const columnOptions = computed<string[]>(() => {
  const base = grain.value === "files" ? filesQuery.data.value.columns : store.getDistinctComponentColumns.filter((c) => !HIDDEN_COLUMNS.has(c));
  return codeAge.available.value ? [...base, LAST_CHANGED] : base;
});

// Columns that hold a number somewhere in the loaded rows: the plot's axes.
const numericColumns = computed<string[]>(() => {
  const rows = allRows.value;
  if (rows.length === 0) return columnOptions.value;
  const sample = rows.slice(0, 200);
  return columnOptions.value.filter((c) => sample.some((r) => typeof r[c] === "number" && Number.isFinite(r[c])));
});

const DEFAULT_COLUMNS: Record<Grain, string[]> = {
  // The directory tree has its own columns, each a stated rollup.
  directories: [],
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
  directories: null,
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

// A link can ask for the table sorted on one metric; that metric joins the
// columns until the grain changes, even when the chosen columns leave it out.
const tableSort = ref<string | null>(null);
const tableColumns = computed<string[]>(() => {
  const s = tableSort.value;
  return s && !visibleColumns.value.includes(s) && columnOptions.value.includes(s) ? [...visibleColumns.value, s] : visibleColumns.value;
});
watch(grain, () => { tableSort.value = null; });

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
const colour = ref<string | null>(null);
const xLog = ref(false);
const yLog = ref(false);
const labelMode = ref<"auto" | "all" | "none">("auto");

/** Words for the low and high end of each axis, so a corner reads "Many changes · lower health". */
type Words = { x?: [string, string]; y?: [string, string] };
interface Preset { id: string; name: string; x: string; y: string; r?: string; c?: string; words?: Words }

const CHANGES: [string, string] = ["Few changes", "Many changes"];
const changes: [string, string] = ["few changes", "many changes"];
const PATHS: [string, string] = ["Off the paths", "On many paths"];

const ALL_PRESETS: Preset[] = [
  { id: "dms", name: "Distance to Main Sequence (DMS)", x: "modularity__instability", y: "modularity__abstractness", r: "complexity__lines", c: "codesmells__hotspot_score" },
  { id: "dms-changes", name: "DMS vs Code Changes", x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "age-churn-dms", name: "Age vs Churn vs DMS", x: "git__age_in_days", y: "git__commits__total", r: "modularity__distance_main_sequence", words: { x: ["Young", "Old"], y: changes } },
  { id: "betweenness-churn", name: "Betweenness vs Churn", x: "graph__betweenness", y: "git__commits__total", c: "codesmells__hotspot_score", words: { x: PATHS, y: changes } },
  { id: "betweenness-avg-indentation", name: "Betweenness vs Avg. Indentation", x: "graph__betweenness", y: "complexity__indentation__avg", words: { x: PATHS, y: ["shallow", "deeply nested"] } },
  { id: "betweenness-max-indentation", name: "Betweenness vs Max Indentation", x: "graph__betweenness", y: "complexity__indentation__max", words: { x: PATHS, y: ["shallow", "deeply nested"] } },
  { id: "avg-indentation-lines", name: "Avg. Indentation vs Line Count", x: "complexity__indentation__avg", y: "complexity__lines", words: { x: ["Shallow", "Deeply nested"], y: ["small", "large"] } },
  { id: "max-indentation-lines", name: "Max Indentation vs Line Count", x: "complexity__indentation__max", y: "complexity__lines", words: { x: ["Shallow", "Deeply nested"], y: ["small", "large"] } },
  { id: "dms-betweenness", name: "DMS vs Betweenness", x: "modularity__instability", y: "modularity__abstractness", r: "graph__betweenness" },
  { id: "dms-churn", name: "DMS vs Churn", x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "authors-churn", name: "Authors vs Churn", x: "git__authors__total", y: "git__commits__total", r: "complexity__lines", words: { x: ["Few authors", "Many authors"], y: changes } },
  { id: "churn-health", name: "Churn against health", x: "git__commits__total", y: "codesmells__code_health", r: "complexity__lines", c: "codesmells__hotspot_score", words: { x: CHANGES, y: ["lower health", "higher health"] } },
  { id: "churn-complexity", name: "Churn against complexity", x: "git__commits__total", y: "codesmells__static_complexity_score", r: "complexity__lines", c: "codesmells__hotspot_score", words: { x: CHANGES, y: ["simpler", "more complex"] } },
];

// A preset needs its axes and size; a colour the snapshot lacks is dropped, not the preset.
const presets = computed<Preset[]>(() => {
  const have = new Set(numericColumns.value);
  return ALL_PRESETS
    .filter((p) => have.has(p.x) && have.has(p.y) && (!p.r || have.has(p.r)))
    .map((p) => (p.c && !have.has(p.c) ? { ...p, c: undefined } : p));
});
const presetNames = computed(() => presets.value.map((p) => p.name));

// Colour and log scales are how you look, not what you ask: a preset matches on axes and size.
const activePreset = computed<Preset | null>(() =>
    presets.value.find((p) => p.x === xAxis.value && p.y === yAxis.value && (p.r ?? null) === (radius.value ?? null)) ?? null,
);

function selectPreset(preset: Preset) {
  xAxis.value = preset.x;
  yAxis.value = preset.y;
  radius.value = preset.r ?? null;
  // Group colours win while the lens has groups for this grain; otherwise the preset's colour.
  colour.value = grainGroups.value.length > 0 ? null : preset.c ?? null;
}

function swapAxes() {
  keepLogs = true;
  const x = xAxis.value, xl = xLog.value;
  xAxis.value = yAxis.value;
  yAxis.value = x;
  xLog.value = yLog.value;
  yLog.value = xl;
}

// A long-tailed axis opens on a log scale; the toggle beside it overrides until the axis changes.
let keepLogs = false;
watch([xAxis, yAxis, () => allRows.value.length > 0], ([x, y, loaded], [ox, oy, wasLoaded]) => {
  if (keepLogs) { keepLogs = false; return; }
  const fresh = loaded && !wasLoaded;
  if (x && (x !== ox || fresh)) xLog.value = suggestLog(allRows.value.map((r) => r[x]));
  if (y && (y !== oy || fresh)) yLog.value = suggestLog(allRows.value.map((r) => r[y]));
}, { immediate: true });

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
  // Before a grain's rows arrive its metrics are unknown: choosing now would stick on a guess.
  if (have.size === 0 || allRows.value.length === 0) return;
  if (pendingPreset) {
    const preset = presets.value.find((p) => p.id === pendingPreset);
    pendingPreset = null;
    if (preset) { selectPreset(preset); return; }
  }
  const xOk = xAxis.value !== null && have.has(xAxis.value);
  const yOk = yAxis.value !== null && have.has(yAxis.value);
  if (radius.value !== null && !have.has(radius.value)) radius.value = null;
  if (colour.value !== null && !have.has(colour.value)) colour.value = null;
  if (xOk && yOk) return;
  const opening = grain.value === "components" && !implicitLanguage.value ? "dms" : "churn-health";
  const fallback = presets.value.find((p) => p.id === opening) ?? presets.value.find((p) => !usesAbstractness(p)) ?? presets.value[0];
  if (fallback) { selectPreset(fallback); return; }
  const cols = numericColumns.value;
  xAxis.value = cols[0];
  yAxis.value = cols.find((c) => c !== cols[0]) ?? cols[0];
  radius.value = null;
}, { immediate: true });

// ─── The plot's reading ───
const niceName = (key: string) => store.statNiceName(key) || key;
const grainNoun = computed(() => (grain.value === "files" ? "files" : "components"));
const rowByName = computed(() => new Map(allRows.value.map((r) => [String(r.name), r])));
const shortNames = computed(() => distinctTails(allRows.value.map((r) => String(r.name))));

const isMainSequence = computed(() => xAxis.value === "modularity__instability" && yAxis.value === "modularity__abstractness");

const reading = computed<PlotReading | null>(() => {
  if ((view.value !== "plot" && view.value !== "matrix") || !xAxis.value || !yAxis.value || filteredRows.value.length === 0) return null;
  return readPlot(filteredRows.value, allRows.value, xAxis.value, yAxis.value, { mainSequence: isMainSequence.value, xLog: xLog.value, yLog: yLog.value });
});

// Corners first by what they say, the far corner (high X, low Y) last so it reads as the list's end.
const readingCells = computed(() => {
  const order = ["tl", "tr", "bl", "br", "pain", "useless"];
  return [...(reading.value?.cells ?? [])].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
});
const cellShare = (n: number) => {
  const total = filteredRows.value.length || 1;
  return Math.max(n > 0 ? 3 : 0, Math.round((n / total) * 100));
};

const cellText = computed<Partial<Record<PlotReading["cells"][number]["id"], string>>>(() => {
  if (!xAxis.value || !yAxis.value) return {};
  if (isMainSequence.value) return { pain: "Zone of pain · stable, concrete", useless: "Zone of uselessness · abstract, unused" };
  const words = activePreset.value?.words ?? {};
  const x = words.x ?? [`Low ${niceName(xAxis.value)}`, `High ${niceName(xAxis.value)}`];
  const y = words.y ?? [`low ${niceName(yAxis.value)}`, `high ${niceName(yAxis.value)}`];
  return { tl: `${x[0]} · ${y[1]}`, tr: `${x[1]} · ${y[1]}`, bl: `${x[0]} · ${y[0]}`, br: `${x[1]} · ${y[0]}` };
});

const missingAxes = computed(() => {
  const x = xAxis.value, y = yAxis.value;
  if (!x || !y) return "";
  const rows = filteredRows.value;
  const lacks = (k: string) => rows.some((r) => !Number.isFinite(metricValue(r, k)));
  const names = [lacks(x) && niceName(x), lacks(y) && niceName(y)].filter(Boolean);
  return names.join(" or ") || "a reading";
});

const selectionMedians = computed(() => {
  if (!xAxis.value || !yAxis.value || selectedNames.value.length < 2) return null;
  const rows = selectedNames.value.map((n) => rowByName.value.get(n)).filter(Boolean) as Row[];
  return { x: quantile(finiteSorted(rows.map((r) => metricValue(r, xAxis.value!))), 0.5), y: quantile(finiteSorted(rows.map((r) => metricValue(r, yAxis.value!))), 0.5) };
});

// ─── Overview prototypes: matrix, strips, profiles ───
// One brush set, one hover and one selection shared by all three, so switching
// between them compares the same question on the same rows.
const isOverview = computed(() => ["matrix", "strips", "profiles"].includes(view.value) && grain.value !== "directories");
const brushes = ref<Brushes>({});
const brushTotal = computed(() => Object.keys(brushes.value).length);
const hoveredName = ref<string | null>(null);
const playRows = computed(() => (brushTotal.value ? filteredRows.value.filter((r) => passes(r, brushes.value)) : filteredRows.value));

const overviewKeys = computed(() => overviewMetrics(numericColumns.value));

// ─── Which metrics each overview draws ───
// Each view keeps its own set per grain, in drawing order, remembered across
// launches; null means "never edited" and follows the defaults. The matrix
// holds fewer, since every added metric adds a row and a column of cells.
type OverviewView = "matrix" | "strips" | "profiles";
const OVERVIEW_VIEWS: OverviewView[] = ["matrix", "strips", "profiles"];
const SET_LIMITS: Record<OverviewView, { min: number; max: number; name: string }> = {
  matrix: { min: 2, max: 8, name: "Matrix" },
  strips: { min: 1, max: 16, name: "Strips" },
  profiles: { min: 2, max: 16, name: "Profiles" },
};
const defaultSet = (v: OverviewView) => (v === "matrix" ? overviewMetrics(numericColumns.value, 6) : overviewKeys.value);
const setStorageKey = (g: Grain, v: OverviewView) => `archstats-metrics-set-${g}-${v}`;
const chosenSets = reactive<Record<string, string[] | null>>({});

watch(grain, (g) => {
  for (const v of OVERVIEW_VIEWS) {
    const k = `${g}:${v}`;
    if (k in chosenSets) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(setStorageKey(g, v)) ?? "null");
      chosenSets[k] = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
    } catch {
      chosenSets[k] = null;
    }
  }
}, { immediate: true });

function metricSet(v: OverviewView) {
  return computed<string[]>({
    get() {
      const have = new Set(numericColumns.value);
      const chosen = chosenSets[`${grain.value}:${v}`];
      const kept = (chosen ?? []).filter((c) => have.has(c)).slice(0, SET_LIMITS[v].max);
      // A saved set this snapshot cannot draw (another language, older engine) falls back to the defaults.
      return chosen && kept.length >= SET_LIMITS[v].min ? kept : defaultSet(v);
    },
    set(keys) {
      chosenSets[`${grain.value}:${v}`] = keys;
      try {
        localStorage.setItem(setStorageKey(grain.value, v), JSON.stringify(keys));
      } catch { /* storage unavailable; the set lives for the session */ }
    },
  });
}

function resetSet(v: OverviewView) {
  chosenSets[`${grain.value}:${v}`] = null;
  try {
    localStorage.removeItem(setStorageKey(grain.value, v));
  } catch { /* nothing stored */ }
}

const matrixSet = metricSet("matrix");
const stripSet = metricSet("strips");
const profileSet = metricSet("profiles");

const stripSort = ref("codesmells__hotspot_score");
watch(stripSet, (keys) => { if (keys.length && !keys.includes(stripSort.value)) stripSort.value = keys[0]; }, { immediate: true });
watch(grain, () => { brushes.value = {}; hoveredName.value = null; });

function setPair([x, y]: [string, string]) {
  xAxis.value = x;
  yAxis.value = y;
}

// A finding on the summary opens its view already set up: the pair, the brush, the rows it is about.
function go(g: Go) {
  if (g.preset) {
    const preset = presets.value.find((p) => p.id === g.preset);
    if (preset) selectPreset(preset);
  }
  if (g.pair) setPair(g.pair);
  brushes.value = g.brushes ?? {};
  if (g.selected) selectedNames.value = [...g.selected];
  if (g.sort) stripSort.value = g.sort;
  view.value = g.view;
}

function openName(name: string) {
  router.push(detailRoute(name));
}

// The focus plot's settings, shared by Plot and the matrix's focus pane.
const plotProps = computed(() => ({
  domainRows: allRows.value,
  selected: selectedNames.value,
  grain: grain.value === "files" ? "file" : "component",
  labelMode: labelMode.value,
  xAxisProperty: xAxis.value!,
  yAxisProperty: yAxis.value!,
  xLog: xLog.value,
  yLog: yLog.value,
  radiusProperty: radius.value,
  colorProperty: colour.value,
  reading: reading.value,
  cellText: cellText.value,
  hiddenGroups: hiddenForPlot.value,
  activeFilters: activeFilters,
  hoveredGroupId: hoveredGroupId.value,
}));

// ─── URL sync ───
watch([grain, view, activePreset], () => {
  const want = {
    grain: grain.value === "components" ? undefined : grain.value,
    view: view.value === "summary" ? undefined : view.value,
    preset: activePreset.value?.id,
  };
  const cur = route.query;
  const same = (Object.keys(want) as Array<keyof typeof want>).every((k) => (cur[k] ?? undefined) === want[k]);
  if (!same) router.replace({ query: { ...cur, ...want } });
});

// A link that set the view up (a pair, a sort, brushes) is applied once and
// then dropped from the URL, so switching views later does not re-apply it.
function arrive(q: typeof route.query) {
  const a = arrivalFrom(q);
  if (!a) return;
  if (a.pair) { pendingPreset = null; setPair(a.pair); }
  if (a.sort) { stripSort.value = a.sort; if (view.value === "table") tableSort.value = a.sort; }
  if (a.brushes) brushes.value = a.brushes;
  const rest = { ...q };
  for (const k of ARRIVAL_KEYS) delete rest[k];
  router.replace({ query: rest });
}
arrive(route.query);

// Sidebar or history changes to the query re-enter the view without a remount.
watch(() => route.query, (q) => {
  // After the grain switch below has cleared its brushes and sort, not before.
  if (arrivalFrom(q)) void nextTick(() => arrive(q));
  if (typeof q.q === "string" && q.q !== searchQuery.value) searchQuery.value = q.q;
  const g: Grain = q.grain === "files" || q.grain === "directories" ? q.grain : "components";
  const v: View = viewOf(q);
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
// Arriving from Show in: the ids come selected.
useIncomingSelection(ids => { selectedNames.value = ids; });

function detailRoute(name: string): string {
  return grain.value === "files" ? `/views/files/${name}` : componentPath(name);
}

function openRow(row: Row) {
  router.push(detailRoute(String(row.name)));
}

const plot = ref<InstanceType<typeof ComponentPlotterDiagram> | null>(null);
// Each chart's figure, for the export button at the end of the row that controls it.
const plotFigure = computed(() => plot.value?.figure ?? null);
const matrixRef = ref<InstanceType<typeof MetricMatrix> | null>(null);
const stripsRef = ref<InstanceType<typeof MetricStrips> | null>(null);
const profilesRef = ref<InstanceType<typeof MetricProfiles> | null>(null);

// ─── Group legend ───
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
