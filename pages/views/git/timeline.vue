<template>
  <ViewWorkspaceLayout
    title="Git Timeline"
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
      <div class="w-full h-full flex flex-col gap-6 p-6 overflow-y-auto scroll-container">
        <!-- Heatmap Calendar -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Commit Activity Heatmap</h4>
          <div class="overflow-x-auto">
            <div class="inline-block">
              <!-- Month labels -->
              <div class="relative h-5 mb-1" :style="{ width: heatmapWidth + 'px' }">
                <span
                  v-for="label in heatmapMonthLabels"
                  :key="label.key"
                  class="absolute text-[9px] text-slate-400 font-semibold"
                  :style="{ left: label.left + 'px' }"
                >{{ label.text }}</span>
              </div>
              <!-- Day labels + grid -->
              <div class="flex gap-2">
                <div class="flex flex-col justify-between h-[calc(7*12px+6*4px)] text-[9px] text-slate-400 font-medium py-0.5 shrink-0 w-6">
                  <span>Mon</span>
                  <span>Wed</span>
                  <span>Fri</span>
                </div>
                <div class="heatmap-grid">
                  <div
                    v-for="(day, idx) in heatmapDays"
                    :key="idx"
                    class="w-3 h-3 rounded-sm transition-colors duration-150 group relative"
                    :style="{ backgroundColor: day.color }"
                    :title="day.date ? `${day.count} commits on ${day.date}` : ''"
                  ></div>
                </div>
              </div>
              <!-- Legend -->
              <div class="flex items-center gap-1.5 mt-3 text-[9px] text-slate-400 font-medium">
                <span>Less</span>
                <div class="w-3 h-3 rounded-sm" style="background-color: #161b22"></div>
                <div class="w-3 h-3 rounded-sm" style="background-color: #0e4429"></div>
                <div class="w-3 h-3 rounded-sm" style="background-color: #006d32"></div>
                <div class="w-3 h-3 rounded-sm" style="background-color: #26a641"></div>
                <div class="w-3 h-3 rounded-sm" style="background-color: #39d353"></div>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Monthly Bar Chart -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Monthly Additions & Deletions</h4>
          <svg ref="timelineBarSvgRef" class="w-full" style="height: 240px"></svg>
        </div>
      </div>
    </template>

    <!-- SIDEBAR TAB: Timeline -->
    <template #tab-timeline>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline Summary</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            Overview of commit activity over time.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Commits</span>
            <span class="text-base font-black text-slate-950 font-mono">{{ timelineStats.totalCommits }}</span>
          </div>
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Authors</span>
            <span class="text-base font-black text-slate-950 font-mono">{{ timelineStats.totalAuthors }}</span>
          </div>
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Additions</span>
            <span class="text-base font-black text-emerald-600 font-mono">+{{ timelineStats.totalAdditions.toLocaleString() }}</span>
          </div>
          <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
            <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Deletions</span>
            <span class="text-base font-black text-rose-500 font-mono">-{{ timelineStats.totalDeletions.toLocaleString() }}</span>
          </div>
        </div>

        <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-0.5">
          <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Date Range</span>
          <span class="text-[11px] font-bold text-slate-800 font-mono">{{ timelineStats.dateRange }}</span>
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

useSeoMeta({ title: "Git Timeline" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("timeline")
const tabs = [
  { id: "timeline", label: "Timeline" }
]

const badgeText = computed(() => `${timelineStats.value.totalCommits} Commits`)

// ═══════════════════════════════════════════
// TIMELINE – Heatmap + Bar Chart
// ═══════════════════════════════════════════
const timelineBarSvgRef = ref<SVGSVGElement | null>(null)

interface CommitRow {
  commit_hash: string
  commit_time: string
  commit_message: string
  author_name: string
  author_email: string
  files_changed: number
  additions: number
  deletions: number
}

const timelineData = computed<CommitRow[]>(() => {
  if (!store.hasData) return []
  try {
    return store.query<CommitRow>(
      `SELECT commit_hash, commit_time, commit_message, author_name, author_email, count(file) as files_changed, sum(file_additions) as additions, sum(file_deletions) as deletions FROM git_commits GROUP BY commit_hash ORDER BY commit_time DESC`
    )
  } catch { return [] }
})

const timelineStats = computed(() => {
  const data = timelineData.value
  if (data.length === 0) return { totalCommits: 0, totalAuthors: 0, totalAdditions: 0, totalDeletions: 0, dateRange: "—" }
  const authors = new Set(data.map(d => d.author_name))
  const additions = data.reduce((s, d) => s + (Number(d.additions) || 0), 0)
  const deletions = data.reduce((s, d) => s + (Number(d.deletions) || 0), 0)
  const dates = data.map(d => new Date(d.commit_time).getTime()).filter(t => !isNaN(t))
  const minDate = dates.length ? new Date(Math.min(...dates)) : null
  const maxDate = dates.length ? new Date(Math.max(...dates)) : null
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  return {
    totalCommits: data.length,
    totalAuthors: authors.size,
    totalAdditions: additions,
    totalDeletions: deletions,
    dateRange: minDate && maxDate ? `${fmt(minDate)} – ${fmt(maxDate)}` : "—"
  }
})

// Heatmap
const heatmapColors = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]

interface HeatmapDay {
  date: string | null
  count: number
  color: string
}

const heatmapResult = computed(() => {
  const data = timelineData.value
  const countsByDay = new Map<string, number>()
  for (const c of data) {
    const d = new Date(c.commit_time)
    if (isNaN(d.getTime())) continue
    const key = d.toISOString().slice(0, 10)
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1)
  }

  const dates = Array.from(countsByDay.keys()).sort()
  if (dates.length === 0) return { days: [] as HeatmapDay[], monthLabels: [] as { key: string; text: string; left: number }[], width: 0 }

  const endDate = new Date(dates[dates.length - 1])
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 364)

  const maxCount = Math.max(...countsByDay.values(), 1)
  const days: HeatmapDay[] = []
  const cur = new Date(startDate)

  // Padding for alignment to Sunday
  const startDow = cur.getDay()
  for (let i = 0; i < startDow; i++) {
    days.push({ date: null, count: 0, color: "transparent" })
  }

  while (cur <= endDate) {
    const key = cur.toISOString().slice(0, 10)
    const count = countsByDay.get(key) || 0
    let color = heatmapColors[0]
    if (count > 0) {
      const idx = Math.min(heatmapColors.length - 1, Math.ceil((count / maxCount) * (heatmapColors.length - 1)))
      color = heatmapColors[idx]
    }
    days.push({ date: key, count, color })
    cur.setDate(cur.getDate() + 1)
  }

  // Month labels
  const monthLabels: { key: string; text: string; left: number }[] = []
  let lastMonth = ""
  days.forEach((day, idx) => {
    if (!day.date) return
    const d = new Date(day.date)
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`
    if (monthKey !== lastMonth) {
      const weekIdx = Math.floor(idx / 7)
      const left = weekIdx * 16
      const lastLabel = monthLabels[monthLabels.length - 1]
      if (!lastLabel || left - lastLabel.left >= 36) {
        monthLabels.push({ key: monthKey, text: d.toLocaleString("en-US", { month: "short" }), left })
        lastMonth = monthKey
      }
    }
  })

  const totalWeeks = Math.ceil(days.length / 7)
  return { days, monthLabels, width: totalWeeks * 16 }
})

const heatmapDays = computed(() => heatmapResult.value.days)
const heatmapMonthLabels = computed(() => heatmapResult.value.monthLabels)
const heatmapWidth = computed(() => heatmapResult.value.width)

// Monthly bar chart
function renderTimelineBarChart() {
  const svg = timelineBarSvgRef.value
  if (!svg) return
  const container = svg.parentElement
  if (!container) return

  const width = container.clientWidth
  const height = 240
  const margin = { top: 20, right: 20, bottom: 30, left: 55 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  d3.select(svg).selectAll("*").remove()
  d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`)

  // Aggregate by month
  const monthly = new Map<string, { additions: number; deletions: number }>()
  for (const c of timelineData.value) {
    const d = new Date(c.commit_time)
    if (isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const m = monthly.get(key) || { additions: 0, deletions: 0 }
    m.additions += Number(c.additions) || 0
    m.deletions += Number(c.deletions) || 0
    monthly.set(key, m)
  }

  const sorted = Array.from(monthly.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  if (sorted.length === 0) return

  const x = d3.scaleBand().domain(sorted.map(d => d[0])).range([0, innerW]).padding(0.25)
  const maxVal = d3.max(sorted, d => Math.max(d[1].additions, d[1].deletions)) || 1
  const y = d3.scaleLinear().domain([-maxVal, maxVal]).range([innerH, 0])

  const g = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`)

  // Zero line
  g.append("line").attr("x1", 0).attr("x2", innerW).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#cbd5e1").attr("stroke-width", 1)

  // Additions bars (going up from zero)
  g.selectAll(".bar-add")
    .data(sorted)
    .join("rect")
    .attr("x", d => x(d[0])!)
    .attr("width", x.bandwidth())
    .attr("y", d => y(d[1].additions))
    .attr("height", d => y(0) - y(d[1].additions))
    .attr("fill", "#22c55e")
    .attr("rx", 2)
    .attr("fill-opacity", 0.8)

  // Deletions bars (going down from zero)
  g.selectAll(".bar-del")
    .data(sorted)
    .join("rect")
    .attr("x", d => x(d[0])!)
    .attr("width", x.bandwidth())
    .attr("y", y(0))
    .attr("height", d => y(-d[1].deletions) - y(0))
    .attr("fill", "#ef4444")
    .attr("rx", 2)
    .attr("fill-opacity", 0.8)

  // X axis
  const xAxis = d3.axisBottom(x).tickValues(sorted.filter((_, i) => i % Math.max(1, Math.floor(sorted.length / 8)) === 0).map(d => d[0]))
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis)
    .call(g => g.select(".domain").attr("stroke", "#cbd5e1"))
    .call(g => g.selectAll("text").attr("fill", "#64748b").attr("font-size", "8px").attr("font-weight", "600"))

  // Y axis
  g.append("g")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => {
      const v = Math.abs(Number(d))
      return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
    }))
    .call(g => g.select(".domain").attr("stroke", "#cbd5e1"))
    .call(g => g.selectAll("text").attr("fill", "#64748b").attr("font-size", "9px").attr("font-weight", "600"))
}

// ═══════════════════════════════════════════
// LIFECYCLE & WATCHERS
// ═══════════════════════════════════════════
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderTimelineBarChart()

  resizeObserver = new ResizeObserver(() => {
    renderTimelineBarChart()
  })

  if (timelineBarSvgRef.value?.parentElement) {
    resizeObserver.observe(timelineBarSvgRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(timelineData, () => {
  nextTick(() => renderTimelineBarChart())
})
</script>

<style scoped>
.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  gap: 4px;
}

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
