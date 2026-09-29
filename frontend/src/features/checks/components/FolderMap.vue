<template>
  <!-- The codebase as its folders: every production file a cell sized by its
       lines, nested in the folders that hold it. The checks and the planner
       paint the same map, so a finding always lands in a place the architect
       already knows. A click selects a file or, on its header, a folder. -->
  <div ref="box" class="relative h-full min-h-0 w-full overflow-hidden" @mouseleave="hover = null">
    <svg v-if="w > 0 && h > 0" :width="w" :height="h" class="block select-none" role="img" :aria-label="ariaLabel" @click.self="emit('select', null, 'folder')">
      <defs>
        <marker v-for="m in MARKERS" :id="`${uid}-${m.id}`" :key="m.id" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" :class="m.cls"/>
        </marker>
        <pattern :id="`${uid}-hatch`" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" class="fill-neutral-100"/>
          <line x1="0" y1="0" x2="0" y2="5" class="stroke-neutral-300" stroke-width="1.5"/>
        </pattern>
      </defs>
      <g>
        <rect
          v-for="d in folders" :key="'d' + d.path"
          :x="d.x0" :y="d.y0" :width="d.x1 - d.x0" :height="d.y1 - d.y0" rx="2"
          class="cursor-pointer fill-neutral-50 stroke-neutral-200"
          :class="{ 'opacity-40': fading && !d.lit }"
          @click.stop="emit('select', d.path, 'folder')"
        />
        <text
          v-for="d in labelled" :key="'t' + d.path"
          :x="d.x0 + 5" :y="d.y0 + 12"
          class="pointer-events-none fill-neutral-600 text-[11px] font-medium"
          :class="{ 'opacity-40': fading && !d.lit }"
        >{{ d.label }}</text>
      </g>
      <g>
        <rect
          v-for="f in leaves" :key="f.path"
          :x="f.x0" :y="f.y0" :width="Math.max(0, f.x1 - f.x0)" :height="Math.max(0, f.y1 - f.y0)" rx="1"
          class="cursor-pointer"
          :style="{ fill: f.paint === HATCH ? `url(#${uid}-hatch)` : f.paint, opacity: fading && !f.lit ? 0.18 : 1 }"
          @mouseenter="onHover($event, f.path)"
          @mousemove="onMove"
          @click.stop="emit('select', f.path, 'file')"
          @dblclick.stop="emit('open', f.path)"
        />
      </g>
      <!-- Files that share a name, tied to the first of them. -->
      <g v-if="echoLines.length" class="pointer-events-none">
        <line v-for="(l, i) in echoLines" :key="'e' + i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" class="stroke-violet-600" stroke-width="1.5" stroke-dasharray="3 2"/>
        <circle v-for="(l, i) in echoLines" :key="'c' + i" :cx="l.x2" :cy="l.y2" r="3" class="fill-violet-600"/>
        <circle v-if="echoLines[0]" :cx="echoLines[0].x1" :cy="echoLines[0].y1" r="3" class="fill-violet-600"/>
      </g>
      <!-- The hovered file's references: what it imports in ink, what imports it in blue, red where one runs against the grain. -->
      <g v-if="refLines.length" class="pointer-events-none">
        <path v-for="l in refLines" :key="l.key" :d="l.d" fill="none" :class="l.cls" stroke-width="1.5" :stroke-dasharray="l.dash" :marker-end="`url(#${uid}-${l.marker})`"/>
      </g>
      <rect v-if="hoverRect" :x="hoverRect.x0" :y="hoverRect.y0" :width="hoverRect.x1 - hoverRect.x0" :height="hoverRect.y1 - hoverRect.y0" rx="1" class="pointer-events-none fill-none stroke-neutral-900" stroke-width="1.5"/>
      <rect v-if="selRect" :x="selRect.x0 - 1" :y="selRect.y0 - 1" :width="selRect.x1 - selRect.x0 + 2" :height="selRect.y1 - selRect.y0 + 2" rx="3" class="pointer-events-none fill-none stroke-accent-500" stroke-width="2"/>
    </svg>
    <div v-if="hover && tip" class="ui-tooltip pointer-events-none absolute z-20 max-w-[360px]" :style="tipStyle">
      <div class="break-all font-mono text-[11px]">{{ hover }}</div>
      <div class="mt-0.5 text-[11px] opacity-80">{{ tip }}</div>
      <div v-if="hoverRefs" class="mt-1 flex items-center gap-3 text-[11px] opacity-80">
        <span class="flex items-center gap-1"><span class="inline-block h-0.5 w-3 bg-current"/>imports {{ hoverRefs.uses.length }}</span>
        <span class="flex items-center gap-1"><span class="inline-block h-0.5 w-3 bg-blue-400"/>imported by {{ hoverRefs.usedBy.length }}</span>
        <span v-if="hoverRefs.bad" class="flex items-center gap-1"><span class="inline-block h-0.5 w-3 bg-red-400"/>{{ hoverRefs.bad }} against the grain</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as d3 from "d3"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { folderTree, type FolderNode } from "../folderTree"

const props = withDefaults(defineProps<{
  files: string[]
  lines: ReadonlyMap<string, number>
  /** A CSS colour per file; `hatch` draws the "not decided" stripe. */
  paint: (file: string) => string
  /** When set, everything else fades. */
  highlight?: ReadonlySet<string> | null
  /** A file or folder path to outline. */
  selected?: string | null
  /** Files to tie together with lines. */
  echo?: string[] | null
  /** The second tooltip line for a file. */
  describe?: (file: string) => string
  /** A file's references, drawn as lines while it is hovered. */
  linksOf?: (file: string) => { uses: string[]; usedBy: string[] }
  /** Whether a reference runs against the grain, drawn red. */
  badLink?: (from: string, to: string) => boolean
  ariaLabel: string
}>(), { highlight: null, selected: null, echo: null, describe: undefined, linksOf: undefined, badLink: undefined })

const emit = defineEmits<{
  (e: "select", path: string | null, kind: "file" | "folder"): void
  (e: "open", file: string): void
}>()

const HATCH = "hatch"
const uid = `fm${Math.random().toString(36).slice(2, 8)}`

const box = ref<HTMLElement | null>(null)
const w = ref(0), h = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value || typeof ResizeObserver === "undefined") return
  ro = new ResizeObserver(([e]) => { w.value = Math.floor(e.contentRect.width); h.value = Math.floor(e.contentRect.height) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

type Rect = { x0: number; y0: number; x1: number; y1: number }
const HEADER = 16

const layout = computed(() => {
  if (!w.value || !h.value || !props.files.length) return null
  const tree = folderTree(props.files, f => props.lines.get(f) ?? 1)
  const root = d3.hierarchy<FolderNode>(tree, n => (n.children.length ? n.children : null))
    .sum(n => (n.file ? n.size : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  // A folder gets a header only where the header leaves room for its files.
  const header = (n: d3.HierarchyRectangularNode<FolderNode>) =>
    n.depth > 0 && n.x1 - n.x0 > 56 && n.y1 - n.y0 > HEADER * 2.2 ? HEADER : 2
  return d3.treemap<FolderNode>()
    .size([w.value, h.value])
    .tile(d3.treemapSquarify.ratio(1.2))
    .paddingOuter(2)
    .paddingTop(header)
    .paddingInner(1)
    .round(true)(root)
})

const all = computed(() => layout.value?.descendants() ?? [])
const rectOf = computed(() => new Map(all.value.map(n => [n.data.path, n as Rect])))

const lit = (path: string, isFile: boolean) => {
  const hl = hoverLit.value ?? props.highlight
  if (!hl) return true
  if (isFile) return hl.has(path)
  for (const f of hl) if (f.startsWith(path + "/")) return true
  return false
}
// While a file with references is hovered, it and its references are the
// picture; everything else fades, whatever was highlighted before.
const hoverLit = computed<Set<string> | null>(() => {
  const r = hoverRefs.value
  return r ? new Set([hover.value!, ...r.uses, ...r.usedBy]) : null
})
const fading = computed(() => !!(hoverLit.value ?? props.highlight))

const folders = computed(() => all.value
  .filter(n => n.depth > 0 && !n.data.file)
  .map(n => ({ path: n.data.path, x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1, lit: lit(n.data.path, false) })))

const labelled = computed(() => all.value
  .filter(n => n.depth > 0 && !n.data.file && n.x1 - n.x0 > 56 && n.y1 - n.y0 > HEADER * 2.2)
  .map(n => {
    const room = Math.floor((n.x1 - n.x0 - 10) / 6.4)
    const name = n.data.name
    return { path: n.data.path, x0: n.x0, y0: n.y0, label: name.length > room ? name.slice(0, Math.max(1, room - 1)) + "…" : name, lit: lit(n.data.path, false) }
  }))

const leaves = computed(() => all.value
  .filter(n => !!n.data.file)
  .map(n => ({ path: n.data.path, x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1, paint: props.paint(n.data.path), lit: lit(n.data.path, true) })))

const selRect = computed(() => (props.selected ? rectOf.value.get(props.selected) ?? null : null))

const echoLines = computed(() => {
  const fs = (props.echo ?? []).map(f => rectOf.value.get(f)).filter((r): r is Rect => !!r)
  if (fs.length < 2) return []
  const c = (r: Rect) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
  const [x1, y1] = c(fs[0])
  return fs.slice(1).map(r => { const [x2, y2] = c(r); return { x1, y1, x2, y2 } })
})

// Hover: the file under the pointer, its tooltip and its references.
const hover = ref<string | null>(null)
const MARKERS = [
  { id: "use", cls: "fill-neutral-900" },
  { id: "by", cls: "fill-blue-500" },
  { id: "bad", cls: "fill-red-500" },
]
const MAX_LINES = 80
const hoverRefs = computed(() => {
  const f = hover.value
  if (!f || !props.linksOf) return null
  const on = (xs: string[]) => [...new Set(xs)].filter(x => x !== f && rectOf.value.has(x))
  const { uses, usedBy } = props.linksOf(f)
  const u = on(uses), b = on(usedBy)
  if (!u.length && !b.length) return null
  const bad = props.badLink ? u.filter(t => props.badLink!(f, t)).length + b.filter(t => props.badLink!(t, f)).length : 0
  return { uses: u, usedBy: b, bad }
})
const refLines = computed(() => {
  const r = hoverRefs.value
  const at = hover.value ? rectOf.value.get(hover.value) : null
  if (!r || !at) return []
  const c = (x: Rect) => [(x.x0 + x.x1) / 2, (x.y0 + x.y1) / 2]
  const [hx, hy] = c(at)
  // A gentle bow, so lines that share a direction do not lie on one another.
  const bow = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1
    return `M${x1},${y1} Q${mx - dy * 0.15},${my + dx * 0.15} ${x2},${y2}`
  }
  const line = (from: string, to: string, kind: "use" | "by") => {
    const other = rectOf.value.get(kind === "use" ? to : from)!
    const [ox, oy] = c(other)
    const bad = !!props.badLink?.(from, to)
    return {
      key: `${kind}:${from}>${to}`,
      d: kind === "use" ? bow(hx, hy, ox, oy) : bow(ox, oy, hx, hy),
      cls: bad ? "stroke-red-500" : kind === "use" ? "stroke-neutral-900" : "stroke-blue-500",
      dash: kind === "by" && !bad ? "4 2" : undefined,
      marker: bad ? "bad" : kind,
    }
  }
  return [
    ...r.uses.slice(0, MAX_LINES).map(t => line(hover.value!, t, "use")),
    ...r.usedBy.slice(0, MAX_LINES).map(t => line(t, hover.value!, "by")),
  ]
})
const mouse = ref({ x: 0, y: 0 })
const hoverRect = computed(() => (hover.value ? rectOf.value.get(hover.value) ?? null : null))
const tip = computed(() => {
  if (!hover.value) return ""
  const n = props.lines.get(hover.value)
  const size = n ? `${n.toLocaleString("en-US")} lines` : "no line count"
  const more = props.describe?.(hover.value)
  return more ? `${size} · ${more}` : size
})
function onHover(ev: MouseEvent, path: string) { hover.value = path; onMove(ev) }
function onMove(ev: MouseEvent) {
  const r = box.value?.getBoundingClientRect()
  if (r) mouse.value = { x: ev.clientX - r.left, y: ev.clientY - r.top }
}
const tipStyle = computed(() => {
  const right = mouse.value.x > w.value - 300
  const below = mouse.value.y < h.value - 70
  return {
    left: right ? "auto" : `${mouse.value.x + 14}px`,
    right: right ? `${w.value - mouse.value.x + 14}px` : "auto",
    top: below ? `${mouse.value.y + 14}px` : "auto",
    bottom: below ? "auto" : `${h.value - mouse.value.y + 14}px`,
  }
})
</script>
