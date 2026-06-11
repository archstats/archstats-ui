<template>
  <div class="relative w-full h-full flex flex-col items-stretch bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
     <!-- Chart Header Controls -->
    <div class="flex items-center justify-between mb-4 select-none">
      <div class="flex items-center gap-2.5">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dependency Loop Visualizer</span>
      </div>
      
      <div class="text-[9.5px] text-slate-400 font-medium italic">
        Hover links to view import details. Double-click nodes to inspect component.
      </div>
    </div>

    <!-- SVG Visualizer Container -->
    <div class="relative flex-1 min-h-[380px] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-slate-900/80">
      <!-- Glow effects -->
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.06)_0%,transparent_65%)] pointer-events-none"></div>
      <div class="absolute inset-0 bg-[radial-gradient(#1e293b_1.2px,transparent_1.2px)] [background-size:18px_18px] opacity-25 pointer-events-none"></div>
      <div :id="chartId" ref="chartRef" class="w-full h-full z-10"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useRouter } from "vue-router"

const router = useRouter()
const store = useDataStore()

const props = defineProps<{
  cycleText: string
  nodes: string[]
  edges: Array<{
    from: string
    to: string
    referenceCount: number
    sharedCommits: number
    files?: Array<{ file: string; count: number; lines: string }>
  }>
  selectedEdge?: { from: string; to: string } | null
}>()

const emit = defineEmits<{
  (e: 'select-edge', edge: { from: string; to: string }): void
}>()

const chartId = "cycle-loop-" + Math.random().toString(36).replace(/[^a-z]+/g, "").substring(2, 10)
const chartRef = ref<HTMLElement | null>(null)

interface VisualNode {
  id: string
  name: string
  displayName: string
  codeHealth: number
  hotspotScore: number
  radius: number
  colorClass: string
  bulletColor: string
  glowColor: string
  x: number
  y: number
}

interface VisualLink {
  id: string
  source: string | VisualNode
  target: string | VisualNode
  referenceCount: number
  sharedCommits: number
  files: Array<{ file: string; count: number; lines: string }>
}

watch([() => props.nodes, () => props.edges, () => props.selectedEdge], () => {
  renderChart()
})

onMounted(() => {
  renderChart()
})

function getAbbreviatedName(name: string): string {
  const parts = name.split(".")
  if (parts.length <= 2) return name
  return parts.slice(-2).join(".")
}

function renderChart() {
  if (!chartRef.value || !props.nodes.length) return

  const container = d3.select(`#${chartId}`)
  container.selectAll("*").remove()

  const rect = chartRef.value.getBoundingClientRect()
  const width = rect.width || 500
  const height = rect.height || 400
  const R = Math.min(width, height) * 0.32 // ring radius

  const compIndex = store.allComponentsIndex
  const visualNodes: VisualNode[] = props.nodes.map((nodeName, idx) => {
    const comp = compIndex.get(nodeName)
    const health = comp ? Number(comp.codesmells__code_health ?? 10) : 10
    const hotspot = comp ? Number(comp.codesmells__hotspot_score ?? 0) : 0
    
    // Size range for nodes
    const radius = 14 + (hotspot / 100) * 20

    // Premium, softer HSL coloring
    let colorClass = "fill-emerald-500/90 stroke-emerald-400"
    let bulletColor = "#10b981"
    let glowColor = "rgba(16, 185, 129, 0.25)"
    
    if (health < 6.0) {
      colorClass = "fill-rose-500/90 stroke-rose-400"
      bulletColor = "#f43f5e"
      glowColor = "rgba(244, 63, 94, 0.25)"
    } else if (health < 8.0) {
      colorClass = "fill-amber-500/90 stroke-amber-400"
      bulletColor = "#f59e0b"
      glowColor = "rgba(245, 158, 11, 0.25)"
    }

    const angle = (idx / props.nodes.length) * 2 * Math.PI - Math.PI / 2
    return {
      id: nodeName,
      name: nodeName,
      displayName: getAbbreviatedName(nodeName),
      codeHealth: health,
      hotspotScore: hotspot,
      radius: radius,
      colorClass: colorClass,
      bulletColor: bulletColor,
      glowColor: glowColor,
      x: width / 2 + R * Math.cos(angle),
      y: height / 2 + R * Math.sin(angle)
    }
  })

  const nodeLookup = new Map<string, VisualNode>(visualNodes.map(n => [n.id, n]))

  const visualLinks: VisualLink[] = props.edges.map(e => {
    const safeFrom = e.from.replace(/[^a-zA-Z0-9-]/g, "_")
    const safeTo = e.to.replace(/[^a-zA-Z0-9-]/g, "_")
    return {
      id: `link-${safeFrom}-to-${safeTo}`,
      source: nodeLookup.get(e.from) || e.from,
      target: nodeLookup.get(e.to) || e.to,
      referenceCount: e.referenceCount,
      sharedCommits: e.sharedCommits,
      files: e.files || []
    }
  })

  const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "transparent")

  // Find weakest link (breaking point) edge
  const sorted = [...props.edges].sort((a, b) => a.referenceCount - b.referenceCount)
  const bp = sorted.length > 0 ? sorted[0] : null

  const defs = svg.append("defs")

  // Default Arrowhead Marker
  defs.append("marker")
    .attr("id", "arrowhead-default")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 5.5)
    .attr("markerHeight", 5.5)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(148, 163, 184, 0.4)")

  // Breaking Point Arrowhead Marker
  defs.append("marker")
    .attr("id", "arrowhead-breaking")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#f43f5e")

  // Selected Arrowhead Marker
  defs.append("marker")
    .attr("id", "arrowhead-selected")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#818cf8")

  const linkGroup = svg.append("g").attr("class", "links")
  const particleGroup = svg.append("g").attr("class", "particles")

  const linkElements = linkGroup.selectAll(".visible-link")
    .data(visualLinks)
    .join("path")
    .attr("class", "visible-link")
    .attr("id", d => d.id)
    .attr("fill", "none")
    .attr("stroke", d => {
      const fromId = typeof d.source === "object" ? d.source.id : d.source
      const toId = typeof d.target === "object" ? d.target.id : d.target
      
      const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId
      if (isSelected) return "#818cf8" // bright indigo-400
      
      const isBP = bp && bp.from === fromId && bp.to === toId
      return isBP ? "rgba(244, 63, 94, 0.65)" : "rgba(148, 163, 184, 0.25)"
    })
    .attr("stroke-width", d => {
      const fromId = typeof d.source === "object" ? d.source.id : d.source
      const toId = typeof d.target === "object" ? d.target.id : d.target
      
      const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId
      const isBP = bp && bp.from === fromId && bp.to === toId
      const baseWidth = Math.max(1.5, Math.min(5, 1.2 + (d.sharedCommits / 8)))
      
      if (isSelected) return baseWidth + 2.0
      return isBP ? baseWidth + 1.2 : baseWidth
    })
    .attr("stroke-dasharray", d => {
      const fromId = typeof d.source === "object" ? d.source.id : d.source
      const toId = typeof d.target === "object" ? d.target.id : d.target
      const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId
      if (isSelected) return null
      
      const isBP = bp && bp.from === fromId && bp.to === toId
      return isBP ? "4 3" : null
    })
    .attr("opacity", d => {
      if (!props.selectedEdge) return 1.0
      const fromId = typeof d.source === "object" ? d.source.id : d.source
      const toId = typeof d.target === "object" ? d.target.id : d.target
      const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId
      return isSelected ? 1.0 : 0.25
    })
    .attr("marker-end", d => {
      const fromId = typeof d.source === "object" ? d.source.id : d.source
      const toId = typeof d.target === "object" ? d.target.id : d.target
      
      const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId
      if (isSelected) return "url(#arrowhead-selected)"
      
      const isBP = bp && bp.from === fromId && bp.to === toId
      return isBP ? "url(#arrowhead-breaking)" : "url(#arrowhead-default)"
    })

  // Render thick invisible overlay paths for easy link hover targeting
  const hoverOverlayLinks = linkGroup.selectAll(".hover-overlay")
    .data(visualLinks)
    .join("path")
    .attr("class", "hover-overlay cursor-pointer")
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 10)

  // Spawned flow particles - much quieter
  const spawnedParticles: { linkId: string; dur: string; delay: string; color: string; size: number; isSelected: boolean }[] = []
  
  visualLinks.forEach(link => {
    const fromId = typeof link.source === "object" ? link.source.id : link.source
    const toId = typeof link.target === "object" ? link.target.id : link.target
    const isSelected = props.selectedEdge && props.selectedEdge.from === fromId && props.selectedEdge.to === toId

    if (link.sharedCommits > 0) {
      // Slower animation speed (3.5s to 9s duration)
      const baseSpeed = Math.max(3.5, 9.0 - Math.log2(link.sharedCommits + 1))
      // Max 2 particles for high logical coupling, 1 otherwise
      const count = link.sharedCommits > 15 ? 2 : 1
      
      // Softer, muted colors and small sizes
      let color = "#cbd5e1"
      let size = 1.0
      if (link.sharedCommits >= 15) {
        color = "#fda4af" // soft rose
        size = 1.4
      } else if (link.sharedCommits >= 5) {
        color = "#fed7aa" // soft orange
        size = 1.2
      }

      if (isSelected) {
        color = "#a5b4fc" // soft indigo
        size += 0.4
      }

      for (let i = 0; i < count; i++) {
        spawnedParticles.push({
          linkId: link.id,
          dur: `${baseSpeed}s`,
          delay: `${(i * baseSpeed) / count}s`,
          color: color,
          size: size,
          isSelected
        })
      }
    }
  })

  const particles = particleGroup.selectAll("circle")
    .data(spawnedParticles)
    .join("circle")
    .attr("r", d => d.size)
    .attr("fill", d => d.color)
    .attr("opacity", d => {
      if (!props.selectedEdge) return 0.45
      return d.isSelected ? 0.8 : 0.15
    })
    .style("color", d => d.color)
    .style("filter", "drop-shadow(0 0 1px currentColor)")

  particles.append("animateMotion")
    .attr("dur", d => d.dur)
    .attr("repeatCount", "indefinite")
    .attr("begin", d => d.delay)
    .append("mpath")
    .attr("href", d => `#${d.linkId}`)

  const nodeGroup = svg.append("g").attr("class", "nodes")

  const nodeElements = nodeGroup.selectAll("g")
    .data(visualNodes)
    .join("g")
    .attr("class", "cursor-pointer group")
    .on("dblclick", (event, d) => {
      router.push(`/views/components/${encodeURIComponent(d.name)}`)
    })

  // Outer glowing ring
  nodeElements.append("circle")
    .attr("r", d => d.radius + 6)
    .attr("fill", "transparent")
    .attr("stroke", "transparent")
    .attr("stroke-width", 2)
    .attr("class", "group-hover:stroke-slate-500/20 group-hover:fill-white/5 transition-all duration-200")
    .style("filter", d => `drop-shadow(0 0 8px ${d.glowColor})`)

  // Solid Core Circle
  nodeElements.append("circle")
    .attr("r", d => d.radius)
    .attr("class", d => `${d.colorClass} transition-all duration-200 stroke-2`)
    .style("filter", "drop-shadow(0 4px 10px rgba(0,0,0,0.5))")

  // Node Labels below node
  nodeElements.append("text")
    .attr("y", d => d.radius + 14)
    .attr("text-anchor", "middle")
    .attr("fill", "#cbd5e1")
    .attr("class", "text-[10px] font-mono font-extrabold select-none group-hover:fill-white transition-colors duration-150")
    .attr("stroke", "#020617") // dark outline for high-contrast legibility
    .attr("stroke-width", "3.5px")
    .attr("paint-order", "stroke fill")
    .text(d => d.displayName)

  // Hover Tooltip for Nodes
  const tooltip = d3.select("body").selectAll(".cycle-node-tooltip")
    .data([null])
    .join("div")
    .attr("class", "cycle-node-tooltip absolute hidden bg-slate-950/95 border border-white/10 text-white text-[10px] p-3 rounded-xl shadow-2xl z-50 pointer-events-none w-60 backdrop-blur-md leading-relaxed")

  nodeElements.on("mouseenter", (event, d) => {
    tooltip.style("display", "block")
      .html(`
        <div class="font-bold text-slate-100 border-b border-white/10 pb-1 mb-1.5 truncate">${d.name}</div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">Code Health:</span>
          <span class="font-mono font-bold" style="color: ${d.bulletColor}">${d.codeHealth.toFixed(1)}/10</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Hotspot Risk:</span>
          <span class="font-mono font-bold text-rose-400">${d.hotspotScore.toFixed(0)}%</span>
        </div>
      `)
  })
  .on("mousemove", (event) => {
    tooltip.style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY - 12}px`)
  })
  .on("mouseleave", () => {
    tooltip.style("display", "none")
  })

  // Hover Tooltip for Links (retrieves snippets locations)
  const linkTooltip = d3.select("body").selectAll(".cycle-link-tooltip")
    .data([null])
    .join("div")
    .attr("class", "cycle-link-tooltip absolute hidden bg-slate-950/95 border border-white/10 text-white text-[10px] p-3.5 rounded-xl shadow-2xl z-50 pointer-events-none w-72 backdrop-blur-md leading-relaxed")

  hoverOverlayLinks.on("mouseenter", (event, d) => {
    linkTooltip.style("display", "block")
    
    const filesList = d.files && d.files.length > 0 
      ? d.files.map(f => `
          <div class="flex items-center justify-between text-[9px] text-slate-350 border-t border-white/5 pt-1 mt-1 font-mono">
            <span class="truncate pr-2 max-w-[65%]" title="${f.file}">${f.file.split('/').pop()}</span>
            <span class="text-slate-400 shrink-0 font-bold">L${f.lines || '?'} (${f.count}x)</span>
          </div>
        `).join("")
      : '<div class="text-slate-500 italic text-[9px] mt-1">No file references found</div>'

    const fromAbbr = getAbbreviatedName(typeof d.source === "object" ? d.source.id : d.source as string)
    const toAbbr = getAbbreviatedName(typeof d.target === "object" ? d.target.id : d.target as string)

    linkTooltip.html(`
      <div class="font-bold text-slate-100 border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between">
        <span class="truncate">${fromAbbr} ➜ ${toAbbr}</span>
        <span class="text-rose-400 font-extrabold font-mono text-[9px]">${d.referenceCount} imports</span>
      </div>
      <div class="text-[9px] text-slate-400 mb-1">
        Logical Coupling (Co-changes): <span class="font-mono text-slate-200 font-bold">${d.sharedCommits}</span>
      </div>
      <div class="mt-2 flex flex-col gap-1">
        <div class="text-[8.5px] uppercase font-black tracking-wider text-slate-400">Import Locations:</div>
        ${filesList}
      </div>
    `)
  })
  .on("mousemove", (event) => {
    linkTooltip.style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY - 12}px`)
  })
  .on("mouseleave", () => {
    linkTooltip.style("display", "none")
  })
  .on("click", (event, d) => {
    const fromId = typeof d.source === "object" ? d.source.id : d.source
    const toId = typeof d.target === "object" ? d.target.id : d.target
    emit("select-edge", { from: fromId, to: toId })
  })

  function calculateLinkPath(source: VisualNode, target: VisualNode, radiusSource: number, radiusTarget: number): string {
    const x1 = source.x || 0
    const y1 = source.y || 0
    const x2 = target.x || 0
    const y2 = target.y || 0

    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.hypot(dx, dy) || 1

    const ux = dx / dist
    const uy = dy / dist

    const paddingSource = radiusSource + 4
    const paddingTarget = radiusTarget + 10

    const sx = x1 + ux * paddingSource
    const sy = y1 + uy * paddingSource
    const tx = x2 - ux * paddingTarget
    const ty = y2 - uy * paddingTarget

    const r = dist * 1.15

    return `M${sx},${sy} A${r},${r} 0 0,1 ${tx},${ty}`
  }

  // Set path geometry for visible links and hover overlays (static circular layout)
  linkElements.attr("d", d => {
    const s = typeof d.source === "object" ? d.source : nodeLookup.get(d.source as string)!
    const t = typeof d.target === "object" ? d.target : nodeLookup.get(d.target as string)!
    return calculateLinkPath(s, t, s.radius, t.radius)
  })
  
  hoverOverlayLinks.attr("d", d => {
    const s = typeof d.source === "object" ? d.source : nodeLookup.get(d.source as string)!
    const t = typeof d.target === "object" ? d.target : nodeLookup.get(d.target as string)!
    return calculateLinkPath(s, t, s.radius, t.radius)
  })

  nodeElements.attr("transform", d => `translate(${d.x},${d.y})`)
}
</script>
