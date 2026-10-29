<template>
  <!-- The layers picture, rooted at routes: each lane a column, read left to
       right from the request to the tables and systems it ends at. A link is
       a call the trace followed; a dashed one reaches an implementation of
       an interface. Picking a box keeps what it reaches and what reaches it. -->
  <ExhibitFrame :exhibit="figure">
    <!-- Narrower than five readable lanes (the panel open on a small
         window), the picture keeps its lanes and scrolls sideways. -->
    <div ref="box" class="relative w-full overflow-x-auto" :style="{ height: height + 16 + 'px' }">
      <svg v-if="w > 0" ref="svgEl" :width="total" :height="height" class="block select-none" role="img" :aria-label="t('http.flowLanes.ariaLabel')" @click.self="emit('select', null)">
        <defs>
          <marker :id="`${uid}-arrow`" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="fill-neutral-400"/></marker>
        </defs>
        <g v-for="(lane, i) in LANES" :key="lane">
          <text :x="colX(i)" y="12" class="fill-neutral-500 text-[11px] font-medium uppercase tracking-wide">{{ laneLabel(lane) }}</text>
          <text v-if="flow.hidden[lane]" :x="colX(i) + 8" :y="TOP + flow.lanes[lane].length * STEP + 12" class="fill-neutral-400 text-[11px]">{{ t('http.flowLanes.more', { count: flow.hidden[lane] }) }}</text>
        </g>
        <g v-for="e in drawn" :key="e.key" :class="{ 'opacity-15': dim && !lit.has(e.from) || dim && !lit.has(e.to) }">
          <path :d="e.d" fill="none" :stroke-width="1.2" :stroke-dasharray="e.kind === 'implementation' ? '4 3' : undefined" :class="edgeClass(e.kind)" :marker-end="`url(#${uid}-arrow)`"/>
        </g>
        <g
          v-for="n in placed" :key="n.id" :transform="`translate(${n.x},${n.y})`" class="cursor-pointer"
          :class="{ 'opacity-30': dim && !lit.has(n.id) }"
          role="button" :aria-pressed="selected === n.id" :aria-label="n.label"
          @click.stop="emit('select', selected === n.id ? null : n.id)"
        >
          <rect :width="colW" :height="NODE" rx="4" :class="nodeClass(n)" :stroke-width="selected === n.id ? 1.5 : 1"/>
          <text x="8" :y="NODE / 2 + 4" class="text-[12px]" :class="n.lane === 'routes' ? 'fill-neutral-900 font-mono text-[11px]' : 'fill-neutral-900'">{{ clip(n.label) }}</text>
          <text v-if="n.lane !== 'routes' && n.routes > 1" :x="colW - 7" :y="NODE / 2 + 4" text-anchor="end" class="fill-neutral-400 font-mono text-[10px]">{{ n.routes }}</text>
          <title>{{ n.label }}{{ n.component ? ` · ${n.component}` : "" }}{{ n.routes ? ` · ${t('http.flowLanes.reachedBy', { count: n.routes })}` : "" }}</title>
        </g>
      </svg>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useSvgFigure } from "~/features/export/useExportables"
import { chartTheme } from "~/shared/ui/useChartTheme"
import { t } from "~/shared/i18n"
import { LANES, type Flow, type FlowEdge, type FlowNode, type Lane } from "../http"

const props = defineProps<{ flow: Flow; selected: string | null; title: string }>()
const emit = defineEmits<{ (e: "select", id: string | null): void }>()

const svgEl = ref<SVGSVGElement | null>(null)
const figure = useSvgFigure({
  title: () => props.title,
  svg: () => (placed.value.length ? svgEl.value : null),
  legend: () => {
    const theme = chartTheme()
    return {
      items: [
        { label: t("http.flowLanes.call"), color: theme.hairlineStrong, mark: "line" },
        { label: t("http.flowLanes.implementation"), color: theme.inkMuted, mark: "dashed" },
        { label: t("http.flowLanes.table"), color: theme.amber, mark: "swatch" },
        { label: t("http.flowLanes.system"), color: theme.blue, mark: "swatch" },
      ],
      notes: [t("http.flowLanes.lanesNote"), t("http.flowLanes.countNote")],
    }
  },
})

const uid = `fl${Math.random().toString(36).slice(2, 8)}`
const NODE = 24
const STEP = 30
const TOP = 24
const GAP = 44

const box = ref<HTMLElement | null>(null)
const w = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === "undefined") return
  ro = new ResizeObserver(([e]) => { w.value = Math.floor(e.contentRect.width) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const colW = computed(() => Math.max(150, Math.floor((w.value - GAP * (LANES.length - 1)) / LANES.length)))
const colX = (i: number) => i * (colW.value + GAP)
const total = computed(() => colX(LANES.length - 1) + colW.value)
const height = computed(() => TOP + Math.max(1, ...LANES.map(l => props.flow.lanes[l].length + (props.flow.hidden[l] ? 1 : 0))) * STEP + 8)

interface Placed extends FlowNode { x: number; y: number }
const placed = computed<Placed[]>(() => LANES.flatMap((lane, i) => props.flow.lanes[lane].map((n, k) => ({ ...n, x: colX(i), y: TOP + k * STEP }))))
const at = computed(() => new Map(placed.value.map(p => [p.id, p])))

interface Drawn extends FlowEdge { key: string; d: string }
const drawn = computed<Drawn[]>(() => props.flow.edges.flatMap(e => {
  const a = at.value.get(e.from), b = at.value.get(e.to)
  if (!a || !b) return []
  const ay = a.y + NODE / 2, by = b.y + NODE / 2
  let d: string
  if (a.x === b.x) {
    // Within one lane: an arc through the gap on its right.
    const x = a.x + colW.value
    const bend = Math.min(GAP - 6, 14 + Math.abs(by - ay) / 6)
    d = `M${x},${ay} C${x + bend},${ay} ${x + bend},${by} ${x + 2},${by}`
  } else if (a.x < b.x) {
    const x1 = a.x + colW.value, x2 = b.x - 2
    const mid = (x1 + x2) / 2
    d = `M${x1},${ay} C${mid},${ay} ${mid},${by} ${x2},${by}`
  } else {
    // Backwards: under the boxes, from the left edge of a to the right of b.
    const x1 = a.x, x2 = b.x + colW.value + 2
    d = `M${x1},${ay} C${x1 - GAP / 2},${ay} ${x2 + GAP / 2},${by} ${x2},${by}`
  }
  return [{ ...e, key: `${e.from}>${e.to}`, d }]
}))

// What the picked box reaches and what reaches it.
const lit = computed(() => {
  const out = new Set<string>()
  if (!props.selected) return out
  out.add(props.selected)
  const walk = (start: string, forward: boolean) => {
    const queue = [start]
    while (queue.length) {
      const id = queue.shift()!
      for (const e of props.flow.edges) {
        const [from, to] = forward ? [e.from, e.to] : [e.to, e.from]
        if (from === id && !out.has(to)) { out.add(to); queue.push(to) }
      }
    }
  }
  walk(props.selected, true)
  walk(props.selected, false)
  return out
})
const dim = computed(() => !!props.selected)

// Cut in the middle: two routes or classes that share a long start differ
// at their end, and the end is what tells them apart.
const clip = (s: string) => {
  const max = Math.max(8, Math.floor((colW.value - 30) / 6.6))
  if (s.length <= max) return s
  const head = Math.ceil((max - 1) * 0.45)
  return s.slice(0, head) + "…" + s.slice(s.length - (max - 1 - head))
}
function laneLabel(l: Lane): string {
  return {
    routes: t("http.flowLanes.routes"),
    handlers: t("http.flowLanes.handlers"),
    services: t("http.flowLanes.services"),
    data: t("http.flowLanes.data"),
    systems: t("http.flowLanes.systems"),
  }[l]
}
function nodeClass(n: FlowNode): string {
  if (props.selected === n.id) return "fill-accent-50 stroke-accent-500"
  if (n.lane === "systems") return n.ref.startsWith("table:") ? "fill-amber-50 stroke-amber-300" : "fill-blue-50 stroke-blue-300"
  return "fill-surface stroke-neutral-300 hover:stroke-neutral-500"
}
function edgeClass(kind: FlowEdge["kind"]): string {
  if (kind === "table") return "stroke-amber-400"
  if (kind === "system") return "stroke-blue-400"
  if (kind === "implementation") return "stroke-neutral-400"
  return "stroke-neutral-300"
}
</script>
