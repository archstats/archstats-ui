<template>
  <div class="flex flex-col gap-6">
    <div v-if="component" class="flex flex-col gap-6 animate-fade-in">
      
      <!-- PAGE HEADER DESCRIPTION -->
      <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Analysis</div>
        <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>Circle of Influence</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono">
            Concentric Map
          </span>
        </h2>
        <p class="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Visualizes indirect coupling paths branching out from this component. Each ring represents a graph path hop distance. Hover over nodes to trace short-path dependencies.
        </p>
      </section>

      <!-- VISUALIZER CARD & CONTROLS -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        <!-- LEFT: Concentric Diagram Card (2/3 width) -->
        <div class="lg:col-span-2 bg-white border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-6 items-center">
          
          <!-- Controls bar -->
          <div class="w-full flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 select-none">
            <div class="flex flex-col gap-1">
              <h3 class="text-xs font-black uppercase tracking-widest text-slate-400">Influence Map</h3>
              <span class="text-[10px] text-slate-400 font-medium">Click and drag inside diagram to zoom or pan. Hover over nodes to trace paths.</span>
            </div>

            <!-- Action buttons stack -->
            <div class="flex flex-wrap items-center gap-4">
              <!-- Direction Toggle -->
              <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span>Direction:</span>
                <div class="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                  <button 
                    @click="direction = 'from'"
                    class="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                    :class="direction === 'from' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
                  >
                    Outgoing (Dependencies)
                  </button>
                  <button 
                    @click="direction = 'to'"
                    class="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                    :class="direction === 'to' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
                  >
                    Incoming (Dependents)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Cousins diagram component -->
          <div class="w-full flex justify-center bg-slate-50/20 border border-slate-100/50 rounded-2xl p-4 shadow-3xs overflow-hidden">
            <CousinsDiagram 
              :component="component" 
              color-scale="graph__betweenness" 
              :all-components="components" 
              :all-paths="connections" 
              :direction="direction" 
              :max-hops="maxHops"
              @update:maxHops="h => maxHops = h"
              @select-node="onNodeSelected"
              @hover-node="onNodeHovered"
              class="max-w-full"
            />
          </div>
        </div>

        <!-- RIGHT: Sidebar Inspector Panel (1/3 width) -->
        <div class="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-6 select-none justify-start">
          
          <!-- Active Node details -->
          <div v-if="activeNode" class="flex flex-col gap-5 h-full animate-fade-in w-full">
            <div class="flex flex-col gap-1 pb-4 border-b border-slate-100">
              <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">
                {{ hoveredNode ? 'Hovered Component' : 'Selected Component' }}
              </span>
              <h3 class="text-sm font-black text-indigo-600 truncate mt-1">
                {{ store.getComponentName(activeNode.name) }}
              </h3>
              <span class="text-[9px] font-mono text-slate-450 break-all select-all">{{ activeNode.name }}</span>
            </div>

            <!-- Path Distance KPI -->
            <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-[8px] text-slate-400 font-black uppercase tracking-wider">Coupling Distance</span>
                <span class="text-base font-black text-slate-900 font-mono mt-0.5">
                  {{ activeNode.pathLength }} {{ activeNode.pathLength === 1 ? 'Hop' : 'Hops' }}
                </span>
              </div>
              <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-150 text-indigo-700">
                {{ direction === 'from' ? 'Dependency' : 'Dependent' }}
              </span>
            </div>

            <!-- Shortest Path Trace (Vertical steps list) -->
            <div class="flex flex-col gap-2.5">
              <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Shortest Connection Path
              </span>
              <div class="flex flex-col gap-1.5 font-mono text-[10px]">
                <div 
                  v-for="(step, idx) in pathSteps" 
                  :key="idx"
                  class="flex items-center gap-2"
                >
                  <span class="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px]"
                    :class="idx === 0 
                      ? 'bg-indigo-600 text-white font-extrabold' 
                      : (idx === pathSteps.length - 1 ? 'bg-rose-500 text-white font-extrabold' : 'bg-slate-200 text-slate-700')"
                  >
                    {{ idx + 1 }}
                  </span>
                  <span class="text-slate-700 truncate font-semibold max-w-[90%]" :title="step">
                    {{ store.getComponentName(step) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Node Metrics -->
            <div class="flex flex-col gap-2.5 pt-4 border-t border-slate-100">
              <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Component Metrics
              </span>
              <div class="grid grid-cols-2 gap-3 text-xs font-semibold">
                <div class="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-400 uppercase tracking-wider">Code Health</span>
                  <span class="text-sm font-black text-slate-800 font-mono">
                    {{ formatValue(getNodeMetric('codesmells__code_health'), 1) }}/10
                  </span>
                </div>
                <div class="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-400 uppercase tracking-wider">Hotspot Score</span>
                  <span class="text-sm font-black text-slate-800 font-mono">
                    {{ formatValue(getNodeMetric('codesmells__hotspot_score'), 3) }}
                  </span>
                </div>
                <div class="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-400 uppercase tracking-wider">Lines of Code</span>
                  <span class="text-sm font-black text-slate-800 font-mono">
                    {{ Math.round(getNodeMetric('complexity__lines')).toLocaleString() }}
                  </span>
                </div>
                <div class="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl flex flex-col gap-0.5">
                  <span class="text-[8px] text-slate-400 uppercase tracking-wider">Betweenness</span>
                  <span class="text-sm font-black text-slate-800 font-mono">
                    {{ formatValue(getNodeMetric('graph__betweenness'), 1) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Navigation Button -->
            <button 
              @click="navigateToSelectedComponent(activeNode.name)"
              class="w-full mt-4 bg-slate-900 hover:bg-indigo-650 text-white font-extrabold text-xs py-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <span>Go to Component Details</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>

          <!-- Empty state -->
          <div v-else class="h-full w-full flex flex-col items-center justify-center text-center p-6 gap-3 py-16">
            <span class="p-3 bg-indigo-50 text-indigo-500 rounded-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 21l8.904-4.452L21 18.016V6.75A2.25 2.25 0 0 0 18.75 4.5H5.25A2.25 2.25 0 0 0 3 6.75v11.266l6.813-2.112Z" />
              </svg>
            </span>
            <h3 class="text-xs font-bold text-slate-800">Influence Inspector</h3>
            <p class="text-[10px] text-slate-400 leading-relaxed max-w-[200px]">
              Hover or click on nodes to trace paths. Click a concentric dashed ring to focus the radar on that hop level. Click the background to reset.
            </p>
          </div>

        </div>

      </div>

    </div>

    <div v-else class="text-center py-12 text-slate-400 font-medium italic">
      Component data is loading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import CousinsDiagram from "~/components/components/cousins/CousinsDiagram.vue"

const route = useRoute()
const router = useRouter()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find(c => c.name === nameInRoute.value)!)

const components = computed(() => store.allComponents)

const direction = ref<'from' | 'to'>('from')
const maxHops = ref(999)

const selectedNode = ref<any | null>(null)
const hoveredNode = ref<any | null>(null)

const activeNode = computed(() => {
  return hoveredNode.value || selectedNode.value
})

const pathSteps = computed(() => {
  if (!activeNode.value || !activeNode.value.pathTrace) return []
  const steps = activeNode.value.pathTrace.split("->").map((s: string) => s.trim())
  if (direction.value === 'from') {
    steps.reverse()
  }
  return steps
})

const connections = computed(() => {
  if (!store.hasData) return []
  return store.query(
    `select * from component_connections_indirect where "from" = '${nameInRoute.value}' or "to" = '${nameInRoute.value}'`
  )
})

// Reset zoom selection when direction of influence swaps
watch(direction, () => {
  maxHops.value = 999
})

// Reset zoom selection when direction of influence swaps
watch(direction, () => {
  maxHops.value = 999
})

function onNodeSelected(node: any | null) {
  selectedNode.value = node
}

function onNodeHovered(node: any | null) {
  hoveredNode.value = node
}

const getNodeMetric = (keyName: string): number => {
  if (!activeNode.value || !activeNode.value.component) return 0
  const comp = activeNode.value.component
  const val = comp[keyName] ?? 
              comp[keyName.toLowerCase()] ?? 
              comp[store.statName(keyName)] ?? 
              comp[store.statName(keyName.toLowerCase())]
  return Number(val) || 0
}

const formatValue = (val: number, decimals: number): string => {
  if (val === undefined || val === null || isNaN(val)) return "0"
  return val.toFixed(decimals)
}

function navigateToSelectedComponent(compName: string) {
  router.push(`/views/components/${encodeURIComponent(compName)}/circle-of-influence`)
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
