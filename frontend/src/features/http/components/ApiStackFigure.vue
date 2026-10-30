<template>
  <!-- How the API flows into the code. Floors top to bottom: the API, the
       code its routes pass through (by how many calls in from the handler),
       the data they touch, the systems they call. Boxes are named code
       components; a band is the routes that pass from one to the next, as
       wide as their share of the box. Code most routes pass through stands
       in the margin, unbanded. A pick lights the routes through it, and a
       single route names the classes it passes in each box. -->
  <ExhibitFrame :exhibit="figure" fill>
    <div ref="box" class="relative h-full min-h-0 w-full overflow-hidden" @mouseleave="hover = null; preview = null">
      <svg v-if="geo" ref="svgEl" :width="w" :height="geo.height" class="block select-none" role="img" :aria-label="ariaLabel" @click.self="emit('pick', null)">
        <!-- Floors: a hairline and the floor's name in the gutter. -->
        <g v-for="f in geo.floors" :key="'f' + f.id">
          <line :x1="0" :x2="w" :y1="f.y - FLOOR_PAD" :y2="f.y - FLOOR_PAD" class="stroke-neutral-100"/>
          <text :x="0" :y="f.y + 13" class="fill-neutral-800 text-[11px] font-semibold">{{ floorName(f.id) }}</text>
          <text :x="0" :y="f.y + 27" class="fill-neutral-500 text-[10px]">{{ fit(floorHint(f.id), GUTTER - 10, 5.6) }}</text>
          <text v-if="!geo.margin && f.shared.length" :x="0" :y="f.y + 41" class="fill-neutral-400 text-[10px]"><title>{{ f.shared.map(b => b.label).join(', ') }}</title>{{ t('http.stackFigure.sharedCount', { count: f.shared.length }) }}</text>
        </g>

        <!-- Bands, under the boxes. -->
        <g>
          <path
            v-for="b in geo.bands" :key="b.id" :d="b.d" :class="bandClass(b)"
            class="cursor-pointer transition-opacity duration-150 motion-reduce:transition-none"
            @mouseenter="tipBand(b)" @mousemove="onMove" @click.stop="emit('pick', { kind: 'band', id: b.id })"
          />
        </g>

        <!-- The lit routes' own share of each band, drawn over it. -->
        <g v-if="litBands.length" class="pointer-events-none">
          <path v-for="b in litBands" :key="'l' + b.id" :d="b.d" :class="b.cls"/>
        </g>

        <!-- Boxes. -->
        <g v-for="b in geo.boxes" :key="b.id" class="cursor-pointer" :class="{ 'opacity-35': dimmed(b.id) }" @mouseenter="tipBox(b)" @mouseleave="hover = null; preview = null" @mousemove="onMove" @click.stop="pickBox(b)">
          <rect :x="b.x" :y="b.y" :width="b.w" :height="BOX_H" rx="4" :class="boxClass(b)" :stroke-width="selected?.id === b.id ? 1.75 : 1"/>
          <rect v-if="litShare(b) != null" :x="b.x + 1" :y="b.y + BOX_H - 4" :width="Math.max(2, (b.w - 2) * litShare(b)!)" height="3" rx="1" :class="b.floor === 'data' ? 'fill-amber-500' : b.floor === 'outside' ? 'fill-blue-500' : 'fill-neutral-700'"/>
          <text :x="b.x + 7" :y="b.y + 15" class="text-[11px]" :class="b.floor === 'api' ? 'fill-neutral-900 font-semibold' : 'fill-neutral-900 font-medium'">{{ b.name }}</text>
          <text v-if="b.count" :x="b.x + b.w - 7" :y="b.y + 15" text-anchor="end" class="fill-neutral-500 font-mono text-[10px]">{{ b.count }}</text>
          <!-- A route's own classes in each box it passes. -->
          <text v-if="b.classes" :x="b.x + 7" :y="b.y + BOX_H + 12" class="fill-neutral-700 font-mono text-[10px]">{{ b.classes }}</text>
        </g>

        <!-- The margin: code most routes pass through, per floor. -->
        <g v-if="geo.margin">
          <text :x="geo.margin.x" :y="TOP - 8" class="fill-neutral-500 text-[11px] font-semibold">{{ t('http.stackFigure.shared') }}</text>
          <g v-for="m in geo.margin.items" :key="'m' + m.id" class="cursor-pointer" :class="{ 'opacity-35': dimmed(m.id) }" @mouseenter="tipShared(m)" @mousemove="onMove" @click.stop="emit('pick', { kind: 'box', id: m.id })">
            <rect :x="geo.margin.x - 4" :y="m.y - 11" :width="MARGIN - 4" height="15" fill="transparent"/>
            <text :x="geo.margin.x" :y="m.y" class="text-[11px]" :class="selected?.id === m.id ? 'fill-neutral-900 font-semibold' : 'fill-neutral-600'">{{ m.name }}</text>
            <text :x="geo.margin.x + MARGIN - 12" :y="m.y" text-anchor="end" class="fill-neutral-400 font-mono text-[10px]">{{ m.count }}</text>
          </g>
        </g>
      </svg>
      <div v-if="hover" class="ui-tooltip pointer-events-none absolute z-20 max-w-[380px]" :style="tipStyle">
        <div class="break-all text-[11px] font-medium">{{ hover.head }}</div>
        <div v-for="(line, i) in hover.lines" :key="i" class="mt-0.5 break-words text-[11px] opacity-80">{{ line }}</div>
      </div>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useSvgFigure } from "~/features/export/useExportables"
import { chartTheme } from "~/shared/ui/useChartTheme"
import { t, intlLocale } from "~/shared/i18n"
import { foldStack, litBy, type ApiStack, type FloorId, type StackBand, type StackBox } from "../stack"

/** A pick on the figure; a folded "more" box says which boxes it holds. */
export type StackPick = { kind: "box" | "band"; id: string; members?: string[] }

const props = defineProps<{
  stack: ApiStack
  /** Routes to light (a pick or a search); null lights everything. */
  lit: ReadonlySet<number> | null
  /** One route, whose classes are named in each box it passes. */
  route: number | null
  selected: StackPick | null
  /** A system's name as a reader reads it. */
  systemName: (key: string) => string
  title: string
  ariaLabel: string
}>()
const emit = defineEmits<{ (e: "pick", p: StackPick | null): void }>()

const fmt = (n: number) => n.toLocaleString(intlLocale)
const svgEl = ref<SVGSVGElement | null>(null)
const figure = useSvgFigure({
  title: () => props.title,
  svg: () => svgEl.value,
  // The floors name what the colours are; exports carry the legend.
  legendInUi: false,
  legend: () => {
    const theme = chartTheme()
    return {
      items: [
        { label: t("http.stackFigure.legendCode"), color: theme.inkMuted, mark: "swatch" },
        { label: t("http.stackFigure.legendData"), color: theme.amber, mark: "swatch" },
        { label: t("http.stackFigure.legendOutside"), color: theme.blue, mark: "swatch" },
      ],
      notes: [t("http.stackFigure.noteBands"), t("http.stackFigure.noteFloors"), t("http.stackFigure.noteShared")],
    }
  },
})

const box = ref<HTMLElement | null>(null)
const w = ref(0), h = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === "undefined") return
  ro = new ResizeObserver(([e]) => { w.value = Math.floor(e.contentRect.width); h.value = Math.floor(e.contentRect.height) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const GUTTER = 128
const MARGIN = 176
const BOX_H = 26
const MIN_BOX = 92
const GAP = 8
const TOP = 22
const FLOOR_PAD = 10

const FLOOR_NAMES: Record<FloorId, string> = {
  api: t("http.stackFigure.floorApi"), near: t("http.stackFigure.floorNear"), mid: t("http.stackFigure.floorMid"),
  deep: t("http.stackFigure.floorDeep"), data: t("http.stackFigure.floorData"), outside: t("http.stackFigure.floorOutside"),
}
const FLOOR_HINTS: Record<FloorId, string> = {
  api: t("http.stackFigure.hintApi"), near: t("http.stackFigure.hintNear"), mid: t("http.stackFigure.hintMid"),
  deep: t("http.stackFigure.hintDeep"), data: t("http.stackFigure.hintData"), outside: t("http.stackFigure.hintOutside"),
}
const floorName = (f: FloorId) => FLOOR_NAMES[f]
const floorHint = (f: FloorId) => FLOOR_HINTS[f]

// A name loses its front first (Nop.Services.Catalog, Services.Catalog,
// Catalog): the end is what tells two components apart.
function fitTail(text: string, room: number, char = 6.4): string {
  const parts = text.split(".")
  for (let i = 0; i < parts.length; i++) {
    const s = parts.slice(i).join(".")
    if (s.length * char <= room) return s
  }
  return fit(parts[parts.length - 1], room, char)
}

// A label cut to its room, by the width of a character.
function fit(text: string, room: number, char = 6.4): string {
  const n = Math.floor(room / char)
  if (n < 2) return ""
  return text.length <= n ? text : text.slice(0, n - 1) + "…"
}

interface PlacedBox { id: string; floor: FloorId; x: number; y: number; w: number; name: string; count: string; classes: string; box: StackBox }
interface PlacedBand { id: string; d: string; band: StackBand; into: FloorId; ys: number; yt: number; s0: number; s1: number; t0: number; t1: number }

// Narrower than the margin and three boxes, the shared code is a count under the floor's name.
const hasMargin = computed(() => props.stack.floors.some(f => f.shared.length) && w.value >= GUTTER + MARGIN + 16 + 3 * (MIN_BOX + GAP))
const mainW = computed(() => Math.max(200, w.value - GUTTER - (hasMargin.value ? MARGIN + 16 : 0)))

// Each floor keeps what fits at a readable width; the rest folds into "more".
const shown = computed(() => {
  const per = Math.max(2, Math.floor((mainW.value + GAP) / (MIN_BOX + GAP)))
  return foldStack(props.stack, () => per)
})

const geo = computed(() => {
  if (!w.value || !h.value) return null
  const st = shown.value
  const floors = st.floors.filter(f => f.boxes.length)
  if (!floors.length) return null
  const routeCaption = props.route != null
  const step = Math.max(BOX_H + 50, Math.min(150, Math.floor((h.value - TOP - 8) / floors.length)))
  const height = TOP + step * (floors.length - 1) + BOX_H + (routeCaption ? 20 : 8)
  const placedFloors = floors.map((f, i) => ({ id: f.id, y: TOP + i * step, shared: f.shared }))
  const yOf = new Map(placedFloors.map(f => [f.id, f.y]))

  // Order: the API floor biggest first; each floor below by where its bands
  // come from, so bands cross as little as they can; "more" last.
  const xCenter = new Map<string, number>()
  const placed: PlacedBox[] = []
  const incoming = new Map<string, StackBand[]>()
  for (const b of st.bands) incoming.set(b.to, [...(incoming.get(b.to) ?? []), b])
  for (const f of floors) {
    let order = [...f.boxes]
    if (f.id !== "api") {
      const bary = (b: StackBox) => {
        let sum = 0, n = 0
        for (const band of incoming.get(b.id) ?? []) { const x = xCenter.get(band.from); if (x != null) { sum += x * band.routes.size; n += band.routes.size } }
        return n ? sum / n : Infinity
      }
      order = order.filter(b => !b.id.startsWith("more:")).sort((a, b) => bary(a) - bary(b) || b.routes.size - a.routes.size).concat(order.filter(b => b.id.startsWith("more:")))
    }
    // Widths: a readable minimum, the rest shared by routes passing.
    const total = order.reduce((n, b) => n + b.routes.size, 0) || 1
    const spare = Math.max(0, mainW.value - order.length * MIN_BOX - (order.length - 1) * GAP)
    let x = GUTTER
    for (const b of order) {
      const bw = MIN_BOX + spare * (b.routes.size / total)
      const isMore = b.id.startsWith("more:")
      const name = isMore ? t("http.stackFigure.more", { count: b.parts.size }) : b.kind === "system" ? props.systemName(b.title) : b.label
      const count = fmt(b.routes.size)
      const room = bw - 14 - count.length * 6.2 - 6
      const classes = routeCaption ? (st.paths.get(props.route!)?.get(b.id) ?? []).join(", ") : ""
      placed.push({ id: b.id, floor: f.id, x, y: yOf.get(f.id)!, w: bw, name: b.kind === "component" || b.kind === "area" ? fitTail(name, room) : fit(name, room), count, classes: classes ? fit(classes, bw + GAP - 4, 6) : "", box: b })
      xCenter.set(b.id, x + bw / 2)
      x += bw + GAP
    }
  }
  const at = new Map(placed.map(p => [p.id, p]))

  // Ports: a box's bands leave its foot side by side, ordered by where they
  // land, each as wide as its share of what leaves; and arrive the same way.
  const outs = new Map<string, StackBand[]>(), ins = new Map<string, StackBand[]>()
  for (const b of st.bands) {
    if (!at.has(b.from) || !at.has(b.to)) continue
    outs.set(b.from, [...(outs.get(b.from) ?? []), b])
    ins.set(b.to, [...(ins.get(b.to) ?? []), b])
  }
  const ports = new Map<string, { s0: number; s1: number; t0: number; t1: number }>()
  const lay = (list: Map<string, StackBand[]>, end: "s" | "t") => {
    for (const [id, bands] of list) {
      const p = at.get(id)!
      const other = (b: StackBand) => xCenter.get(end === "s" ? b.to : b.from) ?? 0
      bands.sort((a, b) => other(a) - other(b))
      const sum = bands.reduce((n, b) => n + b.routes.size, 0)
      const span = p.w - 8
      let x = p.x + 4
      for (const b of bands) {
        const bw = Math.max(1, span * (b.routes.size / sum))
        const e = ports.get(b.id) ?? { s0: 0, s1: 0, t0: 0, t1: 0 }
        if (end === "s") { e.s0 = x; e.s1 = x + bw } else { e.t0 = x; e.t1 = x + bw }
        ports.set(b.id, e)
        x += bw
      }
    }
  }
  lay(outs, "s")
  lay(ins, "t")
  const bands: PlacedBand[] = []
  for (const b of st.bands) {
    const a = at.get(b.from), z = at.get(b.to), p = ports.get(b.id)
    if (!a || !z || !p) continue
    const ys = a.y + BOX_H, yt = z.y
    const m = (ys + yt) / 2
    bands.push({ id: b.id, d: ribbon(p.s0, p.s1, ys, p.t0, p.t1, yt), band: b, into: z.floor, ys, yt, ...p })
  }
  // Widest last, so the thin ones stay visible under them... and hover the thin ones.
  bands.sort((a, b) => b.band.routes.size - a.band.routes.size)

  const margin = hasMargin.value
    ? {
        x: w.value - MARGIN,
        items: props.stack.floors.flatMap(f => {
          const y0 = yOf.get(f.id)
          if (y0 == null) return []
          const room = Math.max(1, Math.floor((step - 6) / 15))
          return f.shared.slice(0, room).map((b, i) => ({ id: b.id, y: y0 + 12 + i * 15, name: fitTail(b.label, MARGIN - 52, 6.2), count: fmt(b.routes.size), box: b }))
        }),
      }
    : null
  return { height, floors: placedFloors, boxes: placed, bands, margin }
})

function pickBox(b: PlacedBox) {
  emit("pick", b.id.startsWith("more:") ? { kind: "box", id: b.id, members: [...b.box.parts.keys()] } : { kind: "box", id: b.id })
}

function ribbon(s0: number, s1: number, ys: number, t0: number, t1: number, yt: number): string {
  const m = (ys + yt) / 2
  return `M${s0},${ys} C${s0},${m} ${t0},${m} ${t0},${yt} L${t1},${yt} C${t1},${m} ${s1},${m} ${s1},${ys} Z`
}

// ---- lighting
// At rest the bands are a faint texture; hovering a box lights the routes
// through it until the pointer leaves, a pick lights them until it changes.
const preview = ref<ReadonlySet<number> | null>(null)
const litSet = computed(() => preview.value ?? props.lit)
const litNow = computed(() => (litSet.value ? litBy(shown.value, litSet.value) : null))
const dimmed = (id: string) => !!litNow.value && !litNow.value.boxes.has(id)
const litShare = (b: PlacedBox) => {
  const n = litNow.value?.boxes.get(b.id)
  return n == null || n === b.box.routes.size ? null : n / b.box.routes.size
}
const litBands = computed(() => {
  const lit = litNow.value
  if (!lit || !geo.value) return []
  return geo.value.bands.flatMap(b => {
    const n = lit.bands.get(b.id)
    if (!n) return []
    const f = n / b.band.routes.size
    const cls = b.into === "data" ? "fill-amber-500 opacity-75" : b.into === "outside" ? "fill-blue-500 opacity-75" : "fill-neutral-600 opacity-60"
    return [{ id: b.id, cls, d: ribbon(b.s0, b.s0 + Math.max(1, (b.s1 - b.s0) * f), b.ys, b.t0, b.t0 + Math.max(1, (b.t1 - b.t0) * f), b.yt) }]
  })
})
function bandClass(b: PlacedBand): string {
  const hue = b.into === "data" ? "fill-amber-300" : b.into === "outside" ? "fill-blue-300" : "fill-neutral-300"
  if (props.selected?.id === b.id) return `${b.into === "data" ? "fill-amber-500" : b.into === "outside" ? "fill-blue-500" : "fill-neutral-600"} opacity-80`
  if (!litNow.value) return `${hue} opacity-[0.16] hover:opacity-60`
  return `${hue} opacity-[0.07] hover:opacity-30`
}
function boxClass(b: PlacedBox): string {
  if (props.selected?.id === b.id) return "fill-accent-50 stroke-accent-500"
  if (b.floor === "data") return "fill-amber-50 stroke-amber-300"
  if (b.floor === "outside") return "fill-blue-50 stroke-blue-300"
  if (b.floor === "api") return "fill-neutral-100 stroke-neutral-400"
  return "fill-surface stroke-neutral-300"
}

// ---- the pointer
const hover = ref<{ head: string; lines: string[] } | null>(null)
const mouse = ref({ x: 0, y: 0 })
function onMove(ev: MouseEvent) {
  const r = box.value?.getBoundingClientRect()
  if (r) mouse.value = { x: ev.clientX - r.left, y: ev.clientY - r.top }
}
const total = computed(() => props.stack.routes.length)
const share = (n: number) => `${Math.round((n / Math.max(1, total.value)) * 100)}%`
function tipBox(b: PlacedBox) {
  preview.value = b.box.routes.size ? b.box.routes : null
  if (b.id.startsWith("more:")) {
    const names = [...b.box.parts.keys()].map(id => shown.value.boxes.get(id)?.label ?? id)
    hover.value = { head: t("http.stackFigure.more", { count: names.length }), lines: [names.slice(0, 8).join(", ") + (names.length > 8 ? ", …" : "")] }
    return
  }
  const lit = litNow.value?.boxes.get(b.id)
  hover.value = {
    head: b.box.kind === "system" ? props.systemName(b.box.title) : b.box.title,
    lines: [
      t("http.stackFigure.boxRoutes", { count: b.box.routes.size, share: share(b.box.routes.size) }),
      ...(lit != null && lit !== b.box.routes.size ? [t("http.stackFigure.boxLit", { count: lit })] : []),
      ...(b.box.kind === "domain" ? [t("http.stackFigure.boxTables", { count: b.box.parts.size })] : b.box.kind === "component" ? [t("http.stackFigure.boxClasses", { count: b.box.parts.size })] : []),
    ],
  }
}
function tipShared(m: { box: StackBox }) {
  preview.value = null
  hover.value = { head: m.box.title, lines: [t("http.stackFigure.boxRoutes", { count: m.box.routes.size, share: share(m.box.routes.size) }), t("http.stackFigure.sharedTip")] }
}
function tipBand(b: PlacedBand) {
  preview.value = null
  const name = (id: string) => { const x = shown.value.boxes.get(id); return !x ? id : id.startsWith("more:") ? t("http.stackFigure.more", { count: x.parts.size }) : x.kind === "system" ? props.systemName(x.title) : x.label }
  const lit = litNow.value?.bands.get(b.id)
  hover.value = { head: `${name(b.band.from)} → ${name(b.band.to)}`, lines: [t("http.stackFigure.bandRoutes", { count: b.band.routes.size }), ...(lit != null && lit !== b.band.routes.size ? [t("http.stackFigure.boxLit", { count: lit })] : [])] }
}
const tipStyle = computed(() => {
  const right = mouse.value.x > w.value - 320
  const below = mouse.value.y < h.value - 90
  return {
    left: right ? "auto" : `${mouse.value.x + 14}px`,
    right: right ? `${w.value - mouse.value.x + 14}px` : "auto",
    top: below ? `${mouse.value.y + 14}px` : "auto",
    bottom: below ? "auto" : `${h.value - mouse.value.y + 14}px`,
  }
})
</script>
