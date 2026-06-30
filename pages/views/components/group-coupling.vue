<template>
  <ViewWorkspaceLayout
    title="Group-to-Group Coupling"
    :badge-text="badgeText"
    badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[
      { id: 'layers', label: 'Layers & Config' },
      { id: 'inspector', label: 'Inspector' }
    ]"
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
            class="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 z-10"
          >
            <div>
              <h4 class="text-[10px] font-black text-slate-800 uppercase tracking-widest font-mono">
                Group-to-Group Coupling
              </h4>
              <p class="text-[8px] text-slate-400 mt-0.5">
                Force-directed graph of inter-group dependencies based on component connections
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button
                @click="resetZoom"
                class="text-[8.5px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-3xs"
              >
                Reset View
              </button>
            </div>
          </div>

          <!-- Stats Overlay -->
          <div
            v-if="graphNodes.length > 0"
            class="absolute top-20 right-5 text-[8px] font-bold z-10 bg-white/80 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-200/50 flex flex-col gap-0.5 shadow-2xs select-none"
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
            <svg ref="svgRef" :class="{ 'focus-cycles-active': focusCycles, 'focus-cross-group-active': focusCrossGroup }" class="w-full h-full bg-slate-50/30" @contextmenu.prevent="onCanvasContextMenu"></svg>

            <!-- Context Menu Floating Toolbar -->
            <div 
              v-if="contextMenu.visible"
              :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
              class="fixed z-50 bg-white border border-slate-200/85 rounded-xl shadow-lg p-1.5 min-w-[175px] flex flex-col animate-in fade-in slide-in-from-top-1 duration-100 select-none text-left"
            >
              <!-- NODE CONTEXT MENU -->
              <template v-if="contextMenu.type === 'node'">
                <div class="px-2.5 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1 mb-1 select-none">
                  {{ contextMenu.node?.type === 'group' ? 'Group Actions' : 'Component Actions' }}
                </div>
                
                <!-- Group actions -->
                <template v-if="contextMenu.node?.type === 'group'">
                  <button
                    @click="expandGroup(contextMenu.node.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>🔍</span>
                    <span>Expand Group</span>
                  </button>

                  <button
                    @click="isolateGroup(contextMenu.node.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>👁️</span>
                    <span>Isolate Group</span>
                  </button>

                  <button
                    @click="isolateGroupAndRelationships(contextMenu.node.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>🔗</span>
                    <span>Isolate Group + Relations</span>
                  </button>

                  <button
                    @click="hideGroup(contextMenu.node.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>🚫</span>
                    <span>Hide Group</span>
                  </button>
                </template>

                <!-- Component actions -->
                <template v-else-if="contextMenu.node?.type === 'component'">
                  <button
                    v-for="parentG in getParentExpandedGroups(contextMenu.node)"
                    :key="'collapse-' + parentG.id"
                    @click="collapseGroup(parentG.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>📦</span>
                    <span>Un-expand {{ parentG.name }}</span>
                  </button>

                  <button
                    v-for="parentG in getParentExpandedGroups(contextMenu.node)"
                    :key="'isolate-' + parentG.id"
                    @click="isolateGroup(parentG.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>👁️</span>
                    <span>Isolate {{ parentG.name }}</span>
                  </button>

                  <button
                    v-for="parentG in getParentExpandedGroups(contextMenu.node)"
                    :key="'isolate-rel-' + parentG.id"
                    @click="isolateGroupAndRelationships(parentG.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>🔗</span>
                    <span>Isolate {{ parentG.name }} + Relations</span>
                  </button>

                  <button
                    v-for="parentG in getParentExpandedGroups(contextMenu.node)"
                    :key="'hide-' + parentG.id"
                    @click="hideGroup(parentG.id)"
                    class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                  >
                    <span>🚫</span>
                    <span>Hide {{ parentG.name }}</span>
                  </button>
                </template>
              </template>

              <!-- RELATIONSHIP (EDGE) CONTEXT MENU -->
              <template v-else-if="contextMenu.type === 'edge'">
                <div class="px-2.5 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1 mb-1 select-none">
                  Relationship Actions
                </div>

                <button
                  @click="isolateRelationship(contextMenu.edge)"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>👁️</span>
                  <span>Isolate Both Groups</span>
                </button>

                <button
                  @click="hideRelationshipGroups(contextMenu.edge)"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>🚫</span>
                  <span>Hide Both Groups</span>
                </button>

                <button
                  @click="inspectRelationship(contextMenu.edge)"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>ℹ️</span>
                  <span>Inspect Details</span>
                </button>
              </template>

              <!-- CANVAS (EMPTY SPACE) CONTEXT MENU -->
              <template v-else-if="contextMenu.type === 'canvas'">
                <div class="px-2.5 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1 mb-1 select-none">
                  Canvas Actions
                </div>

                <button
                  @click="resetZoom(); closeContextMenu()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>🔄</span>
                  <span>Reset View (Zoom/Pan)</span>
                </button>

                <button
                  @click="resetAllFilters()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>✕</span>
                  <span>Reset All Filters</span>
                </button>

                <button
                  @click="expandAllGroups()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>🔍</span>
                  <span>Expand All Groups</span>
                </button>

                <button
                  @click="collapseAllGroups()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>📦</span>
                  <span>Collapse All Groups</span>
                </button>

                <div class="h-px bg-slate-100 my-1"></div>

                <button
                  @click="focusCycles = !focusCycles; closeContextMenu()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>{{ focusCycles ? '⚪' : '🔴' }}</span>
                  <span>{{ focusCycles ? 'Disable Focus Cycles' : 'Enable Focus Cycles' }}</span>
                </button>

                <button
                  @click="focusCrossGroup = !focusCrossGroup; closeContextMenu()"
                  class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
                >
                  <span>{{ focusCrossGroup ? '⚪' : '🌐' }}</span>
                  <span>{{ focusCrossGroup ? 'Disable Focus Cross-Group' : 'Enable Focus Cross-Group' }}</span>
                </button>
              </template>
              
              <div class="h-px bg-slate-100 my-1"></div>
              
              <button
                @click="closeContextMenu"
                class="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-650 rounded-lg transition-colors cursor-pointer flex items-center gap-2 select-none"
              >
                <span>✕</span>
                <span>Cancel</span>
              </button>
            </div>

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
        
        <!-- Reusable Group Action Bar -->
        <GroupsGroupActionBar
          :selected-items="selectedComponentNames"
          type="component"
          @clear="clearSelection"
        />
      </div>
    </template>

    <!-- Sidebar Layers & Config Tab -->
    <template #tab-layers>
      <div class="flex flex-col gap-5 select-none">
        <!-- Focus Modes -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Focus Modes</span>
          <div class="grid grid-cols-2 gap-2">
            <button 
              @click="focusCycles = !focusCycles"
              class="flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all cursor-pointer"
              :class="focusCycles ? 'border-red-200 bg-red-50/30 text-red-700' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'"
            >
              <span class="text-sm">🔴</span>
              <span class="text-[10px] font-extrabold leading-none">Focus Cycles</span>
              <span class="text-[8px] text-slate-400 font-medium">Highlight mutual dependency loops</span>
            </button>
            <button 
              @click="focusCrossGroup = !focusCrossGroup"
              class="flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all cursor-pointer"
              :class="focusCrossGroup ? 'border-sky-200 bg-sky-50/30 text-sky-700' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'"
            >
              <span class="text-sm">🌐</span>
              <span class="text-[10px] font-extrabold leading-none">Cross-Group</span>
              <span class="text-[8px] text-slate-400 font-medium">Highlight inter-group coupling</span>
            </button>
          </div>
        </div>

        <!-- Node Sizing -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Node Sizing</span>
          <div class="flex flex-col gap-2 p-3.5 bg-slate-50 border border-slate-200/50 rounded-2xl">
            <div class="flex flex-col gap-1">
              <label class="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Sizing Metric</label>
              <StatSelectSingle 
                v-model="nodeMetric"
                :options="distinctStats"
                placeholder="Member Count"
                class="w-full"
              />
            </div>
            <div v-if="nodeMetric" class="flex flex-col gap-1 mt-1">
              <label class="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Aggregation Mode</label>
              <div class="flex rounded-lg border border-slate-200 bg-white p-0.5 w-full">
                <button 
                  @click="nodeAggregation = 'sum'"
                  class="flex-1 text-[9px] font-bold py-1.5 px-2.5 rounded-md transition-all cursor-pointer text-center"
                  :class="nodeAggregation === 'sum' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                >
                  Sum
                </button>
                <button 
                  @click="nodeAggregation = 'avg'"
                  class="flex-1 text-[9px] font-bold py-1.5 px-2.5 rounded-md transition-all cursor-pointer text-center"
                  :class="nodeAggregation === 'avg' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                >
                  Average
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Link Settings -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Link Settings</span>
          <div class="flex flex-col gap-3 p-3.5 bg-slate-50 border border-slate-200/50 rounded-2xl">
            <!-- Coupling Type Segmented Control -->
            <div class="flex flex-col gap-1">
              <label class="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">Coupling Source</label>
              <div class="flex rounded-lg border border-slate-200 bg-white p-0.5 w-full">
                <button 
                  @click="couplingType = 'direct'"
                  class="flex-1 text-[9px] font-bold py-1.5 px-2.5 rounded-md transition-all cursor-pointer text-center"
                  :class="couplingType === 'direct' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                >
                  Direct Reference
                </button>
                <button 
                  @click="couplingType = 'git'"
                  class="flex-1 text-[9px] font-bold py-1.5 px-2.5 rounded-md transition-all cursor-pointer text-center"
                  :class="couplingType === 'git' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
                >
                  Git Co-changes
                </button>
              </div>
            </div>

            <!-- Checkbox Options -->
            <div class="flex flex-col gap-2.5 pt-1 text-left">
              <!-- Directed Links -->
              <label 
                v-if="couplingType === 'direct'"
                class="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-600 hover:text-slate-800 transition-colors"
              >
                <input 
                  type="checkbox" 
                  v-model="directionalLinks" 
                  class="rounded border-slate-350 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5 cursor-pointer"
                />
                Show Connection Direction
              </label>

              <!-- Show Names -->
              <label class="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-600 hover:text-slate-800 transition-colors">
                <input 
                  type="checkbox" 
                  v-model="showNames" 
                  class="rounded border-slate-350 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5 cursor-pointer"
                />
                Show Node Labels
              </label>
            </div>
          </div>
        </div>

        <!-- Layers List -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Layers (Groups)</span>
            <span class="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{{ matchedGroups.length }} / {{ groupsStore.allComponentGroups.length }}</span>
          </div>

          <!-- Search Input -->
          <div class="relative flex items-center shrink-0">
            <input 
              v-model="groupSearchQuery" 
              type="text" 
              placeholder="Filter layers..." 
              class="bg-white border border-slate-200 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[10px] font-semibold pl-7 pr-7 py-2 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs w-full font-mono"
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
            </svg>
            <button 
              v-if="groupSearchQuery"
              @click="groupSearchQuery = ''"
              class="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
            >
              ✕
            </button>
          </div>

          <!-- Scrollable list -->
          <div class="flex flex-col gap-1 border border-slate-100/80 rounded-2xl p-1 bg-slate-50/30 max-h-[300px] overflow-y-auto scroll-container">
            <div 
              v-for="group in matchedGroups" 
              :key="group.id" 
              class="group flex items-center justify-between px-3 py-2 hover:bg-white rounded-xl border border-transparent hover:border-slate-100 transition-all hover:shadow-4xs cursor-pointer select-none"
              @click="toggleGroupVisibility(group.id)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <!-- Color Dot -->
                <span 
                  class="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200/20"
                  :style="{ backgroundColor: group.color }"
                ></span>
                <!-- Name & Member count -->
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-[10px] font-extrabold text-slate-700 truncate leading-snug" :class="{ 'line-through text-slate-400 font-bold': hiddenGroups.has(group.id) }">
                    {{ group.name }}
                  </span>
                  <span class="text-[8px] text-slate-400 font-mono">
                    {{ group.members.length }} member{{ group.members.length === 1 ? '' : 's' }}
                  </span>
                </div>
              </div>

              <!-- Hover Actions & Visibility Toggle -->
              <div class="flex items-center gap-1.5 shrink-0" @click.stop>
                <!-- Isolate Button (Visible on hover) -->
                <button 
                  @click="isolateGroup(group.id)"
                  class="opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-[9px] font-extrabold text-violet-600 hover:text-violet-800 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                  title="Isolate this group"
                >
                  Only
                </button>
                
                <!-- Eye icon for Visibility toggle -->
                <button 
                  @click="toggleGroupVisibility(group.id)"
                  class="text-slate-400 hover:text-slate-650 transition-colors px-1 cursor-pointer"
                >
                  <span v-if="hiddenGroups.has(group.id)">🙈</span>
                  <span v-else>👁️</span>
                </button>
              </div>
            </div>
            <div v-if="matchedGroups.length === 0" class="text-center py-6 text-[9.5px] text-slate-400 italic">
              No groups found.
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Sidebar Inspector Tab -->
    <template #tab-inspector>
      <div class="flex flex-col gap-5 select-none">
        <!-- Empty State View -->
        <div
          v-if="selectedNodes.length === 0 && selectedEdges.length === 0"
          class="flex flex-col items-center justify-center text-center text-slate-400 italic text-[9.5px] py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/10"
        >
          <span class="text-xl mb-1.5">🔍</span>
          <span class="font-extrabold text-slate-500">No Selection</span>
          <span class="text-[7.5px] text-slate-400 mt-1 max-w-[200px]"
            >Click a node or relationship in the graph (or Shift+Click to multi-select) to inspect details.</span
          >
        </div>

        <!-- Single Node Details -->
        <div v-else-if="singleSelectedNode" class="flex flex-col gap-4">
          <!-- 1. GROUP NODE DETAILS -->
          <div v-if="singleSelectedNode.type === 'group'" class="flex flex-col gap-4">
            <!-- Header Card -->
            <div class="bg-violet-50/40 border border-violet-100/80 rounded-2xl p-4 flex flex-col gap-1.5 text-left relative overflow-hidden shadow-3xs">
              <div class="absolute right-0 top-0 w-16 h-16 bg-gradient-to-br from-violet-200/10 to-violet-500/10 rounded-bl-full pointer-events-none"></div>

              <div class="flex items-center gap-2">
                <span
                  class="w-3 h-3 rounded-full shrink-0 border border-white/40 shadow-4xs"
                  :style="{ background: singleSelectedNode.color }"
                ></span>
                <span class="text-[7.5px] font-black uppercase tracking-wider text-violet-600 font-mono">
                  Component Group
                </span>
              </div>
              <span class="text-xs font-black text-slate-800 break-all leading-tight pr-4">{{ singleSelectedNode.label }}</span>
              <span class="text-[8px] text-slate-500 font-bold font-mono">
                {{ singleSelectedNode.group.members.length }} member{{ singleSelectedNode.group.members.length === 1 ? '' : 's' }}
              </span>

              <div class="flex flex-col gap-1.5 mt-2.5">
                <!-- Expand Group Button -->
                <button
                  @click="expandGroup(singleSelectedNode.id)"
                  class="inline-flex items-center justify-center gap-1.5 text-[9px] font-black text-violet-600 hover:text-violet-850 transition-all bg-violet-55/10 hover:bg-violet-100/60 border border-violet-150 rounded-xl px-3 py-2 whitespace-nowrap shadow-3xs cursor-pointer select-none"
                >
                  <span>🔍</span>
                  <span>Expand Group Members</span>
                </button>

                <NuxtLink
                  :to="`/views/groups/${singleSelectedNode.id}`"
                  class="inline-flex items-center justify-center gap-1.5 text-[9px] font-black text-sky-600 hover:text-sky-850 transition-all bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 whitespace-nowrap shadow-3xs select-none"
                >
                  <span>Open Group Details</span>
                  <span>↗</span>
                </NuxtLink>
              </div>

              <!-- Dynamic Node Metric Info -->
              <div v-if="nodeMetric" class="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col gap-0.5">
                <span class="text-[7px] font-black uppercase tracking-wider text-slate-400 font-mono">
                  {{ dataStore.statNiceName(nodeMetric) }} ({{ nodeAggregation === 'sum' ? 'Sum' : 'Avg' }})
                </span>
                <span class="text-sm font-black text-slate-800 font-mono">
                  {{ formatMetricValue(singleSelectedNode.value) }}
                </span>
              </div>
            </div>

            <!-- Group Spanned Cycles -->
            <div v-if="getNodeCycles(singleSelectedNode.group).length > 0" class="flex flex-col gap-1.5 text-left">
              <span class="font-black text-red-500 text-[8px] uppercase tracking-widest font-mono flex items-center gap-1">
                <span>⚠️</span>
                <span>Spanned by {{ getNodeCycles(singleSelectedNode.group).length }} Cycle{{ getNodeCycles(singleSelectedNode.group).length === 1 ? '' : 's' }}</span>
              </span>
              <div class="flex flex-col max-h-[180px] overflow-y-auto pr-1 scroll-container bg-red-50/10 border border-red-100 rounded-2xl p-1">
                <div
                  v-for="cycle in getNodeCycles(singleSelectedNode.group)"
                  :key="cycle.id"
                  class="px-2.5 py-2 hover:bg-red-55/40 rounded-xl transition-all border-b border-red-50/30 last:border-0"
                >
                  <div class="flex items-start justify-between gap-1">
                    <NuxtLink
                      :to="`/views/components/cycles?id=${cycle.id}`"
                      class="font-mono text-[8px] font-bold text-red-800 hover:text-red-955 hover:underline leading-normal block break-all"
                    >
                      {{ getAbbreviatedCycleText(cycle.cycleText) }}
                    </NuxtLink>
                    <span class="text-[7px] text-red-400 font-mono font-bold shrink-0 bg-red-50 border border-red-100 px-1 py-0.5 rounded">
                      #{{ cycle.id }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Members List -->
            <div class="flex flex-col gap-1.5 text-left">
              <span class="font-black text-slate-400 text-[8px] uppercase tracking-widest font-mono">Members ({{ singleSelectedNode.group.members.length }})</span>
              <div class="flex flex-col max-h-[220px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-3xs">
                <div
                  v-for="member in singleSelectedNode.group.members"
                  :key="member"
                  class="px-2.5 py-1.5 hover:bg-slate-50/50 rounded-xl transition-all border-b border-slate-50/50 last:border-0"
                >
                  <span class="font-mono text-[8.5px] font-bold text-slate-700 truncate block" :title="member">
                    {{ dataStore.getComponentName(member) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. COMPONENT NODE DETAILS -->
          <div v-else class="flex flex-col gap-4">
            <!-- Header Card -->
            <div class="bg-indigo-50/40 border border-indigo-100/80 rounded-2xl p-4 flex flex-col gap-1.5 text-left relative overflow-hidden shadow-3xs">
              <div class="absolute right-0 top-0 w-16 h-16 bg-gradient-to-br from-indigo-200/10 to-indigo-500/10 rounded-bl-full pointer-events-none"></div>

              <div class="flex items-center gap-2">
                <span
                  class="w-3 h-3 rounded-full shrink-0 border border-slate-200/50 shadow-4xs"
                  :style="{ background: singleSelectedNode.color }"
                ></span>
                <span class="text-[7.5px] font-black uppercase tracking-wider text-indigo-600 font-mono">
                  Component Node
                </span>
              </div>
              <span class="text-xs font-black text-slate-800 break-all font-mono leading-tight pr-4">{{ singleSelectedNode.id }}</span>
              <span class="text-[8px] text-slate-400 font-bold">
                Expanded from: <strong class="text-indigo-600 font-extrabold">{{ singleSelectedNode.parentGroupName }}</strong>
              </span>

              <div class="flex flex-col gap-1.5 mt-2.5">
                <!-- Collapse / Un-expand Buttons -->
                <button
                  v-for="parentG in getParentExpandedGroups(singleSelectedNode)"
                  :key="parentG.id"
                  @click="collapseGroup(parentG.id)"
                  class="inline-flex items-center justify-center gap-1.5 text-[9px] font-black text-indigo-600 hover:text-indigo-850 transition-all bg-indigo-55/10 hover:bg-indigo-100/60 border border-indigo-150 rounded-xl px-3 py-2 whitespace-nowrap shadow-3xs cursor-pointer select-none"
                >
                  <span>📦</span>
                  <span>Un-expand {{ parentG.name }}</span>
                </button>

                <NuxtLink
                  :to="`/views/components/${singleSelectedNode.id}`"
                  class="inline-flex items-center justify-center gap-1.5 text-[9px] font-black text-sky-600 hover:text-sky-850 transition-all bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 whitespace-nowrap shadow-3xs select-none"
                >
                  <span>Open Component Details</span>
                  <span>↗</span>
                </NuxtLink>
              </div>

              <!-- Dynamic Node Metric Info -->
              <div v-if="nodeMetric" class="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col gap-0.5">
                <span class="text-[7px] font-black uppercase tracking-wider text-slate-400 font-mono">
                  {{ dataStore.statNiceName(nodeMetric) }}
                </span>
                <span class="text-sm font-black text-slate-800 font-mono">
                  {{ formatMetricValue(singleSelectedNode.value) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Single Edge Details -->
        <div v-else-if="singleSelectedEdge" class="flex flex-col gap-4">
          <!-- Header Card -->
          <div class="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-1.5 text-left relative overflow-hidden shadow-3xs">
            <div class="flex items-center gap-2">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                :style="{ background: singleSelectedEdge.fromColor }"
              ></span>
              <span class="text-[9px] font-black text-slate-700 truncate max-w-[100px]" :title="singleSelectedEdge.fromLabel">{{ singleSelectedEdge.fromLabel }}</span>
              <span class="text-[8px] text-slate-400 font-mono font-bold">{{ couplingType === 'direct' ? '➔' : '⇄' }}</span>
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                :style="{ background: singleSelectedEdge.toColor }"
              ></span>
              <span class="text-[9px] font-black text-slate-700 truncate max-w-[100px]" :title="singleSelectedEdge.toLabel">{{ singleSelectedEdge.toLabel }}</span>
            </div>
            <span class="text-[8px] text-slate-555 font-bold font-mono mt-1">
              {{ singleSelectedEdge.count }} total {{ couplingType === 'direct' ? 'reference' : 'shared commit' }}{{ singleSelectedEdge.count === 1 ? '' : 's' }}
            </span>
          </div>

          <!-- Spanning Cycles Warning Card -->
          <div v-if="singleSelectedEdge.hasCycles" class="flex flex-col gap-1.5 text-left">
            <span class="font-black text-red-555 text-[8px] uppercase tracking-widest font-mono flex items-center gap-1 select-none">
              <span>⚠️</span>
              <span>Mutual Dependency (Cycle)</span>
            </span>
            <div class="bg-red-55/10 border border-red-100 rounded-2xl p-3 text-[9.5px] text-red-800 leading-relaxed">
              A mutual dependency cycle exists between these elements. Components in <span class="font-mono font-extrabold">{{ singleSelectedEdge.fromLabel }}</span> reference <span class="font-mono font-extrabold">{{ singleSelectedEdge.toLabel }}</span>, AND vice-versa.
            </div>
          </div>

          <!-- Component Connections Breakdown -->
          <div class="flex flex-col gap-3 text-left">
            <span class="font-black text-slate-400 text-[8px] uppercase tracking-widest font-mono select-none">
              Component Connections
            </span>
            
            <!-- Direct Coupling: Split by Direction -->
            <template v-if="couplingType === 'direct' && selectedEdgeDirections">
              <!-- Direction 1 -->
              <div v-if="selectedEdgeDirections.dir1" class="flex flex-col gap-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl p-3 shadow-3xs">
                <div class="flex items-center justify-between text-[8px] font-black uppercase tracking-wider pb-2 border-b border-slate-100/80">
                  <div class="flex items-center gap-1.5 text-slate-700 min-w-0">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: selectedEdgeDirections.dir1.fromColor }"></span>
                    <span class="truncate max-w-[85px] font-mono" :title="selectedEdgeDirections.dir1.fromLabel">{{ selectedEdgeDirections.dir1.fromLabel }}</span>
                    <span class="text-slate-400 font-mono">➔</span>
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: selectedEdgeDirections.dir1.toColor }"></span>
                    <span class="truncate max-w-[85px] font-mono" :title="selectedEdgeDirections.dir1.toLabel">{{ selectedEdgeDirections.dir1.toLabel }}</span>
                  </div>
                  <span class="text-[7.5px] font-mono text-slate-400 font-bold shrink-0 bg-white border border-slate-100 px-1 py-0.5 rounded">
                    {{ selectedEdgeDirections.dir1.connections.length }} link{{ selectedEdgeDirections.dir1.connections.length === 1 ? '' : 's' }} • {{ selectedEdgeDirections.dir1.totalRef }} ref{{ selectedEdgeDirections.dir1.totalRef === 1 ? '' : 's' }}
                  </span>
                </div>
                <div class="flex flex-col gap-1 max-h-[160px] overflow-y-auto scroll-container pr-1">
                  <div
                    v-for="(detail, idx) in selectedEdgeDirections.dir1.connections"
                    :key="idx"
                    class="flex items-center justify-between px-2 py-1.5 hover:bg-white rounded-xl transition-all border-b border-slate-50/20 last:border-0 cursor-pointer hover:shadow-4xs"
                    @click="openCouplingModal(detail.from, detail.to)"
                  >
                    <div class="flex flex-col min-w-0 mr-2 text-left">
                      <span class="font-mono text-[8px] font-bold text-slate-700 truncate" :title="detail.from">
                        {{ dataStore.getComponentName(detail.from) }}
                      </span>
                      <span class="font-mono text-[7px] text-slate-400 truncate" :title="detail.to">
                        ➔ {{ dataStore.getComponentName(detail.to) }}
                      </span>
                    </div>
                    <span class="text-[7.5px] font-black text-slate-500 font-mono shrink-0 bg-slate-100 border border-slate-200/30 px-1 py-0.5 rounded-md">
                      {{ detail.count }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Direction 2 -->
              <div v-if="selectedEdgeDirections.dir2" class="flex flex-col gap-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl p-3 shadow-3xs">
                <div class="flex items-center justify-between text-[8px] font-black uppercase tracking-wider pb-2 border-b border-slate-100/80">
                  <div class="flex items-center gap-1.5 text-slate-700 min-w-0">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: selectedEdgeDirections.dir2.fromColor }"></span>
                    <span class="truncate max-w-[85px] font-mono" :title="selectedEdgeDirections.dir2.fromLabel">{{ selectedEdgeDirections.dir2.fromLabel }}</span>
                    <span class="text-slate-400 font-mono">➔</span>
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: selectedEdgeDirections.dir2.toColor }"></span>
                    <span class="truncate max-w-[85px] font-mono" :title="selectedEdgeDirections.dir2.toLabel">{{ selectedEdgeDirections.dir2.toLabel }}</span>
                  </div>
                  <span class="text-[7.5px] font-mono text-slate-400 font-bold shrink-0 bg-white border border-slate-100 px-1 py-0.5 rounded">
                    {{ selectedEdgeDirections.dir2.connections.length }} link{{ selectedEdgeDirections.dir2.connections.length === 1 ? '' : 's' }} • {{ selectedEdgeDirections.dir2.totalRef }} ref{{ selectedEdgeDirections.dir2.totalRef === 1 ? '' : 's' }}
                  </span>
                </div>
                <div class="flex flex-col gap-1 max-h-[160px] overflow-y-auto scroll-container pr-1">
                  <div
                    v-for="(detail, idx) in selectedEdgeDirections.dir2.connections"
                    :key="idx"
                    class="flex items-center justify-between px-2 py-1.5 hover:bg-white rounded-xl transition-all border-b border-slate-50/20 last:border-0 cursor-pointer hover:shadow-4xs"
                    @click="openCouplingModal(detail.from, detail.to)"
                  >
                    <div class="flex flex-col min-w-0 mr-2 text-left">
                      <span class="font-mono text-[8px] font-bold text-slate-700 truncate" :title="detail.from">
                        {{ dataStore.getComponentName(detail.from) }}
                      </span>
                      <span class="font-mono text-[7px] text-slate-400 truncate" :title="detail.to">
                        ➔ {{ dataStore.getComponentName(detail.to) }}
                      </span>
                    </div>
                    <span class="text-[7.5px] font-black text-slate-500 font-mono shrink-0 bg-slate-100 border border-slate-200/30 px-1 py-0.5 rounded-md">
                      {{ detail.count }}
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Git Coupling: Undirected co-changes list -->
            <template v-else-if="couplingType === 'git'">
              <div class="flex flex-col gap-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl p-3 shadow-3xs">
                <div class="flex items-center justify-between text-[8px] font-black uppercase tracking-wider pb-2 border-b border-slate-100/80 select-none">
                  <span class="text-slate-700">Commit Co-changes</span>
                  <span class="text-[7.5px] font-mono text-slate-400 font-bold shrink-0 bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                    {{ singleSelectedEdge.details.length }} pair{{ singleSelectedEdge.details.length === 1 ? '' : 's' }}
                  </span>
                </div>
                <div class="flex flex-col gap-1 max-h-[220px] overflow-y-auto scroll-container pr-1">
                  <div
                    v-for="(detail, idx) in singleSelectedEdge.details"
                    :key="idx"
                    class="flex items-center justify-between px-2 py-1.5 hover:bg-white rounded-xl transition-all border-b border-slate-50/20 last:border-0 cursor-pointer hover:shadow-4xs"
                    @click="openCouplingModal(detail.from, detail.to)"
                  >
                    <div class="flex flex-col min-w-0 mr-2 text-left">
                      <span class="font-mono text-[8px] font-bold text-slate-700 truncate" :title="detail.from">
                        {{ dataStore.getComponentName(detail.from) }}
                      </span>
                      <span class="font-mono text-[7px] text-slate-400 truncate" :title="detail.to">
                        ⇄ {{ dataStore.getComponentName(detail.to) }}
                      </span>
                    </div>
                    <span class="text-[7.5px] font-black text-slate-555 font-mono shrink-0 bg-slate-100 border border-slate-200/30 px-1 py-0.5 rounded-md">
                      {{ detail.count }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Unified Multi-Selection -->
        <div v-else class="flex flex-col gap-4 text-left">
          <!-- Multi-select header summary -->
          <div class="bg-slate-50 border border-slate-200/85 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden shadow-3xs">
            <div class="absolute right-0 top-0 w-16 h-16 bg-gradient-to-br from-slate-200/10 to-slate-500/10 rounded-bl-full pointer-events-none"></div>
            <span class="text-[7.5px] font-black uppercase tracking-wider text-slate-455 font-mono">
              Multi-Selection
            </span>
            <span class="text-xs font-black text-slate-800">
              <template v-if="selectedNodes.length > 0 && selectedEdges.length > 0">
                {{ selectedNodes.length }} Node{{ selectedNodes.length === 1 ? '' : 's' }} &amp; {{ selectedEdges.length }} Relationship{{ selectedEdges.length === 1 ? '' : 's' }} Selected
              </template>
              <template v-else-if="selectedNodes.length > 0">
                {{ selectedNodes.length }} Node{{ selectedNodes.length === 1 ? '' : 's' }} Selected
              </template>
              <template v-else>
                {{ selectedEdges.length }} Relationship{{ selectedEdges.length === 1 ? '' : 's' }} Selected
              </template>
            </span>
            <span v-if="selectedNodes.length > 0" class="text-[8px] text-slate-400 font-mono mt-0.5">
              Select components and use the Action Bar at the bottom or bulk actions below.
            </span>
          </div>

          <!-- Bulk Action Buttons for Nodes (Only show if at least one node is selected) -->
          <div v-if="selectedNodes.length > 0" class="flex flex-col gap-1.5 bg-slate-50/30 border border-slate-150 rounded-2xl p-3">
            <span class="text-[8px] font-black uppercase tracking-widest text-slate-400 font-mono mb-1">Bulk Actions (Nodes)</span>
            <div class="grid grid-cols-2 gap-2">
              <button 
                @click="expandSelected"
                class="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-[9px] font-black text-slate-700 cursor-pointer shadow-3xs transition-all active:scale-95"
              >
                <span>🔍</span>
                <span>Expand</span>
              </button>
              <button 
                @click="collapseSelected"
                class="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-[9px] font-black text-slate-700 cursor-pointer shadow-3xs transition-all active:scale-95"
              >
                <span>📦</span>
                <span>Collapse</span>
              </button>
              <button 
                @click="isolateSelected"
                class="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-violet-50 border border-violet-100 hover:bg-violet-100/60 rounded-xl text-[9px] font-black text-violet-700 cursor-pointer shadow-3xs transition-all active:scale-95"
              >
                <span>👁️</span>
                <span>Isolate</span>
              </button>
              <button 
                @click="hideSelected"
                class="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-red-50 border border-red-100 hover:bg-red-100/60 rounded-xl text-[9px] font-black text-red-700 cursor-pointer shadow-3xs transition-all active:scale-95"
              >
                <span>🚫</span>
                <span>Hide</span>
              </button>
            </div>
          </div>

          <!-- Selected Nodes List (Only show if at least one node is selected) -->
          <div v-if="selectedNodes.length > 0" class="flex flex-col gap-1.5">
            <span class="font-black text-slate-400 text-[8px] uppercase tracking-widest font-mono">Selected Nodes ({{ selectedNodes.length }})</span>
            <div class="flex flex-col max-h-[200px] overflow-y-auto pr-1 scroll-container bg-white border border-slate-100 rounded-2xl p-1 shadow-3xs">
              <div 
                v-for="node in selectedNodes" 
                :key="node.id"
                class="group flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 rounded-xl transition-all border-b border-slate-50 last:border-0"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span 
                    class="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200/20"
                    :style="{ backgroundColor: node.color }"
                  ></span>
                  <div class="flex flex-col min-w-0">
                    <span class="font-mono text-[9px] font-bold text-slate-700 truncate leading-snug" :title="node.id">
                      {{ node.label }}
                    </span>
                    <span class="text-[7px] text-slate-400 font-mono uppercase tracking-wider">
                      {{ node.type }}
                    </span>
                  </div>
                </div>
                <button 
                  @click="removeNodeFromSelection(node)"
                  class="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- Selected Relationships List (Only show if at least one edge is selected) -->
          <div v-if="selectedEdges.length > 0" class="flex flex-col gap-1.5">
            <span class="font-black text-slate-400 text-[8px] uppercase tracking-widest font-mono">Selected Relationships ({{ selectedEdges.length }})</span>
            <div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1 scroll-container">
              <div 
                v-for="edge in selectedEdges" 
                :key="getEdgeKey(edge)"
                class="bg-white border border-slate-100 rounded-2xl p-3 shadow-3xs flex flex-col gap-2 transition-all hover:border-slate-200"
              >
                <!-- Edge Header -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 min-w-0 mr-2">
                    <span 
                      class="w-2 h-2 rounded-full shrink-0 border border-slate-200/20"
                      :style="{ backgroundColor: edge.fromColor }"
                    ></span>
                    <span class="font-mono text-[8.5px] font-bold text-slate-700 truncate max-w-[80px]" :title="edge.fromLabel">{{ edge.fromLabel }}</span>
                    <span class="text-[7.5px] text-slate-400 font-mono">{{ couplingType === 'direct' ? '➔' : '⇄' }}</span>
                    <span 
                      class="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200/20"
                      :style="{ backgroundColor: edge.toColor }"
                    ></span>
                    <span class="font-mono text-[8.5px] font-bold text-slate-700 truncate max-w-[80px]" :title="edge.toLabel">{{ edge.toLabel }}</span>
                  </div>
                  
                  <div class="flex items-center gap-2 shrink-0">
                    <!-- Toggle Details Button -->
                    <button
                      @click="toggleEdgeDetails(edge)"
                      class="px-2 py-0.5 text-[8.5px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/60 rounded-md transition-colors cursor-pointer"
                    >
                      {{ isEdgeDetailsExpanded(edge) ? 'Hide Links' : 'Show Links' }}
                    </button>

                    <!-- Remove Button -->
                    <button 
                      @click="removeEdgeFromSelection(edge)"
                      class="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <!-- Edge Details (Count of references / commit co-changes) -->
                <div class="flex items-center justify-between text-[7.5px] text-slate-555 font-mono px-0.5">
                  <span>
                    {{ edge.count }} total {{ couplingType === 'direct' ? 'reference' : 'shared commit' }}{{ edge.count === 1 ? '' : 's' }}
                  </span>
                  <span v-if="edge.hasCycles" class="text-red-500 font-bold">
                    ⚠️ Cycle
                  </span>
                </div>

                <!-- Expanded Connections Breakdown -->
                <div v-if="isEdgeDetailsExpanded(edge)" class="flex flex-col gap-2 mt-1 pt-2 border-t border-slate-100/60">
                  <!-- Direct Coupling Breakdown -->
                  <template v-if="couplingType === 'direct'">
                    <div v-if="getEdgeDirections(edge)" class="flex flex-col gap-2">
                      <!-- Direction 1 -->
                      <div v-if="getEdgeDirections(edge).dir1" class="flex flex-col gap-1.5 bg-slate-50/50 border border-slate-100 rounded-xl p-2.5">
                        <div class="flex items-center justify-between text-[7.5px] font-black uppercase tracking-wider pb-1 border-b border-slate-100">
                          <div class="flex items-center gap-1 text-slate-600 min-w-0">
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: getEdgeDirections(edge).dir1.fromColor }"></span>
                            <span class="truncate max-w-[65px] font-mono">{{ getEdgeDirections(edge).dir1.fromLabel }}</span>
                            <span class="text-slate-400 font-mono">➔</span>
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: getEdgeDirections(edge).dir1.toColor }"></span>
                            <span class="truncate max-w-[65px] font-mono">{{ getEdgeDirections(edge).dir1.toLabel }}</span>
                          </div>
                          <span class="text-[7px] text-slate-455 font-mono">
                            {{ getEdgeDirections(edge).dir1.connections.length }} link{{ getEdgeDirections(edge).dir1.connections.length === 1 ? '' : 's' }}
                          </span>
                        </div>
                        <div class="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto scroll-container pr-1">
                          <div
                            v-for="(detail, idx) in getEdgeDirections(edge).dir1.connections"
                            :key="idx"
                            class="flex items-center justify-between px-1.5 py-1 hover:bg-white border-b border-slate-50/20 last:border-0 rounded cursor-pointer transition-all hover:shadow-4xs"
                            @click="openCouplingModal(detail.from, detail.to)"
                          >
                            <div class="flex flex-col min-w-0 mr-1 text-left">
                              <span class="font-mono text-[7.5px] font-bold text-slate-700 truncate" :title="detail.from">
                                {{ dataStore.getComponentName(detail.from) }}
                              </span>
                              <span class="font-mono text-[6.5px] text-slate-400 truncate" :title="detail.to">
                                ➔ {{ dataStore.getComponentName(detail.to) }}
                              </span>
                            </div>
                            <span class="text-[7px] font-bold text-slate-500 font-mono shrink-0 bg-slate-100 border border-slate-200/20 px-1 py-0.5 rounded">
                              {{ detail.count }}
                            </span>
                          </div>
                        </div>
                      </div>

                      <!-- Direction 2 -->
                      <div v-if="getEdgeDirections(edge).dir2" class="flex flex-col gap-1.5 bg-slate-50/50 border border-slate-100 rounded-xl p-2.5">
                        <div class="flex items-center justify-between text-[7.5px] font-black uppercase tracking-wider pb-1 border-b border-slate-100">
                          <div class="flex items-center gap-1 text-slate-600 min-w-0">
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: getEdgeDirections(edge).dir2.fromColor }"></span>
                            <span class="truncate max-w-[65px] font-mono">{{ getEdgeDirections(edge).dir2.fromLabel }}</span>
                            <span class="text-slate-400 font-mono">➔</span>
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: getEdgeDirections(edge).dir2.toColor }"></span>
                            <span class="truncate max-w-[65px] font-mono">{{ getEdgeDirections(edge).dir2.toLabel }}</span>
                          </div>
                          <span class="text-[7px] text-slate-455 font-mono">
                            {{ getEdgeDirections(edge).dir2.connections.length }} link{{ getEdgeDirections(edge).dir2.connections.length === 1 ? '' : 's' }}
                          </span>
                        </div>
                        <div class="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto scroll-container pr-1">
                          <div
                            v-for="(detail, idx) in getEdgeDirections(edge).dir2.connections"
                            :key="idx"
                            class="flex items-center justify-between px-1.5 py-1 hover:bg-white border-b border-slate-50/20 last:border-0 rounded cursor-pointer transition-all hover:shadow-4xs"
                            @click="openCouplingModal(detail.from, detail.to)"
                          >
                            <div class="flex flex-col min-w-0 mr-1 text-left">
                              <span class="font-mono text-[7.5px] font-bold text-slate-700 truncate" :title="detail.from">
                                {{ dataStore.getComponentName(detail.from) }}
                              </span>
                              <span class="font-mono text-[6.5px] text-slate-400 truncate" :title="detail.to">
                                ➔ {{ dataStore.getComponentName(detail.to) }}
                              </span>
                            </div>
                            <span class="text-[7px] font-bold text-slate-500 font-mono shrink-0 bg-slate-100 border border-slate-200/20 px-1 py-0.5 rounded">
                              {{ detail.count }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- Git Coupling Breakdown -->
                  <template v-else>
                    <div class="flex flex-col gap-1.5 bg-slate-50/50 border border-slate-100 rounded-xl p-2.5">
                      <div class="text-[7.5px] font-black uppercase tracking-wider pb-1 border-b border-slate-100 text-slate-600 text-left">
                        Commit Co-changes ({{ edge.details.length }} pair{{ edge.details.length === 1 ? '' : 's' }})
                      </div>
                      <div class="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto scroll-container pr-1">
                        <div
                          v-for="(detail, idx) in edge.details"
                          :key="idx"
                          class="flex items-center justify-between px-1.5 py-1 hover:bg-white border-b border-slate-50/20 last:border-0 rounded cursor-pointer transition-all hover:shadow-4xs"
                          @click="openCouplingModal(detail.from, detail.to)"
                        >
                          <div class="flex flex-col min-w-0 mr-1 text-left">
                            <span class="font-mono text-[7.5px] font-bold text-slate-700 truncate" :title="detail.from">
                              {{ dataStore.getComponentName(detail.from) }}
                            </span>
                            <span class="font-mono text-[6.5px] text-slate-400 truncate" :title="detail.to">
                              ⇄ {{ dataStore.getComponentName(detail.to) }}
                            </span>
                          </div>
                          <span class="text-[7px] font-bold text-slate-500 font-mono shrink-0 bg-slate-100 border border-slate-200/20 px-1 py-0.5 rounded">
                            {{ detail.count }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>

  <CouplingDetailsModal
    :from-component="modalFromComponent"
    :to-component="modalToComponent"
    :fromComponent="modalFromComponent"
    :toComponent="modalToComponent"
    @update:from-component="modalFromComponent = $event"
    @update:to-component="modalToComponent = $event"
    @update:fromComponent="modalFromComponent = $event"
    @update:toComponent="modalToComponent = $event"
    :is-open="isCouplingModalOpen"
    @close="isCouplingModalOpen = false"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useGroupsStore, type SavedGroup } from "~/stores/groups"
import { useMetrics } from "~/composables/useMetrics"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import CouplingDetailsModal from "~/components/components/modals/CouplingDetailsModal.vue"
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue"

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
const activeTab = ref<'layers' | 'inspector'>('layers')
const svgRef = ref<SVGSVGElement | null>(null)

let simulation: d3.Simulation<GroupNode, GroupEdge> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let strokeScale: d3.ScaleLinear<number, number, never> | null = null

const selectedNodes = ref<any[]>([])
const selectedEdges = ref<any[]>([])

const selectedComponentNames = computed(() => {
  const names = new Set<string>()
  for (const node of selectedNodes.value) {
    if (node.type === 'component') {
      names.add(node.id)
    }
  }
  return Array.from(names)
})

const expandedEdgeKeys = ref<Set<string>>(new Set())

function getEdgeKey(edge: any): string {
  if (!edge) return ""
  return `${edge.fromId}::${edge.toId}`
}

function toggleEdgeDetails(edge: any) {
  const key = getEdgeKey(edge)
  if (expandedEdgeKeys.value.has(key)) {
    expandedEdgeKeys.value.delete(key)
  } else {
    expandedEdgeKeys.value.add(key)
  }
}

function isEdgeDetailsExpanded(edge: any): boolean {
  return expandedEdgeKeys.value.has(getEdgeKey(edge))
}

function clearSelection() {
  selectedNodes.value = []
  selectedEdges.value = []
  expandedEdgeKeys.value.clear()
}

const singleSelectedNode = computed(() => {
  return selectedNodes.value.length === 1 && selectedEdges.value.length === 0 ? selectedNodes.value[0] : null
})

const singleSelectedEdge = computed(() => {
  return selectedEdges.value.length === 1 && selectedNodes.value.length === 0 ? selectedEdges.value[0] : null
})

function hideSelected() {
  for (const node of selectedNodes.value) {
    if (node.type === 'group') {
      addOperation('hide', node.id)
    } else if (node.type === 'component' && node.parentGroupId) {
      addOperation('hide', node.parentGroupId)
    }
  }
  clearSelection()
}

function expandSelected() {
  for (const node of selectedNodes.value) {
    if (node.type === 'group') {
      addOperation('expand', node.id)
    }
  }
}

function collapseSelected() {
  for (const node of selectedNodes.value) {
    if (node.type === 'group') {
      removeOperation('expand', node.id)
    } else if (node.type === 'component' && node.parentGroupId) {
      removeOperation('expand', node.parentGroupId)
    }
  }
}

function isolateSelected() {
  const keepGroupIds = new Set<string>()
  for (const node of selectedNodes.value) {
    if (node.type === 'group') {
      keepGroupIds.add(node.id)
    } else if (node.type === 'component' && node.parentGroupId) {
      keepGroupIds.add(node.parentGroupId)
    }
  }
  
  if (keepGroupIds.size === 0) return
  
  clearOperationsOfType('hide')
  for (const g of groupsStore.allComponentGroups) {
    if (!keepGroupIds.has(g.id)) {
      addOperation('hide', g.id)
    }
  }
}

function removeNodeFromSelection(node: any) {
  selectedNodes.value = selectedNodes.value.filter(n => n.id !== node.id)
}

function removeEdgeFromSelection(edge: any) {
  selectedEdges.value = selectedEdges.value.filter(e => !(e.fromId === edge.fromId && e.toId === edge.toId))
  expandedEdgeKeys.value.delete(getEdgeKey(edge))
}

const couplingType = ref<'direct' | 'git'>('direct')
const nodeMetric = ref<string | null>(null)
const nodeAggregation = ref<'sum' | 'avg'>('sum')
const directionalLinks = ref(false)
const showNames = ref(true)
export interface GraphOperation {
  type: 'hide' | 'expand' | 'focus' | 'search';
  value: string;
}

const operations = ref<GraphOperation[]>([])

function hasOperation(type: GraphOperation['type'], value: string): boolean {
  return operations.value.some(op => op.type === type && op.value === value)
}

function addOperation(type: GraphOperation['type'], value: string) {
  if (!hasOperation(type, value)) {
    operations.value.push({ type, value })
    if (type === 'hide') {
      removeOperation('expand', value)
    } else if (type === 'expand') {
      removeOperation('hide', value)
    }
  }
}

function removeOperation(type: GraphOperation['type'], value: string) {
  operations.value = operations.value.filter(op => !(op.type === type && op.value === value))
}

function toggleOperation(type: GraphOperation['type'], value: string) {
  if (hasOperation(type, value)) {
    removeOperation(type, value)
  } else {
    addOperation(type, value)
  }
}

function clearOperationsOfType(type: GraphOperation['type']) {
  operations.value = operations.value.filter(op => op.type !== type)
}

function removeBadge(type: GraphOperation['type'], values: string[]) {
  for (const val of values) {
    removeOperation(type, val)
  }
}


const hiddenGroups = computed(() => {
  return new Set(operations.value.filter(op => op.type === 'hide').map(op => op.value))
})

const expandedGroupIds = computed(() => {
  return new Set(operations.value.filter(op => op.type === 'expand').map(op => op.value))
})

const focusCycles = computed({
  get: () => hasOperation('focus', 'cycles'),
  set: (val: boolean) => {
    if (val) addOperation('focus', 'cycles')
    else removeOperation('focus', 'cycles')
  }
})

const focusCrossGroup = computed({
  get: () => hasOperation('focus', 'cross-group'),
  set: (val: boolean) => {
    if (val) addOperation('focus', 'cross-group')
    else removeOperation('focus', 'cross-group')
  }
})

const groupSearchQuery = computed({
  get: () => operations.value.filter(op => op.type === 'search').map(op => op.value).join(', '),
  set: (newVal: string) => {
    clearOperationsOfType('search')
    const terms = newVal.split(/[\s,]+/).filter(Boolean)
    for (const term of terms) {
      addOperation('search', term)
    }
  }
})

const matchedGroups = computed(() => {
  const query = groupSearchQuery.value.trim().toLowerCase()
  if (!query) return groupsStore.allComponentGroups

  const terms = query.split(/[\s,]+/).filter(Boolean)
  if (terms.length === 0) return groupsStore.allComponentGroups

  return groupsStore.allComponentGroups.filter(g =>
    terms.some(term => g.name.toLowerCase().includes(term))
  )
})

const activeBadges = computed(() => {
  const badges: { type: GraphOperation['type']; values: string[] }[] = []
  for (const op of operations.value) {
    const lastBadge = badges[badges.length - 1]
    if (lastBadge && lastBadge.type === 'hide' && op.type === 'hide') {
      lastBadge.values.push(op.value)
    } else {
      badges.push({
        type: op.type,
        values: [op.value]
      })
    }
  }
  return badges.map(b => {
    let label = ''
    if (b.type === 'hide') {
      label = `hidden: ${b.values.join(', ')}`
    } else if (b.type === 'expand') {
      label = `expanded: ${b.values.join(', ')}`
    } else if (b.type === 'focus') {
      label = `focus: ${b.values.join(', ')}`
    } else if (b.type === 'search') {
      label = `search: "${b.values.join('", "')}"`
    }
    return {
      type: b.type,
      values: b.values,
      label
    }
  })
})


function isCrossGroupEdge(edge: GroupEdgeData): boolean {
  if (edge.fromType === 'group' || edge.toType === 'group') return true

  const fromGroups = groupsStore.componentGroupIndex.get(edge.fromId) || []
  const toGroups = groupsStore.componentGroupIndex.get(edge.toId) || []

  const fromGroupIds = new Set(fromGroups.map(g => g.id))
  return !toGroups.some(g => fromGroupIds.has(g.id))
}

const cyclicNodeIds = computed(() => {
  const ids = new Set<string>()
  for (const edge of graphEdges.value) {
    if (edge.data.hasCycles) {
      ids.add(edge.data.fromId)
      ids.add(edge.data.toId)
    }
  }
  return ids
})

const crossGroupNodeIds = computed(() => {
  const ids = new Set<string>()
  for (const edge of graphEdges.value) {
    if (isCrossGroupEdge(edge.data)) {
      ids.add(edge.data.fromId)
      ids.add(edge.data.toId)
    }
  }
  return ids
})

function isolateGroup(groupId: string) {
  clearOperationsOfType('hide')
  for (const g of groupsStore.allComponentGroups) {
    if (g.id !== groupId) {
      addOperation('hide', g.id)
    }
  }
  closeContextMenu()
}

function hideGroup(groupId: string) {
  addOperation('hide', groupId)
  closeContextMenu()
}

const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  type: 'node' | 'edge' | 'canvas' | null
  node: any | null
  edge: any | null
}>({
  visible: false,
  x: 0,
  y: 0,
  type: null,
  node: null,
  edge: null
})

function getGroupIdsForNodeId(nodeId: string): string[] {
  if (groupsStore.allComponentGroups.some(g => g.id === nodeId)) {
    return [nodeId]
  }
  const groups = groupsStore.componentGroupIndex.get(nodeId) || []
  return groups.map(g => g.id)
}

function isolateGroupAndRelationships(groupId: string) {
  const targetGroup = groupsStore.allComponentGroups.find(g => g.id === groupId)
  if (!targetGroup) return

  const targetMembers = new Set(targetGroup.members)
  const connectedGroupIds = new Set<string>([groupId])

  // Find all component connections to/from this group
  for (const c of dataStore.componentConnections) {
    const fromIsTarget = targetMembers.has(c.from)
    const toIsTarget = targetMembers.has(c.to)

    if (fromIsTarget || toIsTarget) {
      const otherComp = fromIsTarget ? c.to : c.from
      const groupsForOther = groupsStore.componentGroupIndex.get(otherComp) || []
      for (const og of groupsForOther) {
        connectedGroupIds.add(og.id)
      }
    }
  }

  // If git coupling is active, we also need to consider git shared commits
  if (couplingType.value === 'git') {
    for (const c of gitCouplingData.value) {
      const p1IsTarget = targetMembers.has(c.pair_1)
      const p2IsTarget = targetMembers.has(c.pair_2)

      if (p1IsTarget || p2IsTarget) {
        const otherComp = p1IsTarget ? c.pair_2 : c.pair_1
        const groupsForOther = groupsStore.componentGroupIndex.get(otherComp) || []
        for (const og of groupsForOther) {
          connectedGroupIds.add(og.id)
        }
      }
    }
  }

  // Hide everything that is NOT in connectedGroupIds, OR was previously hidden
  const previouslyHidden = new Set(hiddenGroups.value)
  clearOperationsOfType('hide')
  for (const g of groupsStore.allComponentGroups) {
    if (!connectedGroupIds.has(g.id) || previouslyHidden.has(g.id)) {
      addOperation('hide', g.id)
    }
  }
  closeContextMenu()
}

function isolateRelationship(edge: any) {
  if (!edge) return
  const fromGroupIds = getGroupIdsForNodeId(edge.fromId)
  const toGroupIds = getGroupIdsForNodeId(edge.toId)
  const keepGroupIds = new Set([...fromGroupIds, ...toGroupIds])

  clearOperationsOfType('hide')
  for (const g of groupsStore.allComponentGroups) {
    if (!keepGroupIds.has(g.id)) {
      addOperation('hide', g.id)
    }
  }
  closeContextMenu()
}

function hideRelationshipGroups(edge: any) {
  if (!edge) return
  const fromGroupIds = getGroupIdsForNodeId(edge.fromId)
  const toGroupIds = getGroupIdsForNodeId(edge.toId)
  for (const id of fromGroupIds) addOperation('hide', id)
  for (const id of toGroupIds) addOperation('hide', id)
  closeContextMenu()
}

function inspectRelationship(edge: any) {
  if (!edge) return
  selectedNodes.value = []
  selectedEdges.value = [edge]
  isSidebarOpen.value = true
  activeTab.value = 'inspector'
  closeContextMenu()
}

function resetAllFilters() {
  operations.value = []
  clearSelection()
  closeContextMenu()
}

function expandAllGroups() {
  for (const g of groupsStore.allComponentGroups) {
    addOperation('expand', g.id)
  }
  closeContextMenu()
}

function collapseAllGroups() {
  clearOperationsOfType('expand')
  closeContextMenu()
}

function onCanvasContextMenu(event: MouseEvent) {
  event.preventDefault()
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    type: 'canvas',
    node: null,
    edge: null
  }
}

function expandGroup(groupId: string) {
  addOperation('expand', groupId)
  contextMenu.value.visible = false
}

function collapseGroup(groupId: string) {
  removeOperation('expand', groupId)
  contextMenu.value.visible = false
}

const isCouplingModalOpen = ref(false)
const modalFromComponent = ref("")
const modalToComponent = ref("")

function openCouplingModal(from: string, to: string) {
  console.log("openCouplingModal triggered with:", from, "->", to)
  modalFromComponent.value = from
  modalToComponent.value = to
  isCouplingModalOpen.value = true
}

function collapseComponentBack(node: any) {
  if (node.parentGroupId) {
    removeOperation('expand', node.parentGroupId)
  }
  contextMenu.value.visible = false
}

function getParentExpandedGroups(node: any): SavedGroup[] {
  if (!node || node.type !== 'component') return []
  return groupsStore.allComponentGroups.filter(
    (g: SavedGroup) => g.members.includes(node.id) && expandedGroupIds.value.has(g.id) && !hiddenGroups.value.has(g.id)
  )
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface GroupNode extends d3.SimulationNodeDatum {
  id: string
  type: 'group' | 'component'
  label: string
  color: string
  value: number
  group?: SavedGroup
  componentName?: string
  parentGroupId?: string
  parentGroupName?: string
}

interface GroupEdge extends d3.SimulationLinkDatum<GroupNode> {
  data: GroupEdgeData
}

interface GroupEdgeData {
  fromId: string
  toId: string
  fromLabel: string
  toLabel: string
  fromType: 'group' | 'component'
  toType: 'group' | 'component'
  fromColor: string
  toColor: string
  count: number
  details: { from: string; to: string; count: number }[]
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
  toggleOperation('hide', groupId)
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

function getComponentMetricValue(compName: string, metric: string): number {
  const comp = dataStore.allComponentsIndex.get(compName)
  if (!comp) return 0
  let val = comp[metric]
  if (val === undefined) {
    const resolvedKey = dataStore.statName ? dataStore.statName(metric) : metric
    val = comp[resolvedKey]
  }
  return Number(val) || 0
}

function getComponentValue(compName: string): number {
  if (!nodeMetric.value) return 1
  return getComponentMetricValue(compName, nodeMetric.value)
}

function checkMutualDependencyBetweenNodes(sourceId: string, targetId: string, activeNodesMap: Map<string, any>): boolean {
  if (couplingType.value === 'git') return false

  const sourceNode = activeNodesMap.get(sourceId)
  const targetNode = activeNodesMap.get(targetId)
  if (!sourceNode || !targetNode) return false
  
  const sourceComps = sourceNode.type === 'group' ? new Set(sourceNode.group.members) : new Set([sourceId])
  const targetComps = targetNode.type === 'group' ? new Set(targetNode.group.members) : new Set([targetId])
  
  let sToT = false
  let tToS = false
  
  for (const c of dataStore.componentConnections) {
    if (sourceComps.has(c.from) && targetComps.has(c.to)) {
      sToT = true
    }
    if (targetComps.has(c.from) && sourceComps.has(c.to)) {
      tToS = true
    }
    if (sToT && tToS) return true
  }
  return false
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

function getEdgeDirections(edge: any) {
  if (!edge) return null

  const activeNodes = graphNodes.value
  const activeNodesMap = new Map(activeNodes.map(n => [n.id, n]))

  const getCompsForNode = (nodeId: string) => {
    const node = activeNodesMap.get(nodeId)
    if (!node) return new Set<string>()
    if (node.type === 'group' && node.group) {
      return new Set(node.group.members)
    }
    return new Set([nodeId])
  }

  const compsA = getCompsForNode(edge.fromId)
  const compsB = getCompsForNode(edge.toId)

  const details = edge.details || []
  const dir1Connections = details.filter((d: any) => compsA.has(d.from) && compsB.has(d.to))
  const dir2Connections = details.filter((d: any) => compsB.has(d.from) && compsA.has(d.to))

  const totalRef1 = dir1Connections.reduce((sum: number, d: any) => sum + d.count, 0)
  const totalRef2 = dir2Connections.reduce((sum: number, d: any) => sum + d.count, 0)

  return {
    dir1: dir1Connections.length > 0 ? {
      fromId: edge.fromId,
      toId: edge.toId,
      fromLabel: edge.fromLabel,
      toLabel: edge.toLabel,
      fromColor: edge.fromColor,
      toColor: edge.toColor,
      connections: dir1Connections,
      totalRef: totalRef1
    } : null,
    dir2: dir2Connections.length > 0 ? {
      fromId: edge.toId,
      toId: edge.fromId,
      fromLabel: edge.toLabel,
      toLabel: edge.fromLabel,
      fromColor: edge.toColor,
      toColor: edge.fromColor,
      connections: dir2Connections,
      totalRef: totalRef2
    } : null
  }
}

const selectedEdgeDirections = computed(() => {
  return getEdgeDirections(singleSelectedEdge.value)
})

// ═══════════════════════════════════════════════════════
// COMPUTED: GRAPH DATA
// ═══════════════════════════════════════════════════════

const graphNodes = computed<GroupNode[]>(() => {
  const result: GroupNode[] = []
  const expandedComponents = new Set<string>()
  const matched = new Set(matchedGroups.value.map(g => g.id))

  for (const g of groupsStore.allComponentGroups) {
    if (!hiddenGroups.value.has(g.id) && matched.has(g.id) && expandedGroupIds.value.has(g.id)) {
      for (const m of g.members) {
        expandedComponents.add(m)
      }
    }
  }

  for (const g of groupsStore.allComponentGroups) {
    if (hiddenGroups.value.has(g.id) || !matched.has(g.id)) continue
    
    if (expandedGroupIds.value.has(g.id)) {
      for (const m of g.members) {
        const nodeId = m
        if (result.some(n => n.id === nodeId)) continue
        
        result.push({
          id: nodeId,
          type: 'component',
          label: dataStore.getComponentName(nodeId),
          color: g.color,
          value: getComponentValue(nodeId),
          componentName: nodeId,
          parentGroupId: g.id,
          parentGroupName: g.name
        })
      }
    } else {
      result.push({
        id: g.id,
        type: 'group',
        label: g.name,
        color: g.color,
        value: getGroupMetricValue(g, nodeMetric.value, nodeAggregation.value),
        group: g
      })
    }
  }
  
  return result
})

const graphEdges = computed<GroupEdge[]>(() => {
  const activeNodes = graphNodes.value
  if (activeNodes.length === 0) return []

  const activeNodesMap = new Map(activeNodes.map(n => [n.id, n]))
  const groupIndex = groupsStore.componentGroupIndex

  const resolveNodesForComp = (compName: string): string[] => {
    if (activeNodesMap.has(compName)) {
      return [compName]
    }
    const groups = groupIndex.get(compName) || []
    return groups
      .filter(g => activeNodesMap.has(g.id))
      .map(g => g.id)
  }

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

  const edgeMap = new Map<string, GroupEdgeData>()

  for (const conn of connections) {
    const sources = resolveNodesForComp(conn.from)
    const targets = resolveNodesForComp(conn.to)

    for (const s of sources) {
      for (const t of targets) {
        if (s === t) continue

        const isDirect = couplingType.value === 'direct'
        const isDirectional = isDirect && directionalLinks.value

        const key = isDirectional 
          ? `${s}→${t}` 
          : (s < t ? `${s}::${t}` : `${t}::${s}`)

        let edge = edgeMap.get(key)
        if (!edge) {
          const sourceNode = activeNodesMap.get(s)!
          const targetNode = activeNodesMap.get(t)!
          edge = { 
            fromId: s, 
            toId: t,
            fromLabel: sourceNode.label,
            toLabel: targetNode.label,
            fromType: sourceNode.type,
            toType: targetNode.type,
            fromColor: sourceNode.color,
            toColor: targetNode.color,
            count: 0, 
            details: [], 
            hasCycles: false 
          }
          edgeMap.set(key, edge)
        }
        edge.count += conn.count
        edge.details.push({ from: conn.from, to: conn.to, count: conn.count })
      }
    }
  }

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
    edge.hasCycles = checkMutualDependencyBetweenNodes(edge.fromId, edge.toId, activeNodesMap)
  }

  return Array.from(edgeMap.values()).map((data) => ({
    source: data.fromId,
    target: data.toId,
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
  console.log("renderGraph called");
  console.trace();
  if (!svgRef.value) return

  // Cleanup previous
  if (simulation) {
    simulation.stop()
    simulation = null
  }

  const nodes = graphNodes.value
  const edges = graphEdges.value

  // Verify and cleanup selections if they are filtered out
  const newSelectedNodes = selectedNodes.value.filter(sn => nodes.some(n => n.id === sn.id))
  if (newSelectedNodes.length !== selectedNodes.value.length) {
    selectedNodes.value = newSelectedNodes
  }

  const newSelectedEdges = selectedEdges.value.filter(se => edges.some(e => e.data.fromId === se.fromId && e.data.toId === se.toId))
  if (newSelectedEdges.length !== selectedEdges.value.length) {
    selectedEdges.value = newSelectedEdges
  }

  const svg = d3.select(svgRef.value)
  svg.selectAll("*").remove()

  svg.on("click", (event) => {
    if (event.target === svgRef.value) {
      clearSelection()
    }
  })

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
  strokeScale = d3
    .scaleLinear()
    .domain([Math.min(...edgeCounts, 1), Math.max(...edgeCounts, 1)])
    .range([1.5, 9])

  // Setup Arrow Markers Defs
  const defs = svg.append("defs")
  
  // Normal arrow marker
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

  // Dynamic linear gradients for components in multiple expanded groups
  const gradientNodes = nodes.filter(n => n.type === 'component')
  gradientNodes.forEach(node => {
    const groups = groupsStore.allComponentGroups.filter(
      g => g.members.includes(node.id) && expandedGroupIds.value.has(g.id) && !hiddenGroups.value.has(g.id)
    )
    
    if (groups.length > 1) {
      const gradId = `gc-grad-${node.id.replace(/[^a-zA-Z0-9]/g, "-")}`
      const grad = defs.append("linearGradient")
        .attr("id", gradId)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "100%")
        
      const step = 100 / groups.length
      groups.forEach((g, idx) => {
        grad.append("stop")
          .attr("offset", `${idx * step}%`)
          .attr("stop-color", g.color)
        grad.append("stop")
          .attr("offset", `${(idx + 1) * step}%`)
          .attr("stop-color", g.color)
      })
    }
  })

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

  // Pre-calculate active expanded groups for each component to optimize tick calculations
  const componentActiveGroups = new Map<string, SavedGroup[]>()
  for (const node of simNodes) {
    if (node.type === 'component') {
      const groups = groupsStore.allComponentGroups.filter(
        g => g.members.includes(node.id) && expandedGroupIds.value.has(g.id) && !hiddenGroups.value.has(g.id)
      )
      componentActiveGroups.set(node.id, groups)
    }
  }

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
      d3.forceCollide<GroupNode>().radius((d) => radiusScale(d.value) + 20)
    )
    .force("x", d3.forceX(width / 2).strength(0.06))
    .force("y", d3.forceY(height / 2).strength(0.06))
    .force("cluster", (alpha) => {
      // Calculate centroids for each active group
      const centroids = new Map<string, { x: number; y: number; count: number }>()
      
      for (const node of simNodes) {
        if (node.type === 'group') {
          centroids.set(node.id, { x: node.x || 0, y: node.y || 0, count: 1 })
        } else {
          const groups = componentActiveGroups.get(node.id) || []
          for (const g of groups) {
            const existing = centroids.get(g.id) || { x: 0, y: 0, count: 0 }
            existing.x += node.x || 0
            existing.y += node.y || 0
            existing.count++
            centroids.set(g.id, existing)
          }
        }
      }
      
      // Pull nodes towards the average centroid of the groups they belong to
      const strength = 0.12 // Balanced strength to cluster components but keep links readable
      for (const node of simNodes) {
        if (node.type === 'group') continue
        
        const groups = componentActiveGroups.get(node.id) || []
        
        let targetX = 0
        let targetY = 0
        let groupCount = 0
        
        for (const g of groups) {
          const cent = centroids.get(g.id)
          if (cent && cent.count > 0) {
            targetX += cent.x / cent.count
            targetY += cent.y / cent.count
            groupCount++
          }
        }
        
        if (groupCount > 0) {
          const tx = targetX / groupCount
          const ty = targetY / groupCount
          
          node.vx! += (tx - node.x!) * alpha * strength
          node.vy! += (ty - node.y!) * alpha * strength
        }
      }
    })

  // Draw edges
  const linkGroup = g
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(simEdges)
    .join("line")
    .attr("stroke", (d) => {
      const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
      if (isSelected) return "#0284c7"
      return d.data.hasCycles ? "#ea580c" : "#cbd5e1"
    })
    .attr("stroke-width", (d) => {
      const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
      return strokeScale(d.data.count) + (isSelected ? 3 : 0)
    })
    .attr("class", (d) => {
      const classes = []
      if (d.data.hasCycles) {
        classes.push("link-cycle animate-marching-ants")
      } else {
        classes.push("link-normal")
      }
      if (!isCrossGroupEdge(d.data)) {
        classes.push("link-intra-group")
      }
      return classes.join(" ")
    })
    .attr("marker-end", (d) => {
      if (couplingType.value === 'direct' && directionalLinks.value) {
        return d.data.hasCycles ? "url(#arrow-cycle)" : "url(#arrow)"
      }
      return null
    })
    .attr("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation()
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const idx = selectedEdges.value.findIndex(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
        if (idx >= 0) {
          selectedEdges.value.splice(idx, 1)
        } else {
          selectedEdges.value.push(d.data)
        }
      } else {
        selectedNodes.value = []
        selectedEdges.value = [d.data]
      }
      isSidebarOpen.value = true
      activeTab.value = 'inspector'
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault()
      event.stopPropagation()
      const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
      if (!isSelected) {
        selectedNodes.value = []
        selectedEdges.value = [d.data]
      }
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        type: 'edge',
        node: null,
        edge: d.data
      }
    })
    .on("mouseenter", function (_, d) {
      const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
      if (isSelected) return
      if (d.data.hasCycles) {
        d3.select(this).attr("stroke", "#dc2626")
      } else {
        d3.select(this).attr("stroke", "#94a3b8")
      }
    })
    .on("mouseleave", function (_, d) {
      const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
      if (isSelected) return
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
    .attr("class", (d) => {
      const isCyclic = cyclicNodeIds.value.has(d.id)
      const isCross = crossGroupNodeIds.value.has(d.id)
      const dimForCycles = focusCycles.value && !isCyclic
      const dimForCross = focusCrossGroup.value && !isCross
      return (dimForCycles || dimForCross) ? 'node-dimmed' : ''
    })
    .on("click", (event, d) => {
      event.stopPropagation()
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const idx = selectedNodes.value.findIndex(sn => sn.id === d.id)
        if (idx >= 0) {
          selectedNodes.value.splice(idx, 1)
        } else {
          selectedNodes.value.push(d)
        }
      } else {
        selectedEdges.value = []
        selectedNodes.value = [d]
      }
      isSidebarOpen.value = true
      activeTab.value = 'inspector'
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault()
      event.stopPropagation()
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      if (!isSelected) {
        selectedEdges.value = []
        selectedNodes.value = [d]
      }
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        type: 'node',
        node: d,
        edge: null
      }
    })
    .on("mouseenter", function (event, d) {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      d3.select(this).select("circle").attr("stroke", isSelected ? "#0284c7" : "rgba(51, 65, 85, 0.5)")
    })
    .on("mouseleave", function (event, d) {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      d3.select(this).select("circle")
        .attr("stroke", isSelected ? "#0284c7" : (d.type === 'component' ? "#475569" : "rgba(255,255,255,0.2)"))
        .attr("stroke-width", isSelected ? 3 : (d.type === 'component' ? 2 : 1.5))
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
    .attr("fill", (d) => {
      if (d.type === 'component') {
        const groups = groupsStore.allComponentGroups.filter(
          g => g.members.includes(d.id) && expandedGroupIds.value.has(g.id) && !hiddenGroups.value.has(g.id)
        )
        if (groups.length > 1) {
          return `url(#gc-grad-${d.id.replace(/[^a-zA-Z0-9]/g, "-")})`
        }
        return d.color
      }
      return d.color
    })
    .attr("stroke", (d) => {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      if (isSelected) return "#0284c7"
      return d.type === 'component' ? "#475569" : "rgba(255,255,255,0.2)"
    })
    .attr("stroke-width", (d) => {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      if (isSelected) return 3
      return d.type === 'component' ? 2 : 1.5
    })
    .attr("stroke-dasharray", (d) => d.type === 'component' ? "3,3" : null)
    .attr("class", "transition-all")

  // Node Labels below Circle
  if (showNames.value) {
    nodeGroup
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radiusScale(d.value) + 13)
      .attr("fill", "rgb(51, 65, 85)")
      .attr("font-size", "9px")
      .attr("font-weight", "800")
      .attr("font-family", "ui-monospace, monospace")
      .attr("pointer-events", "none")
  }

  // Node inside value
  nodeGroup
    .append("text")
    .text((d) => {
      if (nodeMetric.value) {
        return formatMetricValue(d.value)
      }
      return d.type === 'group' ? d.group.members.length.toString() : '1'
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

function updateSelectionVisuals() {
  if (!svgRef.value) return
  const svg = d3.select(svgRef.value)

  // Update node circles stroke and stroke-width
  svg.selectAll(".nodes g circle")
    .attr("stroke", (d: any) => {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      if (isSelected) return "#0284c7"
      return d.type === 'component' ? "#475569" : "rgba(255,255,255,0.2)"
    })
    .attr("stroke-width", (d: any) => {
      const isSelected = selectedNodes.value.some(sn => sn.id === d.id)
      if (isSelected) return 3
      return d.type === 'component' ? 2 : 1.5
    })

  // Update link lines stroke and stroke-width
  if (strokeScale) {
    svg.selectAll(".links line")
      .attr("stroke", (d: any) => {
        const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
        if (isSelected) return "#0284c7"
        return d.data.hasCycles ? "#ea580c" : "#cbd5e1"
      })
      .attr("stroke-width", (d: any) => {
        const isSelected = selectedEdges.value.some(se => se.fromId === d.data.fromId && se.toId === d.data.toId)
        return strokeScale!(d.data.count) + (isSelected ? 3 : 0)
      })
  }
}

// ═══════════════════════════════════════════════════════
// LIFECYCLE / WATCHERS
// ═══════════════════════════════════════════════════════

onMounted(() => {
  nextTick(() => renderGraph())
  window.addEventListener('click', closeContextMenu)
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
    hiddenGroups.value.size,
    expandedGroupIds.value.size,
    focusCycles.value,
    focusCrossGroup.value,
    groupSearchQuery.value
  ],
  (newVal, oldVal) => {
    console.log("config watch triggered");
    if (oldVal) {
      newVal.forEach((val, i) => {
        if (val !== oldVal[i]) {
          console.log(`  Index ${i} changed:`, oldVal[i], "=>", val);
        }
      });
    }
    nextTick(() => renderGraph())
  },
  { deep: true }
)

watch(
  () => [selectedNodes.value, selectedEdges.value],
  () => {
    console.log("selection watch triggered");
    updateSelectionVisuals()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (simulation) {
    simulation.stop()
    simulation = null
  }
  window.removeEventListener('click', closeContextMenu)
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

/* Dim non-cyclic edges and nodes in Focus Cycles mode */
:deep(.focus-cycles-active .links line.link-normal) {
  opacity: 0.05 !important;
  pointer-events: none;
}

:deep(.focus-cycles-active .nodes g.node-dimmed) {
  opacity: 0.15 !important;
  pointer-events: none;
}

/* Dim intra-group connections in Focus Cross-Group mode */
:deep(.focus-cross-group-active .links line.link-intra-group) {
  opacity: 0.05 !important;
  pointer-events: none;
}

/* Dim nodes not participating in cross-group relationships */
:deep(.focus-cross-group-active .nodes g.node-dimmed) {
  opacity: 0.15 !important;
  pointer-events: none;
}
</style>
