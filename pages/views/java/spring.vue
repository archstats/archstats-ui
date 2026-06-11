<template>
  <ViewWorkspaceLayout
    title="Spring Bean Explorer"
    :badge-text="badgeText"
    badge-color-class="bg-indigo-50 border-indigo-100 text-indigo-700"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[{ id: 'explore', label: 'Explore' }]"
    sidebar-width="400px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full flex flex-col overflow-hidden select-none relative">
        <!-- Force-Directed Graph Canvas -->
        <div
          class="bg-slate-950 border border-slate-900 rounded-3xl shadow-3xs flex flex-col relative overflow-hidden h-[calc(100vh-140px)] shrink-0"
        >
          <!-- Header bar -->
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-900 p-5 pb-3 shrink-0 z-10 gap-3"
          >
            <div>
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Spring Bean Force-Directed Graph
              </h4>
              <p class="text-[8px] text-slate-500 mt-0.5">
                Soft Horizontal Zones: Controllers (Indigo) &rarr; Services (Emerald) &rarr; Repositories (Amber)
                &rarr; Entities (Orange)
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                @click="resetZoom"
                class="text-[8.5px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Reset View
              </button>
              <button
                @click="resetGraph"
                class="text-[8.5px] font-bold text-rose-400 hover:text-rose-300 bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                Clear Graph
              </button>
            </div>
          </div>

          <!-- Legend Overlay -->
          <div
            class="absolute bottom-5 left-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[8px] font-bold z-10 bg-slate-900/70 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-850"
          >
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span class="text-slate-400">Controller</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="text-slate-400">Service</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span class="text-slate-400">Repository</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-orange-500"></span>
              <span class="text-slate-400">Entity</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-violet-500"></span>
              <span class="text-slate-400">Config</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-slate-500"></span>
              <span class="text-slate-400">Other</span>
            </div>
            <div class="text-[7.5px] text-slate-500 font-normal ml-2">
              Double-click node to inspect file
            </div>
          </div>

          <!-- Stats Overlay -->
          <div
            v-if="graphStats.nodes > 0"
            class="absolute top-14 right-5 text-[8px] font-bold z-10 bg-slate-900/70 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-850 flex flex-col gap-0.5"
          >
            <span class="text-slate-500"
              >Nodes: <strong class="text-slate-300 font-mono">{{ graphStats.nodes }}</strong></span
            >
            <span class="text-slate-500"
              >Edges: <strong class="text-slate-300 font-mono">{{ graphStats.edges }}</strong></span
            >
          </div>

          <!-- SVG Canvas -->
          <div class="grow relative min-h-[300px] overflow-hidden rounded-b-3xl">
            <svg ref="svgRef" class="w-full h-full bg-slate-950"></svg>

            <!-- Empty State Overlay -->
            <div
              v-if="exploredNodes.size === 0"
              class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/95 rounded-b-3xl border-t border-slate-900/60 pointer-events-none"
            >
              <div class="text-indigo-400 text-3xl mb-3 animate-bounce">🔌</div>
              <h5 class="text-xs font-black text-slate-200 uppercase tracking-widest font-mono">
                No Classes Selected
              </h5>
              <p class="text-[9px] text-slate-500 max-w-sm mt-1 leading-relaxed">
                Use the sidebar to search and add seed classes. Then progressively explore their dependencies layer by
                layer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Sidebar Explore Tab -->
    <template #tab-explore>
      <div class="flex flex-col gap-5 select-none">
        <!-- Seed Class Selector -->
        <div class="flex flex-col gap-2">
          <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono">
            Add Seed Class
          </span>
          <div class="relative">
            <input
              v-model="seedSearch"
              @focus="showSeedDropdown = true"
              type="text"
              placeholder="Search classes (e.g. controllers, entities)..."
              class="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-[10.5px] font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all font-mono"
            />
            <button
              v-if="seedSearch"
              @click="
                seedSearch = '';
                showSeedDropdown = false;
              "
              class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-655 font-bold text-[12px] cursor-pointer"
            >
              &times;
            </button>

            <!-- Dropdown -->
            <div
              v-if="showSeedDropdown && filteredSeedCandidates.length > 0"
              class="absolute z-30 left-0 right-0 top-10 bg-white border border-slate-200/80 rounded-xl shadow-lg max-h-52 overflow-y-auto scroll-container"
            >
              <div
                v-for="cls in filteredSeedCandidates"
                :key="cls.className"
                @click="addSeedNode(cls.className)"
                class="px-3 py-2 hover:bg-indigo-50 hover:text-indigo-800 cursor-pointer text-[10px] font-mono font-bold text-slate-700 truncate flex items-center justify-between gap-2 border-b border-slate-50 last:border-0"
              >
                <span class="truncate flex items-center gap-1.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full shrink-0 border"
                    :style="{
                      borderColor: getGroupColor(cls.role),
                      background: cls.isAbstract ? 'transparent' : getGroupColor(cls.role),
                      borderWidth: cls.isAbstract ? '1.5px' : '0'
                    }"
                  ></span>
                  {{ cls.className }}
                </span>
                <span
                  v-if="exploredNodes.has(cls.className)"
                  class="text-[7px] font-black text-emerald-600 uppercase tracking-wider shrink-0"
                  >Added</span
                >
                <span
                  v-else
                  class="text-[7px] text-slate-400 font-bold shrink-0"
                  >{{ cls.role }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Explored Nodes (chips) -->
        <div v-if="exploredNodes.size > 0" class="flex flex-col gap-2 border-t border-slate-100 pt-4">
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono"
              >Explored ({{ exploredNodes.size }})</span
            >
            <button
              @click="resetGraph"
              class="text-[8px] font-black text-rose-400 hover:text-rose-350 uppercase tracking-wider font-mono cursor-pointer"
            >
              Clear All
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1 scroll-container">
            <span
              v-for="nodeId in exploredNodes"
              :key="nodeId"
              class="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold font-mono rounded-md border"
              :class="getRoleChipClasses(getNodeRole(nodeId))"
            >
              {{ nodeId }}
              <button
                @click="removeExploredNode(nodeId)"
                class="text-[10px] opacity-60 hover:opacity-100 font-bold ml-0.5 cursor-pointer"
              >
                &times;
              </button>
            </span>
          </div>
          <button
            @click="saveExploredAsFileGroup"
            class="w-full mt-1.5 py-1.5 px-3 text-[9px] font-bold tracking-wide text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Save as File Group
          </button>
        </div>

        <!-- Next Layer Candidates -->
        <div v-if="nextLayerCandidates.length > 0" class="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest font-mono"
              >Next Layer Candidates ({{ nextLayerCandidates.length }})</span
            >
            <button
              @click="addAllCandidates"
              class="text-[8px] font-black text-indigo-550 hover:text-indigo-500 uppercase tracking-wider font-mono cursor-pointer"
            >
              Add All
            </button>
          </div>
          <!-- Candidates Accordion Groups -->
          <div class="flex flex-col gap-2">
            <div
              v-for="(list, groupName) in candidatesByRole"
              :key="groupName"
              class="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
            >
              <!-- Group Header -->
              <div
                @click="toggleGroup(groupName)"
                class="flex items-center justify-between px-3 py-2 bg-slate-50/50 hover:bg-slate-50 cursor-pointer select-none transition-colors border-b border-slate-50"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :style="{ background: getGroupColor(groupName) }"
                  ></span>
                  <span class="text-[9.5px] font-extrabold text-slate-700 tracking-wide">
                    {{ getGroupLabel(groupName) }}
                  </span>
                  <span class="text-[8px] font-bold text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-full leading-none">
                    {{ list.length }}
                  </span>
                </div>
                <span class="text-slate-400 text-[8px] font-bold transition-transform duration-200 font-mono">
                  {{ expandedGroups[groupName] ? '▼' : '▶' }}
                </span>
              </div>

              <!-- Group List Content -->
              <div
                v-if="expandedGroups[groupName]"
                class="max-h-[220px] overflow-y-auto p-1 bg-white flex flex-col scroll-container"
              >
                <div v-if="list.length === 0" class="text-[9px] text-slate-450 italic text-center py-4">
                  No candidates for this layer.
                </div>
                <div
                  v-else
                  v-for="cand in list"
                  :key="cand.className"
                  class="flex items-center justify-between px-2.5 py-2 hover:bg-slate-50/50 rounded-xl transition-all cursor-pointer group border-b border-slate-50/50 last:border-0"
                  @click="handleRowClick($event, cand.className)"
                >
                  <div class="flex items-center gap-2 min-w-0 mr-2">
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0 border"
                      :style="{
                        borderColor: getGroupColor(cand.role),
                        background: cand.isAbstract ? 'transparent' : getGroupColor(cand.role),
                        borderWidth: cand.isAbstract ? '1.5px' : '0'
                      }"
                    ></span>
                    <div class="flex flex-col min-w-0">
                      <span class="font-mono text-[9px] font-bold text-slate-750 truncate" :title="cand.className">
                        {{ cand.className }}
                      </span>
                      <span v-if="cand.componentName" class="text-[7px] text-slate-400 truncate leading-none mt-0.5">
                        {{ cand.componentName }}
                      </span>
                    </div>
                  </div>

                  <!-- Actions / Relevance -->
                  <div class="flex items-center gap-2 shrink-0 ml-1">
                    <!-- Relevance Badge -->
                    <span
                      class="text-[7.5px] font-extrabold px-1.5 py-0.5 rounded-md font-mono"
                      :class="getRelevanceBadgeClasses(cand.relevanceScore)"
                      :title="cand.connections.map(c => `${c.reason} (wt: ${c.weight.toFixed(1)})`).join('\n')"
                    >
                      {{ cand.relevanceScore }}%
                    </span>
                    <span
                      @click.stop="exploredNodes.add(cand.className)"
                      class="text-[7.5px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer add-action-btn"
                    >
                      + Add
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Selected Node Profile -->
        <div class="border-t border-slate-100 pt-4 flex flex-col gap-3">
          <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider">Class Details Profile</span>

          <div
            v-if="!selectedProfile"
            class="flex flex-col items-center justify-center text-center text-slate-400 italic text-[9.5px] py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/10"
          >
            <span>No node selected.</span>
            <span class="text-[7.5px] text-slate-455 mt-0.5"
              >Click any node in the graph to inspect its dependencies.</span
            >
          </div>

          <div v-else class="flex flex-col gap-4">
            <!-- Node Header Card -->
            <div class="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex flex-col gap-1 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" :style="{ background: getGroupColor(selectedProfile.role) }"></span>
                <span class="text-[7.5px] font-bold uppercase tracking-wider" :style="{ color: getGroupColor(selectedProfile.role) }">
                  {{ selectedProfile.role }}
                </span>
              </div>
              <span class="text-xs font-black text-slate-800 break-all font-mono">{{ selectedProfile.id }}</span>
              <span class="text-[8px] text-slate-455 mt-0.5 truncate leading-none"
                >Component: {{ store.getComponentName(selectedProfile.component) }}</span
              >
            </div>

            <!-- Outgoing Dependencies -->
            <div class="flex flex-col gap-1.5">
              <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider"
                >Outgoing Dependencies ({{ selectedProfile.outgoing.length }})</span
              >
              <div
                v-if="selectedProfile.outgoing.length === 0"
                class="text-[9px] text-slate-450 italic"
              >
                No outgoing references.
              </div>
              <div class="flex flex-col max-h-[140px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div
                  v-for="dep in selectedProfile.outgoing"
                  :key="dep.className"
                  class="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50/50 rounded-xl transition-all cursor-pointer group border-b border-slate-50/50 last:border-0"
                  @click="handleRowClick($event, dep.className)"
                >
                  <div class="flex items-center gap-2 min-w-0 mr-2">
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0 border"
                      :style="{
                        borderColor: getGroupColor(dep.role),
                        background: dep.isAbstract ? 'transparent' : getGroupColor(dep.role),
                        borderWidth: dep.isAbstract ? '1.5px' : '0'
                      }"
                    ></span>
                    <div class="flex flex-col min-w-0">
                      <span class="font-mono text-[9px] font-bold text-slate-750 truncate" :title="dep.className">
                        {{ dep.className }}
                      </span>
                      <span v-if="dep.componentName" class="text-[7px] text-slate-400 truncate leading-none mt-0.5">
                        {{ dep.componentName }}
                      </span>
                    </div>
                  </div>

                  <!-- Actions / Relevance -->
                  <div class="flex items-center gap-2 shrink-0 ml-1">
                    <!-- Relevance Badge -->
                    <span
                      class="text-[7.5px] font-extrabold px-1.5 py-0.5 rounded-md font-mono"
                      :class="getRelevanceBadgeClasses(dep.relevanceScore)"
                      :title="dep.reasonTooltip || 'No connection'"
                    >
                      {{ dep.relevanceScore }}%
                    </span>
                    <span
                      v-if="!exploredNodes.has(dep.className)"
                      @click.stop="exploredNodes.add(dep.className)"
                      class="text-[7px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer add-action-btn"
                    >
                      + Add
                    </span>
                    <span
                      v-else
                      class="text-[7px] font-bold text-slate-400 uppercase tracking-wider leading-none"
                    >
                      In Graph
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Incoming References -->
            <div class="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
              <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider"
                >Incoming References ({{ selectedProfile.incoming.length }})</span
              >
              <div
                v-if="selectedProfile.incoming.length === 0"
                class="text-[9px] text-slate-450 italic"
              >
                No incoming references.
              </div>
              <div class="flex flex-col max-h-[140px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
                <div
                  v-for="ref in selectedProfile.incoming"
                  :key="ref.className"
                  class="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50/50 rounded-xl transition-all cursor-pointer group border-b border-slate-50/50 last:border-0"
                  @click="handleRowClick($event, ref.className)"
                >
                  <div class="flex items-center gap-2 min-w-0 mr-2">
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0 border"
                      :style="{
                        borderColor: getGroupColor(ref.role),
                        background: ref.isAbstract ? 'transparent' : getGroupColor(ref.role),
                        borderWidth: ref.isAbstract ? '1.5px' : '0'
                      }"
                    ></span>
                    <div class="flex flex-col min-w-0">
                      <span class="font-mono text-[9px] font-bold text-slate-750 truncate" :title="ref.className">
                        {{ ref.className }}
                      </span>
                      <span v-if="ref.componentName" class="text-[7px] text-slate-400 truncate leading-none mt-0.5">
                        {{ ref.componentName }}
                      </span>
                    </div>
                  </div>

                  <!-- Actions / Relevance -->
                  <div class="flex items-center gap-2 shrink-0 ml-1">
                    <!-- Relevance Badge -->
                    <span
                      class="text-[7.5px] font-extrabold px-1.5 py-0.5 rounded-md font-mono"
                      :class="getRelevanceBadgeClasses(ref.relevanceScore)"
                      :title="ref.reasonTooltip || 'No connection'"
                    >
                      {{ ref.relevanceScore }}%
                    </span>
                    <span
                      v-if="!exploredNodes.has(ref.className)"
                      @click.stop="exploredNodes.add(ref.className)"
                      class="text-[7px] font-black text-indigo-500 hover:text-indigo-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer add-action-btn"
                    >
                      + Add
                    </span>
                    <span
                      v-else
                      class="text-[7px] font-bold text-slate-400 uppercase tracking-wider leading-none"
                    >
                      In Graph
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <router-link
              :to="`/views/files/${selectedProfile.file}`"
              class="text-[9px] font-bold text-center text-white bg-slate-800 hover:bg-slate-900 border border-slate-950 p-2.5 rounded-xl transition-colors mt-1 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              Inspect Source Code
            </router-link>
          </div>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import { useRouter } from "vue-router"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const store = useDataStore()
const groupsStore = useGroupsStore()
const router = useRouter()
const { getJavaSummary } = useJavaMetrics()

useSeoMeta({ title: "Spring Bean Explorer" })

definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"],
})

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("explore")

const exploredNodes = reactive(new Set<string>())
const selectedNodeId = ref<string | null>(null)

const seedSearch = ref("")
const showSeedDropdown = ref(false)

const graphStats = reactive({ nodes: 0, edges: 0 })

const svgRef = ref<SVGSVGElement | null>(null)
let simulation: d3.Simulation<any, any> | null = null
let zoomBehavior: any = null
let activeHighlightPathsFn: ((nodeId: string) => void) | null = null
let activeResetHighlightFn: (() => void) | null = null

const summary = computed(() => getJavaSummary())
const badgeText = computed(() => `${summary.value.springBeans} Beans`)

// ═══════════════════════════════════════════════════════
// DATA HELPERS
// ═══════════════════════════════════════════════════════

function getBasename(path: string): string {
  return path?.split("/").pop() || path
}

// Build a full class-to-metadata map
const classRegistry = computed(() => {
  const map = new Map<
    string,
    { className: string; fullClass: string; file: string; component: string; role: string; isAbstract: boolean }
  >()
  if (!store.hasData) return map

  try {
    const filesWithClasses = store.query(`
      SELECT name as file, component, java_class, java_full_class, modularity__types__abstract
      FROM files 
      WHERE java_full_class != ''
    `) as any[]

    const snippets = store.query(`
      SELECT file, snippet_type FROM snippets 
      WHERE snippet_type IN (
        'java__spring__controller', 'java__spring__service', 'java__spring__repository', 
        'java__spring__component', 'java__spring__configuration', 'java__jpa__entity'
      )
    `) as any[]

    const fileRoles = new Map<string, string>()
    snippets.forEach((s: any) => {
      // First role found wins (priority order matters)
      if (!fileRoles.has(s.file)) {
        if (s.snippet_type === "java__spring__controller") fileRoles.set(s.file, "Controller")
        else if (s.snippet_type === "java__spring__service") fileRoles.set(s.file, "Service")
        else if (s.snippet_type === "java__spring__repository") fileRoles.set(s.file, "Repository")
        else if (s.snippet_type === "java__spring__component") fileRoles.set(s.file, "Component")
        else if (s.snippet_type === "java__spring__configuration") fileRoles.set(s.file, "Configuration")
        else if (s.snippet_type === "java__jpa__entity") fileRoles.set(s.file, "Entity")
      }
    })

    filesWithClasses.forEach((f: any) => {
      const className = f.java_class || getBasename(f.file).replace(".java", "")
      map.set(className, {
        className,
        fullClass: f.java_full_class,
        file: f.file,
        component: f.component || "",
        role: fileRoles.get(f.file) || "Other",
        isAbstract: (Number(f.modularity__types__abstract) || 0) > 0,
      })
    })
  } catch (e) {
    console.error("classRegistry error:", e)
  }
  return map
})

// fullClass -> className lookup
const fullToShort = computed(() => {
  const map = new Map<string, string>()
  classRegistry.value.forEach((v) => {
    map.set(v.fullClass, v.className)
  })
  return map
})

// className -> fullClass lookup
const shortToFull = computed(() => {
  const map = new Map<string, string>()
  classRegistry.value.forEach((v) => {
    map.set(v.className, v.fullClass)
  })
  return map
})

// Direct edges: className -> Map<className, referenceCount>
const directEdges = computed(() => {
  const adj = new Map<string, Map<string, number>>()
  if (!store.hasData || !store.hasView("java_class_connections_direct")) return adj

  try {
    const rawEdges = store.query(`
      SELECT \`from\`, \`to\`, reference_count FROM java_class_connections_direct
    `) as any[]

    rawEdges.forEach((edge: any) => {
      const src = fullToShort.value.get(edge.from)
      const tgt = fullToShort.value.get(edge.to)
      if (src && tgt && src !== tgt) {
        if (!adj.has(src)) adj.set(src, new Map())
        adj.get(src)!.set(tgt, (adj.get(src)!.get(tgt) || 0) + (edge.reference_count || 1))
      }
    })
  } catch (e) {
    console.error("directEdges error:", e)
  }
  return adj
})

// Reverse edges: className -> Map<className, referenceCount>
const reverseEdges = computed(() => {
  const rev = new Map<string, Map<string, number>>()
  directEdges.value.forEach((targets, src) => {
    targets.forEach((count, tgt) => {
      if (!rev.has(tgt)) rev.set(tgt, new Map())
      rev.get(tgt)!.set(src, count)
    })
  })
  return rev
})

function getNodeRole(className: string): string {
  return classRegistry.value.get(className)?.role || "Other"
}

// ═══════════════════════════════════════════════════════
// SEED CANDIDATES
// ═══════════════════════════════════════════════════════

const seedCandidateList = computed(() => {
  const results: { className: string; role: string; isAbstract: boolean }[] = []
  classRegistry.value.forEach((entry) => {
    results.push({ className: entry.className, role: entry.role, isAbstract: entry.isAbstract })
  })
  // Sort: Controllers first, then Entities, then Services, then Repositories, then others, and alphabetically within
  const roleSortOrder: Record<string, number> = {
    Controller: 0,
    Entity: 1,
    Service: 2,
    Repository: 3,
    Component: 4,
    Configuration: 5,
    Other: 6,
  }
  return results.sort((a, b) => {
    const rA = roleSortOrder[a.role] ?? 6
    const rB = roleSortOrder[b.role] ?? 6
    if (rA !== rB) return rA - rB
    return a.className.localeCompare(b.className)
  })
})

const filteredSeedCandidates = computed(() => {
  const q = seedSearch.value.trim().toLowerCase()
  if (!q) {
    // Recommends Controllers and Entities as default starting points
    return seedCandidateList.value.filter(c => c.role === "Controller" || c.role === "Entity").slice(0, 20)
  }
  return seedCandidateList.value.filter((c) => c.className.toLowerCase().includes(q)).slice(0, 20)
})

function addSeedNode(className: string) {
  exploredNodes.add(className)
  seedSearch.value = ""
  showSeedDropdown.value = false
}

// ═══════════════════════════════════════════════════════
// FILE-LEVEL LOGICAL COUPLING (file_matrix)
// ═══════════════════════════════════════════════════════

const hasFileMatrix = computed(() => store.hasData && store.hasView('file_matrix'))

// file -> className index
const fileToClass = computed(() => {
  const map = new Map<string, string>()
  classRegistry.value.forEach((v) => {
    map.set(v.file, v.className)
  })
  return map
})

// Build file -> Map<otherFile, { gitCoChanges, linguisticSimilarity }> index from file_matrix
const fileMatrixIndex = computed(() => {
  const index = new Map<string, Map<string, { gitCoChanges: number; linguisticSimilarity: number }>>()
  if (!hasFileMatrix.value) return index

  try {
    const rows = store.query(`
      SELECT "from", "to", git_co_changes, linguistic_similarity
      FROM file_matrix
      WHERE git_co_changes > 0 OR linguistic_similarity > 0.3
    `) as any[]

    rows.forEach((row: any) => {
      const coChanges = Number(row.git_co_changes) || 0
      const similarity = Number(row.linguistic_similarity) || 0
      if (coChanges <= 0 && similarity <= 0.3) return

      const from = row.from
      const to = row.to

      if (!index.has(from)) index.set(from, new Map())
      if (!index.has(to)) index.set(to, new Map())

      // Store both directions
      const existing1 = index.get(from)!.get(to)
      if (existing1) {
        existing1.gitCoChanges = Math.max(existing1.gitCoChanges, coChanges)
        existing1.linguisticSimilarity = Math.max(existing1.linguisticSimilarity, similarity)
      } else {
        index.get(from)!.set(to, { gitCoChanges: coChanges, linguisticSimilarity: similarity })
      }

      const existing2 = index.get(to)!.get(from)
      if (existing2) {
        existing2.gitCoChanges = Math.max(existing2.gitCoChanges, coChanges)
        existing2.linguisticSimilarity = Math.max(existing2.linguisticSimilarity, similarity)
      } else {
        index.get(to)!.set(from, { gitCoChanges: coChanges, linguisticSimilarity: similarity })
      }
    })
  } catch (e) {
    console.error("fileMatrixIndex error:", e)
  }
  return index
})

// ═══════════════════════════════════════════════════════
// GLOBAL RELEVANCE ENGINE
// ═══════════════════════════════════════════════════════

interface CandidateConnection {
  type: 'direct' | 'indirect' | 'logical';
  reason: string;
  weight: number;
}

const classRelevanceMap = computed(() => {
  const map = new Map<string, { relevanceScore: number; connections: CandidateConnection[] }>()
  if (exploredNodes.size === 0) return map

  // Pre-calculate global in-degree for all classes (number of distinct incoming static links)
  const globalInDegree = new Map<string, number>()
  classRegistry.value.forEach((meta) => {
    const degree = reverseEdges.value.get(meta.className)?.size || 0
    globalInDegree.set(meta.className, degree)
  })

  // Class helper to get total static weight between two classes (bidirectional)
  const getClassEdgeWeight = (classA: string, classB: string): number => {
    const outW = directEdges.value.get(classA)?.get(classB) || 0
    const inW = directEdges.value.get(classB)?.get(classA) || 0
    return outW + inW
  }

  // Temporary connections map for all classes
  const tempConns = new Map<string, CandidateConnection[]>()

  exploredNodes.forEach((nodeId) => {
    // 1. Direct Neighbors (1-Hop Static)
    const outgoing = directEdges.value.get(nodeId)
    if (outgoing) {
      outgoing.forEach((count, tgt) => {
        if (classRegistry.value.has(tgt)) {
          let list = tempConns.get(tgt)
          if (!list) {
            list = []
            tempConns.set(tgt, list)
          }
          list.push({
            type: 'direct',
            reason: `Direct static reference from ${nodeId}`,
            weight: count,
          })
        }
      })
    }

    const incoming = reverseEdges.value.get(nodeId)
    if (incoming) {
      incoming.forEach((count, src) => {
        if (classRegistry.value.has(src)) {
          let list = tempConns.get(src)
          if (!list) {
            list = []
            tempConns.set(src, list)
          }
          list.push({
            type: 'direct',
            reason: `Direct static reference to ${nodeId}`,
            weight: count,
          })
        }
      })
    }

    // 2. 2-Hop Transitive Static Neighbors (weight decayed by 50%)
    const neighbors = new Set<string>()
    if (outgoing) outgoing.forEach((_, tgt) => neighbors.add(tgt))
    if (incoming) incoming.forEach((_, src) => neighbors.add(src))

    neighbors.forEach((M) => {
      // Outgoing from intermediate
      const mOutgoing = directEdges.value.get(M)
      if (mOutgoing) {
        mOutgoing.forEach((count, tgt) => {
          if (tgt !== nodeId && classRegistry.value.has(tgt)) {
            let list = tempConns.get(tgt)
            if (!list) {
              list = []
              tempConns.set(tgt, list)
            }
            const wNodeM = getClassEdgeWeight(nodeId, M)
            const wMTgt = getClassEdgeWeight(M, tgt)
            const weight2Hop = 0.5 * ((wNodeM + wMTgt) / 2)
            list.push({
              type: 'indirect',
              reason: `2-hop path via ${M} from ${nodeId}`,
              weight: weight2Hop,
            })
          }
        })
      }

      // Incoming to intermediate
      const mIncoming = reverseEdges.value.get(M)
      if (mIncoming) {
        mIncoming.forEach((count, src) => {
          if (src !== nodeId && classRegistry.value.has(src)) {
            let list = tempConns.get(src)
            if (!list) {
              list = []
              tempConns.set(src, list)
            }
            const wNodeM = getClassEdgeWeight(nodeId, M)
            const wMSrc = getClassEdgeWeight(M, src)
            const weight2Hop = 0.5 * ((wNodeM + wMSrc) / 2)
            list.push({
              type: 'indirect',
              reason: `2-hop path via ${M} from ${nodeId}`,
              weight: weight2Hop,
            })
          }
        })
      }
    })

    // 3. Logical/Linguistic coupling from file_matrix
    const metaNode = classRegistry.value.get(nodeId)
    if (metaNode?.file) {
      const partners = fileMatrixIndex.value.get(metaNode.file)
      if (partners) {
        partners.forEach((details, partnerFile) => {
          const partnerClass = fileToClass.value.get(partnerFile)
          if (partnerClass && classRegistry.value.has(partnerClass)) {
            let list = tempConns.get(partnerClass)
            if (!list) {
              list = []
              tempConns.set(partnerClass, list)
            }
            const gitWeight = details.gitCoChanges * 1.5
            const lingWeight = details.linguisticSimilarity * 5.0
            const totalLogical = gitWeight + lingWeight

            let reason = ""
            if (details.gitCoChanges > 0 && details.linguisticSimilarity > 0.3) {
              reason = `Git co-change (${details.gitCoChanges} commits) & Linguistic similarity (${Math.round(details.linguisticSimilarity * 100)}%) with ${nodeId}`
            } else if (details.gitCoChanges > 0) {
              reason = `Git co-change (${details.gitCoChanges} commits) with ${nodeId}`
            } else {
              reason = `Linguistic similarity (${Math.round(details.linguisticSimilarity * 100)}%) with ${nodeId}`
            }

            list.push({
              type: 'logical',
              reason,
              weight: totalLogical,
            })
          }
        })
      }
    }
  })

  // Post-process: consolidate connection types, calculate relevance score
  let maxRelevance = 0
  const rawScores = new Map<string, { rawScore: number; conns: CandidateConnection[] }>()

  tempConns.forEach((conns, className) => {
    // Consolidate connections by type (only take maximum weight per type to avoid inflating)
    const bestByType = new Map<string, CandidateConnection>()
    conns.forEach((conn) => {
      const existing = bestByType.get(conn.type)
      if (!existing || conn.weight > existing.weight) {
        bestByType.set(conn.type, conn)
      }
    })

    let rawScore = 0
    bestByType.forEach((conn) => {
      rawScore += conn.weight
    })

    const consolidatedConns = Array.from(bestByType.values()).sort((a, b) => b.weight - a.weight)
    rawScores.set(className, { rawScore, conns: consolidatedConns })

    // Calculate IDF global incoming degree penalty: divide by ln(e + degree)
    const degree = globalInDegree.get(className) || 0
    const idfPenalty = Math.log(Math.E + degree)

    // Calculate Role Penalty
    const meta = classRegistry.value.get(className)!
    let rolePenalty = 1.0
    if (meta.role === "Other" || meta.role === "Configuration") {
      rolePenalty = 3.0
    } else if (meta.role === "Component") {
      rolePenalty = 1.2
    }

    const relevanceScore = rawScore / (idfPenalty * rolePenalty)
    if (relevanceScore > maxRelevance) {
      maxRelevance = relevanceScore
    }
  })

  // Normalize scores (0-100%)
  rawScores.forEach((item, className) => {
    const score = maxRelevance > 0 ? Math.round((item.rawScore / maxRelevance) * 100) : 0
    map.set(className, {
      relevanceScore: score,
      connections: item.conns,
    })
  })

  return map
})

const nextLayerCandidates = computed(() => {
  const list: any[] = []
  classRelevanceMap.value.forEach((data, className) => {
    // Only candidates (not already explored)
    if (!exploredNodes.has(className)) {
      const meta = classRegistry.value.get(className)!
      list.push({
        className,
        role: meta.role,
        componentName: meta.component ? store.getComponentName(meta.component) : "",
        connections: data.connections,
        relevanceScore: data.relevanceScore,
        isAbstract: meta.isAbstract,
      })
    }
  })
  return list
})

// Candidates grouped by Spring role for the accordion lists
const candidatesByRole = computed(() => {
  const groups = {
    Controller: [] as any[],
    Service: [] as any[],
    Repository: [] as any[],
    Entity: [] as any[],
    Other: [] as any[],
  }

  nextLayerCandidates.value.forEach((c) => {
    if (c.role === "Controller") groups.Controller.push(c)
    else if (c.role === "Service") groups.Service.push(c)
    else if (c.role === "Repository") groups.Repository.push(c)
    else if (c.role === "Entity") groups.Entity.push(c)
    else groups.Other.push(c)
  })

  // Sort each list by relevance score descending
  const sortFn = (a: any, b: any) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore
    return a.className.localeCompare(b.className)
  }

  groups.Controller.sort(sortFn)
  groups.Service.sort(sortFn)
  groups.Repository.sort(sortFn)
  groups.Entity.sort(sortFn)
  groups.Other.sort(sortFn)

  return groups
})

// Accordion collapse/expand state
const expandedGroups = ref<Record<string, boolean>>({
  Controller: true,
  Service: true,
  Repository: true,
  Entity: true,
  Other: false, // collapsed by default
})

function toggleGroup(groupName: string) {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName]
}

function getGroupColor(groupName: string): string {
  if (groupName === "Controller") return "#818cf8"
  if (groupName === "Service") return "#34d399"
  if (groupName === "Repository") return "#fbbf24"
  if (groupName === "Entity") return "#fb923c"
  return "#c084fc"
}

function getGroupLabel(groupName: string): string {
  if (groupName === "Controller") return "Controllers"
  if (groupName === "Service") return "Services"
  if (groupName === "Repository") return "Repositories"
  if (groupName === "Entity") return "Entities"
  return "Utilities & Config"
}

function getRelevanceBadgeClasses(score: number): string {
  if (score >= 80) return "bg-indigo-50 text-indigo-700 border border-indigo-100"
  if (score >= 50) return "bg-emerald-50 text-emerald-700 border border-emerald-100"
  if (score >= 20) return "bg-amber-50 text-amber-700 border border-amber-100"
  return "bg-slate-50 text-slate-500 border border-slate-200/60"
}

function addAllCandidates() {
  nextLayerCandidates.value.forEach((c) => exploredNodes.add(c.className))
}

function addExploredNode(className: string) {
  exploredNodes.add(className)
  selectedNodeId.value = className
}

function removeExploredNode(className: string) {
  exploredNodes.delete(className)
  if (selectedNodeId.value === className) selectedNodeId.value = null
}

function resetGraph() {
  exploredNodes.clear()
  selectedNodeId.value = null
}

function saveExploredAsFileGroup() {
  if (exploredNodes.size === 0) return
  const members = Array.from(exploredNodes)
  const name = `Spring Beans (${members.length} classes)`
  groupsStore.createGroup('file', name, members)
}

function handleRowClick(event: MouseEvent, className: string) {
  const target = event.target as HTMLElement
  if (target.closest('.add-action-btn') || target.classList.contains('add-action-btn')) {
    return
  }
  selectedNodeId.value = className
}

// ═══════════════════════════════════════════════════════
// SELECTED NODE PROFILE
// ═══════════════════════════════════════════════════════

const selectedProfile = computed(() => {
  if (!selectedNodeId.value) return null
  const meta = classRegistry.value.get(selectedNodeId.value)
  if (!meta) return null

  const outgoing: { className: string; role: string; file: string; componentName: string; relevanceScore: number; reasonTooltip: string; isAbstract: boolean }[] = []
  const incoming: { className: string; role: string; file: string; componentName: string; relevanceScore: number; reasonTooltip: string; isAbstract: boolean }[] = []

  const out = directEdges.value.get(selectedNodeId.value)
  if (out) {
    out.forEach((_, tgt) => {
      const tMeta = classRegistry.value.get(tgt)
      if (tMeta) {
        const relevanceData = classRelevanceMap.value.get(tgt)
        outgoing.push({
          className: tgt,
          role: tMeta.role,
          file: tMeta.file,
          componentName: tMeta.component ? store.getComponentName(tMeta.component) : "",
          relevanceScore: relevanceData ? relevanceData.relevanceScore : 0,
          reasonTooltip: relevanceData ? relevanceData.connections.map(c => c.reason).join('\n') : "No direct link details",
          isAbstract: tMeta.isAbstract,
        })
      }
    })
  }

  const inc = reverseEdges.value.get(selectedNodeId.value)
  if (inc) {
    inc.forEach((_, src) => {
      const sMeta = classRegistry.value.get(src)
      if (sMeta) {
        const relevanceData = classRelevanceMap.value.get(src)
        incoming.push({
          className: src,
          role: sMeta.role,
          file: sMeta.file,
          componentName: sMeta.component ? store.getComponentName(sMeta.component) : "",
          relevanceScore: relevanceData ? relevanceData.relevanceScore : 0,
          reasonTooltip: relevanceData ? relevanceData.connections.map(c => c.reason).join('\n') : "No direct link details",
          isAbstract: sMeta.isAbstract,
        })
      }
    })
  }

  // Sort outgoing and incoming by relevance score descending
  outgoing.sort((a, b) => b.relevanceScore - a.relevanceScore || a.className.localeCompare(b.className))
  incoming.sort((a, b) => b.relevanceScore - a.relevanceScore || a.className.localeCompare(b.className))

  return {
    id: selectedNodeId.value,
    role: meta.role,
    file: meta.file,
    component: meta.component,
    outgoing,
    incoming,
  }
})

// ═══════════════════════════════════════════════════════
// GRAPH DATA BUILDER
// ═══════════════════════════════════════════════════════

interface GraphNode {
  id: string
  role: string
  component: string
  file: string
  degree: number
  isAbstract: boolean
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  refCount: number
}

function buildGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (exploredNodes.size === 0) return { nodes: [], edges: [] }

  const nodeIds = new Set<string>(exploredNodes)
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()

  // Compute degrees
  const degreeMap = new Map<string, number>()
  exploredNodes.forEach((nodeId) => degreeMap.set(nodeId, 0))

  exploredNodes.forEach((nodeId) => {
    const out = directEdges.value.get(nodeId)
    if (out) {
      out.forEach((count, tgt) => {
        if (nodeIds.has(tgt)) {
          const key = `${nodeId}->${tgt}`
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            edges.push({ source: nodeId, target: tgt, refCount: count })
            degreeMap.set(nodeId, (degreeMap.get(nodeId) || 0) + 1)
            degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1)
          }
        }
      })
    }
  })

  const nodes: GraphNode[] = Array.from(nodeIds).map((id) => {
    const meta = classRegistry.value.get(id)
    return {
      id,
      role: meta?.role || "Other",
      component: meta?.component || "",
      file: meta?.file || "",
      degree: degreeMap.get(id) || 0,
      isAbstract: meta?.isAbstract || false,
    }
  })

  return { nodes, edges }
}

// ═══════════════════════════════════════════════════════
// D3 FORCE-DIRECTED RENDERING (CIRCLES + LANES)
// ═══════════════════════════════════════════════════════

function getRoleColor(role: string): string {
  if (role === "Controller") return "#818cf8" // indigo-400
  if (role === "Service") return "#34d399"    // emerald-400
  if (role === "Repository") return "#fbbf24" // amber-400
  if (role === "Entity") return "#fb923c"     // orange-400
  if (role === "Configuration") return "#c084fc" // violet-400
  if (role === "Component") return "#a78bfa"  // violet-400
  return "#94a3b8" // slate-400
}

function getRoleColorDim(role: string): string {
  if (role === "Controller") return "rgba(99,102,241,0.06)"
  if (role === "Service") return "rgba(16,185,129,0.05)"
  if (role === "Repository") return "rgba(245,158,11,0.05)"
  if (role === "Entity") return "rgba(249,115,22,0.05)"
  return "transparent"
}

function getRoleChipClasses(role: string): string {
  if (role === "Controller") return "bg-indigo-50 border-indigo-150 text-indigo-700"
  if (role === "Service") return "bg-emerald-50 border-emerald-150 text-emerald-700"
  if (role === "Repository") return "bg-amber-50 border-amber-150 text-amber-700"
  if (role === "Entity") return "bg-orange-50 border-orange-150 text-orange-700"
  if (role === "Configuration") return "bg-violet-50 border-violet-150 text-violet-700"
  return "bg-slate-100 border-slate-200 text-slate-650"
}

// Lane X positions as fractions of width
const LANES = [
  { role: "Controller", fraction: 0.14, label: "CONTROLLERS", color: "#818cf8" },
  { role: "Service", fraction: 0.38, label: "SERVICES & UTILS", color: "#34d399" },
  { role: "Repository", fraction: 0.64, label: "REPOSITORIES", color: "#fbbf24" },
  { role: "Entity", fraction: 0.88, label: "ENTITIES", color: "#fb923c" },
]

function getRoleXFraction(role: string): number {
  if (role === "Controller") return LANES[0].fraction
  if (role === "Service" || role === "Component" || role === "Configuration") return LANES[1].fraction
  if (role === "Repository") return LANES[2].fraction
  if (role === "Entity") return LANES[3].fraction
  return 0.5
}

function renderGraph() {
  const svg = svgRef.value
  if (!svg) return

  if (simulation) {
    simulation.stop()
    simulation = null
  }

  d3.select(svg).selectAll("*").remove()

  const { nodes, edges } = buildGraphData()
  graphStats.nodes = nodes.length
  graphStats.edges = edges.length

  if (nodes.length === 0) return

  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 600

  const root = d3.select(svg)
  const g = root.append("g")

  // Zoom
  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 5])
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
    })
  root.call(zoomBehavior)

  const defs = root.append("defs")

  // Glow filter for hovered/selected nodes
  const glowFilter = defs
    .append("filter")
    .attr("id", "circle-glow")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%")
  glowFilter
    .append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", 5)
    .attr("result", "blur")
  const glowMerge = glowFilter.append("feMerge")
  glowMerge.append("feMergeNode").attr("in", "blur")
  glowMerge.append("feMergeNode").attr("in", "SourceGraphic")

  // Arrow markers – normal
  defs
    .append("marker")
    .attr("id", "edge-arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-3.5L8,0L0,3.5")
    .attr("fill", "#334155")
    .attr("opacity", 0.5)

  // Arrow markers – highlighted
  defs
    .append("marker")
    .attr("id", "edge-arrow-hl")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-3.5L8,0L0,3.5")
    .attr("fill", "#a5b4fc")
    .attr("opacity", 0.9)

  // ── Lane decorations (no background fill) ──
  const laneWidth = width / LANES.length
  LANES.forEach((lane, i) => {
    const lx = lane.fraction * width - laneWidth / 2

    // Lane separator lines (between lanes, not at edges)
    if (i > 0) {
      g.append("line")
        .attr("x1", lx)
        .attr("y1", 0)
        .attr("x2", lx)
        .attr("y2", height)
        .attr("stroke", lane.color)
        .attr("stroke-opacity", 0.06)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,6")
    }

    // Lane header labels
    g.append("text")
      .attr("x", lane.fraction * width)
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("font-weight", "900")
      .attr("fill", lane.color)
      .attr("opacity", 0.3)
      .attr("letter-spacing", "0.18em")
      .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
      .text(lane.label)
  })

  // ── Adjacency for hover highlight ──
  const adjForward = new Map<string, Set<string>>()
  const adjBackward = new Map<string, Set<string>>()
  nodes.forEach((n) => {
    adjForward.set(n.id, new Set())
    adjBackward.set(n.id, new Set())
  })
  edges.forEach((e) => {
    const srcId = typeof e.source === "string" ? e.source : (e.source as GraphNode).id
    const tgtId = typeof e.target === "string" ? e.target : (e.target as GraphNode).id
    adjForward.get(srcId)?.add(tgtId)
    adjBackward.get(tgtId)?.add(srcId)
  })

  // ── Degree-based radius scale ──
  const maxDegree = Math.max(...nodes.map((n) => n.degree), 1)
  const radiusScale = d3.scaleSqrt().domain([0, maxDegree]).range([3, 12])

  // ── Curved links ──
  const linkPath = (d: any): string => {
    const sx = d.source.x as number
    const sy = d.source.y as number
    const tx = d.target.x as number
    const ty = d.target.y as number
    // Gentle cubic bezier with horizontal bias
    const mx = (sx + tx) / 2
    return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`
  }

  const links = g
    .selectAll("path.edge")
    .data(edges)
    .join("path")
    .attr("class", "edge")
    .attr("fill", "none")
    .attr("stroke", "#1e293b")
    .attr("stroke-opacity", 0.2)
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#edge-arrow)")

  // ── Circle nodes ──
  const circleNodes = g
    .selectAll("circle.node")
    .data(nodes, (d: any) => d.id)
    .join("circle")
    .attr("class", "node")
    .attr("r", (d: any) => radiusScale(d.degree))
    .attr("fill", (d: any) => d.isAbstract ? "#020617" : getRoleColor(d.role))
    .attr("stroke", (d: any) => d.isAbstract ? getRoleColor(d.role) : "#0f172a")
    .attr("stroke-width", (d: any) => d.isAbstract ? 2.5 : 1.5)
    .attr("opacity", 0.85)
    .style("cursor", "pointer")

  // ── Persistent labels (tiny, below circles) ──
  const labels = g
    .selectAll("text.node-label")
    .data(nodes, (d: any) => d.id)
    .join("text")
    .attr("class", "node-label")
    .text((d: any) => (d.id.length > 18 ? d.id.slice(0, 15) + "…" : d.id))
    .attr("font-size", 7)
    .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
    .attr("font-weight", "600")
    .attr("fill", "#475569")
    .attr("text-anchor", "middle")
    .attr("dy", (d: any) => radiusScale(d.degree) + 10)
    .style("pointer-events", "none")

  // ── Hover tooltip (SVG title) ──
  circleNodes
    .append("title")
    .text(
      (d: any) =>
        `${d.id} ${d.isAbstract ? '(Abstract/Interface)' : ''}\nRole: ${d.role}\nConnections: ${d.degree}\nComponent: ${store.getComponentName(d.component)}\nDouble-click → inspect file`
    )

  // ── Click & double-click ──
  circleNodes
    .on("click", (event, d: any) => {
      event.stopPropagation()
      selectedNodeId.value = d.id
    })
    .on("dblclick", (event, d: any) => {
      event.stopPropagation()
      const meta = classRegistry.value.get(d.id)
      if (meta) router.push(`/views/files/${meta.file}`)
    })

  // ── Drag ──
  const drag = d3
    .drag<SVGCircleElement, GraphNode>()
    .on("start", (event, d: any) => {
      if (!event.active) simulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d: any) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event, d: any) => {
      if (!event.active) simulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  circleNodes.call(drag as any)

  // ── Hover highlighting ──
  function highlightPaths(nodeId: string, isHover = false) {
    const visited = new Set<string>([nodeId])
    const visitedEdges = new Set<string>()

    const qF: string[] = [nodeId]
    while (qF.length > 0) {
      const curr = qF.shift()!
      adjForward.get(curr)?.forEach((next) => {
        visitedEdges.add(`${curr}->${next}`)
        if (!visited.has(next)) { visited.add(next); qF.push(next) }
      })
    }
    const qB: string[] = [nodeId]
    while (qB.length > 0) {
      const curr = qB.shift()!
      adjBackward.get(curr)?.forEach((prev) => {
        visitedEdges.add(`${prev}->${curr}`)
        if (!visited.has(prev)) { visited.add(prev); qB.push(prev) }
      })
    }

    const dimOpacity = isHover ? 0.15 : 0.45
    const dimLabelOpacity = isHover ? 0.12 : 0.45
    const dimLinkOpacity = isHover ? 0.03 : 0.1

    circleNodes
      .attr("opacity", (d: any) => (visited.has(d.id) ? 1.0 : dimOpacity))
      .attr("stroke", (d: any) => {
        if (d.id === nodeId) return "#fff"
        if (d.id === selectedNodeId.value) return "#fff"
        return d.isAbstract ? getRoleColor(d.role) : "#0f172a"
      })
      .attr("stroke-width", (d: any) => {
        if (d.id === nodeId || d.id === selectedNodeId.value) return 2.5
        return d.isAbstract ? 2.5 : 1.5
      })
      .attr("filter", (d: any) => (d.id === nodeId || d.id === selectedNodeId.value ? "url(#circle-glow)" : "none"))

    labels
      .attr("opacity", (d: any) => (visited.has(d.id) ? 1.0 : dimLabelOpacity))
      .attr("fill", (d: any) => (visited.has(d.id) ? "#e2e8f0" : "#475569"))

    links
      .attr("stroke-opacity", (d: any) => {
        const s = typeof d.source === "string" ? d.source : d.source.id
        const t = typeof d.target === "string" ? d.target : d.target.id
        return visitedEdges.has(`${s}->${t}`) ? 0.7 : dimLinkOpacity
      })
      .attr("stroke-width", (d: any) => {
        const s = typeof d.source === "string" ? d.source : d.source.id
        const t = typeof d.target === "string" ? d.target : d.target.id
        return visitedEdges.has(`${s}->${t}`) ? 2 : 0.8
      })
      .attr("stroke", (d: any) => {
        const s = typeof d.source === "string" ? d.source : d.source.id
        const t = typeof d.target === "string" ? d.target : d.target.id
        if (visitedEdges.has(`${s}->${t}`)) {
          const tgtNode = nodes.find((n) => n.id === (typeof d.target === "string" ? d.target : d.target.id))
          return tgtNode ? getRoleColor(tgtNode.role) : "#818cf8"
        }
        return "#1e293b"
      })
      .attr("marker-end", (d: any) => {
        const s = typeof d.source === "string" ? d.source : d.source.id
        const t = typeof d.target === "string" ? d.target : d.target.id
        return visitedEdges.has(`${s}->${t}`) ? "url(#edge-arrow-hl)" : "url(#edge-arrow)"
      })
  }

  function resetHighlight() {
    if (selectedNodeId.value) {
      highlightPaths(selectedNodeId.value, false)
      return
    }

    circleNodes
      .attr("opacity", 0.85)
      .attr("stroke", (d: any) => d.isAbstract ? getRoleColor(d.role) : "#0f172a")
      .attr("stroke-width", (d: any) => d.isAbstract ? 2.5 : 1.5)
      .attr("filter", "none")

    labels
      .attr("opacity", 1.0)
      .attr("fill", "#475569")

    links
      .attr("stroke-opacity", 0.2)
      .attr("stroke-width", 1)
      .attr("stroke", "#1e293b")
      .attr("marker-end", "url(#edge-arrow)")
  }

  circleNodes
    .on("mouseover", (event, d: any) => highlightPaths(d.id, true))
    .on("mouseout", resetHighlight)

  // ── Force simulation ──
  simulation = d3
    .forceSimulation(nodes as any)
    .force(
      "link",
      d3
        .forceLink(edges)
        .id((d: any) => d.id)
        .distance(80)
        .strength(0.35)
    )
    .force("charge", d3.forceManyBody().strength(-100))
    .force(
      "x",
      d3.forceX<any>((d: any) => getRoleXFraction(d.role) * width).strength(0.85)
    )
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force(
      "collision",
      d3.forceCollide<any>().radius((d: any) => radiusScale(d.degree) + 3).strength(0.9)
    )
    .on("tick", () => {
      links.attr("d", linkPath as any)

      circleNodes.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)

      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
    })

  // Apply search filter
  applySearchFilter(circleNodes, labels, links)

  resetHighlight()

  activeHighlightPathsFn = highlightPaths
  activeResetHighlightFn = resetHighlight
}

function applySearchFilter(circleNodes: any, labels: any, links: any) {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return
  circleNodes.attr("opacity", (d: any) => (d.id.toLowerCase().includes(q) ? 0.85 : 0.08))
  labels.attr("opacity", (d: any) => (d.id.toLowerCase().includes(q) ? 1.0 : 0.06))
}

function resetZoom() {
  const svg = svgRef.value
  if (svg && zoomBehavior) {
    d3.select(svg).transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity)
  }
}

// ═══════════════════════════════════════════════════════
// WATCHERS
// ═══════════════════════════════════════════════════════

watch(
  () => [...exploredNodes],
  () => {
    nextTick(() => renderGraph())
  },
  { deep: true }
)

watch(selectedNodeId, () => {
  if (activeResetHighlightFn) {
    activeResetHighlightFn()
  }
})

watch(searchQuery, (q) => {
  const query = q.trim().toLowerCase()
  const svg = svgRef.value
  if (!svg) return
  const g = d3.select(svg).select("g")
  const circles = g.selectAll("circle.node")
  const lbls = g.selectAll("text.node-label")

  if (!query) {
    if (activeResetHighlightFn) {
      activeResetHighlightFn()
    } else {
      circles.attr("opacity", 0.85)
      lbls.attr("opacity", 1.0)
    }
    return
  }
  circles.attr("opacity", (d: any) => (d.id.toLowerCase().includes(query) ? 0.85 : 0.08))
  lbls.attr("opacity", (d: any) => (d.id.toLowerCase().includes(query) ? 1.0 : 0.06))
})

if (process.client) {
  window.addEventListener("click", (e) => {
    const target = e.target as HTMLElement
    if (!target.closest(".relative")) {
      showSeedDropdown.value = false
    }
  })
}

// ═══════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════

onMounted(() => {
  nextTick(() => renderGraph())
})

let resizeTimer: any = null
function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    renderGraph()
  }, 200)
}

onMounted(() => window.addEventListener("resize", handleResize))
onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)
  if (simulation) simulation.stop()
  activeHighlightPathsFn = null
  activeResetHighlightFn = null
})
</script>

<style scoped>
.scroll-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
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
</style>
