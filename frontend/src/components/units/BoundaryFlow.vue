<template>
  <!-- The boundary as a flow, with the ink spent on what can be acted on.
       Two earlier passes lost the plot: every ribbon took the accent, so 153
       of them overlapped into mud with nothing to trace, and the folded tail
       -- the one thing nobody can act on -- was painted red and took three
       quarters of the height. Here the default is quiet, the accent belongs
       to whatever is in focus, and red means one thing only. -->
  <figure class="m-0 flex min-w-0 flex-col">
    <figcaption class="sr-only">
      Flow of {{ flow.ribbons.length }} dependencies between {{ headLabel }} and {{ tailLabel }}.
      Each module is drawn in the column of its own lane, whichever way its
      dependencies run. Use arrow keys to move between modules.
    </figcaption>

    <!-- Which column is which has to survive scrolling: forty-eight named
         modules is fifteen hundred pixels of drawing, and a reader who has
         scrolled past the heading can no longer tell sender from receiver. -->
    <div class="hairline-b sticky top-0 z-10 flex shrink-0 items-baseline
                justify-between bg-surface px-1 pb-2 pt-0.5">
      <!-- Lane names only. These headed the columns "sends" and "receives",
           which is true of where most of the traffic runs and false of any
           row that runs the other way: a module imported sixty-nine times and
           importing nothing sat under the word "sends". Which way a reference
           runs is carried by its colour, named in the key, and never by the
           column a module's lane puts it in. -->
      <p class="flex items-center gap-2 text-base text-neutral-900">
        <span class="h-2.5 w-2.5 rounded-full" :class="laneDotClass(laneColor(headLane))"/>
        <span>{{ headLabel }}</span>
      </p>
      <p class="flex items-center gap-2 text-base text-neutral-900">
        <span>{{ tailLabel }}</span>
        <span class="h-2.5 w-2.5 rounded-full" :class="laneDotClass(laneColor(tailLane))"/>
      </p>
    </div>

    <div ref="frame" class="w-full">
      <svg ref="svg" class="block w-full" :class="{ 'is-key-focus': keyFocus }"
           :viewBox="`0 0 ${W} ${view.height}`"
           role="application" tabindex="0"
           :aria-label="`${flow.ribbons.length} dependencies. Arrow keys move between modules.`"
           @keydown="onKey"
           @pointerdown="viaPointer = true"
           @focus="keyFocus = !viaPointer; viaPointer = false"
           @blur="keyFocus = false">
        <!-- The focused module's row, banded the full width. Recolouring an
             eleven-pixel bar is not enough to find in a long drawing; the
             band is what the eye lands on after a click from elsewhere. -->
        <rect v-for="(row, side) in { left: rowLeft, right: rowRight }" :key="side"
              class="row pointer-events-none fill-neutral-100"
              :x="row?.x ?? 0" :width="row?.w ?? 0"
              :y="row?.y ?? 0" :height="ROW_H"
              rx="4" :fill-opacity="row ? 1 : 0"/>

        <!-- Ribbons under the nodes so every node edge stays crisp. -->
        <g>
          <path v-for="r in view.ribbons" :key="r.id"
                :d="ribbon(r)"
                :fill="ribbonFill(r)"
                :fill-opacity="ribbonOpacity(r) * r.alpha * (1 - 0.95 * motion)"
                class="cursor-pointer transition-[fill-opacity] duration-200"
                @mouseenter="hovered = r.id" @mouseleave="hovered = null"
                @click="onRibbon(r)">
            <title>{{ describe(r) }}</title>
          </path>
        </g>

        <!-- Left column. -->
        <g v-for="n in view.left" :key="'l' + n.key" :opacity="n.alpha">
          <rect :x="barX(n, 'left')" :y="n.y0" :width="barW(n)"
                :height="Math.max(1, n.y1 - n.y0)" rx="2"
                :class="nodeClass(n)" :fill-opacity="n.path ? 1 : 0.34"
                @mouseenter="hoveredNode = n.key" @mouseleave="hoveredNode = null"
                @click="onNode(n)">
            <title>{{ nodeTitle(n, "left") }}</title>
          </rect>
          <!-- The share of this module's traffic that runs against the grain,
               in proportion. Flagging the whole bar red the moment any of it
               returned said something is wrong here and nothing about how
               much: four references in a hundred looked like forty. -->
          <path v-if="backHeight(n)"
                :d="capPath(barX(n, 'left'), n.y0, barW(n), backHeight(n))"
                class="pointer-events-none fill-red-500"/>
          <!-- Magnitude beside the name, so two modules can be compared
               without hovering either of them. -->
          <text :x="LEFT - 8" :y="mid(n)" text-anchor="end" dominant-baseline="middle"
                class="pointer-events-none select-none font-mono tabular-nums"
                :style="{ fontSize: `${LABEL_SIZE}px` }" :fill="countFill(n)">{{ n.weight }}</text>
          <text :x="LEFT - 8 - COUNT_W" :y="mid(n)" text-anchor="end" dominant-baseline="middle"
                class="pointer-events-none select-none font-mono"
                :style="{ fontSize: `${LABEL_SIZE}px`, fontWeight: emphasis(n) }"
                :fill="labelFill(n)">{{ clip(n.label) }}</text>
          <path v-if="marked(n)" :d="warnMark(LEFT - 12 - COUNT_W - textWidth(n.label), mid(n))"
                :fill="markFill(n)" class="pointer-events-none"/>
        </g>

        <!-- Right column. -->
        <g v-for="n in view.right" :key="'r' + n.key" :opacity="n.alpha">
          <rect :x="barX(n, 'right')" :y="n.y0" :width="barW(n)"
                :height="Math.max(1, n.y1 - n.y0)" rx="2"
                :class="nodeClass(n)" :fill-opacity="n.path ? 1 : 0.34"
                @mouseenter="hoveredNode = n.key" @mouseleave="hoveredNode = null"
                @click="onNode(n)">
            <title>{{ nodeTitle(n, "right") }}</title>
          </rect>
          <path v-if="backHeight(n)"
                :d="capPath(barX(n, 'right'), n.y0, barW(n), backHeight(n))"
                class="pointer-events-none fill-red-500"/>
          <text :x="RIGHT + BAR + 8" :y="mid(n)" text-anchor="start" dominant-baseline="middle"
                class="pointer-events-none select-none font-mono tabular-nums"
                :style="{ fontSize: `${LABEL_SIZE}px` }" :fill="countFill(n)">{{ n.weight }}</text>
          <text :x="RIGHT + BAR + 8 + COUNT_W" :y="mid(n)" text-anchor="start" dominant-baseline="middle"
                class="pointer-events-none select-none font-mono"
                :style="{ fontSize: `${LABEL_SIZE}px`, fontWeight: emphasis(n) }"
                :fill="labelFill(n)">{{ clip(n.label) }}</text>
          <path v-if="marked(n)"
                :d="warnMark(RIGHT + BAR + 12 + COUNT_W + textWidth(n.label), mid(n))"
                :fill="markFill(n)" class="pointer-events-none"/>
        </g>
      </svg>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import type { BoundaryFlow, FlowNode, FlowRibbon } from "~/utils/boundaryFlow"
import { blendBoundary, easeOut, settled, type BoundaryView } from "~/utils/boundaryTween"

/**
 * Long enough to be followed, short enough not to be waited on.
 *
 * The exponential ease does most of the travel in the first two fifths, so
 * this reads as a move of about a seventh of a second with a soft landing.
 */
const RELAYOUT_MS = 340

const BAR = 11
const LABEL_SIZE = 11
const COUNT_W = 30
const MIN_GUTTER = 110
const MAX_GUTTER = 280
const MIN_WIDTH = 360
/** A selected row is the height of its own name, not of its bar. */
const ROW_H = 19

const props = defineProps<{
  flow: BoundaryFlow
  headLane: string
  tailLane: string
  headLabel: string
  tailLabel: string
  selectedPath: string | null
  /** Modules an open warning is about, marked across the diagram. */
  flaggedPaths: string[]
  /** Whether the folded tail can still be opened up. */
  canExpand: boolean
  laneColor: (lane: string) => LaneColor
}>()
const emit = defineEmits<{
  (e: "select", path: string): void
  (e: "inspectPair", from: string, to: string): void
  (e: "expand"): void
}>()

const hovered = ref<string | null>(null)
const hoveredNode = ref<string | null>(null)

// An svg with a tabindex matches :focus-visible on a plain click in Chrome,
// so clicking a module drew a ring around the whole diagram. The ring is for
// the reader who is about to use the arrow keys.
const keyFocus = ref(false)
const viaPointer = ref(false)

// Measured on a plain wrapper, not on the svg: the svg's own height is
// derived from the viewBox this measurement sets.
const frame = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const measured = ref(900)
let observer: ResizeObserver | null = null
onMounted(() => {
  const el = frame.value
  if (!el) return
  measured.value = el.clientWidth || 900
  // Read the live width rather than the delivered rect, and settle on the
  // next frame: the drawing's height feeds the scroll container that sets
  // this width, so a toggling scrollbar makes the two chase each other and
  // the observer stops delivering mid-oscillation.
  observer = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      const w = frame.value?.clientWidth
      if (w) measured.value = Math.max(MIN_WIDTH, Math.round(w))
    })
  })
  observer.observe(el)
})
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frameId) })

const W = computed(() => Math.max(MIN_WIDTH, measured.value))
const GUTTER = computed(() =>
  Math.round(Math.min(MAX_GUTTER, Math.max(MIN_GUTTER, W.value * 0.26))))
const LEFT = computed(() => GUTTER.value)
const RIGHT = computed(() => W.value - GUTTER.value - BAR)
const MID = computed(() => Math.round((LEFT.value + BAR + RIGHT.value) / 2))
const MAX_LABEL = computed(() =>
  Math.max(8, Math.floor((GUTTER.value - COUNT_W - 20) / (LABEL_SIZE * 0.6))))

const flaggedSet = computed(() => new Set(props.flaggedPaths))

/** The module in focus: what was clicked, else what is hovered. */
const focusKey = computed(() => hoveredNode.value ?? props.selectedPath ?? null)

/**
 * The drawing as it currently stands, which is not always what was asked for.
 *
 * Unfolding the tail or collapsing the notes rewrites every height at once;
 * blended, the modules already on screen slide to their new places instead of
 * the reader having to find them again.
 */
const view = ref<BoundaryView>(settled(props.flow))
/**
 * How much of the drawing is currently in motion, 0 at rest.
 *
 * A hundred and fifty translucent ribbons morphing through each other is
 * soup, however correct each path is. They keep their ends on the nodes that
 * are moving and breathe out while it happens, so what the eye follows is the
 * ranking reordering rather than the weave rewriting itself.
 */
const motion = ref(0)
let frameId = 0

watch(() => props.flow, (to) => {
  cancelAnimationFrame(frameId)
  const from = view.value
  // Correct first, animated second. The tween owns what is drawn, so when the
  // frame callback never arrives -- a hidden tab, a throttled window -- the
  // drawing used to freeze on the layout it had before: naming twenty-four
  // modules moved the control and left twelve on screen. Settling here means
  // the picture is already the one that was asked for, and the tween is an
  // enhancement laid over it.
  view.value = settled(to)
  motion.value = 0
  // Selecting a module that is already drawn re-runs the layout without
  // changing it. Animating that made every click shimmer for no reason.
  if (reducedMotion() || document.hidden || shape(from) === shape(to)) return
  const start = performance.now()
  const step = () => {
    const t = (performance.now() - start) / RELAYOUT_MS
    if (t >= 1) {
      view.value = settled(to)
      motion.value = 0
      return
    }
    view.value = blendBoundary(from, to, easeOut(t))
    motion.value = Math.sin(Math.PI * t)
    frameId = requestAnimationFrame(step)
  }
  frameId = requestAnimationFrame(step)
})

/** What a layout looks like, for telling a real relayout from a redundant one. */
function shape(flow: { height: number; left: FlowNode[]; right: FlowNode[] }): string {
  return `${Math.round(flow.height)}|` +
    [...flow.left, ...flow.right].map((n) => `${n.key}:${Math.round(n.y0)}`).join(",")
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * The selected row gets a surface, not a colour wash.
 *
 * Tinting the focused node's full height painted a block as tall as the bar
 * -- two hundred pixels on a hub -- and amber at a tenth of an opacity over a
 * dark surface is brown, not accent. The selection is a row: it is the height
 * of its own name, it stops where that name and its bar stop, and it is a
 * raised surface. The accent belongs to the bar and the ribbons, which is
 * where it carries meaning.
 */
function rowFor(column: BoundaryView["left"], side: "left" | "right") {
  const n = column.find((x) => x.key === focusKey.value)
  if (!n) return null
  const ink = COUNT_W + 8 + textWidth(n.label) + (marked(n) ? 14 : 0)
  return side === "left"
    ? { x: LEFT.value - 8 - ink, w: ink + 8 + BAR + 4, y: mid(n) - ROW_H / 2 }
    : { x: RIGHT.value, w: BAR + 4 + 8 + ink, y: mid(n) - ROW_H / 2 }
}
const rowLeft = computed(() => rowFor(view.value.left, "left"))
const rowRight = computed(() => rowFor(view.value.right, "right"))

/** The selected bar thickens away from the ribbons, so their ends stay put. */
function barX(n: FlowNode, side: "left" | "right"): number {
  if (side === "left") return lit(n) ? LEFT.value - 4 : LEFT.value
  return RIGHT.value
}
function barW(n: FlowNode): number {
  return lit(n) ? BAR + 4 : BAR
}

/**
 * Bring the selection into view, wherever it came from.
 *
 * Following a module link in the inspector selects something that may be
 * hundreds of pixels down a scrolling drawing, and a highlight nobody can
 * see reads as the click having done nothing at all.
 */
watch(() => [props.selectedPath, props.flow] as const, () => {
  const path = props.selectedPath
  if (!path || !svg.value) return
  const node = [...props.flow.left, ...props.flow.right].find((n) => n.path === path)
  if (!node) return
  const scroller = scrollParent(svg.value)
  if (!scroller) return
  // User units are CSS pixels here: the svg is laid out at exactly the width
  // its viewBox was measured from.
  const origin = svg.value.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top + scroller.scrollTop
  const top = origin + node.y0
  const height = node.y1 - node.y0
  const margin = 24
  if (top >= scroller.scrollTop + margin &&
      top + height <= scroller.scrollTop + scroller.clientHeight - margin) return
  scroller.scrollTo({
    top: Math.max(0, top - (scroller.clientHeight - height) / 2),
    behavior: "smooth",
  })
}, { flush: "post" })

function scrollParent(el: Element): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function mid(n: FlowNode) { return (n.y0 + n.y1) / 2 }

function ribbon(r: FlowRibbon): string {
  const x0 = LEFT.value + BAR
  const x1 = RIGHT.value
  const c = (x0 + x1) / 2
  return `M ${x0} ${r.ly0}` +
    ` C ${c} ${r.ly0}, ${c} ${r.ry0}, ${x1} ${r.ry0}` +
    ` L ${x1} ${r.ry1}` +
    ` C ${c} ${r.ry1}, ${c} ${r.ly1}, ${x0} ${r.ly1} Z`
}

/** How much of a node's bar is traffic running the wrong way. */
function backHeight(n: FlowNode): number {
  if (!n.backWeight) return 0
  const h = Math.max(1, n.y1 - n.y0)
  // Never thinner than two pixels: a single returning reference among two
  // hundred is still the thing worth pointing at.
  return Math.max(2, (n.backWeight / Math.max(1, n.weight)) * h)
}

/** A rect with its top corners rounded and its bottom edge square, so the
 *  segment meets the rest of the bar without a seam. */
function capPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(2, h, w / 2)
  return `M ${x} ${y + r} a ${r} ${r} 0 0 1 ${r} ${-r}` +
    ` h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r}` +
    ` v ${h - r} h ${-w} Z`
}

function traced(r: FlowRibbon): boolean {
  if (hovered.value === r.id) return true
  const k = focusKey.value
  return !!k && (r.left === k || r.right === k)
}

/**
 * Quiet by default, accent only for the trace.
 *
 * Painting every ribbon with the accent spent the one loud colour on "all
 * traffic", which is the least informative thing on the screen.
 */
function ribbonFill(r: FlowRibbon): string {
  if (r.back) return "rgb(var(--c-red-500))"
  return traced(r) ? "rgb(var(--c-accent-500))" : "rgb(var(--c-neutral-400))"
}

function ribbonOpacity(r: FlowRibbon): number {
  const focused = !!focusKey.value || !!hovered.value
  if (traced(r)) return r.back ? 0.9 : 0.7
  // A returning reference stays legible even while something else is traced:
  // it is the one thing on this screen that should never disappear.
  if (focused) return r.back ? 0.3 : 0.05
  return r.back ? 0.62 : 0.2
}

/** Marked because a warning names it, or because it sends against the grain. */
function marked(n: FlowNode): boolean {
  return (!!n.path && flaggedSet.value.has(n.path)) || n.returns
}
function markFill(n: FlowNode): string {
  return !!n.path && flaggedSet.value.has(n.path)
    ? "rgb(var(--c-red-500))"
    : "rgb(var(--c-red-400))"
}

function lit(n: FlowNode): boolean {
  return n.key === focusKey.value
}

function nodeClass(n: FlowNode): string {
  const base = n.path ? "cursor-pointer" : (props.canExpand ? "cursor-pointer" : "cursor-default")
  if (lit(n)) return `${base} fill-accent-500`
  if (!!n.path && flaggedSet.value.has(n.path)) return `${base} fill-red-500`
  return `${base} fill-neutral-500`
}

function labelFill(n: FlowNode): string {
  if (lit(n)) return "rgb(var(--c-neutral-900))"
  if (!!n.path && flaggedSet.value.has(n.path)) return "rgb(var(--c-red-500))"
  // While something is in focus, everything unrelated to it steps back, so
  // the names left standing are the ones the focus is about. It steps back
  // to 4.8:1 rather than out of the way: neutral-400 measured 2.6:1 on the
  // light surface, which is receded into illegible.
  if (focusKey.value && !touching(n)) return "rgb(var(--c-neutral-500))"
  return n.path ? "rgb(var(--c-neutral-700))" : "rgb(var(--c-neutral-500))"
}

/** Sits at the other end of a ribbon that the focused module is on. */
function touching(n: FlowNode): boolean {
  const k = focusKey.value
  if (!k) return false
  return props.flow.ribbons.some((r) =>
    (r.left === k && r.right === n.key) || (r.right === k && r.left === n.key))
}

function countFill(n: FlowNode): string {
  // Counts are already the quiet layer, so they brighten for the focus and
  // otherwise hold at the readable value rather than receding twice.
  return lit(n) ? "rgb(var(--c-neutral-900))" : "rgb(var(--c-neutral-500))"
}

/** The heaviest few carry the boundary, so their names say so. */
function emphasis(n: FlowNode): number {
  if (lit(n)) return 600
  return n.path && n.rank < 3 ? 600 : 400
}

function clip(label: string): string {
  return label.length > MAX_LABEL.value ? label.slice(0, MAX_LABEL.value - 1) + "…" : label
}

function textWidth(label: string): number {
  return clip(label).length * LABEL_SIZE * 0.6 + 6
}

/**
 * A warning triangle, drawn rather than typed.
 *
 * A unicode glyph would inherit whatever the font does with it and sit on a
 * text baseline instead of on the node it is about.
 */
function warnMark(x: number, y: number): string {
  const r = 5
  return `M ${x} ${y - r} L ${x + r} ${y + r * 0.8} L ${x - r} ${y + r * 0.8} Z` +
    ` M ${x - 0.8} ${y - 1.8} h 1.6 v 3 h -1.6 Z` +
    ` M ${x - 0.8} ${y + 2.2} h 1.6 v 1.4 h -1.6 Z`
}

/**
 * What this module actually does at the boundary, in both directions.
 *
 * A single total told the reader how much traffic touches a module and left
 * them to infer which way it ran from the column it was in, which is exactly
 * the inference the column headings used to get wrong.
 */
function nodeTitle(n: FlowNode, side: "left" | "right"): string {
  const own = side === "left" ? props.headLabel : props.tailLabel
  const other = side === "left" ? props.tailLabel : props.headLabel
  if (!n.path) {
    const what = `${n.aggregates} more modules in ${own}, ${n.weight} references between them`
    return props.canExpand ? `${what} — click to name them` : what
  }
  // Forward runs head into tail, so which of the two is outbound depends on
  // the column this module's lane put it in.
  const forward = n.weight - n.backWeight
  const out = side === "left" ? forward : n.backWeight
  const inbound = side === "left" ? n.backWeight : forward
  const parts = [
    out ? `${out} ${out === 1 ? "reference" : "references"} out to ${other}` : null,
    inbound ? `${inbound} ${inbound === 1 ? "reference" : "references"} in from ${other}` : null,
  ].filter(Boolean)
  return `${n.label} · ${parts.join(" · ")} · ` +
    `${n.degree} ${n.degree === 1 ? "module" : "modules"} on the other side`
}

function describe(r: FlowRibbon): string {
  const l = labelFor(r.left)
  const t = labelFor(r.right)
  return r.back
    ? `${t} imports ${l} — ${r.weight} ${r.weight === 1 ? "reference" : "references"} against the grain`
    : `${l} imports ${t} — ${r.weight} ${r.weight === 1 ? "reference" : "references"}`
}

/** Named `labelFor`, not `flow`: a setup binding called `flow` would shadow
 *  the prop of the same name in the template, and every `flow.ribbons` in it
 *  would silently read a function's property instead of the layout. */
function labelFor(key: string): string {
  return [...props.flow.left, ...props.flow.right].find((n) => n.key === key)?.label ?? key
}

/** The folded tail opens rather than being a dead end. */
function onNode(n: FlowNode) {
  if (n.path) emit("select", n.path)
  else if (props.canExpand) emit("expand")
}

/**
 * A band is a dependency, so clicking one opens that dependency.
 *
 * Not the module at one of its ends: the reader pointed at the reference,
 * and answering with a module is answering a question they did not ask.
 */
function onRibbon(r: FlowRibbon) {
  if (r.fromPath && r.toPath) {
    emit("inspectPair", r.fromPath, r.toPath)
    return
  }
  // One end is the folded tail, so this band is many dependencies rather than
  // one. Opening the fold is what gets the reader to the reference itself.
  if (props.canExpand) {
    emit("expand")
    return
  }
  const named = r.fromPath ?? r.toPath
  if (named) emit("select", named)
}

/**
 * Arrow keys walk the columns.
 *
 * A diagram whose every affordance needs a mouse is not navigable, and the
 * order the nodes are in is the ranking worth stepping through.
 */
function onKey(event: KeyboardEvent) {
  const named = (col: FlowNode[]) => col.filter((n) => n.path)
  const left = named(props.flow.left)
  const right = named(props.flow.right)
  const inLeft = left.findIndex((n) => n.path === props.selectedPath)
  const inRight = right.findIndex((n) => n.path === props.selectedPath)
  const column = inRight >= 0 ? right : left
  const index = inRight >= 0 ? inRight : inLeft

  let next: FlowNode | undefined
  if (event.key === "ArrowDown") next = column[Math.min(column.length - 1, index + 1)] ?? column[0]
  else if (event.key === "ArrowUp") next = column[Math.max(0, index - 1)] ?? column[0]
  else if (event.key === "ArrowRight") next = right[Math.max(0, inLeft)] ?? right[0]
  else if (event.key === "ArrowLeft") next = left[Math.max(0, inRight)] ?? left[0]
  else return

  event.preventDefault()
  // Tabbing in raises the ring through the focus handler; pressing a key is
  // the other way in, and it does not depend on a focus event arriving.
  keyFocus.value = true
  // The pointer may still be parked on whatever was clicked last, and hover
  // outranks the selection. Without this the ranking walks under the keys
  // while the row surface stays where the mouse happens to be resting.
  hoveredNode.value = null
  hovered.value = null
  if (next?.path) emit("select", next.path)
}
</script>

<style scoped>
/* Written out rather than left to a utility: the diagram takes focus for its
   arrow keys, and a keyboard reader needs to see where the keys will land. */
/* The selected row slides between rows. SVG geometry is animatable as CSS
   here, so the arrow keys read as walking a ranking rather than as four
   separate redraws. */
.row {
    transition: x 170ms cubic-bezier(0.22, 1, 0.36, 1),
                y 170ms cubic-bezier(0.22, 1, 0.36, 1),
                width 170ms cubic-bezier(0.22, 1, 0.36, 1),
                fill-opacity 140ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
    .row { transition: none; }
}

/* The browser's own ring on a tabindex'd svg lands on every click, so it is
   suppressed and re-drawn only while the keys are driving. The class carries
   the higher specificity so it wins over the suppression below it. */
svg:focus {
    outline: none;
}

svg.is-key-focus:focus {
    /* Inset, because an outset ring is clipped by the scrolling stage the
       drawing sits in. */
    outline: 2px solid rgb(var(--c-accent-500));
    outline-offset: -2px;
    border-radius: 4px;
}
</style>
