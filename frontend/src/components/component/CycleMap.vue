<template>
  <!-- The tangle, drawn.
       Every cycle leaves this component and comes back to it, so it sits in
       the middle and everything it loops through rings it. One rule carries
       the meaning: a bold accent line is an import worth removing, captioned
       with the cycles it breaks; everything else is the rest of the subgraph,
       drawn whole and kept quiet. Choosing a cut dashes that line and fades
       whatever is no longer in any cycle — the tangle comes apart on screen. -->
  <div ref="host" class="relative w-full select-none">
    <svg :width="width" :height="height" class="block" role="img" :aria-label="caption">
      <defs>
        <marker v-for="m in markers" :id="`${uid}-${m.key}`" :key="m.key" viewBox="0 -4 8 8" refX="7" refY="0" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,-3L7,0L0,3" :class="m.fill"/>
        </marker>
      </defs>

      <g>
        <path
          v-for="edge in laidOut"
          :key="edge.key"
          :d="edge.d"
          fill="none"
          class="transition-opacity focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          :class="[edge.stroke, edge.cut !== null ? 'cursor-pointer' : '']"
          :stroke-width="edge.width"
          :stroke-dasharray="edge.cutAway ? '3 3' : undefined"
          :marker-end="edge.cutAway ? undefined : `url(#${uid}-${edge.marker})`"
          :opacity="edge.opacity"
          :tabindex="edge.cut !== null ? 0 : undefined"
          :role="edge.cut !== null ? 'button' : undefined"
          :aria-label="edge.title"
          @click="edge.cut !== null && emit('select-cut', edge.cut)"
          @keydown.enter.prevent="edge.cut !== null && emit('select-cut', edge.cut)"
          @mouseenter="hovered = edge.key"
          @mouseleave="hovered = null"
        >
          <title>{{ edge.title }}</title>
        </path>
      </g>

      <!-- The ring: everything this component loops through -->
      <g v-for="node in ring" :key="node.name">
        <circle
          :cx="node.x"
          :cy="node.y"
          :r="node.r"
          class="cursor-pointer fill-neutral-400 transition-opacity"
          :class="{ 'fill-accent-500': node.name === selectedNode }"
          :opacity="node.opacity"
          tabindex="0"
          role="button"
          :aria-label="`${node.name}, in ${node.cycles} cycles`"
          @click="emit('select-node', node.name)"
          @keydown.enter.prevent="emit('select-node', node.name)"
          @mouseenter="hovered = node.name"
          @mouseleave="hovered = null"
        >
          <title>{{ node.name }} — in {{ formatNumber(node.cycles) }} {{ node.cycles === 1 ? "cycle" : "cycles" }}</title>
        </circle>
        <text
          :transform="node.labelTransform"
          :text-anchor="node.anchor"
          class="pointer-events-none text-[10px]"
          :class="node.name === selectedNode ? 'fill-neutral-900' : 'fill-neutral-500'"
          :opacity="node.opacity"
          dy="0.32em"
        >{{ node.label }}</text>
      </g>

      <!-- Each cut says, on the line itself, what removing it buys. -->
      <g v-for="edge in captioned" :key="`caption-${edge.key}`" :opacity="edge.opacity">
        <rect :x="edge.lx - edge.w / 2" :y="edge.ly - 8" :width="edge.w" height="16" rx="8" class="fill-surface stroke-accent-500" stroke-width="1"/>
        <text :x="edge.lx" :y="edge.ly" text-anchor="middle" dy="0.32em" class="fill-neutral-900 font-mono text-[10px]">{{ edge.breaks }}</text>
      </g>

      <!-- The component itself -->
      <circle :cx="cx" :cy="cy" :r="30" class="fill-surface stroke-accent-500" stroke-width="2"/>
      <text :x="cx" :y="cy" text-anchor="middle" dy="0.32em" class="fill-neutral-900 font-mono text-[11px]">{{ centreLabel }}</text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { edgeKey } from "~/utils/cycles"
import { formatNumber } from "~/utils/format"

export interface MapNode { name: string; label: string; cycles: number }
export interface MapEdge { from: string; to: string; cycles: number; cut: number | null; breaks?: number }

const props = defineProps<{
  centre: string
  centreLabel: string
  nodes: MapNode[]
  edges: MapEdge[]
  /** Edges no longer in any surviving cycle, by edgeKey. */
  dimmedEdges: Set<string>
  /** Components no longer in any surviving cycle. */
  dimmedNodes: Set<string>
  /** The edge currently chosen as a cut, by edgeKey. */
  cutEdge: string | null
  selectedNode: string | null
}>()

const emit = defineEmits<{ (e: "select-cut", index: number): void; (e: "select-node", name: string): void }>()

const uid = `cyclemap-${Math.random().toString(36).slice(2, 8)}`
const markers = [
  { key: "out", fill: "fill-accent-500" },
  { key: "mid", fill: "fill-neutral-400" },
]

const host = ref<HTMLElement | null>(null)
const width = ref(900)
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  width.value = Math.max(560, host.value.getBoundingClientRect().width)
  if (typeof ResizeObserver === "undefined") return
  observer = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width
    if (w && Math.abs(w - width.value) > 1) width.value = Math.max(560, w)
  })
  observer.observe(host.value)
})
onBeforeUnmount(() => { observer?.disconnect(); observer = null })

const hovered = ref<string | null>(null)

const LABEL_ROOM = 104
const height = computed(() => Math.min(620, Math.max(400, props.nodes.length * 14 + 260)))
const cx = computed(() => width.value / 2)
const cy = computed(() => height.value / 2)
/** Room for a ring of labels on both sides of the circle. */
const radius = computed(() => Math.max(80, Math.min(width.value / 2 - LABEL_ROOM - 40, height.value / 2 - LABEL_ROOM - 12)))

const maxCycles = computed(() => Math.max(1, ...props.nodes.map(n => n.cycles)))

interface Placed extends MapNode { x: number; y: number; r: number; anchor: "start" | "end"; labelTransform: string; opacity: number }

const ring = computed<Placed[]>(() => {
  const n = props.nodes.length
  return props.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2
    const deg = (angle * 180) / Math.PI
    const left = Math.cos(angle) < 0
    return {
      ...node,
      x: cx.value + radius.value * Math.cos(angle),
      y: cy.value + radius.value * Math.sin(angle),
      r: 3 + 4 * (node.cycles / maxCycles.value),
      anchor: left ? "end" : "start",
      // The classic radial label: out along the radius, flipped on the left
      // half so nothing reads upside down.
      labelTransform: `translate(${cx.value},${cy.value}) rotate(${deg}) translate(${radius.value + 10},0)${left ? " rotate(180)" : ""}`,
      opacity: dimNode(node.name),
    }
  })
})

function dimNode(name: string): number {
  if (props.dimmedNodes.has(name)) return 0.12
  if (props.selectedNode && props.selectedNode !== name) return 0.25
  return 1
}

interface Drawn {
  key: string; d: string; width: number; stroke: string; marker: string; opacity: number
  title: string; cut: number | null; cutAway: boolean
  from: string; to: string; breaks: number | null
}

const maxEdge = computed(() => Math.max(1, ...props.edges.map(e => e.cycles)))
const positionOf = computed(() => {
  const map = new Map<string, { x: number; y: number; r: number }>()
  for (const node of ring.value) map.set(node.name, { x: node.x, y: node.y, r: node.r })
  map.set(props.centre, { x: cx.value, y: cy.value, r: 30 })
  return map
})

/** Shorten a segment at both ends so the line meets the circles, not their middles. */
function trim(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  return { x1: a.x + ux * (a.r + 1), y1: a.y + uy * (a.r + 1), x2: b.x - ux * (b.r + 3), y2: b.y - uy * (b.r + 3) }
}

const laidOut = computed<Drawn[]>(() => props.edges.flatMap(edge => {
  const a = positionOf.value.get(edge.from)
  const b = positionOf.value.get(edge.to)
  if (!a || !b) return []
  const key = edgeKey(edge.from, edge.to)
  const { x1, y1, x2, y2 } = trim(a, b)

  const touchesCentre = edge.from === props.centre || edge.to === props.centre
  const d = touchesCentre
    ? `M${x1},${y1} L${x2},${y2}`
    // A chord between two ring components bows toward the middle, so it reads
    // as going through the tangle rather than across it.
    : `M${x1},${y1} Q${(x1 + x2) / 2 + (cx.value - (x1 + x2) / 2) * 0.45},${(y1 + y2) / 2 + (cy.value - (y1 + y2) / 2) * 0.45} ${x2},${y2}`

  const candidate = edge.cut !== null
  const stroke = candidate ? "stroke-accent-500" : "stroke-neutral-400"
  const marker = candidate ? "out" : "mid"
  const cutAway = props.cutEdge === key
  const dimmed = props.dimmedEdges.has(key)
  const active = hovered.value === key || hovered.value === edge.from || hovered.value === edge.to
  const nodeFilter = props.selectedNode && edge.from !== props.selectedNode && edge.to !== props.selectedNode

  return [{
    key,
    from: edge.from,
    to: edge.to,
    breaks: edge.breaks ?? null,
    d,
    width: (candidate ? 1.6 : 0.9) + 2.4 * (edge.cycles / maxEdge.value),
    stroke,
    marker,
    opacity: cutAway ? 0.4 : dimmed || nodeFilter ? 0.06 : active ? 1 : candidate ? 0.85 : 0.16,
    title: `${edge.from} imports ${edge.to} — in ${formatNumber(edge.cycles)} ${edge.cycles === 1 ? "cycle" : "cycles"}${edge.cut !== null ? `. Cut ${edge.cut + 1} in the plan.` : ""}`,
    cut: edge.cut,
    cutAway,
  }]
}))

/**
 * Where a cut's number sits: along its own line, clear of the centre, and
 * clear of every number placed before it. Two cuts leaving the centre side by
 * side put their pills at the same point and read as one number ("15 31").
 * Each slides along its own line to the first spot that is free; the biggest
 * cuts are placed first and keep the natural spot.
 */
const PILL_H = 16
const SPOTS = [0.62, 0.48, 0.76, 0.36, 0.86, 0.28]
const captioned = computed(() => {
  const placed: Array<{ x: number; y: number; w: number }> = []
  const clashes = (x: number, y: number, w: number) =>
    placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 2 && Math.abs(p.y - y) < PILL_H + 2)
  return laidOut.value
    .filter(e => e.cut !== null && e.breaks !== null)
    .sort((x, y) => (y.breaks ?? 0) - (x.breaks ?? 0))
    .map(e => {
      const a = positionOf.value.get(e.from)!
      const b = positionOf.value.get(e.to)!
      const w = Math.max(18, String(e.breaks).length * 7 + 10)
      const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      let spot = at(SPOTS[0])
      for (const t of SPOTS) {
        const p = at(t)
        if (!clashes(p.x, p.y, w)) { spot = p; break }
      }
      placed.push({ x: spot.x, y: spot.y, w })
      return { ...e, lx: spot.x, ly: spot.y, w }
    })
})

const caption = computed(() =>
  `${props.centreLabel} at the centre, ringed by the ${props.nodes.length} components its cycles run through.`)
</script>
