<template>
  <!-- Layers or modules as floors, top uses bottom. Imports that run down
       the stack arc through the left gutter in neutral ink; imports that
       climb it arc through the right gutter, and in red when they break the
       rule. Width is imports, on a square-root scale, so one import still
       reads as a line and a thousand do not drown the rest. -->
  <ExhibitFrame :exhibit="figure">
    <div ref="box" class="relative w-full" :style="{ height: height + 'px' }">
      <svg v-if="w > 0" ref="svgEl" :width="w" :height="height" class="block select-none" role="img" :aria-label="ariaLabel" @click.self="emit('select', null)">
        <defs>
          <marker :id="`${uid}-dn`" viewBox="0 0 8 8" refX="6.5" refY="4" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="fill-neutral-400"/></marker>
          <marker :id="`${uid}-on`" viewBox="0 0 8 8" refX="6.5" refY="4" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="fill-neutral-800"/></marker>
          <marker :id="`${uid}-bad`" viewBox="0 0 8 8" refX="6.5" refY="4" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="fill-red-500"/></marker>
        </defs>

        <text :x="2" :y="11" class="fill-neutral-400 text-[11px]">uses below</text>
        <text :x="w - 2" :y="11" text-anchor="end" class="fill-neutral-400 text-[11px]">{{ upLabel }}</text>

        <!-- Arcs: a wide invisible stroke to aim at, then the line itself. -->
        <g v-for="a in arcs" :key="a.key" class="cursor-pointer" :class="{ 'opacity-20': dimmed(a) }" @click.stop="emit('select', { kind: 'flow', id: a.key })" @mouseenter="hoverKey = a.key; emit('hover', { kind: 'flow', id: a.key })" @mouseleave="hoverKey = null; emit('hover', null)">
          <path :d="a.d" fill="none" stroke="transparent" stroke-width="12"/>
          <path
            :d="a.d" fill="none" :stroke-width="a.width"
            :class="a.bad ? 'stroke-red-500' : isOn(a) ? 'stroke-neutral-800' : a.up ? 'stroke-neutral-400' : 'stroke-neutral-300'"
            :stroke-dasharray="a.up && !a.bad ? '4 3' : undefined"
            :marker-end="`url(#${uid}-${a.bad ? 'bad' : isOn(a) ? 'on' : 'dn'})`"
          >
            <title>{{ a.title }}</title>
          </path>
          <g v-if="a.bad || isOn(a)" :transform="`translate(${a.lx},${a.ly})`" class="pointer-events-none">
            <rect :x="-pillW(a.count) / 2" y="-8" :width="pillW(a.count)" height="16" rx="3" :class="a.bad ? 'fill-red-50 stroke-red-200' : 'fill-surface stroke-neutral-300'"/>
            <text y="4" text-anchor="middle" class="font-mono text-[11px] font-medium" :class="a.bad ? 'fill-red-700' : 'fill-neutral-800'">{{ fmt(a.count) }}</text>
          </g>
        </g>

        <!-- Floors -->
        <g
          v-for="f in placed" :key="f.id" :transform="`translate(${GL},${f.y})`"
          class="cursor-pointer" :class="{ 'opacity-40': dimmedFloor(f.id) }"
          role="button" :aria-pressed="selected?.kind === 'floor' && selected.id === f.id" :aria-label="`${f.label}, ${f.sub}`"
          @click.stop="emit('select', { kind: 'floor', id: f.id })"
          @mouseenter="emit('hover', { kind: 'floor', id: f.id })" @mouseleave="emit('hover', null)"
        >
          <rect :width="floorW" :height="FLOOR" rx="4"
            :class="selected?.kind === 'floor' && selected.id === f.id ? 'fill-accent-50 stroke-accent-500' : 'fill-surface stroke-neutral-300 hover:stroke-neutral-500'"
            :stroke-width="selected?.kind === 'floor' && selected.id === f.id ? 1.5 : 1"/>
          <template v-if="compact">
            <circle v-if="f.color" cx="11" :cy="FLOOR / 2" r="3.5" :style="{ fill: f.color }"/>
            <text :x="f.color ? 20 : 9" :y="FLOOR / 2 + 4" class="fill-neutral-900 text-[12px] font-medium">{{ f.short }}</text>
            <text :x="floorW - 8" :y="FLOOR / 2 + 4" text-anchor="end" class="fill-neutral-500 font-mono text-[11px]">{{ f.sub }}</text>
          </template>
          <template v-else>
            <circle v-if="f.color" cx="12" :cy="FLOOR / 2 - 5" r="4" :style="{ fill: f.color }"/>
            <text :x="f.color ? 22 : 10" :y="FLOOR / 2 - 1" class="fill-neutral-900 text-[12px] font-medium">{{ f.short }}</text>
            <text :x="f.color ? 22 : 10" :y="FLOOR / 2 + 12" class="fill-neutral-500 font-mono text-[11px]">{{ f.sub }}</text>
          </template>
          <!-- Its share of the files, the only illustration on the floor. -->
          <rect :x="8" :y="FLOOR - 4" :width="floorW - 16" height="2" rx="1" class="fill-neutral-100"/>
          <rect :x="8" :y="FLOOR - 4" :width="Math.max(2, (floorW - 16) * f.share)" height="2" rx="1" :style="{ fill: f.color || 'rgb(var(--c-neutral-400))' }"/>
          <title>{{ f.label }}</title>
        </g>
      </svg>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useSvgFigure } from "~/features/export/useExportables"
import type { LegendItem } from "~/features/export/figure"
import { chartTheme } from "~/shared/ui/useChartTheme"

export interface Floor { id: string; label: string; sub: string; weight: number; color?: string }
export interface Flow { key: string; from: string; to: string; count: number; bad?: boolean; title?: string }
export type StackSelection = { kind: "floor" | "flow"; id: string } | null

const props = withDefaults(defineProps<{
  floors: Floor[]
  flows: Flow[]
  selected?: StackSelection
  /** What an upward arc means here: against a declared order, or just upward. */
  upLabel?: string
  ariaLabel: string
  /** When set, the diagram is offered to reports and exports under this title. */
  figure?: string
}>(), { selected: null, upLabel: "points up", figure: "" })

const emit = defineEmits<{
  (e: "select", s: StackSelection): void
  /** What the pointer is on, so a picture beside this one can light the same files. */
  (e: "hover", s: StackSelection): void
}>()

const svgEl = ref<SVGSVGElement | null>(null)
const figure = props.figure
  ? useSvgFigure({
      title: props.figure,
      svg: () => (props.floors.length ? svgEl.value : null),
      legend: () => {
        const t = chartTheme()
        const items: LegendItem[] = [
          { label: "Imports down the stack", color: t.hairlineStrong, mark: "line" },
          { label: `Imports up the stack (${props.upLabel})`, color: t.inkMuted, mark: "dashed" },
        ]
        if (props.flows.some(f => f.bad)) items.push({ label: "Breaks the rule: an inversion, a mutual pair or a cycle", color: t.red, mark: "line" })
        return {
          items,
          notes: ["Each floor uses the floors below it. Line width is imports, on a square-root scale; the bar under a floor is its share of the files."],
        }
      },
    })
  : null

const uid = `sd${Math.random().toString(36).slice(2, 8)}`
const TOP = 22

const box = ref<HTMLElement | null>(null)
const w = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === "undefined") return
  ro = new ResizeObserver(([e]) => { w.value = Math.floor(e.contentRect.width) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const index = computed(() => new Map(props.floors.map((f, i) => [f.id, i])))
const n = computed(() => props.floors.length)
// Past nine floors each takes one line, so a whole plan still fits a glance.
const compact = computed(() => n.value > 9)
const FLOOR = computed(() => (compact.value ? 28 : 44))
const GAP = computed(() => (compact.value ? 10 : 18))
// Each gutter is as wide as its longest arc needs, within reason.
const gutter = (span: number) => Math.min(150, 34 + 15 * span)
const maxSpan = (up: boolean) => Math.max(1, ...props.flows.filter(f => {
  const a = index.value.get(f.from), b = index.value.get(f.to)
  return a != null && b != null && (up ? a > b : a < b)
}).map(f => Math.abs(index.value.get(f.from)! - index.value.get(f.to)!)))
// The floors keep room for their names; the gutters give way first.
const MIN_FLOOR = 170
const squeeze = computed(() => {
  const want = gutter(maxSpan(false)) + gutter(maxSpan(true))
  return Math.min(1, Math.max(0, w.value - MIN_FLOOR) / want)
})
const GL = computed(() => Math.max(28, Math.round(gutter(maxSpan(false)) * squeeze.value)))
const GR = computed(() => Math.max(28, Math.round(gutter(maxSpan(true)) * squeeze.value)))
const floorW = computed(() => Math.max(80, w.value - GL.value - GR.value))
const height = computed(() => TOP + n.value * FLOOR.value + Math.max(0, n.value - 1) * GAP.value + 8)

const maxWeight = computed(() => Math.max(1, ...props.floors.map(f => f.weight)))
const placed = computed(() => props.floors.map((f, i) => {
  const subW = compact.value ? f.sub.length * 6.7 + 12 : 0
  const room = Math.floor((floorW.value - (f.color ? 30 : 18) - subW) / 7)
  return {
    ...f,
    y: TOP + i * (FLOOR.value + GAP.value),
    short: f.label.length > room ? f.label.slice(0, Math.max(1, room - 1)) + "…" : f.label,
    share: f.weight / maxWeight.value,
  }
}))

const maxCount = computed(() => Math.max(1, ...props.flows.map(f => f.count)))
const arcs = computed(() => {
  const yOf = (i: number) => TOP + i * (FLOOR.value + GAP.value)
  const valid = props.flows.filter(f => index.value.has(f.from) && index.value.has(f.to) && f.from !== f.to)
  // Spread the ends of a floor's arcs over its height, ordered by where they
  // go, so lines leave a floor side by side instead of from one point.
  const ends = new Map<string, Array<{ key: string; other: number }>>()
  const add = (floor: string, side: string, key: string, other: number) => {
    const k = `${floor}|${side}`
    if (!ends.has(k)) ends.set(k, [])
    ends.get(k)!.push({ key, other })
  }
  for (const f of valid) {
    const a = index.value.get(f.from)!, b = index.value.get(f.to)!
    const side = a < b ? "L" : "R"
    add(f.from, side, f.key, b)
    add(f.to, side, f.key, a)
  }
  const at = (floor: string, side: string, key: string) => {
    const list = ends.get(`${floor}|${side}`)!.slice().sort((x, y) => x.other - y.other)
    const i = list.findIndex(x => x.key === key)
    const inset = compact.value ? 6 : 9
    const top = yOf(index.value.get(floor)!) + inset, span = FLOOR.value - inset * 2
    return list.length === 1 ? top + span / 2 : top + (span * i) / (list.length - 1)
  }
  return valid.map(f => {
    const a = index.value.get(f.from)!, b = index.value.get(f.to)!
    const up = a > b
    const side = up ? "R" : "L"
    const span = Math.abs(a - b)
    const y1 = at(f.from, side, f.key), y2 = at(f.to, side, f.key)
    const gx = up ? GL.value + floorW.value : GL.value
    const reach = Math.min((up ? GR.value : GL.value) - 10, (16 + 15 * span) * squeeze.value + 8)
    const bx = up ? gx + reach : gx - reach
    const tip = up ? gx + 3 : gx - 3
    return {
      key: f.key, count: f.count, bad: !!f.bad, up,
      d: `M${gx},${y1} C${bx},${y1} ${bx},${y2} ${tip},${y2}`,
      width: 0.75 + 4 * Math.sqrt(f.count / maxCount.value),
      lx: up ? gx + reach * 0.75 : gx - reach * 0.75,
      ly: (y1 + y2) / 2,
      title: f.title ?? `${f.count} import${f.count === 1 ? "" : "s"}`,
      from: f.from, to: f.to,
    }
  })
})

const hoverKey = ref<string | null>(null)
const isOn = (a: { key: string; from: string; to: string }) => {
  const s = props.selected
  if (hoverKey.value === a.key) return true
  if (!s) return false
  return s.kind === "flow" ? s.id === a.key : s.id === a.from || s.id === a.to
}
const dimmed = (a: { key: string; from: string; to: string; bad: boolean }) => {
  const s = props.selected
  if (!s) return false
  return s.kind === "flow" ? s.id !== a.key : s.id !== a.from && s.id !== a.to
}
const dimmedFloor = (id: string) => {
  const s = props.selected
  if (!s || s.kind !== "flow") return false
  const f = props.flows.find(x => x.key === s.id)
  return !!f && f.from !== id && f.to !== id
}
const fmt = (x: number) => x.toLocaleString("en-US")
const pillW = (x: number) => 12 + 7 * fmt(x).length
</script>
