<template>
  <ViewWorkspaceLayout
    title="Git Churn Analysis"
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
      <div class="w-full h-full bg-white rounded-2xl overflow-hidden relative">
        <svg ref="scatterSvgRef" class="w-full h-full"></svg>
        <!-- Scatter Tooltip -->
        <div
          v-if="scatterTooltip.show"
          class="absolute pointer-events-none bg-slate-900/95 backdrop-blur-sm text-white rounded-xl px-3.5 py-2.5 text-[10px] shadow-xl border border-slate-700/50 z-50 max-w-[300px]"
          :style="{ left: scatterTooltip.x + 'px', top: scatterTooltip.y + 'px' }"
        >
          <div class="font-extrabold text-[11px] mb-1 font-mono truncate">{{ scatterTooltip.name }}</div>
          <div class="flex flex-col gap-0.5 text-slate-300">
            <span>Commits: <strong class="text-white font-mono">{{ scatterTooltip.commits }}</strong></span>
            <span>Code Health: <strong class="text-white font-mono">{{ scatterTooltip.health }}</strong></span>
            <span>Hotspot Score: <strong class="text-white font-mono">{{ scatterTooltip.hotspot }}</strong></span>
          </div>
        </div>
      </div>
    </template>

    <!-- SIDEBAR TAB: Churn -->
    <template #tab-churn>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Churn Analysis</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            Scatter plot of commit frequency vs. code health. Click a bubble to navigate to the component detail.
          </p>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Components</span>
            <span class="text-base font-black text-slate-950 font-mono">{{ churnData.length }}</span>
          </div>
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Avg Health</span>
            <span class="text-base font-black text-slate-950 font-mono">{{ churnAvgHealth }}</span>
          </div>
        </div>

        <!-- Hottest Components -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Hottest Components</h4>
          <div class="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto scroll-container pr-1">
            <button
              v-for="item in hottestComponents"
              :key="item.name"
              @click="router.push('/views/components/' + item.name)"
              class="w-full text-left bg-white border border-slate-100 hover:border-slate-200 rounded-xl p-3 flex items-center justify-between transition-all duration-150 cursor-pointer group"
            >
              <span class="text-[10px] font-bold font-mono text-slate-800 truncate max-w-[200px]">{{ store.getComponentName(item.name) }}</span>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[9px] font-mono text-slate-500">{{ item.commits }} commits</span>
                <span
                  class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border"
                  :class="item.hotspot > 0.7 ? 'bg-rose-50 border-rose-200 text-rose-700' : item.hotspot > 0.4 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'"
                >
                  {{ item.hotspot.toFixed(2) }}
                </span>
              </div>
            </button>
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

const store = useDataStore()
const router = useRouter()

useSeoMeta({ title: "Git Churn" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("churn")
const tabs = [
  { id: "churn", label: "Churn" }
]

const badgeText = computed(() => `${churnData.value.length} Components`)

// ═══════════════════════════════════════════
// CHURN – Scatter Plot
// ═══════════════════════════════════════════
const scatterSvgRef = ref<SVGSVGElement | null>(null)
const scatterTooltip = ref({ show: false, x: 0, y: 0, name: "", commits: 0, health: "", hotspot: "" })

interface ChurnRow {
  name: string
  git__commits__total: number
  git__additions__total: number
  git__deletions__total: number
  codesmells__code_health: number
  codesmells__hotspot_score: number
}

const churnData = computed<ChurnRow[]>(() => {
  if (!store.hasData) return []
  try {
    const raw = store.query<ChurnRow>(
      `SELECT name, git__commits__total, git__additions__total, git__deletions__total, codesmells__code_health, codesmells__hotspot_score FROM components WHERE git__commits__total > 0`
    )
    // Optional filter by search query if needed
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return raw
    return raw.filter(r => r.name.toLowerCase().includes(q))
  } catch { return [] }
})

const churnAvgHealth = computed(() => {
  if (churnData.value.length === 0) return "—"
  const sum = churnData.value.reduce((s, r) => s + (Number(r.codesmells__code_health) || 0), 0)
  return (sum / churnData.value.length).toFixed(1)
})

const hottestComponents = computed(() => {
  return [...churnData.value]
    .map(r => ({
      name: r.name,
      commits: Number(r.git__commits__total) || 0,
      hotspot: Number(r.codesmells__hotspot_score) || 0,
      health: Number(r.codesmells__code_health) || 0
    }))
    .sort((a, b) => b.hotspot - a.hotspot)
    .slice(0, 30)
})

function renderScatterPlot() {
  const svg = scatterSvgRef.value
  if (!svg) return
  const container = svg.parentElement
  if (!container) return

  const width = container.clientWidth
  const height = container.clientHeight
  const margin = { top: 40, right: 40, bottom: 50, left: 55 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  d3.select(svg).selectAll("*").remove()
  d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`)

  if (churnData.value.length === 0) return

  const xMax = d3.max(churnData.value, d => Number(d.git__commits__total)) || 1
  const x = d3.scaleLinear().domain([0, xMax * 1.05]).range([0, innerW])
  const y = d3.scaleLinear().domain([0, 10]).range([innerH, 0])
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(churnData.value, d => Math.sqrt(Number(d.git__additions__total) + Number(d.git__deletions__total))) || 1])
    .range([3, 28])
  const colorScale = d3.scaleLinear<string>().domain([0, 0.5, 1]).range(["#22c55e", "#f59e0b", "#ef4444"])

  const g = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`)

  // Grid
  g.append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", d => y(d)).attr("y2", d => y(d))
    .attr("stroke", "#e2e8f0").attr("stroke-dasharray", "3,3")

  g.append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(x.ticks(6))
    .join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d))
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", "#e2e8f0").attr("stroke-dasharray", "3,3")

  // Quadrant labels
  const quadrants = [
    { label: "Stable & Healthy", x: 12, y: 16, anchor: "start" },
    { label: "Hot & Healthy", x: innerW - 12, y: 16, anchor: "end" },
    { label: "Stable & Risky", x: 12, y: innerH - 8, anchor: "start" },
    { label: "Hot & Risky", x: innerW - 12, y: innerH - 8, anchor: "end" }
  ]
  g.selectAll(".quadrant-label")
    .data(quadrants)
    .join("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("text-anchor", d => d.anchor)
    .attr("fill", "#94a3b8")
    .attr("font-size", "9px")
    .attr("font-weight", "800")
    .attr("letter-spacing", "0.05em")
    .text(d => d.label)

  // Axes
  const xAxis = d3.axisBottom(x).ticks(6).tickSize(-4)
  const yAxis = d3.axisLeft(y).ticks(5).tickSize(-4)

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis)
    .call(g => g.select(".domain").attr("stroke", "#cbd5e1"))
    .call(g => g.selectAll("text").attr("fill", "#64748b").attr("font-size", "9px").attr("font-weight", "600"))

  g.append("g")
    .call(yAxis)
    .call(g => g.select(".domain").attr("stroke", "#cbd5e1"))
    .call(g => g.selectAll("text").attr("fill", "#64748b").attr("font-size", "9px").attr("font-weight", "600"))

  // Axis labels
  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8").attr("font-size", "10px").attr("font-weight", "800")
    .attr("letter-spacing", "0.06em")
    .text("COMMITS (CHURN FREQUENCY)")

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2).attr("y", -42)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8").attr("font-size", "10px").attr("font-weight", "800")
    .attr("letter-spacing", "0.06em")
    .text("CODE HEALTH (0–10)")

  // Bubbles
  g.selectAll("circle")
    .data(churnData.value)
    .join("circle")
    .attr("cx", d => x(Number(d.git__commits__total)))
    .attr("cy", d => y(Number(d.codesmells__code_health) || 0))
    .attr("r", d => rScale(Math.sqrt(Number(d.git__additions__total) + Number(d.git__deletions__total))))
    .attr("fill", d => colorScale(Math.min(1, Number(d.codesmells__hotspot_score) || 0)))
    .attr("fill-opacity", 0.65)
    .attr("stroke", d => colorScale(Math.min(1, Number(d.codesmells__hotspot_score) || 0)))
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.8)
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill-opacity", 0.9).attr("stroke-width", 2.5)
      const rect = container!.getBoundingClientRect()
      scatterTooltip.value = {
        show: true,
        x: event.clientX - rect.left + 14,
        y: event.clientY - rect.top - 14,
        name: store.getComponentName(d.name),
        commits: Number(d.git__commits__total),
        health: (Number(d.codesmells__code_health) || 0).toFixed(1),
        hotspot: (Number(d.codesmells__hotspot_score) || 0).toFixed(2)
      }
    })
    .on("mouseout", function () {
      d3.select(this).attr("fill-opacity", 0.65).attr("stroke-width", 1.5)
      scatterTooltip.value = { show: false, x: 0, y: 0, name: "", commits: 0, health: "", hotspot: "" }
    })
    .on("click", (_, d) => {
      router.push("/views/components/" + d.name)
    })
}

// ═══════════════════════════════════════════
// LIFECYCLE & WATCHERS
// ═══════════════════════════════════════════
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderScatterPlot()

  resizeObserver = new ResizeObserver(() => {
    renderScatterPlot()
  })

  if (scatterSvgRef.value?.parentElement) {
    resizeObserver.observe(scatterSvgRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch([churnData, searchQuery], () => {
  nextTick(() => renderScatterPlot())
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
