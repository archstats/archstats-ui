<template>
  <div ref="host" class="relative h-[380px] w-full overflow-hidden bg-surface">
    <svg ref="svgRef" class="h-full w-full" role="img" aria-label="Bean wiring inside the component"></svg>
    <ZoomControls position="top-right" @zoom-in="zoomBy(1.4)" @zoom-out="zoomBy(1 / 1.4)" @reset="resetZoom"/>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme"
import { roleColor, type JavaRole } from "~/utils/java"
import ZoomControls from "~/components/ui/common/ZoomControls.vue"

// The force graph of beans and entities inside one component: nodes are
// classes, edges are recorded imports, columns follow the layer order
// controller → service → repository → entity. Selection is owned by the
// page; the graph only reports clicks and restyles around the chosen node.

export interface WiringNode {
  id: string
  label: string
  role: JavaRole | null
  external: boolean
  file: string
  component: string
}
export interface WiringEdge { source: string; target: string; references: number; external: boolean }

const props = defineProps<{
  nodes: WiringNode[]
  edges: WiringEdge[]
  selected: string | null
}>()
const emit = defineEmits<{ (e: "select", id: string): void }>()

const host = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const { version } = useChartTheme()

type SimNode = WiringNode & d3.SimulationNodeDatum
type SimEdge = d3.SimulationLinkDatum<SimNode> & { references: number; external: boolean }

let simulation: d3.Simulation<SimNode, SimEdge> | null = null
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let nodeSel: d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown> | null = null
let labelSel: d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null
let linkSel: d3.Selection<SVGLineElement, SimEdge, SVGGElement, unknown> | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

function columnX(role: JavaRole | null, width: number): number {
  switch (role) {
    case "Controller": return width * 0.15
    case "Configuration": return width * 0.3
    case "Service": return width * 0.45
    case "Repository": return width * 0.7
    case "Entity": return width * 0.88
    default: return width * 0.45
  }
}

function endId(v: string | SimNode): string {
  return typeof v === "string" ? v : v.id
}

function render() {
  const svg = svgRef.value
  if (!svg) return
  const t = chartTheme()
  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 380

  simulation?.stop()
  const root = d3.select(svg)
  root.selectAll("*").remove()
  nodeSel = labelSel = linkSel = null
  if (props.nodes.length === 0) return

  const nodes: SimNode[] = props.nodes.map(n => ({ ...n, x: columnX(n.role, width), y: height / 2 + (Math.random() - 0.5) * height * 0.6 }))
  const ids = new Set(nodes.map(n => n.id))
  const edges: SimEdge[] = props.edges
    .filter(e => ids.has(e.source) && ids.has(e.target))
    .map(e => ({ source: e.source, target: e.target, references: e.references, external: e.external }))

  const markerId = `wiring-arrow-${Math.random().toString(36).slice(2, 8)}`
  root.append("defs").append("marker")
    .attr("id", markerId)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 16)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", withAlpha(t.inkMuted, 0.7))

  const g = root.append("g")
  root.attr("width", width).attr("height", height)
  zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 4])
    // An svg sized in CSS has a relative width, and d3-zoom's default extent
    // reads it: that throws whenever the pane is not rendered. State the box.
    .extent([[0, 0], [width, height]])
    .on("zoom", event => { g.attr("transform", event.transform) })
  root.call(zoom)

  linkSel = g.append("g").selectAll<SVGLineElement, SimEdge>("line")
    .data(edges)
    .join("line")
    .attr("stroke", withAlpha(t.inkMuted, 0.45))
    .attr("stroke-width", d => Math.min(3, 1 + Math.log2(Math.max(1, d.references))))
    .attr("stroke-dasharray", d => d.external ? "3,3" : null)
    .attr("marker-end", `url(#${markerId})`)

  nodeSel = g.append("g").selectAll<SVGCircleElement, SimNode>("circle")
    .data(nodes, d => d.id)
    .join("circle")
    .attr("r", 7)
    .attr("fill", d => d.external ? t.surface : roleColor(d.role))
    .attr("stroke", d => d.external ? roleColor(d.role) : t.surface)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", d => d.external ? "2,2" : null)
    .style("cursor", "pointer")
    .on("click", (_event, d) => emit("select", d.id))

  nodeSel.append("title").text(d => {
    const role = d.role ?? "Class"
    return d.external ? `${d.label}\n${role} in ${d.component}\n${d.file}` : `${d.label}\n${role}\n${d.file}`
  })

  labelSel = g.append("g").selectAll<SVGTextElement, SimNode>("text")
    .data(nodes, d => d.id)
    .join("text")
    .text(d => d.label)
    .attr("font-family", t.fontMono)
    .attr("font-size", 11)
    .attr("fill", d => d.external ? t.inkMuted : t.inkSecondary)
    .attr("text-anchor", "middle")
    .attr("dy", -11)
    .style("pointer-events", "none")

  const drag = d3.drag<SVGCircleElement, SimNode>()
    .on("start", (event, d) => {
      if (!event.active) simulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y })
    .on("end", (event, d) => {
      if (!event.active) simulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  nodeSel.call(drag)

  simulation = d3.forceSimulation<SimNode>(nodes)
    .force("link", d3.forceLink<SimNode, SimEdge>(edges).id(d => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("x", d3.forceX<SimNode>(d => columnX(d.role, width)).strength(1))
    .force("y", d3.forceY(height / 2).strength(0.3))
    .force("collide", d3.forceCollide(22))
    .on("tick", () => {
      linkSel!
        .attr("x1", d => (d.source as SimNode).x ?? 0)
        .attr("y1", d => (d.source as SimNode).y ?? 0)
        .attr("x2", d => (d.target as SimNode).x ?? 0)
        .attr("y2", d => (d.target as SimNode).y ?? 0)
      nodeSel!.attr("cx", d => d.x ?? 0).attr("cy", d => d.y ?? 0)
      labelSel!.attr("x", d => d.x ?? 0).attr("y", d => d.y ?? 0)
    })

  applySelection()
}

// Dim everything not touching the selected node; no rebuild.
function applySelection() {
  if (!nodeSel || !labelSel || !linkSel) return
  const t = chartTheme()
  const selected = props.selected
  if (!selected) {
    nodeSel.attr("opacity", 1).attr("stroke", d => d.external ? roleColor(d.role) : t.surface).attr("stroke-width", 1.5)
    labelSel.attr("opacity", 1)
    linkSel.attr("stroke", withAlpha(t.inkMuted, 0.45)).attr("opacity", 1)
    return
  }
  const near = new Set<string>([selected])
  linkSel.each(d => {
    const s = endId(d.source as string | SimNode), tt = endId(d.target as string | SimNode)
    if (s === selected) near.add(tt)
    if (tt === selected) near.add(s)
  })
  nodeSel
    .attr("opacity", d => near.has(d.id) ? 1 : 0.2)
    .attr("stroke", d => d.id === selected ? t.ink : d.external ? roleColor(d.role) : t.surface)
    .attr("stroke-width", d => d.id === selected ? 2.5 : 1.5)
  labelSel.attr("opacity", d => near.has(d.id) ? 1 : 0.2)
  linkSel
    .attr("opacity", d => {
      const s = endId(d.source as string | SimNode), tt = endId(d.target as string | SimNode)
      return s === selected || tt === selected ? 1 : 0.15
    })
    .attr("stroke", d => {
      const s = endId(d.source as string | SimNode), tt = endId(d.target as string | SimNode)
      return s === selected || tt === selected ? t.inkSecondary : withAlpha(t.inkMuted, 0.45)
    })
}

function zoomBy(factor: number) {
  const svg = svgRef.value
  if (svg && zoom) d3.select(svg).transition().duration(200).call(zoom.scaleBy, factor)
}
function resetZoom() {
  const svg = svgRef.value
  if (svg && zoom) d3.select(svg).transition().duration(300).call(zoom.transform, d3.zoomIdentity)
}

watch(() => [props.nodes, props.edges], () => render(), { deep: false })
watch(() => props.selected, () => applySelection())
watch(version, () => render())

onMounted(() => {
  render()
  if (host.value && typeof ResizeObserver !== "undefined") {
    let lastWidth = host.value.getBoundingClientRect().width
    resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? lastWidth
      if (Math.abs(width - lastWidth) < 1) return
      lastWidth = width
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => render(), 200)
    })
    resizeObserver.observe(host.value)
  }
})

onBeforeUnmount(() => {
  simulation?.stop()
  resizeObserver?.disconnect()
  if (resizeTimer) clearTimeout(resizeTimer)
})
</script>
