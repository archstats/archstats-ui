<template>
  <div ref="host" class="relative h-full w-full overflow-hidden bg-surface">
    <svg ref="svgRef" class="h-full w-full select-none" role="img" aria-label="Class graph"></svg>
  </div>
</template>

<script setup lang="ts">
import { useSvgFigure } from "~/composables/useExportables"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme"

// Force-directed class graph on a light canvas. The parent owns the data and
// the selection; this component owns layout, zoom, hover and drag. Nodes keep
// their positions across rebuilds so expanding the explored set does not
// reshuffle what is already on screen.

/** A lane id from the active framework profile (see utils/javaFrameworks). */
export type ClassRole = string

export interface ClassGraphNode {
  id: string
  label: string
  role: ClassRole
}

export interface ClassGraphEdge {
  source: string
  target: string
  refs: number
}

const props = withDefaults(defineProps<{
  nodes: ClassGraphNode[]
  edges: ClassGraphEdge[]
  selectedId?: string | null
  /** Ordered path to emphasise; consecutive pairs light up as edges. */
  pathIds?: string[]
  searchQuery?: string
  lanes?: boolean
  /** Lane definitions in left-to-right order; nodes are pulled to and kept inside their lane. */
  laneDefs?: Array<{ id: string; label: string; color: string }>
  /** Colours by class id that win over the lane colour (the lens dimension's groups). */
  nodeColors?: Map<string, string> | null
}>(), {
  nodeColors: null,
  selectedId: null,
  pathIds: () => [],
  searchQuery: "",
  lanes: true,
  laneDefs: () => [],
})

const emit = defineEmits<{ (e: "select", id: string | null): void }>()

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  role: ClassRole
  degree: number
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  refs: number
  key: string
}

const host = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const { version } = useChartTheme()
const markerId = `class-arrow-${Math.random().toString(36).slice(2, 8)}`

let width = 800
let height = 600
let simulation: d3.Simulation<SimNode, SimLink> | null = null
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let simNodes: SimNode[] = []
let simLinks: SimLink[] = []
let nodeSel: d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown> | null = null
let labelSel: d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null
let linkSel: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null = null
let laneSel: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let hoverId: string | null = null
let resizeObserver: ResizeObserver | null = null
const positions = new Map<string, { x: number; y: number; fx: number | null; fy: number | null }>()

// Lanes come from the framework profile; the last lane catches anything unknown.
function laneCount(): number { return Math.max(props.laneDefs.length, 1) }
function laneIndex(role: ClassRole): number {
  const i = props.laneDefs.findIndex((l) => l.id === role)
  return i === -1 ? laneCount() - 1 : i
}
function laneCentre(role: ClassRole): number { return ((laneIndex(role) + 0.5) / laneCount()) * width }
function laneBounds(role: ClassRole): [number, number] {
  const i = laneIndex(role), n = laneCount()
  return [(i / n) * width, ((i + 1) / n) * width]
}

function roleColor(role: ClassRole): string {
  const t = chartTheme()
  const color = props.laneDefs.find((l) => l.id === role)?.color ?? "neutral"
  switch (color) {
    case "blue": return t.blue
    case "green": return t.green
    case "amber": return t.amber
    case "violet": return t.violet
    case "red": return t.red
    default: return t.inkMuted
  }
}

function radius(d: SimNode): number {
  return 5 + Math.min(8, Math.sqrt(d.degree) * 2)
}

function endpointId(v: string | SimNode): string {
  return typeof v === "string" ? v : v.id
}

function measure() {
  const rect = host.value?.getBoundingClientRect()
  width = Math.max(200, rect?.width || 800)
  height = Math.max(200, rect?.height || 600)
}

function rememberPositions() {
  for (const n of simNodes) {
    if (n.x === undefined || n.y === undefined) continue
    positions.set(n.id, { x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null })
  }
}

function applyForces() {
  if (!simulation) return
  simulation
    .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(70).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("collide", d3.forceCollide<SimNode>().radius((d) => radius(d) + 12))
  if (props.lanes) {
    simulation
      .force("center", null)
      .force("x", d3.forceX<SimNode>((d) => laneCentre(d.role)).strength(0.35))
      .force("y", d3.forceY(height / 2).strength(0.05))
  } else {
    simulation
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.03))
      .force("y", d3.forceY(height / 2).strength(0.03))
  }
}

function drawLanes() {
  if (!laneSel) return
  laneSel.selectAll("*").remove()
  if (!props.lanes) return
  const t = chartTheme()
  const n = laneCount()
  const bounds = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)
  laneSel.selectAll("line")
    .data(bounds)
    .join("line")
    .attr("x1", (f) => f * width).attr("x2", (f) => f * width)
    .attr("y1", 0).attr("y2", height)
    .attr("stroke", t.hairline)
    .attr("stroke-dasharray", "2 4")
  laneSel.selectAll("text")
    .data(props.laneDefs)
    .join("text")
    .attr("x", (l) => laneCentre(l.id))
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-family", t.fontSans)
    .attr("font-size", 11)
    .attr("font-weight", 500)
    .attr("fill", t.inkSecondary)
    .text((l) => l.label)
}

function build() {
  const svg = svgRef.value
  if (!svg) return
  measure()
  rememberPositions()
  if (simulation) simulation.stop()

  const root = d3.select(svg)
  root.selectAll("*").remove()
  const t = chartTheme()

  const defs = root.append("defs")
  for (const [suffix, fill] of [["", t.hairlineStrong], ["-strong", t.ink]] as const) {
    defs.append("marker")
      .attr("id", markerId + suffix)
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", fill)
  }

  const g = root.append("g")
  laneSel = g.append("g").attr("class", "lanes")
  drawLanes()

  root.attr("width", width).attr("height", height)
  // An svg sized in CSS has a relative width, and d3-zoom's default extent
  // reads it: that throws whenever the pane is not rendered. State the box.
  zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).extent([[0, 0], [width, height]]).on("zoom", (event) => {
    g.attr("transform", event.transform)
  })
  root.call(zoom).on("dblclick.zoom", null)
  root.on("click", (event: MouseEvent) => {
    if (event.defaultPrevented) return
    emit("select", null)
  })

  const degree = new Map<string, number>()
  for (const e of props.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }

  simNodes = props.nodes.map((n) => {
    const prev = positions.get(n.id)
    const node: SimNode = { id: n.id, label: n.label, role: n.role, degree: degree.get(n.id) ?? 0 }
    if (prev) {
      node.x = prev.x
      node.y = prev.y
      node.fx = prev.fx
      node.fy = prev.fy
    } else {
      node.x = (props.lanes ? laneCentre(n.role) : width / 2) + (Math.random() - 0.5) * 80
      node.y = height / 2 + (Math.random() - 0.5) * height * 0.6
    }
    return node
  })
  const ids = new Set(simNodes.map((n) => n.id))
  simLinks = props.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target, refs: e.refs, key: `${e.source}>${e.target}` }))

  linkSel = g.append("g").attr("class", "links")
    .selectAll<SVGLineElement, SimLink>("line")
    .data(simLinks, (d) => d.key)
    .join("line")
    .attr("stroke-linecap", "round")

  nodeSel = g.append("g").attr("class", "nodes")
    .selectAll<SVGCircleElement, SimNode>("circle")
    .data(simNodes, (d) => d.id)
    .join("circle")
    .attr("r", radius)
    .style("cursor", "pointer")
    .on("mouseenter", (_event, d) => { hoverId = d.id; restyle() })
    .on("mouseleave", () => { hoverId = null; restyle() })
    .on("click", (event: MouseEvent, d) => {
      event.stopPropagation()
      emit("select", d.id)
    })
    .on("dblclick", (event: MouseEvent, d) => {
      event.stopPropagation()
      d.fx = null
      d.fy = null
      simulation?.alpha(0.3).restart()
    })

  nodeSel.append("title").text((d) => d.id)

  labelSel = g.append("g").attr("class", "labels")
    .selectAll<SVGTextElement, SimNode>("text")
    .data(simNodes, (d) => d.id)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("font-family", t.fontSans)
    .attr("font-size", 11)
    .attr("dy", (d) => -(radius(d) + 5))
    .style("pointer-events", "none")
    .text((d) => d.label)

  const drag = d3.drag<SVGCircleElement, SimNode>()
    .on("start", (event, d) => {
      if (!event.active) simulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event) => {
      // Dragged nodes stay pinned; double-click releases them.
      if (!event.active) simulation?.alphaTarget(0)
    })
  nodeSel.call(drag)

  simulation = d3.forceSimulation<SimNode, SimLink>(simNodes).on("tick", tick)
  applyForces()
  simulation.alpha(positions.size > 0 ? 0.6 : 1).restart()
  restyle()
}

function tick() {
  if (!linkSel || !nodeSel || !labelSel) return
  linkSel
    .attr("x1", (d) => (d.source as SimNode).x ?? 0)
    .attr("y1", (d) => (d.source as SimNode).y ?? 0)
    .attr("x2", (d) => shorten(d).x)
    .attr("y2", (d) => shorten(d).y)
  if (props.lanes) {
    // A class never leaves its lane: the lane is a fact about it, not a suggestion.
    for (const d of simNodes) {
      const [x0, x1] = laneBounds(d.role)
      const pad = radius(d) + 8
      if (d.x !== undefined && d.x < x0 + pad) d.x = x0 + pad
      if (d.x !== undefined && d.x > x1 - pad) d.x = x1 - pad
    }
  }
  nodeSel.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0)
  labelSel.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0)
}

// End the line at the target's rim so the arrowhead touches the node.
function shorten(d: SimLink): { x: number; y: number } {
  const s = d.source as SimNode
  const t = d.target as SimNode
  const dx = (t.x ?? 0) - (s.x ?? 0)
  const dy = (t.y ?? 0) - (s.y ?? 0)
  const len = Math.hypot(dx, dy) || 1
  const gap = radius(t) + 2
  return { x: (t.x ?? 0) - (dx / len) * gap, y: (t.y ?? 0) - (dy / len) * gap }
}

function restyle() {
  if (!nodeSel || !labelSel || !linkSel) return
  const t = chartTheme()
  const q = props.searchQuery.trim().toLowerCase()
  const path = props.pathIds
  const pathSet = new Set(path)
  const pathEdges = new Set<string>()
  for (let i = 0; i + 1 < path.length; i++) pathEdges.add(`${path[i]}>${path[i + 1]}`)
  const focus = hoverId ?? props.selectedId ?? null
  const near = new Set<string>()
  if (focus) {
    near.add(focus)
    for (const l of simLinks) {
      const s = endpointId(l.source)
      const tg = endpointId(l.target)
      if (s === focus) near.add(tg)
      if (tg === focus) near.add(s)
    }
  }

  const labels = new Map(simNodes.map((n) => [n.id, n.label]))
  const nodeOn = (id: string, label: string): boolean => {
    if (pathSet.size > 0 && !pathSet.has(id)) return false
    if (q && !label.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) return false
    if (focus && !near.has(id)) return false
    return true
  }

  nodeSel
    .attr("fill", (d) => props.nodeColors?.get(d.id) ?? roleColor(d.role))
    .attr("stroke", (d) => (d.id === props.selectedId || pathSet.has(d.id) ? t.ink : t.surface))
    .attr("stroke-width", (d) => (d.id === props.selectedId || pathSet.has(d.id) ? 2 : 1.5))
    .attr("opacity", (d) => (nodeOn(d.id, d.label) ? 1 : 0.18))

  // Dense graphs label only the hubs, the focus, the path and search hits;
  // everything else gets its name on hover.
  const dense = simNodes.length > 40
  const degreeCut = dense ? [...simNodes].map((n) => n.degree).sort((a, b) => b - a)[Math.min(19, simNodes.length - 1)] ?? 0 : 0
  const labelOn = (d: SimNode): boolean => {
    if (!nodeOn(d.id, d.label)) return false
    if (!dense || q) return true
    return d.degree >= degreeCut || d.id === props.selectedId || d.id === hoverId || pathSet.has(d.id) || (focus !== null && near.has(d.id))
  }
  labelSel
    .attr("fill", t.ink)
    .attr("font-weight", (d) => (d.id === props.selectedId ? 600 : 400))
    .attr("opacity", (d) => (labelOn(d) ? (nodeOn(d.id, d.label) ? 1 : 0.15) : 0))

  linkSel
    .attr("stroke", (d) => (pathEdges.has(d.key) ? t.ink : t.hairlineStrong))
    .attr("stroke-width", (d) => (pathEdges.has(d.key) ? 2 : 1))
    .attr("marker-end", (d) => `url(#${markerId}${pathEdges.has(d.key) ? "-strong" : ""})`)
    .attr("stroke-opacity", (d) => {
      const s = endpointId(d.source)
      const tg = endpointId(d.target)
      if (pathEdges.has(d.key)) return 1
      if (pathSet.size > 0) return 0.12
      if (focus) return s === focus || tg === focus ? 0.9 : 0.1
      if (q) return nodeOn(s, labels.get(s) ?? s) || nodeOn(tg, labels.get(tg) ?? tg) ? 0.8 : 0.1
      return 0.7
    })

  if (laneSel) laneSel.selectAll("line").attr("stroke", withAlpha(t.hairlineStrong, 0.6))
}

function zoomBy(factor: number) {
  if (!svgRef.value || !zoom) return
  d3.select(svgRef.value).transition().duration(200).call(zoom.scaleBy, factor)
}
function resetZoom() {
  if (!svgRef.value || !zoom) return
  d3.select(svgRef.value).transition().duration(300).call(zoom.transform, d3.zoomIdentity)
}
defineExpose({ zoomIn: () => zoomBy(1.3), zoomOut: () => zoomBy(1 / 1.3), resetZoom })

watch(() => [props.nodes, props.edges], build)
watch(() => props.nodeColors, () => { restyle() })
watch(() => props.laneDefs.map((l) => l.id).join("|"), () => { drawLanes(); applyForces(); simulation?.alpha(0.6).restart() })
watch(() => props.lanes, () => {
  drawLanes()
  applyForces()
  simulation?.alpha(0.5).restart()
})
watch(() => [props.selectedId, props.pathIds, props.searchQuery], restyle)
watch(version, () => { drawLanes(); restyle() })

onMounted(() => {
  build()
  if (host.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      measure()
      drawLanes()
      applyForces()
      simulation?.alpha(0.2).restart()
    })
    resizeObserver.observe(host.value)
  }
})

onBeforeUnmount(() => {
  simulation?.stop()
  simulation = null
  resizeObserver?.disconnect()
  resizeObserver = null
})

useSvgFigure("Class graph", () => svgRef.value)
</script>
