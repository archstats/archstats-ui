<template>
  <ViewWorkspaceLayout
    title="Git Authors"
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
        <!-- Stacked Horizontal Bar Chart -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Author Contributions (Top 20)</h4>
          <svg ref="authorBarSvgRef" class="w-full" :style="{ height: authorBarHeight + 'px' }"></svg>
        </div>

        <!-- Authors Table -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">All Authors</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-[10px] font-medium text-slate-700">
              <thead>
                <tr class="border-b border-slate-100">
                  <th
                    v-for="col in authorTableCols"
                    :key="col.key"
                    @click="toggleAuthorSort(col.key)"
                    class="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors select-none"
                  >
                    {{ col.label }}
                    <span v-if="authorSortKey === col.key" class="ml-0.5 text-slate-500">{{ authorSortDir === 'asc' ? '↑' : '↓' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="sortedAuthorsForTable.length === 0">
                  <td :colspan="authorTableCols.length" class="text-center py-8 text-slate-400 italic">No authors match search.</td>
                </tr>
                <tr
                  v-else
                  v-for="author in sortedAuthorsForTable"
                  :key="author.name"
                  class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  @click="router.push('/views/git/authors/' + encodeURIComponent(author.name))"
                >
                  <td class="px-3 py-2 font-bold text-indigo-600 hover:text-indigo-800 font-mono truncate max-w-[180px]">{{ author.name }}</td>
                  <td class="px-3 py-2 font-mono text-slate-500 truncate max-w-[180px]">{{ author.email }}</td>
                  <td class="px-3 py-2 font-mono font-bold text-slate-900">{{ author.commits }}</td>
                  <td class="px-3 py-2 font-mono text-emerald-600">+{{ author.additions }}</td>
                  <td class="px-3 py-2 font-mono text-rose-500">-{{ author.deletions }}</td>
                  <td class="px-3 py-2 font-mono text-slate-600">{{ author.files_changed }}</td>
                  <td class="px-3 py-2 font-mono text-slate-600">{{ author.components_changed }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- SIDEBAR TAB: Authors -->
    <template #tab-authors>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Author Insights</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            Contributor breakdown and activity analysis. Click an author to view their detailed timeline and commit history.
          </p>
        </div>

        <!-- Time Period Toggle -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Time Period</span>
          <div class="flex gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
            <button
              v-for="period in authorTimePeriods"
              :key="period.value"
              @click="authorTimePeriod = period.value"
              class="flex-1 px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all duration-150 cursor-pointer text-center"
              :class="authorTimePeriod === period.value ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-800'"
            >
              {{ period.label }}
            </button>
          </div>
        </div>

        <!-- Top 5 Authors -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Top Contributors</h4>
          <div class="flex flex-col gap-2">
            <div
              v-for="author in topAuthors"
              :key="author.name"
              class="bg-white border border-slate-200/60 rounded-2xl p-3.5 shadow-3xs flex flex-col gap-2 cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
              @click="router.push('/views/git/authors/' + encodeURIComponent(author.name))"
            >
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                  {{ author.name.charAt(0).toUpperCase() }}
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-[11px] font-bold text-indigo-600 truncate">{{ author.name }}</span>
                  <span class="text-[9px] text-slate-400 font-mono truncate">{{ author.email }}</span>
                </div>
              </div>
              <div class="flex items-center gap-3 text-[9px] font-mono text-slate-500 border-t border-slate-100 pt-2">
                <span><strong class="text-slate-800">{{ author.commits }}</strong> commits</span>
                <span class="text-emerald-600">+{{ author.additions }}</span>
                <span class="text-rose-500">-{{ author.deletions }}</span>
              </div>
            </div>
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

useSeoMeta({ title: "Git Authors" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("authors")
const tabs = [
  { id: "authors", label: "Authors" }
]

const badgeText = computed(() => `${authorsData.value.length} Authors`)

// ═══════════════════════════════════════════
// AUTHORS
// ═══════════════════════════════════════════
const authorBarSvgRef = ref<SVGSVGElement | null>(null)
const authorTimePeriod = ref("total")
const authorSortKey = ref("commits")
const authorSortDir = ref<"asc" | "desc">("desc")

const authorTimePeriods = [
  { value: "total", label: "Total" },
  { value: "last_30_days", label: "30d" },
  { value: "last_90_days", label: "90d" },
  { value: "last_180_days", label: "180d" }
]

interface AuthorRow {
  name: string
  email: string
  commits: number
  additions: number
  deletions: number
  files_changed: number
  components_changed: number
  [key: string]: any
}

const authorsData = computed<AuthorRow[]>(() => {
  if (!store.hasData) return []
  try {
    const raw = store.query<any>(`SELECT * FROM git_authors ORDER BY git__commits__total DESC`)
    const suffix = authorTimePeriod.value === "total" ? "__total" : `__${authorTimePeriod.value}`
    const mapped = raw.map((r: any) => ({
      name: r.name || r.author_name || "",
      email: r.email || r.author_email || "",
      commits: Number(r[`git__commits${suffix}`] || r.git__commits__total) || 0,
      additions: Number(r[`git__additions${suffix}`] || r.git__additions__total) || 0,
      deletions: Number(r[`git__deletions${suffix}`] || r.git__deletions__total) || 0,
      files_changed: Number(r[`git__files_changed${suffix}`] || r.git__files_changed__total) || 0,
      components_changed: Number(r[`git__components_changed${suffix}`] || r.git__components_changed__total) || 0
    }))

    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return mapped
    return mapped.filter((a: AuthorRow) => 
      a.name.toLowerCase().includes(q) || 
      a.email.toLowerCase().includes(q)
    )
  } catch { return [] }
})

const topAuthors = computed(() => {
  // Always get top authors based on total commits (from the time period select)
  return [...authorsData.value]
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 5)
})

const authorTableCols = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "commits", label: "Commits" },
  { key: "additions", label: "Additions" },
  { key: "deletions", label: "Deletions" },
  { key: "files_changed", label: "Files" },
  { key: "components_changed", label: "Components" }
]

function toggleAuthorSort(key: string) {
  if (authorSortKey.value === key) {
    authorSortDir.value = authorSortDir.value === "asc" ? "desc" : "asc"
  } else {
    authorSortKey.value = key
    authorSortDir.value = "desc"
  }
}

const sortedAuthorsForTable = computed(() => {
  const data = [...authorsData.value]
  const key = authorSortKey.value as keyof AuthorRow
  const dir = authorSortDir.value === "asc" ? 1 : -1
  return data.sort((a, b) => {
    const av = a[key], bv = b[key]
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

const authorBarHeight = computed(() => Math.max(200, authorsData.value.slice(0, 20).length * 28 + 60))

function renderAuthorBarChart() {
  const svg = authorBarSvgRef.value
  if (!svg) return
  const container = svg.parentElement
  if (!container) return

  const data = authorsData.value.slice(0, 20)
  const width = container.clientWidth
  const height = authorBarHeight.value
  const margin = { top: 10, right: 30, bottom: 20, left: 140 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  d3.select(svg).selectAll("*").remove()
  d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`)

  if (data.length === 0) return

  const y = d3.scaleBand().domain(data.map(d => d.name)).range([0, innerH]).padding(0.3)
  const maxVal = d3.max(data, d => d.additions + d.deletions) || 1
  const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])

  const g = d3.select(svg).append("g").attr("transform", `translate(${margin.left},${margin.top})`)

  // Additions bars
  g.selectAll(".bar-add")
    .data(data)
    .join("rect")
    .attr("x", 0)
    .attr("y", d => y(d.name)!)
    .attr("width", d => x(d.additions))
    .attr("height", y.bandwidth())
    .attr("fill", "#22c55e")
    .attr("rx", 3)
    .attr("fill-opacity", 0.8)

  // Deletions bars stacked
  g.selectAll(".bar-del")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.additions))
    .attr("y", d => y(d.name)!)
    .attr("width", d => x(d.deletions))
    .attr("height", y.bandwidth())
    .attr("fill", "#ef4444")
    .attr("rx", 3)
    .attr("fill-opacity", 0.8)

  // Y axis
  g.append("g")
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll("text")
      .attr("fill", "#334155")
      .attr("font-size", "9px")
      .attr("font-weight", "700")
      .attr("font-family", "ui-monospace, monospace")
      .each(function () {
        const text = d3.select(this).text()
        if (text.length > 20) d3.select(this).text(text.slice(0, 18) + "..")
      })
    )

  // X axis
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => {
      const v = Number(d)
      return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
    }))
    .call(g => g.select(".domain").attr("stroke", "#e2e8f0"))
    .call(g => g.selectAll("text").attr("fill", "#94a3b8").attr("font-size", "8px"))
}

// ═══════════════════════════════════════════
// LIFECYCLE & WATCHERS
// ═══════════════════════════════════════════
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderAuthorBarChart()

  resizeObserver = new ResizeObserver(() => {
    renderAuthorBarChart()
  })

  if (authorBarSvgRef.value?.parentElement) {
    resizeObserver.observe(authorBarSvgRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch([authorsData, authorTimePeriod], () => {
  nextTick(() => renderAuthorBarChart())
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
