<template>
  <ViewWorkspaceLayout
    title="Component Coupling Map"
    badge-text="Canvas v2"
    badge-color-class="bg-sky-50 border-sky-200 text-sky-700"
    :nodes-count="components.length"
    :connections-count="totalConnections"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[
      { id: 'inspector', label: '🔍 Inspector' },
      { id: 'legend', label: '📊 Legend & Guide' }
    ]"
    :show-config="true"
  >
    <template #stats>
      <span v-if="commonParentPrefix" class="text-slate-300">|</span>
      <span v-if="commonParentPrefix" class="font-mono text-indigo-500 bg-indigo-50/50 px-1 rounded-sm" :title="`Common prefix stripped from labels: ${commonParentPrefix}`">
        Prefix: {{ commonParentPrefix }}
      </span>
    </template>

    <template #actions>
      <!-- Mode Toggle switcher -->
      <div v-if="hasGitCoupling" class="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 items-center">
        <button 
          @click="couplingMode = 'static'; updateHighlight(); triggerChartRerender()"
          class="text-[9px] font-extrabold px-3 py-1.5 rounded-lg capitalize tracking-wide transition-all cursor-pointer"
          :class="couplingMode === 'static' 
            ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/30' 
            : 'text-slate-500 hover:text-slate-800'"
        >
          Static
        </button>
        <button 
          @click="couplingMode = 'git'; updateHighlight(); triggerChartRerender()"
          class="text-[9px] font-extrabold px-3 py-1.5 rounded-lg capitalize tracking-wide transition-all cursor-pointer"
          :class="couplingMode === 'git' 
            ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/30' 
            : 'text-slate-500 hover:text-slate-800'"
        >
          Git
        </button>
        <button 
          @click="couplingMode = 'both'; updateHighlight(); triggerChartRerender()"
          class="text-[9px] font-extrabold px-3 py-1.5 rounded-lg capitalize tracking-wide transition-all cursor-pointer"
          :class="couplingMode === 'both' 
            ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/30' 
            : 'text-slate-500 hover:text-slate-800'"
        >
          Combined
        </button>
      </div>
    </template>

    <template #config-popover>
      <!-- Co-change Rate slider -->
      <div class="flex flex-col gap-1" :class="{ 'opacity-30 pointer-events-none select-none': !hasGitCoupling || couplingMode === 'static' }">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-bold text-slate-500">Co-change Rate Threshold</span>
          <span class="text-[10px] font-extrabold text-slate-800 font-mono">{{ gitThreshold }}%</span>
        </div>
        <input 
          v-model.number="gitThreshold" 
          type="range" min="5" max="100" step="5"
          class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
          :disabled="!hasGitCoupling || couplingMode === 'static'"
        />
      </div>

      <!-- Min Shared Commits slider -->
      <div class="flex flex-col gap-1" :class="{ 'opacity-30 pointer-events-none select-none': !hasGitCoupling || couplingMode === 'static' }">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-bold text-slate-500">Min Shared Commits</span>
          <span class="text-[10px] font-extrabold text-slate-800 font-mono">{{ minSharedCommits }}</span>
        </div>
        <input 
          v-model.number="minSharedCommits" 
          type="range" min="1" max="20" step="1"
          class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
          :disabled="!hasGitCoupling || couplingMode === 'static'"
        />
      </div>

      <!-- Max Components slider -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-bold text-slate-500">Max Visible Nodes</span>
          <span class="text-[10px] font-extrabold text-slate-800 font-mono">{{ maxComponentsToShow }}</span>
        </div>
        <input 
          v-model.number="maxComponentsToShow" 
          type="range" min="10" :max="components.length || 200" step="1"
          class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
        />
      </div>

      <!-- Group Filter Option C -->
      <div class="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 mt-1.5">
        <span class="text-[9px] font-bold text-slate-500">Filter by Groups</span>
        <div class="flex flex-col gap-1.5 max-h-32 overflow-y-auto border border-slate-200/50 rounded-lg p-2 bg-slate-50/70">
          <label v-for="g in groupsStore.allComponentGroups" :key="g.id" class="flex items-center gap-1.5 text-[9px] font-semibold text-slate-700 cursor-pointer select-none">
            <input type="checkbox" :value="g.id" v-model="selectedGroupIds" class="rounded text-sky-600 focus:ring-sky-500 w-3 h-3 cursor-pointer" />
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: g.color }"></span>
            <span class="truncate">{{ g.name }}</span>
          </label>
          <div v-if="groupsStore.allComponentGroups.length === 0" class="text-[9px] text-slate-400 italic">
            No component groups defined
          </div>
        </div>
      </div>
    </template>

    <template #visualizer>
      <div ref="chart" class="w-full h-full max-w-[90vh] max-h-[90vh] aspect-square flex justify-center items-center relative">
        <canvas 
          ref="canvasRef" 
          class="w-full h-full block cursor-grab active:cursor-grabbing"
          @mousemove="handleMouseMove"
          @mouseleave="handleMouseLeave"
          @click="handleCanvasClick"
        ></canvas>
      </div>
    </template>

    <template #visualizer-overlays>
      <!-- Float zoom controls -->
      <div class="absolute bottom-6 right-6 flex items-center bg-white/90 backdrop-blur-md border border-slate-200/60 p-1 rounded-xl shadow-xs gap-1 z-10">
        <button @click="zoomIn" class="w-6 h-6 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-all cursor-pointer border border-slate-200/20 active:scale-95">
          <span class="font-extrabold text-xs">+</span>
        </button>
        <button @click="zoomOut" class="w-6 h-6 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-all cursor-pointer border border-slate-200/20 active:scale-95">
          <span class="font-extrabold text-xs">−</span>
        </button>
        <button @click="resetZoom" class="w-6 h-6 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-all cursor-pointer border border-slate-200/20 active:scale-95" title="Reset Zoom">
          <span class="text-[10px] font-bold">⟲</span>
        </button>
      </div>
    </template>

    <template #tab-inspector>
      <div v-if="activeComponent" class="flex flex-col gap-4">
        <!-- Component Full Namespace -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Full Namespace Path</span>
            <NuxtLink 
              :to="`/views/components/${encodeURIComponent(activeComponent.data.fullName)}`"
              class="text-[8px] bg-sky-50 hover:bg-sky-100 border border-sky-200/60 hover:border-sky-300 text-sky-700 hover:text-sky-800 font-extrabold px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer shadow-3xs"
            >
              <span>Dashboard</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-2.5 h-2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </NuxtLink>
          </div>
          <div class="font-mono text-[9px] font-extrabold text-slate-800 break-all bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 leading-relaxed flex items-center justify-between shadow-3xs">
            <span class="truncate mr-2">{{ activeComponent.data.fullName }}</span>
            <button v-if="selectedNode" @click="selectedNode = null; updateHighlight()" class="text-slate-400 hover:text-slate-600 font-extrabold text-sm cursor-pointer px-1">×</button>
          </div>
        </div>

        <!-- Combined Metrics Grid -->
        <div class="flex flex-col gap-2">
          <!-- Static Metrics -->
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-sky-50/40 border border-sky-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-sky-600 uppercase tracking-wider">Afferent (Ca)</span>
              <span class="text-sm font-extrabold text-sky-800 font-mono mt-0.5">{{ activeComponent.incoming.length }}</span>
              <span class="text-[7px] text-sky-400 font-medium">Dependents</span>
            </div>
            <div class="bg-rose-50/40 border border-rose-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-rose-600 uppercase tracking-wider">Efferent (Ce)</span>
              <span class="text-sm font-extrabold text-rose-800 font-mono mt-0.5">{{ activeComponent.outgoing.length }}</span>
              <span class="text-[7px] text-rose-400 font-medium">Dependencies</span>
            </div>
            <div class="bg-indigo-50/40 border border-indigo-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-indigo-600 uppercase tracking-wider">Instability (I)</span>
              <span class="text-sm font-extrabold text-indigo-800 font-mono mt-0.5">
                {{ calculateInstability(activeComponent.incoming.length, activeComponent.outgoing.length).toFixed(2) }}
              </span>
              <span class="text-[7px] text-indigo-400 font-medium">Instability</span>
            </div>
          </div>

          <!-- Git Coupling Metrics -->
          <div class="grid grid-cols-3 gap-2" v-if="hasGitCoupling">
            <div class="bg-violet-50/40 border border-violet-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-violet-600 uppercase tracking-wider">Git Commits</span>
              <span class="text-sm font-extrabold text-violet-800 font-mono mt-0.5">{{ activeComponentCommits }}</span>
              <span class="text-[7px] text-violet-400 font-medium">Total Commits</span>
            </div>
            <div class="bg-fuchsia-50/40 border border-fuchsia-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-fuchsia-600 uppercase tracking-wider">Git Partners</span>
              <span class="text-sm font-extrabold text-fuchsia-800 font-mono mt-0.5">{{ activeComponentGitPartners }}</span>
              <span class="text-[7px] text-fuchsia-400 font-medium">Co-changed</span>
            </div>
            <div class="bg-purple-50/40 border border-purple-100 p-2 rounded-xl flex flex-col shadow-3xs">
              <span class="text-[7.5px] font-bold text-purple-600 uppercase tracking-wider">Max Coupling</span>
              <span class="text-sm font-extrabold text-purple-800 font-mono mt-0.5">{{ activeComponentMaxCoupling.toFixed(1) }}%</span>
              <span class="text-[7px] text-purple-400 font-medium">Highest Co-change</span>
            </div>
          </div>
        </div>

        <!-- Metadata List -->
        <div class="grid grid-cols-2 gap-2 text-[10px] font-semibold">
          <div class="bg-slate-50 border border-slate-100 p-2 rounded-xl flex items-center justify-between shadow-3xs">
            <span class="text-slate-400 text-[8px] uppercase tracking-wider">Lines of Code</span>
            <span class="font-mono font-extrabold text-slate-800">
              <template v-if="hasMetric('Complexity__lines')">
                {{ getMetric(activeCompData, 'Complexity__lines').toLocaleString() }}
              </template>
              <template v-else>
                <span class="text-slate-300 italic font-normal">N/A</span>
              </template>
            </span>
          </div>
          <div class="bg-slate-50 border border-slate-100 p-2 rounded-xl flex items-center justify-between shadow-3xs">
            <span class="text-slate-400 text-[8px] uppercase tracking-wider">Files Count</span>
            <span class="font-mono font-extrabold text-slate-800">
              <template v-if="hasMetric('Complexity__files')">
                {{ getMetric(activeCompData, 'Complexity__files') }}
              </template>
              <template v-else>
                <span class="text-slate-300 italic font-normal">N/A</span>
              </template>
            </span>
          </div>
          <div class="bg-slate-50 border border-slate-100 p-2 rounded-xl flex items-center justify-between shadow-3xs">
            <span class="text-slate-400 text-[8px] uppercase tracking-wider">Code Health</span>
            <span class="font-mono font-extrabold text-slate-800">
              <template v-if="hasMetric('Codesmells__code_health')">
                {{ getMetric(activeCompData, 'Codesmells__code_health').toFixed(1) }}/10
              </template>
              <template v-else>
                <span class="text-slate-300 italic font-normal">N/A</span>
              </template>
            </span>
          </div>
          <div class="bg-slate-50 border border-slate-100 p-2 rounded-xl flex items-center justify-between shadow-3xs">
            <span class="text-slate-400 text-[8px] uppercase tracking-wider">Hotspot Score</span>
            <span class="font-mono font-extrabold text-slate-800">
              <template v-if="hasMetric('Codesmells__hotspot_score')">
                {{ getMetric(activeCompData, 'Codesmells__hotspot_score').toFixed(3) }}
              </template>
              <template v-else>
                <span class="text-slate-300 italic font-normal">N/A</span>
              </template>
            </span>
          </div>
        </div>

        <!-- Dependencies Detail Tree -->
        <div class="flex flex-col gap-4 mt-2">
          <!-- STATIC DEPENDENCIES -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5 border-b border-slate-100 pb-1 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              <span class="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">Static Code Coupling</span>
            </div>

            <!-- Outbound -->
            <div v-if="activeOutgoing.length > 0" class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <span class="text-[8px] font-extrabold text-rose-500 uppercase tracking-wider">Outbound Dependencies</span>
                <span class="text-[8px] bg-rose-50 border border-rose-100/50 text-rose-600 px-1.5 py-0.5 rounded-sm font-bold">{{ activeOutgoing.length }} unique</span>
              </div>
              <ul class="text-[9px] font-mono flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                <li 
                  v-for="o in activeOutgoing" 
                  :key="o.node.data.fullName"
                  @mouseenter="hoveredSidebarItem = o.node; updateHighlight()"
                  @mouseleave="hoveredSidebarItem = null; updateHighlight()"
                  @click="selectNodeByFullName(o.node.data.fullName)"
                  class="bg-slate-50 hover:bg-rose-50/40 border border-slate-100 hover:border-rose-200/40 px-2 py-1.5 rounded-xl flex justify-between items-center transition-all cursor-pointer group shadow-3xs"
                >
                  <span class="truncate pr-2 font-semibold text-slate-600 group-hover:text-rose-700" :title="o.node.data.fullName">
                    {{ o.node.data.fullName }}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[8px] text-slate-400 group-hover:text-rose-500" v-if="o.count > 1">×{{ o.count }}</span>
                    <span class="text-[8px] bg-rose-50/60 border border-rose-100/30 text-rose-600 px-1 rounded-xs">dep</span>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Inbound -->
            <div v-if="activeIncoming.length > 0" class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <span class="text-[8px] font-extrabold text-sky-500 uppercase tracking-wider">Inbound Dependents</span>
                <span class="text-[8px] bg-sky-50 border border-sky-100/50 text-sky-600 px-1.5 py-0.5 rounded-sm font-bold">{{ activeIncoming.length }} unique</span>
              </div>
              <ul class="text-[9px] font-mono flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                <li 
                  v-for="i in activeIncoming" 
                  :key="i.node.data.fullName"
                  @mouseenter="hoveredSidebarItem = i.node; updateHighlight()"
                  @mouseleave="hoveredSidebarItem = null; updateHighlight()"
                  @click="selectNodeByFullName(i.node.data.fullName)"
                  class="bg-slate-50 hover:bg-sky-50/40 border border-slate-100 hover:border-sky-200/40 px-2 py-1.5 rounded-xl flex justify-between items-center transition-all cursor-pointer group shadow-3xs"
                >
                  <span class="truncate pr-2 font-semibold text-slate-600 group-hover:text-sky-700" :title="i.node.data.fullName">
                    {{ i.node.data.fullName }}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[8px] text-slate-400 group-hover:text-sky-500" v-if="i.count > 1">×{{ i.count }}</span>
                    <span class="text-[8px] bg-sky-50/60 border border-sky-100/30 text-sky-600 px-1 rounded-xs">client</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- GIT CO-CHANGES -->
          <div class="flex flex-col gap-2" v-if="hasGitCoupling">
            <div class="flex items-center gap-1.5 border-b border-slate-100 pb-1 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
              <span class="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">Temporal Git Co-commits</span>
            </div>

            <!-- Git Outbound -->
            <div v-if="activeGitOutgoing.length > 0" class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <span class="text-[8px] font-extrabold text-fuchsia-600 uppercase tracking-wider">Outbound Co-changes</span>
                <span class="text-[8px] bg-fuchsia-50 border border-fuchsia-100/50 text-fuchsia-600 px-1.5 py-0.5 rounded-sm font-bold">{{ activeGitOutgoing.length }} unique</span>
              </div>
              <ul class="text-[9px] font-mono flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                <li 
                  v-for="o in activeGitOutgoing" 
                  :key="o.name"
                  @mouseenter="hoveredSidebarItem = o.node; updateHighlight()"
                  @mouseleave="hoveredSidebarItem = null; updateHighlight()"
                  @click="selectNodeByFullName(o.name)"
                  class="bg-slate-50 hover:bg-fuchsia-50/40 border border-slate-100 hover:border-fuchsia-200/40 px-2 py-1.5 rounded-xl flex justify-between items-center transition-all cursor-pointer group shadow-3xs"
                >
                  <span class="truncate pr-2 font-semibold text-slate-600 group-hover:text-fuchsia-700" :title="o.name">
                    {{ o.name }}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[8px] text-slate-400 group-hover:text-fuchsia-500">{{ o.sharedCommits }} commits</span>
                    <span class="text-[8px] bg-fuchsia-50 border border-fuchsia-100/50 text-fuchsia-600 px-1.5 py-0.5 rounded-xs font-bold">{{ o.percentage.toFixed(0) }}%</span>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Git Inbound -->
            <div v-if="activeGitIncoming.length > 0" class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <span class="text-[8px] font-extrabold text-violet-600 uppercase tracking-wider">Inbound Co-changes</span>
                <span class="text-[8px] bg-violet-50 border border-violet-100/50 text-violet-600 px-1.5 py-0.5 rounded-sm font-bold">{{ activeGitIncoming.length }} unique</span>
              </div>
              <ul class="text-[9px] font-mono flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                <li 
                  v-for="i in activeGitIncoming" 
                  :key="i.name"
                  @mouseenter="hoveredSidebarItem = i.node; updateHighlight()"
                  @mouseleave="hoveredSidebarItem = null; updateHighlight()"
                  @click="selectNodeByFullName(i.name)"
                  class="bg-slate-50 hover:bg-violet-50/40 border border-slate-100 hover:border-violet-200/40 px-2 py-1.5 rounded-xl flex justify-between items-center transition-all cursor-pointer group shadow-3xs"
                >
                  <span class="truncate pr-2 font-semibold text-slate-600 group-hover:text-violet-700" :title="i.name">
                    {{ i.name }}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <span class="text-[8px] text-slate-400 group-hover:text-violet-500">{{ i.sharedCommits }} commits</span>
                    <span class="text-[8px] bg-violet-50 border border-violet-100/50 text-violet-600 px-1.5 py-0.5 rounded-xs font-bold">{{ i.percentage.toFixed(0) }}%</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <!-- Empty Selection Inspector -->
      <div v-else class="flex flex-col gap-4 py-4">
        <div class="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col gap-2 text-slate-500 shadow-3xs">
          <div class="flex items-center gap-2 text-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-indigo-500 shrink-0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
            <span class="text-[10px] font-extrabold uppercase tracking-wider">Inspector Guide</span>
          </div>
          <p class="text-[10px] leading-relaxed text-slate-400">
            Hover over or click any component label on the circular diagram to inspect its detailed structural stability metrics and direct dependencies list.
          </p>
        </div>
      </div>
    </template>

    <template #tab-legend>
      <div class="flex flex-col gap-5">
        <!-- Visual encodings -->
        <div class="flex flex-col gap-3">
          <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Visual Encodings</span>
          <div class="flex flex-col gap-2">
            <div class="bg-white border border-slate-100 p-2.5 rounded-xl flex items-center justify-between shadow-3xs">
              <div class="flex items-center gap-2">
                <span class="w-3 h-0.5 bg-slate-300 rounded-full shrink-0"></span>
                <span class="text-[10px] font-bold text-slate-600">Static Code Coupling</span>
              </div>
              <span class="text-[8px] bg-slate-50 text-slate-500 border border-slate-200/40 px-1.5 py-0.5 rounded-md font-mono">Solid Curve</span>
            </div>

            <div class="bg-white border border-slate-100 p-2.5 rounded-xl flex items-center justify-between shadow-3xs" v-if="hasGitCoupling">
              <div class="flex items-center gap-2">
                <span class="w-3 h-0.5 border-t border-dashed border-violet-400 shrink-0"></span>
                <span class="text-[10px] font-bold text-slate-600">Git Co-commits</span>
              </div>
              <span class="text-[8px] bg-violet-50 text-violet-600 border border-violet-100/50 px-1.5 py-0.5 rounded-md font-mono">Dashed Curve</span>
            </div>

            <div class="bg-rose-50/20 border border-rose-100/40 p-2.5 rounded-xl flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-3 h-0.5 bg-rose-500 rounded-full shrink-0" style="background-color: #ef4444;"></span>
                <span class="text-[10px] font-bold text-rose-800">Efferent / Outgoing (Ce)</span>
              </div>
              <span class="text-[8px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-md font-mono font-bold">Rose-Red</span>
            </div>

            <div class="bg-sky-50/20 border border-sky-100/40 p-2.5 rounded-xl flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-3 h-0.5 bg-sky-500 rounded-full shrink-0" style="background-color: #0ea5e9;"></span>
                <span class="text-[10px] font-bold text-sky-800">Afferent / Incoming (Ca)</span>
              </div>
              <span class="text-[8px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded-md font-mono font-bold">Sky-Blue</span>
            </div>
          </div>
        </div>

        <!-- Pro Tips -->
        <div class="flex flex-col gap-2.5 bg-indigo-50/20 border border-indigo-100/30 rounded-2xl p-4">
          <span class="text-[9px] font-bold text-indigo-700 uppercase tracking-wider">Analysis Pro-Tips</span>
          <ul class="list-disc pl-4 text-[9px] text-slate-500 leading-relaxed flex flex-col gap-2">
            <li>
              <strong class="text-slate-700">Combined Mode</strong> is perfect for identifying components that are structurally separate (no static dependency) but co-changed frequently in git.
            </li>
            <li>
              Use <strong class="text-slate-700">Min Shared Commits</strong> to filter out noise from components with low commit counts.
            </li>
            <li>
              <strong class="text-slate-700">Lock Selection</strong> by clicking a label. Click the background to unlock and reset the map.
            </li>
          </ul>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script lang="ts" setup>
import * as d3 from "d3"
import {computed, defineProps, onMounted, onBeforeUnmount, ref, watch} from "vue";
import {Component, Connection, ConnectionType, resizeConnectionsOnComponents} from "~/utils/components";
import Headline from "~/components/ui/common/Headline.vue";
import Anchor from "~/components/ui/common/Anchor.vue";
import { useDataStore } from "~/stores/data";
import { useMetrics } from "~/composables/useMetrics";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import { useGroupsStore } from "~/stores/groups";

const store = useDataStore();
const groupsStore = useGroupsStore();
const { hasMetric } = useMetrics();

const chartId = "chord-" + Math.random().toString(36).replace(/[^a-z]+/g, '').substring(2, 12);
const chart = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const props = defineProps<{
  components: Component[]
}>()

const selectedGroupIds = ref<string[]>([])

const filteredComponents = computed(() => {
  let list = [...props.components]
  if (selectedGroupIds.value.length > 0) {
    list = list.filter(c => {
      const groups = groupsStore.getGroupsForComponent(c.name)
      return groups.some(g => selectedGroupIds.value.includes(g.id))
    })
  }
  return list
})

const orderedComponents = computed(() => {
  return [...filteredComponents.value].sort((a, b) => {
    return a.name.localeCompare(b.name)
  })
})

const maxComponentsToShow = ref(props.components.length || 200)

// Sync showing all components by default when components prop is loaded/changed
watch(() => props.components, (newComponents) => {
  if (newComponents && newComponents.length > 0) {
    maxComponentsToShow.value = newComponents.length
  }
}, { immediate: true })
const searchQuery = ref("")
const hoveredNode = ref<any>(null)
const selectedNode = ref<any>(null)
const hoveredSidebarItem = ref<any>(null)
const commonParentPrefix = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref<'inspector' | 'legend'>('inspector')

// Git Coupling and Switcher States
const couplingMode = ref<'static' | 'git' | 'both'>('static')
const gitThreshold = ref(30)
const minSharedCommits = ref(5)
const rootNodes = ref<Map<string, any>>(new Map())
const rootNodeLeaves = ref<any[]>([])

const hasGitCoupling = computed(() => store.hasData && store.hasView('git_component_shared_commits'))

const gitCouplingData = computed(() => {
  if (!hasGitCoupling.value) return [];
  return store.query(
    `SELECT pair_1, pair_2, shared_commits, 
            percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2
     FROM git_component_shared_commits`
  ) as any[];
});

const gitCouplingIndex = computed(() => {
  const index = new Map<string, any[]>();
  if (!hasGitCoupling.value) return index;
  
  const data = gitCouplingData.value;
  for (const row of data) {
    const p1 = row.pair_1;
    const p2 = row.pair_2;
    const shared = Number(row.shared_commits) || 0;
    
    const pct1 = Number(row.percentage_of_all_commits_pair_1) || 0;
    const pct2 = row.percentage_of_all_commits_pair_2 === "Inf" ? 100 : (Number(row.percentage_of_all_commits_pair_2) || 0);
    
    const p1Out = pct1;
    const p1In = pct2;
    const p2Out = pct2;
    const p2In = pct1;

    if (!index.has(p1)) index.set(p1, []);
    index.get(p1)!.push({
      partnerName: p2,
      sharedCommits: shared,
      outgoingPercentage: p1Out,
      incomingPercentage: p1In
    });

    if (!index.has(p2)) index.set(p2, []);
    index.get(p2)!.push({
      partnerName: p1,
      sharedCommits: shared,
      outgoingPercentage: p2Out,
      incomingPercentage: p2In
    });
  }
  return index;
});

const activeGitOutgoing = computed(() => {
  if (!activeComponent.value) return [];
  const fullName = activeComponent.value.data.fullName;
  const partners = gitCouplingIndex.value.get(fullName) || [];
  
  return partners
    .filter(p => p.outgoingPercentage >= gitThreshold.value && p.sharedCommits >= minSharedCommits.value)
    .map(p => {
      const partnerNode = rootNodes.value.get(p.partnerName);
      return {
        node: partnerNode,
        name: p.partnerName,
        sharedCommits: p.sharedCommits,
        percentage: p.outgoingPercentage
      };
    })
    .filter(p => p.node)
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));
});

const activeGitIncoming = computed(() => {
  if (!activeComponent.value) return [];
  const fullName = activeComponent.value.data.fullName;
  const partners = gitCouplingIndex.value.get(fullName) || [];
  
  return partners
    .filter(p => p.incomingPercentage >= gitThreshold.value && p.sharedCommits >= minSharedCommits.value)
    .map(p => {
      const partnerNode = rootNodes.value.get(p.partnerName);
      return {
        node: partnerNode,
        name: p.partnerName,
        sharedCommits: p.sharedCommits,
        percentage: p.incomingPercentage
      };
    })
    .filter(p => p.node)
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));
});

const activeComponentCommits = computed(() => {
  if (!activeCompData.value) return 0;
  const key = store.getDistinctComponentColumns.find(c => c.toLowerCase().includes("commits__total") || c.toLowerCase().includes("commits") || c.toLowerCase().includes("churn")) || "";
  return key ? getMetric(activeCompData.value, key) : 0;
});

const activeComponentGitPartners = computed(() => {
  const uniquePartners = new Set([
    ...activeGitOutgoing.value.map(p => p.name),
    ...activeGitIncoming.value.map(p => p.name)
  ]);
  return uniquePartners.size;
});

const activeComponentMaxCoupling = computed(() => {
  const pcts = [
    ...activeGitOutgoing.value.map(p => p.percentage),
    ...activeGitIncoming.value.map(p => p.percentage)
  ];
  return pcts.length > 0 ? Math.max(...pcts) : 0;
});

function triggerChartRerender() {
  selectedNode.value = null;
  renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value));
}

// Watch layout state triggers to rebuild chart dynamically
watch([couplingMode, gitThreshold, minSharedCommits], () => {
  triggerChartRerender();
});

// Computes the active component taking hover precedence, falling back to selection
const activeComponent = computed(() => hoveredNode.value || selectedNode.value);
const activeCompData = computed(() => activeComponent.value?.data.component);

// Computes unique outbound dependencies (Ce) with aggregated weight counts
const activeOutgoing = computed(() => {
  if (!activeComponent.value) return [];
  const map = new Map<string, { node: any, count: number }>();
  for (const [from, to] of activeComponent.value.outgoing) {
    const fullName = to.data.fullName;
    const conn = activeComponent.value.data.component.connections.find(
      (c: any) => c.type === "OUTGOING" && c.to.name === fullName
    );
    const weight = conn ? conn.count : 1;
    if (map.has(fullName)) {
      map.get(fullName)!.count += weight;
    } else {
      map.set(fullName, { node: to, count: weight });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.node.data.fullName.localeCompare(b.node.data.fullName));
});

// Computes unique inbound dependents (Ca) with aggregated weight counts
const activeIncoming = computed(() => {
  if (!activeComponent.value) return [];
  const map = new Map<string, { node: any, count: number }>();
  for (const [from, to] of activeComponent.value.incoming) {
    const fullName = from.data.fullName;
    const conn = activeComponent.value.data.component.connections.find(
      (c: any) => c.type === "INCOMING" && c.from.name === fullName
    );
    const weight = conn ? conn.count : 1;
    if (map.has(fullName)) {
      map.get(fullName)!.count += weight;
    } else {
      map.set(fullName, { node: from, count: weight });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.node.data.fullName.localeCompare(b.node.data.fullName));
});

function selectNodeByFullName(fullName: string) {
  if (!rootNodeLeaves.value) return;
  const matchedNode = rootNodeLeaves.value.find(d => d && d.data && d.data.fullName === fullName);
  if (matchedNode) {
    selectedNode.value = matchedNode;
    hoveredSidebarItem.value = null; // Clear list hover when clicked
    isSidebarOpen.value = true;
    activeTab.value = 'inspector';
    updateHighlight();
  }
}

// Compute total unique connections across components
const totalConnections = computed(() => {
  return props.components.reduce((acc, comp) => {
    return acc + comp.connections.filter(c => c.type === "OUTGOING").length;
  }, 0);
});

// Martin's Instability Metric: Ce / (Ca + Ce)
function calculateInstability(ca: number, ce: number): number {
  return ca + ce > 0 ? ce / (ca + ce) : 0;
}

// Retrieves component metadata stat metrics securely
const getMetric = (comp: Component | undefined, keyName: string): number => {
  if (!comp) return 0
  const val = comp[keyName] ?? 
              comp[keyName.toLowerCase()] ?? 
              comp[store.statName(keyName)] ?? 
              comp[store.statName(keyName.toLowerCase())]
  return Number(val) || 0
}

watch(() => orderedComponents.value, () => {
  selectedNode.value = null
  renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value))
}, { deep: true })

watch(maxComponentsToShow, () => {
  selectedNode.value = null
  renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value))
})

// Highlight nodes and links dynamically based on query
watch(searchQuery, () => {
  drawCanvas();
});

// Dynamically detect delimiter based on separator occurrences
function detectDelimiter(names: string[]): string {
  let dots = 0, slashes = 0, backslashes = 0;
  for (const name of names) {
    dots += (name.split('.').length - 1);
    slashes += (name.split('/').length - 1);
    backslashes += (name.split('\\').length - 1);
  }
  if (backslashes > dots && backslashes > slashes) return "\\";
  if (slashes > dots && slashes > backslashes) return "/";
  return ".";
}

// Find the longest common parent namespace path among all component names
function findCommonParent(names: string[], delimiter: string): string {
  if (names.length <= 1) return "";

  const splitted = names.map(name => name.split(delimiter));
  const minLength = Math.min(...splitted.map(parts => parts.length));
  
  let commonPartsCount = 0;
  for (let i = 0; i < minLength; i++) {
    const part = splitted[0][i];
    const isCommon = splitted.every(parts => parts[i] === part);
    if (isCommon) {
      commonPartsCount++;
    } else {
      break;
    }
  }

  // To prevent stripping a component's entire name, 
  // the prefix parts count must be strictly less than the minimum length of any name.
  if (commonPartsCount >= minLength) {
    commonPartsCount = minLength - 1;
  }

  if (commonPartsCount <= 0) return "";
  
  return splitted[0].slice(0, commonPartsCount).join(delimiter) + delimiter;
}

// Build namespace package hierarchy
function buildHierarchy(components: Component[], delimiter: string) {
  const map: Record<string, any> = {};

  function findOrCreate(name: string): any {
    if (map[name]) return map[name];
    
    const idx = name.lastIndexOf(delimiter);
    if (idx === -1) {
      const node = { name, children: [] as any[] };
      map[name] = node;
      return node;
    }
    
    const parentName = name.substring(0, idx);
    const parent = findOrCreate(parentName);
    const shortName = name.substring(idx + 1);
    const node = { name: shortName, children: [] as any[] };
    parent.children.push(node);
    map[name] = node;
    return node;
  }

  const root = { name: "root", children: [] as any[] };
  
  components.forEach(comp => {
    const parentNode = findOrCreate(comp.name);
    const idx = comp.name.lastIndexOf(delimiter);
    const shortName = idx !== -1 ? comp.name.substring(idx + 1) : comp.name;
    
    parentNode.children.push({
      name: shortName,
      fullName: comp.name,
      component: comp,
      children: null // Leaf node
    });
  });

  // Attach top-level nodes to root
  for (const name in map) {
    const idx = name.lastIndexOf(delimiter);
    if (idx === -1) {
      root.children.push(map[name]);
    }
  }

  return root;
}

// Wires up incoming and outgoing connections directly on hierarchy leaf nodes
function bilink(root: any) {
  const map = new Map(root.leaves().map((d: any) => [d.data.fullName, d]));
  
  // Save root map for component lookups reactively
  rootNodes.value = map;

  for (const d of root.leaves()) {
    d.incoming = [];
    d.outgoing = [];
    d.gitIncoming = [];
    d.gitOutgoing = [];

    // 1. Static coupling connections
    const comp = d.data.component;
    if (comp && comp.connections) {
      const outgoingNames = comp.connections
        .filter((c: any) => c.type === "OUTGOING")
        .map((c: any) => c.to.name);
      
      d.outgoing = outgoingNames
        .map((name: string) => [d, map.get(name)])
        .filter((o: any) => o[1]);
    }

    // 2. Git coupling co-commits connections
    const fullName = d.data.fullName;
    const gitPartners = gitCouplingIndex.value.get(fullName) || [];
    
    for (const partner of gitPartners) {
      const partnerNode = map.get(partner.partnerName);
      if (!partnerNode) continue;

      if (partner.sharedCommits >= minSharedCommits.value) {
        if (partner.outgoingPercentage >= gitThreshold.value) {
          d.gitOutgoing.push([d, partnerNode, partner]);
        }
        if (partner.incomingPercentage >= gitThreshold.value) {
          d.gitIncoming.push([partnerNode, d, partner]);
        }
      }
    }
  }

  // Wire up incoming static connections
  for (const d of root.leaves()) {
    for (const o of d.outgoing) {
      o[1].incoming.push(o);
    }
  }

  return root;
}

// External Zoom handles
const zoomBehavior = ref<any>(null);
const currentTransform = ref(d3.zoomIdentity);

function zoomIn() {
  const canvas = canvasRef.value;
  if (canvas && zoomBehavior.value) {
    d3.select(canvas).transition().duration(250).call(zoomBehavior.value.scaleBy, 1.3);
  }
}

function zoomOut() {
  const canvas = canvasRef.value;
  if (canvas && zoomBehavior.value) {
    d3.select(canvas).transition().duration(250).call(zoomBehavior.value.scaleBy, 0.7);
  }
}

function resetZoom() {
  const canvas = canvasRef.value;
  if (canvas && zoomBehavior.value) {
    d3.select(canvas).transition().duration(250).call(zoomBehavior.value.transform, d3.zoomIdentity);
  }
}

// Shared highlight orchestration
function updateHighlight() {
  drawCanvas();
}

function renderChart(connectedComponents: Component[]) {
  if (connectedComponents.length === 0) {
    rootNodeLeaves.value = [];
    drawCanvas();
    return;
  }

  const width = 954;
  const radius = width / 2 - 180; // Leaves plenty of space on edges for full package names

  // Set up hierarchy and D3 cluster layout
  const delimiter = detectDelimiter(connectedComponents.map(c => c.name));
  commonParentPrefix.value = findCommonParent(connectedComponents.map(c => c.name), delimiter);
  const hierarchyData = buildHierarchy(connectedComponents, delimiter);
  
  const tree = d3.cluster()
    .size([2 * Math.PI, radius]);
    
  const root = tree(bilink(d3.hierarchy(hierarchyData)
    .sort((a, b) => (a.height - b.height) || a.data.name.localeCompare(b.data.name))));

  // Precompute coordinate objects for hit testing
  for (const d of root.leaves()) {
    d.coords = {
      x: d.y * Math.sin(d.x),
      y: -d.y * Math.cos(d.x)
    };
  }

  rootNodeLeaves.value = root.leaves();

  // Draw canvas with new layout
  drawCanvas();
}

// Drawing function
function drawCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (rootNodeLeaves.value.length === 0) {
    ctx.save();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No components available to display.", rect.width / 2, rect.height / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  // Scale for high DPI
  ctx.scale(dpr, dpr);

  // Center coordinate system
  ctx.translate(rect.width / 2, rect.height / 2);

  // Apply D3 zoom transform
  ctx.translate(currentTransform.value.x, currentTransform.value.y);
  ctx.scale(currentTransform.value.k, currentTransform.value.k);

  // Define drawing colors
  const colornone = '#e2e8f0';
  const colorgitnone = '#ddd6fe';
  const colorout = "#f43f5e";
  const colorin = "#0ea5e9";

  const active = hoveredNode.value || selectedNode.value;
  const query = searchQuery.value.trim().toLowerCase();
  const sidebarNode = hoveredSidebarItem.value;

  // Build helper sets if active node is selected/hovered
  let activeIncomingSet = new Set<any>();
  let activeOutgoingSet = new Set<any>();
  let activeGitIncomingSet = new Set<any>();
  let activeGitOutgoingSet = new Set<any>();
  let isSidebarIncoming = false;
  let isSidebarOutgoing = false;

  if (active) {
    activeIncomingSet = new Set(active.incoming.map(([from]: any) => from));
    activeOutgoingSet = new Set(active.outgoing.map(([, to]: any) => to));
    activeGitIncomingSet = new Set(active.gitIncoming.map(([from]: any) => from));
    activeGitOutgoingSet = new Set(active.gitOutgoing.map(([, to]: any) => to));

    if (sidebarNode) {
      const isStaticIncoming = activeIncomingSet.has(sidebarNode);
      const isGitIncoming = activeGitIncomingSet.has(sidebarNode);
      isSidebarIncoming = isStaticIncoming || isGitIncoming;
      const isStaticOutgoing = activeOutgoingSet.has(sidebarNode);
      const isGitOutgoing = activeGitOutgoingSet.has(sidebarNode);
      isSidebarOutgoing = isStaticOutgoing || isGitOutgoing;
    }
  }

  // Create radial line generator
  const line = d3.lineRadial<any>()
    .curve(d3.curveBundle.beta(0.85))
    .radius(d => d.y)
    .angle(d => d.x)
    .context(ctx);

  const allStaticConnections = rootNodeLeaves.value.flatMap(leaf => leaf.outgoing);
  const allGitConnections = rootNodeLeaves.value.flatMap(leaf => leaf.gitOutgoing);

  // Helper functions for path styling
  function getStaticConnectionHighlight(from: any, to: any): { isHighlighted: boolean; color: string; width: number; opacity: number } {
    if (!active) {
      if (query) {
        const fromMatch = from.data.fullName.toLowerCase().includes(query);
        const toMatch = to.data.fullName.toLowerCase().includes(query);
        return {
          isHighlighted: fromMatch || toMatch,
          color: colornone,
          width: 0.75,
          opacity: fromMatch || toMatch ? 0.8 : 0.05
        };
      }
      return { isHighlighted: false, color: colornone, width: 0.75, opacity: 0.45 };
    }

    if (sidebarNode) {
      if ((from === active && to === sidebarNode) || (from === sidebarNode && to === active)) {
        return {
          isHighlighted: true,
          color: from === sidebarNode ? colorin : colorout,
          width: 2.8,
          opacity: 1.0
        };
      }
      return { isHighlighted: false, color: colornone, width: 0.5, opacity: 0.01 };
    }

    if (from === active && (couplingMode.value === "static" || couplingMode.value === "both")) {
      return { isHighlighted: true, color: colorout, width: 1.8, opacity: 1.0 };
    }
    if (to === active && (couplingMode.value === "static" || couplingMode.value === "both")) {
      return { isHighlighted: true, color: colorin, width: 1.8, opacity: 1.0 };
    }
    
    return { isHighlighted: false, color: colornone, width: 0.5, opacity: 0.03 };
  }

  function getGitConnectionHighlight(from: any, to: any): { isHighlighted: boolean; color: string; width: number; opacity: number } {
    if (!active) {
      if (query) {
        const fromMatch = from.data.fullName.toLowerCase().includes(query);
        const toMatch = to.data.fullName.toLowerCase().includes(query);
        return {
          isHighlighted: fromMatch || toMatch,
          color: colorgitnone,
          width: 0.8,
          opacity: fromMatch || toMatch ? 0.8 : 0.05
        };
      }
      return { isHighlighted: false, color: colorgitnone, width: 0.8, opacity: 0.55 };
    }

    if (sidebarNode) {
      if ((from === active && to === sidebarNode) || (from === sidebarNode && to === active)) {
        return {
          isHighlighted: true,
          color: from === sidebarNode ? colorin : colorout,
          width: 2.8,
          opacity: 1.0
        };
      }
      return { isHighlighted: false, color: colorgitnone, width: 0.5, opacity: 0.01 };
    }

    if (from === active && (couplingMode.value === "git" || couplingMode.value === "both")) {
      return { isHighlighted: true, color: colorout, width: 2.0, opacity: 1.0 };
    }
    if (to === active && (couplingMode.value === "git" || couplingMode.value === "both")) {
      return { isHighlighted: true, color: colorin, width: 2.0, opacity: 1.0 };
    }
    
    return { isHighlighted: false, color: colorgitnone, width: 0.5, opacity: 0.03 };
  }

  // Draw static connections
  if (couplingMode.value === "static" || couplingMode.value === "both") {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Dimmed static lines
    for (const [from, to] of allStaticConnections) {
      const hl = getStaticConnectionHighlight(from, to);
      if (!hl.isHighlighted) {
        ctx.strokeStyle = hl.color;
        ctx.lineWidth = hl.width;
        ctx.globalAlpha = hl.opacity;
        ctx.beginPath();
        line(from.path(to));
        ctx.stroke();
      }
    }

    // Highlighted static lines
    for (const [from, to] of allStaticConnections) {
      const hl = getStaticConnectionHighlight(from, to);
      if (hl.isHighlighted) {
        ctx.strokeStyle = hl.color;
        ctx.lineWidth = hl.width;
        ctx.globalAlpha = hl.opacity;
        ctx.beginPath();
        line(from.path(to));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draw git connections
  if (couplingMode.value === "git" || couplingMode.value === "both") {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Dimmed git lines
    for (const [from, to] of allGitConnections) {
      const hl = getGitConnectionHighlight(from, to);
      if (!hl.isHighlighted) {
        ctx.strokeStyle = hl.color;
        ctx.lineWidth = hl.width;
        ctx.globalAlpha = hl.opacity;
        ctx.beginPath();
        line(from.path(to));
        ctx.stroke();
      }
    }

    // Highlighted git lines
    for (const [from, to] of allGitConnections) {
      const hl = getGitConnectionHighlight(from, to);
      if (hl.isHighlighted) {
        ctx.strokeStyle = hl.color;
        ctx.lineWidth = hl.width;
        ctx.globalAlpha = hl.opacity;
        ctx.beginPath();
        line(from.path(to));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draw group color outer arcs
  ctx.save();
  for (const d of rootNodeLeaves.value) {
    const groups = groupsStore.componentGroupIndex.get(d.data.fullName) || []
    if (groups.length > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(0, 0, d.y + 4, d.x - 0.012, d.x + 0.012)
      ctx.strokeStyle = groups[0].color
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.restore();

  // Draw text labels
  ctx.save();
  for (const d of rootNodeLeaves.value) {
    let fill = "#64748b";
    let font = "500 7.5px system-ui, -apple-system, sans-serif";
    let opacity = 1.0;

    if (!active) {
      if (query) {
        const match = d.data.fullName.toLowerCase().includes(query);
        fill = match ? "#0f172a" : "#64748b";
        font = match ? "bold 7.5px system-ui, -apple-system, sans-serif" : "500 7.5px system-ui, -apple-system, sans-serif";
        opacity = match ? 1.0 : 0.15;
      }
    } else {
      if (sidebarNode) {
        if (d === active) {
          fill = "#0f172a";
          font = "bold 10px system-ui, -apple-system, sans-serif";
          opacity = 1.0;
        } else if (d === sidebarNode) {
          fill = isSidebarIncoming ? colorin : (isSidebarOutgoing ? colorout : "#64748b");
          font = "bold 7.5px system-ui, -apple-system, sans-serif";
          opacity = 1.0;
        } else {
          opacity = 0.05;
        }
      } else {
        if (d === active) {
          fill = "#0f172a";
          font = "bold 10px system-ui, -apple-system, sans-serif";
          opacity = 1.0;
        } else {
          let isPartner = false;
          let partnerColor = "";
          
          if (couplingMode.value === "static" || couplingMode.value === "both") {
            if (activeIncomingSet.has(d)) {
              isPartner = true;
              partnerColor = colorin;
            } else if (activeOutgoingSet.has(d)) {
              isPartner = true;
              partnerColor = colorout;
            }
          }
          if (couplingMode.value === "git" || couplingMode.value === "both") {
            if (activeGitIncomingSet.has(d)) {
              isPartner = true;
              partnerColor = colorin;
            } else if (activeGitOutgoingSet.has(d)) {
              isPartner = true;
              partnerColor = colorout;
            }
          }

          if (isPartner) {
            fill = partnerColor;
            font = "bold 7.5px system-ui, -apple-system, sans-serif";
            opacity = 1.0;
          } else {
            opacity = 0.15;
          }
        }
      }
    }

    ctx.save();
    ctx.fillStyle = fill;
    ctx.font = font;
    ctx.globalAlpha = opacity;
    
    // Rotate and translate to node location
    ctx.rotate(d.x - Math.PI / 2);
    ctx.translate(d.y, 0);

    let xOffset = 6;
    if (d.x >= Math.PI) {
      ctx.rotate(Math.PI);
      ctx.textAlign = "end";
      xOffset = -6;
    } else {
      ctx.textAlign = "start";
    }

    ctx.textBaseline = "middle";
    const displayName = commonParentPrefix.value 
      ? d.data.fullName.substring(commonParentPrefix.value.length) 
      : d.data.fullName;
    ctx.fillText(displayName, xOffset, 0);
    ctx.restore();
  }
  ctx.restore();

  ctx.restore();
}

// Hit testing helper
function findClosestNode(lx: number, ly: number, leaves: any[]): any {
  const r = Math.hypot(lx, ly);
  // Outer text bounds check (radius is ~297, package name text adds length)
  if (r < 180 || r > 480) return null;

  let mouseAngle = Math.atan2(ly, lx) + Math.PI / 2;
  if (mouseAngle < 0) mouseAngle += 2 * Math.PI;

  let bestNode = null;
  let minDistance = Infinity;

  for (const d of leaves) {
    let diff = Math.abs(mouseAngle - d.x);
    diff = Math.min(diff, 2 * Math.PI - diff);
    
    const d_ray = r * Math.sin(diff);
    if (d_ray < 12) {
      if (d_ray < minDistance) {
        minDistance = d_ray;
        bestNode = d;
      }
    }
  }
  return bestNode;
}

// Canvas Mouse Interactions
function handleMouseMove(event: MouseEvent) {
  const canvas = canvasRef.value;
  if (!canvas || rootNodeLeaves.value.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  const lx = (mx - currentTransform.value.x - rect.width / 2) / currentTransform.value.k;
  const ly = (my - currentTransform.value.y - rect.height / 2) / currentTransform.value.k;

  const closest = findClosestNode(lx, ly, rootNodeLeaves.value);
  if (closest !== hoveredNode.value) {
    hoveredNode.value = closest;
    updateHighlight();
  }
}

function handleMouseLeave() {
  if (hoveredNode.value !== null) {
    hoveredNode.value = null;
    updateHighlight();
  }
}

function handleCanvasClick(event: MouseEvent) {
  const canvas = canvasRef.value;
  if (!canvas || rootNodeLeaves.value.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  const lx = (mx - currentTransform.value.x - rect.width / 2) / currentTransform.value.k;
  const ly = (my - currentTransform.value.y - rect.height / 2) / currentTransform.value.k;

  const closest = findClosestNode(lx, ly, rootNodeLeaves.value);
  if (closest) {
    event.stopPropagation();
    if (selectedNode.value === closest) {
      selectedNode.value = null;
    } else {
      selectedNode.value = closest;
      hoveredSidebarItem.value = null; // Clear list hover when clicked
      isSidebarOpen.value = true;
      activeTab.value = 'inspector';
    }
  } else {
    // Clicked background, reset selection
    selectedNode.value = null;
  }
  updateHighlight();
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  try {
    const canvas = canvasRef.value;
    if (canvas) {
      zoomBehavior.value = d3.zoom()
        .scaleExtent([0.5, 5])
        .on("zoom", (event) => {
          currentTransform.value = event.transform;
          drawCanvas();
        });
      d3.select(canvas).call(zoomBehavior.value);
    }

    if (chart.value) {
      resizeObserver = new ResizeObserver(() => {
        const container = chart.value;
        const canvas = canvasRef.value;
        if (!container || !canvas) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value));
      });
      resizeObserver.observe(chart.value);
    }
  } catch (e) {
    console.error(e)
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

function resizedComponents(components: Component[], max: number): Component[] {
  return resizeConnectionsOnComponents(components.slice(0, max))
}
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
