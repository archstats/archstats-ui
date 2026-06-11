<template>
  <ViewWorkspaceLayout
    title="Directory Treemap"
    :badge-text="badgeText"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="400px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full relative overflow-hidden rounded-2xl">
        <svg ref="treemapSvgRef" class="w-full h-full" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"></svg>
      </div>
    </template>

    <!-- SIDEBAR TAB: Treemap -->
    <template #tab-treemap>
      <div class="flex flex-col gap-5">
        <!-- Stats -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Directory Stats</h4>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Directories</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ treemapDirCount }}</span>
            </div>
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Total Files</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ treemapTotalFiles }}</span>
            </div>
          </div>
        </div>

        <!-- Selected directory details -->
        <div v-if="treemapSelectedDir" class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Directory</h4>
          <div class="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-3xs flex flex-col gap-2">
            <div class="text-xs font-extrabold text-slate-900 font-mono break-all">{{ treemapSelectedDir.name }}</div>
            <div class="border-t border-slate-100 pt-2 mt-1 flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-slate-500 font-semibold">Files</span>
                <span class="font-mono font-bold text-slate-800">{{ treemapSelectedDir.complexity__files ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-slate-500 font-semibold">Code Health</span>
                <span class="font-mono font-bold text-slate-800">{{ formatNum(treemapSelectedDir.codesmells__code_health) }}</span>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-slate-500 font-semibold">Lines</span>
                <span class="font-mono font-bold text-slate-800">{{ formatNum(treemapSelectedDir.complexity__lines) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-slate-400 text-xs italic">
          Click a circle to view directory details. Click background to zoom out.
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

useSeoMeta({ title: "Directory Treemap" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("treemap")
const tabs = [
  { id: "treemap", label: "Treemap" }
]

const badgeText = computed(() => `${treemapDirCount.value} Directories`)

// ═══════════════════════════════════════════════════════
// TREEMAP (Circle Packing)
// ═══════════════════════════════════════════════════════

const treemapSvgRef = ref<SVGSVGElement | null>(null)
const treemapDirCount = ref(0)
const treemapTotalFiles = ref(0)
const treemapSelectedDir = ref<Record<string, any> | null>(null)

function buildTreemapHierarchy() {
  if (!store.hasData || !store.hasView("directories")) return null

  const dirs = store.query<Record<string, any>>("SELECT * FROM directories ORDER BY name")
  treemapDirCount.value = dirs.length
  treemapTotalFiles.value = dirs.reduce((sum, d) => sum + (Number(d.complexity__files) || 0), 0)

  if (dirs.length === 0) return null

  // Build tree from path segments
  const root: any = { name: "root", children: [], data: null }
  const map = new Map<string, any>()
  map.set("", root)

  for (const dir of dirs) {
    const parts = (dir.name || "").split("/").filter(Boolean)
    let current = root
    let path = ""
    for (let i = 0; i < parts.length; i++) {
      path += (path ? "/" : "") + parts[i]
      if (!map.has(path)) {
        const node: any = { name: parts[i], fullPath: path, children: [], data: null }
        current.children.push(node)
        map.set(path, node)
      }
      current = map.get(path)
    }
    current.data = dir
    current.value = Math.max(Number(dir.complexity__files) || 1, 1)
  }

  // Remove children from leaf nodes, propagate values
  function cleanTree(node: any): any {
    if (node.children.length === 0) {
      delete node.children
      node.value = node.value || 1
      return node
    }
    node.children = node.children.map(cleanTree)
    return node
  }
  return cleanTree(root)
}

function getHealthColor(health: any): string {
  const n = Number(health)
  if (isNaN(n) || health == null) return "#475569"
  if (n >= 8) return "#059669"
  if (n >= 5) return "#d97706"
  return "#dc2626"
}

function renderTreemap() {
  const svg = treemapSvgRef.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 600

  d3.select(svg).selectAll("*").remove()

  const hierarchyData = buildTreemapHierarchy()
  if (!hierarchyData) return

  const root = d3.select(svg)
  const g = root.append("g")

  const hierRoot = d3
    .hierarchy(hierarchyData)
    .sum((d: any) => (d.children ? 0 : d.value || 1))
    .sort((a, b) => (b.value || 0) - (a.value || 0))

  const pack = d3.pack<any>().size([width, height]).padding(3)
  pack(hierRoot)

  let focus = hierRoot
  let view: [number, number, number] = [hierRoot.x, hierRoot.y, hierRoot.r * 2]

  // Color by health or depth
  const depthColors = d3.scaleSequential(d3.interpolateViridis).domain([0, 6])

  const circles = g
    .selectAll("circle")
    .data(hierRoot.descendants())
    .join("circle")
    .attr("fill", (d: any) => {
      if (d.data.data?.codesmells__code_health != null) {
        return getHealthColor(d.data.data.codesmells__code_health)
      }
      return depthColors(d.depth)
    })
    .attr("fill-opacity", (d: any) => (d.children ? 0.25 : 0.7))
    .attr("stroke", (d: any) => (d.children ? "#475569" : "none"))
    .attr("stroke-width", (d: any) => (d.children ? 0.5 : 0))
    .style("cursor", "pointer")
    .on("click", (event, d: any) => {
      event.stopPropagation()
      if (d.data.data) {
        treemapSelectedDir.value = d.data.data
      }
      if (focus !== d) {
        zoomTo(d)
        focus = d
      }
    })

  // Labels
  const labelNodes = hierRoot.descendants().filter((d: any) => d.r > 14)
  const labels = g
    .selectAll("text")
    .data(labelNodes)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .attr("font-size", (d: any) => Math.min(d.r / 3, 11))
    .attr("fill", "#e2e8f0")
    .attr("pointer-events", "none")
    .text((d: any) => {
      const name = d.data.name || ""
      const maxLen = Math.max(3, Math.floor(d.r / 4))
      return name.length > maxLen ? name.slice(0, maxLen) + "…" : name
    })

  // Click background to zoom out
  root.on("click", () => {
    zoomTo(hierRoot)
    focus = hierRoot
    treemapSelectedDir.value = null
  })

  function zoomTo(d: any) {
    const targetView: [number, number, number] = [d.x, d.y, d.r * 2]
    const transition = root.transition().duration(500)

    const k0 = width / view[2]
    const k1 = width / targetView[2]

    circles
      .transition(transition as any)
      .attr("cx", (n: any) => (n.x - targetView[0]) * k1 + width / 2)
      .attr("cy", (n: any) => (n.y - targetView[1]) * k1 + height / 2)
      .attr("r", (n: any) => n.r * k1)

    labels
      .transition(transition as any)
      .attr("x", (n: any) => (n.x - targetView[0]) * k1 + width / 2)
      .attr("y", (n: any) => (n.y - targetView[1]) * k1 + height / 2)
      .attr("font-size", (n: any) => Math.min((n.r * k1) / 3, 11))

    view = targetView
  }

  // Initial placement
  const k = width / view[2]
  circles
    .attr("cx", (d: any) => (d.x - view[0]) * k + width / 2)
    .attr("cy", (d: any) => (d.y - view[1]) * k + height / 2)
    .attr("r", (d: any) => d.r * k)

  labels
    .attr("x", (d: any) => (d.x - view[0]) * k + width / 2)
    .attr("y", (d: any) => (d.y - view[1]) * k + height / 2)

  // Apply search
  applyTreemapSearch(circles)
}

function applyTreemapSearch(circles: any) {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    circles.attr("opacity", 1)
    return
  }
  circles.attr("opacity", (d: any) => {
    const name = d.data.fullPath || d.data.name || ""
    return name.toLowerCase().includes(q) ? 1 : 0.15
  })
}

function formatNum(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

// ═══════════════════════════════════════════════════════
// WATCHERS & LIFECYCLE
// ═══════════════════════════════════════════════════════

watch(searchQuery, () => {
  const svg = treemapSvgRef.value
  if (svg) {
    const circles = d3.select(svg).select("g").selectAll("circle")
    applyTreemapSearch(circles)
  }
})

onMounted(() => {
  nextTick(() => renderTreemap())
})

// Handle window resize for D3 views
let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    renderTreemap()
  }, 200)
}

onMounted(() => window.addEventListener("resize", onResize))
onBeforeUnmount(() => window.removeEventListener("resize", onResize))
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
