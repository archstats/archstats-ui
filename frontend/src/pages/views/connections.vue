<template>
  <ViewWorkspaceLayout
    :title="t('pages.connections.connections')"
    :nodes-count="model.nodes.value.length"
    :connections-count="shownEdges.length"
    :stats-labels="{ nodes: t('pages.connections.nodes'), connections: t('pages.connections.connections') }"
    v-model:search-query="q"
    :search-placeholder="t('pages.connections.searchNodes')"
    :tabs="tabs"
    v-model:active-tab="activeTab"
    v-model:is-sidebar-open="inspectorOpen"
    :show-config="hidden.size > 0"
    sidebar-width="340px"
  >
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.connections.source')">
        <button type="button" :aria-pressed="source === 'static'" @click="setState({ source: 'static' })">{{ t('pages.connections.static') }}</button>
        <button type="button" :aria-pressed="source === 'git'" :title="model.hasGit.value ? t('pages.connections.sharedCommitsBetweenUnits') : t('pages.connections.noGitHistorySnapshot')" @click="setState({ source: 'git' })">{{ t('pages.connections.git') }}</button>
        <button type="button" :aria-pressed="source === 'combined'" :title="model.hasGit.value ? t('pages.connections.importsSharedCommitsTogether') : t('pages.connections.noGitHistorySnapshot')" @click="setState({ source: 'combined' })">{{ t('pages.connections.combined') }}</button>
      </div>
      <!-- Imports: on a big graph the edges are the clutter, and most of them
           are one or two references. A floor keeps the ones that carry weight. -->
      <div v-if="source === 'static'" class="relative">
        <button type="button" class="ui-btn ui-btn-sm font-mono" :aria-expanded="refsOpen" :class="{ 'bg-neutral-100': refsFloor > 1 }" :title="t('pages.connections.howManyReferencesImport')" @click="refsOpen = !refsOpen">{{ t('pages.connections.text', { refs: t('common.count.ref', { count: refsFloor }) }) }}</button>
        <template v-if="refsOpen">
          <div class="fixed inset-0 z-40" @click="refsOpen = false"></div>
          <div class="ui-popover absolute left-0 top-full z-50 mt-1 flex w-64 flex-col gap-3 p-3 animate-in">
            <label class="flex items-center justify-between gap-3 text-sm text-neutral-700">{{ t('pages.connections.referencesLeast') }} <input type="number" min="1" class="ui-input ui-input-sm w-20" :value="refsFloor" @change="setState({ minRefs: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })"></label>
            <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.referenceFloor')">
              <button v-for="n in [1, 2, 5, 10, 25]" :key="n" type="button" class="flex-1" :aria-pressed="refsFloor === n" @click="setState({ minRefs: n })">{{ n }}</button>
            </div>
            <p class="text-xs leading-4 text-neutral-500">{{ t('pages.connections.edgesHiddenFloorCycles', { value: weakEdges.toLocaleString(intlLocale), value2: model.edges.value.length.toLocaleString(intlLocale) }) }}</p>
          </div>
        </template>
      </div>
      <!-- Co-change: which pairs, how strong, over what window. Hidden coupling
           is the pairs that change together with no import between them. -->
      <template v-if="source === 'git' && model.hasGit.value">
        <div class="ui-segmented" role="group" :aria-label="t('pages.connections.relation')">
          <button type="button" :aria-pressed="state.relation === 'all'" @click="setState({ relation: 'all', minShared: null, minRate: null })">{{ t('pages.connections.allPairs') }}</button>
          <button type="button" :aria-pressed="state.relation === 'no-import'" :title="t('pages.connections.pairsChangeTogetherWhile')" @click="setState({ relation: 'no-import', rep: 'list' })">{{ t('pages.connections.withoutImport') }}</button>
        </div>
        <div class="relative">
          <button type="button" class="ui-btn ui-btn-sm font-mono" :aria-expanded="floorsOpen" :title="t('pages.connections.howStrongPairMust')" @click="floorsOpen = !floorsOpen">{{ t('pages.connections.shared', { shared: floors.shared, value: Math.round(floors.rate * 100) }) }}</button>
          <template v-if="floorsOpen">
            <div class="fixed inset-0 z-40" @click="floorsOpen = false"></div>
            <div class="ui-popover absolute left-0 top-full z-50 mt-1 flex w-64 flex-col gap-3 p-3 animate-in">
              <label class="flex items-center justify-between gap-3 text-sm text-neutral-700">{{ t('pages.connections.sharedCommitsLeast') }} <input type="number" min="1" class="ui-input ui-input-sm w-20" :value="floors.shared" @change="setState({ minShared: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })"></label>
              <label class="flex items-center justify-between gap-3 text-sm text-neutral-700">{{ t('pages.connections.smallerSideLeast') }} <span class="flex items-center gap-1"><input type="number" min="0" max="100" class="ui-input ui-input-sm w-16" :value="Math.round(floors.rate * 100)" @change="setState({ minRate: Math.min(100, Math.max(0, Number(($event.target as HTMLInputElement).value) || 0)) / 100 })">%</span></label>
              <p class="text-xs leading-4 text-neutral-500">{{ t('pages.connections.smallerSideOneFewer') }}</p>
            </div>
          </template>
        </div>
        <div class="ui-segmented" role="group" :aria-label="t('pages.connections.window')">
          <button v-for="p in (['all', '180', '90', '30'] as const)" :key="p" type="button" :aria-pressed="state.period === p" @click="setState({ period: p })">{{ p === "all" ? t('pages.connections.all') : `${p} d` }}</button>
        </div>
      </template>

      <!-- Level: which dimension rolls the tree up, which colours it, and how far it is open. -->
      <div class="relative">
        <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="levelOpen" :title="t('pages.connections.rollUpColourHow')" @click.stop="levelOpen = !levelOpen">
          <Icon icon="list-tree" :size="13" class="text-neutral-500"/>
          <span>{{ levelLabel }}</span>
          <Icon icon="chevron-right" :size="12" class="rotate-90 text-neutral-400"/>
        </button>
        <div v-if="levelOpen" class="fixed inset-0 z-40" @click="levelOpen = false"></div>
        <div v-if="levelOpen" class="ui-popover absolute left-0 z-50 mt-1 flex w-72 flex-col gap-3 p-3 animate-in">
          <div class="flex flex-col gap-1">
            <span class="ui-label">{{ t('pages.connections.rollUp') }}</span>
            <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.rollUp')">
              <button type="button" class="flex-1" :aria-pressed="model.rollupDimension.value === null" @click="setState({ by: 'none' })">{{ t('pages.connections.none') }}</button>
              <button v-for="d in model.dimensions.value" :key="d" type="button" class="flex-1" :aria-pressed="model.rollupDimension.value === d" @click="setState({ by: d })">{{ d }}</button>
            </div>
            <p v-if="model.dimensions.value.length === 0" class="text-xs text-neutral-500">{{ t('pages.connections.createGroupsRollComponents') }}</p>
          </div>
          <div v-if="model.dimensions.value.length > 1 || (model.dimensions.value.length === 1 && model.rollupDimension.value === null)" class="flex flex-col gap-1">
            <span class="ui-label">{{ t('pages.connections.colour') }}</span>
            <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.colour')">
              <button v-for="d in model.dimensions.value" :key="d" type="button" class="flex-1" :aria-pressed="model.colorDimension.value === d" @click="setState({ color: d })">{{ d }}</button>
            </div>
          </div>
          <template v-if="rep === 'crosscut'">
            <div class="flex flex-col gap-1">
              <span class="ui-label">{{ t('pages.connections.columns') }}</span>
              <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.columnLens')">
                <button v-for="d in model.dimensions.value.filter(x => x !== crossRowDim)" :key="d" type="button" class="flex-1" :aria-pressed="crossColDim === d" @click="setState({ x: d })">{{ d }}</button>
              </div>
              <p class="text-xs text-neutral-500">{{ t('pages.connections.rowsFollowRollUp') }}</p>
            </div>
            <div class="flex flex-col gap-1">
              <span class="ui-label">{{ t('pages.connections.cellsShow') }}</span>
              <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.cellMeasure')">
                <button type="button" class="flex-1" :aria-pressed="measure === 'coupling'" @click="setState({ measure: 'coupling' })">{{ t('pages.connections.coupling') }}</button>
                <button type="button" class="flex-1" :aria-pressed="measure === 'files'" @click="setState({ measure: 'files' })">{{ t('pages.connections.files') }}</button>
                <button type="button" class="flex-1" :aria-pressed="measure === 'cycles'" :disabled="!model.directed.value" @click="setState({ measure: 'cycles' })">{{ t('pages.connections.cycles') }}</button>
              </div>
            </div>
          </template>
          <div v-else class="flex flex-col gap-1">
            <span class="ui-label">{{ t('pages.connections.openEverything') }}</span>
            <div class="ui-segmented w-full" role="group" :aria-label="t('pages.connections.openEverything')">
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'groups'" :disabled="model.rollupDimension.value === null" @click="applyLevel('groups')">{{ t('pages.connections.groups') }}</button>
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'components'" @click="applyLevel('components')">{{ t('pages.connections.components') }}</button>
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'files'" @click="applyLevel('files')">{{ t('pages.connections.files') }}</button>
            </div>
            <p class="text-xs text-neutral-500">{{ t('pages.connections.doubleClickAnyNode') }}</p>
          </div>
        </div>
      </div>

      <div class="ui-segmented" role="group" :aria-label="t('pages.connections.representation')">
        <button type="button" :aria-pressed="rep === 'graph'" @click="setState({ rep: 'graph' })">{{ t('pages.connections.graph') }}</button>
        <button type="button" :aria-pressed="rep === 'matrix'" @click="setState({ rep: 'matrix' })">{{ t('pages.connections.matrix') }}</button>
        <button type="button" :aria-pressed="rep === 'chord'" @click="setState({ rep: 'chord' })">{{ t('pages.connections.chord') }}</button>
        <button type="button" :aria-pressed="rep === 'list'" :title="t('pages.connections.everyPairTableNo')" @click="setState({ rep: 'list' })">{{ t('pages.connections.list') }}</button>
        <button type="button" :aria-pressed="rep === 'crosscut'" :title="t('pages.connections.twoLensesOnceRows')" @click="setState({ rep: 'crosscut' })">{{ t('pages.connections.crossCut') }}</button>
      </div>
      <button v-if="rep === 'matrix' && crossingKeys.size" type="button" class="ui-btn ui-btn-sm" :aria-pressed="showCrossings" :class="{ 'bg-neutral-100': showCrossings }" :title="t('pages.connections.markGroupPairsWhose', { crossingKeysSize: crossingKeys.size, active: lens.active })" @click="showCrossings = !showCrossings">
        <Icon icon="scale" :size="13" :class="showCrossings ? 'text-red-600' : 'text-neutral-500'"/><span>{{ t('pages.connections.crossings') }}</span>
      </button>
      <div v-if="rep === 'graph' && canArrange" class="relative flex items-center gap-1">
        <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="arranging" :class="{ 'bg-neutral-100': arranging }" :title="t('pages.connections.placeNodesHandArrangement')" @click="arranging = !arranging">
          <Icon icon="maximize" :size="13" class="text-neutral-500"/><span>{{ t('pages.connections.arrange') }}</span>
        </button>
        <span v-if="arranging && unplaced" class="ui-tag" :title="t('pages.connections.nodesHaveNoPlace', { unplaced })">{{ t('pages.connections.unplaced', { unplaced }) }}</span>
        <button v-if="arranging && Object.keys(arrangement).length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.connections.forgetLensSArrangement')" @click="resetArrangement">{{ t('pages.connections.reset') }}</button>
      </div>
      <div v-if="rep === 'matrix'" class="ui-segmented" role="group" :aria-label="t('pages.connections.matrixOrder')" :title="model.directed.value ? '' : t('pages.connections.coChangeHasNo')">
        <button type="button" :aria-pressed="!orderByLevels" @click="setState({ order: 'name' })">{{ t('pages.connections.name') }}</button>
        <button type="button" :aria-pressed="orderByLevels" :disabled="!model.directed.value" :title="t('pages.connections.callersTopDependenciesBelow', { depth: levels.depth })" @click="setState({ order: 'levels' })">{{ t('pages.connections.levels') }}</button>
      </div>
    </template>

    <template #actions>
      <button
        type="button"
        class="ui-btn ui-btn-sm"
        :title="draft.isOpen ? t('pages.connections.carryBuilding', { dimension: draft.dimension }) : t('pages.connections.buildLensStudio')"
        @click="openBuilder"
      >
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">{{ draft.isOpen ? t('pages.connections.carry', { dimension: draft.dimension }) : t('pages.connections.buildLens') }}</span>
      </button>
      <!-- Cycles: hidden, all, or only the one through the selection. -->
      <div class="relative">
        <button
          type="button"
          class="ui-btn ui-btn-sm"
          :class="{ 'bg-neutral-100': cycles !== 'off' && model.cycleSets.value.length > 0 }"
          :aria-expanded="cyclesOpen"
          :disabled="!model.directed.value"
          :title="model.directed.value ? t('pages.connections.cyclesLevel') : t('pages.connections.cyclesNeedStaticSource')"
          @click.stop="cyclesOpen = !cyclesOpen"
        >
          <Icon icon="refresh" :size="13" :class="cycles !== 'off' && model.cycleSets.value.length ? 'text-red-600' : 'text-neutral-500'"/>
          <span class="hidden min-[1440px]:inline">{{ t('pages.connections.cycles2') }}</span>
          <span v-if="model.directed.value && cycleNodeCount" class="font-mono text-xs" :class="cycles !== 'off' ? 'text-red-600' : 'text-neutral-500'" :title="t('pages.connections.nodesSitGroupsWhere', { cycleNodeCount, tangles: t('common.count.tangle', { count: model.cycleSets.value.length }) })">{{ cycleNodeCount }}</span>
        </button>
        <div v-if="cyclesOpen" class="fixed inset-0 z-40" @click="cyclesOpen = false"></div>
        <div v-if="cyclesOpen" class="ui-menu absolute right-0 z-50 mt-1 w-64 animate-in" role="menu">
          <div class="ui-menu-title">{{ t('pages.connections.cyclesLevel') }}</div>
          <button v-for="m in CYCLE_MODES" :key="m.id" type="button" class="ui-menu-item" role="menuitemradio" :aria-checked="cycles === m.id" :class="{ 'is-active': cycles === m.id }" @click="setState({ cycles: m.id }); cyclesOpen = false">
            <span class="w-3 text-accent-600">{{ cycles === m.id ? '•' : '' }}</span>
            <span class="flex-1">{{ m.label }}</span>
            <span v-if="m.id === 'all'" class="font-mono text-xs text-neutral-400">{{ t('pages.connections.nodes2', { cycleNodeCount }) }}</span>
          </button>
          <div class="my-1 hairline-b"></div>
          <router-link to="/views/components/cycles" class="ui-menu-item" role="menuitem">
            <Icon icon="external-link" :size="13" class="text-neutral-500"/>
            <span>{{ t('pages.connections.openCyclesView') }}</span>
          </router-link>
        </div>
      </div>

    </template>

    <template #config-popover>
      <div v-if="hidden.size > 0" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-neutral-700">{{ t('pages.connections.hiddenView', { hiddenSize: hidden.size }) }}</span>
          <button type="button" class="ui-btn ui-btn-sm" @click="hidden = new Set()">{{ t('pages.connections.showAll') }}</button>
        </div>
        <ul class="flex max-h-56 flex-col overflow-y-auto">
          <li v-for="id in hiddenList" :key="id" class="flex h-7 items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800" :title="id">{{ labelOf(id) }}</span>
            <button type="button" class="text-xs text-neutral-500 hover:text-neutral-900" @click="unhide(id)">{{ t('pages.connections.show') }}</button>
          </li>
        </ul>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="model.loading.value" :text="t('pages.connections.loadingConnections')"/>
      <EmptyState v-else-if="model.error.value" :title="t('pages.connections.couldNotLoadConnections')" :text="model.error.value" icon="x"/>
      <EmptyState
        v-else-if="source !== 'static' && !model.hasGit.value"
        :title="t('pages.connections.noGitHistorySnapshot')"
        :text="t('pages.connections.sharedCommitsNeedScan')"
        icon="git-commit"
      >
        <button type="button" class="ui-btn ui-btn-sm mt-3" @click="setState({ source: 'static' })">{{ t('pages.connections.showStaticCoupling') }}</button>
      </EmptyState>
      <!-- Too big to draw. With no lens, "close some groups" pointed at
           groups that do not exist; the way out is to make some. -->
      <EmptyState
        v-else-if="overCap && model.dimensions.value.length === 0"
        :title="t('pages.connections.componentsTooMany', { nodesLength: model.nodes.value.length, rep })"
        :text="t('pages.connections.readsWellUpNodes', { rep, cap, rep2: rep })"
        icon="scale"
      >
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="router.push({ path: '/views/dimensions', query: { build: 'new', propose: '1' } })">
          <Icon icon="waypoints" :size="13"/><span>{{ t('pages.connections.proposeLens') }}</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" @click="setState({ rep: 'graph' })">{{ t('pages.connections.showGraph') }}</button>
      </EmptyState>
      <EmptyState
        v-else-if="overCap"
        :title="t('pages.connections.tooManyNodesDraw', { rep })"
        :text="t('pages.connections.readsWellUpNodes2', { rep, cap, nodesLength: model.nodes.value.length })"
        icon="scale"
      >
        <button type="button" class="ui-btn ui-btn-sm" @click="applyLevel('groups')">{{ t('pages.connections.closeEveryGroup') }}</button>
        <button type="button" class="ui-btn ui-btn-sm" @click="setState({ rep: 'graph' })">{{ t('pages.connections.showGraph') }}</button>
      </EmptyState>
      <EmptyState v-else-if="model.nodes.value.length === 0" :title="t('pages.connections.nothingShow')" :text="t('pages.connections.clearSearchScopeSee')" icon="search"/>
      <ConnectionsCrosscut
        v-else-if="rep === 'crosscut' && crossRowDim && crossColDim"
        :rows="crossRows"
        :cols="crossCols"
        :cross="cross"
        :measure="measure"
        :row-dimension="crossRowDim"
        :col-dimension="crossColDim"
        :selected="crossSelected"
        :directed="model.directed.value"
        @select="crossSelected = $event"
        @open="openCell"
        @context="openCell"
      />
      <EmptyState
        v-else-if="rep === 'crosscut'"
        :title="model.dimensions.value.length === 0 ? t('pages.connections.noLensesYet') : t('pages.connections.oneMoreLensNeeded')"
        :text="model.dimensions.value.length === 0 ? t('pages.connections.crossCutPutsOne') : t('pages.connections.willRowsBuildSecond', { value: model.dimensions.value[0] })"
        icon="layers"
      >
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="openBuilder">
          <Icon icon="plus" :size="13"/><span>{{ t('pages.connections.buildLens') }}</span>
        </button>
        <router-link v-if="isJavaProject" to="/views/units" class="ui-btn ui-btn-sm">
          <Icon icon="braces" :size="13" class="text-neutral-500"/><span>{{ t('pages.connections.lanesLensClasses') }}</span>
        </router-link>
      </EmptyState>
      <ConnectionsList
        v-else-if="rep === 'list'"
        :nodes="model.nodes.value"
        :edges="shownEdges"
        :directed="model.directed.value"
        :selected-pair="selectedPair"
        :multi="multi"
        :cycle-keys="model.cycleKeys.value"
        :cycle-nodes="model.cycleNodes.value"
        :with-history="source !== 'static'"
        @select="onSelect"
        @select-pair="onSelectPair"
      />
      <component
        v-else
        :is="renderer"
        ref="rendererRef"
        :nodes="model.nodes.value"
        :edges="shownEdges"
        :directed="model.directed.value"
        :selected-id="selectedId"
        :selected-pair="selectedPair"
        :multi="multi"
        :hovered="null"
        :suggestions="EMPTY_SUGGESTIONS"
        :hulls="model.hulls.value"
        :cycle-keys="model.cycleKeys.value"
        :cycle-nodes="model.cycleNodes.value"
        :cycle-strong="cycles === 'selected' || selection?.type === 'cycle'"
        :badges="model.badges.value"
        :levels="rep === 'matrix' && orderByLevels ? levels : null"
        :marked-keys="rep === 'matrix' && showCrossings ? crossingKeys : undefined"
        :arrangement="rep === 'graph' && arranging ? arrangement : null"
        @place="place"
        @select="onSelect"
        @select-pair="onSelectPair"
        @select-cycle="onSelectCycle"
        @activate="onActivate"
        @context="openContextMenu"
        @lasso="onLasso"
        @close-hull="closeHull"
        @context-hull="openHullMenu"
      />
    </template>

    <template #visualizer-overlays>
      <ZoomControls v-if="rep === 'graph' && !overCap && model.nodes.value.length" @zoom-in="rendererRef?.zoomIn?.()" @zoom-out="rendererRef?.zoomOut?.()" @reset="rendererRef?.resetZoom?.()"/>
      <!-- Hundreds of ungrouped components draw as a cloud. Say what makes it readable, once, out of the way. -->
      <div
        v-if="rep === 'graph' && !hairballDismissed && model.nodes.value.length > 300 && model.dimensions.value.length === 0 && !model.loading.value"
        class="ui-popover absolute left-1/2 top-3 z-10 flex max-w-[640px] -translate-x-1/2 items-center gap-3 px-3 py-2"
      >
        <span class="text-sm text-neutral-700">{{ t('pages.connections.componentsOnceDrawCloud', { nodesLength: model.nodes.value.length.toLocaleString(intlLocale) }) }}</span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" @click="router.push({ path: '/views/dimensions', query: { build: 'new', propose: '1' } })">{{ t('pages.connections.proposeLens') }}</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('pages.connections.dismiss')" :title="t('pages.connections.dismiss')" @click="hairballDismissed = true"><Icon icon="x" :size="13"/></button>
      </div>


      <!-- Path to…: the next click picks the other end. -->
      <div v-if="pathFrom" class="ui-popover absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 px-3 py-2" role="status">
        <Icon icon="route" :size="14" class="text-accent-600"/>
        <span class="text-sm text-neutral-700"><I18nT k="pages.connections.pathClickOtherEnd"><template #pathFromLabel><span class="font-mono">{{ pathFromLabel }}</span></template></I18nT></span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="pathFrom = null">{{ t('pages.connections.cancel') }} <kbd class="ml-1 font-mono text-xs text-neutral-400">Esc</kbd></button>
      </div>
      <div v-else-if="pathNote" class="ui-popover absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 px-3 py-2" role="status">
        <span class="text-sm text-neutral-700">{{ pathNote }}</span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="t('pages.connections.dismiss')" @click="pathNote = ''"><Icon icon="x" :size="13"/></button>
      </div>

      <GroupActionBar
        ref="trayRef"
        :selected-items="multiList"
        :kind="multiType"
        :universe="model.nodes.value.filter(n => n.kind === multiType).map(n => n.id)"
        :show-in-except="['connections']"
        @replace="multi = new Set($event)"
        @clear="multi = new Set()"
      />

      <Teleport to="body">
        <div v-if="menu" class="fixed inset-0 z-40" @click="menu = null" @contextmenu.prevent="menu = null"></div>
        <div v-if="menu" class="ui-menu fixed z-50 w-64 animate-in" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" role="menu">
          <div class="ui-menu-title truncate" :title="menuNode?.label">{{ menuNode?.label }}</div>
          <template v-if="menuMode === 'main'">
            <button v-if="menuOpenLabel" type="button" class="ui-menu-item" role="menuitem" @click="toggleOpenFromMenu">
              <Icon icon="list-tree" :size="13" class="text-neutral-500"/>
              <span>{{ menuOpenLabel }}</span>
            </button>
            <button v-if="menuCloseParent" type="button" class="ui-menu-item" role="menuitem" @click="toggleOpen(menuCloseParent.id); menu = null">
              <Icon icon="list-tree" :size="13" class="text-neutral-500"/>
              <span>{{ t('pages.connections.close', { menuCloseParentName: menuCloseParent.name }) }}</span>
            </button>
            <div v-if="menuOpenLabel || menuCloseParent" class="my-1 hairline-b"></div>
            <button v-if="menuNode?.kind !== 'group'" type="button" class="ui-menu-item" role="menuitem" @click="createFromMenu">
              <Icon icon="users" :size="13" class="text-neutral-500"/>
              <span>{{ multi.size > 1 && menu && multi.has(menu.id) ? t('pages.connections.createGroupSelected', { multiSize: multi.size }) : t('pages.connections.createGroup') }}</span>
            </button>
            <button v-if="menuNode?.kind !== 'group' && groupsForMenu.length" type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'add'">
              <Icon icon="folder-closed" :size="13" class="text-neutral-500"/>
              <span class="flex-1">{{ t('pages.connections.addGroup') }}</span>
              <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
            </button>
            <button v-if="menuNode?.group && menuNode.kind !== 'group'" type="button" class="ui-menu-item" role="menuitem" @click="selectAllInGroup">
              <Icon icon="component" :size="13" class="text-neutral-500"/>
              <span>{{ t('pages.connections.selectAll', { group: menuNode.group }) }}</span>
            </button>
            <div class="my-1 hairline-b"></div>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'focus'">
              <Icon icon="focus" :size="13" class="text-neutral-500"/>
              <span class="flex-1">{{ menuTargets.length > 1 ? t('pages.connections.focusSelected', { menuTargetsLength: menuTargets.length }) : t('pages.connections.focus') }}</span>
              <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
            </button>
            <button v-if="menuScopeGroup" type="button" class="ui-menu-item" role="menuitem" @click="scopeToGroup">
              <Icon icon="scale" :size="13" class="text-neutral-500"/>
              <span class="truncate">{{ t('pages.connections.scopeViews', { menuScopeGroupName: menuScopeGroup.name }) }}</span>
            </button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="hideFromMenu">
              <Icon icon="x" :size="13" class="text-neutral-500"/>
              <span>{{ multi.size > 1 && menu && multi.has(menu.id) ? t('pages.connections.hideSelected', { multiSize: multi.size }) : t('pages.connections.hide') }}</span>
            </button>
            <template v-if="menuRoute || menuShowIn.length">
              <div class="my-1 hairline-b"></div>
              <button v-if="menuRoute" type="button" class="ui-menu-item" role="menuitem" @click="router.push(menuRoute); menu = null">
                <Icon icon="external-link" :size="13" class="text-neutral-500"/>
                <span>{{ t('pages.connections.openDetail') }}</span>
              </button>
              <button v-if="menuShowIn.length" type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'showin'">
                <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/>
                <span class="flex-1">{{ t('pages.connections.show2') }}</span>
                <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
              </button>
            </template>
          </template>
          <template v-else-if="menuMode === 'focus'">
            <button type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'main'">
              <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
              <span>{{ t('pages.connections.back') }}</span>
            </button>
            <div class="ui-menu-title">{{ t('pages.connections.showOnlyEveryView') }}</div>
            <template v-if="menuTargets.length > 1">
              <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('only')">{{ t('pages.connections.selection') }}</button>
              <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('around')"><span class="flex-1">{{ t('pages.connections.selectionNeighbours') }}</span><kbd class="font-mono text-xs text-neutral-400">F</kbd></button>
              <button v-if="model.directed.value" type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('between')">{{ t('pages.connections.everyRouteBetweenThem') }}</button>
            </template>
            <template v-else>
              <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('only')">{{ menuNode?.kind === 'group' ? t('pages.connections.group') : t('pages.connections.only') }}</button>
              <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('around')"><span class="flex-1">{{ t('pages.connections.neighbours') }}</span><kbd class="font-mono text-xs text-neutral-400">F</kbd></button>
              <template v-if="model.directed.value">
                <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('dependencies')">{{ t('pages.connections.whatUses') }}</button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('dependents')">{{ t('pages.connections.whatUses2') }}</button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('reach')">{{ t('pages.connections.everythingReaches') }}</button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('blast')">{{ t('pages.connections.everythingReaches2') }}</button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="startPath(menuTargets); menu = null">{{ t('pages.connections.path') }}</button>
                <button v-if="menu && model.cycleSetOf.value.has(menu.id)" type="button" class="ui-menu-item" role="menuitem" @click="focusMenu('tangle')">{{ t('pages.connections.tangle') }}</button>
              </template>
            </template>
          </template>
          <template v-else-if="menuMode === 'showin'">
            <button type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'main'">
              <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
              <span>{{ t('pages.connections.back') }}</span>
            </button>
            <button v-for="menuShowIn in menuShowIn" :key="menuShowIn.id" type="button" class="ui-menu-item" role="menuitem" @click="menu = null; showIn(menuShowIn)">
              <Icon :icon="menuShowIn.icon" :size="13" class="text-neutral-500"/>
              <span class="flex-1">{{ menuShowIn.label }}</span>
              <Icon v-if="menuShowIn.focus" icon="focus" :size="12" class="text-neutral-400"/>
            </button>
          </template>
          <template v-else>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'main'">
              <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
              <span>{{ t('pages.connections.back') }}</span>
            </button>
            <template v-for="bucket in groupsForMenu" :key="bucket.dimension">
              <div class="ui-menu-title">{{ bucket.dimension }}</div>
              <button v-for="g in bucket.groups" :key="g.id" type="button" class="ui-menu-item" role="menuitem" @click="addToGroup(g.id)">
                <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
                <span class="truncate">{{ g.name }}</span>
                <span class="ml-auto font-mono text-xs text-neutral-400">{{ g.members.length }}</span>
              </button>
            </template>
          </template>
        </div>
      </Teleport>
    </template>

    <template #tab-inspector>
      <CrosscutInspector
        v-if="rep === 'crosscut' && crossRowDim && crossColDim"
        :cross="cross"
        :rows="crossRows"
        :cols="crossCols"
        :row-dimension="crossRowDim"
        :col-dimension="crossColDim"
        :selected="crossSelected"
        :directed="model.directed.value"
        @select="crossSelected = $event"
        @scope="scopeCell"
        @open="openCell"
      />
      <ConnectionsInspector
        v-else
        :selection="selection"
        :nodes="model.nodes.value"
        :edges="model.edges.value"
        :source="source"
        :directed="model.directed.value"
        :open-ids="openIds"
        :memberships="model.membershipsOf"
        :cycle-set-of="model.cycleSetOf.value"
        :cycle-sets="model.cycleSets.value"
        @select="focusNode"
        @select-pair="onSelectPair"
        @select-cycle="onSelectCycle"
        @toggle-open="toggleOpen"
        @scope="scopeStore.toggleGroup($event)"
        @focus="focusFromInspector"
        @path-from="selectedId && startPath([selectedId])"
      />
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import ZoomControls from "~/shared/ui/ZoomControls.vue";
import Icon from "~/shared/ui/Icon.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import ConnectionsGraph from "~/features/connections/components/ConnectionsGraph.vue";
import ConnectionsMatrix from "~/features/connections/components/ConnectionsMatrix.vue";
import ConnectionsList from "~/features/connections/components/ConnectionsList.vue";
import { edgeKey as crossingEdgeKey, levelize } from "~/features/connections/connections";
import { useLensFindings } from "~/features/rules/useLensFindings";
import { useStateStore } from "~/platform/state.store";
const stateStoreForLayout = useStateStore();
import ConnectionsChord from "~/features/connections/components/ConnectionsChord.vue";
import ConnectionsInspector from "~/features/connections/components/ConnectionsInspector.vue";
import ConnectionsCrosscut from "~/features/connections/components/ConnectionsCrosscut.vue";
import CrosscutInspector from "~/features/connections/components/CrosscutInspector.vue";
import { useLensStore } from "~/features/groups/lens.store";
import { useJavaMetrics } from "~/features/java/useJavaMetrics";
import { buildCrosscut, type CrossGroup } from "~/features/connections/crosscut";
import { useDraftStore } from "~/features/lens-builder/draft.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { units, useGroupsStore, type UnitKind } from "~/features/groups/groups.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useConnectionsModel } from "~/features/connections/useConnectionsModel";
import { focusText, type FocusOp } from "~/features/navigation/focusSpec";
import { adjacency, shortestPath, strongestNeighbour } from "~/features/navigation/focus";
import { showInTargets } from "~/features/navigation/showIn";
import { useIncomingSelection } from "~/features/navigation/useIncomingSelection";
import { useShowIn } from "~/features/groups/useShowIn";
import { componentLabel } from "~/features/navigation/routes";
import {
  type ConnectionsQueryState, type CycleMode, type GroupSuggestion, type Level, type Selection,
  capFor, decodeSelection, detailRoute, encodeSelection, isOverCap, parseConnectionsQuery,
  toConnectionsQuery, toggleSelection,
} from "~/features/connections/connections";
import { t, intlLocale } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT";

// One view for every "what is coupled to what" question. The picture is a
// tree (groups ⊃ components ⊃ files) opened per node; source, roll-up
// dimension, colour dimension, representation and cycle mode live in the URL.

const route = useRoute();
const router = useRouter();
const groupsStore = useGroupsStore();
const scopeStore = useScopeStore();
const store = useDataStore();
const workspaces = useWorkspacesStore();

const CYCLE_MODES: Array<{ id: CycleMode; label: string }> = [
  { id: "off", label: t("pages.connections.hidden") },
  { id: "all", label: t("pages.connections.allCycles") },
  { id: "selected", label: t("pages.connections.onlyThroughSelection") },
];

// ── URL state ────────────────────────────────────────────────────────────
const state = computed(() => parseConnectionsQuery(route.query as Record<string, unknown>));
const rep = computed(() => state.value.rep);
// Matrix order: levels by default at group grain, where the layers are the question.
const orderByLevels = computed(() => model.directed.value && (state.value.order ? state.value.order === "levels" : state.value.level === "groups"));
const levels = computed(() => levelize(model.nodes.value.map(n => n.id), model.edges.value));
const source = computed(() => state.value.source);
const cycles = computed(() => state.value.cycles);
const selection = computed<Selection | null>(() => decodeSelection(state.value.sel));
const by = computed(() => state.value.by);
const color = computed(() => state.value.color);

/**
 * Settings replace the history entry; a jump to another node pushes one, so
 * Back (⌘[) walks back through where you have been rather than skipping the
 * whole exploration in one step.
 */
function setState(patch: Partial<ConnectionsQueryState> & { by?: string | null }, push = false) {
  const next = { ...state.value, ...patch };
  const query = toConnectionsQuery(next);
  if (push) router.push({ query }); else router.replace({ query });
}
const q = computed({ get: () => state.value.q, set: (v: string) => setState({ q: v }) });
const measure = computed(() => state.value.measure);

const renderer = computed(() => ({ graph: ConnectionsGraph, matrix: ConnectionsMatrix, chord: ConnectionsChord })[rep.value]);
const rendererRef = ref<any>(null);
const inspectorOpen = ref(true);
const levelOpen = ref(false);
const cyclesOpen = ref(false);
const hairballDismissed = ref(false);

// ── View state (not in the URL) ──────────────────────────────────────────
const multi = ref(new Set<string>());
// ?hl= seeds the selection: a commit's footprint, or anything sent here with Show in, arrives selected.
useIncomingSelection(ids => { multi.value = new Set(ids); });
const hidden = ref(new Set<string>());
const openIds = ref(new Set<string>());
// ── Draft: suggestions become a draft dimension the architect edits, then saves ──
const draft = useDraftStore();
const workspaceKey = computed(() => workspaces.active?.id ?? store.datasetKey ?? "default");
watch(workspaceKey, (k) => draft.load(k), { immediate: true });
const lens = useLensStore();
// Arranged layout: hand-placed positions per lens (or for components when
// nothing rolls up), kept in the workspace. Groups, or up to 150 nodes.
const arranging = ref(false);
const layoutKey = computed(() => `layout:${effectiveBy.value ?? "__components"}`);
const arrangement = computed<Record<string, { x: number; y: number }>>(() => stateStoreForLayout.get(layoutKey.value, {}) ?? {});
const canArrange = computed(() => model.nodes.value.every(n => n.kind === "group") || model.nodes.value.length <= 150);
const unplaced = computed(() => model.nodes.value.filter(n => n.kind !== "file" && !arrangement.value[n.id]).length);
function place(p: { id: string; x: number; y: number }) {
  stateStoreForLayout.set(layoutKey.value, { ...arrangement.value, [p.id]: { x: p.x, y: p.y } });
}
function resetArrangement() { stateStoreForLayout.set(layoutKey.value, null); }
// The active lens's declared order, crossed: marked on the group matrix.
const { check: lensCheck } = useLensFindings(computed(() => lens.active));
const showCrossings = ref(true);
const crossingKeys = computed(() => new Set(lensCheck.value.crossings.map(c => crossingEdgeKey(c.from, c.to))));
const { isJavaProject } = useJavaMetrics();
const activeTab = ref("inspector");
const tabs = [{ id: "inspector", label: t("pages.connections.inspector") }];
// A dimension is built in the studio, so this view draws none of one: no
// dashed hulls, no dials, no draft tab. It reads the graph and the lens.
const EMPTY_SUGGESTIONS: GroupSuggestion[] = [];

const menu = ref<{ id: string; x: number; y: number } | null>(null);
const menuMode = ref<"main" | "add" | "focus" | "showin">("main");
const trayRef = ref<{ startCreate: (name?: string) => void } | null>(null);

const selectedId = computed(() => (selection.value?.type === "node" ? selection.value.id : null));
const selectedPair = computed<[string, string] | null>(() => (selection.value?.type === "pair" ? [selection.value.from, selection.value.to] : null));
const selectedCycleId = computed(() => (selection.value?.type === "cycle" ? selection.value.id : null));

// With no roll-up chosen in the URL the first dimension rolls up; "none" turns it off and sticks.
const effectiveBy = computed(() => (by.value === "none" ? null : by.value ?? lens.active ?? null));
const model = useConnectionsModel({ source, by: effectiveBy, color, cycles, query: q, hidden, openIds, selectedId, selectedCycleId, period: computed(() => state.value.period) });
// Co-change pairs, filtered by relation and floors. Hidden coupling has
// floors by default: a pair of two shared commits is noise.
const floorsOpen = ref(false);
const floors = computed(() => ({
  shared: state.value.minShared ?? (state.value.relation === "no-import" ? 10 : 1),
  rate: state.value.minRate ?? (state.value.relation === "no-import" ? 0.3 : 0),
}));
const refsOpen = ref(false);
const refsFloor = computed(() => state.value.minRefs ?? 1);
const weakEdges = computed(() => (source.value === "static" ? model.edges.value.filter(e => e.references < refsFloor.value).length : 0));
const shownEdges = computed(() => {
  if (source.value === "static") return refsFloor.value > 1 ? model.edges.value.filter(e => e.references >= refsFloor.value) : model.edges.value;
  if (source.value !== "git") return model.edges.value;
  const imports = model.importPairs.value;
  return model.edges.value.filter(e =>
    e.sharedCommits >= floors.value.shared &&
    (e.rate === undefined || e.rate >= floors.value.rate) &&
    (state.value.relation === "all" || !imports.has(model.undirectedKey(e.from, e.to))));
});
// ── Cross-cut: rows by the roll-up dimension, columns by another ──────────
const crossRowDim = computed(() => effectiveBy.value ?? model.dimensions.value[0] ?? null);
const crossColDim = computed(() => {
  const dims = model.dimensions.value.filter(d => d !== crossRowDim.value);
  return state.value.x && dims.includes(state.value.x) ? state.value.x : dims[0] ?? null;
});
const crossGroupsOf = (dim: string | null): CrossGroup[] => (dim ? groupsStore.groups.filter(g => g.dimension === dim).map(g => ({ id: g.id, name: g.name, color: g.color, files: groupsStore.filesOf(g) })) : []);
const crossRows = computed(() => crossGroupsOf(crossRowDim.value));
const crossCols = computed(() => crossGroupsOf(crossColDim.value));
const cross = computed(() => buildCrosscut({ rows: crossRows.value, cols: crossCols.value, filesOfComponent: model.filesOfComponent.value, edges: model.componentEdges.value, source: source.value }));
const crossSelected = ref<string | null>(null);
watch([crossRowDim, crossColDim, source], () => { crossSelected.value = null; });
function scopeCell(cell: { row: string; col: string }) { scopeStore.setGroup(cell.row); scopeStore.toggleGroup(cell.col); }
function openCell(cell: { row: string | null; col: string | null }) {
  if (cell.row && cell.col) scopeCell({ row: cell.row, col: cell.col });
  setState({ rep: "graph", by: crossRowDim.value, color: crossColDim.value });
}

// ── The sidebar opens the builder here: ?build=new or ?build=<dimension> ──
watch(() => route.query.build, (build) => {
  if (typeof build !== "string" || !build) return;
  if (build === "new") draft.startNew(); else draft.fromDimension(build);
  activeTab.value = "draft";
  inspectorOpen.value = true;
  const query = { ...route.query };
  delete query.build;
  router.replace({ query });
}, { immediate: true });


const cap = computed(() => capFor(rep.value));
const cycleNodeCount = computed(() => model.cycleSets.value.reduce((n, set) => n + set.length, 0));
const overCap = computed(() => isOverCap(rep.value, model.nodes.value.length));
const multiList = computed(() => Array.from(multi.value));
const nodeById = computed(() => new Map(model.nodes.value.map(n => [n.id, n])));
const multiType = computed<"component" | "file">(() => (multiList.value.length && model.fileRows.value.has(multiList.value[0]) ? "file" : "component"));
const groupsForMenu = computed(() => groupsStore.groupsByDimension);
const menuKind = computed<UnitKind>(() => (menuNode.value?.kind === "file" ? "file" : "component"));

const levelLabel = computed(() => {
  const roll = model.rollupDimension.value;
  const lvl = model.level.value;
  const depth = lvl === "groups" ? "closed" : lvl === "components" ? "components" : lvl === "files" ? "files" : "mixed";
  return roll ? `${roll} · ${depth}` : lvl === "files" ? t("pages.connections.files") : lvl === "components" ? t("pages.connections.components") : t("pages.connections.componentsMixed");
});

// ── Presets: apply the URL level when it changes, and once data arrives ──
function applyLevel(level: Level) {
  openIds.value = model.openIdsForLevel(level);
  setState({ level });
  levelOpen.value = false;
}
let applied = false;
watch([() => state.value.level, () => model.rollupGroups.value.length, () => model.componentIds.value.size], () => {
  if (model.componentIds.value.size === 0) return;
  if (!applied || model.level.value !== null) { openIds.value = model.openIdsForLevel(state.value.level); applied = true; }
}, { immediate: true });
watch(() => model.rollupDimension.value, () => { openIds.value = model.openIdsForLevel(state.value.level); });

// Switching source, roll-up or snapshot invalidates ids that only made sense before.
watch([source, by, () => store.datasetKey], () => { multi.value = new Set(); hidden.value = new Set(); if (selection.value) setState({ sel: null }); });

// ── Selection ────────────────────────────────────────────────────────────
function onSelect(id: string | null, mods: { shift: boolean; meta: boolean }) {
  if (pathFrom.value && id) { finishPath(id); return; }
  if (id && (mods.shift || mods.meta)) {
    let next = multi.value;
    if (next.size === 0 && selectedId.value && selectedId.value !== id) next = new Set([selectedId.value]);
    multi.value = toggleSelection(next, id);
    if (!selectedId.value) setState({ sel: id });
    return;
  }
  if (!id) multi.value = new Set();
  setState({ sel: id });
}
/**
 * Picking a partner in the inspector selects it and brings it into view. The
 * template has called this since the inspector gained a partner list; nothing
 * defined it, so the click did nothing and Vue warned on every render.
 */
function focusNode(id: string) {
  setState({ sel: id }, true);
  nextTick(() => rendererRef.value?.focusNode?.(id));
}
function onSelectPair(from: string, to: string) { setState({ sel: encodeSelection({ type: "pair", from, to }) }); }
function onSelectCycle(id: string) { setState({ sel: encodeSelection({ type: "cycle", id }) }); }
function onLasso(ids: string[]) { const next = new Set(multi.value); for (const id of ids) next.add(id); multi.value = next; }

// Double-click opens a node one level; Enter and the menu open its detail.
function onActivate(id: string) {
  const n = nodeById.value.get(id);
  if (!n) return;
  if (n.kind === "group" || (n.kind === "component" && (n.files ?? 0) > 0)) { toggleOpen(id); return; }
  const to = detailRoute(n.kind, n.id);
  if (to) router.push(to);
}
function toggleOpen(id: string) {
  const next = new Set(openIds.value);
  const opening = !next.has(id);
  if (opening) next.add(id); else next.delete(id);
  openIds.value = next;
  if (opening && selectedId.value === id) setState({ sel: null });
  if (!opening) setState({ sel: id });
}
function closeParentOf(node: { kind: string; group?: string; id: string }): string | null {
  if (node.kind === "file") return node.group ?? null;
  if (node.kind === "component") { const g = model.rollupGroups.value.find(x => x.members.includes(node.id) && openIds.value.has(x.id)); return g?.id ?? null; }
  return null;
}

// ── Context menu ─────────────────────────────────────────────────────────
const menuNode = computed(() => {
  if (!menu.value) return null;
  const n = nodeById.value.get(menu.value.id);
  if (n) return n;
  if (hullMenuGroup.value && hullMenuGroup.value.id === menu.value.id) return { id: hullMenuGroup.value.id, label: hullMenuGroup.value.name, kind: "group" as const, color: undefined };
  return null;
});
const menuRoute = computed(() => (menuNode.value ? detailRoute(menuNode.value.kind, menuNode.value.id) : null));
// First items of the menu: open this node one level, and/or close the parent it sits in.
const menuOpenLabel = computed(() => {
  const n = menuNode.value;
  if (!n) return null;
  if (n.kind === "group") return openIds.value.has(n.id) ? t("pages.connections.closeOneNode") : t("pages.connections.openComponents");
  if (n.kind === "component") return (n.files ?? 0) > 0 ? t("pages.connections.openFiles") : null;
  return null;
});
const menuCloseParent = computed<{ id: string; name: string } | null>(() => {
  const n = menuNode.value;
  if (!n) return null;
  const id = closeParentOf(n);
  if (!id) return null;
  const name = n.kind === "file" ? (n.group ?? id) : model.rollupGroups.value.find(g => g.id === id)?.name ?? id;
  return { id, name };
});
// The group a node belongs to, for "Scope views to": a lens slice, where Focus is a graph slice.
const menuScopeGroup = computed<{ id: string; name: string } | null>(() => {
  const n = menuNode.value;
  if (!n || n.kind === "file") return null;
  if (n.kind === "group") return { id: n.id, name: t("pages.connections.group2") };
  const g = n.group ? model.rollupGroups.value.find(x => x.name === n.group) ?? groupsStore.groups.find(x => x.name === n.group) : null;
  return g ? { id: g.id, name: g.name } : null;
});
const menuShowIn = computed(() => {
  const n = menuNode.value;
  if (!n || n.kind === "group") return [];
  const ids = menuTargets.value.filter(id => nodeById.value.get(id)?.kind === n.kind);
  return showInTargets(n.kind === "file" ? "file" : "component", ids).filter(t => t.id !== "connections" && t.id !== "detail");
});
const menuTargets = computed(() => (menu.value && multi.value.size > 1 && multi.value.has(menu.value.id) ? Array.from(multi.value) : menu.value ? [menu.value.id] : []));

function openContextMenu(payload: { id: string; x: number; y: number }) {
  menuMode.value = "main";
  menu.value = { id: payload.id, x: Math.min(payload.x, window.innerWidth - 270), y: Math.min(payload.y, window.innerHeight - 360) };
}
function toggleOpenFromMenu() {
  const n = menuNode.value;
  menu.value = null;
  if (!n) return;
  if (n.kind === "group" || (n.kind === "component" && (n.files ?? 0) > 0)) toggleOpen(n.id);
  hullMenuGroup.value = null;
}
function closeHull(key: string) {
  const id = key.startsWith("g:") ? key.slice(2) : key;
  if (openIds.value.has(id)) toggleOpen(id);
}
function openHullMenu(payload: { key: string; x: number; y: number }) {
  // A hull is the open group itself; its menu is the group node's menu.
  const id = payload.key.startsWith("g:") ? payload.key.slice(2) : payload.key;
  const g = model.rollupGroups.value.find(x => x.id === id);
  if (!g) return;
  hullMenuGroup.value = { id: g.id, name: g.name };
  menuMode.value = "main";
  menu.value = { id: g.id, x: Math.min(payload.x, window.innerWidth - 270), y: Math.min(payload.y, window.innerHeight - 360) };
}
const hullMenuGroup = ref<{ id: string; name: string } | null>(null);
function createFromMenu() { openCreate(menuTargets.value); menu.value = null; }
async function openCreate(members: string[]) {
  if (!members.length) return;
  multi.value = new Set(members);
  await nextTick();
  trayRef.value?.startCreate();
}
function addToGroup(groupId: string) { groupsStore.addMembersToGroup(groupId, units(menuKind.value, menuTargets.value)); multi.value = new Set(); menu.value = null; }
function selectAllInGroup() {
  const g = menuNode.value?.group;
  if (!g) return;
  const next = new Set(multi.value);
  for (const n of model.nodes.value) if (n.group === g && n.kind !== "group") next.add(n.id);
  multi.value = next;
  menu.value = null;
}
function scopeToGroup() {
  const g = menuScopeGroup.value;
  menu.value = null;
  if (g) scopeStore.toggleGroup(g.id);
}

// ── Focus ────────────────────────────────────────────────────────────────
// Focus narrows every view to a neighbourhood on the component graph. The
// picture here can be groups, components or files, so a node becomes the
// components it stands for: a group its members, a file its component.
const showIn = useShowIn();
function labelOf(id: string) { return nodeById.value.get(id)?.label ?? componentLabel(id, workspaces.active?.name); }
function anchorsOf(ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const n = nodeById.value.get(id);
    if (n?.kind === "group" || (!n && model.rollupGroups.value.some(g => g.id === id))) {
      for (const m of model.rollupGroups.value.find(g => g.id === id)?.members ?? []) out.add(m);
    } else if (n?.kind === "file") {
      const c = n.group ?? store.fileComponentIndex.get(id);
      if (c) out.add(c);
    } else if (model.componentIds.value.has(id)) out.add(id);
  }
  return Array.from(out);
}
type FocusChoice = FocusOp | "reach" | "blast";
function focusOn(choice: FocusChoice, ids: string[]) {
  const anchors = anchorsOf(ids);
  if (!anchors.length) return;
  const op: FocusOp = choice === "reach" ? "dependencies" : choice === "blast" ? "dependents" : choice;
  const depth = choice === "reach" || choice === "blast" ? null : 1;
  scopeStore.setFocus(focusText({ op, anchors, depth }));
  // The thing pointed at stays selected in what is left.
  const keep = ids.length === 1 ? ids[0] : null;
  if (keep) nextTick(() => { if (nodeById.value.has(keep)) setState({ sel: keep }); });
}
function focusMenu(choice: FocusChoice) {
  const ids = menuTargets.value;
  menu.value = null;
  hullMenuGroup.value = null;
  focusOn(choice, ids);
}
function focusFromInspector(choice: "only" | "around" | "dependencies" | "dependents" | "blast" | "between" | "tangle") {
  const sel = selection.value;
  if (!sel) return;
  if (sel.type === "pair") { focusOn(choice === "between" ? "between" : "only", [sel.from, sel.to]); return; }
  if (sel.type === "cycle") { focusOn("tangle", [sel.id]); return; }
  focusOn(choice, [sel.id]);
}

// Path to…: pick one end, click the other, and only the shortest routes stay.
const pathFrom = ref<string[] | null>(null);
const pathNote = ref("");
const pathFromLabel = computed(() => (pathFrom.value ? (pathFrom.value.length === 1 ? labelOf(pathFrom.value[0]) : t("pages.connections.selected", { pathFromLength: pathFrom.value.length })) : ""));
function startPath(ids: string[]) {
  pathFrom.value = ids.length ? ids : null;
  pathNote.value = "";
}
function finishPath(id: string) {
  const from = anchorsOf(pathFrom.value ?? []);
  const to = anchorsOf([id]);
  pathFrom.value = null;
  if (!from.length || !to.length) return;
  // Said before it is set: an empty focus would blank every view.
  const found = shortestPath(adjacency(store.componentConnections), from, to);
  if (found.nodes.size === 0) { pathNote.value = t("pages.connections.noImportRouteJoins", { value: labelOf(from[0]), value2: labelOf(to[0]) }); return; }
  pathNote.value = found.reversed ? t("pages.connections.nothingLeadsWayRoute", { hops: t("common.count.hop", { count: found.hops }) }) : "";
  scopeStore.setFocus(focusText({ op: "path", anchors: from, to, depth: null }));
}

// With a lens rolled up, a small focus opens its groups: the neighbourhood
// is the point, and closed groups would hide it behind their names.
// Whatever changed the focus -- a menu, the chip, the trail -- the picture
// reframes to the whole of it: a zoom chosen for the old picture cut the new
// neighbourhood off at the edges.
watch(() => scopeStore.focus, (focus) => {
  nextTick(() => rendererRef.value?.resetZoom?.());
  if (!model.rollupDimension.value) return;
  const n = scopeStore.focusMatches?.size ?? 0;
  openIds.value = focus && n > 0 && n <= 80 ? model.openIdsForLevel("components") : model.openIdsForLevel(state.value.level);
});

// ] and [ walk the graph along its heaviest edges, one node at a time.
function walk(dir: "out" | "in") {
  const from = selectedId.value;
  if (!from) return;
  // Not straight back to where the walk came from, unless there is nowhere else.
  const back = walkedFrom.value ? new Set([walkedFrom.value]) : new Set<string>();
  const next = strongestNeighbour(shownEdges.value, from, dir, back) ?? strongestNeighbour(shownEdges.value, from, dir);
  if (!next) return;
  walkedFrom.value = from;
  focusNode(next);
}
const walkedFrom = ref<string | null>(null);

const hiddenList = computed(() => Array.from(hidden.value).sort((a, b) => labelOf(a).localeCompare(labelOf(b))));
function unhide(id: string) { const next = new Set(hidden.value); next.delete(id); hidden.value = next; }
function hideFromMenu() {
  const next = new Set(hidden.value);
  for (const id of menuTargets.value) next.add(id);
  hidden.value = next;
  multi.value = new Set();
  if (selectedId.value && next.has(selectedId.value)) setState({ sel: null });
  menu.value = null;
}

// ── Suggestions ──────────────────────────────────────────────────────────
/** One builder, one place: an open draft is carried on where it was made. */
function openBuilder() {
  router.push({ path: "/views/dimensions", query: draft.isOpen ? {} : { build: "new" } });
}


// ── Keyboard ─────────────────────────────────────────────────────────────
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
  if (event.key === "Escape") {
    if (pathFrom.value) { pathFrom.value = null; return; }
    if (menu.value || levelOpen.value || cyclesOpen.value) { menu.value = null; levelOpen.value = false; cyclesOpen.value = false; return; }
    if (multi.value.size) { multi.value = new Set(); return; }
    if (selection.value) setState({ sel: null });
  } else if (event.key === "Enter" && selectedId.value) {
    const n = nodeById.value.get(selectedId.value);
    const to = n ? detailRoute(n.kind, n.id) : null;
    if (to) router.push(to); else if (n) toggleOpen(n.id);
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "f" || event.key === "F")) {
    const ids = multi.value.size ? Array.from(multi.value) : selectedId.value ? [selectedId.value] : [];
    if (ids.length) { event.preventDefault(); focusOn("around", ids); }
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "]" || event.key === "[")) {
    event.preventDefault();
    walk(event.key === "]" ? "out" : "in");
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g" && multi.value.size === 0 && selectedId.value && nodeById.value.get(selectedId.value)?.kind !== "group") {
    event.preventDefault();
    openCreate([selectedId.value]);
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>
