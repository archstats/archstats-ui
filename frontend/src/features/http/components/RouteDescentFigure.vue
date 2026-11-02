<template>
  <!-- How the chosen routes go down the layers. Floors as the Units view
       stacks them: the routes on top, then each of the framework's layers
       with the classes the routes' code passes on it, then the tables they
       touch and the systems they call. A line is a call (red where it goes
       back up the floors), a write, a read or a call out, as thick as the
       routes it carries. Pointing at anything lights the routes through it. -->
  <ExhibitFrame :exhibit="figure" header="custom" fill>
    <div class="flex h-9 shrink-0 items-center gap-2 pl-4 pr-2 hairline-b">
      <span class="min-w-0 truncate text-xs font-medium text-neutral-900">{{ heading }}</span>
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <ExhibitButton/>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet !px-1.5" :title="t('http.catalog.hideLayers')" :aria-label="t('http.catalog.hideLayers')" @click="emit('hide')"><Icon icon="panel-right-close" :size="14" class="text-neutral-500"/></button>
      </span>
    </div>
    <div ref="box" class="min-h-0 flex-1 overflow-auto">
      <p v-if="!data.floors.length" class="px-4 py-8 text-sm text-neutral-500">{{ t('http.descent.empty') }}</p>
      <svg v-else-if="w > 0" ref="svgEl" :width="w" :height="height" class="block select-none" role="img" :aria-label="heading" @mouseleave="hover = null">
        <!-- Floors: a label on the left as the Units view gives its lanes. -->
        <g v-for="(f, i) in data.floors" :key="f.id" :transform="`translate(0 ${floorY(i)})`">
          <rect x="8" y="0" :width="w - 16" :height="FLOOR_H" rx="6" fill="rgb(var(--c-neutral-500))" :opacity="i % 2 ? 0.035 : 0.055"/>
          <circle cx="22" :cy="FLOOR_H / 2 - 6" r="4" :fill="floorColor(f)"/>
          <text x="32" :y="FLOOR_H / 2 - 2" font-size="12" font-weight="500" fill="rgb(var(--c-neutral-900))">{{ clip(floorLabel(f), 18) }}</text>
          <text x="32" :y="FLOOR_H / 2 + 12" font-size="10.5" fill="rgb(var(--c-neutral-500))">{{ floorSub(f) }}</text>
        </g>
        <!-- Links under the nodes. -->
        <g fill="none">
          <path v-for="l in drawn" :key="l.key" :d="l.d" :stroke="l.color" :stroke-width="l.width" :stroke-dasharray="l.dash" stroke-linecap="round"
                :opacity="linkOpacity(l)" class="transition-opacity duration-150"><title>{{ l.title }}</title></path>
        </g>
        <g v-for="n in placed" :key="n.node.id" class="cursor-pointer" :opacity="nodeOpacity(n.node)"
           @mouseenter="hover = n.node" @click="emit('node', n.node)">
          <rect :x="n.x" :y="n.y" :width="n.w" :height="NODE_H" rx="4" :fill="nodeFill(n.node)" :stroke="nodeStroke(n.node)" :stroke-width="isPicked(n.node) ? 2 : 1" :stroke-dasharray="n.node.plumbing || n.node.kind === 'more' ? '3 2' : undefined"/>
          <text :x="n.x + 7" :y="n.y + NODE_H / 2 + 4" font-size="11.5" :class="n.node.kind === 'route' || n.node.kind === 'table' ? 'font-mono' : ''" :fill="n.node.plumbing ? 'rgb(var(--c-neutral-500))' : 'rgb(var(--c-neutral-900))'">
            <tspan v-if="n.node.kind === 'route'" :fill="methodColor(n.node.label)" font-weight="600">{{ n.node.label.split(' ')[0] }} </tspan>{{ clip(nodeText(n.node), Math.max(2, Math.floor((n.w - 14 - (n.node.routes.size > 1 ? 22 : 0)) / 6.6) - (n.node.kind === 'route' ? n.node.label.split(' ')[0].length + 1 : 0))) }}
          </text>
          <text v-if="n.node.routes.size > 1 && n.node.kind !== 'route'" :x="n.x + n.w - 6" :y="n.y + NODE_H / 2 + 4" font-size="10" text-anchor="end" class="font-mono" fill="rgb(var(--c-neutral-500))">{{ n.node.routes.size }}</text>
          <title>{{ n.node.kind === 'more' ? t('http.descent.moreTitle', { count: n.node.members.length }) : n.node.title }}{{ n.node.plumbing ? `\n${t('http.descent.sharedTitle')}` : '' }}</title>
        </g>
      </svg>
    </div>
    <!-- The key, under the picture it reads. -->
    <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[11px] text-neutral-600 hairline-t">
      <span v-for="k in LEGEND" :key="k.kind" class="flex items-center gap-1">
        <svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" :stroke="k.color" stroke-width="2" :stroke-dasharray="k.dash"/></svg>{{ t(`http.descent.legend.${k.kind}`) }}
      </span>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import Icon from "~/shared/ui/Icon.vue"
import ExhibitButton from "~/features/export/components/ExhibitButton.vue"
import { useSvgFigure } from "~/features/export/useExportables"
import { t, intlLocale } from "~/shared/i18n"
import type { Descent, DescentFloor, DescentLink, DescentNode } from "../descent"

const props = defineProps<{
  data: Descent
  heading: string
  laneLabel: (lane: string) => string
  laneColor: (lane: string) => string
  /** Routes to light from outside (the picked endpoint); null lights all. */
  lit: ReadonlySet<number> | null
  picked: string | null
}>()
const emit = defineEmits<{ (e: "node", n: DescentNode): void; (e: "fit", perFloor: number): void; (e: "hide"): void }>()

const fmt = (n: number) => n.toLocaleString(intlLocale)
const hover = ref<DescentNode | null>(null)
const box = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const w = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === "undefined") return
  ro = new ResizeObserver(([e]) => {
    w.value = Math.floor(e.contentRect.width)
    // As many nodes a floor as fit at a readable width.
    emit("fit", Math.max(3, Math.floor((w.value - LEFT - 16 + 6) / (MIN_NODE + 6))))
  })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const FLOOR_H = 52
const GAP = 40
const TOP = 12
const LEFT = 150
const NODE_H = 26
const MIN_NODE = 96
const floorY = (i: number) => TOP + i * (FLOOR_H + GAP)
const height = computed(() => TOP + props.data.floors.length * (FLOOR_H + GAP))

const LEGEND = [
  { kind: "call", color: "rgb(var(--c-neutral-400))", dash: undefined },
  { kind: "up", color: "rgb(var(--c-red-500))", dash: undefined },
  { kind: "write", color: "rgb(var(--c-blue-600))", dash: undefined },
  { kind: "may", color: "rgb(var(--c-blue-400))", dash: "3 2" },
  { kind: "read", color: "rgb(var(--c-neutral-300))", dash: undefined },
  { kind: "out", color: "rgb(var(--c-amber-500))", dash: undefined },
]

// Nodes spread across each floor, most travelled first, as wide as fits.
const placed = computed(() => {
  const out: Array<{ node: DescentNode; x: number; y: number; w: number }> = []
  const room = Math.max(120, w.value - LEFT - 16)
  props.data.floors.forEach((f, i) => {
    const n = f.nodes.length
    const nw = Math.min(190, Math.max(MIN_NODE, (room - (n - 1) * 6) / n))
    const span = n * nw + (n - 1) * 6
    const x0 = LEFT + Math.max(0, (room - span) / 2)
    f.nodes.forEach((node, k) => out.push({ node, x: x0 + k * (nw + 6), y: floorY(i) + (FLOOR_H - NODE_H) / 2, w: nw }))
  })
  return out
})
const at = computed(() => new Map(placed.value.map(p => [p.node.id, p])))

const COLOR: Record<string, string> = {
  call: "rgb(var(--c-neutral-400))", up: "rgb(var(--c-red-500))", write: "rgb(var(--c-blue-600))", may: "rgb(var(--c-blue-400))", read: "rgb(var(--c-neutral-300))", out: "rgb(var(--c-amber-500))",
}
const drawn = computed(() => {
  const total = Math.max(1, props.data.routes)
  return props.data.links.map(l => {
    const a = at.value.get(l.from), b = at.value.get(l.to)
    if (!a || !b) return null
    const kind = l.kind === "call" && l.up ? "up" : l.kind
    let d: string
    if (a.y === b.y) {
      // Within one floor: an arc under the two.
      const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2, y = a.y + NODE_H
      d = `M${x1},${y} C${x1},${y + 22} ${x2},${y + 22} ${x2},${y}`
    } else {
      const down = b.y > a.y
      const x1 = a.x + a.w / 2, y1 = down ? a.y + NODE_H : a.y
      const x2 = b.x + b.w / 2, y2 = down ? b.y : b.y + NODE_H
      const m = (y1 + y2) / 2
      d = `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`
    }
    return {
      key: `${l.from}>${l.to}`, link: l, d, color: COLOR[kind], dash: kind === "may" ? "4 3" : undefined,
      width: 1 + 4 * Math.sqrt(l.routes.size / total),
      title: t("http.descent.linkTitle", { from: label(l.from), to: label(l.to), count: l.routes.size, kind: t(`http.descent.legend.${kind}`) }),
    }
  }).filter(x => !!x)
})
const label = (id: string) => { const n = at.value.get(id)?.node; return n ? nodeText(n) : id }

// What lights: the routes through the node under the pointer, else those lit from outside.
const lightRoutes = computed<ReadonlySet<number> | null>(() => (hover.value ? hover.value.routes : props.lit))
const touchesLit = (routes: Set<number>) => { const s = lightRoutes.value; if (!s) return true; for (const r of routes) if (s.has(r)) return true; return false }
const nodeOpacity = (n: DescentNode) => (touchesLit(n.routes) ? 1 : 0.22)
const linkOpacity = (l: { link: DescentLink }) => (touchesLit(l.link.routes) ? (lightRoutes.value ? 0.95 : 0.55) : 0.06)
const isPicked = (n: DescentNode) => props.picked === n.id

function nodeText(n: DescentNode): string {
  if (n.kind === "more") return t("http.descent.more", { count: n.members.length })
  if (n.kind === "route") return n.label.slice(n.label.indexOf(" ") + 1)
  return n.label
}
function nodeFill(n: DescentNode): string {
  if (n.kind === "route") return "rgb(var(--c-surface))"
  if (n.kind === "table") return "rgb(var(--c-violet-500) / 0.14)"
  if (n.kind === "system") return "rgb(var(--c-amber-500) / 0.16)"
  if (n.kind === "more") return "rgb(var(--c-surface))"
  return n.plumbing ? "rgb(var(--c-surface))" : tint(props.laneColor(n.lane ?? ""))
}
function nodeStroke(n: DescentNode): string {
  if (isPicked(n)) return "rgb(var(--c-neutral-900))"
  if (n.kind === "table") return "rgb(var(--c-violet-500) / 0.6)"
  if (n.kind === "system") return "rgb(var(--c-amber-500) / 0.7)"
  if (n.kind === "class" && !n.plumbing) return props.laneColor(n.lane ?? "")
  return "rgb(var(--c-neutral-300))"
}
// rgb(var(--c-x-500)) at a fifth.
const tint = (c: string) => c.replace(/\)\)$/, ") / 0.16)")
function floorColor(f: DescentFloor): string {
  if (f.kind === "routes") return "rgb(var(--c-neutral-700))"
  if (f.kind === "data") return "rgb(var(--c-violet-500))"
  if (f.kind === "outside") return "rgb(var(--c-amber-500))"
  return props.laneColor(f.lane ?? "")
}
function floorLabel(f: DescentFloor): string {
  if (f.kind === "routes") return t("http.descent.floorRoutes")
  if (f.kind === "data") return t("http.descent.floorData")
  if (f.kind === "outside") return t("http.descent.floorOutside")
  return props.laneLabel(f.lane ?? "")
}
const floorSub = (f: DescentFloor) => t(f.kind === "routes" ? "http.descent.subRoutes" : f.kind === "data" ? "http.descent.subTables" : f.kind === "outside" ? "http.descent.subSystems" : "http.descent.subClasses", { count: f.total })
function methodColor(label: string): string {
  const m = label.split(" ")[0].split(",")[0]
  return m === "GET" ? "rgb(var(--c-blue-700))" : m === "POST" ? "rgb(var(--c-green-700))" : m === "PUT" || m === "PATCH" ? "rgb(var(--c-amber-700))" : m === "DELETE" ? "rgb(var(--c-red-700))" : "rgb(var(--c-neutral-600))"
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s)

const figure = useSvgFigure({
  title: () => props.heading,
  svg: () => svgEl.value,
  legendInUi: false,
  legend: () => {
    const css = getComputedStyle(document.documentElement)
    const tok = (v: string) => `rgb(${css.getPropertyValue(v).trim().split(/\s+/).join(",")})`
    return {
      items: [
        { label: t("http.descent.legend.call"), color: tok("--c-neutral-400"), mark: "line" as const },
        { label: t("http.descent.legend.up"), color: tok("--c-red-500"), mark: "line" as const },
        { label: t("http.descent.legend.write"), color: tok("--c-blue-600"), mark: "line" as const },
        { label: t("http.descent.legend.read"), color: tok("--c-neutral-300"), mark: "line" as const },
        { label: t("http.descent.legend.out"), color: tok("--c-amber-500"), mark: "line" as const },
      ],
      notes: [t("http.descent.note", { count: fmt(props.data.routes) })],
    }
  },
})
</script>
