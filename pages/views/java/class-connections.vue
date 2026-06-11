<template>
  <ViewWorkspaceLayout
    title="Class Connections Explorer"
    :badge-text="badgeText"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="400px"
    :show-config="false"
  >
    <!-- Visualizer Canvas Slot (Left Column) -->
    <template #visualizer>
      <div v-if="activeTab === 'direct'" class="w-full h-full relative overflow-hidden rounded-2xl">
        <svg ref="svgRef" class="w-full h-full" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"></svg>
      </div>

      <div v-else-if="activeTab === 'indirect'" class="w-full h-full flex flex-col p-6 overflow-y-auto scroll-container bg-slate-50">
        <div class="max-w-2xl mx-auto w-full flex flex-col gap-6 select-none">
          <!-- Path Config Card -->
          <div class="bg-white border border-slate-250/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Class Path Tracer</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5 relative">
                <label class="text-[10px] font-bold text-slate-500 uppercase">Source Class</label>
                <input
                  type="text"
                  v-model="sourceSearch"
                  @focus="showSourceDropdown = true"
                  placeholder="Select source class..."
                  class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <div v-if="showSourceDropdown && filteredSourceClasses.length > 0" class="absolute z-20 left-0 right-0 top-14 bg-white border border-slate-255/80 rounded-xl shadow-lg max-h-48 overflow-y-auto font-mono text-[10px]">
                  <div
                    v-for="cls in filteredSourceClasses"
                    :key="cls"
                    @click="selectSource(cls)"
                    class="px-3 py-2 hover:bg-indigo-50 hover:text-indigo-800 cursor-pointer truncate"
                  >
                    {{ cls }}
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-1.5 relative">
                <label class="text-[10px] font-bold text-slate-500 uppercase">Target Class</label>
                <input
                  type="text"
                  v-model="targetSearch"
                  @focus="showTargetDropdown = true"
                  placeholder="Select target class..."
                  class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <div v-if="showTargetDropdown && filteredTargetClasses.length > 0" class="absolute z-20 left-0 right-0 top-14 bg-white border border-slate-255/80 rounded-xl shadow-lg max-h-48 overflow-y-auto font-mono text-[10px]">
                  <div
                    v-for="cls in filteredTargetClasses"
                    :key="cls"
                    @click="selectTarget(cls)"
                    class="px-3 py-2 hover:bg-indigo-50 hover:text-indigo-800 cursor-pointer truncate"
                  >
                    {{ cls }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Trace Result -->
          <div v-if="computedPath.length > 0" class="bg-white border border-slate-250/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-6">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Shortest Path found</h4>
                <p class="text-[10px] text-slate-400 font-medium">Traced successfully with {{ computedPath.length - 1 }} hops</p>
              </div>
              <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[9px] border border-indigo-100">
                Connected
              </span>
            </div>

            <!-- Path Steps Stepper -->
            <div class="flex flex-col gap-1 font-mono">
              <div v-for="(cls, idx) in computedPath" :key="cls" class="flex flex-col">
                <div class="flex items-start gap-4 p-3 rounded-2xl border border-slate-100 bg-slate-50/30 hover:border-indigo-100 hover:bg-indigo-50/5 transition-all">
                  <div class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 font-black text-xs shrink-0 select-none border border-indigo-100">
                    {{ idx + 1 }}
                  </div>
                  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div class="text-xs font-bold text-slate-900 break-all select-all">{{ getClassNameOnly(cls) }}</div>
                    <div class="text-[9px] text-slate-400 break-all select-all">{{ getPackageNameOnly(cls) }}</div>
                    <div v-if="classMetaMap.get(cls)" class="flex items-center gap-2 mt-1.5">
                      <span class="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase tracking-wide">
                        Component: {{ classMetaMap.get(cls)?.component || '—' }}
                      </span>
                      <button
                        @click="router.push('/views/files/' + classMetaMap.get(cls)?.file)"
                        class="text-[8px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Inspect File
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Arrow Connector -->
                <div v-if="idx < computedPath.length - 1" class="flex justify-center py-2 text-indigo-400 select-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="sourceClass && targetClass" class="bg-white border border-slate-250/60 rounded-3xl p-8 shadow-3xs flex flex-col items-center gap-3 text-center">
            <span class="p-3 bg-rose-50 text-rose-500 rounded-2xl border border-rose-100">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </span>
            <h4 class="text-xs font-bold text-slate-800">No Connection Path Found</h4>
            <p class="text-[10px] text-slate-400 max-w-sm">
              There is no path of direct class dependencies linking <span class="font-mono font-bold">{{ getClassNameOnly(sourceClass) }}</span> to <span class="font-mono font-bold">{{ getClassNameOnly(targetClass) }}</span> in this codebase.
            </p>
          </div>

          <div v-else class="bg-white border border-slate-250/60 rounded-3xl p-8 shadow-3xs flex flex-col items-center gap-3 text-center">
            <span class="p-3 bg-indigo-50 text-indigo-500 rounded-2xl border border-indigo-100">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 21m0 0-.813-5.096m.813 5.096a9.382 9.382 0 1 0 0-18.764 9.382 9.382 0 0 0 0 18.764ZM15 11.25a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </span>
            <h4 class="text-xs font-bold text-slate-800">Select Classes to Trace</h4>
            <p class="text-[10px] text-slate-400 max-w-sm">
              Choose a source class and target class from the autocomplete dropdown inputs above to trace the shortest path of dependencies between them.
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Sidebar Drawer: Tab content -->
    <template #tab-direct>
      <div class="flex flex-col gap-5">
        <!-- Stats -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Graph Stats</h4>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Classes</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ nodeCount }}</span>
            </div>
            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
              <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Connections</span>
              <span class="text-base font-black text-slate-950 font-mono">{{ edgeCount }}</span>
            </div>
          </div>
        </div>

        <!-- Top-N Filter -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top-N Filter</h4>
          <div class="flex items-center gap-3">
            <input
              type="range"
              :min="10"
              :max="Math.max(150, allNodeCount)"
              v-model.number="topN"
              class="flex-1 accent-indigo-600"
            />
            <span class="text-xs font-mono font-bold text-slate-700 w-10 text-right">{{ topN }}</span>
          </div>
          <p class="text-[9px] text-slate-400 font-semibold">Display the most connected classes</p>
        </div>

        <!-- Selected Node Details -->
        <div v-if="selectedNode" class="flex flex-col gap-3">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Class</h4>
          <div class="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-3xs flex flex-col gap-2.5">
            <div class="flex flex-col">
              <span class="text-xs font-extrabold text-slate-950 font-mono break-all select-all">{{ getClassNameOnly(selectedNode.id) }}</span>
              <span class="text-[9px] text-slate-400 font-mono break-all mt-0.5 select-all">{{ getPackageNameOnly(selectedNode.id) }}</span>
            </div>

            <div class="border-t border-slate-100 pt-2 flex flex-col gap-1 text-[10px]">
              <div class="flex justify-between">
                <span class="text-slate-450 font-semibold">Component:</span>
                <span class="font-bold text-slate-800 font-mono">{{ selectedNode.component || '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-450 font-semibold">File Connections:</span>
                <span class="font-bold text-slate-800 font-mono">{{ selectedNode.degree }} refs</span>
              </div>
            </div>

            <div class="flex flex-col gap-2 border-t border-slate-100 pt-2">
              <button
                @click="router.push('/views/files/' + selectedNode.file)"
                class="w-full py-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors text-center cursor-pointer"
              >
                Inspect Class File
              </button>

              <button
                @click="setAsSourceClass(selectedNode.id)"
                class="w-full py-1.5 text-[9px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-center cursor-pointer"
              >
                Set as Source in Tracer
              </button>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-6 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-2xl">
          Click a class node in the graph to view details.
        </div>

        <!-- Legend -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Component Legend</h4>
          <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto scroll-container pr-1">
            <div
              v-for="[comp, color] in componentColors"
              :key="comp"
              class="flex items-center gap-2 text-[10px] text-slate-700 font-semibold py-0.5"
            >
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: color }"></span>
              <span class="truncate">{{ comp || 'Default' }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #tab-indirect>
      <div class="flex flex-col gap-5 text-slate-800 select-none">
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Path Tracer Settings</h4>
        <p class="text-[10px] text-slate-400 leading-relaxed font-semibold">
          Choose classes on the canvas page or search them in the inputs to calculate routing hops.
        </p>

        <div v-if="sourceClass || targetClass" class="flex flex-col gap-3">
          <div v-if="sourceClass" class="bg-white border border-slate-150/60 rounded-2xl p-3 flex flex-col gap-1 relative pr-8">
            <span class="text-[8px] text-slate-400 font-bold uppercase">Source Class Selected</span>
            <span class="text-xs font-mono font-bold text-slate-900 truncate">{{ getClassNameOnly(sourceClass) }}</span>
            <button @click="sourceClass = ''" class="absolute right-2.5 top-2.5 text-slate-400 hover:text-rose-500 cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div v-if="targetClass" class="bg-white border border-slate-150/60 rounded-2xl p-3 flex flex-col gap-1 relative pr-8">
            <span class="text-[8px] text-slate-400 font-bold uppercase">Target Class Selected</span>
            <span class="text-xs font-mono font-bold text-slate-900 truncate">{{ getClassNameOnly(targetClass) }}</span>
            <button @click="targetClass = ''" class="absolute right-2.5 top-2.5 text-slate-400 hover:text-rose-500 cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <button
            v-if="sourceClass && targetClass"
            @click="swapClasses"
            class="w-full mt-2 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/60 transition rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            🔄 Reverse Path
          </button>
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

useSeoMeta({ title: "Java Class Connections" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("direct")
const tabs = [
  { id: "direct", label: "Direct Graph" },
  { id: "indirect", label: "Path Tracer" }
]

const badgeText = computed(() => {
  if (activeTab.value === 'direct') {
    return `${nodeCount.value} Classes`
  }
  return computedPath.value.length > 0 ? `${computedPath.value.length} Hops` : 'Tracer'
})

// ═══════════════════════════════════════════════════════
// DIRECT CONNECTIONS GRAPH (D3)
// ═══════════════════════════════════════════════════════

const svgRef = ref<SVGSVGElement | null>(null)
const topN = ref(50)
const nodeCount = ref(0)
const edgeCount = ref(0)
const allNodeCount = ref(0)
const componentColors = ref<[string, string][]>([])
const selectedNode = ref<any | null>(null)

interface ClassEdge {
  from: string
  to: string
  reference_count: number
}

interface ClassNode {
  id: string
  component: string
  file: string
  degree: number
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

function buildGraphData() {
  if (!store.hasData || !store.hasView("java_class_connections_direct")) {
    return { nodes: [] as ClassNode[], edges: [] as ClassEdge[] }
  }

  const edges = store.query<ClassEdge>(
    "SELECT `from`, `to`, `reference_count` FROM java_class_connections_direct"
  )

  const nodesInfo = store.query<{ id: string; component: string; file: string }>(
    "SELECT java_full_class as id, component, name as file FROM files WHERE java_full_class != ''"
  )

  const nodeInfoMap = new Map<string, { component: string; file: string }>()
  nodesInfo.forEach((n) => nodeInfoMap.set(n.id, { component: n.component || "", file: n.file }))

  // Calculate degrees
  const degreeMap = new Map<string, number>()
  for (const e of edges) {
    degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1)
    degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1)
  }

  const allRefNodes = new Set<string>()
  for (const e of edges) {
    allRefNodes.add(e.from)
    allRefNodes.add(e.to)
  }

  allNodeCount.value = allRefNodes.size

  // Top-N
  const sortedNodes = [...allRefNodes]
    .sort((a, b) => (degreeMap.get(b) || 0) - (degreeMap.get(a) || 0))
    .slice(0, topN.value)
  const topSet = new Set(sortedNodes)

  const filteredEdges = edges.filter((e) => topSet.has(e.from) && topSet.has(e.to))
  const finalNodeIds = new Set<string>()
  for (const e of filteredEdges) {
    finalNodeIds.add(e.from)
    finalNodeIds.add(e.to)
  }

  const nodes: ClassNode[] = [...finalNodeIds].map((id) => {
    const info = nodeInfoMap.get(id)
    return {
      id,
      component: info?.component || "",
      file: info?.file || "",
      degree: degreeMap.get(id) || 0
    }
  })

  return { nodes, edges: filteredEdges }
}

function getColors(nodes: ClassNode[]): Map<string, string> {
  const comps = [...new Set(nodes.map((n) => n.component))]
  const colorMap = new Map<string, string>()
  comps.forEach((c, i) => {
    const hue = (i * 137.508) % 360 // golden angle
    colorMap.set(c, `hsl(${hue}, 70%, 60%)`)
  })
  return colorMap
}

let simulation: d3.Simulation<any, any> | null = null

function renderGraph() {
  const svg = svgRef.value
  if (!svg || activeTab.value !== 'direct') return
  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 600

  d3.select(svg).selectAll("*").remove()
  if (simulation) simulation.stop()

  const { nodes, edges } = buildGraphData()
  const colorMap = getColors(nodes)
  componentColors.value = [...colorMap.entries()]
  nodeCount.value = nodes.length
  edgeCount.value = edges.length

  if (nodes.length === 0) return

  const root = d3.select(svg)
  const g = root.append("g")

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on("zoom", (event) => {
    g.attr("transform", event.transform)
  })
  root.call(zoom)

  // Arrow markers
  root
    .append("defs")
    .append("marker")
    .attr("id", "class-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#64748b")
    .attr("opacity", 0.5)

  // Links
  const linkData = edges.map((e) => ({ source: e.from, target: e.to }))
  const links = g
    .selectAll("line.link")
    .data(linkData)
    .join("line")
    .attr("class", "link")
    .attr("stroke", "#334155")
    .attr("stroke-opacity", 0.25)
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#class-arrow)")

  // Nodes
  const maxDegree = Math.max(...nodes.map((n) => n.degree), 1)
  const radiusScale = d3.scaleSqrt().domain([1, maxDegree]).range([4, 18])

  const nodeSelection = g
    .selectAll("circle.node")
    .data(nodes, (d: any) => d.id)
    .join("circle")
    .attr("class", "node")
    .attr("r", (d: any) => radiusScale(d.degree))
    .attr("fill", (d: any) => colorMap.get(d.component) || "#64748b")
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("click", (event, d: any) => {
      selectedNode.value = d
    })

  // Labels
  const labels = g
    .selectAll("text.label")
    .data(nodes, (d: any) => d.id)
    .join("text")
    .attr("class", "label")
    .text((d: any) => getClassNameOnly(d.id))
    .attr("font-size", 7)
    .attr("fill", "#94a3b8")
    .attr("text-anchor", "middle")
    .attr("dy", -10)
    .style("pointer-events", "none")

  // Drag behavior
  const drag = d3
    .drag<SVGCircleElement, ClassNode>()
    .on("start", (event, d: any) => {
      if (!event.active) simulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d: any) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event, d: any) => {
      if (!event.active) simulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  nodeSelection.call(drag as any)

  nodeSelection.append("title").text((d: any) => `${d.id}\nComponent: ${d.component || '—'}\nRefs: ${d.degree}`)

  simulation = d3
    .forceSimulation(nodes as any)
    .force("link", d3.forceLink(linkData).id((d: any) => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-160))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d: any) => radiusScale(d.degree) + 3))
    .on("tick", () => {
      links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y)
      nodeSelection.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
    })

  applySearch(nodeSelection, labels, links)
}

function applySearch(nodeSelection: any, labels: any, links: any) {
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
    return src.toLowerCase().includes(q) || tgt.toLowerCase().includes(q) ? 0.55 : 0.05
  })
}

// ═══════════════════════════════════════════════════════
// PATH TRACER (INDIRECT)
// ═══════════════════════════════════════════════════════

const sourceClass = ref("")
const targetClass = ref("")
const sourceSearch = ref("")
const targetSearch = ref("")
const showSourceDropdown = ref(false)
const showTargetDropdown = ref(false)

const allJavaClasses = computed(() => {
  if (!store.hasData || !store.hasView("files")) return []
  const rows = store.query<{ java_full_class: string }>(
    "SELECT DISTINCT java_full_class FROM files WHERE java_full_class != '' ORDER BY java_full_class"
  )
  return rows.map((r) => r.java_full_class)
})

const classMetaMap = computed(() => {
  const map = new Map<string, { component: string; file: string }>()
  if (store.hasData) {
    const rows = store.query<{ java_full_class: string; component: string; name: string }>(
      "SELECT java_full_class, component, name FROM files WHERE java_full_class != ''"
    )
    rows.forEach((r) => map.set(r.java_full_class, { component: r.component || "", file: r.name }))
  }
  return map
})

const filteredSourceClasses = computed(() => {
  const q = sourceSearch.value.trim().toLowerCase()
  if (!q) return allJavaClasses.value.slice(0, 10)
  return allJavaClasses.value.filter((c) => c.toLowerCase().includes(q)).slice(0, 20)
})

const filteredTargetClasses = computed(() => {
  const q = targetSearch.value.trim().toLowerCase()
  if (!q) return allJavaClasses.value.slice(0, 10)
  return allJavaClasses.value.filter((c) => c.toLowerCase().includes(q)).slice(0, 20)
})

function selectSource(cls: string) {
  sourceClass.value = cls
  sourceSearch.value = getClassNameOnly(cls)
  showSourceDropdown.value = false
}

function selectTarget(cls: string) {
  targetClass.value = cls
  targetSearch.value = getClassNameOnly(cls)
  showTargetDropdown.value = false
}

function setAsSourceClass(cls: string) {
  selectSource(cls)
  activeTab.value = "indirect"
}

function swapClasses() {
  const temp = sourceClass.value
  sourceClass.value = targetClass.value
  targetClass.value = temp

  sourceSearch.value = getClassNameOnly(sourceClass.value)
  targetSearch.value = getClassNameOnly(targetClass.value)
}

const computedPath = computed(() => {
  if (!sourceClass.value || !targetClass.value || !store.hasView("java_class_connections_indirect")) {
    return []
  }
  const rows = store.query<{ shortest_path: string }>(
    `SELECT shortest_path FROM java_class_connections_indirect WHERE \`from\` = '${sourceClass.value}' AND \`to\` = '${targetClass.value}' LIMIT 1`
  )
  if (rows.length === 0) return []
  return rows[0].shortest_path.split(" -> ")
})

// Close dropdowns on click outside
if (process.client) {
  window.addEventListener("click", (e) => {
    const target = e.target as HTMLElement
    if (!target.closest(".relative")) {
      showSourceDropdown.value = false
      showTargetDropdown.value = false
    }
  })
}

// ═══════════════════════════════════════════════════════
// COMMON HELPERS & WATCHERS
// ═══════════════════════════════════════════════════════

function getClassNameOnly(fullPath: string): string {
  if (!fullPath) return ""
  return fullPath.split(".").pop() || fullPath
}

function getPackageNameOnly(fullPath: string): string {
  if (!fullPath) return ""
  const parts = fullPath.split(".")
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join(".")
}

watch(activeTab, (tab) => {
  if (tab === "direct") {
    nextTick(() => renderGraph())
  }
})

watch(topN, () => {
  nextTick(() => renderGraph())
})

watch(searchQuery, () => {
  if (activeTab.value === 'direct' && svgRef.value) {
    const g = d3.select(svgRef.value).select("g")
    const nodes = g.selectAll("circle.node")
    const lbls = g.selectAll("text.label")
    const lnks = g.selectAll("line.link")
    applySearch(nodes, lbls, lnks)
  }
})

onMounted(() => {
  if (activeTab.value === "direct") {
    nextTick(() => renderGraph())
  }
})

onBeforeUnmount(() => {
  if (simulation) simulation.stop()
})

let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    renderGraph()
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
