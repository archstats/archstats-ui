<template>
  <div class="relative w-full h-[620px] flex justify-center items-center">
    <!-- Custom Glassmorphic Tooltip (Light Theme) -->
    <div 
      v-if="hoveredNode"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      class="absolute z-50 pointer-events-none bg-white/95 border border-slate-200 shadow-xl px-4 py-3 rounded-2xl text-xs max-w-sm transition-all duration-100 flex flex-col gap-1.5 text-slate-800"
    >
      <div class="font-bold text-slate-900 border-b border-slate-200 pb-1.5 break-all max-w-[280px]">
        {{ hoveredNode.data.component ? hoveredNode.data.component.name : hoveredNode.data.name }}
      </div>
      <div class="flex items-center justify-between gap-6">
        <span class="text-slate-500 font-medium">{{ store.statName(sizeMetric) }} (Size):</span>
        <span class="font-mono text-emerald-600 font-semibold">{{ hoveredNode.value }}</span>
      </div>
      <div class="flex items-center justify-between gap-6">
        <span class="text-slate-500 font-medium">{{ store.statName(colorMetric) }} (Heat):</span>
        <span class="font-mono text-rose-600 font-semibold">{{ hoveredNode.data.colorValue }}</span>
      </div>
      <div class="text-[10px] text-slate-400 italic mt-1 border-t border-slate-200 pt-1.5">
        Click to view detailed analysis
      </div>
    </div>

    <!-- Circle Packing Canvas rendered natively without box-in-a-box padding -->
    <div :id="chartId" ref="chart" class="w-full h-full flex justify-center items-center"></div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible && contextMenu.node"
      class="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[200px] text-[10px] text-slate-800 select-none"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="px-3 py-1 text-[8px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
        {{ contextMenu.node.data.component ? 'Component Actions' : 'Namespace Actions' }}
      </div>

      <template v-if="!contextMenu.node.data.component">
        <button
          @click="promoteNamespaceToGroup"
          class="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-slate-700 font-semibold"
        >
          <span>✦</span>
          <span>Promote to Group</span>
        </button>
      </template>

      <template v-else>
        <!-- Add to Group Submenu -->
        <div class="relative group/add">
          <div class="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-slate-700 font-semibold">
            <span>Add to Group</span>
            <span class="text-[8px] text-slate-400">▸</span>
          </div>
          <div class="hidden group-hover/add:flex flex-col absolute left-full top-0 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 min-w-[160px] ml-1 max-h-[200px] overflow-y-auto">
            <button
              v-for="g in groupsStore.allComponentGroups"
              :key="g.id"
              @click="addLeafToGroup(g.id)"
              class="w-full text-left px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-slate-700 font-semibold flex items-center gap-2"
            >
              <div class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: g.color }"></div>
              <span>{{ g.name }}</span>
            </button>
            <div v-if="groupsStore.allComponentGroups.length === 0" class="px-3 py-1.5 text-slate-400 italic text-[9px]">
              No groups defined
            </div>
          </div>
        </div>

        <button
          @click="removeLeafFromGroups"
          class="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-red-650 font-semibold"
        >
          <span>✕</span>
          <span>Remove from Groups</span>
        </button>
      </template>
    </div>

    <!-- Floating Zoom Controls -->
    <div class="absolute bottom-4 right-4 flex flex-col gap-1.5 z-20">
      <button @click="zoomIn" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-xs font-bold cursor-pointer transition-all active:scale-95">+</button>
      <button @click="zoomOut" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-xs font-bold cursor-pointer transition-all active:scale-95">−</button>
      <button @click="resetZoom" class="w-8 h-8 rounded-lg bg-white/90 border border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-white shadow-3xs flex items-center justify-center text-[9px] font-bold cursor-pointer transition-all active:scale-95">⟲</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import * as d3 from "d3"
import {computed, defineProps, onMounted, ref, watch} from "vue"
import {useDataStore} from "~/stores/data"
import {Component} from "~/utils/components"
import {useRouter} from "vue-router"
import {useGroupsStore} from "~/stores/groups"

const store = useDataStore()
const router = useRouter()
const chartId = "circlepack-" + Math.random().toString(36).replace(/[^a-z]+/g, '').substring(2, 12)
const chart = ref<HTMLElement | null>(null)

let rootNode: any = null
let chartWidth = 900
let chartHeight = 620

const props = defineProps<{
  components: Component[]
  sizeMetric: string
  colorMetric: string
  highlightedComponent: string | null
  labelHigh: string
  labelLow: string
  searchQuery?: string
  selectedComponents?: string[]
  hiddenGroups?: Set<string>
  activeFilters?: Set<string>
  hoveredGroupId?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-selection', name: string): void
  (e: 'replace-selection', names: string[]): void
}>()

function getHslaColor(hslStr: string, opacity: number): string {
  if (!hslStr) return 'rgba(148, 163, 184, 0.03)'
  if (hslStr.startsWith('hsl(')) {
    return hslStr.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`)
  }
  return hslStr
}

const hoveredNode = ref<any | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

const groupsStore = useGroupsStore()

const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  node: any
}>({
  visible: false,
  x: 0,
  y: 0,
  node: null
})

function closeContextMenu() {
  contextMenu.value.visible = false
}

function promoteNamespaceToGroup() {
  const node = contextMenu.value.node
  if (!node) return

  const leaves: any[] = []
  function collectLeaves(d: any) {
    if (d.data.component) {
      leaves.push(d.data.component.name)
    } else if (d.children) {
      d.children.forEach(collectLeaves)
    }
  }
  collectLeaves(node)

  if (leaves.length > 0) {
    const nsName = node.data.fullName || node.data.name
    groupsStore.createGroup('component', `Namespace ${nsName}`, leaves)
  }
  closeContextMenu()
}

function addLeafToGroup(groupId: string) {
  const node = contextMenu.value.node
  if (node && node.data.component) {
    groupsStore.addMembersToGroup(groupId, [node.data.component.name])
  }
  closeContextMenu()
}

function removeLeafFromGroups() {
  const node = contextMenu.value.node
  if (node && node.data.component) {
    const name = node.data.component.name
    for (const g of groupsStore.allComponentGroups) {
      if (g.members.includes(name)) {
        groupsStore.removeMembersFromGroup(g.id, [name])
      }
    }
  }
  closeContextMenu()
}

const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.3, 15])
  .filter((event) => {
    return !event.shiftKey && !event.button
  })

function zoomToNode(d: any) {
  if (chart.value && d) {
    const svg = d3.select(chart.value).select("svg")
    if (!svg.empty()) {
      const padding = 40
      const targetDim = Math.min(chartWidth, chartHeight) - padding * 2
      const scale = targetDim / (d.r * 2)
      
      const tx = chartWidth / 2 - scale * d.x
      const ty = chartHeight / 2 - scale * d.y
      
      svg.transition().duration(750).call(
        zoomBehavior.transform as any,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      )
    }
  }
}

function zoomIn() {
  if (chart.value) {
    const svg = d3.select(chart.value).select("svg")
    if (!svg.empty()) {
      svg.transition().duration(250).call(zoomBehavior.scaleBy as any, 1.35)
    }
  }
}

function zoomOut() {
  if (chart.value) {
    const svg = d3.select(chart.value).select("svg")
    if (!svg.empty()) {
      svg.transition().duration(250).call(zoomBehavior.scaleBy as any, 0.75)
    }
  }
}

function resetZoom() {
  if (rootNode) {
    zoomToNode(rootNode)
  } else if (chart.value) {
    const svg = d3.select(chart.value).select("svg")
    if (!svg.empty()) {
      svg.transition().duration(250).call(zoomBehavior.transform as any, d3.zoomIdentity.translate(20, 20))
    }
  }
}

watch(() => [
  props.components,
  props.sizeMetric,
  props.colorMetric,
  props.highlightedComponent,
  props.labelHigh,
  props.labelLow,
  props.searchQuery,
  props.selectedComponents,
  props.hiddenGroups,
  props.activeFilters,
  props.hoveredGroupId,
  groupsStore.componentGroups
], () => {
  drawCirclePack()
}, { deep: true })

onMounted(() => {
  drawCirclePack()
})

function drawCirclePack() {
  const chartEl = d3.select(`#${chartId}`)

  let currentTransform: d3.ZoomTransform | null = null
  const existingSvg = chartEl.select("svg")
  if (!existingSvg.empty()) {
    currentTransform = d3.zoomTransform(existingSvg.node() as any)
  }

  chartEl.selectAll("svg").remove()

  if (!props.components || props.components.length === 0) {
    chartEl.append("div")
      .attr("class", "text-slate-400 text-sm py-40")
      .text("No data available to display Circle Packing.");
    return
  }

  // 1. Build hierarchy from component namespaces/packages
  const hierarchyData = buildHierarchy(props.components, props.sizeMetric, props.colorMetric)
  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))

  const width = chartEl.node()?.getBoundingClientRect().width || 900
  const height = 620

  rootNode = root
  chartWidth = width
  chartHeight = height

  // 2. Compute D3 Circle Packing
  d3.pack()
    .size([width - 40, height - 40])
    .padding(6)(root)

  // 3. Create SVG
  const svg = chartEl.append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("font-family", "Inter, sans-serif")
    .style("overflow", "visible")
    .style("cursor", "grab")
    .style("touch-action", "none")
    .on("click", function (event) {
      if (event.defaultPrevented) return
      if (event.target === this) {
        zoomToNode(root)
      }
    })

  const g = svg.append("g")

  // Bind D3 zoom behavior
  zoomBehavior
    .on("start", () => {
      svg.style("cursor", "grabbing")
    })
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
      const k = event.transform.k
      
      // 1. Leaf Labels: Keep visual font size constant (~9.5px) and toggle visibility
      g.selectAll(".leaf-label")
        .style("display", (d: any) => {
          if (query) {
            return isMatch(d) ? "block" : "none"
          }
          return (d.r * k >= 15) ? "block" : "none"
        })
        .style("font-size", `${9.5 / k}px`)
      
      // 2. Namespace Labels: Keep visual font size constant and update y-offset to stay at top
      g.selectAll(".namespace-label")
        .style("display", (d: any) => {
          return (d.r * k >= 35) ? "block" : "none"
        })
        .style("font-size", (d: any) => {
          const baseSize = d.depth === 1 ? 11 : 8.5
          return `${baseSize / k}px`
        })
        .attr("y", (d: any) => {
          const visualOffset = d.depth === 1 ? 14 : 10
          return -d.r + visualOffset / k
        })
      
      // 3. Callouts: Hide if zoomed in
      g.selectAll(".callout-flag")
        .style("opacity", k > 1.4 ? 0 : 1)
        .style("display", k > 1.4 ? "none" : "block")
    })
    .on("end", () => {
      svg.style("cursor", "grab")
    })

  svg.call(zoomBehavior)
    .on("dblclick.zoom", null) // Disable double-click zoom for better custom click UX!

  // Drag selection state and mouse events inside drawCirclePack
  let dragSelectionBox: any = null
  let dragStartG: { x: number, y: number } | null = null

  svg.on("mousedown", function (event) {
    if (!event.shiftKey) return

    event.preventDefault()
    event.stopPropagation()

    const bounds = svg.node()?.getBoundingClientRect()
    if (!bounds) return

    const transform = d3.zoomTransform(svg.node() as any)
    const rx = event.clientX - bounds.left
    const ry = event.clientY - bounds.top

    dragStartG = {
      x: (rx - transform.x) / transform.k,
      y: (ry - transform.y) / transform.k
    }

    dragSelectionBox = g.append("rect")
      .attr("class", "drag-select-box")
      .attr("x", dragStartG.x)
      .attr("y", dragStartG.y)
      .attr("width", 0)
      .attr("height", 0)
      .attr("fill", "rgba(59, 130, 246, 0.08)")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3")
  })

  svg.on("mousemove", function (event) {
    if (!dragStartG || !dragSelectionBox) return

    const bounds = svg.node()?.getBoundingClientRect()
    if (!bounds) return

    const transform = d3.zoomTransform(svg.node() as any)
    const rx = event.clientX - bounds.left
    const ry = event.clientY - bounds.top

    const gx = (rx - transform.x) / transform.k
    const gy = (ry - transform.y) / transform.k

    const x = Math.min(dragStartG.x, gx)
    const y = Math.min(dragStartG.y, gy)
    const width = Math.abs(dragStartG.x - gx)
    const height = Math.abs(dragStartG.y - gy)

    dragSelectionBox
      .attr("x", x)
      .attr("y", y)
      .attr("width", width)
      .attr("height", height)
  })

  svg.on("mouseup", function (event) {
    if (!dragStartG || !dragSelectionBox) return

    const bounds = svg.node()?.getBoundingClientRect()
    if (!bounds) return

    const transform = d3.zoomTransform(svg.node() as any)
    const rx = event.clientX - bounds.left
    const ry = event.clientY - bounds.top

    const gx = (rx - transform.x) / transform.k
    const gy = (ry - transform.y) / transform.k

    const x = Math.min(dragStartG.x, gx)
    const y = Math.min(dragStartG.y, gy)
    const width = Math.abs(dragStartG.x - gx)
    const height = Math.abs(dragStartG.y - gy)

    const selectedList: string[] = []
    root.leaves().forEach((d: any) => {
      if (d.data.component) {
        const cx = d.x
        const cy = d.y
        if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
          if (getNodeOpacity(d) >= 0.2) {
            selectedList.push(d.data.component.name)
          }
        }
      }
    })

    if (width > 3 && height > 3 && selectedList.length > 0) {
      emit('replace-selection', selectedList)
    }

    dragSelectionBox.remove()
    dragSelectionBox = null
    dragStartG = null
  })
  
  // Set initial or restored transform
  if (currentTransform) {
    svg.call(zoomBehavior.transform, currentTransform)
  } else {
    const initialPadding = 40
    const targetDim = Math.min(width, height) - initialPadding * 2
    const scale = targetDim / (root.r * 2)
    const tx = width / 2 - scale * root.x
    const ty = height / 2 - scale * root.y
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
  }

  // Color Heat Scale matching Archstats indigo-amber-rose theme
  const colorValues = root.leaves().map(d => d.data.colorValue || 0)
  const minVal = d3.min(colorValues) || 0
  const maxVal = d3.max(colorValues) || 1

  const colorScale = d3.scaleSequential()
    .domain([minVal || 1, maxVal])
    .interpolator(d3.interpolateRgbBasis([
      "#92a0c8", // Archstats-200 (Mild warning cool-blue)
      "#ffc670", // Secondary-200 (Warning amber)
      "#FFAD33", // Secondary-400 (Vibrant warning orange)
      "#ef4444", // Red-500 (High-risk hotspot red)
      "#9f1239"  // Rose-800 (Extreme hotspot crimson)
    ]))

  // 4. Draw group nodes (nested folders/namespaces)
  const node = g.selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`)

  const query = props.searchQuery?.trim().toLowerCase()
  const isMatch = (d: any) => {
    if (!query) return true
    const compName = d.data.component?.name || ''
    const nodeName = d.data.name || ''
    return compName.toLowerCase().includes(query) || nodeName.toLowerCase().includes(query)
  }

  // Helper to compute node opacity based on search, active filters, and hover state
  const getNodeOpacity = (d: any) => {
    if (!d.data.component) return 1

    const name = d.data.component.name

    if (hoveredNode.value?.data.component?.name === name) return 1

    if (query) {
      if (!isMatch(d)) {
        return 0.05
      }
    }

    if (props.hoveredGroupId) {
      const groups = groupsStore.componentGroupIndex.get(name) || []
      const hasHoveredGroup = groups.some(g => g.id === props.hoveredGroupId)
      return hasHoveredGroup ? 1 : 0.05
    }

    if (props.activeFilters && props.activeFilters.size > 0) {
      const groups = groupsStore.componentGroupIndex.get(name) || []
      const matchesFilter = groups.some(g => props.activeFilters.has(g.id))
      return matchesFilter ? 1 : 0.05
    }

    return 1
  }

  // Structural namespace boundary circles (interactive zoom targets!)
  node.filter(d => !!d.children)
    .append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => d.data.isGroup ? getHslaColor(d.data.groupColor, 0.04) : "rgba(148, 163, 184, 0.03)")
    .attr("stroke", d => d.data.isGroup ? d.data.groupColor : "rgba(148, 163, 184, 0.14)")
    .attr("stroke-width", d => d.data.isGroup ? 2.5 : Math.max(1, 3.5 - d.depth))
    .style("vector-effect", "non-scaling-stroke")
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("fill", d.data.isGroup ? getHslaColor(d.data.groupColor, 0.08) : "rgba(79, 70, 229, 0.04)")
        .attr("stroke", d.data.isGroup ? d.data.groupColor : "rgba(79, 70, 229, 0.25)")
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("fill", d => d.data.isGroup ? getHslaColor(d.data.groupColor, 0.04) : "rgba(148, 163, 184, 0.03)")
        .attr("stroke", d => d.data.isGroup ? d.data.groupColor : "rgba(148, 163, 184, 0.14)")
    })
    .on("click", function (event, d) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      zoomToNode(d)
    })
    .on("contextmenu", function (event, d) {
      event.preventDefault()
      event.stopPropagation()
      const bounds = chartEl.node()?.getBoundingClientRect()
      if (bounds) {
        contextMenu.value = {
          visible: true,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          node: d
        }
      }
    })

  // Leaf component circles
  const leaf = node.filter(d => !d.children)

  // Selection rings
  leaf.append("circle")
    .attr("r", d => d.r + 3)
    .attr("fill", "none")
    .attr("stroke", "#3b82f6")
    .attr("stroke-width", 2)
    .style("pointer-events", "none")
    .style("display", d => (props.selectedComponents?.includes(d.data.component?.name) ? "block" : "none"))

  const leafCircles = leaf.append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => {
      const val = d.data.colorValue || 0
      // Cold files with 0 or null commits fade cleanly into a soft neutral slate background!
      if (val === 0) {
        return "rgba(226, 232, 240, 0.45)"
      }
      return colorScale(val)
    })
    .attr("fill-opacity", d => getNodeOpacity(d))
    .attr("stroke-opacity", d => getNodeOpacity(d) * 0.8)
    .attr("stroke", d => {
      if (props.highlightedComponent && d.data.component?.name === props.highlightedComponent) {
        return "#27314e"
      }
      if (query && isMatch(d)) {
        return "#4f46e5"
      }
      return "rgba(15, 23, 42, 0.08)"
    })
    .attr("stroke-width", d => {
      if (props.highlightedComponent && d.data.component?.name === props.highlightedComponent) {
        return 3
      }
      if (query && isMatch(d)) {
        return 2.5
      }
      return 1.2
    })
    .style("cursor", "pointer")
    .style("vector-effect", "non-scaling-stroke")
    .style("transition", "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)")
    .style("pointer-events", d => getNodeOpacity(d) < 0.2 ? "none" : "auto")
    .style("filter", d => {
      if (props.highlightedComponent && d.data.component?.name === props.highlightedComponent) {
        return "drop-shadow(0 0 10px rgba(39, 49, 78, 0.25)) scale(1.08)"
      }
      if (query && isMatch(d)) {
        return "drop-shadow(0 0 6px rgba(79, 70, 229, 0.35))"
      }
      return null
    })
    .on("mouseover", function (event, d) {
      if (getNodeOpacity(d) < 0.2) return
      
      d3.select(this)
        .attr("stroke", "#27314e")
        .attr("stroke-width", 2.2)
        .style("filter", "drop-shadow(0 0 8px rgba(39, 49, 78, 0.18))")
      
      hoveredNode.value = d
      
      const bounds = chartEl.node()?.getBoundingClientRect()
      if (bounds) {
        tooltipX.value = event.clientX - bounds.left + 16
        tooltipY.value = event.clientY - bounds.top + 16
      }
    })
    .on("mousemove", function (event) {
      const bounds = chartEl.node()?.getBoundingClientRect()
      if (bounds) {
        tooltipX.value = event.clientX - bounds.left + 16
        tooltipY.value = event.clientY - bounds.top + 16
      }
    })
    .on("mouseout", function (event, d) {
      const isHighlighted = props.highlightedComponent && d.data.component?.name === props.highlightedComponent
      const isQueryMatch = query && isMatch(d)

      d3.select(this)
        .attr("stroke", isHighlighted ? "#27314e" : (isQueryMatch ? "#4f46e5" : "rgba(15, 23, 42, 0.08)"))
        .attr("stroke-width", isHighlighted ? 3 : (isQueryMatch ? 2.5 : 1.2))
        .style("filter", isHighlighted 
          ? "drop-shadow(0 0 10px rgba(39, 49, 78, 0.25))" 
          : (isQueryMatch ? "drop-shadow(0 0 6px rgba(79, 70, 229, 0.35))" : null)
        )
      hoveredNode.value = null
    })
    .on("click", function (event, d) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      if (d.data.component) {
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
          emit('toggle-selection', d.data.component.name)
        } else {
          router.push(`/views/components/${d.data.component.name}`)
        }
      }
    })
    .on("contextmenu", function (event, d) {
      event.preventDefault()
      event.stopPropagation()
      const bounds = chartEl.node()?.getBoundingClientRect()
      if (bounds) {
        contextMenu.value = {
          visible: true,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          node: d
        }
      }
    })

  // 5. Structural namespace header labels
  node.filter(d => !!d.children && d.depth > 0 && d.depth < 3)
    .append("text")
    .attr("class", "namespace-label")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(71, 85, 105, 0.65)")
    .style("font-weight", "700")
    .style("letter-spacing", "0.05em")
    .style("text-shadow", "0 1px 2px rgba(255,255,255,0.9)")
    .style("pointer-events", "none")
    .text(d => d.data.name)

  // 6. Component leaf labels
  leaf.append("text")
    .attr("class", "leaf-label")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .attr("fill", "#0f172a")
    .style("font-weight", "600")
    .style("font-size", "8.5px")
    .style("text-shadow", "0 1px 2px rgba(255,255,255,0.85)")
    .style("pointer-events", "none")
    .attr("fill-opacity", d => getNodeOpacity(d))
    .text(d => {
      const name = d.data.name
      const maxChars = Math.floor(d.r / 3.5)
      if (maxChars < 1) return ""
      return name.length > maxChars ? name.substring(0, maxChars) + ".." : name
    })
    .each(function (d) {
      const queryActive = !!query
      const match = isMatch(d)
      if (queryActive) {
        if (!match) {
          d3.select(this).style("display", "none")
        } else {
          d3.select(this).style("display", "block")
        }
      } else {
        if (d.r < 15) {
          d3.select(this).style("display", "none")
        } else {
          d3.select(this).style("display", "block")
        }
      }
    })

  // 7. Dynamic Callout Flags
  const leaves = root.leaves();
  if (leaves.length > 0) {
    const highestHotspot = [...leaves].sort((a, b) => (b.data.colorValue || 0) - (a.data.colorValue || 0))[0]
    const cleanestCore = [...leaves].sort((a, b) => (a.data.colorValue || 0) - (b.data.colorValue || 0))[0]

    // Render Hotspot Callout Flag if value > 0 and (no query or target matches)
    if (highestHotspot && highestHotspot.data.colorValue > 0 && (!query || isMatch(highestHotspot))) {
      drawCallout(g, highestHotspot, props.labelHigh, "#ef4444", -120, -50)
    }

    // Render Cold / Stable Callout Flag for the cleanest core component and (no query or target matches)
    if (cleanestCore && (!query || isMatch(cleanestCore))) {
      drawCallout(g, cleanestCore, props.labelLow, "#10b981", 120, -50)
    }
  }
}

function drawCallout(parentGroup: any, targetNode: any, text: string, color: string, dx: number, dy: number) {
  const calloutG = parentGroup.append("g")
    .attr("class", "callout-flag")
    .style("pointer-events", "none")

  const targetX = targetNode.x
  const targetY = targetNode.y
  const flagX = targetX + dx
  const flagY = targetY + dy

  calloutG.append("path")
    .attr("d", `M ${targetX} ${targetY} C ${targetX + dx * 0.4} ${targetY}, ${flagX - dx * 0.4} ${flagY}, ${flagX} ${flagY}`)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.45)

  calloutG.append("circle")
    .attr("cx", targetX)
    .attr("cy", targetY)
    .attr("r", targetNode.r + 4)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.2)
    .style("filter", `drop-shadow(0 0 3px ${color})`)

  const rectWidth = 140
  const rectHeight = 28
  
  calloutG.append("rect")
    .attr("x", flagX - rectWidth / 2)
    .attr("y", flagY - rectHeight / 2)
    .attr("width", rectWidth)
    .attr("height", rectHeight)
    .attr("rx", 14)
    .attr("fill", "rgba(255, 255, 255, 0.95)")
    .attr("stroke", color)
    .attr("stroke-width", 1.5)
    .style("backdrop-filter", "blur(4px)")
    .style("filter", "drop-shadow(0 4px 10px rgba(148, 163, 184, 0.2))")

  calloutG.append("text")
    .attr("x", flagX)
    .attr("y", flagY + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#0f172a")
    .style("font-weight", "700")
    .style("font-size", "9px")
    .style("letter-spacing", "0.02em")
    .text(text)
}

function buildHierarchy(components: any[], sizeKey: string, colorKey: string) {
  const groupsStore = useGroupsStore()
  const root: any = { name: "Components", children: [] }
  const groupNodes = new Map<string, any>()
  const unassignedNode: any = { name: "Unassigned", children: [] }
  root.children.push(unassignedNode)

  components.forEach(comp => {
    const name = comp.name
    const groups = groupsStore.componentGroupIndex.get(name) || []
    const visibleGroups = groups.filter(g => !props.hiddenGroups?.has(g.id))

    if (visibleGroups.length > 0) {
      const group = visibleGroups[0]
      let gNode = groupNodes.get(group.id)
      if (!gNode) {
        gNode = { name: group.name, children: [], isGroup: true, groupColor: group.color }
        root.children.push(gNode)
        groupNodes.set(group.id, gNode)
      }
      
      const lastDelim = Math.max(name.lastIndexOf('/'), name.lastIndexOf('.'), name.lastIndexOf('\\'))
      const shortName = lastDelim !== -1 ? name.substring(lastDelim + 1) : name
      gNode.children.push({
        name: shortName,
        component: comp,
        value: Math.max(Number(comp[sizeKey]) || 0, 1),
        colorValue: Number(comp[colorKey]) || 0
      })
    } else {
      let parts = [name]
      if (name.includes("\\")) {
        parts = name.split("\\")
      } else if (name.includes("/")) {
        parts = name.split("/").filter((x: string) => x)
      } else if (name.includes(".")) {
        parts = name.split(".")
      }

      let current = unassignedNode
      parts.forEach((part: string, idx: number) => {
        const isLeaf = idx === parts.length - 1
        let existing = current.children.find((c: any) => c.name === part)
        
        if (!existing) {
          existing = { name: part, children: [] }
          if (isLeaf) {
            existing.component = comp
            existing.value = Math.max(Number(comp[sizeKey]) || 0, 1)
            existing.colorValue = Number(comp[colorKey]) || 0
          }
          current.children.push(existing)
        }
        current = existing
      })
    }
  })

  function prune(node: any) {
    if (node.children && node.children.length > 0) {
      node.children.forEach(prune)
      delete node.value
    } else {
      delete node.children
    }
  }

  prune(root)

  root.children = root.children.filter((c: any) => c.children && c.children.length > 0)
  return root
}
</script>

<style scoped>
</style>
