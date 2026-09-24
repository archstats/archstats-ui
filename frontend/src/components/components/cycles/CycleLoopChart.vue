<template>
  <div ref="chartRef" class="h-full w-full"></div>
</template>

<script setup lang="ts">
import { componentPath } from "~/utils/routes"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import { useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import { chartTheme, useChartTheme, withAlpha } from "~/composables/useChartTheme"
import { formatHealth, formatHotspot, healthLevel, levelColor } from "~/composables/useHealth"

// The loop: every component of one cycle on a ring, one arc per edge in cycle
// order. The weakest edge (fewest imports) is red, the selected edge is the
// accent, everything else is a hairline. Labels are the short component name
// and open the component's detail; the full name is the tooltip.

const props = defineProps<{
  nodes: string[]
  edges: Array<{ from: string; to: string; referenceCount: number; sharedCommits: number }>
  selectedEdge?: { from: string; to: string } | null
}>()

const emit = defineEmits<{ (e: "select-edge", edge: { from: string; to: string }): void }>()

const router = useRouter()
const store = useDataStore()
const { version } = useChartTheme()
const chartRef = ref<HTMLElement | null>(null)

interface VisualNode {
  name: string
  label: string
  health: number | null
  hotspot: number | null
  radius: number
  x: number
  y: number
}

interface VisualLink {
  from: string
  to: string
  referenceCount: number
  sharedCommits: number
  source: VisualNode
  target: VisualNode
}

let observer: ResizeObserver | null = null
let tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined> | null = null

onMounted(() => {
  tooltip = d3.select(document.body).append("div")
    .attr("class", "ui-tooltip pointer-events-none fixed z-50 max-w-[320px]")
    .style("display", "none")
  observer = new ResizeObserver(() => renderChart())
  if (chartRef.value) observer.observe(chartRef.value)
  renderChart()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  tooltip?.remove()
  tooltip = null
})

watch([() => props.nodes, () => props.edges, () => props.selectedEdge, version], () => renderChart())

function showTooltip(event: MouseEvent, html: string) {
  if (!tooltip) return
  tooltip.style("display", "block").html(html)
  moveTooltip(event)
}

function moveTooltip(event: MouseEvent) {
  if (!tooltip) return
  const pad = 12
  const width = 320
  const left = Math.min(event.clientX + pad, window.innerWidth - width - pad)
  tooltip.style("left", `${left}px`).style("top", `${event.clientY + pad}px`)
}

function hideTooltip() {
  tooltip?.style("display", "none")
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string))
}

function renderChart() {
  const host = chartRef.value
  if (!host) return
  const container = d3.select(host)
  container.selectAll("*").remove()
  if (!props.nodes.length) return

  const t = chartTheme()
  const rect = host.getBoundingClientRect()
  const width = Math.max(rect.width, 240)
  const height = Math.max(rect.height, 240)
  const ring = Math.min(width, height) * 0.34

  const index = store.allComponentsIndex
  const visualNodes: VisualNode[] = props.nodes.map((name, i) => {
    const comp: any = index.get(name)
    const health = comp && comp.codesmells__code_health != null ? Number(comp.codesmells__code_health) : null
    const hotspot = comp && comp.codesmells__hotspot_score != null ? Number(comp.codesmells__hotspot_score) : null
    const angle = (i / props.nodes.length) * 2 * Math.PI - Math.PI / 2
    return {
      name,
      label: store.getComponentName(name) || name,
      health,
      hotspot,
      radius: 9 + ((hotspot ?? 0) / 100) * 9,
      x: width / 2 + ring * Math.cos(angle),
      y: height / 2 + ring * Math.sin(angle),
    }
  })
  const byName = new Map(visualNodes.map(n => [n.name, n]))

  const links: VisualLink[] = props.edges
    .filter(e => byName.has(e.from) && byName.has(e.to))
    .map(e => ({ ...e, source: byName.get(e.from)!, target: byName.get(e.to)! }))

  const weakest = [...props.edges].sort((a, b) => a.referenceCount - b.referenceCount)[0] ?? null
  const isSelected = (l: { from: string; to: string }) =>
    !!props.selectedEdge && props.selectedEdge.from === l.from && props.selectedEdge.to === l.to
  const isWeakest = (l: { from: string; to: string }) => !!weakest && weakest.from === l.from && weakest.to === l.to
  const strokeFor = (l: VisualLink) => isSelected(l) ? t.accent : isWeakest(l) ? t.red : t.hairlineStrong
  const markerFor = (l: VisualLink) => isSelected(l) ? "selected" : isWeakest(l) ? "weakest" : "default"

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("font-family", t.fontMono)

  const defs = svg.append("defs")
  for (const [id, color] of [["default", t.hairlineStrong], ["weakest", t.red], ["selected", t.accent]] as const) {
    defs.append("marker")
      .attr("id", `cycle-arrow-${id}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", color)
  }

  function arc(l: VisualLink): string {
    const dx = l.target.x - l.source.x
    const dy = l.target.y - l.source.y
    const dist = Math.hypot(dx, dy) || 1
    const ux = dx / dist, uy = dy / dist
    const sx = l.source.x + ux * (l.source.radius + 3)
    const sy = l.source.y + uy * (l.source.radius + 3)
    const tx = l.target.x - ux * (l.target.radius + 9)
    const ty = l.target.y - uy * (l.target.radius + 9)
    const r = dist * 1.15
    return `M${sx},${sy} A${r},${r} 0 0,1 ${tx},${ty}`
  }

  const linkLayer = svg.append("g")
  linkLayer.selectAll("path.edge")
    .data(links)
    .join("path")
    .attr("class", "edge")
    .attr("d", arc)
    .attr("fill", "none")
    .attr("stroke", strokeFor)
    .attr("stroke-width", l => {
      const base = Math.max(1.5, Math.min(4, 1 + l.sharedCommits / 8))
      return isSelected(l) ? base + 1.5 : base
    })
    .attr("stroke-dasharray", l => isWeakest(l) && !isSelected(l) ? "4 3" : null)
    .attr("opacity", l => !props.selectedEdge || isSelected(l) ? 1 : 0.45)
    .attr("marker-end", l => `url(#cycle-arrow-${markerFor(l)})`)

  // Wide invisible twins make the arcs easy to hover and click.
  linkLayer.selectAll("path.hit")
    .data(links)
    .join("path")
    .attr("class", "hit")
    .attr("d", arc)
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 12)
    .style("cursor", "pointer")
    .on("mouseenter", (event: MouseEvent, l) => {
      showTooltip(event, `
        <div class="font-mono">${escapeHtml(store.getComponentName(l.from) || l.from)} &rarr; ${escapeHtml(store.getComponentName(l.to) || l.to)}</div>
        <div class="mt-1 flex gap-3"><span>${l.referenceCount} imports</span><span>${l.sharedCommits} co-changes</span></div>
        ${isWeakest(l) ? '<div class="mt-1">Weakest link</div>' : ""}
      `)
    })
    .on("mousemove", (event: MouseEvent) => moveTooltip(event))
    .on("mouseleave", hideTooltip)
    .on("click", (_event, l) => emit("select-edge", { from: l.from, to: l.to }))

  const nodeLayer = svg.append("g")
  const nodes = nodeLayer.selectAll("g.node")
    .data(visualNodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", n => `translate(${n.x},${n.y})`)

  nodes.append("circle")
    .attr("r", n => n.radius)
    .attr("fill", t.surface)
    .attr("stroke", n => n.health === null ? t.hairlineStrong : levelColor(healthLevel(n.health)))
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseenter", (event: MouseEvent, n) => {
      showTooltip(event, `
        <div class="font-mono">${escapeHtml(n.name)}</div>
        <div class="mt-1 flex gap-3"><span>Health ${formatHealth(n.health)}</span><span>Hotspot ${formatHotspot(n.hotspot)}</span></div>
        <div class="mt-1">Double-click to open</div>
      `)
    })
    .on("mousemove", (event: MouseEvent) => moveTooltip(event))
    .on("mouseleave", hideTooltip)
    .on("dblclick", (_event, n) => { hideTooltip(); router.push(componentPath(n.name)) })

  // Labels are links: the short name shown, the full name as the tooltip.
  const labels = nodes.append("a")
    .attr("href", n => `#${componentPath(n.name)}`)
    .on("click", (event: MouseEvent, n) => { event.preventDefault(); hideTooltip(); router.push(componentPath(n.name)) })
  labels.append("title").text(n => n.name)
  labels.append("text")
    .attr("y", n => n.radius + 14)
    .attr("text-anchor", "middle")
    .attr("fill", t.ink)
    .attr("font-size", 11)
    .attr("font-weight", 500)
    .attr("stroke", withAlpha(t.surface, 0.9))
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke fill")
    .style("cursor", "pointer")
    .text(n => n.label)
}
</script>
