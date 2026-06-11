<template>
  <div class="w-full flex flex-col gap-6 animate-fade-in">
    
    <!-- HEADER SECTION -->
    <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-2">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Structural Risk Analysis</div>
      <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
        <span>Component Dependency Cycles</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-rose-50 border border-rose-200 text-rose-700 font-mono">
          {{ cyclesIncludedIn.length }} Active Loops
        </span>
      </h2>
      <p class="text-xs text-slate-400 leading-relaxed max-w-2xl">
        Cyclic dependencies which this component participates in. Select a cycle loop to trace import links, perform weakest link diagnostics, and inspect co-changes.
      </p>
    </section>

    <!-- MAIN INTERACTIVE GRID -->
    <div class="flex flex-col lg:flex-row gap-6 w-full items-stretch">
      
      <!-- LEFT COLUMN: Cycles Selector Card -->
      <div class="w-full lg:w-[320px] shrink-0 bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col gap-4">
        
        <!-- Controls & Filters Header -->
        <div class="flex flex-col gap-3 pb-3 border-b border-slate-100">
          <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 select-none">
            Filter & Sort Cycles
          </span>
          
          <!-- Search input -->
          <div class="relative w-full">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m21-21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
              </svg>
            </span>
            <input
              type="text"
              v-model="searchQuery"
              placeholder="Search related modules..."
              class="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-700 font-semibold placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 focus:bg-white transition-all"
            />
          </div>

          <!-- Sorter options -->
          <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/30">
            <button 
              @click="sortBy = 'severity'"
              class="flex-1 text-center py-1 rounded text-[8.5px] font-black transition-all cursor-pointer"
              :class="sortBy === 'severity' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
            >
              Severity
            </button>
            <button 
              @click="sortBy = 'size'"
              class="flex-1 text-center py-1 rounded text-[8.5px] font-black transition-all cursor-pointer"
              :class="sortBy === 'size' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
            >
              Size
            </button>
            <button 
              @click="sortBy = 'sharedCommits'"
              class="flex-1 text-center py-1 rounded text-[8.5px] font-black transition-all cursor-pointer"
              :class="sortBy === 'sharedCommits' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
            >
              Co-change
            </button>
          </div>
        </div>

        <!-- Scrollable Button List -->
        <div class="flex flex-col gap-2 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
          <div v-if="paginatedCycles.length === 0" class="text-center py-12 text-slate-400 text-xs italic">
            No cyclic paths match the search filters.
          </div>
          
          <button
            v-for="cycle in paginatedCycles"
            :key="cycle.id"
            @click="selectCycle(cycle)"
            class="w-full text-left p-3.5 rounded-2xl border transition-all duration-150 flex flex-col gap-2 group cursor-pointer"
            :class="selectedCycleId === cycle.id 
              ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
              : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 text-slate-700'"
          >
            <!-- Severity/Index Header -->
            <div class="flex items-center justify-between w-full">
              <span class="text-[9px] font-mono font-bold" :class="selectedCycleId === cycle.id ? 'text-slate-400' : 'text-slate-400'">
                Cycle #{{ cycle.id }}
              </span>
              <span class="flex h-1.5 w-1.5 relative">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" :class="getSeverityDotColor(cycle.severity)"></span>
                <span class="relative inline-flex rounded-full h-1.5 w-1.5" :class="getSeverityDotColor(cycle.severity)"></span>
              </span>
            </div>

            <!-- Path summary text -->
            <div class="text-[10px] font-mono leading-relaxed" :class="selectedCycleId === cycle.id ? 'text-white' : 'text-slate-600'">
              {{ getCycleSummaryText(cycle.nodes) }}
            </div>

            <!-- Badges line -->
            <div class="flex items-center gap-1.5 border-t pt-2 mt-0.5" :class="selectedCycleId === cycle.id ? 'border-white/10' : 'border-slate-100'">
              <span class="text-[7.5px] px-1.5 py-0.5 rounded font-bold" :class="selectedCycleId === cycle.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'">
                {{ cycle.size }} nodes
              </span>
              <span class="text-[7.5px] px-1.5 py-0.5 rounded font-bold" :class="selectedCycleId === cycle.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'">
                {{ cycle.sharedCommits }} commits
              </span>
              <span class="ml-auto text-[8.5px] font-extrabold" :class="selectedCycleId === cycle.id ? 'text-slate-300' : 'text-slate-500'">
                Score: {{ cycle.severity }}
              </span>
            </div>
          </button>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 select-none">
          <button 
            @click="page = Math.max(1, page - 1)" 
            :disabled="page === 1"
            class="px-2 py-1 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Prev
          </button>
          <span class="text-[9px] text-slate-400 font-bold">
            {{ page }} / {{ totalPages }}
          </span>
          <button 
            @click="page = Math.min(totalPages, page + 1)" 
            :disabled="page === totalPages"
            class="px-2 py-1 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>

      </div>

      <!-- RIGHT COLUMN: Active Cycle Inspector Canvas -->
      <div class="flex-1 bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col gap-6 overflow-hidden">
        
        <div v-if="selectedCycle" class="w-full h-full flex flex-col gap-6 overflow-y-auto pr-1">
          <!-- circular force graph loop chart -->
          <div class="h-[400px] flex flex-col shrink-0">
            <CycleLoopChart 
              :cycle-text="selectedCycle.cycleText"
              :nodes="selectedCycle.nodes"
              :edges="selectedCycleEdges"
              :selected-edge="selectedEdge"
              @select-edge="onSelectEdge"
              class="flex-1"
            />
          </div>

          <!-- Loop Diagnostics & Weakest Link Analysis -->
          <div v-if="breakingPoint" class="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0 border-t border-slate-100 pt-6">
            
            <!-- Link Connection Path List -->
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-extrabold">Loop Connections</h4>
                <p class="text-[9.5px] text-slate-400 leading-snug">
                  Click a path in the circular graph or select from the list below to inspect references.
                </p>
                <div class="text-[9px] text-slate-500 border-t border-slate-50 pt-2 mt-1 font-semibold leading-relaxed">
                  💡 <span class="font-bold text-slate-700">Weakest Link:</span> 
                  The connection from <span class="font-mono font-bold text-slate-800">{{ getAbbreviatedName(breakingPoint.from) }}</span> to <span class="font-mono font-bold text-slate-800">{{ getAbbreviatedName(breakingPoint.to) }}</span> has the fewest code references ({{ breakingPoint.referenceCount }} imports).
                  <button 
                    @click="selectedEdge = { from: breakingPoint.from, to: breakingPoint.to }"
                    class="text-indigo-650 font-bold hover:underline cursor-pointer ml-1"
                  >
                    Inspect
                  </button>
                </div>
              </div>

              <!-- List of connections in active cycle -->
              <div class="flex flex-col gap-1 max-h-60 overflow-y-auto scrollbar-thin">
                <button 
                  v-for="edge in sortedEdges" 
                  :key="`${edge.from}-${edge.to}`"
                  @click="selectedEdge = { from: edge.from, to: edge.to }"
                  class="w-full text-left rounded-xl px-3 py-2 flex items-center justify-between transition-all cursor-pointer text-[10px]"
                  :class="selectedEdge && selectedEdge.from === edge.from && selectedEdge.to === edge.to 
                    ? 'bg-indigo-50/70 border-l-4 border-indigo-500 text-indigo-900 shadow-3xs' 
                    : 'hover:bg-slate-50/50 text-slate-700 border-l-4 border-transparent'"
                >
                  <div class="flex items-center gap-1.5 min-w-0 font-bold">
                    <span class="truncate" :title="edge.from">{{ getAbbreviatedName(edge.from) }}</span>
                    <span class="text-slate-400 font-normal">➜</span>
                    <span class="truncate" :title="edge.to">{{ getAbbreviatedName(edge.to) }}</span>
                  </div>
                  
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-[8.5px] font-mono text-slate-400 font-medium">
                      {{ edge.referenceCount }} imp.
                    </span>
                    <span 
                      v-if="breakingPoint && breakingPoint.from === edge.from && breakingPoint.to === edge.to"
                      class="text-[7px] font-black px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 uppercase tracking-wider"
                    >
                      Weakest
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Inspector Panel for Selected Edge -->
            <div class="flex flex-col gap-3 bg-slate-50/40 border border-slate-100 p-4 rounded-2xl">
              <div v-if="activeInspectorEdge" class="flex flex-col gap-3">
                <div class="flex flex-col gap-0.5">
                  <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-extrabold">Edge Connection Details</h4>
                  <div class="flex items-center gap-1 text-[11px] font-bold text-slate-900 font-mono mt-0.5">
                    <span class="truncate max-w-[42%]" :title="activeInspectorEdge.from">{{ getAbbreviatedName(activeInspectorEdge.from) }}</span>
                    <span class="text-indigo-500 shrink-0">➜</span>
                    <span class="truncate max-w-[42%]" :title="activeInspectorEdge.to">{{ getAbbreviatedName(activeInspectorEdge.to) }}</span>
                  </div>
                </div>

                <!-- Stats block -->
                <div class="grid grid-cols-2 gap-3">
                  <div class="bg-white border border-slate-150 rounded-xl p-2.5 flex flex-col justify-between">
                    <span class="text-[8px] text-slate-400 font-black uppercase tracking-wider">References</span>
                    <span class="text-sm font-black text-slate-900 font-mono mt-0.5">{{ activeInspectorEdge.referenceCount }}</span>
                  </div>
                  <div class="bg-white border border-slate-150 rounded-xl p-2.5 flex flex-col justify-between">
                    <span class="text-[8px] text-slate-400 font-black uppercase tracking-wider">Co-commits</span>
                    <span class="text-sm font-black text-slate-900 font-mono mt-0.5">{{ activeInspectorEdge.sharedCommits }}</span>
                  </div>
                </div>

                <!-- Ties Alert -->
                <div v-if="hasTies" class="bg-amber-50/60 border border-amber-200/50 rounded-xl p-2.5 text-slate-800 text-[8.5px] font-semibold">
                  <div class="flex items-center justify-between cursor-pointer select-none" @click="isTiesExpanded = !isTiesExpanded">
                    <span class="text-amber-800 font-bold">⚠️ {{ tiedEdges.length }} connections are tied at weakest link</span>
                    <span class="text-amber-700 underline font-black uppercase tracking-wider hover:text-amber-900">
                      {{ isTiesExpanded ? 'Hide' : 'Show' }}
                    </span>
                  </div>
                  <div v-if="isTiesExpanded" class="flex flex-wrap gap-1 mt-2 animate-in fade-in duration-200">
                    <button 
                      v-for="edge in tiedEdges.filter(e => e.from !== activeInspectorEdge.from || e.to !== activeInspectorEdge.to)" 
                      :key="`${edge.from}-${edge.to}`"
                      @click="selectedEdge = { from: edge.from, to: edge.to }"
                      class="bg-white border border-amber-200 hover:border-indigo-500 rounded px-2 py-0.5 font-mono text-[8px] font-bold text-amber-850 cursor-pointer"
                    >
                      {{ getAbbreviatedName(edge.from) }} ➜ {{ getAbbreviatedName(edge.to) }}
                    </button>
                  </div>
                </div>

                <!-- Action modal trigger -->
                <button 
                  @click="openFilesDialog" 
                  class="w-full mt-1 bg-slate-900 hover:bg-indigo-650 text-white font-extrabold text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-3xs transition-all cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2050/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  <span>Inspect Locations ({{ activeInspectorEdge.files.length }} files)</span>
                </button>
              </div>

              <div v-else class="h-full flex items-center justify-center text-slate-400 text-xs italic py-12 select-none">
                Select path to view references.
              </div>
            </div>

          </div>
        </div>

        <!-- Empty State / No Selected Cycle -->
        <div v-else class="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          <span class="p-3 bg-indigo-50 text-indigo-500 rounded-2xl mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </span>
          <h3 class="text-xs font-bold text-slate-800">Visual Cycle Loop Inspector</h3>
          <p class="text-[10px] text-slate-400 leading-relaxed max-w-xs mt-1">Select one of the dependency cycles from the list on the left to render the circular path loop and perform weakest link calculations.</p>
        </div>

      </div>

    </div>

  <!-- File Locations Modal Dialog -->
  <div 
    v-if="isFilesDialogOpen"
      class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="closeFilesDialog"
    >
      <div class="bg-white rounded-3xl p-6 shadow-2xl w-[500px] max-w-[95vw] border border-slate-200/50 flex flex-col gap-4 text-slate-800 animate-scale-up">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3 select-none">
          <div>
            <h3 class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-extrabold">Import Locations</h3>
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 font-mono mt-0.5">
              <span>{{ getAbbreviatedName(activeInspectorEdge?.from || '') }}</span>
              <span class="text-indigo-500 font-extrabold">➜</span>
              <span>{{ getAbbreviatedName(activeInspectorEdge?.to || '') }}</span>
            </div>
          </div>
          <button @click="closeFilesDialog" class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2050/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="flex flex-col gap-2 max-h-[320px] overflow-y-auto scrollbar-thin pr-1 font-mono">
          <div 
            v-for="f in activeInspectorEdge?.files" 
            :key="f.file"
            class="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col gap-1 text-[10px]"
          >
            <div class="flex items-center justify-between w-full font-semibold">
              <span class="truncate pr-4 text-slate-800" :title="f.file">{{ getFilename(f.file) }}</span>
              <span class="font-extrabold shrink-0 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[9px]">
                {{ f.count }} imports
              </span>
            </div>
            <div class="text-[9px] text-slate-400 truncate select-all" :title="f.file">
              Path: <span class="text-slate-600 font-semibold">{{ f.file }}</span>
            </div>
            <div v-if="f.lines" class="text-[9px] text-slate-400 border-t border-slate-200/40 pt-1.5 mt-0.5 select-none">
              Lines: 
              <SnippetPopover :file="f.file" :lines="f.lines">
                <span class="text-slate-700 font-extrabold underline decoration-dotted hover:text-indigo-650 transition-colors">{{ f.lines }}</span>
              </SnippetPopover>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import CycleLoopChart from "~/components/components/cycles/CycleLoopChart.vue"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find(c => c.name === nameInRoute.value)!)

const searchQuery = ref("")
const sortBy = ref<"severity" | "size" | "sharedCommits">("severity")
const page = ref(1)
const itemsPerPage = 8

const selectedCycleId = ref<number | null>(null)

// Filter globally expanded cycles to only those involving the current component
const cyclesIncludedIn = computed(() => {
  if (!store.hasData) return []
  return store.allCyclesExpanded.filter((c: any) => c.nodes.includes(nameInRoute.value))
})

// Auto select first cycle in the list
watch(cyclesIncludedIn, (newCycles) => {
  if (newCycles && newCycles.length > 0 && selectedCycleId.value === null) {
    selectedCycleId.value = newCycles[0].id
  }
}, { immediate: true })

// Reset pagination page on search query change
watch(searchQuery, () => {
  page.value = 1
})

const filteredCycles = computed(() => {
  let list = [...cyclesIncludedIn.value]
  
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
  return cyclesIncludedIn.value.find((c: any) => c.id === selectedCycleId.value) || null
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
</script>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background-color: transparent;
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
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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
