<template>
  <div ref="host" class="relative h-[320px] w-full overflow-hidden bg-surface">
    <svg ref="svgRef" class="h-full w-full" role="img" aria-label="Classes that import this class and classes it imports"></svg>
    <ZoomControls position="top-right" @zoom-in="zoomBy(1.4)" @zoom-out="zoomBy(1 / 1.4)" @reset="resetZoom"/>
  </div>
</template>

<script setup lang="ts">
import { useSvgFigure } from "~/composables/useExportables"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme"
import { roleColor, type JavaRole } from "~/utils/java"
import ZoomControls from "~/components/ui/common/ZoomControls.vue"

// One class and its direct neighbours in three columns: classes that import
// it on the left, the class itself in the middle, classes it imports on the
// right. Clicking a neighbour opens its file; the centre is inert.

export interface NeighbourNode {
  id: string
  label: string
  role: JavaRole | null
  file: string
  component: string
  references: number
}

const props = defineProps<{
  centre: { id: string; label: string; role: JavaRole | null; file: string }
  incoming: NeighbourNode[]
  outgoing: NeighbourNode[]
}>()
const emit = defineEmits<{ (e: "open", file: string): void }>()

const host = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const { version } = useChartTheme()

type Side = "in" | "centre" | "out"
type SimNode = d3.SimulationNodeDatum & { id: string; label: string; role: JavaRole | null; file: string; component: string; side: Side; references: number }
type SimEdge = d3.SimulationLinkDatum<SimNode> & { references: number }

let simulation: d3.Simulation<SimNode, SimEdge> | null = null
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null

function columnX(side: Side, width: number): number {
  return side === "in" ? width * 0.18 : side === "out" ? width * 0.82 : width * 0.5
}

function render() {
  const svg = svgRef.value
  if (!svg) return
  const t = chartTheme()
  const rect = svg.getBoundingClientRect()
  const width = rect.width || 700
  const height = rect.height || 320

  simulation?.stop()
  const root = d3.select(svg)
  root.selectAll("*").remove()

  const c = props.centre
  const nodes: SimNode[] = [
    { id: c.id, label: c.label, role: c.role, file: c.file, component: "", side: "centre", references: 0, fx: width / 2, fy: height / 2 },
  ]
  const seen = new Set<string>([c.id])
  const edges: SimEdge[] = []
  const spread = (i: number, n: number) => height * 0.15 + (n <= 1 ? height * 0.35 : (i / (n - 1)) * height * 0.7)
  props.incoming.forEach((n, i) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    nodes.push({ ...n, side: "in", x: columnX("in", width), y: spread(i, props.incoming.length) })
    edges.push({ source: n.id, target: c.id, references: n.references })
  })
  props.outgoing.forEach((n, i) => {
    const id = seen.has(n.id) ? `${n.id}#out` : n.id
    seen.add(id)
    nodes.push({ ...n, id, side: "out", x: columnX("out", width), y: spread(i, props.outgoing.length) })
    edges.push({ source: c.id, target: id, references: n.references })
  })

  const markerId = `neighbour-arrow-${Math.random().toString(36).slice(2, 8)}`
  root.append("defs").append("marker")
    .attr("id", markerId)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
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
    .scaleExtent([0.3, 3])
    // An svg sized in CSS has a relative width, and d3-zoom's default extent
    // reads it: that throws whenever the pane is not rendered. State the box.
    .extent([[0, 0], [width, height]])
    .on("zoom", event => { g.attr("transform", event.transform) })
  root.call(zoom)

  const link = g.append("g").selectAll<SVGLineElement, SimEdge>("line")
    .data(edges)
    .join("line")
    .attr("stroke", withAlpha(t.inkMuted, 0.5))
    .attr("stroke-width", d => Math.min(3, 1 + Math.log2(Math.max(1, d.references))))
    .attr("marker-end", `url(#${markerId})`)

  const node = g.append("g").selectAll<SVGCircleElement, SimNode>("circle")
    .data(nodes, d => d.id)
    .join("circle")
    .attr("r", d => d.side === "centre" ? 10 : 7)
    .attr("fill", d => d.side === "centre" ? t.surface : roleColor(d.role))
    .attr("stroke", d => d.side === "centre" ? roleColor(d.role) : t.surface)
    .attr("stroke-width", d => d.side === "centre" ? 3 : 1.5)
    .style("cursor", d => d.side === "centre" ? "default" : "pointer")
    .on("click", (_event, d) => { if (d.side !== "centre") emit("open", d.file) })

  node.append("title").text(d => {
    const role = d.role ?? "Class"
    return d.side === "centre" ? `${d.label}\n${role}\n${d.file}` : `${d.label}\n${role} in ${d.component}\n${d.file}`
  })

  const label = g.append("g").selectAll<SVGTextElement, SimNode>("text")
    .data(nodes, d => d.id)
    .join("text")
    .text(d => d.label)
    .attr("font-family", t.fontMono)
    .attr("font-size", 11)
    .attr("font-weight", d => d.side === "centre" ? 500 : 400)
    .attr("fill", d => d.side === "centre" ? t.ink : t.inkSecondary)
    .attr("text-anchor", "middle")
    .attr("dy", d => d.side === "centre" ? -15 : -11)
    .style("pointer-events", "none")

  // A side with more than 20 classes cannot carry every name; those labels
  // appear on hover so the graph stays readable at 58 incoming references.
  const sideCount = new Map<string, number>()
  for (const n of nodes) sideCount.set(n.side, (sideCount.get(n.side) ?? 0) + 1)
  const labelVisible = (d: SimNode) => d.side === "centre" || (sideCount.get(d.side) ?? 0) <= 20
  label.attr("opacity", d => labelVisible(d) ? 1 : 0)
  node
    .on("mouseenter", (_event, d) => { label.filter(l => l.id === d.id).attr("opacity", 1).raise() })
    .on("mouseleave", (_event, d) => { label.filter(l => l.id === d.id).attr("opacity", labelVisible(d) ? 1 : 0) })

  const drag = d3.drag<SVGCircleElement, SimNode>()
    .on("start", (event, d) => {
      if (d.side === "centre") return
      if (!event.active) simulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d) => { if (d.side !== "centre") { d.fx = event.x; d.fy = event.y } })
    .on("end", (event, d) => {
      if (d.side === "centre") return
      if (!event.active) simulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  node.call(drag)

  simulation = d3.forceSimulation<SimNode>(nodes)
    .force("link", d3.forceLink<SimNode, SimEdge>(edges).id(d => d.id).distance(width * 0.3).strength(0.2))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("x", d3.forceX<SimNode>(d => columnX(d.side, width)).strength(1.2))
    .force("y", d3.forceY(height / 2).strength(0.08))
    .force("collide", d3.forceCollide(20))
    .on("tick", () => {
      link
        .attr("x1", d => (d.source as SimNode).x ?? 0)
        .attr("y1", d => (d.source as SimNode).y ?? 0)
        .attr("x2", d => (d.target as SimNode).x ?? 0)
        .attr("y2", d => (d.target as SimNode).y ?? 0)
      node.attr("cx", d => d.x ?? 0).attr("cy", d => d.y ?? 0)
      label.attr("x", d => d.x ?? 0).attr("y", d => d.y ?? 0)
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

watch(() => [props.centre, props.incoming, props.outgoing], () => render(), { deep: false })
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

defineExpose({ resetZoom })

useSvgFigure("Class neighbourhood", () => svgRef.value)
</script>
