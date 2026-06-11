<template>
  <ViewWorkspaceLayout
    title="Git Coupling"
    :badge-text="badgeText"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="380px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-2xl overflow-hidden relative">
        <svg ref="chordSvgRef" class="w-full h-full"></svg>
        <!-- Tooltip -->
        <div
          v-if="chordTooltip.show"
          class="absolute pointer-events-none bg-slate-800/95 backdrop-blur-sm text-white rounded-xl px-3 py-2 text-[10px] shadow-lg border border-slate-700/50 z-50 max-w-[280px]"
          :style="{ left: chordTooltip.x + 'px', top: chordTooltip.y + 'px' }"
        >
          <div class="font-bold text-[11px] mb-1">{{ chordTooltip.title }}</div>
          <div class="text-slate-300">{{ chordTooltip.detail }}</div>
        </div>
      </div>
    </template>

    <!-- SIDEBAR TAB: Coupling -->
    <template #tab-coupling>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coupling Controls</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            Chord diagram showing how often components are changed together in Git commits.
          </p>
        </div>

        <!-- Top N Slider -->
        <div class="flex flex-col gap-2 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Top Components</span>
            <span class="text-base font-black text-slate-950 font-mono">{{ topNComponents }}</span>
          </div>
          <input
            v-model.number="topNComponents"
            type="range"
            min="5"
            max="50"
            step="1"
            class="w-full accent-indigo-500 h-1"
          />
          <div class="flex justify-between text-[8px] text-slate-400 font-medium">
            <span>5</span>
            <span>50</span>
          </div>
        </div>

        <!-- Selected Pair Info -->
        <div v-if="selectedChordPair" class="flex flex-col gap-3 bg-white border border-slate-200/60 rounded-2xl p-4 shadow-3xs">
          <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Selected Connection</h4>
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-900 font-mono">
            <span class="truncate">{{ store.getComponentName(selectedChordPair.pair_1) }}</span>
            <span class="text-indigo-500">⇄</span>
            <span class="truncate">{{ store.getComponentName(selectedChordPair.pair_2) }}</span>
          </div>
          <div class="grid grid-cols-1 gap-2">
            <div class="bg-slate-50/50 border border-slate-100 rounded-xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Shared Commits</span>
              <span class="text-base font-black text-slate-950 font-mono">
                {{ selectedChordPair.shared_commits }}
                <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">commits</span>
              </span>
            </div>
            <div class="bg-slate-50/50 border border-slate-100 rounded-xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">% of {{ store.getComponentName(selectedChordPair.pair_1) }}</span>
              <span class="text-base font-black text-slate-950 font-mono">
                {{ (Number(selectedChordPair.percentage_of_all_commits_pair_1) * 100).toFixed(1) }}%
              </span>
            </div>
            <div class="bg-slate-50/50 border border-slate-100 rounded-xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">% of {{ store.getComponentName(selectedChordPair.pair_2) }}</span>
              <span class="text-base font-black text-slate-950 font-mono">
                {{ (Number(selectedChordPair.percentage_of_all_commits_pair_2) * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-slate-400 text-[10px] italic">
          Hover or click a ribbon to inspect coupling details.
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const store = useDataStore()

useSeoMeta({ title: "Git Coupling" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("coupling")
const tabs = [
  { id: "coupling", label: "Coupling" }
]

const badgeText = computed(() => `${topNComponents.value} Components`)

// ═══════════════════════════════════════════
// TAB 1: COUPLING – Chord Diagram
// ═══════════════════════════════════════════
const topNComponents = ref(20)
const chordSvgRef = ref<SVGSVGElement | null>(null)
const selectedChordPair = ref<any>(null)
const chordTooltip = ref({ show: false, x: 0, y: 0, title: "", detail: "" })

interface CouplingRow {
  pair_1: string
  pair_2: string
  shared_commits: number
  percentage_of_all_commits_pair_1: number
  percentage_of_all_commits_pair_2: number
}

const couplingData = computed<CouplingRow[]>(() => {
  if (!store.hasData) return []
  try {
    return store.query<CouplingRow>(
      `SELECT pair_1, pair_2, shared_commits, percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2 FROM git_component_shared_commits WHERE shared_commits > 0 ORDER BY shared_commits DESC`
    )
  } catch { return [] }
})

const chordComponents = computed(() => {
  const totals = new Map<string, number>()
  for (const row of couplingData.value) {
    totals.set(row.pair_1, (totals.get(row.pair_1) || 0) + Number(row.shared_commits))
    totals.set(row.pair_2, (totals.get(row.pair_2) || 0) + Number(row.shared_commits))
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topNComponents.value)
    .map(e => e[0])
})

function renderChordDiagram() {
  const svg = chordSvgRef.value
  if (!svg) return
  const container = svg.parentElement
  if (!container) return

  const width = container.clientWidth
  const height = container.clientHeight
  const outerRadius = Math.min(width, height) * 0.42
  const innerRadius = outerRadius - 20

  d3.select(svg).selectAll("*").remove()
  d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`)

  const names = chordComponents.value
  const n = names.length
  if (n === 0) return

  const nameIndex = new Map(names.map((name, i) => [name, i]))
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  const rowLookup = new Map<string, CouplingRow>()
  for (const row of couplingData.value) {
    const i = nameIndex.get(row.pair_1)
    const j = nameIndex.get(row.pair_2)
    if (i !== undefined && j !== undefined) {
      matrix[i][j] = Number(row.shared_commits)
      matrix[j][i] = Number(row.shared_commits)
      rowLookup.set(`${i}-${j}`, row)
      rowLookup.set(`${j}-${i}`, row)
    }
  }

  const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending)
  const chords = chord(matrix)

  const arc = d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius)
  const ribbon = d3.ribbon<any, any>().radius(innerRadius)

  const color = (i: number) => `hsl(${i * 137.508}, 55%, 60%)`
  const maxShared = d3.max(couplingData.value, d => Number(d.shared_commits)) || 1

  const g = d3.select(svg).append("g").attr("transform", `translate(${width / 2},${height / 2})`)

  // Arcs
  g.append("g")
    .selectAll("path")
    .data(chords.groups)
    .join("path")
    .attr("d", arc as any)
    .attr("fill", d => color(d.index))
    .attr("stroke", "rgba(255,255,255,0.1)")
    .attr("stroke-width", 0.5)

  // Arc labels
  g.append("g")
    .selectAll("text")
    .data(chords.groups)
    .join("text")
    .each(function (d) {
      const angle = (d.startAngle + d.endAngle) / 2
      const rotate = (angle * 180 / Math.PI) - 90
      const flip = angle > Math.PI
      d3.select(this)
        .attr("transform", `rotate(${rotate}) translate(${outerRadius + 8}) ${flip ? "rotate(180)" : ""}`)
        .attr("text-anchor", flip ? "end" : "start")
    })
    .attr("fill", "rgba(255,255,255,0.7)")
    .attr("font-size", "8px")
    .attr("font-weight", "700")
    .attr("font-family", "ui-monospace, monospace")
    .text(d => {
      const fullName = store.getComponentName(names[d.index])
      return fullName.length > 18 ? fullName.slice(-18) : fullName
    })

  // Ribbons
  g.append("g")
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("d", ribbon)
    .attr("fill", d => color(d.source.index))
    .attr("fill-opacity", d => 0.15 + 0.6 * (matrix[d.source.index][d.target.index] / maxShared))
    .attr("stroke", "rgba(255,255,255,0.05)")
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill-opacity", 0.85)
      const row = rowLookup.get(`${d.source.index}-${d.target.index}`) || rowLookup.get(`${d.target.index}-${d.source.index}`)
      if (row) {
        const rect = container!.getBoundingClientRect()
        chordTooltip.value = {
          show: true,
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top - 10,
          title: `${store.getComponentName(row.pair_1)} ⇄ ${store.getComponentName(row.pair_2)}`,
          detail: `${row.shared_commits} shared commits`
        }
      }
    })
    .on("mouseout", function (_, d) {
      d3.select(this).attr("fill-opacity", 0.15 + 0.6 * (matrix[d.source.index][d.target.index] / maxShared))
      chordTooltip.value = { show: false, x: 0, y: 0, title: "", detail: "" }
    })
    .on("click", (_, d) => {
      const row = rowLookup.get(`${d.source.index}-${d.target.index}`) || rowLookup.get(`${d.target.index}-${d.source.index}`)
      if (row) selectedChordPair.value = row
    })
}

// ═══════════════════════════════════════════
// LIFECYCLE & WATCHERS
// ═══════════════════════════════════════════
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderChordDiagram()

  resizeObserver = new ResizeObserver(() => {
    renderChordDiagram()
  })

  if (chordSvgRef.value?.parentElement) {
    resizeObserver.observe(chordSvgRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(topNComponents, () => {
  nextTick(() => renderChordDiagram())
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

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: #e2e8f0;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #6366f1;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
</style>
