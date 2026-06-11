<template>
  <ViewWorkspaceLayout
    title="Group-to-Group Coupling"
    :badge-text="badgeText"
    badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[{ id: 'details', label: 'Details' }]"
    sidebar-width="350px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full flex flex-col overflow-hidden select-none relative">
        <div
          class="bg-white border border-slate-200 rounded-3xl shadow-3xs flex flex-col relative overflow-hidden h-[calc(100vh-140px)] shrink-0"
        >
          <!-- Header bar -->
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 p-5 pb-3 shrink-0 z-10 gap-3"
          >
            <div>
              <h4 class="text-[10px] font-black text-slate-800 uppercase tracking-widest font-mono">
                Group-to-Group Coupling
              </h4>
              <p class="text-[8px] text-slate-400 mt-0.5">
                Force-directed graph of inter-group dependencies based on component connections
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                @click="resetZoom"
                class="text-[8.5px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-3xs"
              >
                Reset View
              </button>
            </div>
          </div>

          <!-- Configuration Controls Panel (Light Theme) -->
          <div
            class="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/40 shrink-0 z-10"
          >
            <!-- Coupling Type Segmented Control -->
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Coupling</span>
              <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                <button
                  @click="couplingType = 'direct'"
                  class="px-2.5 py-1 rounded-md text-[9px] font-bold transition-all duration-150 cursor-pointer text-slate-500 hover:text-slate-700"
                  :class="couplingType === 'direct' ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/10' : ''"
                >
                  Direct
                </button>
                <button
                  @click="couplingType = 'git'"
                  class="px-2.5 py-1 rounded-md text-[9px] font-bold transition-all duration-150 cursor-pointer text-slate-500 hover:text-slate-700"
                  :class="couplingType === 'git' ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/10' : ''"
                >
                  Git (Commits)
                </button>
              </div>
            </div>

            <!-- Node Size Metric Select -->
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Node Size</span>
              <div class="flex flex-col">
                <select
                  v-model="nodeMetric"
                  class="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-350 text-slate-700 text-[9.5px] font-bold px-2.5 py-1 rounded-lg focus:outline-none cursor-pointer transition-colors shadow-3xs max-w-[140px] md:max-w-[170px]"
                >
                  <option :value="null">Component Count</option>
                  <option v-for="col in distinctStats" :key="col" :value="col">
                    {{ dataStore.statNiceName(col) }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Metric Aggregation Toggle -->
            <div v-if="nodeMetric" class="flex items-center gap-1">
              <div class="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                <button
                  @click="nodeAggregation = 'sum'"
                  class="px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-all duration-150 cursor-pointer text-slate-500 hover:text-slate-700"
                  :class="nodeAggregation === 'sum' ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/10' : ''"
                  title="Sum metric values across group components"
                >
                  Sum
                </button>
                <button
                  @click="nodeAggregation = 'avg'"
                  class="px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-all duration-150 cursor-pointer text-slate-500 hover:text-slate-700"
                  :class="nodeAggregation === 'avg' ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/10' : ''"
                  title="Average metric values across group components"
                >
                  Avg
                </button>
              </div>
            </div>

            <!-- Checkbox Option Toggles -->
            <div class="flex items-center gap-3 ml-1 sm:ml-4">
              <label
                v-if="couplingType === 'direct'"
                class="flex items-center gap-1.5 cursor-pointer text-[9px] font-bold text-slate-600 hover:text-slate-800 select-none"
              >
                <input
                  v-model="directionalLinks"
                  type="checkbox"
                  class="accent-violet-600 rounded border-slate-300 bg-white w-3 h-3 cursor-pointer"
                />
                <span>Directed Links</span>
              </label>

              <label
                class="flex items-center gap-1.5 cursor-pointer text-[9px] font-bold text-slate-600 hover:text-slate-800 select-none"
              >
                <input
                  v-model="showNames"
                  type="checkbox"
                  class="accent-violet-600 rounded border-slate-300 bg-white w-3 h-3 cursor-pointer"
                />
                <span>Show Labels</span>
              </label>
            </div>

            <!-- Metric definition note -->
            <span
              v-if="nodeMetric"
              class="hidden lg:inline text-[8.5px] text-slate-400 italic truncate max-w-xs"
              :title="getMetricShortDefinition(nodeMetric)"
            >
              ℹ️ {{ getMetricShortDefinition(nodeMetric) }}
            </span>
          </div>

          <!-- Group Legend Visibility Bar (Light Theme) -->
          <div
            v-if="groupsStore.componentGroups.length > 0"
            class="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-white shrink-0 z-10"
          >
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">Visible Groups:</span>
            <div
              v-for="group in groupsStore.componentGroups"
              :key="group.id"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold border transition-all select-none cursor-pointer"
              :class="[
                hiddenGroups.has(group.id)
                  ? 'border-slate-100 text-slate-400 bg-slate-50/50'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300 bg-white hover:bg-slate-50 shadow-3xs'
              ]"
              @click="toggleGroupVisibility(group.id)"
            >
              <div
                class="w-2 h-2 rounded-full transition-opacity"
                :style="{ backgroundColor: group.color }"
                :class="hiddenGroups.has(group.id) ? 'opacity-20' : ''"
              ></div>
              <span :class="hiddenGroups.has(group.id) ? 'line-through text-slate-400' : ''">{{ group.name }}</span>
              <span class="text-slate-400 font-mono text-[8px]">({{ group.members.length }})</span>
            </div>

            <button
              v-if="hiddenGroups.size > 0"
              @click="hiddenGroups.clear()"
              class="ml-auto text-[9px] font-black text-violet-600 hover:text-violet-850 cursor-pointer"
            >
              ✕ Show All
            </button>
          </div>

          <!-- Stats Overlay -->
          <div
            v-if="graphNodes.length > 0"
            class="absolute top-36 right-5 text-[8px] font-bold z-10 bg-white/85 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-200 flex flex-col gap-0.5 shadow-2xs"
          >
            <span class="text-slate-500"
              >Groups: <strong class="text-slate-800 font-mono">{{ graphNodes.length }}</strong></span
            >
            <span class="text-slate-500"
              >Connections: <strong class="text-slate-800 font-mono">{{ graphEdges.length }}</strong></span
            >
          </div>

          <!-- SVG Canvas -->
          <div class="grow relative min-h-[300px] overflow-hidden rounded-b-3xl">
            <svg ref="svgRef" class="w-full h-full bg-slate-50/30"></svg>

            <!-- Empty State Overlay -->
            <div
              v-if="graphNodes.length === 0"
              class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-white/95 rounded-b-3xl border-t border-slate-100 pointer-events-none"
            >
              <div class="text-violet-550 text-3xl mb-3 animate-bounce">🔗</div>
              <h5 class="text-xs font-black text-slate-700 uppercase tracking-widest font-mono">
                No Component Groups Visible
              </h5>
              <p class="text-[9px] text-slate-455 max-w-sm mt-1 leading-relaxed">
                Configure your visible component groups or create new ones in the Groups Manager sidebar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Sidebar Details Tab -->
    <template #tab-details>
      <div class="flex flex-col gap-5 select-none">
        <!-- No Selection State -->
        <div
          v-if="!selectedNode && !selectedEdge"
          class="flex flex-col items-center justify-center text-center text-slate-400 italic text-[9.5px] py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/10"
        >
          <span>No selection.</span>
          <span class="text-[7.5px] text-slate-400 mt-0.5"
            >Click a node or edge in the graph to inspect details.</span
          >
        </div>

        <!-- Node Details -->
        <div v-if="selectedNode" class="flex flex-col gap-4">
          <div class="bg-violet-50/50 border border-violet-100 rounded-2xl p-4 flex flex-col gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div class="flex items-center gap-2">
              <span
                class="w-3 h-3 rounded-full shrink-0 border border-white/30"
                :style="{ background: selectedNode.color }"
              ></span>
              <span class="text-[7.5px] font-bold uppercase tracking-wider text-violet-600">
                Component Group
              </span>
            </div>
            <span class="text-xs font-black text-slate-800 break-all">{{ selectedNode.name }}</span>
            <span class="text-[8px] text-slate-500 mt-0.5">
              {{ selectedNode.members.length }} member{{ selectedNode.members.length === 1 ? '' : 's' }}
            </span>

            <!-- Dynamic Node Metric Info -->
            <div v-if="nodeMetric" class="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-0.5">
              <span class="text-[7.5px] font-extrabold uppercase tracking-wider text-slate-400">
                {{ dataStore.statNiceName(nodeMetric) }} ({{ nodeAggregation === 'sum' ? 'Sum' : 'Avg' }})
              </span>
              <span class="text-sm font-black text-slate-800 font-mono">
                {{ formatMetricValue(getGroupMetricValue(selectedNode, nodeMetric, nodeAggregation)) }}
              </span>
            </div>
          </div>

          <!-- Group Spanned Cycles -->
          <div v-if="getNodeCycles(selectedNode).length > 0" class="flex flex-col gap-1.5">
            <span class="font-extrabold text-red-500 text-[8px] uppercase tracking-wider flex items-center gap-1">
              <span>⚠️</span>
              <span>Spanned by {{ getNodeCycles(selectedNode).length }} Cycle{{ getNodeCycles(selectedNode).length === 1 ? '' : 's' }}</span>
            </span>
            <div
              class="flex flex-col max-h-[200px] overflow-y-auto pr-1 scroll-container bg-red-50/20 border border-red-100 rounded-2xl p-1"
            >
              <div
                v-for="cycle in getNodeCycles(selectedNode)"
                :key="cycle.id"
                class="px-2.5 py-2 hover:bg-red-50/60 rounded-xl transition-all border-b border-red-50/30 last:border-0"
              >
                <div class="flex items-start justify-between gap-1">
                  <NuxtLink
                    :to="`/views/components/cycles?id=${cycle.id}`"
                    class="font-mono text-[8.5px] font-bold text-red-800 hover:text-red-950 hover:underline leading-relaxed block break-all"
                  >
                    {{ getAbbreviatedCycleText(cycle.cycleText) }}
                  </NuxtLink>
                  <span class="text-[7.5px] text-red-400 font-mono font-bold shrink-0 bg-red-50 border border-red-100 px-1 py-0.5 rounded">
                    #{{ cycle.id }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Members List -->
          <div class="flex flex-col gap-1.5">
            <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider"
              >Members ({{ selectedNode.members.length }})</span
            >
            <div
              class="flex flex-col max-h-[250px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <div
                v-for="member in selectedNode.members"
                :key="member"
                class="px-2.5 py-1.5 hover:bg-slate-50/50 rounded-xl transition-all border-b border-slate-50/50 last:border-0"
              >
                <span class="font-mono text-[9px] font-bold text-slate-700 truncate block" :title="member">
                  {{ dataStore.getComponentName(member) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Edge Details -->
        <div v-if="selectedEdge" class="flex flex-col gap-4">
          <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            <div class="flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ background: selectedEdge.from.color }"
              ></span>
              <span class="text-[9px] font-black text-slate-700 truncate max-w-[100px]">{{ selectedEdge.from.name }}</span>
              <span class="text-[8px] text-slate-400 font-mono">{{ couplingType === 'direct' ? '→' : '⇄' }}</span>
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :style="{ background: selectedEdge.to.color }"
              ></span>
              <span class="text-[9px] font-black text-slate-700 truncate max-w-[100px]">{{ selectedEdge.to.name }}</span>
            </div>
            <span class="text-[8px] text-slate-555 font-bold mt-1">
              {{ selectedEdge.count }} total {{ couplingType === 'direct' ? 'reference' : 'shared commit' }}{{ selectedEdge.count === 1 ? '' : 's' }}
            </span>
          </div>

          <!-- Spanning Cycles Warning Card -->
          <div v-if="selectedEdge.cycles && selectedEdge.cycles.length > 0" class="flex flex-col gap-1.5">
            <span class="font-extrabold text-red-500 text-[8px] uppercase tracking-wider flex items-center gap-1">
              <span>⚠️</span>
              <span>Spanned by {{ selectedEdge.cycles.length }} Component Cycle{{ selectedEdge.cycles.length === 1 ? '' : 's' }}</span>
            </span>
            <div
              class="flex flex-col max-h-[180px] overflow-y-auto pr-1 scroll-container bg-red-50/30 border border-red-100 rounded-2xl p-1"
            >
              <div
                v-for="cycle in selectedEdge.cycles"
                :key="cycle.id"
                class="px-2.5 py-2 hover:bg-red-50/60 rounded-xl transition-all border-b border-red-100/30 last:border-0"
              >
                <div class="flex items-start justify-between gap-1.5">
                  <NuxtLink
                    :to="`/views/components/cycles?id=${cycle.id}`"
                    class="font-mono text-[8.5px] font-bold text-red-800 hover:text-red-955 hover:underline leading-relaxed block break-all"
                  >
                    {{ getAbbreviatedCycleText(cycle.cycleText) }}
                  </NuxtLink>
                  <span class="text-[7.5px] text-red-400 font-mono font-bold shrink-0 bg-red-50 border border-red-100 px-1 py-0.5 rounded">
                    #{{ cycle.id }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Connections Breakdown -->
          <div class="flex flex-col gap-1.5">
            <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider">
              Top Component Connections ({{ selectedEdge.details.length }})
            </span>
            <div
              class="flex flex-col max-h-[280px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <div
                v-for="(detail, idx) in selectedEdge.details"
                :key="idx"
                class="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50/50 rounded-xl transition-all border-b border-slate-50/50 last:border-0"
              >
                <div class="flex flex-col min-w-0 mr-2">
                  <span class="font-mono text-[8px] font-bold text-slate-700 truncate" :title="detail.from">
                    {{ dataStore.getComponentName(detail.from) }}
                  </span>
                  <span class="font-mono text-[7px] text-slate-400 truncate" :title="detail.to">
                    {{ couplingType === 'direct' ? '→' : '⇄' }} {{ dataStore.getComponentName(detail.to) }}
                  </span>
                </div>
                <span class="text-[8px] font-extrabold text-slate-500 font-mono shrink-0">
                  {{ detail.count }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useGroupsStore, type SavedGroup } from "~/stores/groups"
import { useMetrics } from "~/composables/useMetrics"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const dataStore = useDataStore()
const groupsStore = useGroupsStore()
const { getMetricShortDefinition } = useMetrics()

useSeoMeta({ title: "Group-to-Group Coupling" })

definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"],
})

// ═══════════════════════════════════════════════════════
// STATE / CONFIG
// ═══════════════════════════════════════════════════════

const isSidebarOpen = ref(true)
const activeTab = ref("details")
const svgRef = ref<SVGSVGElement | null>(null)

let simulation: d3.Simulation<GroupNode, GroupEdge> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

const selectedNode = ref<SavedGroup | null>(null)
const selectedEdge = ref<GroupEdgeData | null>(null)

const couplingType = ref<'direct' | 'git'>('direct')
const nodeMetric = ref<string | null>(null)
const nodeAggregation = ref<'sum' | 'avg'>('sum')
const directionalLinks = ref(false)
const showNames = ref(true)
const hiddenGroups = ref(new Set<string>())

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface GroupNode extends d3.SimulationNodeDatum {
  id: string
  group: SavedGroup
  value: number
}

interface GroupEdge extends d3.SimulationLinkDatum<GroupNode> {
  data: GroupEdgeData
}

interface GroupEdgeData {
  from: SavedGroup
  to: SavedGroup
  count: number
  details: { from: string; to: string; count: number }[]
  cycles: any[]
  hasCycles: boolean
}

// ═══════════════════════════════════════════════════════
// DYNAMIC AGGREGATIONS & METRICS
// ═══════════════════════════════════════════════════════

const distinctStats = computed(() => dataStore.getDistinctComponentColumns || [])

const allCycles = computed(() => dataStore.allCyclesExpanded || [])

// Get the numerical value for a group's node size based on metric/aggregation configs
function getGroupMetricValue(group: SavedGroup, metric: string | null, aggregation: 'sum' | 'avg'): number {
  if (!metric) return group.members.length

  const compIndex = dataStore.allComponentsIndex
  let total = 0
  let count = 0

  for (const member of group.members) {
    const comp = compIndex.get(member)
    if (comp) {
      let val = comp[metric]
      if (val === undefined) {
        const resolvedKey = dataStore.statName ? dataStore.statName(metric) : metric
        val = comp[resolvedKey]
      }
      if (val !== undefined && val !== null) {
        total += Number(val)
        count++
      }
    }
  }

  if (aggregation === 'avg') {
    return count > 0 ? total / count : 0
  }
  return total
}

function formatMetricValue(val: number): string {
  if (val % 1 === 0) return val.toLocaleString()
  return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.value.has(groupId)) {
    hiddenGroups.value.delete(groupId)
  } else {
    hiddenGroups.value.add(groupId)
  }
}

// Extract cycles involving components of a specific group
function getNodeCycles(group: SavedGroup) {
  const members = new Set(group.members)
  return allCycles.value.filter((c) => c.nodes.some((n) => members.has(n)))
}

// Abbreviate component paths in cycles
function getAbbreviatedCycleText(cycleText: string): string {
  return cycleText
    .split("->")
    .map((s) => dataStore.getComponentName(s.trim()))
    .join(" ➔ ")
}

// Detect component-level cycles spanning between Group A and Group B
function getSpanningCycles(groupA: SavedGroup, groupB: SavedGroup) {
  const list: any[] = []
  const membersA = new Set(groupA.members)
  const membersB = new Set(groupB.members)

  for (const cycle of allCycles.value) {
    let hasA = false
    let hasB = false
    for (const node of cycle.nodes) {
      if (membersA.has(node)) hasA = true
      if (membersB.has(node)) hasB = true
      if (hasA && hasB) {
        list.push(cycle)
        break
      }
    }
  }
  return list
}

// Git Coupling Data fetcher
const gitCouplingData = computed(() => {
  if (!dataStore.hasData) return []
  try {
    return dataStore.query<{ pair_1: string; pair_2: string; shared_commits: number }>(
      `SELECT pair_1, pair_2, shared_commits FROM git_component_shared_commits WHERE shared_commits > 0`
    )
  } catch (e) {
    console.warn("Failed to query git shared commits:", e)
    return []
  }
})

// ═══════════════════════════════════════════════════════
// COMPUTED: GRAPH DATA
// ═══════════════════════════════════════════════════════

const graphNodes = computed<GroupNode[]>(() => {
  return groupsStore.allComponentGroups
    .filter((g) => !hiddenGroups.value.has(g.id))
    .map((g) => ({
      id: g.id,
      group: g,
      value: getGroupMetricValue(g, nodeMetric.value, nodeAggregation.value),
    }))
})

const graphEdges = computed<GroupEdge[]>(() => {
  const activeNodes = graphNodes.value
  if (activeNodes.length === 0) return []

  const activeGroupMap = new Map(activeNodes.map((n) => [n.id, n.group]))
  const groupIndex = groupsStore.componentGroupIndex

  // Build the list of connections depending on couplingType config
  const connections: { from: string; to: string; count: number }[] = []
  if (couplingType.value === 'direct') {
    connections.push(
      ...dataStore.componentConnections.map((c) => ({
        from: c.from,
        to: c.to,
        count: c.count || 1,
      }))
    )
  } else {
    connections.push(
      ...gitCouplingData.value.map((c) => ({
        from: c.pair_1,
        to: c.pair_2,
        count: c.shared_commits,
      }))
    )
  }

  // Accumulate edges between group pairs
  const edgeMap = new Map<string, GroupEdgeData>()

  for (const conn of connections) {
    const fromGroups = groupIndex.get(conn.from) || []
    const toGroups = groupIndex.get(conn.to) || []

    for (const fg of fromGroups) {
      for (const tg of toGroups) {
        if (fg.id === tg.id) continue

        // Check if both groups are currently active/visible
        if (!activeGroupMap.has(fg.id) || !activeGroupMap.has(tg.id)) continue

        // Directional vs Undirectional key hashing
        const isDirect = couplingType.value === 'direct'
        const isDirectional = isDirect && directionalLinks.value

        const key = isDirectional 
          ? `${fg.id}→${tg.id}` 
          : (fg.id < tg.id ? `${fg.id}::${tg.id}` : `${tg.id}::${fg.id}`)

        let edge = edgeMap.get(key)
        if (!edge) {
          const [first, second] = isDirectional
            ? [fg, tg]
            : (fg.id < tg.id ? [fg, tg] : [tg, fg])

          edge = { from: first, to: second, count: 0, details: [], cycles: [], hasCycles: false }
          edgeMap.set(key, edge)
        }
        edge.count += conn.count
        edge.details.push({ from: conn.from, to: conn.to, count: conn.count })
      }
    }
  }

  // Consolidate per-component details: merge duplicates and sort descending
  for (const edge of edgeMap.values()) {
    const detailMap = new Map<string, { from: string; to: string; count: number }>()
    for (const d of edge.details) {
      const dk = `${d.from}::${d.to}`
      const existing = detailMap.get(dk)
      if (existing) {
        existing.count += d.count
      } else {
        detailMap.set(dk, { ...d })
      }
    }
    edge.details = Array.from(detailMap.values()).sort((a, b) => b.count - a.count)

    // Detect spanning component cycles between the two groups
    edge.cycles = getSpanningCycles(edge.from, edge.to)
    edge.hasCycles = edge.cycles.length > 0
  }

  // Build simulation links referencing node ids
  return Array.from(edgeMap.values()).map((data) => ({
    source: data.from.id,
    target: data.to.id,
    data,
  }))
})

const badgeText = computed(() =>
  graphNodes.value.length > 0 ? `${graphNodes.value.length} Groups` : ""
)

// ═══════════════════════════════════════════════════════
// D3 RENDERING
// ═══════════════════════════════════════════════════════

function renderGraph() {
  if (!svgRef.value) return

  // Cleanup previous
  if (simulation) {
    simulation.stop()
    simulation = null
  }

  const nodes = graphNodes.value
  const edges = graphEdges.value

  // Verify and cleanup selections if they are filtered out
  if (selectedNode.value) {
    const stillExists = nodes.some(n => n.id === selectedNode.value?.id)
    if (!stillExists) selectedNode.value = null
  }
  if (selectedEdge.value) {
    const stillExists = edges.some(e => e.data.from.id === selectedEdge.value?.from.id && e.data.to.id === selectedEdge.value?.to.id)
    if (!stillExists) selectedEdge.value = null
  }

  const svg = d3.select(svgRef.value)
  svg.selectAll("*").remove()

  if (nodes.length === 0) return

  const width = svgRef.value.clientWidth || 800
  const height = svgRef.value.clientHeight || 600

  // Scales
  const nodeValues = nodes.map((n) => n.value)
  const radiusScale = d3
    .scaleSqrt()
    .domain([Math.min(...nodeValues, 1), Math.max(...nodeValues, 1)])
    .range([14, 42])

  const edgeCounts = edges.map((e) => e.data.count)
  const strokeScale = d3
    .scaleLinear()
    .domain([Math.min(...edgeCounts, 1), Math.max(...edgeCounts, 1)])
    .range([1.5, 9])

  // Setup Arrow Markers Defs
  const defs = svg.append("defs")
  
  // Normal arrow marker (High contrast Slate-300 / Slate-400 for light mode)
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 6)
    .attr("refY", 5)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 1.5 L 8 5 L 0 8.5 z")
    .attr("fill", "#94a3b8")

  // Deep orange arrow marker for cycles
  defs.append("marker")
    .attr("id", "arrow-cycle")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 6)
    .attr("refY", 5)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 1.5 L 8 5 L 0 8.5 z")
    .attr("fill", "#ea580c")

  // Root group with zoom
  const g = svg.append("g")

  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 6])
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
    })

  svg.call(zoomBehavior)

  // Build simulation
  const simNodes: GroupNode[] = nodes.map((n) => ({ ...n }))
  const simEdges: GroupEdge[] = edges.map((e) => ({ ...e }))

  simulation = d3
    .forceSimulation<GroupNode>(simNodes)
    .force(
      "link",
      d3
        .forceLink<GroupNode, GroupEdge>(simEdges)
        .id((d) => d.id)
        .distance(170)
    )
    .force("charge", d3.forceManyBody().strength(-550))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3.forceCollide<GroupNode>().radius((d) => radiusScale(d.value) + 16)
    )

  // Draw edges (High contrast colors for light mode)
  const linkGroup = g
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(simEdges)
    .join("line")
    .attr("stroke", (d) => d.data.hasCycles ? "#ea580c" : "#cbd5e1")
    .attr("stroke-width", (d) => strokeScale(d.data.count))
    .attr("class", (d) => d.data.hasCycles ? "link-cycle animate-marching-ants" : "link-normal")
    .attr("marker-end", (d) => {
      if (couplingType.value === 'direct' && directionalLinks.value) {
        return d.data.hasCycles ? "url(#arrow-cycle)" : "url(#arrow)"
      }
      return null
    })
    .attr("cursor", "pointer")
    .on("click", (_event, d) => {
      selectedNode.value = null
      selectedEdge.value = d.data
      isSidebarOpen.value = true
    })
    .on("mouseenter", function (_, d) {
      if (d.data.hasCycles) {
        d3.select(this).attr("stroke", "#dc2626")
      } else {
        d3.select(this).attr("stroke", "#94a3b8")
      }
    })
    .on("mouseleave", function (_, d) {
      d3.select(this).attr("stroke", d.data.hasCycles ? "#ea580c" : "#cbd5e1")
    })

  // Draw nodes
  const nodeGroup = g
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, GroupNode>("g")
    .data(simNodes)
    .join("g")
    .attr("cursor", "pointer")
    .on("click", (_event, d) => {
      selectedEdge.value = null
      selectedNode.value = d.group
      isSidebarOpen.value = true
    })
    .on("mouseenter", function () {
      d3.select(this).select("circle").attr("stroke", "rgba(51, 65, 85, 0.5)")
    })
    .on("mouseleave", function () {
      d3.select(this).select("circle").attr("stroke", "rgba(255,255,255,0.2)")
    })
    .call(
      d3
        .drag<SVGGElement, GroupNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation?.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on("drag", (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on("end", (event, d) => {
          if (!event.active) simulation?.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    )

  // Outer Circle
  nodeGroup
    .append("circle")
    .attr("r", (d) => radiusScale(d.value))
    .attr("fill", (d) => d.group.color)
    .attr("stroke", "rgba(255,255,255,0.2)")
    .attr("stroke-width", 1.5)
    .attr("class", "transition-all")

  // Node Labels below Circle (Sleek Slate-700 in light mode)
  if (showNames.value) {
    nodeGroup
      .append("text")
      .text((d) => d.group.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radiusScale(d.value) + 13)
      .attr("fill", "rgb(51, 65, 85)")
      .attr("font-size", "9px")
      .attr("font-weight", "800")
      .attr("font-family", "ui-monospace, monospace")
      .attr("pointer-events", "none")
  }

  // Node inside value (count or metric value) - White text provides best contrast against vibrant group colors
  nodeGroup
    .append("text")
    .text((d) => {
      if (nodeMetric.value) {
        return formatMetricValue(d.value)
      }
      return d.group.members.length.toString()
    })
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "rgba(255,255,255,0.95)")
    .attr("font-size", (d) => nodeMetric.value ? "8px" : "9px")
    .attr("font-weight", "850")
    .attr("font-family", "ui-monospace, monospace")
    .attr("pointer-events", "none")

  // Tick calculation with directed arrow borders offset logic
  simulation.on("tick", () => {
    linkGroup
      .attr("x1", (d) => (d.source as GroupNode).x!)
      .attr("y1", (d) => (d.source as GroupNode).y!)
      .attr("x2", (d) => {
        const target = d.target as GroupNode
        const source = d.source as GroupNode
        if (couplingType.value === 'direct' && directionalLinks.value) {
          const dx = target.x! - source.x!
          const dy = target.y! - source.y!
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            const r = radiusScale(target.value) + 5
            return target.x! - (dx / dist) * r
          }
        }
        return target.x!
      })
      .attr("y2", (d) => {
        const target = d.target as GroupNode
        const source = d.source as GroupNode
        if (couplingType.value === 'direct' && directionalLinks.value) {
          const dx = target.x! - source.x!
          const dy = target.y! - source.y!
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            const r = radiusScale(target.value) + 5
            return target.y! - (dy / dist) * r
          }
        }
        return target.y!
      })

    nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`)
  })
}

function resetZoom() {
  if (!svgRef.value || !zoomBehavior) return
  const svg = d3.select(svgRef.value)
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity)
}

// ═══════════════════════════════════════════════════════
// LIFECYCLE / WATCHERS
// ═══════════════════════════════════════════════════════

onMounted(() => {
  nextTick(() => renderGraph())
})

watch(
  () => [
    groupsStore.allComponentGroups,
    dataStore.componentConnections,
    couplingType.value,
    nodeMetric.value,
    nodeAggregation.value,
    directionalLinks.value,
    showNames.value,
    hiddenGroups.value.size
  ],
  () => {
    nextTick(() => renderGraph())
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (simulation) {
    simulation.stop()
    simulation = null
  }
})
</script>

<style scoped>
.scroll-container::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Marching Ants dashed flow animation for cycles-bridged edges */
.link-cycle {
  stroke-dasharray: 5 3;
}

:deep(.animate-marching-ants) {
  animation: marching-ants 1.2s linear infinite;
}

@keyframes marching-ants {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -16;
  }
}
</style>
