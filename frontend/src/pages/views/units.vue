<template>
  <ViewWorkspaceLayout
    title="Units"
    v-model:search-query="searchQuery"
    search-placeholder="Search units"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    :show-config="true"
    sidebar-width="360px"
  >
    <template #stats>
      <span>Units <span class="text-neutral-800">{{ classes.size }}</span><span v-if="scope.isActive"> of {{ totalClasses }}</span></span>
      <span class="text-neutral-300">·</span>
      <span>Connections <span class="text-neutral-800">{{ edges.length }}</span></span>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Mode">
        <button type="button" :aria-pressed="mode === 'top'" @click="setMode('top')">Top N</button>
        <button type="button" :aria-pressed="mode === 'explore'" @click="setMode('explore')">Explore</button>
      </div>
      <label v-if="mode === 'top'" class="flex items-center gap-1.5">
        <span class="ui-label">Top</span>
        <input
          type="number"
          min="10"
          max="300"
          step="10"
          class="ui-input ui-input-sm ui-input-mono w-16 text-right"
          :value="topNInput"
          aria-label="Number of classes to show"
          @input="onTopNInput"
        />
      </label>
    </template>

    <template #actions>
      <button v-if="mode === 'explore'" type="button" class="ui-btn ui-btn-sm" title="Choose classes to start exploring from" @click="pickerOpen = true">
        <Icon icon="braces" :size="13" class="text-neutral-500"/>
        <span>Seeds</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="classes.size === 0" title="Save every lane as a group in a Layer lens, so the other views can roll up and colour by it" @click="saveLanesAsDimension">
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">Lanes → lens</span>
      </button>
    </template>

    <template #config-popover>
      <label class="flex flex-col gap-1">
        <span class="ui-label">Framework</span>
        <select class="ui-input ui-input-sm w-full" :value="fwOverride ?? AUTO" aria-label="Framework" @change="setFramework(($event.target as HTMLSelectElement).value)">
          <option :value="AUTO">Auto · {{ detected.confident ? profileById(detected.id).label : 'unsure, using structure' }}</option>
          <option v-for="p in PROFILES" :key="p.id" :value="p.id">{{ p.label }}<template v-if="voteCount(p.id)"> · {{ voteCount(p.id) }} classes</template></option>
        </select>
      </label>
      <p class="-mt-2 text-sm leading-4 text-neutral-500">{{ detected.reason }}</p>
      <p class="-mt-1 text-sm leading-4 text-neutral-500">Lanes: {{ profile.lanes.map(l => l.label).join(', ') }}.</p>
      <label v-if="lens.active" class="flex flex-col gap-1">
        <span class="ui-label">Colour</span>
        <div class="ui-segmented w-full" role="group" aria-label="Colour by">
          <button type="button" class="flex-1" :aria-pressed="!colorByLens" @click="colorByLens = false">Lane</button>
          <button type="button" class="flex-1" :aria-pressed="colorByLens" @click="colorByLens = true">{{ lens.active }}</button>
        </div>
      </label>
      <Checkbox v-model="laneLayout">Lanes</Checkbox>
      <p class="-mt-2 text-sm leading-4 text-neutral-500">Keep every class inside its lane. Off gives a plain force layout.</p>
      <Checkbox v-model="includeExternal">Include external wiring</Checkbox>
      <p class="-mt-2 text-sm leading-4 text-neutral-500">Keep references to classes that have no file in this snapshot.</p>
    </template>

    <template #visualizer>
      <EmptyState v-if="!hasTables" title="No units in this snapshot" text="The scan produced no named things to read. Re-scan with a build that records units." icon="braces"/>
      <!-- Units without edges between them. Honest rather than empty: the
           list, the lanes and the groups all work; the graph does not,
           because only Java resolves an import to the individual type it
           names. Go, TypeScript and Python record imports at component
           level, so there is nothing to draw an arrow between. -->
      <EmptyState
        v-else-if="!hasUnitEdges"
        title="No connections between units"
        :text="`${classes.size} units read. Only Java resolves an import to the individual type it names; this language records imports between components, so there is nothing to draw between units yet. The Components views show those edges.`"
        icon="braces"
      />
      <LoadingState v-else-if="loading" text="Loading class map…"/>
      <EmptyState v-else-if="mode === 'explore' && explored.length === 0" title="Start from a few classes" :text="`Pick entry points or the classes you care about, then grow the picture one layer at a time. ${profile.lanes[0].label} make good starts.`" icon="braces">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="pickerOpen = true">Choose classes…</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="setMode('top')">Show the top {{ topN }} instead</button>
      </EmptyState>
      <EmptyState v-else-if="graphNodes.length === 0" title="No connections" text="No class references match the current scope and filters." icon="braces"/>
      <ClassGraph
        :node-colors="nodeColors"
        v-else
        ref="graphRef"
        :nodes="graphNodes"
        :edges="graphEdges"
        :selected-id="selectedId"
        :path-ids="tracePath"
        :search-query="searchQuery"
        :lanes="laneLayout"
        :lane-defs="profile.lanes"
        @select="onGraphSelect"
      />
      <SeedPicker v-model:open="pickerOpen" :classes="seedClasses" :profile="profile" :recent="recentSeeds" @start="startFrom"/>
    </template>

    <template #visualizer-overlays>

      <GroupActionBar ref="trayRef" :selected-items="trayFiles" kind="file" noun="class" @clear="trayFiles = []"/>
      <!-- Detection was not sure: ask once, remember per workspace. -->
      <div v-if="hasTables && !loading && askFramework" class="ui-popover absolute left-1/2 top-3 z-20 flex w-[560px] max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2 p-3" role="region" aria-label="Which framework is this">
        <div class="flex items-start gap-2">
          <Icon icon="braces" :size="14" class="mt-0.5 shrink-0 text-neutral-500"/>
          <div class="min-w-0 flex-1">
            <p class="text-base font-medium text-neutral-900">Which framework is this codebase built on?</p>
            <p class="text-sm leading-4 text-neutral-500">{{ detected.reason }} Lanes use structure until you choose.</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 pl-6">
          <button v-for="c in askOptions" :key="'ask-' + c.id" type="button" class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': c === askOptions[0] && c.strong > 0 }" :title="`${c.strong} strong, ${c.weak} weak signals`" @click="setFramework(c.id)">
            {{ c.label }} <span class="font-mono text-xs opacity-70">{{ c.strong + c.weak }}</span>
          </button>
          <button type="button" class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': !askOptions[0] || askOptions[0].strong === 0 }" @click="setFramework('structure')">By structure</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="fwDismissed = true">Decide later</button>
        </div>
      </div>
      <template v-if="hasTables && !loading && graphNodes.length > 0">
        <div class="pointer-events-none absolute bottom-4 left-3 z-10 font-mono text-sm text-neutral-500">
          <span v-if="mode === 'top'">Top {{ topN }}</span><span v-else>Explored</span>
          · {{ graphNodes.length }} classes · {{ graphEdges.length }} edges
        </div>
        <ZoomControls @zoom-in="graphRef?.zoomIn()" @zoom-out="graphRef?.zoomOut()" @reset="graphRef?.resetZoom()"/>
      </template>
    </template>

    <!-- Class -->
    <template #tab-class>
      <EmptyState v-if="!selectedMeta" title="No class selected" text="Click a node on the graph, or pick a class from a list." icon="braces"/>
      <template v-else>
        <div class="flex flex-col gap-2">
          <h3 class="ui-section-title">Class</h3>
          <p class="break-all font-mono text-sm leading-4 text-neutral-900" :title="selectedMeta.id">{{ selectedMeta.id }}</p>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="ui-tag"><span class="mr-1.5 h-2 w-2 rounded-full" :class="ROLE_DOT[selectedMeta.role]"></span>{{ ROLE_LABEL[selectedMeta.role] }}</span>
            <span v-if="!selectedMeta.file" class="ui-tag">external</span>
          </div>
          <dl class="ui-kv">
            <dt>Component</dt>
            <dd>
              <router-link v-if="selectedMeta.component" :to="`/views/components/${selectedMeta.component}`" class="font-mono text-sm text-neutral-900 hover:underline">{{ store.getComponentName(selectedMeta.component) }}</router-link>
              <span v-else class="text-neutral-400">none</span>
            </dd>
            <dt>References</dt>
            <dd class="font-mono tabular-nums">{{ outgoing.length }} out · {{ incoming.length }} in</dd>
          </dl>
          <div class="flex flex-wrap items-center gap-1.5">
            <router-link v-if="selectedMeta.file" :to="`/views/files/${selectedMeta.file}`" class="ui-btn ui-btn-sm">
              <Icon icon="file-code" :size="13" class="text-neutral-500"/><span>Open file</span>
            </router-link>
            <button type="button" class="ui-btn ui-btn-sm" @click="traceFromHere(selectedMeta.id)">
              <Icon icon="route" :size="13" class="text-neutral-500"/><span>Trace from here</span>
            </button>
            <button v-if="mode === 'explore' && !exploredSet.has(selectedMeta.id)" type="button" class="ui-btn ui-btn-sm" @click="addExplored(selectedMeta.id)">
              <Icon icon="plus" :size="13" class="text-neutral-500"/><span>Add</span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1 hairline-t pt-3">
          <h3 class="ui-section-title">References out <span class="ml-1 font-mono text-neutral-400">{{ outgoing.length }}</span></h3>
          <p v-if="outgoing.length === 0" class="text-sm text-neutral-500">References nothing in the snapshot.</p>
          <ul v-else class="flex flex-col">
            <li v-for="n in outgoing" :key="'out-' + n.id" class="flex h-7 items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="ROLE_DOT[n.role]"></span>
              <button type="button" class="min-w-0 grow truncate text-left font-mono text-sm text-neutral-900 hover:underline" :title="n.id" @click="select(n.id)">{{ n.name }}</button>
              <span class="ui-tag">{{ n.refs }}</span>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-1 hairline-t pt-3">
          <h3 class="ui-section-title">References in <span class="ml-1 font-mono text-neutral-400">{{ incoming.length }}</span></h3>
          <p v-if="incoming.length === 0" class="text-sm text-neutral-500">Nothing in the snapshot references this class.</p>
          <ul v-else class="flex flex-col">
            <li v-for="n in incoming" :key="'in-' + n.id" class="flex h-7 items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="ROLE_DOT[n.role]"></span>
              <button type="button" class="min-w-0 grow truncate text-left font-mono text-sm text-neutral-900 hover:underline" :title="n.id" @click="select(n.id)">{{ n.name }}</button>
              <span class="ui-tag">{{ n.refs }}</span>
            </li>
          </ul>
        </div>
      </template>
    </template>

    <!-- Explore -->
    <template #tab-explore>
      <!-- Seeds -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <h3 class="ui-section-title">Explored <span class="ml-1 font-mono text-neutral-400">{{ explored.length }}</span></h3>
          <button type="button" class="ui-btn ui-btn-sm ml-auto" @click="pickerOpen = true">
            <Icon icon="plus" :size="13" class="text-neutral-500"/><span>Add classes</span>
          </button>
          <button v-if="explored.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="clearExplored">Clear</button>
        </div>
        <p v-if="explored.length === 0" class="text-sm text-neutral-500">Nothing explored yet. Choose classes to start from.</p>
        <template v-else>
          <div class="flex flex-wrap items-center gap-1">
            <button v-for="lane in exploredLanes" :key="'xl-' + lane.id" type="button" class="ui-chip" :class="{ 'is-active': exploredLaneFilter === lane.id }" @click="exploredLaneFilter = exploredLaneFilter === lane.id ? null : lane.id">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(lane.color)"></span>
              <span>{{ lane.label }}</span>
              <span class="font-mono text-xs text-neutral-400">{{ lane.count }}</span>
            </button>
          </div>
          <label v-if="explored.length > 12" class="relative flex items-center">
            <Icon icon="search" :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
            <input v-model="exploredSearch" type="search" class="ui-input ui-input-sm w-full pl-6" placeholder="Filter explored classes" aria-label="Filter explored classes"/>
          </label>
          <ul class="flex flex-col">
            <li v-for="id in exploredVisible" :key="'x-' + id" class="group flex h-7 items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="ROLE_DOT[metaOf(id).role]"></span>
              <button type="button" class="min-w-0 grow truncate text-left font-mono text-sm text-neutral-900 hover:underline" :class="{ 'font-semibold': id === selectedId }" :title="id" @click="select(id)">{{ metaOf(id).name }}</button>
              <button type="button" class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-900 focus:opacity-100 group-hover:opacity-100" :aria-label="`Remove ${metaOf(id).name}`" @click="removeExplored(id)"><Icon icon="x" :size="12"/></button>
            </li>
          </ul>
          <button v-if="exploredFiltered.length > exploredVisible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet self-start" @click="exploredShowAll = true">Show all {{ exploredFiltered.length }}</button>
          <div class="flex items-center gap-2">
            <button type="button" class="ui-btn ui-btn-sm" title="Make a group of the explored classes, in the lens you choose" @click="saveAsFileGroup">
              <Icon icon="users" :size="13" class="text-neutral-500"/><span>Create group…</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Next layer: the few classes worth adding next, with the reason -->
      <div v-if="explored.length" class="flex flex-col gap-2 hairline-t pt-3">
        <div class="flex items-center gap-2">
          <h3 class="ui-section-title">Next layer <span class="ml-1 font-mono text-neutral-400">{{ nextLayer.total }}</span></h3>
          <button v-if="nextLayer.shown.length" type="button" class="ui-btn ui-btn-sm ml-auto" :title="`Add the ${Math.min(5, nextLayer.shown.length)} most relevant`" @click="addCandidates(nextLayer.shown.slice(0, 5).map(c => c.id))">Add top {{ Math.min(5, nextLayer.shown.length) }}</button>
          <button v-if="nextLayer.shown.length > 5" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="addCandidates(nextLayer.shown.map(c => c.id))">Add {{ nextLayer.shown.length }}</button>
        </div>
        <p v-if="nextLayer.total === 0" class="text-sm text-neutral-500">Every reachable class is already explored.</p>
        <template v-else>
          <div class="flex flex-wrap items-center gap-1">
            <button v-for="lane in nextLayer.lanes" :key="'nl-' + lane.id" type="button" class="ui-chip" :class="{ 'is-active': nextLaneFilter === lane.id }" @click="nextLaneFilter = nextLaneFilter === lane.id ? null : lane.id">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(lane.color)"></span>
              <span>{{ lane.label }}</span>
              <span class="font-mono text-xs text-neutral-400">{{ lane.count }}</span>
            </button>
          </div>
          <ul class="flex flex-col">
            <li v-for="c in nextLayer.shown" :key="'cand-' + c.id" class="flex h-9 items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="ROLE_DOT[c.role]"></span>
              <div class="flex min-w-0 grow flex-col">
                <button type="button" class="min-w-0 truncate text-left font-mono text-sm text-neutral-900 hover:underline" :title="c.id" @click="select(c.id)">{{ c.name }}</button>
                <span class="truncate text-xs text-neutral-500">via {{ c.viaName }}<template v-if="c.near"> · same {{ c.near }}</template><template v-if="c.hub"> · hub</template><template v-if="c.test"> · test</template></span>
              </div>
              <span class="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100" :title="`Relevance ${c.score}`"><span class="block h-full bg-accent-500" :style="{ width: c.score + '%' }"></span></span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-icon" :aria-label="`Add ${c.name}`" :title="`Add ${c.name}`" @click="addExplored(c.id)"><Icon icon="plus" :size="13"/></button>
            </li>
          </ul>
          <div class="flex flex-wrap items-center gap-2">
            <button v-if="nextLayer.weaker > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="nextShowWeak = !nextShowWeak">{{ nextShowWeak ? 'Hide' : 'Show' }} {{ nextLayer.weaker }} weaker</button>
            <button v-if="nextLayer.hubs > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="nextShowHubs = !nextShowHubs">{{ nextShowHubs ? 'Hide' : 'Show' }} {{ nextLayer.hubs }} hubs</button>
            <button v-if="nextLayer.tests > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="nextShowTests = !nextShowTests">{{ nextShowTests ? 'Hide' : 'Show' }} {{ nextLayer.tests }} tests</button>
          </div>
        </template>
      </div>
    </template>

    <!-- Trace -->
    <template #tab-trace>
      <div class="flex flex-col gap-2">
        <h3 class="ui-section-title">Path</h3>
        <EmptyState v-if="!hasIndirect" title="No path table" text="This snapshot has no java_class_connections_indirect table to trace through." icon="route"/>
        <template v-else>
          <label class="flex flex-col gap-1">
            <span class="ui-label">From</span>
            <input v-model="traceSource" list="class-graph-names" class="ui-input ui-input-sm ui-input-mono" placeholder="Full class name" aria-label="Trace source"/>
          </label>
          <label class="flex flex-col gap-1">
            <span class="ui-label">To</span>
            <input v-model="traceTarget" list="class-graph-names" class="ui-input ui-input-sm ui-input-mono" placeholder="Full class name" aria-label="Trace target"/>
          </label>
          <datalist id="class-graph-names">
            <option v-for="c in classList" :key="'dl-' + c.id" :value="c.id"></option>
          </datalist>
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!traceSource || !traceTarget || traceState === 'loading'" @click="runTrace">Trace</button>
            <button type="button" class="ui-btn ui-btn-sm" :disabled="!traceSource && !traceTarget" @click="reverseTrace">Reverse</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="traceState === 'idle' && !traceSource && !traceTarget" @click="clearTrace">Clear</button>
          </div>
        </template>
      </div>

      <div v-if="hasIndirect" class="flex flex-col gap-2 hairline-t pt-3">
        <h3 class="ui-section-title">Result</h3>
        <LoadingState v-if="traceState === 'loading'" text="Tracing…"/>
        <p v-else-if="traceState === 'idle'" class="text-sm text-neutral-500">Pick two classes and trace the shortest reference path between them.</p>
        <p v-else-if="traceState === 'error'" class="text-sm text-red-700">{{ traceError }}</p>
        <EmptyState v-else-if="traceState === 'none'" title="No path between these classes" text="Nothing references its way from the source to the target." icon="route"/>
        <template v-else>
          <p class="font-mono text-sm text-neutral-500">{{ tracePath.length - 1 }} hops</p>
          <ol class="flex flex-col">
            <li v-for="(id, i) in tracePath" :key="'hop-' + i + id" class="flex h-7 items-center gap-2">
              <span class="w-5 shrink-0 text-right font-mono text-sm tabular-nums text-neutral-400">{{ i }}</span>
              <span class="h-2 w-2 shrink-0 rounded-full" :class="ROLE_DOT[metaOf(id).role]"></span>
              <button type="button" class="min-w-0 grow truncate text-left font-mono text-sm text-neutral-900 hover:underline" :class="{ 'font-semibold': id === selectedId }" :title="id" @click="select(id)">{{ metaOf(id).name }}</button>
            </li>
          </ol>
          <p v-if="mode === 'top' && !pathOnGraph" class="text-sm text-neutral-500">Part of this path is outside the top {{ topN }}. Switch to Explore to see all of it.</p>
        </template>
      </div>
    </template>

    <!-- Legend -->
    <template #tab-legend>
      <div class="flex flex-col gap-2">
        <h3 class="ui-section-title">Lanes · {{ profile.label }}</h3>
        <ul class="flex flex-col">
          <li v-for="role in ROLE_ORDER" :key="'legend-' + role" class="flex h-7 items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="ROLE_DOT[role]"></span>
            <span class="grow text-sm text-neutral-800">{{ ROLE_LABEL[role] }}</span>
            <span class="font-mono text-sm tabular-nums text-neutral-500">{{ roleCounts[role] }}</span>
          </li>
        </ul>
      </div>
      <div class="flex flex-col gap-1 hairline-t pt-3 text-sm leading-4 text-neutral-500">
        <h3 class="ui-section-title mb-1">Reading the graph</h3>
        <p>An arrow points from the referencing class to the class it references. Node size grows with the number of connections.</p>
        <p>Hover to see a class's neighbours, click to inspect it, drag to pin it, double-click to release it.</p>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import ClassGraph, { type ClassGraphEdge, type ClassGraphNode, type ClassRole } from "~/components/java/ClassGraph.vue"
import SeedPicker, { type SeedClass } from "~/components/java/SeedPicker.vue"
import { AUTO, PROFILES, classify, detectFramework, laneDotClass, profileById } from "~/utils/javaFrameworks"
import { frameworkStorageKey, rememberedFramework, shortName, type RawClass } from "~/utils/javaFacts"
import { loadUnits } from "~/utils/units"
import ZoomControls from "~/components/ui/common/ZoomControls.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Checkbox from "~/components/ui/common/Checkbox.vue"
import Icon from "~/components/ui/common/Icon.vue"
import { useDataStore } from "~/stores/data"
import { units, useGroupsStore } from "~/stores/groups"
import { useScopeStore } from "~/stores/scope"
import { useLensStore } from "~/stores/lens"
import { useDraftStore } from "~/stores/draft"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"
import { useWorkspacesStore } from "~/stores/workspaces"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { reverseAdjacency, scoreCandidates, type Adjacency } from "~/utils/javaRelevance"

// One view for Java classes: a Top-N hub graph or a seed-and-expand explorer
// on the same canvas, with the class inspector, the explorer and the path
// tracer as inspector tabs. Everything after the two initial loads is sliced
// client-side; only a trace runs a query, one per trace.

interface ClassMeta {
  id: string
  name: string
  file: string
  component: string
  role: ClassRole
}
interface Neighbour extends ClassMeta { refs: number }
interface Candidate extends ClassMeta { score: number; viaName: string; hub: boolean; test: boolean; near: "package" | "component" | null }

const store = useDataStore()
const groupsStore = useGroupsStore()
const scope = useScopeStore()
const workspaces = useWorkspacesStore()
const route = useRoute()
const router = useRouter()

// Roles are lanes of the active framework profile: detected from the class
// facts, or chosen in Configure (kept in the URL as ?fw=).
// A choice is remembered per workspace, so an unsure detection asks once.
const FW_KEY = () => frameworkStorageKey(workspaces.active?.id, store.datasetKey)
const fwOverride = ref<string | null>(typeof route.query.fw === "string" && route.query.fw !== AUTO ? route.query.fw : rememberedFramework(FW_KEY()))
const fwDismissed = ref(false)
const detected = computed(() => detectFramework([...rawClassesQuery.data.value.values()].map((c) => c.facts)))
const profile = computed(() => profileById(fwOverride.value ?? detected.value.id))
const askFramework = computed(() => !detected.value.confident && !fwOverride.value && !fwDismissed.value && rawClassesQuery.data.value.size > 0)
const askOptions = computed(() => detected.value.candidates.slice(0, 3))
const ROLE_ORDER = computed<ClassRole[]>(() => profile.value.lanes.map((l) => l.id))
const ROLE_LABEL = computed<Record<ClassRole, string>>(() => Object.fromEntries(profile.value.lanes.map((l) => [l.id, l.label])))
const ROLE_DOT = computed<Record<ClassRole, string>>(() => Object.fromEntries(profile.value.lanes.map((l) => [l.id, laneDotClass(l.color)])))
function voteCount(id: string): number { const c = detected.value.candidates.find((x) => x.id === id); return c ? c.strong + c.weak : 0 }
function setFramework(value: string) {
  fwOverride.value = value === AUTO ? null : value
  try { if (fwOverride.value) localStorage.setItem(FW_KEY(), fwOverride.value); else localStorage.removeItem(FW_KEY()) } catch {}
  const query = { ...route.query }
  if (fwOverride.value) query.fw = fwOverride.value
  else delete query.fw
  router.replace({ query })
}
watch(() => store.datasetKey, () => { fwOverride.value = typeof route.query.fw === "string" && route.query.fw !== AUTO ? route.query.fw : rememberedFramework(FW_KEY()); fwDismissed.value = false })


// Toolbar and frame state
const searchQuery = ref("")
const isSidebarOpen = ref(true)
const mode = ref<"top" | "explore">(route.query.mode === "top" ? "top" : "explore")
const activeTab = ref(mode.value === "explore" ? "explore" : "class")
const laneLayout = ref(true)
const includeExternal = ref(false)
const graphRef = ref<InstanceType<typeof ClassGraph> | null>(null)

const tabs = computed(() => {
  const list = [{ id: "class", label: "Class" }]
  if (mode.value === "explore") list.push({ id: "explore", label: "Explore" })
  list.push({ id: "trace", label: "Trace" }, { id: "legend", label: "Legend" })
  return list
})

function setMode(next: "top" | "explore") {
  if (mode.value === next) return
  mode.value = next
  if (next === "explore") activeTab.value = "explore"
  else if (activeTab.value === "explore") activeTab.value = "class"
  const query = { ...route.query }
  if (next === "top") query.mode = "top"
  else delete query.mode
  router.replace({ query })
}

// The URL is the source of truth for mode and framework, also after mount.
watch(() => route.query.mode, (m) => { const next = m === "top" ? "top" : "explore"; if (next !== mode.value) { mode.value = next; if (next === "explore") activeTab.value = "explore"; else if (activeTab.value === "explore") activeTab.value = "class" } })
watch(() => route.query.fw, (fw) => { fwOverride.value = typeof fw === "string" && fw !== AUTO ? fw : null })

function openTab(id: string) {
  activeTab.value = id
  isSidebarOpen.value = true
}

// Top-N is debounced so the range can be dragged without re-slicing on every step.
const topN = ref(50)
const topNInput = ref(50)
let topNTimer: ReturnType<typeof setTimeout> | null = null
function onTopNInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  topNInput.value = value
  if (topNTimer) clearTimeout(topNTimer)
  topNTimer = setTimeout(() => {
    topN.value = Math.min(300, Math.max(10, Math.round(value) || 50))
    topNTimer = null
  }, 250)
}

// Data: the class map with roles, and every direct edge, loaded once.
// Two different requirements, which used to be one flag: units to list, and
// unit-level edges to draw. Every language records units; only Java resolves
// an import to the individual type it names, so everywhere else there are
// units to read and no graph to draw.
const hasUnits = computed(() => store.hasData && (store.hasView("units") || store.hasView("files")))
const hasUnitEdges = computed(() => store.hasData && store.hasView("java_class_connections_direct"))
const hasTables = computed(() => hasUnits.value)
const hasIndirect = computed(() => store.hasData && store.hasView("java_class_connections_indirect"))

const rawClassesQuery = useAsyncQuery<Map<string, RawClass>>(() => loadUnits((sql) => store.query(sql), (v) => store.hasView(v)), [], { initial: new Map<string, RawClass>() })

// Every class with its lane under the active profile; the structure rules read
// the raw class graph's degrees, before any scope narrows it.
const rawDegree = computed(() => {
  const inD = new Map<string, number>(), outD = new Map<string, number>()
  for (const e of edgesQuery.data.value) { outD.set(e.source, (outD.get(e.source) ?? 0) + 1); inD.set(e.target, (inD.get(e.target) ?? 0) + 1) }
  return { inD, outD }
})
const classMap = computed<Map<string, ClassMeta>>(() => {
  const out = new Map<string, ClassMeta>()
  const { inD, outD } = rawDegree.value
  rawClassesQuery.data.value.forEach((c, id) => out.set(id, { id, name: c.name, file: c.file, component: c.component, role: classify(profile.value, c.facts, { inDegree: inD.get(id) ?? 0, outDegree: outD.get(id) ?? 0 }) }))
  return out
})
const classMapQuery = { loading: rawClassesQuery.loading, data: classMap }

const edgesQuery = useAsyncQuery<ClassGraphEdge[]>(async () => {
  if (!store.hasView("java_class_connections_direct")) return []
  const rows = await store.query<{ from: string; to: string; reference_count: number | null }>(
    "SELECT `from`, `to`, reference_count FROM java_class_connections_direct",
  )
  return rows
    .filter((r) => r.from && r.to && r.from !== r.to)
    .map((r) => ({ source: r.from, target: r.to, refs: Number(r.reference_count) || 1 }))
}, [], { initial: [] })

const loading = computed(() => classMapQuery.loading.value || edgesQuery.loading.value)
const totalClasses = computed(() => classMapQuery.data.value.size)

// Scope narrows the class map; edges follow the classes that survive.
const classes = computed(() => {
  const all = classMapQuery.data.value
  if (!scope.isActive) return all
  const out = new Map<string, ClassMeta>()
  all.forEach((meta, id) => { if (scope.fileInScope(meta.file, meta.component)) out.set(id, meta) })
  return out
})
const classList = computed(() => [...classes.value.values()].sort((a, b) => a.id.localeCompare(b.id)))

const edges = computed(() => {
  const known = classes.value
  return edgesQuery.data.value.filter((e) =>
    includeExternal.value ? known.has(e.source) || known.has(e.target) : known.has(e.source) && known.has(e.target),
  )
})

const outAdj = computed<Adjacency>(() => {
  const out: Adjacency = new Map()
  for (const e of edges.value) {
    if (!out.has(e.source)) out.set(e.source, new Map())
    const targets = out.get(e.source)!
    targets.set(e.target, (targets.get(e.target) ?? 0) + e.refs)
  }
  return out
})
const inAdj = computed(() => reverseAdjacency(outAdj.value))

const degree = computed(() => {
  const map = new Map<string, number>()
  outAdj.value.forEach((targets, id) => map.set(id, (map.get(id) ?? 0) + targets.size))
  inAdj.value.forEach((sources, id) => map.set(id, (map.get(id) ?? 0) + sources.size))
  return map
})

const roleCounts = computed(() => {
  const counts: Record<ClassRole, number> = {}
  for (const id of ROLE_ORDER.value) counts[id] = 0
  classes.value.forEach((meta) => { counts[meta.role] = (counts[meta.role] ?? 0) + 1 })
  return counts
})

function metaOf(id: string): ClassMeta {
  return classes.value.get(id) ?? classMapQuery.data.value.get(id) ?? { id, name: shortName(id), file: "", component: "", role: profile.value.fallback }
}
function toNode(id: string): ClassGraphNode {
  const meta = metaOf(id)
  return { id, label: meta.name, role: meta.role }
}

// Graph slices: the N best-connected classes, or the explored set.
const topIds = computed(() => {
  const ids = [...degree.value.keys()]
  ids.sort((a, b) => (degree.value.get(b) ?? 0) - (degree.value.get(a) ?? 0) || a.localeCompare(b))
  return ids.slice(0, topN.value)
})

const graphIds = computed(() => (mode.value === "top" ? topIds.value : explored.value))
const graphNodes = computed(() => graphIds.value.map(toNode))
const graphEdges = computed(() => {
  const set = new Set(graphIds.value)
  return edges.value.filter((e) => set.has(e.source) && set.has(e.target))
})

// Selection
const selectedId = ref<string | null>(null)
const selectedMeta = computed(() => (selectedId.value ? metaOf(selectedId.value) : null))

function neighbours(adj: Adjacency, id: string): Neighbour[] {
  const list: Neighbour[] = []
  adj.get(id)?.forEach((refs, other) => list.push({ ...metaOf(other), refs }))
  return list.sort((a, b) => b.refs - a.refs || a.name.localeCompare(b.name))
}
const outgoing = computed(() => (selectedId.value ? neighbours(outAdj.value, selectedId.value) : []))
const incoming = computed(() => (selectedId.value ? neighbours(inAdj.value, selectedId.value) : []))

function select(id: string) {
  selectedId.value = id
}
function onGraphSelect(id: string | null) {
  selectedId.value = id
  if (id) activeTab.value = "class"
}

// Explore: seeds, the explored set, and the next layer worth adding.
const explored = ref<string[]>([])
const exploredSet = computed(() => new Set(explored.value))
const pickerOpen = ref(false)

const RECENT_KEY = "archstats.java.seeds"
const recentSeeds = ref<string[]>([])
try { recentSeeds.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") } catch {}
function rememberSeeds(ids: string[]) {
  recentSeeds.value = [...ids, ...recentSeeds.value.filter((x) => !ids.includes(x))].slice(0, 12)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentSeeds.value)) } catch {}
}

const seedClasses = computed<SeedClass[]>(() => classList.value.map((c) => ({ id: c.id, name: c.name, component: c.component, lane: c.role, degree: degree.value.get(c.id) ?? 0 })))

function startFrom(ids: string[]) {
  const next = [...explored.value]
  for (const id of ids) if (!next.includes(id)) next.push(id)
  explored.value = next
  rememberSeeds(ids)
  selectedId.value = ids[0] ?? selectedId.value
  if (mode.value !== "explore") setMode("explore")
  openTab("explore")
}

// Explored list: lane chips filter, search past a dozen, show 30 then all.
const exploredLaneFilter = ref<string | null>(null)
const exploredSearch = ref("")
const exploredShowAll = ref(false)
const exploredLanes = computed(() => {
  const counts = new Map<string, number>()
  for (const id of explored.value) { const r = metaOf(id).role; counts.set(r, (counts.get(r) ?? 0) + 1) }
  return profile.value.lanes.filter((l) => counts.has(l.id)).map((l) => ({ id: l.id, label: l.label, color: l.color, count: counts.get(l.id) ?? 0 }))
})
const exploredFiltered = computed(() => {
  const q = exploredSearch.value.trim().toLowerCase()
  return explored.value.filter((id) => (!exploredLaneFilter.value || metaOf(id).role === exploredLaneFilter.value) && (!q || id.toLowerCase().includes(q)))
})
const exploredVisible = computed(() => (exploredShowAll.value ? exploredFiltered.value : exploredFiltered.value.slice(0, 30)))
watch(() => explored.value.length, () => { exploredShowAll.value = false })

// Next layer: scored with component and lane-flow context, then trimmed to
// what a person can act on: the strongest dozen, weak, hub and test classes
// folded away behind counts.
const nextLaneFilter = ref<string | null>(null)
const nextShowWeak = ref(false)
const nextShowHubs = ref(false)
const nextShowTests = ref(false)
const WEAK_BELOW = 15
const laneIndexOf = (id: string) => { const i = ROLE_ORDER.value.indexOf(metaOf(id).role); return i === -1 ? undefined : i }
const candidates = computed(() =>
  scoreCandidates(explored.value, outAdj.value, inAdj.value, (id) => classes.value.has(id), {
    componentOf: (id) => metaOf(id).component || undefined,
    laneIndexOf,
  }),
)
const candidateCount = computed(() => candidates.value.size)
const nextLayer = computed(() => {
  const all: Candidate[] = []
  candidates.value.forEach((entry, id) => {
    const meta = metaOf(id)
    all.push({ ...meta, score: entry.score, viaName: entry.via ? metaOf(entry.via).name : "", hub: entry.hub, test: entry.test, near: entry.near })
  })
  all.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const laneCounts = new Map<string, number>()
  for (const c of all) laneCounts.set(c.role, (laneCounts.get(c.role) ?? 0) + 1)
  const lanes = profile.value.lanes.filter((l) => laneCounts.has(l.id)).map((l) => ({ id: l.id, label: l.label, color: l.color, count: laneCounts.get(l.id) ?? 0 }))
  const inLane = all.filter((c) => !nextLaneFilter.value || c.role === nextLaneFilter.value)
  const hubs = inLane.filter((c) => c.hub && !c.test).length
  const tests = inLane.filter((c) => c.test).length
  const strong = inLane.filter((c) => (nextShowHubs.value || !c.hub) && (nextShowTests.value || !c.test))
  const weaker = strong.filter((c) => c.score < WEAK_BELOW).length
  const shown = (nextShowWeak.value ? strong : strong.filter((c) => c.score >= WEAK_BELOW)).slice(0, nextShowWeak.value ? 200 : 12)
  return { total: all.length, lanes, shown, weaker, hubs, tests }
})

function addExplored(id: string) {
  if (!exploredSet.value.has(id)) explored.value = [...explored.value, id]
  selectedId.value = id
}
function addCandidates(ids: string[]) {
  const next = [...explored.value]
  for (const id of ids) if (!next.includes(id)) next.push(id)
  explored.value = next
}
function removeExplored(id: string) {
  explored.value = explored.value.filter((x) => x !== id)
  if (selectedId.value === id) selectedId.value = null
}
function clearExplored() {
  explored.value = []
  selectedId.value = null
  exploredLaneFilter.value = null
  nextLaneFilter.value = null
}
// Colour nodes by the lens dimension's groups instead of the lane.
const lens = useLensStore()
const colorByLens = ref(false)
const nodeColors = computed<Map<string, string> | null>(() => {
  if (!colorByLens.value || !lens.active) return null
  const out = new Map<string, string>()
  classes.value.forEach((meta, id) => {
    const g = groupsStore.fileGroupIndex.get(meta.file)?.find(x => x.dimension === lens.active)
    if (g) out.set(id, g.color)
  })
  return out
})

// Every lane becomes a group in a Layer draft; the builder is where it gets saved.
const draft = useDraftStore()
function saveLanesAsDimension() {
  const byLane = new Map<string, Map<string, string[]>>()
  classMapQuery.data.value.forEach((meta) => {
    if (!meta.file) return
    const perComponent = byLane.get(meta.role) ?? new Map<string, string[]>()
    perComponent.set(meta.component, [...(perComponent.get(meta.component) ?? []), meta.file])
    byLane.set(meta.role, perComponent)
  })
  const groups = profile.value.lanes.flatMap((lane) => {
    const perComponent = byLane.get(lane.id)
    if (!perComponent?.size) return []
    const parts = Array.from(perComponent.entries()).map(([component, files]) => {
      const all = store.componentFilesIndex.get(component) ?? []
      const whole = all.length > 0 && all.every((f) => files.includes(f))
      return { component, files: whole ? null : files.sort() }
    })
    return [{ name: lane.label, parts, reasons: [`same lane ${lane.label}`] }]
  })
  if (!groups.length) return
  draft.setGroups("Layer", groups, "horizontal")
  router.push({ path: "/views/connections", query: { rep: "graph" } })
}

// The explored set becomes a group through the same tray every view uses,
// so it gets a name and a dimension instead of a silent save.
const trayRef = ref<{ startCreate: (name?: string) => void } | null>(null)
const trayFiles = ref<string[]>([])
async function saveAsFileGroup() {
  const files = explored.value.map((id) => metaOf(id).file).filter((f) => f)
  if (files.length === 0) return
  trayFiles.value = files
  await nextTick()
  trayRef.value?.startCreate("Explored classes")
}

// Trace: one query per trace through the precomputed shortest paths.
const traceSource = ref("")
const traceTarget = ref("")
const tracePath = ref<string[]>([])
const traceState = ref<"idle" | "loading" | "found" | "none" | "error">("idle")
const traceError = ref("")
let traceToken = 0

const pathOnGraph = computed(() => {
  const set = new Set(graphIds.value)
  return tracePath.value.every((id) => set.has(id))
})

async function runTrace() {
  const from = traceSource.value.trim()
  const to = traceTarget.value.trim()
  if (!from || !to || !hasIndirect.value) return
  const mine = ++traceToken
  traceState.value = "loading"
  tracePath.value = []
  try {
    const rows = await store.query<{ shortest_path: string | null; shortest_path_length: number | null }>(
      `SELECT shortest_path, shortest_path_length FROM java_class_connections_indirect WHERE \`from\` = ${sqlLiteral(from)} AND \`to\` = ${sqlLiteral(to)} LIMIT 1`,
    )
    if (mine !== traceToken) return
    const path = rows[0]?.shortest_path ? rows[0].shortest_path.split(" -> ").map((s) => s.trim()).filter(Boolean) : []
    if (path.length === 0) {
      traceState.value = "none"
      return
    }
    tracePath.value = path
    traceState.value = "found"
    // The explorer shows the whole path; Top N shows whatever part of it is on screen.
    if (mode.value === "explore") {
      const next = [...explored.value]
      for (const id of path) if (!next.includes(id)) next.push(id)
      explored.value = next
    }
  } catch (e: any) {
    if (mine !== traceToken) return
    traceState.value = "error"
    traceError.value = e?.message ? String(e.message) : String(e)
  }
}
function reverseTrace() {
  const from = traceSource.value
  traceSource.value = traceTarget.value
  traceTarget.value = from
  if (traceSource.value && traceTarget.value) void runTrace()
}
function clearTrace() {
  traceToken++
  traceSource.value = ""
  traceTarget.value = ""
  tracePath.value = []
  traceState.value = "idle"
  traceError.value = ""
}
function traceFromHere(id: string) {
  traceSource.value = id
  if (traceTarget.value === id) traceTarget.value = ""
  tracePath.value = []
  traceState.value = "idle"
  openTab("trace")
}

// A new snapshot invalidates everything the user picked in the old one.
watch([() => store.hasData, () => store.datasetKey], () => {
  selectedId.value = null
  explored.value = []
  clearTrace()
})
// Once the new class map is in, anything picked that no longer exists goes.
watch(classMap, (map) => {
  if (map.size === 0) return
  const kept = explored.value.filter((id) => map.has(id))
  if (kept.length !== explored.value.length) explored.value = kept
  if (selectedId.value && !map.has(selectedId.value)) selectedId.value = null
})

onBeforeUnmount(() => {
  if (topNTimer) clearTimeout(topNTimer)
})
</script>
