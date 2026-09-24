<template>
  <div ref="host" class="relative h-full min-h-0 w-full overflow-hidden">
    <!-- Hover tooltip -->
    <div
      v-if="hoveredNode"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      class="ui-tooltip pointer-events-none absolute z-50 flex max-w-xs flex-col gap-1"
    >
      <span class="break-all font-mono text-xs">{{ hoveredNode.data.fullName }}</span>
      <span class="flex items-center justify-between gap-4 text-xs">
        <span class="opacity-70">{{ store.statNiceName(sizeMetric) }}</span>
        <span class="font-mono tabular-nums">{{ formatNumber(hoveredNode.value) }}</span>
      </span>
      <span class="flex items-center justify-between gap-4 text-xs">
        <span class="opacity-70">{{ store.statNiceName(colorMetric) }}</span>
        <span class="font-mono tabular-nums">{{ formatNumber(hoveredNode.data.colorValue) }}</span>
      </span>
    </div>

    <!-- Circle packing canvas -->
    <div ref="chart" class="h-full w-full"></div>

    <!-- Context menu -->
    <div v-if="contextMenu.visible && contextMenu.node" class="fixed inset-0 z-40 cursor-default" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
    <div
      v-if="contextMenu.visible && contextMenu.node"
      class="ui-menu ui-popover absolute z-50 min-w-[200px] animate-in"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="ui-menu-title">{{ contextMenu.node.data.unit ? unitLabel : 'Namespace' }}</div>

      <template v-if="!contextMenu.node.data.unit">
        <button type="button" class="ui-menu-item" @click="promoteNamespaceToGroup">
          <Icon icon="folder" :size="13" class="text-neutral-500"/>
          <span>Promote to group</span>
        </button>
      </template>

      <template v-else>
        <div class="ui-menu-title">Add to group</div>
        <div class="max-h-48 overflow-y-auto">
          <button v-for="g in grainGroups" :key="g.id" type="button" class="ui-menu-item" @click="addLeafToGroup(g.id)">
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
            <span class="truncate">{{ g.name }}</span>
          </button>
          <div v-if="grainGroups.length === 0" class="px-2 py-1.5 text-sm text-neutral-400">No groups yet</div>
        </div>
        <div class="my-1 hairline-t"></div>
        <button type="button" class="ui-menu-item text-red-700" @click="removeLeafFromGroups">
          <Icon icon="minus" :size="13"/>
          <span>Remove from groups</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Icon from "~/components/ui/common/Icon.vue"
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme"
import { levelColor } from "~/composables/useHealth"
import { useExportables } from "~/composables/useExportables"
import type { LegendItem } from "~/utils/figure"
import { formatNumber } from "~/utils/format"
import * as d3 from "d3"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useDataStore } from "~/stores/data"
import { hasMember, units, useGroupsStore, type SavedGroup } from "~/stores/groups"

export type HotspotGrain = "components" | "directories" | "files"
export type HotspotLayout = "packed" | "flat"

// One row of the active grain: a component, a directory or a file. `name` is
// the full identifier; every other key is a `family__metric` column.
export type HotspotUnit = Record<string, any> & { name: string }

const store = useDataStore()
const groupsStore = useGroupsStore()
const { version: themeVersion } = useChartTheme()

const host = ref<HTMLElement | null>(null)
const chart = ref<HTMLElement | null>(null)

let rootNode: any = null
let chartWidth = 900
let chartHeight = 620

const props = defineProps<{
  units: HotspotUnit[]
  grain: HotspotGrain
  layout: HotspotLayout
  sizeMetric: string
  colorMetric: string
  /** Low heat values are the hot ones (code health). */
  heatInverted?: boolean
  highlightedUnit: string | null
  labelHigh: string
  labelLow: string
  searchQuery?: string
  selectedUnits?: string[]
  hiddenGroups?: Set<string>
  activeFilters?: Set<string>
  hoveredGroupId?: string | null
}>()

const emit = defineEmits<{
  (e: "select", name: string): void
  (e: "open", name: string): void
  (e: "toggle-selection", name: string): void
  (e: "replace-selection", names: string[]): void
}>()

const unitLabel = computed(() => props.grain === "components" ? "Component" : props.grain === "files" ? "File" : "Directory")

// Saved groups only exist for components and files; directories carry none.
const grainGroups = computed<SavedGroup[]>(() => {
  if (props.grain === "directories") return []
  return groupsStore.groups
})

function groupsOf(name: string): SavedGroup[] {
  if (props.grain === "components") return groupsStore.componentGroupIndex.get(name) || []
  if (props.grain === "files") return groupsStore.fileGroupIndex.get(name) || []
  return []
}

// Group colours are stored as `hsl(...)` strings; alpha them for fills.
function groupFill(hslStr: string, opacity: number): string {
  if (!hslStr) return withAlpha(chartTheme().inkMuted, 0.03)
  if (hslStr.startsWith("hsl(")) return hslStr.replace("hsl(", "hsla(").replace(")", `, ${opacity})`)
  return hslStr
}

const hoveredNode = ref<any | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

const contextMenu = ref<{ visible: boolean; x: number; y: number; node: any }>({ visible: false, x: 0, y: 0, node: null })

function closeContextMenu() {
  contextMenu.value.visible = false
}

function openContextMenu(event: MouseEvent, d: any) {
  if (props.grain === "directories") return
  event.preventDefault()
  event.stopPropagation()
  const bounds = host.value?.getBoundingClientRect()
  if (!bounds) return
  contextMenu.value = { visible: true, x: event.clientX - bounds.left, y: event.clientY - bounds.top, node: d }
}

function promoteNamespaceToGroup() {
  const node = contextMenu.value.node
  if (!node) return
  const leaves: string[] = []
  const collect = (d: any) => {
    if (d.data.unit) leaves.push(d.data.unit.name)
    else if (d.children) d.children.forEach(collect)
  }
  collect(node)
  if (leaves.length > 0) {
    const nsName = node.data.fullName || node.data.name
    groupsStore.createGroup(`Namespace ${nsName}`, units(props.grain === "files" ? "file" : "component", leaves))
  }
  closeContextMenu()
}

function addLeafToGroup(groupId: string) {
  const node = contextMenu.value.node
  if (node?.data.unit) groupsStore.addMembersToGroup(groupId, units(props.grain === "files" ? "file" : "component", [node.data.unit.name]))
  closeContextMenu()
}

function removeLeafFromGroups() {
  const node = contextMenu.value.node
  if (node?.data.unit) {
    const name = node.data.unit.name
    const kind = props.grain === "files" ? "file" : "component"
    for (const g of grainGroups.value) {
      if (hasMember(g, kind, name)) groupsStore.removeMembersFromGroup(g.id, units(kind, [name]))
    }
  }
  closeContextMenu()
}

const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.3, 15])
  // d3-zoom resolves its extent inside the transition's tween, and its default
  // reads the svg's own width: on a CSS-sized element that throws mid-frame and
  // the transition dies silently. State the box instead.
  .extent(() => {
    const rect = chart.value?.getBoundingClientRect()
    return [[0, 0], [rect?.width || 900, rect?.height || 620]]
  })
  .filter(event => !event.shiftKey && !event.button)

function svgSel() {
  if (!chart.value) return null
  const svg = d3.select(chart.value).select<SVGSVGElement>("svg")
  return svg.empty() ? null : svg
}

function zoomToNode(d: any) {
  const svg = svgSel()
  if (!svg || !d) return
  const padding = 40
  const targetDim = Math.min(chartWidth, chartHeight) - padding * 2
  const scale = targetDim / (d.r * 2)
  const tx = chartWidth / 2 - scale * d.x
  const ty = chartHeight / 2 - scale * d.y
  svg.transition().duration(750).call(zoomBehavior.transform as any, d3.zoomIdentity.translate(tx, ty).scale(scale))
}

function zoomIn() {
  svgSel()?.transition().duration(250).call(zoomBehavior.scaleBy as any, 1.35)
}

function zoomOut() {
  svgSel()?.transition().duration(250).call(zoomBehavior.scaleBy as any, 0.75)
}

function resetZoom() {
  if (rootNode) zoomToNode(rootNode)
}

useExportables().register({
  kind: "figure",
  get title() { return props.grain === "files" ? "Hotspots: files" : props.grain === "directories" ? "Hotspots: directories" : "Hotspots: components" },
  ready: () => !!svgSel(),
  render: () => {
    const svg = svgSel()?.node()
    if (!svg || !chart.value) return null
    const t = chartTheme()
    const [lo, hi] = props.heatInverted ? [t.heat[t.heat.length - 1], t.heat[0]] : [t.heat[0], t.heat[t.heat.length - 1]]
    const legend: LegendItem[] = [
      { label: `Area: ${store.statNiceName(props.sizeMetric) || props.sizeMetric}`, color: t.hairlineStrong },
      { label: `${store.statNiceName(props.colorMetric) || props.colorMetric}: low`, color: lo },
      { label: "high", color: hi },
    ]
    return { kind: "svg", svg, width: chart.value.clientWidth, height: chart.value.clientHeight, legend }
  },
})

defineExpose({ zoomIn, zoomOut, resetZoom })

// Layout and grain changes reset the zoom; everything else keeps it. Declared
// before the redraw watcher so it runs first in the same flush.
let keepTransform = true
watch(() => [props.grain, props.layout], () => { keepTransform = false })

watch(() => [
  props.units,
  props.grain,
  props.layout,
  props.sizeMetric,
  props.colorMetric,
  props.heatInverted,
  props.highlightedUnit,
  props.labelHigh,
  props.labelLow,
  props.searchQuery,
  props.selectedUnits,
  props.hiddenGroups,
  props.activeFilters,
  props.hoveredGroupId,
  groupsStore.groups,
  themeVersion.value,
], () => {
  drawCirclePack()
}, { deep: true })

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  drawCirclePack()
  if (chart.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => drawCirclePack())
    resizeObserver.observe(chart.value)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function drawCirclePack() {
  if (!chart.value) return
  const chartEl = d3.select(chart.value)

  let currentTransform: d3.ZoomTransform | null = null
  const existingSvg = chartEl.select("svg")
  if (!existingSvg.empty() && keepTransform) {
    currentTransform = d3.zoomTransform(existingSvg.node() as any)
  }
  keepTransform = true

  chartEl.selectAll("svg").remove()
  hoveredNode.value = null

  if (!props.units || props.units.length === 0) {
    rootNode = null
    return
  }

  const t = chartTheme()

  // 1. Hierarchy from namespaces (packed) or a single ring of leaves (flat).
  const hierarchyData = props.layout === "flat"
    ? buildFlat(props.units, props.sizeMetric, props.colorMetric)
    : buildHierarchy(props.units, props.sizeMetric, props.colorMetric)
  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))

  const rect = chart.value.getBoundingClientRect()
  const width = rect.width || 900
  const height = rect.height || 620

  rootNode = root
  chartWidth = width
  chartHeight = height

  // 2. Pack
  d3.pack()
    .size([width - 40, height - 40])
    .padding(props.layout === "flat" ? 3 : 6)(root)

  // 3. SVG
  const svg = chartEl.append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("font-family", t.fontSans)
    .style("overflow", "visible")
    .style("cursor", "grab")
    .style("touch-action", "none")
    .on("click", function (event) {
      if (event.defaultPrevented) return
      if (event.target === this) zoomToNode(root)
    })

  const g = svg.append("g")

  const query = props.searchQuery?.trim().toLowerCase()
  const isMatch = (d: any) => {
    if (!query) return true
    const full = d.data.unit?.name || d.data.fullName || ""
    const nodeName = d.data.name || ""
    return full.toLowerCase().includes(query) || nodeName.toLowerCase().includes(query)
  }

  zoomBehavior
    .on("start", () => { svg.style("cursor", "grabbing") })
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
      const k = event.transform.k

      g.selectAll(".leaf-label")
        .style("display", (d: any) => {
          if (query) return isMatch(d) ? "block" : "none"
          return (d.r * k >= 15) ? "block" : "none"
        })
        .style("font-size", `${9.5 / k}px`)

      g.selectAll(".namespace-label")
        .style("display", (d: any) => (d.r * k >= 35) ? "block" : "none")
        .style("font-size", (d: any) => `${(d.depth === 1 ? 11 : 8.5) / k}px`)
        .attr("y", (d: any) => -d.r + (d.depth === 1 ? 14 : 10) / k)

      g.selectAll(".callout-flag")
        .style("opacity", k > 1.4 ? 0 : 1)
        .style("display", k > 1.4 ? "none" : "block")
    })
    .on("end", () => { svg.style("cursor", "grab"); declutter(g) })

  svg.call(zoomBehavior).on("dblclick.zoom", null)

  // Shift-drag box selection.
  let dragSelectionBox: any = null
  let dragStartG: { x: number; y: number } | null = null

  const pointInG = (event: MouseEvent) => {
    const bounds = svg.node()?.getBoundingClientRect()
    if (!bounds) return null
    const transform = d3.zoomTransform(svg.node() as any)
    return {
      x: (event.clientX - bounds.left - transform.x) / transform.k,
      y: (event.clientY - bounds.top - transform.y) / transform.k,
    }
  }

  svg.on("mousedown", function (event) {
    if (!event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    const p = pointInG(event)
    if (!p) return
    dragStartG = p
    dragSelectionBox = g.append("rect")
      .attr("class", "drag-select-box")
      .attr("x", p.x).attr("y", p.y).attr("width", 0).attr("height", 0)
      .attr("fill", withAlpha(t.blue, 0.08))
      .attr("stroke", t.blue)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3")
  })

  svg.on("mousemove", function (event) {
    if (!dragStartG || !dragSelectionBox) return
    const p = pointInG(event)
    if (!p) return
    dragSelectionBox
      .attr("x", Math.min(dragStartG.x, p.x))
      .attr("y", Math.min(dragStartG.y, p.y))
      .attr("width", Math.abs(dragStartG.x - p.x))
      .attr("height", Math.abs(dragStartG.y - p.y))
  })

  svg.on("mouseup", function (event) {
    if (!dragStartG || !dragSelectionBox) return
    const p = pointInG(event)
    if (!p) return
    const x = Math.min(dragStartG.x, p.x)
    const y = Math.min(dragStartG.y, p.y)
    const w = Math.abs(dragStartG.x - p.x)
    const h = Math.abs(dragStartG.y - p.y)

    const selectedList: string[] = []
    root.leaves().forEach((d: any) => {
      if (!d.data.unit) return
      if (d.x >= x && d.x <= x + w && d.y >= y && d.y <= y + h && getNodeOpacity(d) >= 0.2) {
        selectedList.push(d.data.unit.name)
      }
    })
    if (w > 3 && h > 3 && selectedList.length > 0) emit("replace-selection", selectedList)

    dragSelectionBox.remove()
    dragSelectionBox = null
    dragStartG = null
  })

  // Initial or restored transform.
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

  // Heat ramp from the theme; inverted perspectives (code health) run it backwards.
  const colorValues = root.leaves().map(d => d.data.colorValue || 0)
  const minVal = d3.min(colorValues) || 0
  const maxVal = d3.max(colorValues) || 1
  const domain: [number, number] = props.heatInverted ? [maxVal, minVal || 1] : [minVal || 1, maxVal]
  const colorScale = d3.scaleSequential().domain(domain).interpolator(d3.interpolateRgbBasis(t.heat))

  const node = g.selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`)

  const getNodeOpacity = (d: any) => {
    if (!d.data.unit) return 1
    const name = d.data.unit.name
    if (hoveredNode.value?.data.unit?.name === name) return 1
    if (query && !isMatch(d)) return 0.05
    if (props.hoveredGroupId) {
      return groupsOf(name).some(gr => gr.id === props.hoveredGroupId) ? 1 : 0.05
    }
    if (props.activeFilters && props.activeFilters.size > 0) {
      return groupsOf(name).some(gr => props.activeFilters!.has(gr.id)) ? 1 : 0.05
    }
    return 1
  }

  const isHighlighted = (d: any) => !!props.highlightedUnit && d.data.unit?.name === props.highlightedUnit

  // Namespace circles (zoom targets).
  node.filter(d => !!d.children && d.depth > 0)
    .append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => d.data.isGroup ? groupFill(d.data.groupColor, 0.04) : withAlpha(t.inkMuted, 0.03))
    .attr("stroke", d => d.data.isGroup ? d.data.groupColor : withAlpha(t.inkMuted, 0.14))
    .attr("stroke-width", d => d.data.isGroup ? 2.5 : Math.max(1, 3.5 - d.depth))
    .style("vector-effect", "non-scaling-stroke")
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("fill", d.data.isGroup ? groupFill(d.data.groupColor, 0.08) : withAlpha(t.blue, 0.04))
        .attr("stroke", d.data.isGroup ? d.data.groupColor : withAlpha(t.blue, 0.25))
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("fill", d.data.isGroup ? groupFill(d.data.groupColor, 0.04) : withAlpha(t.inkMuted, 0.03))
        .attr("stroke", d.data.isGroup ? d.data.groupColor : withAlpha(t.inkMuted, 0.14))
    })
    .on("click", function (event, d) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      zoomToNode(d)
    })
    .on("contextmenu", (event, d) => openContextMenu(event, d))

  // Leaves.
  const leaf = node.filter(d => !d.children)

  // Selection rings.
  leaf.append("circle")
    .attr("r", d => d.r + 3)
    .attr("fill", "none")
    .attr("stroke", t.blue)
    .attr("stroke-width", 2)
    .style("pointer-events", "none")
    .style("display", d => (props.selectedUnits?.includes(d.data.unit?.name) ? "block" : "none"))

  // Flat layout has no namespace circles, so group membership becomes a ring.
  if (props.layout === "flat") {
    leaf.filter(d => !!d.data.groupColor)
      .append("circle")
      .attr("r", d => d.r + 1.5)
      .attr("fill", "none")
      .attr("stroke", d => d.data.groupColor)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", d => getNodeOpacity(d))
      .style("vector-effect", "non-scaling-stroke")
      .style("pointer-events", "none")
  }

  const baseStroke = (d: any) => {
    if (isHighlighted(d)) return t.ink
    if (query && isMatch(d)) return t.blue
    return withAlpha(t.ink, 0.08)
  }
  const baseStrokeWidth = (d: any) => isHighlighted(d) ? 3 : (query && isMatch(d)) ? 2.5 : 1.2
  const baseFilter = (d: any) => {
    if (isHighlighted(d)) return `drop-shadow(0 0 10px ${withAlpha(t.ink, 0.25)})`
    if (query && isMatch(d)) return `drop-shadow(0 0 6px ${withAlpha(t.blue, 0.35)})`
    return null
  }

  leaf.append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => {
      const val = d.data.colorValue || 0
      // No activity at all fades into the ground instead of reading as "cool".
      if (val === 0) return withAlpha(t.hairline, 0.45)
      return colorScale(val)
    })
    .attr("fill-opacity", d => getNodeOpacity(d))
    .attr("stroke-opacity", d => getNodeOpacity(d) * 0.8)
    .attr("stroke", d => baseStroke(d))
    .attr("stroke-width", d => baseStrokeWidth(d))
    .style("cursor", "pointer")
    .style("vector-effect", "non-scaling-stroke")
    .style("transition", "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)")
    .style("pointer-events", d => getNodeOpacity(d) < 0.2 ? "none" : "auto")
    .style("filter", d => baseFilter(d))
    .on("mouseover", function (event, d) {
      if (getNodeOpacity(d) < 0.2) return
      d3.select(this)
        .attr("stroke", t.ink)
        .attr("stroke-width", 2.2)
        .style("filter", `drop-shadow(0 0 8px ${withAlpha(t.ink, 0.18)})`)
      hoveredNode.value = d
      placeTooltip(event)
    })
    .on("mousemove", function (event) { placeTooltip(event) })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke", baseStroke(d))
        .attr("stroke-width", baseStrokeWidth(d))
        .style("filter", baseFilter(d))
      hoveredNode.value = null
    })
    .on("click", function (event, d) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      if (!d.data.unit) return
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        emit("toggle-selection", d.data.unit.name)
      } else {
        emit("select", d.data.unit.name)
      }
    })
    .on("dblclick", function (event, d) {
      event.preventDefault()
      event.stopPropagation()
      if (d.data.unit) emit("open", d.data.unit.name)
    })
    .on("contextmenu", (event, d) => openContextMenu(event, d))

  // Namespace labels.
  node.filter(d => !!d.children && d.depth > 0 && d.depth < 3)
    .append("text")
    .attr("class", "namespace-label")
    .attr("text-anchor", "middle")
    .attr("fill", withAlpha(t.inkSecondary, 0.65))
    .style("font-weight", "600")
    .style("letter-spacing", "0.05em")
    .style("text-shadow", `0 1px 2px ${withAlpha(t.surface, 0.9)}`)
    .style("pointer-events", "none")
    .text(d => d.data.name)

  // Leaf labels.
  leaf.append("text")
    .attr("class", "leaf-label")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .attr("fill", t.ink)
    .style("font-weight", "600")
    .style("font-size", "8.5px")
    .style("text-shadow", `0 1px 2px ${withAlpha(t.surface, 0.85)}`)
    .style("pointer-events", "none")
    .attr("fill-opacity", d => getNodeOpacity(d))
    .text(d => {
      const name = d.data.name
      const maxChars = Math.floor(d.r / 3.5)
      if (maxChars < 1) return ""
      return name.length > maxChars ? name.substring(0, maxChars) + ".." : name
    })
    .style("display", d => {
      if (query) return isMatch(d) ? "block" : "none"
      return d.r < 15 ? "none" : "block"
    })

  // Callout flags: the hottest and the coolest leaf.
  const leaves = root.leaves()
  if (leaves.length > 0) {
    const heat = (d: any) => (props.heatInverted ? -1 : 1) * (d.data.colorValue || 0)
    const withHeat = leaves.filter(d => (d.data.colorValue || 0) !== 0)
    const ranked = [...(withHeat.length ? withHeat : leaves)].sort((a, b) => heat(b) - heat(a))
    const hottest = ranked[0]
    const coolest = ranked[ranked.length - 1]

    const showHot = hottest && (hottest.data.colorValue || 0) !== 0 && (!query || isMatch(hottest))
    const showCool = coolest && coolest !== hottest && (!query || isMatch(coolest))
    if (showHot) drawCallout(g, hottest, props.labelHigh, levelColor("bad"), -120, -50)
    if (showCool) {
      // Two neighbours both flagged above-left and above-right can still
      // meet in the middle; the coolest drops below its circle when they would.
      let dy = -50
      if (showHot) {
        const hx = hottest.x - 120, hy = hottest.y - 50
        const cx = coolest.x + 120, cy = coolest.y - 50
        if (Math.abs(hx - cx) < 150 && Math.abs(hy - cy) < 34) dy = coolest.r + 40
      }
      drawCallout(g, coolest, props.labelLow, levelColor("good"), 120, dy)
    }
  }
}

/**
 * Hide labels that would print over one another. Namespaces outrank leaves,
 * outer namespaces outrank inner ones, bigger circles outrank smaller: what
 * stays is the most important label at every spot, never two run together
 * ("Pre[i18n]nta").
 */
function declutter(g: any) {
  const nodes = [...g.selectAll(".namespace-label, .leaf-label").nodes()] as SVGTextElement[]
  const rank = (el: SVGTextElement) => {
    const d: any = (el as any).__data__
    const ns = el.classList.contains("namespace-label")
    return (ns ? 0 : 10) + (ns ? d.depth : 0) - (d.r || 0) / 1e6
  }
  // The Hottest and Coolest flags are drawn over everything; a label under
  // one reads as part of it, so their boxes count as taken first.
  const kept: DOMRect[] = ([...g.selectAll(".callout-flag rect").nodes()] as SVGRectElement[])
    .filter(el => (el.closest(".callout-flag") as SVGGElement | null)?.style.display !== "none")
    .map(el => el.getBoundingClientRect())
    .filter(b => b.width > 0)
  for (const el of nodes.sort((a, b) => rank(a) - rank(b))) {
    if (el.style.display === "none" || !el.textContent) continue
    const b = el.getBoundingClientRect()
    if (b.width === 0) continue
    const hits = kept.some(k => b.left < k.right + 2 && b.right > k.left - 2 && b.top < k.bottom + 1 && b.bottom > k.top - 1)
    if (hits) el.style.display = "none"
    else kept.push(b)
  }
}

function placeTooltip(event: MouseEvent) {
  const bounds = host.value?.getBoundingClientRect()
  if (!bounds) return
  tooltipX.value = event.clientX - bounds.left + 16
  tooltipY.value = event.clientY - bounds.top + 16
}

function drawCallout(parentGroup: any, targetNode: any, text: string, color: string, dx: number, dy: number) {
  const t = chartTheme()
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

  const rectWidth = 140
  const rectHeight = 26

  calloutG.append("rect")
    .attr("x", flagX - rectWidth / 2)
    .attr("y", flagY - rectHeight / 2)
    .attr("width", rectWidth)
    .attr("height", rectHeight)
    .attr("rx", 4)
    .attr("fill", withAlpha(t.surface, 0.95))
    .attr("stroke", color)
    .attr("stroke-width", 1.2)

  calloutG.append("text")
    .attr("x", flagX)
    .attr("y", flagY + 3.5)
    .attr("text-anchor", "middle")
    .attr("fill", t.ink)
    .style("font-weight", "600")
    .style("font-size", "9px")
    .style("letter-spacing", "0.02em")
    .text(text)
}

function leafOf(unit: HotspotUnit, sizeKey: string, colorKey: string, shortName: string, groupColor?: string) {
  return {
    name: shortName,
    fullName: unit.name,
    unit,
    value: Math.max(Number(unit[sizeKey]) || 0, 1),
    colorValue: Number(unit[colorKey]) || 0,
    groupColor,
  }
}

function shortNameOf(name: string): string {
  const lastDelim = Math.max(name.lastIndexOf("/"), name.lastIndexOf("."), name.lastIndexOf("\\"))
  return lastDelim !== -1 ? name.substring(lastDelim + 1) : name
}

function visibleGroupOf(name: string): SavedGroup | undefined {
  return groupsOf(name).find(g => !props.hiddenGroups?.has(g.id))
}

// Flat: every leaf directly under the root, one pack, no namespace circles.
function buildFlat(units: HotspotUnit[], sizeKey: string, colorKey: string) {
  return {
    name: "root",
    children: units.map(u => leafOf(u, sizeKey, colorKey, shortNameOf(u.name), visibleGroupOf(u.name)?.color)),
  }
}

// Packed: saved groups first, then the `/`, `\` or `.` separated namespace tree.
function buildHierarchy(units: HotspotUnit[], sizeKey: string, colorKey: string) {
  const root: any = { name: "root", children: [] }
  const groupNodes = new Map<string, any>()
  const unassignedNode: any = { name: "Unassigned", children: [] }
  root.children.push(unassignedNode)

  units.forEach(unit => {
    const name = unit.name
    const group = visibleGroupOf(name)

    if (group) {
      let gNode = groupNodes.get(group.id)
      if (!gNode) {
        gNode = { name: group.name, fullName: group.name, children: [], isGroup: true, groupColor: group.color }
        root.children.push(gNode)
        groupNodes.set(group.id, gNode)
      }
      gNode.children.push(leafOf(unit, sizeKey, colorKey, shortNameOf(name), group.color))
      return
    }

    let parts = [name]
    if (name.includes("\\")) parts = name.split("\\").filter(x => x)
    else if (name.includes("/")) parts = name.split("/").filter(x => x)
    else if (name.includes(".")) parts = name.split(".")
    if (parts.length === 0) parts = [name]

    let current = unassignedNode
    let path = ""
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx]
      const isLeaf = idx === parts.length - 1
      path = path ? `${path}/${part}` : part
      let existing = current.children.find((c: any) => c.name === part)

      if (isLeaf) {
        if (!existing) current.children.push(leafOf(unit, sizeKey, colorKey, part))
        // Directory grain: a row whose name is also a namespace of deeper rows
        // keeps its own circle inside that namespace.
        else if (existing.children) existing.children.push(leafOf(unit, sizeKey, colorKey, part))
        break
      }

      if (!existing) {
        existing = { name: part, fullName: path, children: [] }
        current.children.push(existing)
      } else if (existing.unit && !existing.children) {
        // The reverse order of the case above: the row arrived before its children.
        const self = existing
        existing = { name: part, fullName: path, children: [self] }
        current.children[current.children.indexOf(self)] = existing
      }
      current = existing
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
  // A single top-level namespace adds nothing but a ring; unwrap it.
  while (root.children.length === 1 && root.children[0].children && !root.children[0].isGroup) {
    root.children = root.children[0].children
  }
  return root
}
</script>
