<template>
  <ViewWorkspaceLayout
    title="Dependency Cycles Explorer"
    :badge-text="`${filteredCycles.length} Cycles`"
    :kpi-stats="kpiStats"
    v-model:search-query="searchQuery"
    :show-search="true"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="380px"
  >
    <!-- Header Toolbar Sort Actions -->
    <template #actions>
      <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 select-none">
        <button 
          @click="sortBy = 'severity'"
          class="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all duration-150 cursor-pointer"
          :class="sortBy === 'severity' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
        >
          Sort: Severity
        </button>
        <button 
          @click="sortBy = 'size'"
          class="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all duration-150 cursor-pointer"
          :class="sortBy === 'size' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
        >
          Sort: Size
        </button>
        <button 
          @click="sortBy = 'sharedCommits'"
          class="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all duration-150 cursor-pointer"
          :class="sortBy === 'sharedCommits' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
        >
          Sort: Co-changes
        </button>
      </div>
    </template>

    <!-- Visualizer Canvas Slot (Left Column) -->
    <template #visualizer>
      <div v-if="selectedCycle" class="w-full h-full flex flex-col gap-6 p-6 overflow-y-auto scroll-container">
        <!-- Loop Visualizer Header -->
        <div class="flex items-center justify-between border-b border-slate-100 pb-3 select-none">
          <div>
            <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider">Cycle Loop Visualizer</h3>
            <p class="text-[9px] text-slate-450 font-semibold font-mono">Cycle #{{ selectedCycle.id }} · {{ selectedCycle.size }} nodes · severity score: {{ selectedCycle.severity }}</p>
          </div>
          <button 
            @click="saveCycleAsGroup"
            class="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold shadow-3xs cursor-pointer flex items-center gap-1.5 transition-all"
          >
            <span>💼</span>
            <span>Save Cycle as Group</span>
          </button>
        </div>

        <!-- Circular/D3 Graph -->
        <div class="h-[430px] flex flex-col shrink-0">
          <CycleLoopChart 
            :cycle-text="selectedCycle.cycleText"
            :nodes="selectedCycle.nodes"
            :edges="selectedCycleEdges"
            :selected-edge="selectedEdge"
            @select-edge="onSelectEdge"
            class="flex-1"
          />
        </div>

        <!-- Diagnostics Grid Section -->
        <div v-if="breakingPoint" class="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
          
          <!-- LEFT COLUMN: Loop Connections List -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4 text-slate-800 select-none">
            <div class="flex flex-col gap-1.5">
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-extrabold">Loop Connections</h4>
              
              <!-- Diagnostics summary alert -->
              <div class="bg-indigo-50/40 border border-indigo-100/60 rounded-2xl p-3 text-[9.5px] text-indigo-950 font-semibold select-none flex items-start gap-2 mb-1.5 mt-1">
                <span class="text-xs shrink-0">⛓</span>
                <div class="flex flex-col gap-0.5">
                  <span class="font-extrabold text-indigo-900">Cycle Group Span</span>
                  <span>{{ selectedCycleGroupSpanSummary }}</span>
                </div>
              </div>

              <p class="text-[10px] text-slate-400 leading-relaxed font-semibold">
                Select a connection below or click a path on the graph to inspect import locations.
              </p>
              
              <!-- Subtle Weakest Link Callout (one-line info note) -->
              <div class="text-[9.5px] text-slate-550 font-semibold border-t border-slate-100 pt-2.5 mt-1.5">
                💡 <span class="font-extrabold text-slate-655">Weakest Link Analysis:</span> 
                The path from <span class="font-bold font-mono text-slate-700">{{ getAbbreviatedName(breakingPoint.from) }}</span> to <span class="font-bold font-mono text-slate-700">{{ getAbbreviatedName(breakingPoint.to) }}</span> has the fewest references ({{ breakingPoint.referenceCount }} imports). 
                <button 
                  @click="selectedEdge = { from: breakingPoint.from, to: breakingPoint.to }"
                  class="text-indigo-600 font-extrabold hover:underline ml-1 cursor-pointer"
                >
                  Inspect
                </button>
              </div>
            </div>

            <!-- Compact Connections List (no borders, divider line) -->
            <div class="flex flex-col gap-1 max-h-96 overflow-y-auto scroll-container pr-1 border-t border-slate-100 pt-2">
              <button 
                v-for="edge in sortedEdges" 
                :key="`${edge.from}-${edge.to}`"
                @click="selectedEdge = { from: edge.from, to: edge.to }"
                class="w-full text-left rounded-xl px-3 py-2.5 flex items-center justify-between transition-all duration-150 cursor-pointer"
                :class="selectedEdge && selectedEdge.from === edge.from && selectedEdge.to === edge.to 
                  ? 'bg-indigo-50/70 border-l-4 border-indigo-500 text-indigo-900 shadow-3xs' 
                  : 'hover:bg-slate-50/50 text-slate-700 border-l-4 border-transparent'"
              >
                <div class="flex items-center gap-1.5 min-w-0 text-[10px] font-extrabold">
                  <span v-if="getGroupDotStyle(edge.from)" class="w-1.5 h-1.5 rounded-full shrink-0" :style="getGroupDotStyle(edge.from)"></span>
                  <span class="truncate" :title="edge.from">{{ getAbbreviatedName(edge.from) }}</span>
                  <span class="text-slate-400 font-normal">➜</span>
                  <span v-if="getGroupDotStyle(edge.to)" class="w-1.5 h-1.5 rounded-full shrink-0" :style="getGroupDotStyle(edge.to)"></span>
                  <span class="truncate" :title="edge.to">{{ getAbbreviatedName(edge.to) }}</span>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[9px] font-mono text-slate-500 font-medium">
                    {{ edge.referenceCount }} imports • {{ edge.sharedCommits }} co-changes
                  </span>
                  <span 
                    v-if="breakingPoint && breakingPoint.from === edge.from && breakingPoint.to === edge.to"
                    class="text-[7.5px] font-black px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 uppercase tracking-wider scale-90"
                  >
                    Weakest
                  </span>
                </div>
              </button>
            </div>
          </div>

          <!-- RIGHT COLUMN: Connection Inspector -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4 text-slate-800 select-none">
            <div v-if="activeInspectorEdge" class="flex flex-col gap-4">
              <!-- Header info of selected connection -->
              <div class="flex flex-col gap-1">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-extrabold">Connection Inspector</h4>
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 font-mono mt-1">
                  <span class="truncate max-w-[42%]" :title="activeInspectorEdge.from">{{ getAbbreviatedName(activeInspectorEdge.from) }}</span>
                  <span class="text-indigo-500 font-extrabold shrink-0">➜</span>
                  <span class="truncate max-w-[42%]" :title="activeInspectorEdge.to">{{ getAbbreviatedName(activeInspectorEdge.to) }}</span>
                </div>
              </div>

              <!-- Stats Row -->
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total References</span>
                  <span class="text-base font-black text-slate-950 font-mono">
                    {{ activeInspectorEdge.referenceCount }} 
                    <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">imports</span>
                  </span>
                </div>
                <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Logical Co-changes</span>
                  <span class="text-base font-black text-slate-950 font-mono">
                    {{ activeInspectorEdge.sharedCommits }} 
                    <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">commits</span>
                  </span>
                </div>
              </div>

              <!-- Collapsible Tie Alert -->
              <div v-if="hasTies" class="bg-amber-50/40 border border-amber-200/50 rounded-2xl p-3 text-slate-800 flex flex-col gap-1.5">
                <div class="flex items-center justify-between cursor-pointer select-none" @click="isTiesExpanded = !isTiesExpanded">
                  <div class="flex items-center gap-2 text-[9px] font-extrabold text-amber-800">
                    <span>⚠️ {{ tiedEdges.length }} connections are tied ({{ breakingPoint.referenceCount }} imports)</span>
                  </div>
                  <span class="text-[8px] text-amber-700 underline font-black hover:text-amber-955 uppercase tracking-wider">
                    {{ isTiesExpanded ? 'Collapse' : 'Expand Ties' }}
                  </span>
                </div>
                <div v-if="isTiesExpanded" class="flex flex-wrap gap-1.5 mt-1 animate-in fade-in duration-200">
                  <button 
                    v-for="edge in tiedEdges.filter(e => e.from !== activeInspectorEdge.from || e.to !== activeInspectorEdge.to)" 
                    :key="`${edge.from}-${edge.to}`"
                    @click="selectedEdge = { from: edge.from, to: edge.to }"
                    class="bg-white border border-amber-200 hover:border-indigo-500 hover:bg-indigo-50/5 rounded-lg px-2.5 py-1 text-[8.5px] font-mono font-bold text-amber-800 transition-all duration-150 cursor-pointer"
                  >
                    {{ getAbbreviatedName(edge.from) }} ➜ {{ getAbbreviatedName(edge.to) }}
                  </button>
                </div>
              </div>

              <!-- Action Button to open Modal Dialog -->
              <button 
                @click="openFilesDialog" 
                class="w-full mt-2 bg-slate-900 hover:bg-indigo-600 text-white font-extrabold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all duration-150 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                <span>Inspect Import Locations ({{ activeInspectorEdge.files.length }} {{ activeInspectorEdge.files.length === 1 ? 'file' : 'files' }})</span>
              </button>
            </div>
            
            <div v-else class="h-full flex items-center justify-center text-slate-400 text-xs italic py-12">
              Select a connection to view details.
            </div>
           </div>
      </div>
    </div>
      
      <!-- Empty State / No Selected Cycle -->
      <div v-else class="w-full h-full flex items-center justify-center p-6">
        <div class="text-center p-8 bg-white border border-slate-200/60 rounded-3xl shadow-xs max-w-sm flex flex-col items-center gap-3 select-none">
          <span class="p-3 bg-indigo-50 text-indigo-500 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </span>
          <h3 class="text-xs font-bold text-slate-800">Visual Cycle Loop Inspector</h3>
          <p class="text-[10px] text-slate-400 leading-relaxed">Select one of the architectural cycles in the sidebar to visualize connection paths, trace co-change flows, and inspect the weakest link analysis details.</p>
        </div>
      </div>

      <!-- File Locations Modal Dialog -->
      <div 
        v-if="isFilesDialogOpen"
        class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="closeFilesDialog"
      >
        <div class="bg-white rounded-3xl p-6 shadow-2xl w-[520px] max-w-[95vw] border border-slate-200/50 flex flex-col gap-4 text-slate-800 animate-scale-up">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3 select-none">
            <div>
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Import Locations</h3>
              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 font-mono mt-1">
                <span>{{ getAbbreviatedName(activeInspectorEdge?.from || '') }}</span>
                <span class="text-indigo-500 font-extrabold">➜</span>
                <span>{{ getAbbreviatedName(activeInspectorEdge?.to || '') }}</span>
              </div>
            </div>
            <button @click="closeFilesDialog" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- File list -->
          <div class="flex flex-col gap-2 max-h-[380px] overflow-y-auto scroll-container pr-1 font-mono">
            <div 
              v-for="f in activeInspectorEdge?.files" 
              :key="f.file"
              class="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col gap-1.5 text-[10px]"
            >
              <div class="flex items-center justify-between w-full">
                <span class="truncate pr-4 text-slate-800 font-bold" :title="f.file">{{ getFilename(f.file) }}</span>
                <span class="font-extrabold shrink-0 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[9px]">{{ f.count }} imports</span>
              </div>
              <div class="text-[9px] text-slate-455 truncate select-all" :title="f.file">
                Path: <span class="text-slate-655 font-semibold">{{ f.file }}</span>
              </div>
              <div v-if="f.lines" class="text-[9px] text-slate-450 border-t border-slate-200/40 pt-1.5 mt-0.5 select-none">
                Lines: 
                <SnippetPopover :file="f.file" :lines="f.lines">
                  <span class="text-slate-750 font-bold underline decoration-dotted hover:text-indigo-650 transition-colors">{{ f.lines }}</span>
                </SnippetPopover>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Sidebar Drawer: Tab 1 (Ranked Cycles List) -->
    <template #tab-list>
      <div class="flex flex-col gap-2.5">
        <!-- Group filter dropdown -->
        <div v-if="groupsStore.componentGroups.length > 0" class="px-1 py-1 flex flex-col gap-1 shrink-0 border-b border-slate-100 pb-3 mb-1">
          <span class="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Filter by Group</span>
          <select
            v-model="selectedFilterGroupId"
            class="w-full text-[10px] font-bold text-slate-750 px-2.5 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none cursor-pointer appearance-none shadow-3xs"
          >
            <option :value="null">All Groups (No Filter)</option>
            <option v-for="g in groupsStore.componentGroups" :key="g.id" :value="g.id">
              {{ g.name }} ({{ g.members.length }} nodes)
            </option>
          </select>
        </div>

        <div v-if="paginatedCycles.length === 0" class="text-center py-12 text-slate-400 text-xs italic">
          No cycles match your search filters.
        </div>
        
        <button
          v-for="cycle in paginatedCycles"
          :key="cycle.id"
          @click="selectCycle(cycle)"
          class="w-full text-left p-4 rounded-2xl border transition-all duration-150 flex flex-col gap-2 group cursor-pointer"
          :class="selectedCycleId === cycle.id 
            ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
            : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 text-slate-700'"
        >
          <!-- Header -->
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-mono font-bold" :class="selectedCycleId === cycle.id ? 'text-slate-400' : 'text-slate-400'">
              Cycle #{{ cycle.id }}
            </span>
            <span class="flex h-1.5 w-1.5 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" :class="getSeverityDotColor(cycle.severity)"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5" :class="getSeverityDotColor(cycle.severity)"></span>
            </span>
          </div>

          <!-- Loop summary (small monospace breadcrumbs) -->
          <div class="text-[10.5px] font-mono leading-relaxed" :class="selectedCycleId === cycle.id ? 'text-white' : 'text-slate-600'">
            {{ getCycleSummaryText(cycle.nodes) }}
          </div>

          <!-- Pill badges footer -->
          <div class="flex items-center gap-1.5 border-t pt-2 mt-1" :class="selectedCycleId === cycle.id ? 'border-white/10' : 'border-slate-100'">
            <span class="text-[8px] px-1.5 py-0.5 rounded-md font-bold" :class="selectedCycleId === cycle.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'">
              {{ cycle.size }} nodes
            </span>
            <span class="text-[8px] px-1.5 py-0.5 rounded-md font-bold" :class="selectedCycleId === cycle.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'">
              {{ cycle.sharedCommits }} co-changes
            </span>
            <span class="ml-auto text-[9px] font-extrabold" :class="selectedCycleId === cycle.id ? 'text-slate-300' : 'text-slate-500'">
              Score: {{ cycle.severity }}
            </span>
          </div>
        </button>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 select-none">
          <button 
            @click="page = Math.max(1, page - 1)" 
            :disabled="page === 1"
            class="px-2.5 py-1.5 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Prev
          </button>
          <span class="text-[9.5px] text-slate-400 font-bold">
            Page {{ page }} of {{ totalPages }}
          </span>
          <button 
            @click="page = Math.min(totalPages, page + 1)" 
            :disabled="page === totalPages"
            class="px-2.5 py-1.5 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </template>

    <!-- Sidebar Drawer: Tab 2 (Loop Diagnostics - detailed table and files) -->
    <template #tab-diagnostics>
      <div v-if="selectedCycle" class="flex flex-col gap-5 text-slate-800 select-none">
        
        <!-- Files list -->
        <div v-if="breakingPoint" class="flex flex-col gap-2.5">
          <h4 class="font-extrabold text-[9.5px] text-slate-400 uppercase tracking-widest">Files causing Weakest Link</h4>
          <ul class="flex flex-col gap-1.5">
            <li 
              v-for="f in breakingPoint.files" 
              :key="f.file"
              class="bg-slate-50 border border-slate-200/50 rounded-xl p-2.5 flex items-center justify-between text-[10px] font-mono shadow-4xs"
            >
              <span class="truncate pr-2 text-slate-800" :title="f.file">{{ getFilename(f.file) }}</span>
              <span class="font-extrabold shrink-0 px-2 py-0.5 bg-slate-200/60 rounded-md text-slate-700">{{ f.count }} imports</span>
            </li>
          </ul>
        </div>

        <!-- Connection table details -->
        <div class="flex flex-col gap-2.5">
          <h4 class="font-extrabold text-[9.5px] text-slate-400 uppercase tracking-widest">Loop Connections Breakdown</h4>
          <div class="flex flex-col gap-2">
            <div 
              v-for="edge in sortedEdges" 
              :key="`${edge.from}-${edge.to}`"
              class="border rounded-2xl p-3 flex flex-col gap-2 bg-slate-50/50"
              :class="breakingPoint && breakingPoint.from === edge.from && breakingPoint.to === edge.to 
                ? 'border-rose-200/80 bg-rose-50/20' 
                : 'border-slate-100'"
            >
              <!-- Edge path header -->
              <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5 min-w-0 text-[10px] font-bold text-slate-800">
                  <span v-if="getGroupDotStyle(edge.from)" class="w-1.5 h-1.5 rounded-full shrink-0" :style="getGroupDotStyle(edge.from)"></span>
                  <span class="truncate" :title="edge.from">{{ getAbbreviatedName(edge.from) }}</span>
                  <span class="text-slate-400">➜</span>
                  <span v-if="getGroupDotStyle(edge.to)" class="w-1.5 h-1.5 rounded-full shrink-0" :style="getGroupDotStyle(edge.to)"></span>
                  <span class="truncate" :title="edge.to">{{ getAbbreviatedName(edge.to) }}</span>
                </div>
                <!-- Status tag -->
                <span 
                  class="text-[7.5px] font-extrabold px-1.5 py-0.5 rounded-md border"
                  :class="breakingPoint && breakingPoint.from === edge.from && breakingPoint.to === edge.to 
                    ? 'bg-rose-50 border-rose-200 text-rose-700' 
                    : 'bg-slate-100 border-slate-200 text-slate-600'"
                >
                  {{ breakingPoint && breakingPoint.from === edge.from && breakingPoint.to === edge.to ? 'Target Link' : 'Acyclic' }}
                </span>
              </div>
              
              <!-- Edge counts -->
              <div class="flex items-center justify-between text-[9px] font-mono text-slate-500 border-t border-slate-200/30 pt-1.5 mt-0.5">
                <div>Imports: <span class="font-extrabold text-slate-700">{{ edge.referenceCount }}</span></div>
                <div>Co-changes: <span class="font-extrabold text-slate-700">{{ edge.sharedCommits }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>

  <CreateGroupModal
    v-model:open="isCreateGroupModalOpen"
    :default-name="createGroupDefaultName"
    :members="createGroupMembers"
    type="component"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import CycleLoopChart from "~/components/components/cycles/CycleLoopChart.vue"

const store = useDataStore()
const groupsStore = useGroupsStore()

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const isCreateGroupModalOpen = ref(false)
const createGroupDefaultName = ref("")
const createGroupMembers = ref<string[]>([])

const searchQuery = ref("")
const sortBy = ref<"severity" | "size" | "sharedCommits">("severity")
const page = ref(1)
const itemsPerPage = 12

const selectedCycleId = ref<number | null>(null)
const selectedFilterGroupId = ref<string | null>(null)
const activeTab = ref("list")
const isSidebarOpen = ref(true)

// Reset pagination page on search query change or filter change
watch([searchQuery, selectedFilterGroupId], () => {
  page.value = 1
})

// Dynamic tab list for sidebar navigation
const tabs = computed(() => {
  const list = [{ id: "list", label: "Cycles List" }]
  if (selectedCycle.value) {
    list.push({ id: "diagnostics", label: "🔍 Diagnostics" })
  }
  return list
})

watch(selectedCycleId, (newId) => {
  if (newId !== null) {
    activeTab.value = "diagnostics"
  } else {
    activeTab.value = "list"
  }
})

const kpiStats = computed(() => {
  const total = store.allCyclesExpanded.length
  const maxSeverity = total > 0 ? Math.max(...store.allCyclesExpanded.map((c: any) => c.severity)) : 0
  return [
    { label: "Total Cycles", value: total.toString() },
    { label: "Max Severity", value: maxSeverity.toFixed(0) }
  ]
})

const filteredCycles = computed(() => {
  if (!store.hasData) return []
  let list = [...store.allCyclesExpanded]
  
  if (selectedFilterGroupId.value) {
    const group = groupsStore.getGroupById(selectedFilterGroupId.value)
    if (group) {
      const groupMembers = new Set(group.members)
      list = list.filter((c: any) => c.nodes.some((n: string) => groupMembers.has(n)))
    }
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((c: any) => c.nodes.some((n: string) => n.toLowerCase().includes(q)))
  }

  list.sort((a: any, b: any) => {
    if (sortBy.value === "severity") {
      return b.severity - a.severity
    } else if (sortBy.value === "size") {
      return b.size - a.size || b.severity - a.severity
    } else {
      return b.sharedCommits - a.sharedCommits || b.severity - a.severity
    }
  })

  return list
})

const totalPages = computed(() => Math.ceil(filteredCycles.value.length / itemsPerPage))
const paginatedCycles = computed(() => {
  const start = (page.value - 1) * itemsPerPage
  return filteredCycles.value.slice(start, start + itemsPerPage)
})

const selectedCycle = computed(() => {
  if (selectedCycleId.value === null) return null
  return store.allCyclesExpanded.find((c: any) => c.id === selectedCycleId.value) || null
})

function selectCycle(cycle: any) {
  selectedCycleId.value = cycle.id
}

function getSeverityDotColor(score: number): string {
  if (score >= 150) return "bg-rose-500"
  if (score >= 50) return "bg-amber-500"
  return "bg-emerald-500"
}

function getCycleSummaryText(nodes: string[]): string {
  const names = nodes.map(n => getAbbreviatedName(n))
  return names.join(" ➜ ") + " ➜ " + names[0]
}

function getAbbreviatedName(name: string): string {
  const parts = name.split(".")
  if (parts.length <= 2) return name
  return parts.slice(-2).join(".")
}

function getFilename(path: string): string {
  return path.split("/").pop() || path
}

interface EdgeDetail {
  from: string
  to: string
  referenceCount: number
  sharedCommits: number
  files: Array<{ file: string, count: number, lines: string }>
}

function toRanges(numbers: number[]): string[] {
  const ranges: string[] = []
  if (numbers.length === 0) return ranges
  let start = numbers[0]
  let end = numbers[0]
  for (const number of numbers.slice(1)) {
    if (number === end + 1) {
      end = number
    } else {
      if (start === end) {
        ranges.push(start.toString())
      } else {
        ranges.push(`${start}-${end}`)
      }
      start = number
      end = number
    }
  }
  if (start === end) {
    ranges.push(start.toString())
  } else {
    ranges.push(`${start}-${end}`)
  }
  return ranges
}

const selectedCycleEdges = computed((): EdgeDetail[] => {
  if (!selectedCycle.value) return []
  const nodes = selectedCycle.value.nodes
  const N = nodes.length

  const edges: EdgeDetail[] = []
  for (let i = 0; i < N; i++) {
    const from = nodes[i]
    const to = nodes[(i + 1) % N]

    const matchingConns = store.componentConnections.filter((c: any) => c.from === from && c.to === to)
    const refCount = matchingConns.reduce((sum: number, c: any) => sum + (Number(c.reference_count || c.count) || 0), 0)
    
    const files = matchingConns.map((c: any) => {
      const filePath = c.file || "unknown"
      const count = Number(c.reference_count || c.count) || 0
      
      const snippetRows = store.query(`
        SELECT begin_position
        FROM snippets
        WHERE file = '${filePath}'
          AND snippet_type = '${store.statName('modularity__component__imports')}'
          AND content = '${to}'
      `) as { begin_position: string }[]
      
      const lineNumbers = snippetRows
        .map(s => parseInt(s.begin_position.split(":")[0]))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b)
        
      const linesStr = lineNumbers.length > 0 ? toRanges(lineNumbers).join(", ") : ""
      
      return {
        file: filePath,
        count,
        lines: linesStr
      }
    }).filter(f => f.count > 0)

    const pairQuery = store.query(`
      SELECT shared_commits 
      FROM git_component_shared_commits 
      WHERE (pair_1 = '${from}' AND pair_2 = '${to}') OR (pair_1 = '${to}' AND pair_2 = '${from}')
    `) as { shared_commits: number }[]
    const sharedCommits = pairQuery.length > 0 ? Number(pairQuery[0].shared_commits) : 0

    edges.push({
      from,
      to,
      referenceCount: refCount,
      sharedCommits,
      files
    })
  }
  return edges
})

const sortedEdges = computed(() => {
  return [...selectedCycleEdges.value].sort((a, b) => a.referenceCount - b.referenceCount)
})

const breakingPoint = computed((): EdgeDetail | null => {
  if (!selectedCycleEdges.value.length) return null
  return sortedEdges.value[0]
})

const tiedEdges = computed(() => {
  if (!selectedCycleEdges.value.length) return []
  const minCount = sortedEdges.value[0].referenceCount
  return sortedEdges.value.filter(e => e.referenceCount === minCount)
})

const hasTies = computed(() => tiedEdges.value.length > 1)

const selectedEdge = ref<{ from: string; to: string } | null>(null)

watch(selectedCycleEdges, (newEdges) => {
  if (newEdges && newEdges.length > 0) {
    // Default to the weakest link (breakingPoint)
    selectedEdge.value = {
      from: breakingPoint.value?.from || newEdges[0].from,
      to: breakingPoint.value?.to || newEdges[0].to
    }
  } else {
    selectedEdge.value = null
  }
}, { immediate: true })

const activeInspectorEdge = computed((): EdgeDetail | null => {
  if (!selectedEdge.value) return null
  return selectedCycleEdges.value.find(
    e => e.from === selectedEdge.value!.from && e.to === selectedEdge.value!.to
  ) || null
})

function onSelectEdge(edge: { from: string; to: string }) {
  selectedEdge.value = edge
}

const isTiesExpanded = ref(false)

watch(selectedEdge, () => {
  isTiesExpanded.value = false
})

const isFilesDialogOpen = ref(false)

function openFilesDialog() {
  isFilesDialogOpen.value = true
}

function closeFilesDialog() {
  isFilesDialogOpen.value = false
}

function getGroupDotStyle(componentName: string) {
  const groups = groupsStore.getGroupsForComponent(componentName)
  if (groups.length === 0) return null
  return {
    backgroundColor: groups[0].color
  }
}

const selectedCycleGroupSpanSummary = computed(() => {
  if (!selectedCycle.value) return ""
  
  const counts = new Map<string, number>()
  let unassigned = 0
  
  for (const node of selectedCycle.value.nodes) {
    const groups = groupsStore.getGroupsForComponent(node)
    if (groups.length > 0) {
      for (const g of groups) {
        counts.set(g.name, (counts.get(g.name) || 0) + 1)
      }
    } else {
      unassigned++
    }
  }
  
  const parts: string[] = []
  for (const [name, count] of counts.entries()) {
    parts.push(`${name} (${count} node${count !== 1 ? 's' : ''})`)
  }
  if (unassigned > 0) {
    parts.push(`unassigned (${unassigned} node${unassigned !== 1 ? 's' : ''})`)
  }
  
  return `This cycle crosses: ${parts.join(", ")}.`
})

function saveCycleAsGroup() {
  if (!selectedCycle.value) return
  createGroupDefaultName.value = `Cycle ${selectedCycle.value.id} Group`
  createGroupMembers.value = selectedCycle.value.nodes
  isCreateGroupModalOpen.value = true
}
</script>

<style scoped>
.animate-ping {
  animation-duration: 2s;
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
.animate-scale-up {
  animation: scaleUp 0.2s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes scaleUp {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
