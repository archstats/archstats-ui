<template>
  <div class="flex flex-col gap-4 w-full h-full min-h-0">
    
    <!-- 🎛️ UNIFIED HEADER TOOLBAR -->
    <header class="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-3xs flex flex-wrap items-center justify-between gap-4 select-none shrink-0">
      
      <!-- Title & KPI Stats -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <slot name="title">{{ title }}</slot>
            <span 
              v-if="badgeText" 
              class="px-1.5 py-0.5 rounded-xs text-[8px] font-extrabold tracking-wider uppercase border"
              :class="badgeColorClass || 'bg-slate-100 text-slate-700 border-slate-200'"
            >
              {{ badgeText }}
            </span>
          </h2>
        </div>
        <div class="text-[9px] font-bold text-slate-400 flex items-center flex-wrap gap-1.5">
          <span v-if="nodesCount !== undefined">
            {{ statsLabels.nodes || 'Nodes' }}: 
            <strong class="text-slate-600 font-bold">{{ nodesCount }}</strong>
          </span>
          <span v-if="nodesCount !== undefined && connectionsCount !== undefined" class="text-slate-300">•</span>
          <span v-if="connectionsCount !== undefined">
            {{ statsLabels.connections || 'Connections' }}: 
            <strong class="text-slate-600 font-bold">{{ connectionsCount }}</strong>
          </span>
          <slot name="stats"></slot>
        </div>
      </div>

      <!-- Toolbar Actions -->
      <div class="flex items-center gap-3">
        <!-- Search filter -->
        <div v-if="searchQuery !== undefined" class="relative flex items-center">
          <input 
            :value="searchQuery" 
            @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            type="text" 
            placeholder="Search components..." 
            class="bg-white border border-slate-200 focus:border-slate-350 text-[10px] font-semibold pl-7 pr-3 py-1.5 rounded-xl outline-hidden text-slate-700 placeholder-slate-400 transition-all shadow-3xs w-44 md:w-56"
          />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
          <button 
            v-if="searchQuery"
            @click="$emit('update:searchQuery', '')"
            class="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
          >
            ×
          </button>
        </div>

        <!-- Extra Action Controls Slot -->
        <slot name="actions"></slot>

        <!-- Configure popover trigger -->
        <div v-if="showConfig" class="relative">
          <button 
            @click="showConfigPopover = !showConfigPopover"
            class="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl transition-all cursor-pointer shadow-3xs active:scale-95 z-50 relative"
          >
            <span>⚙</span>
            <span>Configure</span>
            <span class="text-[7px] text-slate-400">{{ showConfigPopover ? '▲' : '▼' }}</span>
          </button>
          
          <!-- Transparent backdrop overlay to capture outside clicks -->
          <div v-if="showConfigPopover" class="fixed inset-0 z-40 cursor-default" @click="showConfigPopover = false"></div>

          <!-- POPOVER DROPDOWN MENU -->
          <div 
            v-if="showConfigPopover" 
            class="absolute right-0 mt-2 w-64 md:w-80 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xl z-50 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Configuration Settings</span>
              <button @click="showConfigPopover = false" class="text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors cursor-pointer">✕</button>
            </div>
            
            <slot name="config-popover" :close="() => showConfigPopover = false"></slot>
          </div>
        </div>

        <!-- Toggle Sidebar button -->
        <button 
          v-if="tabs && tabs.length > 0"
          @click="$emit('update:isSidebarOpen', !isSidebarOpen)"
          class="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-all cursor-pointer shadow-3xs active:scale-95"
          :class="{ 'bg-slate-50 border-slate-350 text-slate-800': isSidebarOpen }"
          :title="isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25V18M9 8.25V18m0-9.75h9.75A2.25 2.25 0 0 1 21 10.5v7.5A2.25 2.25 0 0 1 18.75 20.25H9" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 🌐 MAIN APPLICATION WORKSPACE -->
    <div class="flex grow relative overflow-hidden bg-slate-50 border border-slate-200/60 rounded-3xl shadow-3xs">
      
      <!-- LEFT WORKSPACE: Main Visualizer -->
      <div class="grow h-full flex flex-col justify-center items-center relative transition-all duration-300 ease-in-out p-4 min-w-0">
        <slot name="visualizer"></slot>
        
        <!-- Overlays (e.g. Floating zoom, context actions bar, help panels) -->
        <slot name="visualizer-overlays"></slot>
      </div>

      <!-- RIGHT DRAWER: Dynamic Collapsible Tabbed Sidebar -->
      <aside 
        v-if="tabs && tabs.length > 0"
        class="h-full border-l border-slate-200 bg-white transition-all duration-300 ease-in-out flex flex-col overflow-hidden z-20 shrink-0"
        :style="{ width: isSidebarOpen ? sidebarWidth : '0px', opacity: isSidebarOpen ? 1 : 0, minWidth: isSidebarOpen ? sidebarWidth : '0px' }"
      >
        <!-- Tab Selectors -->
        <div v-if="tabs.length > 1" class="flex border-b border-slate-100 bg-slate-50/50 p-2 shrink-0 gap-1 select-none">
          <button 
            v-for="tab in tabs"
            :key="tab.id"
            @click="$emit('update:activeTab', tab.id)"
            class="flex-1 text-[10px] font-extrabold py-2 px-3 rounded-lg capitalize tracking-wider transition-all cursor-pointer text-center"
            :class="activeTab === tab.id 
              ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/20' 
              : 'text-slate-500 hover:text-slate-700'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Sidebar Body Scroll area -->
        <div class="grow overflow-y-auto p-5 flex flex-col gap-5 scroll-container">
          <div v-for="tab in tabs" :key="'body-' + tab.id" v-show="activeTab === tab.id">
            <slot :name="`tab-${tab.id}`"></slot>
          </div>
        </div>
      </aside>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  badgeText?: string
  badgeColorClass?: string
  nodesCount?: number
  connectionsCount?: number
  statsLabels?: { nodes?: string; connections?: string }
  searchQuery?: string
  isSidebarOpen?: boolean
  activeTab?: string
  tabs?: Array<{ id: string; label: string }>
  showConfig?: boolean
  sidebarWidth?: string
}>(), {
  title: '',
  badgeText: '',
  badgeColorClass: '',
  statsLabels: () => ({ nodes: 'Nodes', connections: 'Connections' }),
  searchQuery: undefined,
  isSidebarOpen: true,
  activeTab: '',
  tabs: () => [],
  showConfig: false,
  sidebarWidth: '360px'
})

defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'update:isSidebarOpen', val: boolean): void
  (e: 'update:activeTab', val: string): void
}>()

const showConfigPopover = ref(false)
</script>

<style scoped>
/* Sleek custom scrollbar style inside drawer */
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
