<template>
  <ViewWorkspaceLayout
    title="Component Clusters"
    badge-text="Force-Directed"
    badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
    :nodes-count="graphNodes.length"
    :connections-count="communities.length"
    :stats-labels="{ nodes: 'Nodes', connections: 'Communities' }"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="sidebarExpanded"
    v-model:active-tab="activeSidebarTab"
    :tabs="[
      { id: 'inspector', label: multiSelectionStats ? `Selection (${multiSelectionStats.count})` : 'Node details' },
      { id: 'legend', label: '📊 Legend' },
      { id: 'guide', label: '💡 Guide' }
    ]"
    :show-config="true"
    sidebar-width="320px"
  >
    <template #stats>
      <span class="bg-white border border-slate-200/50 px-2 py-0.5 rounded-md text-slate-700">Modularity: {{ modularity.toFixed(3) }}</span>
    </template>

    <template #actions>
      <!-- Coupling Source Selection -->
      <div class="flex items-center bg-slate-200/50 p-0.5 rounded-lg border border-slate-200/20 text-[9px] font-extrabold">
        <button
          v-for="mode in availableModes"
          :key="mode.id"
          @click="couplingMode = mode.id; recomputeClusters()"
          class="px-2.5 py-1 rounded-md capitalize tracking-wide transition-all cursor-pointer"
          :class="couplingMode === mode.id
            ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/20'
            : 'text-slate-500 hover:text-slate-800'"
        >
          {{ mode.label }}
        </button>
      </div>
    </template>

    <template #config-popover>
      <!-- Clustering Algorithm Settings -->
      <div class="flex flex-col gap-2.5">
        <span class="text-[8px] font-extrabold text-violet-600 uppercase tracking-widest">Clustering Algorithm</span>
        <div class="grid grid-cols-2 gap-2.5">
          <div class="flex flex-col gap-1">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Method</span>
            <select
              v-model="algorithmType"
              class="w-full text-[9px] font-bold text-slate-700 px-2 py-1.5 rounded-md bg-white border border-slate-200/60 focus:outline-none cursor-pointer"
            >
              <option value="louvain">Louvain</option>
              <option value="label-propagation">Label Prop</option>
              <option value="connected-components">Connected</option>
              <option value="none">No Cluster</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <div class="flex justify-between">
              <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Cluster Pull</span>
              <span class="text-[8px] font-mono text-slate-500 font-extrabold">{{ (communityForceStrength * 100).toFixed(0) }}%</span>
            </div>
            <input
              v-model.number="communityForceStrength"
              type="range"
              min="0" max="0.15" step="0.01"
              class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600 mt-2.5"
            />
          </div>
        </div>

        <!-- Louvain resolution slider -->
        <div v-if="algorithmType === 'louvain'" class="flex flex-col gap-1">
          <div class="flex justify-between font-mono text-[8px] text-slate-400">
            <span>Resolution</span>
            <strong>{{ louvainResolution.toFixed(1) }}</strong>
          </div>
          <input
            v-model.number="louvainResolution"
            type="range"
            min="0.1" max="3.0" step="0.1"
            class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
          />
        </div>

        <!-- LPA Iterations slider -->
        <div v-if="algorithmType === 'label-propagation'" class="flex flex-col gap-1">
          <div class="flex justify-between font-mono text-[8px] text-slate-400">
            <span>Max Iterations</span>
            <strong>{{ lpaMaxIterations }}</strong>
          </div>
          <input
            v-model.number="lpaMaxIterations"
            type="range"
            min="5" max="50" step="5"
            class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
          />
        </div>
      </div>

      <div class="h-px bg-slate-100"></div>

      <!-- Coupling Filters Settings -->
      <div class="flex flex-col gap-2.5">
        <span class="text-[8px] font-extrabold text-slate-700 uppercase tracking-widest">Coupling Filters</span>

        <!-- Static Coupling Weight Slider -->
        <div
          class="flex flex-col gap-1 transition-all duration-200"
          :class="{ 'opacity-30 pointer-events-none select-none': couplingMode === 'git' }"
        >
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-bold text-slate-500">Min Dependency References</span>
            <span class="text-[9px] font-extrabold text-slate-800 font-mono">{{ staticMinWeight }}</span>
          </div>
          <input
            v-model.number="staticMinWeight"
            type="range"
            min="1" max="25" step="1"
            class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
            :disabled="couplingMode === 'git'"
          />
        </div>

        <!-- Git Co-change Rate Slider -->
        <div
          class="flex flex-col gap-1 transition-all duration-200"
          :class="{ 'opacity-30 pointer-events-none select-none': couplingMode === 'static' || !hasGitCoupling }"
        >
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-bold text-slate-500">Co-change Rate Threshold</span>
            <span class="text-[9px] font-extrabold text-slate-800 font-mono">{{ gitThreshold }}%</span>
          </div>
          <input
            v-model.number="gitThreshold"
            type="range"
            min="5" max="100" step="5"
            class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
            :disabled="couplingMode === 'static' || !hasGitCoupling"
          />
        </div>

        <!-- Git Min Shared Commits Slider -->
        <div
          class="flex flex-col gap-1 transition-all duration-200"
          :class="{ 'opacity-30 pointer-events-none select-none': couplingMode === 'static' || !hasGitCoupling }"
        >
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-bold text-slate-500">Min Shared Commits</span>
            <span class="text-[9px] font-extrabold text-slate-800 font-mono">{{ minSharedCommits }}</span>
          </div>
          <input
            v-model.number="minSharedCommits"
            type="range"
            min="1" max="20" step="1"
            class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
            :disabled="couplingMode === 'static' || !hasGitCoupling"
          />
        </div>
      </div>

      <div class="h-px bg-slate-100"></div>

      <!-- Node Label Settings -->
      <div class="flex flex-col gap-2">
        <span class="text-[8px] font-extrabold text-slate-700 uppercase tracking-widest">Node Labels</span>
        <div class="flex flex-col gap-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Display Mode</span>
          <div class="grid grid-cols-3 gap-1.5 mt-0.5">
            <button
              v-for="opt in [
                { id: 'hover', label: 'Interactive' },
                { id: 'smart', label: 'Dynamic' },
                { id: 'all', label: 'Show All' }
              ]"
              :key="opt.id"
              @click="labelDisplayMode = opt.id"
              class="py-1 rounded-md text-[8px] font-extrabold uppercase transition-all border cursor-pointer text-center"
              :class="labelDisplayMode === opt.id
                ? 'bg-slate-800 border-slate-800 text-white shadow-3xs'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-655'"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Popover Actions Footer -->
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
        <button
          @click="runClustering()"
          class="flex-1 py-1.5 bg-violet-600 hover:bg-violet-750 text-white rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer shadow-sm text-center"
        >
          Apply Settings
        </button>
        <button
          v-if="hasCustomOverrides"
          @click="resetCustomClusters()"
          class="py-1.5 px-2.5 border border-red-200 hover:bg-red-50 text-red-500 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          Reset Custom
        </button>
      </div>
    </template>

    <template #visualizer>
      <div ref="canvasContainer" class="w-full h-full rounded-3xl overflow-hidden bg-slate-25 relative min-h-0">
        <canvas ref="canvasEl" class="w-full h-full block"></canvas>

        <!-- Tooltip -->
        <div
          ref="tooltipEl"
          class="absolute pointer-events-none bg-slate-900/92 text-slate-100 px-2.5 py-1.5 rounded-lg text-[10px] leading-snug z-20 max-w-[280px] shadow-lg backdrop-blur-sm transition-opacity duration-100"
          :style="{ opacity: tooltipVisible ? 1 : 0, left: tooltipX + 'px', top: tooltipY + 'px' }"
        >
          <div class="font-bold">{{ tooltipTitle }}</div>
          <div class="text-slate-400 text-[9px]">{{ tooltipSubtitle }}</div>
        </div>

        <!-- Context Menu -->
        <div
          v-if="contextMenu.visible"
          ref="contextMenuEl"
          class="absolute z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[200px] text-[10px] select-none"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        >
          <!-- Header info -->
          <div class="px-2 py-1 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
            {{ selectedNodes.size > 1 ? `${selectedNodes.size} nodes selected` : (contextMenu.nodeId ? store.getComponentName(contextMenu.nodeId) : '') }}
          </div>
          <div class="border-t border-slate-100 mt-1 mb-1"></div>

          <!-- Move to Community (with submenu) -->
          <div class="relative group/move">
            <div class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium">
              <span>Move to Community</span>
              <span class="text-[8px] text-slate-400">▸</span>
            </div>
            <div class="hidden group-hover/move:flex flex-col absolute left-full top-0 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[180px] ml-1 max-h-[250px] overflow-y-auto scroll-container">
              <div
                v-for="comm in communities"
                :key="'ctx-move-' + comm.id"
                class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700"
                @click="contextMoveToComm(comm.id)"
              >
                <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: communityColor(comm.id) }"></div>
                <span class="font-medium">{{ communityName(comm.id) }}</span>
                <span class="text-slate-400 ml-auto text-[9px]">{{ comm.members.length }}</span>
              </div>
            </div>
          </div>

          <!-- Create New Cluster -->
          <div
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium"
            @click="contextCreateNewCluster()"
          >
            <span>✦</span>
            <span>Create New Cluster</span>
          </div>

          <!-- Create Group from Selection -->
          <div
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium"
            @click="contextCreateGroupFromSelection()"
          >
            <span>💼</span>
            <span>Create Group from Selection</span>
          </div>

          <div class="border-t border-slate-100 my-1"></div>

          <!-- Pin / Unpin -->
          <div
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium"
            @click="contextTogglePin()"
          >
            <span>📌</span>
            <span>{{ contextPinLabel }}</span>
          </div>

          <!-- Select All in Community (single node only) -->
          <div
            v-if="selectedNodes.size <= 1 && contextMenu.nodeId"
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium"
            @click="contextSelectAllInCommunity()"
          >
            <span>◎</span>
            <span>Select All in Community</span>
          </div>

          <!-- Hide from Graph -->
          <div
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium"
            @click="contextHideNodes()"
          >
            <span>👁</span>
            <span>{{ selectedNodes.size > 1 ? 'Hide Selection' : 'Hide from Graph' }}</span>
          </div>

          <div class="border-t border-slate-100 my-1"></div>

          <!-- Merge Community Into (submenu) -->
          <div v-if="selectedNodes.size <= 1 && contextMenu.nodeId" class="relative group/merge">
            <div class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700 font-medium">
              <span>Merge Community Into</span>
              <span class="text-[8px] text-slate-400">▸</span>
            </div>
            <div class="hidden group-hover/merge:flex flex-col absolute left-full top-0 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[180px] ml-1 max-h-[250px] overflow-y-auto scroll-container">
              <div
                v-for="comm in communitiesExcludingContextNode"
                :key="'ctx-merge-' + comm.id"
                class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-lg mx-1 text-slate-700"
                @click="contextMergeCommunityInto(comm.id)"
              >
                <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: communityColor(comm.id) }"></div>
                <span class="font-medium">{{ communityName(comm.id) }}</span>
                <span class="text-slate-400 ml-auto text-[9px]">{{ comm.members.length }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #visualizer-overlays>
      <!-- Floating Zoom Controls -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-1.5 z-20">
        <button @click="zoomIn" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-xs font-bold cursor-pointer transition-all">+</button>
        <button @click="zoomOut" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-xs font-bold cursor-pointer transition-all">−</button>
        <button @click="resetZoom" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-[9px] font-bold cursor-pointer transition-all">⟲</button>
      </div>

      <!-- Canvas Help Badge -->
      <div class="absolute top-4 left-4 bg-white/92 border border-slate-200/60 shadow-3xs rounded-2xl px-3 py-2.5 text-[9px] text-slate-500 z-20 backdrop-blur-sm pointer-events-none select-none flex flex-col gap-1.5 font-medium leading-none">
        <div class="flex items-center gap-1.5 font-extrabold text-slate-700 uppercase tracking-wider text-[8px] mb-0.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Interactive Canvas
        </div>
        <div class="flex items-center gap-1.5">• <span>Drag nodes to reposition/recluster</span></div>
        <div class="flex items-center gap-1.5">• <span>Shift + Drag to draw selection box</span></div>
        <div class="flex items-center gap-1.5">• <span>Ctrl/Cmd + Click to toggle nodes</span></div>
      </div>

      <!-- Floating Multi-Selection Action Bar -->
      <div
        v-if="editMode && selectedNodes.size > 0"
        ref="actionBarMoveContainerEl"
        class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700/60 rounded-2xl px-4 py-2.5 shadow-xl backdrop-blur-md flex items-center gap-3 text-white z-20 transition-all select-none"
      >
        <!-- Selection info -->
        <div class="flex flex-col pr-3 border-r border-slate-700/60 leading-tight">
          <span class="text-[9px] font-bold text-sky-400 uppercase tracking-wider">Selection</span>
          <span class="text-[11px] font-extrabold whitespace-nowrap">{{ selectedNodes.size }} nodes selected</span>
        </div>

        <!-- Action: Move to Community dropdown -->
        <div class="relative flex items-center">
          <button
            @click="showActionBarMoveDropdown = !showActionBarMoveDropdown"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>📁</span>
            <span>Move to...</span>
            <span class="text-[8px] text-slate-400">{{ showActionBarMoveDropdown ? '▼' : '▲' }}</span>
          </button>

          <!-- Dropdown Menu (opens upward) -->
          <div
            v-if="showActionBarMoveDropdown"
            class="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[160px] max-h-[200px] overflow-y-auto scroll-container flex flex-col gap-0.5 z-30"
          >
            <div
              v-for="comm in communities"
              :key="'bar-move-' + comm.id"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 cursor-pointer text-slate-200 rounded-lg mx-1"
              @click="actionBarMoveToComm(comm.id)"
            >
              <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: communityColor(comm.id) }"></div>
              <span class="text-[10px] font-bold whitespace-nowrap">{{ communityName(comm.id) }}</span>
              <span class="text-slate-400 ml-auto text-[9px] font-medium">{{ comm.members.length }}</span>
            </div>
          </div>
        </div>

        <!-- Action: Create New Cluster -->
        <button
          @click="actionBarCreateNewCluster()"
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>✦</span>
          <span>New Cluster</span>
        </button>

        <!-- Action: Create Group from Selection -->
        <button
          @click="actionBarCreateGroupFromSelection()"
          class="px-3 py-1.5 bg-violet-650 hover:bg-violet-550 border border-violet-750 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>💼</span>
          <span>Create Group</span>
        </button>

        <!-- Action: Pin/Unpin All -->
        <button
          @click="actionBarTogglePin()"
          class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>📌</span>
          <span>{{ isSelectionAllPinned ? 'Unpin All' : 'Pin All' }}</span>
        </button>

        <!-- Action: Hide Selected -->
        <button
          @click="actionBarHideNodes()"
          class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-200 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>👁</span>
          <span>Hide</span>
        </button>

        <div class="h-5 w-px bg-slate-700/60 my-0.5"></div>

        <!-- Action: Clear Selection -->
        <button
          @click="actionBarClearSelection()"
          class="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap"
        >
          ✕ Clear
        </button>
      </div>

      <!-- Hidden nodes indicator -->
      <div v-if="hiddenNodes.size > 0" class="absolute top-4 right-4 flex items-center gap-2 z-20">
        <button
          @click="unhideAllNodes()"
          class="bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider shadow-sm cursor-pointer hover:bg-white transition-all"
        >
          Show {{ hiddenNodes.size }} hidden · ✕
        </button>
      </div>
    </template>

    <template #tab-inspector>
      <!-- MULTI-SELECTION VIEW -->
      <div v-if="multiSelectionStats" class="flex flex-col gap-4">
        <!-- Header -->
        <div class="flex flex-col gap-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Selection</span>
          <span class="text-xs font-bold text-slate-800">{{ multiSelectionStats.count }} components selected</span>
        </div>

        <!-- Community distribution bar -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Community Distribution</span>
          <div class="flex w-full h-2.5 rounded-full overflow-hidden border border-slate-100">
            <div
              v-for="comm in multiSelectionStats.communityBreakdown"
              :key="comm.commId"
              :style="{ width: (comm.count / multiSelectionStats.count * 100) + '%', backgroundColor: comm.color }"
              class="h-full transition-all"
            ></div>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <div v-for="comm in multiSelectionStats.communityBreakdown" :key="comm.commId" class="flex items-center gap-1">
              <div class="w-1.5 h-1.5 rounded-full" :style="{ background: comm.color }"></div>
              <span class="text-[9px] text-slate-500 font-medium">{{ communityName(comm.commId) }}: {{ comm.count }}</span>
            </div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col items-center">
            <span class="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Internal Edges</span>
            <span class="text-sm font-extrabold text-slate-800 mt-0.5">{{ multiSelectionStats.internalEdges }}</span>
            <span class="text-[8px] text-slate-400">within selection</span>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col items-center">
            <span class="text-[7px] font-bold text-slate-400 uppercase tracking-wider">External Edges</span>
            <span class="text-sm font-extrabold text-slate-800 mt-0.5">{{ multiSelectionStats.externalEdges }}</span>
            <span class="text-[8px] text-slate-400">to outside</span>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col items-center">
            <span class="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Static Deps</span>
            <span class="text-sm font-extrabold text-slate-800 mt-0.5">{{ multiSelectionStats.staticEdges }}</span>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex flex-col items-center">
            <span class="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Git Coupling</span>
            <span class="text-sm font-extrabold text-slate-800 mt-0.5">{{ multiSelectionStats.gitEdges }}</span>
          </div>
        </div>

        <!-- Avg Degree -->
        <div class="bg-violet-50/40 border border-violet-100 rounded-xl px-3 py-2 flex items-center justify-between">
          <span class="text-[8px] font-bold text-violet-500 uppercase tracking-wider">Avg Degree</span>
          <span class="text-xs font-extrabold text-violet-700">{{ multiSelectionStats.avgDegree }}</span>
        </div>

        <!-- Quick Actions -->
        <div v-if="editMode" class="bg-amber-50/30 border border-amber-200 rounded-xl p-2.5 flex flex-col gap-2">
          <div class="text-[8px] font-bold text-amber-600 uppercase tracking-wider">Bulk Actions</div>
          <select
            @change="moveSelectionToCommunity(Number(($event.target as HTMLSelectElement).value)); ($event.target as HTMLSelectElement).value = ''"
            class="w-full text-[9px] font-bold text-slate-700 px-2 py-1.5 rounded-lg bg-white border border-amber-200 focus:outline-none cursor-pointer appearance-none"
          >
            <option value="" disabled selected>Move all to cluster…</option>
            <option v-for="comm in communities" :key="comm.id" :value="comm.id">
              {{ communityName(comm.id) }} ({{ comm.members.length }} nodes)
            </option>
            <option :value="-1">✦ Create New Cluster</option>
          </select>
        </div>

        <!-- Selected nodes list -->
        <div class="flex flex-col gap-2">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Selected Nodes ({{ multiSelectionStats.count }})</span>
          <div class="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1 scroll-container">
            <div
              v-for="node in multiSelectionStats.nodeList"
              :key="node.id"
              class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer transition-all group"
              @click="selectedNode = node.id"
            >
              <div class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: communityColor(node.community) }"></div>
              <span class="text-[10px] text-slate-655 group-hover:text-slate-855 font-medium truncate flex-1">
                {{ store.getComponentName(node.id) }}
              </span>
              <span class="text-[8px] font-mono text-slate-400 shrink-0">{{ node.connections }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- SINGLE NODE VIEW -->
      <div v-else-if="selectedNodeData" class="flex flex-col gap-4">
        <!-- Node Name -->
        <div class="flex flex-col gap-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Component</span>
          <span class="text-xs font-bold text-slate-800 break-all leading-snug">{{ store.getComponentName(selectedNodeData.id) }}</span>
        </div>

        <!-- Community Badge -->
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: selectedNodeColor }"></div>
          <span class="text-[10px] font-bold text-slate-655">
            {{ communityName(selectedNodeData.community) }}
            <span class="text-slate-455">({{ communitySizeOf(selectedNodeData.community) }} members)</span>
          </span>
        </div>

        <!-- Advanced edit functions -->
        <div v-if="editMode" class="bg-amber-50/30 border border-amber-200 rounded-xl p-2.5 flex flex-col gap-2">
          <div class="text-[8px] font-bold text-amber-600 uppercase tracking-wider">Quick Actions</div>
          <select
            :value="selectedNodeData.community"
            @change="reassignNodeCommunity(selectedNodeData!.id, Number(($event.target as HTMLSelectElement).value))"
            class="w-full text-[9px] font-bold text-slate-700 px-2 py-1.5 rounded-lg bg-white border border-amber-200 focus:outline-none cursor-pointer appearance-none"
          >
            <option v-for="comm in communities" :key="comm.id" :value="comm.id">
              Move to {{ communityName(comm.id) }} ({{ comm.members.length }} nodes)
            </option>
            <option :value="-1">✦ Create New Cluster</option>
          </select>
          <button
            @click="togglePinNode(selectedNodeData!.id)"
            class="w-full text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-lg border transition-all cursor-pointer text-center"
            :class="pinnedNodes.has(selectedNodeData!.id)
              ? 'bg-sky-50 border-sky-200 text-sky-700'
              : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'"
          >
            {{ pinnedNodes.has(selectedNodeData!.id) ? '📌 Pinned position' : '📌 Pin Position' }}
          </button>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2 flex flex-col items-center">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Degree</span>
            <span class="text-xs font-extrabold text-slate-800 mt-0.5">{{ selectedNodeData.connections }}</span>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2 flex flex-col items-center">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Static</span>
            <span class="text-xs font-extrabold text-slate-800 mt-0.5">{{ selectedNodeStaticEdges }}</span>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-xl p-2 flex flex-col items-center">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Git</span>
            <span class="text-xs font-extrabold text-slate-800 mt-0.5">{{ selectedNodeGitEdges }}</span>
          </div>
        </div>

        <!-- Neighbors list -->
        <div class="flex flex-col gap-2">
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Neighbors ({{ selectedNodeNeighbors.length }})</span>
          <div class="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-1 scroll-container">
            <div
              v-for="neighbor in selectedNodeNeighbors"
              :key="neighbor.id"
              class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer transition-all group"
              @click="selectNodeById(neighbor.id)"
            >
              <div class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: communityColor(neighbor.community) }"></div>
              <span class="text-[10px] text-slate-655 group-hover:text-slate-855 font-medium truncate flex-1">
                {{ store.getComponentName(neighbor.id) }}
              </span>
              <span class="text-[8px] font-mono text-slate-400 shrink-0">{{ neighbor.weight }}</span>
              <span
                v-if="neighbor.type === 'git'"
                class="text-[7px] font-bold uppercase tracking-wider text-violet-400 bg-violet-50 px-1 py-0.5 rounded shrink-0"
              >git</span>
              <span
                v-else
                class="text-[7px] font-bold uppercase tracking-wider text-sky-400 bg-sky-50 px-1 py-0.5 rounded shrink-0"
              >dep</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm">🔍</div>
        <div>
          <div class="text-[9px] font-bold text-slate-500">No Node Selected</div>
          <div class="text-[8px] text-slate-400 max-w-[200px] leading-relaxed mt-0.5">Click a component node in the visualizer graph to inspect connections and attributes.</div>
        </div>
      </div>
    </template>

    <template #tab-legend>
      <div class="flex flex-col gap-3">
        <div class="text-[9px] text-slate-400 leading-normal pb-1">
          Select community cards to spotlight members. Colors are dynamically allocated.
        </div>
        <div class="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto pr-1 scroll-container">
          <div
            v-for="comm in communities"
            :key="comm.id"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer border transition-all group"
            :class="spotlightedCommunity === comm.id
              ? 'bg-white border-violet-200 shadow-3xs font-bold'
              : 'hover:bg-slate-100 border-transparent bg-white/20'"
            @click="onCommunityClick($event, comm)"
          >
            <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110" :style="{ background: communityColor(comm.id) }"></div>
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-[10px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                {{ communityName(comm.id) }}
              </span>
              <span class="text-[8px] text-slate-400 truncate">
                {{ comm.members.length }} component{{ comm.members.length !== 1 ? 's' : '' }}
              </span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <div class="text-[8px] font-mono text-slate-450 bg-slate-100 px-1 py-0.5 rounded border border-slate-150" title="Internal couplings within cluster">
                {{ comm.internalEdges }}↔
              </div>
              <div class="text-[8px] font-mono text-slate-450 bg-slate-100 px-1 py-0.5 rounded border border-slate-150" title="Outgoing couplings to other components">
                {{ comm.externalEdges }}→
              </div>
            </div>
          </div>
        </div>

        <!-- Overrides indicator -->
        <div v-if="editMode && hasCustomOverrides" class="mt-3 pt-3 border-t border-slate-100">
          <button
            @click="resetCustomClusters()"
            class="w-full text-[9px] font-bold uppercase tracking-wider text-red-500 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-red-100 transition-all text-center"
          >
            Reset Custom Overrides
          </button>
        </div>
      </div>
    </template>

    <template #tab-guide>
      <div class="flex flex-col gap-3">
        <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Interpretation Guide</div>
        <ul class="text-[10px] text-slate-550 space-y-3 leading-relaxed">
          <li class="flex gap-2">
            <span class="text-violet-500 shrink-0">✦</span>
            <span>
              <strong class="text-slate-700">Tightly-coupled Clusters</strong> represent components that are frequently changed together in Git history or share substantial code imports. They are strong candidates for packaging or namespace unification.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-sky-500 shrink-0">✦</span>
            <span>
              <strong class="text-slate-700">Bridge Nodes</strong> are nodes that connect separate visual clusters. These are often shared libraries, orchestration modules, or coupling hotspots that might benefit from modular encapsulation.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-slate-500 shrink-0">✦</span>
            <span>
              <strong class="text-slate-700">Modularity Coefficient</strong>:
              <ul class="list-disc pl-4 mt-1 space-y-1 text-[9px] text-slate-400">
                <li><strong class="text-slate-600">> 0.4</strong>: Very well-separated communities with modular coherence.</li>
                <li><strong class="text-slate-600">< 0.2</strong>: Highly diffuse coupling with unclear boundary partitions.</li>
              </ul>
            </span>
          </li>
        </ul>
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

<script lang="ts" setup>
import * as d3 from "d3"
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick, reactive } from "vue"
import { Component, resizeConnectionsOnComponents } from "~/utils/components"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import {
  louvainClustering,
  labelPropagationClustering,
  connectedComponentsClustering,
  noClustering,
  generateCommunityColors,
} from "~/utils/clustering"
import type { ClusterEdge, ClusteringResult, Community, ClusteringAlgorithm } from "~/utils/clustering"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const store = useDataStore()
const groupsStore = useGroupsStore()

const isCreateGroupModalOpen = ref(false)
const createGroupDefaultName = ref("")
const createGroupMembers = ref<string[]>([])

const canvasContainer = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const tooltipEl = ref<HTMLElement | null>(null)
const contextMenuEl = ref<HTMLElement | null>(null)

const props = defineProps<{
  components: Component[]
}>()

// ---------- Reactive State ----------
const couplingMode = ref<'static' | 'git' | 'both'>('static')
const staticMinWeight = ref(1)
const gitThreshold = ref(30)
const minSharedCommits = ref(5)
const searchQuery = ref("")
const selectedNode = ref<string | null>(null)
const hoveredNode = ref<string | null>(null)
const spotlightedCommunity = ref<number | null>(null)

// Algorithm settings
const showAlgorithmSettings = ref(false)
const algorithmType = ref<ClusteringAlgorithm>('louvain')
const louvainResolution = ref(1.0)
const lpaMaxIterations = ref(15)
const communityForceStrength = ref(0.03)
const labelDisplayMode = ref<'hover' | 'smart' | 'all'>('hover')

// Edit mode
const editMode = ref(true)
const editTool = ref<'pointer' | 'select'>('pointer')
const pinnedNodes = reactive(new Set<string>())
const customCommunityOverrides = reactive(new Map<string, number>())
const hiddenNodes = reactive(new Set<string>())
const showAdvancedEdit = ref(false)

// Multi-selection
const selectedNodes = reactive(new Set<string>())
const selectionRect = reactive({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 })
let justFinishedSelection = false
const showActionBarMoveDropdown = ref(false)

const isSelectionAllPinned = computed(() => {
  if (selectedNodes.size === 0) return false
  return Array.from(selectedNodes).every(id => pinnedNodes.has(id))
})

// Layout and sidebar state
const sidebarExpanded = ref(true)
const activeSidebarTab = ref<'inspector' | 'legend' | 'guide'>('legend')

// HTML Element Refs
const actionBarMoveContainerEl = ref<HTMLElement | null>(null)

// Context menu
const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeId: null as string | null })

// Dwell-to-reassign
let dwellTimer: ReturnType<typeof setTimeout> | null = null
let dwellTargetCommunity: number | null = null
let isDwelling = false
let dwellStartTime = 0

// Tooltip state
const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipTitle = ref("")
const tooltipSubtitle = ref("")

// Canvas state
let simulation: d3.Simulation<any, any> | null = null
let simNodes: any[] = []
let simLinks: any[] = []
let currentTransform = d3.zoomIdentity
let quadtree: d3.Quadtree<any> | null = null
let animFrameId: number | null = null
let isDragging = false
let dragNode: any | null = null
let dragStartedOnNode = false

// Cache computed hull polygons for hit detection during drag
let cachedHulls: { commId: number; polygon: [number, number][] }[] = []

// ---------- Data Access ----------
const hasGitCoupling = computed(() => store.hasData && store.hasView('git_component_shared_commits'))

const availableModes = computed(() => {
  const modes = [{ id: 'static' as const, label: 'Static' }]
  if (hasGitCoupling.value) {
    modes.push({ id: 'git' as const, label: 'Git' })
    modes.push({ id: 'both' as const, label: 'Combined' })
  }
  return modes
})

const gitCouplingData = computed(() => {
  if (!hasGitCoupling.value) return []
  return store.query(
    `SELECT pair_1, pair_2, shared_commits,
            percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2
     FROM git_component_shared_commits`
  ) as any[]
})

// ---------- Edge Building ----------
const graphEdges = computed<ClusterEdge[]>(() => {
  const edges: ClusterEdge[] = []
  const componentSet = new Set(props.components.map(c => c.name))
  const edgeKeys = new Set<string>()

  if (couplingMode.value === 'static' || couplingMode.value === 'both') {
    for (const comp of props.components) {
      for (const conn of comp.connections) {
        if (conn.type !== "OUTGOING") continue
        if (!componentSet.has(conn.to.name)) continue
        if (conn.count < staticMinWeight.value) continue

        const key = [conn.from.name, conn.to.name].sort().join('|||')
        if (edgeKeys.has(key)) continue
        edgeKeys.add(key)

        edges.push({ source: conn.from.name, target: conn.to.name, weight: conn.count, type: 'static' })
      }
    }
  }

  if ((couplingMode.value === 'git' || couplingMode.value === 'both') && hasGitCoupling.value) {
    for (const row of gitCouplingData.value) {
      const p1 = row.pair_1 as string
      const p2 = row.pair_2 as string
      if (!componentSet.has(p1) || !componentSet.has(p2)) continue

      const shared = Number(row.shared_commits) || 0
      if (shared < minSharedCommits.value) continue

      const pct1 = Number(row.percentage_of_all_commits_pair_1) || 0
      const pct2 = row.percentage_of_all_commits_pair_2 === "Inf" ? 100 : (Number(row.percentage_of_all_commits_pair_2) || 0)
      const maxPct = Math.max(pct1, pct2)
      if (maxPct < gitThreshold.value) continue

      const key = [p1, p2].sort().join('|||')
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)

      edges.push({ source: p1, target: p2, weight: shared, type: 'git' })
    }
  }

  return edges
})

// ---------- Graph Nodes ----------
const graphNodes = computed(() => {
  const nodeSet = new Set<string>()
  for (const e of graphEdges.value) {
    nodeSet.add(e.source)
    nodeSet.add(e.target)
  }
  for (const c of props.components) {
    nodeSet.add(c.name)
  }
  return Array.from(nodeSet)
})

// ---------- Clustering ----------
const clusteringResult = computed<ClusteringResult>(() => {
  const nodes = graphNodes.value
  const edges = graphEdges.value

  // Build seed communities from groupsStore
  const seedCommunities = new Map<string, number>()
  groupsStore.componentGroups.forEach((group, groupIndex) => {
    for (const member of group.members) {
      seedCommunities.set(member, groupIndex)
    }
  })

  let result: ClusteringResult
  switch (algorithmType.value) {
    case 'label-propagation':
      result = labelPropagationClustering(nodes, edges, lpaMaxIterations.value, seedCommunities); break
    case 'connected-components':
      result = connectedComponentsClustering(nodes, edges); break
    case 'none':
      result = noClustering(nodes); break
    case 'louvain': default:
      result = louvainClustering(nodes, edges, louvainResolution.value, seedCommunities); break
  }

  if (customCommunityOverrides.size > 0) {
    for (const node of result.nodes) {
      if (customCommunityOverrides.has(node.id)) {
        node.community = customCommunityOverrides.get(node.id)!
      }
    }
    const commMap = new Map<number, string[]>()
    for (const node of result.nodes) {
      if (!commMap.has(node.community)) commMap.set(node.community, [])
      commMap.get(node.community)!.push(node.id)
    }
    result.communities = Array.from(commMap.entries()).map(([id, members]) => ({
      id, members, internalEdges: 0, externalEdges: 0,
    }))
  }

  return result
})

const communities = computed<Community[]>(() => {
  return clusteringResult.value.communities.sort((a, b) => b.members.length - a.members.length)
})

const modularity = computed(() => clusteringResult.value.modularity)

const communityColors = computed(() => {
  let maxId = 0
  for (const c of communities.value) { if (c.id > maxId) maxId = c.id }
  return generateCommunityColors(Math.max(maxId + 1, communities.value.length, 1))
})

const communityInfoMap = computed(() => {
  const map = new Map<number, { name: string; color: string; isGroup: boolean }>()
  
  for (const comm of clusteringResult.value.communities) {
    const groupCounts = new Map<string, { count: number; group: any }>()
    let unassignedCount = 0
    
    for (const member of comm.members) {
      const groups = groupsStore.getGroupsForComponent(member)
      if (groups.length > 0) {
        for (const g of groups) {
          const val = groupCounts.get(g.id) || { count: 0, group: g }
          val.count++
          groupCounts.set(g.id, val)
        }
      } else {
        unassignedCount++
      }
    }
    
    let bestGroup: any = null
    let maxCount = 0
    for (const { count, group } of groupCounts.values()) {
      if (count > maxCount) {
        maxCount = count
        bestGroup = group
      }
    }
    
    if (bestGroup && maxCount > 0) {
      map.set(comm.id, {
        name: bestGroup.name,
        color: bestGroup.color,
        isGroup: true
      })
    } else {
      map.set(comm.id, {
        name: `Community ${comm.id + 1}`,
        color: communityColors.value[comm.id % communityColors.value.length] || '#94a3b8',
        isGroup: false
      })
    }
  }
  
  return map
})

function communityColor(communityId: number): string {
  return communityInfoMap.value.get(communityId)?.color || '#94a3b8'
}

function communityName(communityId: number): string {
  return communityInfoMap.value.get(communityId)?.name || `Community ${communityId + 1}`
}

function communitySizeOf(communityId: number): number {
  const comm = communities.value.find(c => c.id === communityId)
  return comm ? comm.members.length : 0
}

const hasCustomOverrides = computed(() => customCommunityOverrides.size > 0)

const nodeCommunityMap = computed(() => {
  const map = new Map<string, number>()
  for (const node of clusteringResult.value.nodes) { map.set(node.id, node.community) }
  return map
})

// Context menu helpers
const communitiesExcludingContextNode = computed(() => {
  if (!contextMenu.nodeId) return communities.value
  const nodeComm = nodeCommunityMap.value.get(contextMenu.nodeId)
  return communities.value.filter(c => c.id !== nodeComm)
})

const contextPinLabel = computed(() => {
  if (selectedNodes.size > 1) {
    const allPinned = Array.from(selectedNodes).every(id => pinnedNodes.has(id))
    return allPinned ? 'Unpin All' : 'Pin All'
  }
  if (contextMenu.nodeId) return pinnedNodes.has(contextMenu.nodeId) ? 'Unpin Position' : 'Pin Position'
  return 'Pin'
})

// ---------- Selected Node Data ----------
const selectedNodeData = computed(() => {
  if (!selectedNode.value) return null
  return clusteringResult.value.nodes.find(n => n.id === selectedNode.value) || null
})

const selectedNodeColor = computed(() => {
  if (!selectedNodeData.value) return '#94a3b8'
  return communityColor(selectedNodeData.value.community)
})

const selectedNodeStaticEdges = computed(() => {
  if (!selectedNode.value) return 0
  return graphEdges.value.filter(e =>
    (e.source === selectedNode.value || e.target === selectedNode.value) && e.type === 'static'
  ).length
})

const selectedNodeGitEdges = computed(() => {
  if (!selectedNode.value) return 0
  return graphEdges.value.filter(e =>
    (e.source === selectedNode.value || e.target === selectedNode.value) && e.type === 'git'
  ).length
})

const selectedNodeNeighbors = computed(() => {
  if (!selectedNode.value) return []
  const neighbors: { id: string; community: number; weight: number; type: 'static' | 'git' }[] = []
  for (const edge of graphEdges.value) {
    if (edge.source === selectedNode.value) {
      neighbors.push({ id: edge.target, community: nodeCommunityMap.value.get(edge.target) ?? -1, weight: edge.weight, type: edge.type })
    } else if (edge.target === selectedNode.value) {
      neighbors.push({ id: edge.source, community: nodeCommunityMap.value.get(edge.source) ?? -1, weight: edge.weight, type: edge.type })
    }
  }
  return neighbors.sort((a, b) => b.weight - a.weight)
})

// ---------- Multi-Selection Aggregates ----------
const multiSelectionStats = computed(() => {
  if (selectedNodes.size <= 1) return null
  const ids = new Set(selectedNodes)
  const nodes = clusteringResult.value.nodes.filter(n => ids.has(n.id))

  // Community distribution
  const commCounts = new Map<number, number>()
  for (const n of nodes) {
    commCounts.set(n.community, (commCounts.get(n.community) || 0) + 1)
  }
  const communityBreakdown = Array.from(commCounts.entries())
    .map(([commId, count]) => ({ commId, count, color: communityColor(commId) }))
    .sort((a, b) => b.count - a.count)

  // Edge stats
  let internalEdges = 0
  let externalEdges = 0
  let staticEdges = 0
  let gitEdges = 0
  for (const edge of graphEdges.value) {
    const srcIn = ids.has(edge.source)
    const tgtIn = ids.has(edge.target)
    if (srcIn || tgtIn) {
      if (srcIn && tgtIn) { internalEdges++ } else { externalEdges++ }
      if (edge.type === 'static') { staticEdges++ } else { gitEdges++ }
    }
  }

  // Total connections (degree sum)
  const totalDegree = nodes.reduce((sum, n) => sum + (n.connections ?? 0), 0)

  return {
    count: nodes.length,
    communityBreakdown,
    internalEdges,
    externalEdges,
    staticEdges,
    gitEdges,
    totalDegree,
    avgDegree: nodes.length > 0 ? (totalDegree / nodes.length).toFixed(1) : '0',
    nodeList: nodes.map(n => ({
      id: n.id,
      community: n.community,
      connections: n.connections ?? 0,
    })).sort((a, b) => b.connections - a.connections),
  }
})

// ---------- Zoom Controls ----------
function zoomIn() {
  if (!canvasEl.value) return
  d3.select(canvasEl.value).transition().duration(250).call(zoomBehavior.scaleBy as any, 1.3)
}
function zoomOut() {
  if (!canvasEl.value) return
  d3.select(canvasEl.value).transition().duration(250).call(zoomBehavior.scaleBy as any, 0.7)
}
function resetZoom() {
  if (!canvasEl.value) return
  d3.select(canvasEl.value).transition().duration(250).call(zoomBehavior.transform as any, d3.zoomIdentity)
}

// ---------- Edit Mode Actions ----------
function clearEditState() {
  selectedNodes.clear()
  contextMenu.visible = false
  hiddenNodes.clear()
  clearDwell()
  showAdvancedEdit.value = false
  editTool.value = 'pointer'
  showActionBarMoveDropdown.value = false
}

function reassignNodeCommunity(nodeId: string, newCommunityId: number) {
  if (newCommunityId === -1) {
    let maxId = 0
    for (const comm of communities.value) { if (comm.id > maxId) maxId = comm.id }
    newCommunityId = maxId + 1
  }
  customCommunityOverrides.set(nodeId, newCommunityId)
  const sn = simNodes.find(n => n.id === nodeId)
  if (sn) sn.community = newCommunityId
  requestRender()
}

function reassignMultipleNodes(nodeIds: Iterable<string>, newCommunityId: number) {
  if (newCommunityId === -1) {
    let maxId = 0
    for (const comm of communities.value) { if (comm.id > maxId) maxId = comm.id }
    newCommunityId = maxId + 1
  }
  for (const nodeId of nodeIds) {
    customCommunityOverrides.set(nodeId, newCommunityId)
    const sn = simNodes.find(n => n.id === nodeId)
    if (sn) sn.community = newCommunityId
  }
  requestRender()
}

function togglePinNode(nodeId: string) {
  const sn = simNodes.find(n => n.id === nodeId)
  if (!sn) return
  if (pinnedNodes.has(nodeId)) {
    pinnedNodes.delete(nodeId)
    sn.fx = null; sn.fy = null
  } else {
    pinnedNodes.add(nodeId)
    sn.fx = sn.x; sn.fy = sn.y
  }
  requestRender()
}

function onCommunityClick(event: MouseEvent, comm: Community) {
  if (event.shiftKey) {
    // Shift click: add all members to selection
    for (const memberId of comm.members) {
      selectedNodes.add(memberId)
    }
  } else {
    // Plain click: replace selection (toggle spotlight and selection)
    if (spotlightedCommunity.value === comm.id) {
      spotlightedCommunity.value = null
      selectedNodes.clear()
    } else {
      spotlightedCommunity.value = comm.id
      selectedNodes.clear()
      for (const memberId of comm.members) {
        selectedNodes.add(memberId)
      }
    }
  }

  // Update selectedNode (single node details vs multi-selection view)
  if (selectedNodes.size === 1) {
    selectedNode.value = Array.from(selectedNodes)[0]
  } else {
    selectedNode.value = null
  }

  // Expand sidebar and switch to inspector tab
  if (selectedNodes.size > 0) {
    sidebarExpanded.value = true
    activeSidebarTab.value = 'inspector'
  }

  requestRender()
}

function resetCustomClusters() {
  customCommunityOverrides.clear()
  recomputeClusters()
}

function unhideAllNodes() {
  hiddenNodes.clear()
  recomputeClusters()
}

// ---------- Context Menu Actions ----------
function contextMoveToComm(commId: number) {
  const targets = selectedNodes.size > 1 ? selectedNodes : (contextMenu.nodeId ? new Set([contextMenu.nodeId]) : new Set<string>())
  reassignMultipleNodes(targets, commId)
  contextMenu.visible = false
}

function contextCreateNewCluster() {
  const targets = selectedNodes.size > 1 ? selectedNodes : (contextMenu.nodeId ? new Set([contextMenu.nodeId]) : new Set<string>())
  reassignMultipleNodes(targets, -1)
  contextMenu.visible = false
}

function contextTogglePin() {
  const targets = selectedNodes.size > 1 ? Array.from(selectedNodes) : (contextMenu.nodeId ? [contextMenu.nodeId] : [])
  const allPinned = targets.every(id => pinnedNodes.has(id))
  for (const id of targets) {
    const sn = simNodes.find(n => n.id === id)
    if (!sn) continue
    if (allPinned) {
      pinnedNodes.delete(id)
      sn.fx = null; sn.fy = null
    } else {
      pinnedNodes.add(id)
      sn.fx = sn.x; sn.fy = sn.y
    }
  }
  contextMenu.visible = false
  requestRender()
}

function contextSelectAllInCommunity() {
  if (!contextMenu.nodeId) return
  const comm = nodeCommunityMap.value.get(contextMenu.nodeId)
  if (comm === undefined) return
  for (const node of clusteringResult.value.nodes) {
    if (node.community === comm) selectedNodes.add(node.id)
  }
  contextMenu.visible = false
  requestRender()
}

function contextHideNodes() {
  const targets = selectedNodes.size > 1 ? Array.from(selectedNodes) : (contextMenu.nodeId ? [contextMenu.nodeId] : [])
  for (const id of targets) hiddenNodes.add(id)
  selectedNodes.clear()
  selectedNode.value = null
  contextMenu.visible = false
  recomputeClusters()
}

function contextMergeCommunityInto(targetCommId: number) {
  if (!contextMenu.nodeId) return
  const sourceComm = nodeCommunityMap.value.get(contextMenu.nodeId)
  if (sourceComm === undefined) return
  for (const node of clusteringResult.value.nodes) {
    if (node.community === sourceComm) {
      customCommunityOverrides.set(node.id, targetCommId)
    }
  }
  for (const sn of simNodes) {
    if (sn.community === sourceComm) sn.community = targetCommId
  }
  contextMenu.visible = false
  requestRender()
}

function dismissContextMenu() {
  contextMenu.visible = false
}

function createGroupFromSelection() {
  if (selectedNodes.size === 0) return
  createGroupDefaultName.value = "New Component Group"
  createGroupMembers.value = Array.from(selectedNodes)
  isCreateGroupModalOpen.value = true
  selectedNodes.clear()
  selectedNode.value = null
  requestRender()
}

function contextCreateGroupFromSelection() {
  createGroupFromSelection()
  contextMenu.visible = false
}

function actionBarCreateGroupFromSelection() {
  createGroupFromSelection()
}

// ---------- Action Bar Actions ----------
function actionBarMoveToComm(commId: number) {
  reassignMultipleNodes(selectedNodes, commId)
  showActionBarMoveDropdown.value = false
  requestRender()
}

function actionBarCreateNewCluster() {
  reassignMultipleNodes(selectedNodes, -1)
  requestRender()
}

function moveSelectionToCommunity(commId: number) {
  reassignMultipleNodes(selectedNodes, commId)
  requestRender()
}

function actionBarTogglePin() {
  const targets = Array.from(selectedNodes)
  const allPinned = isSelectionAllPinned.value
  for (const id of targets) {
    const sn = simNodes.find(n => n.id === id)
    if (!sn) continue
    if (allPinned) {
      pinnedNodes.delete(id)
      sn.fx = null; sn.fy = null
    } else {
      pinnedNodes.add(id)
      sn.fx = sn.x; sn.fy = sn.y
    }
  }
  requestRender()
}

function actionBarHideNodes() {
  const targets = Array.from(selectedNodes)
  for (const id of targets) hiddenNodes.add(id)
  selectedNodes.clear()
  selectedNode.value = null
  recomputeClusters()
}

function actionBarClearSelection() {
  selectedNodes.clear()
  selectedNode.value = null
  requestRender()
}

// ---------- Sidebar interactions ----------
function selectNodeById(id: string) {
  selectedNode.value = id
  requestRender()
}

// ---------- Dwell Logic ----------
function clearDwell() {
  if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null }
  dwellTargetCommunity = null
  isDwelling = false
}

function findCommunityAtSimPoint(simX: number, simY: number, excludeNodeId: string | null): number | null {
  for (const hull of cachedHulls) {
    // Skip the community the dragged node currently belongs to
    if (excludeNodeId) {
      const dragSn = simNodes.find(n => n.id === excludeNodeId)
      if (dragSn && dragSn.community === hull.commId) continue
    }
    if (d3.polygonContains(hull.polygon, [simX, simY])) {
      return hull.commId
    }
  }
  return null
}

// ---------- Canvas Rendering ----------
const NODE_RADIUS = 5
const NODE_RADIUS_SELECTED = 10
const NODE_RADIUS_NEIGHBOR = 7
const LABEL_FONT = '500 8px system-ui, -apple-system, sans-serif'
const LABEL_FONT_BOLD = '700 11px system-ui, -apple-system, sans-serif'

function requestRender() {
  if (animFrameId !== null) return
  animFrameId = requestAnimationFrame(() => {
    animFrameId = null
    drawCanvas()
  })
}

function drawCanvas() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr

  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)

  ctx.translate(currentTransform.x, currentTransform.y)
  ctx.scale(currentTransform.k, currentTransform.k)

  const active = selectedNode.value
  const spotlight = spotlightedCommunity.value
  const hovered = hoveredNode.value
  const query = searchQuery.value.trim().toLowerCase()

  const neighborIds = new Set<string>()
  if (active) {
    for (const e of graphEdges.value) {
      if (e.source === active) neighborIds.add(e.target)
      if (e.target === active) neighborIds.add(e.source)
    }
  }

  // ── Draw community hulls ──
  drawCommunityHulls(ctx, active, spotlight)

  // ── Draw links ──
  for (const link of simLinks) {
    const src = link.source
    const tgt = link.target
    if (src.x == null || tgt.x == null) continue

    let opacity = link.type === 'git' ? 0.25 : 0.18
    let lineWidth = link.type === 'git' ? 0.8 : 0.6
    let strokeColor = link.type === 'git' ? '#c4b5fd' : '#cbd5e1'

    if (active) {
      const isConnected = src.id === active || tgt.id === active
      if (isConnected) { opacity = 0.8; lineWidth = 2.5; strokeColor = link.type === 'git' ? '#8b5cf6' : '#3b82f6' }
      else { opacity = 0.03; lineWidth = 0.3 }
    } else if (spotlight !== null) {
      const srcComm = nodeCommunityMap.value.get(src.id)
      const tgtComm = nodeCommunityMap.value.get(tgt.id)
      if (srcComm === spotlight && tgtComm === spotlight) { opacity = 0.6; lineWidth = 1.5 }
      else { opacity = 0.03; lineWidth = 0.3 }
    } else if (query) {
      const srcMatch = src.id.toLowerCase().includes(query)
      const tgtMatch = tgt.id.toLowerCase().includes(query)
      opacity = (srcMatch || tgtMatch) ? 0.6 : 0.04
      lineWidth = (srcMatch || tgtMatch) ? 1.2 : 0.3
    }

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
    ctx.strokeStyle = strokeColor
    ctx.globalAlpha = opacity
    ctx.lineWidth = lineWidth
    if (link.type === 'git') { ctx.setLineDash([4, 3]) } else { ctx.setLineDash([]) }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Compute pre-selection set (nodes inside active selection rect) ──
  const preSelectedIds = new Set<string>()
  if (selectionRect.active) {
    const rx1 = Math.min(selectionRect.startX, selectionRect.endX)
    const ry1 = Math.min(selectionRect.startY, selectionRect.endY)
    const rx2 = Math.max(selectionRect.startX, selectionRect.endX)
    const ry2 = Math.max(selectionRect.startY, selectionRect.endY)
    if (Math.abs(rx2 - rx1) > 3 && Math.abs(ry2 - ry1) > 3) {
      for (const n of simNodes) {
        if (n.x == null) continue
        const [sx, sy] = currentTransform.apply([n.x, n.y])
        if (sx >= rx1 && sx <= rx2 && sy >= ry1 && sy <= ry2) {
          preSelectedIds.add(n.id)
        }
      }
    }
  }

  // ── Draw nodes ──
  for (const node of simNodes) {
    if (node.x == null) continue

    let radius = NODE_RADIUS
    let strokeColor = '#ffffff'
    let strokeWidth = 1
    let nodeOpacity = 0.9
    const fillColor = communityColor(node.community)
    const isMultiSelected = selectedNodes.has(node.id)
    const isPreSelected = preSelectedIds.has(node.id)

    if (active) {
      if (node.id === active) { radius = NODE_RADIUS_SELECTED; strokeColor = '#0f172a'; strokeWidth = 3; nodeOpacity = 1 }
      else if (neighborIds.has(node.id)) { radius = NODE_RADIUS_NEIGHBOR; strokeColor = '#64748b'; strokeWidth = 1.5; nodeOpacity = 1 }
      else { nodeOpacity = 0.1 }
    } else if (spotlight !== null) {
      const comm = nodeCommunityMap.value.get(node.id)
      if (comm === spotlight) { radius = 7; nodeOpacity = 1 } else { radius = 4; nodeOpacity = 0.08 }
    } else if (query) {
      if (!node.id.toLowerCase().includes(query)) { nodeOpacity = 0.12 }
    }

    // Boost opacity for pre-selected nodes so they stand out
    if (isPreSelected && nodeOpacity < 0.5) {
      nodeOpacity = 0.7
    }

    // Glow effect for hovered/selected
    if (node.id === hovered || node.id === active) {
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.shadowColor = fillColor
      ctx.shadowBlur = 16
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius + 3, 0, Math.PI * 2)
      ctx.fillStyle = fillColor
      ctx.fill()
      ctx.restore()
    }

    // Multi-selection ring
    if (isMultiSelected) {
      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.shadowColor = '#38bdf8'
      ctx.shadowBlur = 8
      ctx.stroke()
      ctx.restore()
    }

    // Pre-selection ring (dashed cyan ring for nodes inside active selection rect)
    if (isPreSelected && !isMultiSelected) {
      ctx.save()
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.setLineDash([3 / currentTransform.k, 2 / currentTransform.k])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // Node circle
    ctx.globalAlpha = nodeOpacity
    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.stroke()

    // Pin indicator
    if (pinnedNodes.has(node.id)) {
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.arc(node.x, node.y - radius - 4, 2, 0, Math.PI * 2)
      ctx.fillStyle = '#0ea5e9'
      ctx.fill()
    }
  }

  // ── Draw labels (smart declutter) ──
  ctx.globalAlpha = 1
  const zoomLevel = currentTransform.k

  for (const node of simNodes) {
    if (node.x == null) continue

    let showLabel = false
    let labelFont = LABEL_FONT
    let labelOpacity = 0.75
    let labelColor = '#64748b'

    const isSelectedLabel = node.id === active || (selectedNodes.has(node.id) && selectedNodes.size <= 8)

    if (isSelectedLabel) { showLabel = true; labelFont = LABEL_FONT_BOLD; labelOpacity = 1; labelColor = '#0f172a' }
    else if (node.id === hovered) { showLabel = true; labelFont = '600 10px system-ui, -apple-system, sans-serif'; labelOpacity = 1; labelColor = '#334155' }
    else if (active && neighborIds.has(node.id)) { showLabel = true; labelOpacity = 0.9 }
    else if (spotlight !== null) { const comm = nodeCommunityMap.value.get(node.id); if (comm === spotlight) { showLabel = true; labelOpacity = 0.85 } }
    else if (query && node.id.toLowerCase().includes(query)) { showLabel = true; labelFont = '600 9px system-ui, -apple-system, sans-serif'; labelOpacity = 1; labelColor = '#1e293b' }
    else if (labelDisplayMode.value === 'all') {
      showLabel = true
    }
    else if (labelDisplayMode.value === 'smart') {
      if (zoomLevel > 1.5) { showLabel = true }
      else if (zoomLevel > 0.8 && node.connections > 5) { showLabel = true }
      else if (zoomLevel > 0.5 && node.connections > 12) { showLabel = true }
    }

    if (showLabel) {
      const displayName = store.getComponentName(node.id)
      ctx.globalAlpha = labelOpacity
      ctx.font = labelFont
      ctx.fillStyle = labelColor
      ctx.textBaseline = 'middle'
      ctx.fillText(displayName, node.x + (node.id === active ? 14 : 9), node.y + 1)
    }
  }

  // ── Draw selection rectangle ──
  if (selectionRect.active) {
    ctx.restore() // Undo zoom transform for screen-space rect
    ctx.save()
    ctx.scale(dpr, dpr)
    const rx = Math.min(selectionRect.startX, selectionRect.endX)
    const ry = Math.min(selectionRect.startY, selectionRect.endY)
    const rw = Math.abs(selectionRect.endX - selectionRect.startX)
    const rh = Math.abs(selectionRect.endY - selectionRect.startY)
    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(rx, ry, rw, rh)
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 3])
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.setLineDash([])
    ctx.restore()
    return // Skip the normal restore
  }

  ctx.globalAlpha = 1
  ctx.restore()
}

function drawCommunityHulls(ctx: CanvasRenderingContext2D, active: string | null, spotlight: number | null) {
  const commGroups = new Map<number, { x: number; y: number }[]>()
  for (const node of simNodes) {
    if (node.x == null) continue
    const comm = node.community
    if (!commGroups.has(comm)) commGroups.set(comm, [])
    commGroups.get(comm)!.push({ x: node.x, y: node.y })
  }

  // Rebuild cached hulls for dwell hit detection
  cachedHulls = []

  for (const [commId, points] of commGroups) {
    if (points.length < 3) continue

    const hullPoints = d3.polygonHull(points.map(p => [p.x, p.y] as [number, number]))
    if (!hullPoints || hullPoints.length < 3) continue

    const color = communityColor(commId)

    let hullOpacity = 0.06
    if (spotlight === commId) { hullOpacity = 0.15 }
    else if (spotlight !== null) { hullOpacity = 0.02 }
    else if (active) {
      const activeComm = nodeCommunityMap.value.get(active)
      hullOpacity = (activeComm === commId) ? 0.1 : 0.03
    }

    // Dwell glow: pulse the target hull when dwelling over it
    if (isDwelling && dwellTargetCommunity === commId) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200)
      hullOpacity = 0.15 + 0.12 * pulse
    }

    const centroid = d3.polygonCentroid(hullPoints)
    const expandedHull = hullPoints.map(([x, y]) => {
      const dx = x - centroid[0]
      const dy = y - centroid[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      const pad = 25
      return [x + (dx / len) * pad, y + (dy / len) * pad] as [number, number]
    })

    // Cache for hit detection
    cachedHulls.push({ commId, polygon: expandedHull })

    ctx.globalAlpha = hullOpacity
    ctx.fillStyle = color
    ctx.beginPath()

    const len = expandedHull.length
    const midX0 = (expandedHull[0][0] + expandedHull[len - 1][0]) / 2
    const midY0 = (expandedHull[0][1] + expandedHull[len - 1][1]) / 2
    ctx.moveTo(midX0, midY0)

    for (let i = 0; i < len; i++) {
      const curr = expandedHull[i]
      const next = expandedHull[(i + 1) % len]
      const midX = (curr[0] + next[0]) / 2
      const midY = (curr[1] + next[1]) / 2
      ctx.quadraticCurveTo(curr[0], curr[1], midX, midY)
    }

    ctx.closePath()
    ctx.fill()

    // Dwell glow border
    if (isDwelling && dwellTargetCommunity === commId) {
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.stroke()
    } else {
      ctx.globalAlpha = hullOpacity * 1.5
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  ctx.globalAlpha = 1
}

// ---------- D3 Zoom Behavior ----------
const zoomBehavior = d3.zoom<HTMLCanvasElement, unknown>()
  .scaleExtent([0.1, 6])
  .filter((event) => {
    // Only allow wheel events for zoom — all mouse drag is handled by our own handlers
    if (event.type === 'mousedown') return false
    return true
  })
  .on('zoom', (event) => {
    currentTransform = event.transform
    requestRender()
  })

// ---------- Canvas Hit Detection ----------
function findNodeAtPoint(canvasX: number, canvasY: number): any | null {
  const [simX, simY] = currentTransform.invert([canvasX, canvasY])
  if (!quadtree) return null

  let closestNode: any = null
  let closestDist = Infinity
  const searchRadius = 12 / currentTransform.k

  quadtree.visit((quadNode: any, x0, y0, x1, y1) => {
    if (!quadNode.length) {
      let node = quadNode.data
      do {
        const dx = simX - (node.x ?? 0)
        const dy = simY - (node.y ?? 0)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < searchRadius && dist < closestDist) {
          closestDist = dist
          closestNode = node
        }
      } while ((node = node.next))
    }
    const nearestX = Math.max(x0, Math.min(simX, x1))
    const nearestY = Math.max(y0, Math.min(simY, y1))
    const dx = simX - nearestX
    const dy = simY - nearestY
    return dx * dx + dy * dy > searchRadius * searchRadius
  })

  return closestNode
}

function updateQuadtree() {
  quadtree = d3.quadtree<any>()
    .x(d => d.x ?? 0)
    .y(d => d.y ?? 0)
    .addAll(simNodes)
}

// ---------- Canvas Event Handlers ----------
function onCanvasMouseMove(event: MouseEvent) {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // Selection rectangle dragging
  if (selectionRect.active) {
    selectionRect.endX = x
    selectionRect.endY = y
    requestRender()
    return
  }

  // Node dragging
  if (isDragging && dragNode) {
    const [simX, simY] = currentTransform.invert([x, y])
    dragNode.fx = simX
    dragNode.fy = simY
    simulation?.alphaTarget(0.3).restart()

    // Dwell detection for edit mode
    if (editMode.value) {
      const hullComm = findCommunityAtSimPoint(simX, simY, dragNode.id)
      if (hullComm !== null && hullComm !== dwellTargetCommunity) {
        clearDwell()
        dwellTargetCommunity = hullComm
        dwellStartTime = Date.now()
        dwellTimer = setTimeout(() => {
          isDwelling = true
          requestRender()
        }, 500)
      } else if (hullComm === null) {
        clearDwell()
      }
      // Keep requesting render for dwell pulse animation
      if (isDwelling) requestRender()
    }
    return
  }

  // Hover detection
  const node = findNodeAtPoint(x, y)
  if (node) {
    hoveredNode.value = node.id
    canvas.style.cursor = 'pointer'
    tooltipVisible.value = true
    tooltipX.value = x + 14
    tooltipY.value = y - 12
    tooltipTitle.value = store.getComponentName(node.id)
    tooltipSubtitle.value = `${communityName(node.community ?? 0)} · ${node.connections ?? 0} connections`
  } else {
    hoveredNode.value = null
    canvas.style.cursor = editMode.value && (editTool.value === 'select' || event.shiftKey) ? 'crosshair' : 'default'
    tooltipVisible.value = false
  }

  requestRender()
}

function onCanvasMouseDown(event: MouseEvent) {
  const canvas = canvasEl.value
  if (!canvas) return

  // Dismiss context menu on any click
  if (contextMenu.visible) {
    // Let click propagate to context menu items first
    return
  }

  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const node = findNodeAtPoint(x, y)

  // If clicking on a node, start node drag
  if (node && event.button === 0) {
    isDragging = true
    dragStartedOnNode = true
    dragNode = node
    dragNode.fx = dragNode.x
    dragNode.fy = dragNode.y
    simulation?.alphaTarget(0.3).restart()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // If clicking on empty space, start selection rectangle
  if (!node && event.button === 0) {
    selectionRect.active = true
    selectionRect.startX = x
    selectionRect.startY = y
    selectionRect.endX = x
    selectionRect.endY = y
    event.preventDefault()
    event.stopPropagation()
    return
  }
}

function onCanvasMouseUp(event: MouseEvent) {
  // End selection rectangle
  if (selectionRect.active) {
    // Find all nodes inside the rect
    const rx1 = Math.min(selectionRect.startX, selectionRect.endX)
    const ry1 = Math.min(selectionRect.startY, selectionRect.endY)
    const rx2 = Math.max(selectionRect.startX, selectionRect.endX)
    const ry2 = Math.max(selectionRect.startY, selectionRect.endY)

    // Only select if rect is large enough (not accidental)
    if (Math.abs(rx2 - rx1) > 5 && Math.abs(ry2 - ry1) > 5) {
      for (const node of simNodes) {
        if (node.x == null) continue
        const [screenX, screenY] = currentTransform.apply([node.x, node.y])
        if (screenX >= rx1 && screenX <= rx2 && screenY >= ry1 && screenY <= ry2) {
          selectedNodes.add(node.id)
        }
      }
      // Clear single-node focus so multi-selection view takes over
      if (selectedNodes.size > 1) {
        selectedNode.value = null
      } else if (selectedNodes.size === 1) {
        selectedNode.value = Array.from(selectedNodes)[0]
      }
    }

    selectionRect.active = false
    justFinishedSelection = true
    requestRender()
    return
  }

  // End node drag — check dwell reassignment
  if (isDragging && dragNode) {
    if (isDwelling && dwellTargetCommunity !== null && editMode.value) {
      // Reassign node to the dwelled community
      reassignNodeCommunity(dragNode.id, dwellTargetCommunity)
      // Also reassign any multi-selected nodes being dragged
      if (selectedNodes.has(dragNode.id) && selectedNodes.size > 1) {
        reassignMultipleNodes(selectedNodes, dwellTargetCommunity)
      }
    }

    if (!pinnedNodes.has(dragNode.id)) {
      dragNode.fx = null
      dragNode.fy = null
    }
    simulation?.alphaTarget(0)
    isDragging = false
    dragNode = null
    dragStartedOnNode = false
    clearDwell()
  }
}

function onCanvasClick(event: MouseEvent) {
  // Skip click if it was the tail-end of a selection-rect drag
  if (justFinishedSelection) {
    justFinishedSelection = false
    return
  }

  if (contextMenu.visible) {
    contextMenu.visible = false
    return
  }

  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const node = findNodeAtPoint(x, y)
  if (node) {
    if (editMode.value && editTool.value === 'select') {
      // Toggle node selection in select mode
      if (selectedNodes.has(node.id)) {
        selectedNodes.delete(node.id)
        if (selectedNode.value === node.id) {
          selectedNode.value = selectedNodes.size > 0 ? Array.from(selectedNodes)[0] : null
        }
      } else {
        selectedNodes.add(node.id)
        selectedNode.value = node.id
      }
    } else if (event.ctrlKey || event.metaKey || event.shiftKey) {
      // Ctrl/Cmd/Shift+click to add/remove from selection
      if (selectedNodes.has(node.id)) {
        selectedNodes.delete(node.id)
      } else {
        selectedNodes.add(node.id)
      }
      if (selectedNodes.size === 1) {
        selectedNode.value = Array.from(selectedNodes)[0]
      } else {
        selectedNode.value = null
      }
    } else {
      if (selectedNode.value === node.id) {
        selectedNode.value = null
        selectedNodes.clear()
      } else {
        selectedNode.value = node.id
        selectedNodes.clear()
        selectedNodes.add(node.id)
      }
    }
    spotlightedCommunity.value = null
  } else {
    // Clicked empty space: clear selection unless in select mode
    if (!(editMode.value && editTool.value === 'select')) {
      selectedNode.value = null
      selectedNodes.clear()
      spotlightedCommunity.value = null
    }
  }

  requestRender()
}

function onCanvasContextMenu(event: MouseEvent) {
  if (!editMode.value) return

  event.preventDefault()
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const node = findNodeAtPoint(x, y)
  if (node) {
    // If right-clicking a node that's not in the multi-selection, select it
    if (!selectedNodes.has(node.id)) {
      selectedNodes.clear()
      selectedNodes.add(node.id)
    }
    selectedNode.value = node.id
    contextMenu.nodeId = node.id
    contextMenu.x = Math.min(x, (canvasContainer.value?.clientWidth ?? 400) - 220)
    contextMenu.y = Math.min(y, (canvasContainer.value?.clientHeight ?? 400) - 300)
    contextMenu.visible = true
  }
}

function onCanvasDblClick(event: MouseEvent) {
  if (!editMode.value) return

  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const node = findNodeAtPoint(x, y)
  if (node) {
    togglePinNode(node.id)
    event.preventDefault()
    event.stopPropagation()
  }
}

function onCanvasMouseLeave() {
  hoveredNode.value = null
  tooltipVisible.value = false
  if (selectionRect.active) {
    selectionRect.active = false
  }
  requestRender()
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as Node

  // Dismiss context menu when clicking outside
  if (contextMenu.visible && contextMenuEl.value && !contextMenuEl.value.contains(target)) {
    contextMenu.visible = false
  }

  // Dismiss action bar move dropdown when clicking outside
  if (showActionBarMoveDropdown.value && actionBarMoveContainerEl.value && !actionBarMoveContainerEl.value.contains(target)) {
    showActionBarMoveDropdown.value = false
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    contextMenu.visible = false
    showActionBarMoveDropdown.value = false
    selectedNodes.clear()
    selectedNode.value = null
    requestRender()
  }
}

// ---------- Render Graph ----------
function renderGraph() {
  const canvas = canvasEl.value
  const container = canvasContainer.value
  if (!canvas || !container) return

  if (simulation) { simulation.stop(); simulation = null }

  const rect = container.getBoundingClientRect()
  const w = rect.width || 900
  const h = Math.max(rect.height || 550, 500)
  const dpr = window.devicePixelRatio || 1
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'

  const edges = graphEdges.value
  const nodeIds = graphNodes.value.filter(id => !hiddenNodes.has(id))
  const clResult = clusteringResult.value

  if (nodeIds.length === 0) return

  simNodes = nodeIds.map(id => {
    const cluster = clResult.nodes.find(n => n.id === id)
    return { id, community: cluster?.community ?? 0, connections: cluster?.connections ?? 0 }
  })

  simLinks = edges
    .filter(e => !hiddenNodes.has(e.source) && !hiddenNodes.has(e.target))
    .map(e => ({ source: e.source, target: e.target, weight: e.weight, type: e.type }))

  const canvasSelection = d3.select(canvas)
  canvasSelection.call(zoomBehavior)
  currentTransform = d3.zoomIdentity

  canvas.addEventListener('mousemove', onCanvasMouseMove)
  canvas.addEventListener('mousedown', onCanvasMouseDown)
  canvas.addEventListener('click', onCanvasClick)
  canvas.addEventListener('contextmenu', onCanvasContextMenu)
  canvas.addEventListener('dblclick', onCanvasDblClick)
  canvas.addEventListener('mouseleave', onCanvasMouseLeave)

  const chargeStrength = simNodes.length > 200 ? -60 : (simNodes.length > 100 ? -90 : -120)
  const linkDistance = simNodes.length > 200 ? 50 : (simNodes.length > 100 ? 65 : 80)

  simulation = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id((d: any) => d.id).distance(linkDistance).strength(0.4))
    .force('charge', d3.forceManyBody().strength(chargeStrength).distanceMax(350))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide().radius(simNodes.length > 200 ? 8 : 12))
    .force('x', d3.forceX(w / 2).strength(0.05))
    .force('y', d3.forceY(h / 2).strength(0.05))
    .on('tick', () => { updateQuadtree(); requestRender() })

  const commCentroids = new Map<number, { x: number; y: number; count: number }>()
  simulation.force('community', () => {
    commCentroids.clear()
    for (const n of simNodes) {
      if (!commCentroids.has(n.community)) commCentroids.set(n.community, { x: 0, y: 0, count: 0 })
      const c = commCentroids.get(n.community)!
      c.x += n.x || 0; c.y += n.y || 0; c.count++
    }
    for (const c of commCentroids.values()) { c.x /= c.count; c.y /= c.count }
    const strength = communityForceStrength.value
    for (const n of simNodes) {
      const c = commCentroids.get(n.community)
      if (!c) continue
      n.vx = (n.vx || 0) + (c.x - (n.x || 0)) * strength
      n.vy = (n.vy || 0) + (c.y - (n.y || 0)) * strength
    }
  })

  simulation.alpha(0.8).restart()
}

// ---------- Recompute / Recluster ----------
let renderTimeout: ReturnType<typeof setTimeout> | null = null

function recomputeClusters() {
  selectedNode.value = null
  spotlightedCommunity.value = null
  selectedNodes.clear()
  if (renderTimeout) clearTimeout(renderTimeout)
  renderTimeout = setTimeout(() => { renderGraph() }, 100)
}

function runClustering() {
  customCommunityOverrides.clear()
  recomputeClusters()
}

// ---------- Watchers ----------
watch([() => props.components, couplingMode, staticMinWeight, gitThreshold, minSharedCommits], () => {
  recomputeClusters()
}, { deep: true })

watch(searchQuery, () => { requestRender() })
watch(labelDisplayMode, () => { requestRender() })

watch(selectedNode, (newVal) => {
  if (newVal) {
    sidebarExpanded.value = true
    activeSidebarTab.value = 'inspector'
  }
})

function handleWindowResize() {
  if (canvasContainer.value && canvasEl.value) {
    const container = canvasContainer.value
    const canvas = canvasEl.value
    const rect = container.getBoundingClientRect()
    const w = rect.width || 900
    const h = Math.max(rect.height || 550, 500)
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    if (simulation) {
      simulation.force('center', d3.forceCenter(w / 2, h / 2))
      simulation.force('x', d3.forceX(w / 2).strength(0.05))
      simulation.force('y', d3.forceY(h / 2).strength(0.05))
      simulation.alpha(0.3).restart()
    }
    updateQuadtree()
    requestRender()
  }
}

watch(sidebarExpanded, () => {
  // Let the transition finish, then update canvas dimensions and center forces smoothly
  setTimeout(() => {
    handleWindowResize()
  }, 310)
})

// ---------- Lifecycle ----------
onMounted(() => {
  try {
    nextTick(() => renderGraph())
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown)
    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('mouseup', onCanvasMouseUp)
  } catch (e) {
    console.error('ClusteringDiagram render error:', e)
  }
})

onBeforeUnmount(() => {
  if (simulation) { simulation.stop(); simulation = null }
  if (renderTimeout) clearTimeout(renderTimeout)
  if (animFrameId !== null) cancelAnimationFrame(animFrameId)
  clearDwell()

  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('mouseup', onCanvasMouseUp)

  const canvas = canvasEl.value
  if (canvas) {
    canvas.removeEventListener('mousemove', onCanvasMouseMove)
    canvas.removeEventListener('mousedown', onCanvasMouseDown)
    canvas.removeEventListener('click', onCanvasClick)
    canvas.removeEventListener('contextmenu', onCanvasContextMenu)
    canvas.removeEventListener('dblclick', onCanvasDblClick)
    canvas.removeEventListener('mouseleave', onCanvasMouseLeave)
  }
})
</script>

<style scoped>
.scroll-container {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f8fafc;
}
.scroll-container::-webkit-scrollbar {
  width: 5px;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
.scroll-container::-webkit-scrollbar-track {
  background: #f8fafc;
}
</style>
