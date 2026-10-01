<template>
  <ViewWorkspaceLayout
      :title="t('pages.metrics.metrics')"
      v-model:search-query="searchQuery"
    :search-placeholder="grain === 'files' ? t('pages.metrics.findFile') : grain === 'directories' ? t('pages.metrics.findDirectory') : t('pages.metrics.findComponent')"
      v-model:is-sidebar-open="isSidebarOpen"
      v-model:active-tab="activeTab"
      :tabs="inspectorTabs"
      :show-config="true"
      sidebar-width="300px"
  >
    <template #stats>
      <span v-if="grain !== 'directories'">{{ grainLabel }} <span class="text-neutral-800">{{ countText }}</span></span>
      <button v-if="isOverview && brushTotal > 0" type="button" class="ui-chip is-active" :title="t('pages.metrics.clearEveryBrush')" @click="brushes = {}">
        <span>{{ brushTotal }} {{t('common.noun.brush', { count: brushTotal })}}</span><Icon icon="x" :size="11"/>
      </button>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.metrics.grain')">
        <button type="button" :aria-pressed="grain === 'components'" @click="grain = 'components'">{{ t('pages.metrics.components') }}</button>
        <button type="button" :aria-pressed="grain === 'files'" @click="grain = 'files'">{{ t('pages.metrics.files') }}</button>
        <button type="button" :aria-pressed="grain === 'directories'" :title="t('pages.metrics.outlineDirectoryEveryNumber')" @click="grain = 'directories'">{{ t('pages.metrics.directories') }}</button>
      </div>
      <div class="ui-segmented" role="group" :aria-label="t('pages.metrics.view')">
        <button type="button" :aria-pressed="view === 'summary' && grain !== 'directories'" :disabled="grain === 'directories'" :title="t('pages.metrics.whatStandsOutWhere')" @click="view = 'summary'">{{ t('pages.metrics.summary') }}</button>
        <button type="button" :aria-pressed="view === 'table' || grain === 'directories'" @click="view = 'table'">{{ t('pages.metrics.table') }}</button>
        <button type="button" :aria-pressed="view === 'plot' && grain !== 'directories'" :disabled="grain === 'directories'" :title="grain === 'directories' ? t('pages.metrics.directoriesHaveNoPlot') : undefined" @click="view = 'plot'">{{ t('pages.metrics.plot') }}</button>
      </div>
      <div class="ui-segmented" role="group" :aria-label="t('pages.metrics.overviewPrototypes')">
        <button type="button" :aria-pressed="view === 'matrix' && grain !== 'directories'" :disabled="grain === 'directories'" :title="t('pages.metrics.prototypeEveryMetricPair')" @click="view = 'matrix'">{{ t('pages.metrics.matrix') }}</button>
        <button type="button" :aria-pressed="view === 'strips' && grain !== 'directories'" :disabled="grain === 'directories'" :title="t('pages.metrics.prototypeEveryMetricStrip')" @click="view = 'strips'">{{ t('pages.metrics.strips') }}</button>
        <button type="button" :aria-pressed="view === 'profiles' && grain !== 'directories'" :disabled="grain === 'directories'" :title="t('pages.metrics.prototypeEveryRowOne')" @click="view = 'profiles'">{{ t('pages.metrics.profiles') }}</button>
      </div>
    </template>

    <template #config-popover>
      <div class="flex flex-col gap-2">
        <span class="ui-label">{{ t('pages.metrics.tableColumns') }}</span>
        <StatSelectMulti :key="pickerKey" v-model="visibleColumns" :options="columnOptions"/>
        <button type="button" class="ui-btn ui-btn-sm self-start" @click="resetColumns">{{ t('pages.metrics.resetDefaults') }}</button>
      </div>
    </template>

    <template #visualizer>
      <!-- Plot controls: a second toolbar row under the frame. -->
      <!-- Plot controls: a second toolbar row under the frame; groups wrap whole rather than clip. -->
      <div v-if="(view === 'plot' || view === 'matrix') && grain !== 'directories'" class="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 hairline-b">
        <div class="flex items-center gap-2">
          <span class="ui-label">{{ t('pages.metrics.preset') }}</span>
          <SingleSelect :model-value="activePreset?.name ?? null" :options="presetNames" :placeholder="t('pages.metrics.custom')" @update:model-value="selectPresetByName"/>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="flex items-center gap-2">
          <span class="ui-label">X</span>
          <StatSelectSingle v-model="xAxis" :options="numericColumns"/>
          <button type="button" class="ui-btn ui-btn-sm ui-log-toggle" :aria-pressed="xLog" :title="t('pages.metrics.logScaleX')" @click="xLog = !xLog">{{ t('pages.metrics.log') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="t('pages.metrics.swapAxes')" :title="t('pages.metrics.swapXY')" @click="swapAxes">
            <Icon icon="arrow-left-right" :size="13"/>
          </button>
          <span class="ui-label">Y</span>
          <StatSelectSingle v-model="yAxis" :options="numericColumns"/>
          <button type="button" class="ui-btn ui-btn-sm ui-log-toggle" :aria-pressed="yLog" :title="t('pages.metrics.logScaleY')" @click="yLog = !yLog">{{ t('pages.metrics.log') }}</button>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="flex items-center gap-2">
          <span class="ui-label">{{ t('pages.metrics.size') }}</span>
          <StatSelectSingle v-model="radius" :options="numericColumns" :placeholder="t('pages.metrics.even')"/>
          <button v-if="radius" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="t('pages.metrics.clearSize')" :title="t('pages.metrics.clearSize')" @click="radius = null">
            <Icon icon="x" :size="12"/>
          </button>
          <span class="ui-label">{{ t('pages.metrics.colour') }}</span>
          <StatSelectSingle v-model="colour" :options="numericColumns" :placeholder="t('pages.metrics.groups')"/>
          <button v-if="colour" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="t('pages.metrics.colourGroup')" :title="t('pages.metrics.colourGroup')" @click="colour = null">
            <Icon icon="x" :size="12"/>
          </button>
        </div>
        <span class="ui-toolbar-sep"></span>
        <div class="ui-segmented" role="group" :aria-label="t('pages.metrics.labels')">
          <button type="button" :aria-pressed="labelMode === 'auto'" :title="t('pages.metrics.nameMarksFurthestOut')" @click="labelMode = 'auto'">{{ t('pages.metrics.outliers') }}</button>
          <button type="button" :aria-pressed="labelMode === 'all'" @click="labelMode = 'all'">{{ t('pages.metrics.all') }}</button>
          <button type="button" :aria-pressed="labelMode === 'none'" :title="t('pages.metrics.onlySelectionMarkUnder')" @click="labelMode = 'none'">{{ t('pages.metrics.none') }}</button>
        </div>
        <!-- These are the plot's controls, so the plot exports from their end. -->
        <ExhibitButton :exhibit="plotFigure" class="ml-auto"/>
      </div>

      <DirectoryTree v-if="grain === 'directories'" :search="searchQuery"/>
      <LoadingState v-else-if="loading" :text="grain === 'files' ? t('pages.metrics.loadingFiles') : t('pages.metrics.loadingComponents')"/>
      <EmptyState
          v-else-if="allRows.length === 0"
          :title="grain === 'files' ? t('pages.metrics.noFileMetricsSnapshot') : t('pages.metrics.noComponentsSnapshot')"
          :text="grain === 'files' ? t('pages.metrics.snapshotHasNoFiles') : t('pages.metrics.openSnapshotLeastOne')"
          icon="table"
      />
      <EmptyState
          v-else-if="filteredRows.length === 0"
          :title="t('pages.metrics.nothingMatches')"
          :text="scope.isActive ? t('pages.metrics.activeScopeSearchLeave') : t('pages.metrics.noNameMatchesSearch')"
          icon="search"
      >
        <button v-if="searchQuery" type="button" class="ui-btn ui-btn-sm" @click="searchQuery = ''">{{ t('pages.metrics.clearSearch') }}</button>
        <button v-if="scope.isActive" type="button" class="ui-btn ui-btn-sm" @click="scope.clear(); scope.setFacet('all')">{{ t('pages.metrics.clearScope') }}</button>
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
            :name-column="grain === 'files' ? t('pages.metrics.file') : t('pages.metrics.component')"
            :export-title="grain === 'files' ? t('pages.metrics.metricsFiles') : t('pages.metrics.metricsComponents')"
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
                        :export-title="brushTotal ? t('pages.metrics.brushes') : t('pages.metrics.metricsPlay')"
                        :name-column="grain === 'files' ? t('pages.metrics.file') : t('pages.metrics.component')" initial-sort="codesmells__hotspot_score"
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
          <RankedRows :rows="playRows" :sort-key="stripSort" :title="brushTotal ? t('pages.metrics.brushes') : t('pages.metrics.all')"
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
                        :export-title="brushTotal ? t('pages.metrics.brushes') : t('pages.metrics.metricsPlay')"
                        :name-column="grain === 'files' ? t('pages.metrics.file') : t('pages.metrics.component')" initial-sort="codesmells__hotspot_score"
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
      <EmptyState v-else :title="t('pages.metrics.pickTwoMetricsPlot')" :text="t('pages.metrics.chooseXYMetric')" icon="settings"/>

      <GroupActionBar v-if="grain !== 'directories'" :selected-items="selectedNames" :kind="grain === 'files' ? 'file' : 'component'" :universe="filteredRows.map(r => String(r.name))" :show-in-except="['metrics']" @replace="selectedNames = $event" @clear="selectedNames = []"/>
    </template>

    <template #visualizer-overlays>
      <ZoomControls v-if="view === 'plot' && filteredRows.length > 0" @zoom-in="plot?.zoomIn()" @zoom-out="plot?.zoomOut()" @reset="plot?.resetZoom()"/>
    </template>

    <template #tab-reading>
      <template v-if="reading && xAxis && yAxis">
        <section class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ reading.kind === 'main-sequence' ? t('pages.metrics.zones') : t('pages.metrics.splitMedians') }}</h3>
          <p v-if="reading.kind === 'medians'" class="text-sm leading-4 text-neutral-500">
<I18nT k="pages.metrics.halfAllSitEither"><template #grainNoun>{{ grainNoun }}</template><template #xAxis>{{ niceName(xAxis) }}</template><template #mx><span class="font-mono text-neutral-700">{{ formatReading(reading.mx) }}</span></template><template #yAxis>{{ niceName(yAxis) }}</template><template #my><span class="font-mono text-neutral-700">{{ formatReading(reading.my) }}</span></template></I18nT> </p>
          <p v-else class="text-sm leading-4 text-neutral-500">{{ t('pages.metrics.distanceMainSequenceAbove') }}</p>
          <div class="-mx-2 flex flex-col">
            <button v-for="cell in readingCells" :key="cell.id" type="button"
                    class="group flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-neutral-200/60"
                    :title="t('pages.metrics.selectThese', { namesLength: cell.names.length })"
                    @click="selectedNames = [...cell.names]">
              <span class="w-8 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-neutral-900">{{ cell.names.length }}</span>
              <span class="min-w-0 grow truncate text-sm text-neutral-700 group-hover:text-neutral-900">{{ cellText[cell.id] }}</span>
              <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200"><span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${cellShare(cell.names.length)}%` }"></span></span>
            </button>
          </div>
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ t('pages.metrics.furthestOut') }}</h3>
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
          <p class="text-sm leading-4 text-neutral-500">{{ reading.kind === 'main-sequence' ? t('pages.metrics.rankedDistanceMainSequence') : t('pages.metrics.rankedHowFarEach') }}</p>
        </section>
        <p v-if="reading.missing > 0" class="text-sm leading-4 text-neutral-500">
          <I18nT k="pages.metrics.withoutNotDrawn"><template #missing><span class="font-mono text-neutral-700">{{ reading.missing }}</span></template><template #value>{{ reading.missing === 1 ? grainNoun.slice(0, -1) : grainNoun }}</template><template #missingAxes>{{ missingAxes }}</template><template #value2>{{t('common.noun.is', { count: reading.missing })}}</template></I18nT> </p>
      </template>
    </template>

    <template #tab-selection>
      <div class="flex items-center justify-between">
        <h3 class="ui-section-title">{{ t('pages.metrics.selection2') }} <span class="ui-tag ml-1">{{ selectedNames.length }}</span></h3>
        <button v-if="selectedNames.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selectedNames = []">{{ t('pages.metrics.clear') }}</button>
      </div>
      <p v-if="selectedNames.length === 0" class="text-sm leading-4 text-neutral-500">{{ t('pages.metrics.nothingSelectedClickMark') }}</p>
      <template v-else>
        <dl v-if="xAxis && yAxis && selectionMedians" class="ui-kv">
          <dt class="truncate">{{ t('pages.metrics.median', { xAxis: niceName(xAxis) }) }}</dt><dd>{{ formatReading(selectionMedians.x) }}</dd>
          <dt class="truncate">{{ t('pages.metrics.median2', { yAxis: niceName(yAxis) }) }}</dt><dd>{{ formatReading(selectionMedians.y) }}</dd>
        </dl>
        <ul class="-mx-2 flex flex-col">
          <li v-for="name in selectedNames" :key="name">
            <router-link :to="detailRoute(name)" class="flex h-7 items-center gap-2 rounded px-2 hover:bg-neutral-200/60" :title="t('pages.metrics.open', { name })">
              <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ shortNames.get(name) ?? name }}</span>
              <span v-if="xAxis && yAxis" class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatReading(rowByName.get(name)?.[xAxis]) }} · {{ formatReading(rowByName.get(name)?.[yAxis]) }}</span>
            </router-link>
          </li>
        </ul>
      </template>
    </template>

    <template #tab-legend>
      <div class="flex items-center justify-between">
        <h3 class="ui-section-title">{{ t('pages.metrics.groups') }}</h3>
        <button v-if="activeFilters.size > 0 || hiddenGroups.size > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="activeFilters.clear(); hiddenGroups.clear()">{{ t('pages.metrics.clear') }}</button>
      </div>
      <p v-if="grainGroups.length === 0" class="text-sm leading-4 text-neutral-500">{{ t('pages.metrics.noGroupsYetSelect') }}</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
            v-for="group in grainGroups"
            :key="group.id"
            type="button"
            class="ui-chip"
            :class="{ 'is-muted': hiddenGroups.has(group.id), 'is-active': !hiddenGroups.has(group.id) && activeFilters.has(group.id) }"
            :title="hiddenGroups.has(group.id) ? t('pages.metrics.showGroup') : t('pages.metrics.clickFilterGroup')"
            @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
            @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
            @mouseleave="hoveredGroupId = null"
        >
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: group.color }" :class="hiddenGroups.has(group.id) ? 'opacity-30' : ''"></span>
          <span :class="hiddenGroups.has(group.id) ? 'line-through' : ''">{{ group.name }}</span>
          <span class="font-mono text-xs text-neutral-500">{{ group.members.length }}</span>
          <span v-if="!hiddenGroups.has(group.id)" class="ml-0.5 text-neutral-400 hover:text-neutral-700" :title="t('pages.metrics.hideGroup')" @click.stop="toggleGroupVisibility(group.id)"><Icon icon="x" :size="11"/></span>
        </button>
      </div>
      <p class="text-sm leading-4 text-neutral-500">{{ t('pages.metrics.marksTakeColourTheir') }}</p>
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
import { t, listOf } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT";

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
  ? [{ id: "reading", label: t("pages.metrics.reading") }, { id: "selection", label: selectedNames.value.length ? t("pages.metrics.selection", { selectedNamesLength: selectedNames.value.length }) : t("pages.metrics.selection2") }, { id: "legend", label: t("pages.metrics.groups") }]
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

const grainLabel = computed(() => (grain.value === "files" ? t("pages.metrics.files") : grain.value === "directories" ? t("pages.metrics.files") : t("pages.metrics.components")));
const countText = computed(() => {
  if (isOverview.value && brushTotal.value) return t("pages.metrics.of", { playRowsLength: playRows.value.length, allRowsLength: allRows.value.length });
  return scope.isActive || searchQuery.value.trim() ? t("pages.metrics.of2", { filteredRowsLength: filteredRows.value.length, allRowsLength: allRows.value.length }) : `${allRows.value.length}`;
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

const CHANGES: [string, string] = [t("pages.metrics.fewChanges"), t("pages.metrics.manyChanges")];
const changes: [string, string] = [t("pages.metrics.fewChanges2"), t("pages.metrics.manyChanges2")];
const PATHS: [string, string] = [t("pages.metrics.offPaths"), t("pages.metrics.manyPaths")];

const ALL_PRESETS: Preset[] = [
  { id: "dms", name: t("pages.metrics.distanceMainSequenceDms"), x: "modularity__instability", y: "modularity__abstractness", r: "complexity__lines", c: "codesmells__hotspot_score" },
  { id: "dms-changes", name: t("pages.metrics.dmsVsCodeChanges"), x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "age-churn-dms", name: t("pages.metrics.ageVsChurnVs"), x: "git__age_in_days", y: "git__commits__total", r: "modularity__distance_main_sequence", words: { x: ["Young", "Old"], y: changes } },
  { id: "betweenness-churn", name: t("pages.metrics.betweennessVsChurn"), x: "graph__betweenness", y: "git__commits__total", c: "codesmells__hotspot_score", words: { x: PATHS, y: changes } },
  { id: "betweenness-avg-indentation", name: t("pages.metrics.betweennessVsAvgIndentation"), x: "graph__betweenness", y: "complexity__indentation__avg", words: { x: PATHS, y: ["shallow", t("pages.metrics.deeplyNested")] } },
  { id: "betweenness-max-indentation", name: t("pages.metrics.betweennessVsMaxIndentation"), x: "graph__betweenness", y: "complexity__indentation__max", words: { x: PATHS, y: ["shallow", t("pages.metrics.deeplyNested")] } },
  { id: "avg-indentation-lines", name: t("pages.metrics.avgIndentationVsLine"), x: "complexity__indentation__avg", y: "complexity__lines", words: { x: ["Shallow", t("pages.metrics.deeplyNested2")], y: ["small", "large"] } },
  { id: "max-indentation-lines", name: t("pages.metrics.maxIndentationVsLine"), x: "complexity__indentation__max", y: "complexity__lines", words: { x: ["Shallow", t("pages.metrics.deeplyNested2")], y: ["small", "large"] } },
  { id: "dms-betweenness", name: t("pages.metrics.dmsVsBetweenness"), x: "modularity__instability", y: "modularity__abstractness", r: "graph__betweenness" },
  { id: "dms-churn", name: t("pages.metrics.dmsVsChurn"), x: "modularity__instability", y: "modularity__abstractness", r: "git__commits__total" },
  { id: "authors-churn", name: t("pages.metrics.authorsVsChurn"), x: "git__authors__total", y: "git__commits__total", r: "complexity__lines", words: { x: [t("pages.metrics.fewAuthors"), t("pages.metrics.manyAuthors")], y: changes } },
  { id: "churn-health", name: t("pages.metrics.churnAgainstHealth"), x: "git__commits__total", y: "codesmells__code_health", r: "complexity__lines", c: "codesmells__hotspot_score", words: { x: CHANGES, y: [t("pages.metrics.lowerHealth"), t("pages.metrics.higherHealth")] } },
  { id: "churn-complexity", name: t("pages.metrics.churnAgainstComplexity"), x: "git__commits__total", y: "codesmells__static_complexity_score", r: "complexity__lines", c: "codesmells__hotspot_score", words: { x: CHANGES, y: ["simpler", t("pages.metrics.moreComplex")] } },
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
  return t("pages.metrics.hasNoAbstractTypes", { lang });
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
  if (isMainSequence.value) return { pain: t("pages.metrics.zonePainStableConcrete"), useless: t("pages.metrics.zoneUselessnessAbstractUnused") };
  const words = activePreset.value?.words ?? {};
  const x = words.x ?? [t("pages.metrics.low", { xAxis: niceName(xAxis.value) }), t("pages.metrics.high", { xAxis: niceName(xAxis.value) })];
  const y = words.y ?? [t("pages.metrics.low2", { yAxis: niceName(yAxis.value) }), t("pages.metrics.high2", { yAxis: niceName(yAxis.value) })];
  return { tl: `${x[0]} · ${y[1]}`, tr: `${x[1]} · ${y[1]}`, bl: `${x[0]} · ${y[0]}`, br: `${x[1]} · ${y[0]}` };
});

const missingAxes = computed(() => {
  const x = xAxis.value, y = yAxis.value;
  if (!x || !y) return "";
  const rows = filteredRows.value;
  const lacks = (k: string) => rows.some((r) => !Number.isFinite(metricValue(r, k)));
  const names = [lacks(x) && niceName(x), lacks(y) && niceName(y)].filter(Boolean);
  return listOf(names, "disjunction") || "a reading";
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
  matrix: { min: 2, max: 8, name: t("pages.metrics.matrix") },
  strips: { min: 1, max: 16, name: t("pages.metrics.strips") },
  profiles: { min: 2, max: 16, name: t("pages.metrics.profiles") },
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
