<template>
  <ViewWorkspaceLayout
    title="Connections"
    :nodes-count="model.nodes.value.length"
    :connections-count="model.edges.value.length"
    :stats-labels="{ nodes: 'Nodes', connections: 'Connections' }"
    v-model:search-query="q"
    search-placeholder="Search nodes"
    :tabs="tabs"
    v-model:active-tab="activeTab"
    v-model:is-sidebar-open="inspectorOpen"
    :show-config="hidden.size > 0"
    sidebar-width="340px"
  >
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Source">
        <button type="button" :aria-pressed="source === 'static'" @click="setState({ source: 'static' })">Static</button>
        <button type="button" :aria-pressed="source === 'git'" :title="model.hasGit.value ? 'Shared commits between units' : 'No git history in this snapshot'" @click="setState({ source: 'git' })">Git</button>
        <button type="button" :aria-pressed="source === 'combined'" :title="model.hasGit.value ? 'Imports and shared commits together' : 'No git history in this snapshot'" @click="setState({ source: 'combined' })">Combined</button>
      </div>

      <!-- Level: which dimension rolls the tree up, which colours it, and how far it is open. -->
      <div class="relative">
        <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="levelOpen" title="Roll-up, colour and how far the tree is open" @click.stop="levelOpen = !levelOpen">
          <Icon icon="list-tree" :size="13" class="text-neutral-500"/>
          <span>{{ levelLabel }}</span>
          <Icon icon="chevron-right" :size="12" class="rotate-90 text-neutral-400"/>
        </button>
        <div v-if="levelOpen" class="fixed inset-0 z-40" @click="levelOpen = false"></div>
        <div v-if="levelOpen" class="ui-popover absolute left-0 z-50 mt-1 flex w-72 flex-col gap-3 p-3 animate-in">
          <div class="flex flex-col gap-1">
            <span class="ui-label">Roll up by</span>
            <div class="ui-segmented w-full" role="group" aria-label="Roll up by">
              <button type="button" class="flex-1" :aria-pressed="model.rollupDimension.value === null" @click="setState({ by: 'none' })">None</button>
              <button v-for="d in model.dimensions.value" :key="d" type="button" class="flex-1" :aria-pressed="model.rollupDimension.value === d" @click="setState({ by: d })">{{ d }}</button>
            </div>
            <p v-if="model.dimensions.value.length === 0" class="text-xs text-neutral-500">Create groups to roll components up.</p>
          </div>
          <div v-if="model.dimensions.value.length > 1 || (model.dimensions.value.length === 1 && model.rollupDimension.value === null)" class="flex flex-col gap-1">
            <span class="ui-label">Colour by</span>
            <div class="ui-segmented w-full" role="group" aria-label="Colour by">
              <button v-for="d in model.dimensions.value" :key="d" type="button" class="flex-1" :aria-pressed="model.colorDimension.value === d" @click="setState({ color: d })">{{ d }}</button>
            </div>
          </div>
          <template v-if="rep === 'crosscut'">
            <div class="flex flex-col gap-1">
              <span class="ui-label">Columns</span>
              <div class="ui-segmented w-full" role="group" aria-label="Column lens">
                <button v-for="d in model.dimensions.value.filter(x => x !== crossRowDim)" :key="d" type="button" class="flex-1" :aria-pressed="crossColDim === d" @click="setState({ x: d })">{{ d }}</button>
              </div>
              <p class="text-xs text-neutral-500">Rows follow “Roll up by”.</p>
            </div>
            <div class="flex flex-col gap-1">
              <span class="ui-label">Cells show</span>
              <div class="ui-segmented w-full" role="group" aria-label="Cell measure">
                <button type="button" class="flex-1" :aria-pressed="measure === 'coupling'" @click="setState({ measure: 'coupling' })">Coupling</button>
                <button type="button" class="flex-1" :aria-pressed="measure === 'files'" @click="setState({ measure: 'files' })">Files</button>
                <button type="button" class="flex-1" :aria-pressed="measure === 'cycles'" :disabled="!model.directed.value" @click="setState({ measure: 'cycles' })">Cycles</button>
              </div>
            </div>
          </template>
          <div v-else class="flex flex-col gap-1">
            <span class="ui-label">Open everything to</span>
            <div class="ui-segmented w-full" role="group" aria-label="Open everything to">
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'groups'" :disabled="model.rollupDimension.value === null" @click="applyLevel('groups')">Groups</button>
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'components'" @click="applyLevel('components')">Components</button>
              <button type="button" class="flex-1" :aria-pressed="model.level.value === 'files'" @click="applyLevel('files')">Files</button>
            </div>
            <p class="text-xs text-neutral-500">Double-click any node to open it; close it from its menu.</p>
          </div>
        </div>
      </div>

      <div class="ui-segmented" role="group" aria-label="Representation">
        <button type="button" :aria-pressed="rep === 'graph'" @click="setState({ rep: 'graph' })">Graph</button>
        <button type="button" :aria-pressed="rep === 'matrix'" @click="setState({ rep: 'matrix' })">Matrix</button>
        <button type="button" :aria-pressed="rep === 'chord'" @click="setState({ rep: 'chord' })">Chord</button>
        <button type="button" :aria-pressed="rep === 'list'" title="Every pair as a table, with no cap" @click="setState({ rep: 'list' })">List</button>
        <button type="button" :aria-pressed="rep === 'crosscut'" title="Two lenses at once: rows by one, columns by the other" @click="setState({ rep: 'crosscut' })">Cross-cut</button>
      </div>
      <button v-if="rep === 'matrix' && crossingKeys.size" type="button" class="ui-btn ui-btn-sm" :aria-pressed="showCrossings" :class="{ 'bg-neutral-100': showCrossings }" :title="`Mark the ${crossingKeys.size} group pairs whose imports cross ${lens.active}'s declared order`" @click="showCrossings = !showCrossings">
        <Icon icon="scale" :size="13" :class="showCrossings ? 'text-red-600' : 'text-neutral-500'"/><span>Crossings</span>
      </button>
      <div v-if="rep === 'matrix'" class="ui-segmented" role="group" aria-label="Matrix order" :title="model.directed.value ? '' : 'Co-change has no direction, so it has no levels'">
        <button type="button" :aria-pressed="!orderByLevels" @click="setState({ order: 'name' })">Name</button>
        <button type="button" :aria-pressed="orderByLevels" :disabled="!model.directed.value" :title="`Callers on top, dependencies below; ${levels.depth} levels, tangles boxed`" @click="setState({ order: 'levels' })">Levels</button>
      </div>
    </template>

    <template #actions>
      <button
        type="button"
        class="ui-btn ui-btn-sm"
        :title="draft.isOpen ? `Carry on building ${draft.dimension}` : 'Build a lens in the studio'"
        @click="openBuilder"
      >
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">{{ draft.isOpen ? `Carry on · ${draft.dimension}` : 'Build a lens' }}</span>
      </button>
      <!-- Cycles: hidden, all, or only the one through the selection. -->
      <div class="relative">
        <button
          type="button"
          class="ui-btn ui-btn-sm"
          :class="{ 'bg-neutral-100': cycles !== 'off' && model.cycleSets.value.length > 0 }"
          :aria-expanded="cyclesOpen"
          :disabled="!model.directed.value"
          :title="model.directed.value ? 'Cycles at this level' : 'Cycles need the static source'"
          @click.stop="cyclesOpen = !cyclesOpen"
        >
          <Icon icon="refresh" :size="13" :class="cycles !== 'off' && model.cycleSets.value.length ? 'text-red-600' : 'text-neutral-500'"/>
          <span class="hidden min-[1440px]:inline">In cycles</span>
          <span v-if="model.directed.value && cycleNodeCount" class="font-mono text-xs" :class="cycles !== 'off' ? 'text-red-600' : 'text-neutral-500'" :title="`${cycleNodeCount} nodes sit in ${model.cycleSets.value.length} tangle${model.cycleSets.value.length === 1 ? '' : 's'}: groups where each can reach every other. The Cycles view counts the loops through them.`">{{ cycleNodeCount }}</span>
        </button>
        <div v-if="cyclesOpen" class="fixed inset-0 z-40" @click="cyclesOpen = false"></div>
        <div v-if="cyclesOpen" class="ui-menu absolute right-0 z-50 mt-1 w-64 animate-in" role="menu">
          <div class="ui-menu-title">Cycles at this level</div>
          <button v-for="m in CYCLE_MODES" :key="m.id" type="button" class="ui-menu-item" role="menuitemradio" :aria-checked="cycles === m.id" :class="{ 'is-active': cycles === m.id }" @click="setState({ cycles: m.id }); cyclesOpen = false">
            <span class="w-3 text-accent-600">{{ cycles === m.id ? '•' : '' }}</span>
            <span class="flex-1">{{ m.label }}</span>
            <span v-if="m.id === 'all'" class="font-mono text-xs text-neutral-400">{{ cycleNodeCount }} nodes</span>
          </button>
          <div class="my-1 hairline-b"></div>
          <router-link to="/views/components/cycles" class="ui-menu-item" role="menuitem">
            <Icon icon="external-link" :size="13" class="text-neutral-500"/>
            <span>Open the Cycles view</span>
          </router-link>
        </div>
      </div>

    </template>

    <template #config-popover>
      <div v-if="hidden.size > 0" class="flex items-center justify-between gap-3">
        <span class="text-sm text-neutral-700">{{ hidden.size }} hidden from view</span>
        <button type="button" class="ui-btn ui-btn-sm" @click="hidden = new Set()">Show all</button>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="model.loading.value" text="Loading connections…"/>
      <EmptyState v-else-if="model.error.value" title="Could not load connections" :text="model.error.value" icon="x"/>
      <EmptyState
        v-else-if="source !== 'static' && !model.hasGit.value"
        title="No git history in this snapshot"
        text="Shared commits need a scan of a git checkout. Switch back to Static to see import coupling."
        icon="git-commit"
      >
        <button type="button" class="ui-btn ui-btn-sm mt-3" @click="setState({ source: 'static' })">Show static coupling</button>
      </EmptyState>
      <!-- Too big to draw. With no lens, "close some groups" pointed at
           groups that do not exist; the way out is to make some. -->
      <EmptyState
        v-else-if="overCap && model.dimensions.value.length === 0"
        :title="`${model.nodes.value.length} components are too many for a ${rep}`"
        :text="`A ${rep} reads well up to ${cap} nodes. Group the components first: the lens builder proposes a cut from the names, the imports or the history, you correct it, and the ${rep} draws the groups.`"
        icon="scale"
      >
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="router.push({ path: '/views/dimensions', query: { build: 'new', propose: '1' } })">
          <Icon icon="waypoints" :size="13"/><span>Propose a lens</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" @click="setState({ rep: 'graph' })">Show the graph</button>
      </EmptyState>
      <EmptyState
        v-else-if="overCap"
        :title="`Too many nodes to draw as a ${rep}`"
        :text="`This ${rep} reads well up to ${cap} nodes; there are ${model.nodes.value.length}. Close some groups, scope to a group or search to narrow it, or switch to the graph.`"
        icon="scale"
      >
        <button type="button" class="ui-btn ui-btn-sm" @click="applyLevel('groups')">Close every group</button>
        <button type="button" class="ui-btn ui-btn-sm" @click="setState({ rep: 'graph' })">Show the graph</button>
      </EmptyState>
      <EmptyState v-else-if="model.nodes.value.length === 0" title="Nothing to show" text="Clear the search or the scope to see everything again." icon="search"/>
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
        :title="model.dimensions.value.length === 0 ? 'No lenses yet' : 'One more lens needed'"
        :text="model.dimensions.value.length === 0 ? 'A cross-cut puts one lens in rows and another in columns. Build two ways of slicing this codebase first, Domains and Layers say.' : `${model.dimensions.value[0]} will be the rows. Build a second lens for the columns, Layers say, and the table appears here.`"
        icon="layers"
      >
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="openBuilder">
          <Icon icon="plus" :size="13"/><span>Build a lens</span>
        </button>
        <router-link v-if="isJavaProject" to="/views/units" class="ui-btn ui-btn-sm">
          <Icon icon="braces" :size="13" class="text-neutral-500"/><span>Lanes → lens in Classes</span>
        </router-link>
      </EmptyState>
      <ConnectionsList
        v-else-if="rep === 'list'"
        :nodes="model.nodes.value"
        :edges="model.edges.value"
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
        :edges="model.edges.value"
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
        :highlight="suggestHighlight"
        :levels="rep === 'matrix' && orderByLevels ? levels : null"
        :marked-keys="rep === 'matrix' && showCrossings ? crossingKeys : undefined"
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
        <span class="text-sm text-neutral-700">{{ model.nodes.value.length.toLocaleString() }} components at once draw as a cloud. Grouping them shows the shape.</span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" @click="router.push({ path: '/views/dimensions', query: { build: 'new', propose: '1' } })">Propose a lens</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" aria-label="Dismiss" title="Dismiss" @click="hairballDismissed = true"><Icon icon="x" :size="13"/></button>
      </div>


      <GroupActionBar ref="trayRef" :selected-items="multiList" :kind="multiType" @clear="multi = new Set()"/>

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
              <span>Close {{ menuCloseParent.name }}</span>
            </button>
            <div v-if="menuOpenLabel || menuCloseParent" class="my-1 hairline-b"></div>
            <button v-if="menuNode?.kind !== 'group'" type="button" class="ui-menu-item" role="menuitem" @click="createFromMenu">
              <Icon icon="users" :size="13" class="text-neutral-500"/>
              <span>{{ multi.size > 1 && menu && multi.has(menu.id) ? `Create group from ${multi.size} selected` : 'Create group from this' }}</span>
            </button>
            <button v-if="menuNode?.kind !== 'group' && groupsForMenu.length" type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'add'">
              <Icon icon="folder-closed" :size="13" class="text-neutral-500"/>
              <span class="flex-1">Add to group</span>
              <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
            </button>
            <button v-if="menuNode?.group && menuNode.kind !== 'group'" type="button" class="ui-menu-item" role="menuitem" @click="selectAllInGroup">
              <Icon icon="component" :size="13" class="text-neutral-500"/>
              <span>Select all in {{ menuNode.group }}</span>
            </button>
            <div class="my-1 hairline-b"></div>
            <button type="button" class="ui-menu-item" role="menuitem" @click="isolate">
              <Icon icon="scale" :size="13" class="text-neutral-500"/>
              <span>{{ isolateLabel }}</span>
            </button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="hideFromMenu">
              <Icon icon="x" :size="13" class="text-neutral-500"/>
              <span>{{ multi.size > 1 && menu && multi.has(menu.id) ? `Hide ${multi.size} selected` : 'Hide' }}</span>
            </button>
            <template v-if="menuRoute">
              <div class="my-1 hairline-b"></div>
              <button type="button" class="ui-menu-item" role="menuitem" @click="router.push(menuRoute); menu = null">
                <Icon icon="external-link" :size="13" class="text-neutral-500"/>
                <span>Open detail</span>
              </button>
            </template>
          </template>
          <template v-else>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menuMode = 'main'">
              <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
              <span>Back</span>
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
      />
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import ZoomControls from "~/components/ui/common/ZoomControls.vue";
import Icon from "~/components/ui/common/Icon.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import ConnectionsGraph from "~/components/connections/ConnectionsGraph.vue";
import ConnectionsMatrix from "~/components/connections/ConnectionsMatrix.vue";
import ConnectionsList from "~/components/connections/ConnectionsList.vue";
import { edgeKey as crossingEdgeKey, levelize } from "~/utils/connections";
import { useLensFindings } from "~/composables/useLensFindings";
import ConnectionsChord from "~/components/connections/ConnectionsChord.vue";
import ConnectionsInspector from "~/components/connections/ConnectionsInspector.vue";
import ConnectionsCrosscut from "~/components/connections/ConnectionsCrosscut.vue";
import CrosscutInspector from "~/components/connections/CrosscutInspector.vue";
import { useLensStore } from "~/stores/lens";
import { useJavaMetrics } from "~/composables/useJavaMetrics";
import { buildCrosscut, type CrossGroup } from "~/utils/crosscut";
import { useDraftStore } from "~/stores/draft";
import { useWorkspacesStore } from "~/stores/workspaces";
import { units, useGroupsStore, type UnitKind } from "~/stores/groups";
import { useDataStore } from "~/stores/data";
import { useScopeStore } from "~/stores/scope";
import { useConnectionsModel } from "~/composables/useConnectionsModel";
import {
  type ConnectionsQueryState, type CycleMode, type GroupSuggestion, type Level, type Selection,
  capFor, decodeSelection, detailRoute, encodeSelection, isOverCap, parseConnectionsQuery,
  toConnectionsQuery, toggleSelection,
} from "~/utils/connections";

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
  { id: "off", label: "Hidden" },
  { id: "all", label: "All cycles" },
  { id: "selected", label: "Only through the selection" },
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

function setState(patch: Partial<ConnectionsQueryState> & { by?: string | null }) {
  const next = { ...state.value, ...patch };
  router.replace({ query: toConnectionsQuery(next) });
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
const hidden = ref(new Set<string>());
const openIds = ref(new Set<string>());
// ── Draft: suggestions become a draft dimension the architect edits, then saves ──
const draft = useDraftStore();
const workspaceKey = computed(() => workspaces.active?.id ?? store.datasetKey ?? "default");
watch(workspaceKey, (k) => draft.load(k), { immediate: true });
const lens = useLensStore();
// The active lens's declared order, crossed: marked on the group matrix.
const { check: lensCheck } = useLensFindings(computed(() => lens.active));
const showCrossings = ref(true);
const crossingKeys = computed(() => new Set(lensCheck.value.crossings.map(c => crossingEdgeKey(c.from, c.to))));
const { isJavaProject } = useJavaMetrics();
const activeTab = ref("inspector");
const tabs = computed(() => [{ id: "inspector", label: "Inspector" }]);
// A dimension is built in the studio, so this view draws none of one: no
// dashed hulls, no dials, no draft tab. It reads the graph and the lens.
const EMPTY_SUGGESTIONS: GroupSuggestion[] = [];
const suggestHighlight = computed(() => null);

const menu = ref<{ id: string; x: number; y: number } | null>(null);
const menuMode = ref<"main" | "add">("main");
const trayRef = ref<{ startCreate: (name?: string) => void } | null>(null);

const selectedId = computed(() => (selection.value?.type === "node" ? selection.value.id : null));
const selectedPair = computed<[string, string] | null>(() => (selection.value?.type === "pair" ? [selection.value.from, selection.value.to] : null));
const selectedCycleId = computed(() => (selection.value?.type === "cycle" ? selection.value.id : null));

// With no roll-up chosen in the URL the first dimension rolls up; "none" turns it off and sticks.
const effectiveBy = computed(() => (by.value === "none" ? null : by.value ?? lens.active ?? null));
const model = useConnectionsModel({ source, by: effectiveBy, color, cycles, query: q, hidden, openIds, selectedId, selectedCycleId });
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
  return roll ? `${roll} · ${depth}` : lvl === "files" ? "Files" : lvl === "components" ? "Components" : "Components · mixed";
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
  setState({ sel: id });
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
  if (n.kind === "group") return openIds.value.has(n.id) ? "Close into one node" : "Open into components";
  if (n.kind === "component") return (n.files ?? 0) > 0 ? "Open into files" : null;
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
const isolateLabel = computed(() => {
  const n = menuNode.value;
  if (!n) return "Isolate";
  if (n.kind === "group") return "Scope views to this group";
  return n.group && n.kind === "component" ? `Scope views to ${n.group}` : "Isolate by search";
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
function isolate() {
  const n = menuNode.value;
  menu.value = null;
  if (!n) return;
  if (n.kind === "group") { scopeStore.toggleGroup(n.id); return; }
  const g = n.kind === "component" ? model.rollupGroups.value.find(x => x.name === n.group) ?? groupsStore.groups.find(x => x.name === n.group) : null;
  if (g) scopeStore.toggleGroup(g.id); else setState({ q: n.label });
}
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
    if (menu.value || levelOpen.value || cyclesOpen.value) { menu.value = null; levelOpen.value = false; cyclesOpen.value = false; return; }
    if (multi.value.size) { multi.value = new Set(); return; }
    if (selection.value) setState({ sel: null });
  } else if (event.key === "Enter" && selectedId.value) {
    const n = nodeById.value.get(selectedId.value);
    const to = n ? detailRoute(n.kind, n.id) : null;
    if (to) router.push(to); else if (n) toggleOpen(n.id);
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g" && multi.value.size === 0 && selectedId.value && nodeById.value.get(selectedId.value)?.kind !== "group") {
    event.preventDefault();
    openCreate([selectedId.value]);
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>
