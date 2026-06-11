<template>
  <ViewWorkspaceLayout
    title="File Dependencies"
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
        <svg ref="depsSvgRef" class="w-full h-full" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"></svg>
      </div>
    </template>

    <!-- SIDEBAR TAB: Dependencies -->
    <template #tab-deps>
      <div class="flex flex-col gap-5">
        <!-- Stats -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Graph Stats</h4>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Files</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ depsNodeCount }}</span>
            </div>
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Edges</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ depsEdgeCount }}</span>
            </div>
          </div>
        </div>

        <!-- Top-N filter slider -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top-N Filter</h4>
          <div class="flex items-center gap-3">
            <input
              type="range"
              :min="10"
              :max="Math.max(200, depsAllNodeCount)"
              v-model.number="depsTopN"
              class="flex-1 accent-indigo-600"
            />
            <span class="text-xs font-mono font-bold text-slate-700 w-10 text-right">{{ depsTopN }}</span>
          </div>
          <p class="text-[9px] text-slate-400 font-semibold">Show the most connected files</p>
        </div>

        <!-- Component color legend -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Component Legend</h4>
          <div class="flex flex-col gap-1 max-h-52 overflow-y-auto scroll-container pr-1">
            <div
              v-for="[comp, color] in depsComponentColors"
              :key="comp"
              class="flex items-center gap-2 text-[10px] text-slate-700 font-semibold py-0.5"
            >
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: color }"></span>
              <span class="truncate">{{ comp || 'Unknown' }}</span>
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

useSeoMeta({ title: "File Dependencies" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("deps")
const tabs = [
  { id: "deps", label: "Dependencies" }
]

const badgeText = computed(() => `${depsNodeCount.value} Nodes`)

// ═══════════════════════════════════════════════════════
// DEPENDENCIES (D3 Force Graph)
// ═══════════════════════════════════════════════════════

const depsSvgRef = ref<SVGSVGElement | null>(null)
const depsTopN = ref(50)
const depsNodeCount = ref(0)
const depsEdgeCount = ref(0)
const depsAllNodeCount = ref(0)
const depsComponentColors = ref<[string, string][]>([])

interface DepsEdge {
  file: string
  target: string
}

interface DepsNode {
  id: string
  component: string
  degree: number
}

function buildDepsData() {
  if (!store.hasData || !store.hasView("snippets")) return { nodes: [] as DepsNode[], edges: [] as DepsEdge[] }

  const rawEdges = store.query<{ file: string; content: string }>(
    "SELECT file, content as target FROM snippets WHERE snippet_type LIKE '%import%'"
  )
  const edges: DepsEdge[] = rawEdges.map((e) => ({ file: e.file, target: (e as any).target || e.content }))

  // File→component mapping
  const fileCompMap = new Map<string, string>()
  if (store.hasView("files")) {
    const fileComps = store.query<{ name: string; component: string }>("SELECT name, component FROM files")
    fileComps.forEach((f) => fileCompMap.set(f.name, f.component || ""))
  }

  // Degree count
  const degreeMap = new Map<string, number>()
  for (const e of edges) {
    degreeMap.set(e.file, (degreeMap.get(e.file) || 0) + 1)
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
  }

  depsAllNodeCount.value = degreeMap.size

  // Top-N by degree
  const sortedNodes = [...degreeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, depsTopN.value)
  const topSet = new Set(sortedNodes.map((n) => n[0]))

  const filteredEdges = edges.filter((e) => topSet.has(e.file) && topSet.has(e.target))
  const nodeIds = new Set<string>()
  for (const e of filteredEdges) {
    nodeIds.add(e.file)
    nodeIds.add(e.target)
  }

  const nodes: DepsNode[] = [...nodeIds].map((id) => ({
    id,
    component: fileCompMap.get(id) || "",
    degree: degreeMap.get(id) || 0
  }))

  return { nodes, edges: filteredEdges }
}

function getComponentColorMap(nodes: DepsNode[]): Map<string, string> {
  const comps = [...new Set(nodes.map((n) => n.component))]
  const colorMap = new Map<string, string>()
  comps.forEach((c, i) => {
    const hue = (i * 137.508) % 360 // golden angle
    colorMap.set(c, `hsl(${hue}, 70%, 60%)`)
  })
  return colorMap
}

let depsSimulation: d3.Simulation<any, any> | null = null

function renderDepsGraph() {
  const svg = depsSvgRef.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 600

  // Clear
  d3.select(svg).selectAll("*").remove()
  if (depsSimulation) depsSimulation.stop()

  const { nodes, edges } = buildDepsData()
  const colorMap = getComponentColorMap(nodes)
  depsComponentColors.value = [...colorMap.entries()]
  depsNodeCount.value = nodes.length
  depsEdgeCount.value = edges.length

  if (nodes.length === 0) return

  const root = d3.select(svg)
  const g = root.append("g")

  // Zoom
  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on("zoom", (event) => {
    g.attr("transform", event.transform)
  })
  root.call(zoom)

  // Arrow markers
  root
    .append("defs")
    .append("marker")
    .attr("id", "dep-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#475569")
    .attr("opacity", 0.5)

  // Links
  const linkData = edges.map((e) => ({ source: e.file, target: e.target }))
  const links = g
    .selectAll("line.dep-link")
    .data(linkData)
    .join("line")
    .attr("class", "dep-link")
    .attr("stroke", "#334155")
    .attr("stroke-opacity", 0.25)
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#dep-arrow)")

  // Nodes
  const maxDegree = Math.max(...nodes.map((n) => n.degree), 1)
  const radiusScale = d3.scaleSqrt().domain([1, maxDegree]).range([4, 18])

  const nodeSelection = g
    .selectAll("circle.dep-node")
    .data(nodes, (d: any) => d.id)
    .join("circle")
    .attr("class", "dep-node")
    .attr("r", (d: any) => radiusScale(d.degree))
    .attr("fill", (d: any) => colorMap.get(d.component) || "#64748b")
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1.5)
    .style("cursor", "grab")

  // Labels
  const labels = g
    .selectAll("text.dep-label")
    .data(nodes, (d: any) => d.id)
    .join("text")
    .attr("class", "dep-label")
    .text((d: any) => getBasename(d.id))
    .attr("font-size", 8)
    .attr("fill", "#94a3b8")
    .attr("text-anchor", "middle")
    .attr("dy", -12)
    .style("pointer-events", "none")

  // Drag
  const drag = d3
    .drag<SVGCircleElement, DepsNode>()
    .on("start", (event, d: any) => {
      if (!event.active) depsSimulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d: any) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event, d: any) => {
      if (!event.active) depsSimulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  nodeSelection.call(drag as any)

  // Tooltip
  nodeSelection.append("title").text((d: any) => `${d.id}\nComponent: ${d.component || "—"}\nConnections: ${d.degree}`)

  // Force simulation
  depsSimulation = d3
    .forceSimulation(nodes as any)
    .force("link", d3.forceLink(linkData).id((d: any) => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d: any) => radiusScale(d.degree) + 2))
    .on("tick", () => {
      links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y)
      nodeSelection.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
    })

  // Search highlighting
  applyDepsSearch(nodeSelection, labels, links, linkData)
}

function applyDepsSearch(nodeSelection: any, labels: any, links: any, linkData: any) {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    nodeSelection.attr("opacity", 1)
    labels.attr("opacity", 1)
    links.attr("stroke-opacity", 0.25)
    return
  }
  nodeSelection.attr("opacity", (d: any) => (d.id.toLowerCase().includes(q) ? 1 : 0.15))
  labels.attr("opacity", (d: any) => (d.id.toLowerCase().includes(q) ? 1 : 0.1))
  links.attr("stroke-opacity", (d: any) => {
    const src = typeof d.source === "string" ? d.source : d.source.id
    const tgt = typeof d.target === "string" ? d.target : d.target.id
    return src.toLowerCase().includes(q) || tgt.toLowerCase().includes(q) ? 0.5 : 0.05
  })
}

function getBasename(path: string): string {
  return path?.split("/").pop() || path
}

// ═══════════════════════════════════════════════════════
// WATCHERS & LIFECYCLE
// ═══════════════════════════════════════════════════════

watch(depsTopN, () => {
  nextTick(() => renderDepsGraph())
})

watch(searchQuery, () => {
  const svg = depsSvgRef.value
  if (svg) {
    const g = d3.select(svg).select("g")
    const nodeSelection = g.selectAll("circle.dep-node")
    const labels = g.selectAll("text.dep-label")
    const links = g.selectAll("line.dep-link")
    applyDepsSearch(nodeSelection, labels, links, null)
  }
})

onMounted(() => {
  nextTick(() => renderDepsGraph())
})

onBeforeUnmount(() => {
  if (depsSimulation) depsSimulation.stop()
})

// Handle window resize for D3 views
let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    renderDepsGraph()
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
