<template>
  <ExhibitFrame :exhibit="figureHandle" header="overlay" legend-class="px-3 pb-2" fill>
    <div ref="host" class="relative h-full min-h-0 w-full overflow-hidden">
      <!-- Hover tooltip -->
      <div
        v-if="hoveredNode"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
        class="ui-tooltip pointer-events-none absolute z-50 flex max-w-xs flex-col gap-1"
      >
        <span class="break-all font-mono text-xs">{{ hoveredNode.data.fullName }}</span>
        <span class="flex items-center justify-between gap-4 text-xs">
          <span class="opacity-70">{{ store.statNiceName(sizeMetric) }}</span>
          <span class="font-mono tabular-nums">{{ formatNumber(hoveredNode.data.sizeValue) }}</span>
        </span>
        <span class="flex items-center justify-between gap-4 text-xs">
          <span class="opacity-70">{{ store.statNiceName(colorMetric) }}</span>
          <span class="font-mono tabular-nums">{{ isBlank(hoveredNode.data.colorValue) ? zeroLabel : formatNumber(hoveredNode.data.colorValue) }}</span>
        </span>
        <span v-if="rankOf.get(hoveredNode.data.unit?.name)" class="text-xs opacity-70">No. {{ rankOf.get(hoveredNode.data.unit?.name) }} of the {{ labelHigh.toLowerCase() }}</span>
      </div>

      <!-- Circle packing canvas -->
      <div ref="chart" class="h-full w-full"></div>

      <!-- Context menu -->
      <div v-if="contextMenu.visible && contextMenu.node" class="fixed inset-0 z-40 cursor-default" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
      <div
        v-if="contextMenu.visible && contextMenu.node"
        class="ui-menu ui-popover absolute z-50 min-w-[200px] animate-in"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="ui-menu-title">{{ contextMenu.node.data.unit ? unitLabel : 'Namespace' }}</div>

        <template v-if="!contextMenu.node.data.unit">
          <button type="button" class="ui-menu-item" @click="promoteNamespaceToGroup">
            <Icon icon="folder" :size="13" class="text-neutral-500"/>
            <span>Promote to group</span>
          </button>
        </template>

        <template v-else>
          <div class="ui-menu-title">Add to group</div>
          <div class="max-h-48 overflow-y-auto">
            <button v-for="g in grainGroups" :key="g.id" type="button" class="ui-menu-item" @click="addLeafToGroup(g.id)">
              <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
              <span class="truncate">{{ g.name }}</span>
            </button>
            <div v-if="grainGroups.length === 0" class="px-2 py-1.5 text-sm text-neutral-400">No groups yet</div>
          </div>
          <div class="my-1 hairline-t"></div>
          <button type="button" class="ui-menu-item text-red-700" @click="removeLeafFromGroups">
            <Icon icon="minus" :size="13"/>
            <span>Remove from groups</span>
          </button>
        </template>
      </div>
    </div>
  </ExhibitFrame>
</template>

<script lang="ts" setup>
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import Icon from "~/shared/ui/Icon.vue"
import { chartTheme, readChartTheme, useChartTheme, withAlpha, type ChartTheme } from "~/shared/ui/useChartTheme"
import { useFigure } from "~/features/export/useExportables"
import { isDarkAppearance, withLightTokens, type FigureOutput, type LegendItem } from "~/features/export/figure"
import { formatNumber } from "~/shared/format"
import * as d3 from "d3"
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { hasMember, units, useGroupsStore, type SavedGroup } from "~/features/groups/groups.store"

export type HotspotGrain = "components" | "directories" | "files"
export type HotspotLayout = "packed" | "flat"

// One row of the active grain: a component, a directory or a file. `name` is
// the full identifier; every other key is a `family__metric` column.
export type HotspotUnit = Record<string, any> & { name: string }

const store = useDataStore()
const groupsStore = useGroupsStore()
const { version: themeVersion } = useChartTheme()

const host = ref<HTMLElement | null>(null)
const chart = ref<HTMLElement | null>(null)

let rootNode: any = null
let chartWidth = 900
let chartHeight = 620

const props = defineProps<{
  units: HotspotUnit[]
  grain: HotspotGrain
  layout: HotspotLayout
  sizeMetric: string
  colorMetric: string
  /** Low heat values are the hot ones (code health). */
  heatInverted?: boolean
  /** What a heat of 0 means when it means "no value" (drawn hollow); null when 0 is a value like any other. */
  zeroLabel?: string | null
  /** The units the page ranks hottest, in order; each gets its number on the chart. */
  ranked?: string[]
  /** How the ranking was drawn, when it is not simply the hottest heat. */
  rankedNote?: string | null
  /** Rows the page did not hand over (files that are not code), said in the legend. */
  leftOutNote?: string | null
  highlightedUnit: string | null
  labelHigh: string
  labelLow: string
  searchQuery?: string
  selectedUnits?: string[]
  hiddenGroups?: Set<string>
  activeFilters?: Set<string>
  hoveredGroupId?: string | null
}>()

const emit = defineEmits<{
  (e: "select", name: string): void
  (e: "open", name: string): void
  (e: "toggle-selection", name: string): void
  (e: "replace-selection", names: string[]): void
}>()

const unitLabel = computed(() => props.grain === "components" ? "Component" : props.grain === "files" ? "File" : "Directory")
const rankOf = computed(() => new Map((props.ranked ?? []).map((name, i) => [name, i + 1])))

/** A heat that stands for "nothing recorded" rather than a value on the scale. */
const isBlank = (v: number) => !!props.zeroLabel && !v

// Saved groups only exist for components and files; directories carry none.
const grainGroups = computed<SavedGroup[]>(() => {
  if (props.grain === "directories") return []
  return groupsStore.groups
})

function groupsOf(name: string): SavedGroup[] {
  if (props.grain === "components") return groupsStore.componentGroupIndex.get(name) || []
  if (props.grain === "files") return groupsStore.fileGroupIndex.get(name) || []
  return []
}

// Group colours are stored as `hsl(...)` strings; alpha them for fills.
function groupFill(hslStr: string, opacity: number): string {
  if (!hslStr) return withAlpha(chartTheme().inkMuted, 0.03)
  if (hslStr.startsWith("hsl(")) return hslStr.replace("hsl(", "hsla(").replace(")", `, ${opacity})`)
  return hslStr
}

const hoveredNode = ref<any | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

const contextMenu = ref<{ visible: boolean; x: number; y: number; node: any }>({ visible: false, x: 0, y: 0, node: null })

function closeContextMenu() {
  contextMenu.value.visible = false
}

function openContextMenu(event: MouseEvent, d: any) {
  if (props.grain === "directories") return
  event.preventDefault()
  event.stopPropagation()
  const bounds = host.value?.getBoundingClientRect()
  if (!bounds) return
  contextMenu.value = { visible: true, x: event.clientX - bounds.left, y: event.clientY - bounds.top, node: d }
}

function promoteNamespaceToGroup() {
  const node = contextMenu.value.node
  if (!node) return
  const leaves: string[] = []
  const collect = (d: any) => {
    if (d.data.unit) leaves.push(d.data.unit.name)
    else if (d.children) d.children.forEach(collect)
  }
  collect(node)
  if (leaves.length > 0) {
    const nsName = node.data.fullName || node.data.name
    groupsStore.createGroup(`Namespace ${nsName}`, units(props.grain === "files" ? "file" : "component", leaves))
  }
  closeContextMenu()
}

function addLeafToGroup(groupId: string) {
  const node = contextMenu.value.node
  if (node?.data.unit) groupsStore.addMembersToGroup(groupId, units(props.grain === "files" ? "file" : "component", [node.data.unit.name]))
  closeContextMenu()
}

function removeLeafFromGroups() {
  const node = contextMenu.value.node
  if (node?.data.unit) {
    const name = node.data.unit.name
    const kind = props.grain === "files" ? "file" : "component"
    for (const g of grainGroups.value) {
      if (hasMember(g, kind, name)) groupsStore.removeMembersFromGroup(g.id, units(kind, [name]))
    }
  }
  closeContextMenu()
}

// ---------------------------------------------------------------------------
// Zoom. The chart opens fitted and stays fitted through resizes and redraws
// until the user zooms; from then on their view is kept until Reset.

let userZoomed = false

const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.3, 15])
  // d3-zoom resolves its extent inside the transition's tween, and its default
  // reads the svg's own width: on a CSS-sized element that throws mid-frame and
  // the transition dies silently. State the box instead.
  .extent(() => {
    const rect = chart.value?.getBoundingClientRect()
    return [[0, 0], [rect?.width || 900, rect?.height || 620]]
  })
  .filter(event => !event.shiftKey && !event.button)

function svgSel() {
  if (!chart.value) return null
  const svg = d3.select(chart.value).select<SVGSVGElement>("svg")
  return svg.empty() ? null : svg
}

function transformFor(d: any, padding: number): d3.ZoomTransform {
  const scale = (Math.min(chartWidth, chartHeight) - padding * 2) / (d.r * 2)
  return d3.zoomIdentity.translate(chartWidth / 2 - scale * d.x, chartHeight / 2 - scale * d.y).scale(scale)
}

function zoomToNode(d: any) {
  const svg = svgSel()
  if (!svg || !d) return
  svg.transition().duration(600).ease(d3.easeCubicOut).call(zoomBehavior.transform as any, transformFor(d, d === rootNode ? 24 : 40))
}

function zoomIn() {
  userZoomed = true
  svgSel()?.transition().duration(250).call(zoomBehavior.scaleBy as any, 1.35)
}

function zoomOut() {
  userZoomed = true
  svgSel()?.transition().duration(250).call(zoomBehavior.scaleBy as any, 0.75)
}

function resetZoom() {
  userZoomed = false
  if (rootNode) zoomToNode(rootNode)
}

defineExpose({ zoomIn, zoomOut, resetZoom })

// ---------------------------------------------------------------------------
// Heat. Hot is always the red end; an inverted perspective (code health) runs
// its values the other way along the same ramp. The ramp starts warm, so any
// measured value reads as colour and only a blank reads as hollow.

interface HeatScale {
  color: (v: number) => string
  /** The value at the cool end and at the hot end. */
  cool: number
  hot: number
  ramp: string[]
}

function heatScaleOf(values: number[], t: ChartTheme): HeatScale {
  const measured = props.zeroLabel ? values.filter(v => v !== 0) : values
  const lo = d3.min(measured) ?? 0
  const hi = d3.max(measured) ?? 1
  const [cool, hot] = props.heatInverted ? [hi, lo] : [lo, hi]
  const ramp = t.heat.slice(1)
  const scale = d3.scaleSequential(d3.interpolateRgbBasis(ramp)).domain(cool === hot ? [cool - 1, hot] : [cool, hot])
  return { color: v => scale(v) as string, cool, hot, ramp }
}

/** The darker and the lighter of ink and surface: text on a light fill, and on a dark one. */
function textOn(fill: string, t: ChartTheme): string {
  const inkL = d3.lab(t.ink).l, surfL = d3.lab(t.surface).l
  const [dark, light] = inkL < surfL ? [t.ink, t.surface] : [t.surface, t.ink]
  return d3.lab(fill).l > 62 ? dark : light
}

// ---------------------------------------------------------------------------
// Key, shown over the chart and printed into the figure.

interface KeyInfo {
  heatLabel: string
  sizeLabel: string
  cool: string
  hot: string
  gradient: string
  ramp: string[]
  blank: string | null
  blankFill: string
  blankStroke: string
  rings: string | null
}

const key = shallowRef<KeyInfo | null>(null)

function keyOf(heat: HeatScale, t: ChartTheme, hasGroupRings: boolean): KeyInfo {
  const n = heat.ramp.length - 1
  return {
    heatLabel: store.statNiceName(props.colorMetric) || props.colorMetric,
    sizeLabel: store.statNiceName(props.sizeMetric) || props.sizeMetric,
    cool: formatNumber(heat.cool, 1),
    hot: formatNumber(heat.hot, 1),
    gradient: `linear-gradient(to right, ${heat.ramp.map((c, i) => `${c} ${Math.round((i / n) * 100)}%`).join(", ")})`,
    ramp: heat.ramp,
    blank: props.zeroLabel || null,
    blankFill: t.ground,
    blankStroke: t.hairlineStrong,
    rings: props.layout === "packed" ? (hasGroupRings ? "Ring: namespace or group" : "Ring: namespace") : (hasGroupRings ? "Outline: group" : null),
  }
}

// ---------------------------------------------------------------------------
// Figure: drawn for the page, not captured from the window. A report prints
// it at the page's width, so it gets its own size, type that survives the
// shrink, the whole chart in view and the key and ranking beside it.

const FIG = { width: 720, height: 480, pack: 452, gap: 28 }
// The page prints the figure a little under its own size; labels are drawn
// as if zoomed out by this much, so they print at about the size of a caption.
const FIG_K = 0.85

// What size and colour stand for, in the same words under the chart and under an export.
const figureHandle = useFigure({
  title: () => (props.grain === "files" ? "Hotspots: files" : props.grain === "directories" ? "Hotspots: directories" : "Hotspots: components"),
  ready: () => !!svgSel(),
  svg: true,
  render: opts => figure(!!opts?.light),
  legend: () => {
    const k = key.value
    if (!k) return {}
    const items: LegendItem[] = []
    if (k.blank) items.push({ label: k.blank, color: k.blankStroke, mark: "ring" })
    if (k.rings) items.push({ label: k.rings.replace(/^(Ring|Outline): /, "").replace(/^./, c => c.toUpperCase()), color: k.blankStroke, mark: "ring" })
    return {
      ramps: [{ label: k.heatLabel, colors: k.ramp, low: k.cool, high: k.hot }],
      items,
      notes: [
        `Area is ${k.sizeLabel.toLowerCase()}.${k.rings ? ` ${k.rings.startsWith("Ring") ? "A ring" : "An outline"} marks a ${k.rings.replace(/^(Ring|Outline): /, "")}.` : ""}`,
        ...(props.leftOutNote ? [props.leftOutNote] : []),
      ],
    }
  },
})

function figure(light: boolean): FigureOutput | null {
  if (!props.units.length || !props.sizeMetric || !props.colorMetric) return null
  const t = light && isDarkAppearance() ? withLightTokens(readChartTheme) : chartTheme()
  const ns = "http://www.w3.org/2000/svg"
  const el = document.createElementNS(ns, "svg") as SVGSVGElement
  const svg = d3.select(el)
    .attr("xmlns", ns)
    .attr("width", FIG.width)
    .attr("height", FIG.height)
    .attr("viewBox", `0 0 ${FIG.width} ${FIG.height}`)
    .attr("font-family", t.fontSans)

  const root = packed(FIG.pack, FIG.pack)
  const heat = heatScaleOf(root.leaves().map((d: any) => d.data.colorValue), t)
  const g = svg.append("g").attr("transform", `translate(16, ${(FIG.height - FIG.pack) / 2})`)
  paint(g, root, heat, t, { live: false })

  // Labels are fitted and decluttered against real text boxes, so the drawing
  // is measured in the document, off screen, then handed over detached.
  el.setAttribute("style", "position:fixed;left:-100000px;top:0")
  document.body.appendChild(el)
  try {
    settleLabels(g, FIG_K)
    g.selectAll("[display=none]").remove()
    drawFigureRanking(svg, t, 16 + FIG.pack + FIG.gap)
  } finally {
    el.remove()
    el.removeAttribute("style")
  }
  return { kind: "svg", svg: el, width: FIG.width, height: FIG.height, light: light && isDarkAppearance() }
}

/** The ranking beside the exported chart; what size and colour mean is the figure's legend. */
function drawFigureRanking(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, t: ChartTheme, x: number) {
  const w = FIG.width - x - 16
  const col = svg.append("g").attr("transform", `translate(${x}, 40)`)
  let y = 0
  const ranked = rankedRows()
  if (ranked.length === 0) return
  col.append("text").attr("y", y).attr("font-size", 12).attr("font-weight", 600).attr("fill", t.ink).text(props.labelHigh)
  if (props.rankedNote) {
    y += 16
    col.append("text").attr("y", y).attr("font-size", 11).attr("fill", t.inkSecondary).text(props.rankedNote)
  }
  y += 6
  for (const [i, u] of ranked.entries()) {
    y += 24
    const row = col.append("g").attr("transform", `translate(0, ${y})`)
    drawBadge(row.append("g").attr("transform", "translate(8, -4)"), i + 1, t)
    const value = formatNumber(Number(u[props.colorMetric]) || 0, 1)
    row.append("text").attr("x", w).attr("text-anchor", "end").attr("font-size", 11).attr("font-family", t.fontMono).attr("fill", t.inkSecondary).text(value)
    const room = w - 24 - value.length * 7 - 10
    row.append("text").attr("x", 24).attr("font-size", 11).attr("font-family", t.fontMono).attr("fill", t.ink).text(tailFit(u.name, Math.floor(room / 6.6)))
  }
}

function rankedRows(): HotspotUnit[] {
  const byName = new Map(props.units.map(u => [u.name, u]))
  return (props.ranked ?? []).map(n => byName.get(n)).filter((u): u is HotspotUnit => !!u)
}

// ---------------------------------------------------------------------------
// Drawing, shared by the window and the figure.

function packed(width: number, height: number): any {
  const data = props.layout === "flat"
    ? buildFlat(props.units, props.sizeMetric, props.colorMetric)
    : buildHierarchy(props.units, props.sizeMetric, props.colorMetric)
  const root = d3.hierarchy(data)
    .sum((d: any) => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
  d3.pack().size([width, height]).padding((d: any) => props.layout === "flat" ? 3 : d.depth === 0 ? 10 : 5)(root as any)
  return root
}

const LEAF_FONT = 10
const nsFont = (d: any) => d.depth === 1 ? 11.5 : 10
// A badge sits on its circle's upper right; one that would cover a badge
// already placed tries the other diagonals. Placed per zoom, since the badges
// keep their screen size while the circles grow.
const DIAGONALS = [[1, -1], [-1, -1], [1, 1], [-1, 1]]
let badgeSpots = new Map<any, { x: number; y: number }>()

function placeBadges(nodes: any[], k: number) {
  badgeSpots = new Map()
  const placed: Array<{ x: number; y: number }> = []
  const clear = 18 / k
  for (const d of nodes) {
    const off = Math.max(d.r * 0.72, 4 / k)
    const spots = DIAGONALS.map(([sx, sy]) => ({ x: d.x + sx * off, y: d.y + sy * off }))
    const spot = spots.find(p => placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= clear)) ?? spots[0]
    placed.push(spot)
    badgeSpots.set(d, spot)
  }
}
const badgeAt = (d: any) => badgeSpots.get(d) ?? { x: d.x + d.r * 0.72, y: d.y - d.r * 0.72 }

function drawBadge(sel: any, rank: number, t: ChartTheme) {
  sel.append("circle").attr("r", 8).attr("fill", t.ink).attr("stroke", t.surface).attr("stroke-width", 1.5)
  sel.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", 10)
    .attr("font-weight", 600)
    .attr("fill", t.surface)
    .text(rank)
}

/**
 * Circles, labels and rank badges. Everything is set as attributes, so the
 * figure keeps its look outside the app; the window adds its handlers after.
 */
function paint(g: any, root: any, heat: HeatScale, t: ChartTheme, opts: { live: boolean }) {
  const node = g.selectAll("g.node")
    .data(root.descendants())
    .join("g")
    .attr("class", "node")
    .attr("transform", (d: any) => `translate(${d.x},${d.y})`)

  // Namespace and group rings.
  node.filter((d: any) => !!d.children && d.depth > 0)
    .append("circle")
    .attr("class", "ns-circle")
    .attr("r", (d: any) => d.r)
    .attr("fill", (d: any) => d.data.isGroup ? groupFill(d.data.groupColor, 0.05) : withAlpha(t.inkMuted, 0.05))
    .attr("stroke", (d: any) => d.data.isGroup ? d.data.groupColor : withAlpha(t.inkMuted, 0.3))
    .attr("stroke-width", (d: any) => d.data.isGroup ? 2 : 1)
    .attr("vector-effect", "non-scaling-stroke")

  const leaf = node.filter((d: any) => !d.children)

  // Flat layout has no rings, so group membership becomes an outline.
  if (props.layout === "flat") {
    leaf.filter((d: any) => !!d.data.groupColor)
      .append("circle")
      .attr("r", (d: any) => d.r + 1.5)
      .attr("fill", "none")
      .attr("stroke", (d: any) => d.data.groupColor)
      .attr("stroke-width", 2)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("pointer-events", "none")
  }

  const fillOf = (d: any) => isBlank(d.data.colorValue) ? t.ground : heat.color(d.data.colorValue)
  leaf.append("circle")
    .attr("class", "leaf-circle")
    .attr("r", (d: any) => d.r)
    .attr("fill", fillOf)
    .attr("stroke", (d: any) => isBlank(d.data.colorValue) ? t.hairlineStrong : withAlpha(t.ink, 0.1))
    .attr("stroke-width", 1)
    .attr("vector-effect", "non-scaling-stroke")

  // Namespace labels sit inside the top of their ring, on a halo of the ground.
  node.filter((d: any) => !!d.children && d.depth > 0 && d.depth < 3)
    .append("text")
    .attr("class", "namespace-label")
    .attr("text-anchor", "middle")
    .attr("fill", (d: any) => d.depth === 1 ? t.inkSecondary : t.inkMuted)
    .attr("font-weight", (d: any) => d.depth === 1 ? 600 : 500)
    .attr("stroke", t.surface)
    .attr("stroke-width", 3)
    .attr("stroke-linejoin", "round")
    .attr("paint-order", "stroke")
    .attr("pointer-events", "none")

  leaf.append("text")
    .attr("class", "leaf-label")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", (d: any) => textOn(fillOf(d), t))
    .attr("font-weight", 500)
    .attr("pointer-events", "none")

  // Rank badges, drawn last so they sit over every circle.
  const rank = rankOf.value
  const ranked = root.leaves().filter((d: any) => rank.has(d.data.unit?.name))
  const badges = g.selectAll("g.rank-badge")
    .data(ranked)
    .join("g")
    .attr("class", "rank-badge")
    .attr("pointer-events", "none")
    .attr("transform", (d: any) => `translate(${badgeAt(d).x},${badgeAt(d).y})`)
  badges.each(function (this: SVGGElement, d: any) { drawBadge(d3.select(this), rank.get(d.data.unit.name)!, t) })

  if (!opts.live) applyZoom(g, FIG_K)
}

/** Sizes that stay constant on screen whatever the zoom. */
function applyZoom(g: any, k: number) {
  g.selectAll(".leaf-label").attr("font-size", LEAF_FONT / k)
  g.selectAll(".namespace-label")
    .attr("font-size", (d: any) => nsFont(d) / k)
    .attr("stroke-width", 3 / k)
    .attr("y", (d: any) => -d.r + (nsFont(d) + 6) / k)
  const badges = g.selectAll(".rank-badge")
  placeBadges(badges.data().sort((a: any, b: any) => rankOf.value.get(a.data.unit.name)! - rankOf.value.get(b.data.unit.name)!), k)
  badges.attr("transform", (d: any) => `translate(${badgeAt(d).x},${badgeAt(d).y}) scale(${1 / k})`)
}

/** Text for each label at zoom k: what fits in its circle, or nothing; a search shows only its matches. Then declutter. */
function settleLabels(g: any, k: number, query = "") {
  g.selectAll(".leaf-label").each(function (this: SVGTextElement, d: any) {
    const r = d.r * k
    const matched = !!query && matches(d, query)
    const chars = Math.floor((r * 1.7) / (LEAF_FONT * 0.58))
    const text = r >= 14 || matched ? headFit(d.data.name, Math.max(chars, matched ? 12 : 0)) : ""
    this.textContent = text
    if (text && (!query || matched)) this.removeAttribute("display")
    else this.setAttribute("display", "none")
  })
  g.selectAll(".namespace-label").each(function (this: SVGTextElement, d: any) {
    const r = d.r * k
    const text = r >= 36 ? tailFit(d.data.name, Math.floor((r * 1.5) / (nsFont(d) * 0.6))) : ""
    this.textContent = text
    if (text) this.removeAttribute("display")
    else this.setAttribute("display", "none")
  })
  declutter(g)
}

/** The start of a name, cut with an ellipsis to `max` characters. */
function headFit(name: string, max: number): string {
  if (max < 3) return ""
  return name.length > max ? name.slice(0, max - 1) + "…" : name
}

/** The end of a name, where a namespace keeps its meaning, cut to `max` characters. */
function tailFit(name: string, max: number): string {
  if (max < 4) return ""
  return name.length > max ? "…" + name.slice(name.length - max + 1) : name
}

function matches(d: any, query: string): boolean {
  const full = d.data.unit?.name || d.data.fullName || ""
  return full.toLowerCase().includes(query) || (d.data.name || "").toLowerCase().includes(query)
}

/**
 * Hide labels that would print over one another. Badges outrank everything,
 * namespaces outrank leaves, outer namespaces outrank inner ones, bigger
 * circles outrank smaller: what stays is the most important label at every
 * spot, never two run together ("Pre[i18n]nta").
 */
function declutter(g: any) {
  const nodes = [...g.selectAll(".namespace-label, .leaf-label").nodes()] as SVGTextElement[]
  const rank = (el: SVGTextElement) => {
    const d: any = (el as any).__data__
    const ns = el.classList.contains("namespace-label")
    return (ns ? 0 : 10) + (ns ? d.depth : 0) - (d.r || 0) / 1e6
  }
  const kept: DOMRect[] = ([...g.selectAll(".rank-badge").nodes()] as SVGGElement[])
    .map(el => el.getBoundingClientRect())
    .filter(b => b.width > 0)
  for (const el of nodes.sort((a, b) => rank(a) - rank(b))) {
    if (el.getAttribute("display") === "none" || !el.textContent) continue
    const b = el.getBoundingClientRect()
    if (b.width === 0) continue
    const hits = kept.some(k => b.left < k.right + 2 && b.right > k.left - 2 && b.top < k.bottom + 1 && b.bottom > k.top - 1)
    if (hits) el.setAttribute("display", "none")
    else kept.push(b)
  }
}

// ---------------------------------------------------------------------------
// The window's chart.

// Layout and grain changes reset the zoom; everything else keeps it. Declared
// before the redraw watcher so it runs first in the same flush.
watch(() => [props.grain, props.layout], () => { userZoomed = false })

watch(() => [
  props.units,
  props.grain,
  props.layout,
  props.sizeMetric,
  props.colorMetric,
  props.heatInverted,
  props.zeroLabel,
  props.ranked,
  props.highlightedUnit,
  props.labelHigh,
  props.labelLow,
  props.searchQuery,
  props.selectedUnits,
  props.hiddenGroups,
  props.activeFilters,
  props.hoveredGroupId,
  groupsStore.groups,
  themeVersion.value,
], () => {
  drawCirclePack()
}, { deep: true })

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  drawCirclePack()
  if (chart.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => drawCirclePack())
    resizeObserver.observe(chart.value)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function drawCirclePack() {
  if (!chart.value) return
  const chartEl = d3.select(chart.value)

  const existingSvg = chartEl.select<SVGSVGElement>("svg")
  const kept = !existingSvg.empty() && userZoomed ? d3.zoomTransform(existingSvg.node()!) : null

  chartEl.selectAll("svg").remove()
  hoveredNode.value = null

  if (!props.units || props.units.length === 0) {
    rootNode = null
    key.value = null
    return
  }

  const t = chartTheme()
  const rect = chart.value.getBoundingClientRect()
  const width = rect.width || 900
  const height = rect.height || 620
  chartWidth = width
  chartHeight = height

  const root = packed(width - 40, height - 40)
  rootNode = root
  const heat = heatScaleOf(root.leaves().map((d: any) => d.data.colorValue), t)
  key.value = keyOf(heat, t, root.descendants().some((d: any) => d.data.isGroup || (props.layout === "flat" && d.data.groupColor)))

  const svg = chartEl.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("font-family", t.fontSans)
    .style("display", "block")
    .style("cursor", "grab")
    .style("touch-action", "none")
    .on("click", function (event) {
      if (event.defaultPrevented) return
      if (event.target === this) resetZoom()
    })

  const g = svg.append("g")
  paint(g, root, heat, t, { live: true })

  const query = props.searchQuery?.trim().toLowerCase()
  const isHighlighted = (d: any) => !!props.highlightedUnit && d.data.unit?.name === props.highlightedUnit
  const opacityOf = (d: any) => {
    const name = d.data.unit?.name
    if (!name) return 1
    if (isHighlighted(d)) return 1
    if (query && !matches(d, query)) return 0.08
    if (props.hoveredGroupId) return groupsOf(name).some(gr => gr.id === props.hoveredGroupId) ? 1 : 0.08
    if (props.activeFilters && props.activeFilters.size > 0) return groupsOf(name).some(gr => props.activeFilters!.has(gr.id)) ? 1 : 0.08
    return 1
  }
  const restStroke = (d: any) => isHighlighted(d) ? t.ink : (query && matches(d, query)) ? t.blue : isBlank(d.data.colorValue) ? t.hairlineStrong : withAlpha(t.ink, 0.1)
  const restWidth = (d: any) => isHighlighted(d) ? 2.5 : (query && matches(d, query)) ? 2 : 1

  const nodeSel = g.selectAll<SVGGElement, any>("g.node")
  nodeSel.select(".ns-circle")
    .style("cursor", "zoom-in")
    .on("mouseover", function (this: SVGCircleElement, _e: MouseEvent, d: any) {
      d3.select(this).attr("stroke", d.data.isGroup ? d.data.groupColor : withAlpha(t.inkSecondary, 0.6))
    })
    .on("mouseout", function (this: SVGCircleElement, _e: MouseEvent, d: any) {
      d3.select(this).attr("stroke", d.data.isGroup ? d.data.groupColor : withAlpha(t.inkMuted, 0.3))
    })
    .on("click", function (event: MouseEvent, d: any) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      userZoomed = true
      zoomToNode(d)
    })
    .on("contextmenu", (event: MouseEvent, d: any) => openContextMenu(event, d))

  const leafSel = nodeSel.filter((d: any) => !d.children)

  // Selection rings.
  leafSel.insert("circle", ".leaf-circle")
    .attr("r", (d: any) => d.r + 3)
    .attr("fill", "none")
    .attr("stroke", t.blue)
    .attr("stroke-width", 2)
    .attr("vector-effect", "non-scaling-stroke")
    .attr("pointer-events", "none")
    .attr("display", (d: any) => (props.selectedUnits?.includes(d.data.unit?.name) ? null : "none"))

  leafSel.select(".leaf-circle")
    .attr("fill-opacity", opacityOf)
    .attr("stroke-opacity", opacityOf)
    .attr("stroke", restStroke)
    .attr("stroke-width", restWidth)
    .style("cursor", "pointer")
    .style("pointer-events", (d: any) => opacityOf(d) < 0.2 ? "none" : "auto")
    .on("mouseover", function (this: SVGCircleElement, event: MouseEvent, d: any) {
      d3.select(this).attr("stroke", t.ink).attr("stroke-width", 2)
      hoveredNode.value = d
      placeTooltip(event)
    })
    .on("mousemove", (event: MouseEvent) => placeTooltip(event))
    .on("mouseout", function (this: SVGCircleElement, _e: MouseEvent, d: any) {
      d3.select(this).attr("stroke", restStroke(d)).attr("stroke-width", restWidth(d))
      hoveredNode.value = null
    })
    .on("click", function (event: MouseEvent, d: any) {
      closeContextMenu()
      if (event.defaultPrevented) return
      event.stopPropagation()
      if (!d.data.unit) return
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) emit("toggle-selection", d.data.unit.name)
      else emit("select", d.data.unit.name)
    })
    .on("dblclick", function (event: MouseEvent, d: any) {
      event.preventDefault()
      event.stopPropagation()
      if (d.data.unit) emit("open", d.data.unit.name)
    })
    .on("contextmenu", (event: MouseEvent, d: any) => openContextMenu(event, d))

  leafSel.select(".leaf-label").attr("fill-opacity", opacityOf)
  g.selectAll(".rank-badge").attr("opacity", (d: any) => opacityOf(d) < 1 ? 0.15 : 1)

  zoomBehavior
    .on("start", () => { svg.style("cursor", "grabbing") })
    .on("zoom", (event) => {
      if (event.sourceEvent) userZoomed = true
      g.attr("transform", event.transform)
      applyZoom(g, event.transform.k)
    })
    .on("end", (event) => {
      svg.style("cursor", "grab")
      settleLabels(g, event.transform.k, query)
    })

  svg.call(zoomBehavior).on("dblclick.zoom", null)

  // Shift-drag box selection.
  let dragSelectionBox: any = null
  let dragStartG: { x: number; y: number } | null = null

  const pointInG = (event: MouseEvent) => {
    const bounds = svg.node()?.getBoundingClientRect()
    if (!bounds) return null
    const transform = d3.zoomTransform(svg.node() as any)
    return {
      x: (event.clientX - bounds.left - transform.x) / transform.k,
      y: (event.clientY - bounds.top - transform.y) / transform.k,
    }
  }

  svg.on("mousedown", function (event) {
    if (!event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    const p = pointInG(event)
    if (!p) return
    dragStartG = p
    dragSelectionBox = g.append("rect")
      .attr("x", p.x).attr("y", p.y).attr("width", 0).attr("height", 0)
      .attr("fill", withAlpha(t.blue, 0.08))
      .attr("stroke", t.blue)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3")
      .attr("vector-effect", "non-scaling-stroke")
  })

  svg.on("mousemove", function (event) {
    if (!dragStartG || !dragSelectionBox) return
    const p = pointInG(event)
    if (!p) return
    dragSelectionBox
      .attr("x", Math.min(dragStartG.x, p.x))
      .attr("y", Math.min(dragStartG.y, p.y))
      .attr("width", Math.abs(dragStartG.x - p.x))
      .attr("height", Math.abs(dragStartG.y - p.y))
  })

  svg.on("mouseup", function (event) {
    if (!dragStartG || !dragSelectionBox) return
    const p = pointInG(event)
    if (!p) return
    const x = Math.min(dragStartG.x, p.x)
    const y = Math.min(dragStartG.y, p.y)
    const w = Math.abs(dragStartG.x - p.x)
    const h = Math.abs(dragStartG.y - p.y)

    const selectedList: string[] = []
    root.leaves().forEach((d: any) => {
      if (!d.data.unit) return
      if (d.x >= x && d.x <= x + w && d.y >= y && d.y <= y + h && opacityOf(d) >= 0.2) selectedList.push(d.data.unit.name)
    })
    if (w > 3 && h > 3 && selectedList.length > 0) emit("replace-selection", selectedList)

    dragSelectionBox.remove()
    dragSelectionBox = null
    dragStartG = null
  })

  // Fitted, or the user's own view; labels are settled once the transform is in place.
  svg.call(zoomBehavior.transform, kept ?? transformFor(root, 24))
}

function placeTooltip(event: MouseEvent) {
  const bounds = host.value?.getBoundingClientRect()
  if (!bounds) return
  tooltipX.value = event.clientX - bounds.left + 16
  tooltipY.value = event.clientY - bounds.top + 16
}

// ---------------------------------------------------------------------------
// Hierarchies.

function leafOf(unit: HotspotUnit, sizeKey: string, colorKey: string, shortName: string, groupColor?: string) {
  const size = Number(unit[sizeKey]) || 0
  return {
    name: shortName,
    fullName: unit.name,
    unit,
    value: Math.max(size, 1),
    sizeValue: size,
    colorValue: Number(unit[colorKey]) || 0,
    groupColor,
  }
}

function shortNameOf(name: string): string {
  const lastDelim = Math.max(name.lastIndexOf("/"), name.lastIndexOf("."), name.lastIndexOf("\\"))
  return lastDelim !== -1 ? name.substring(lastDelim + 1) : name
}

function visibleGroupOf(name: string): SavedGroup | undefined {
  return groupsOf(name).find(g => !props.hiddenGroups?.has(g.id))
}

// Flat: every leaf directly under the root, one pack, no namespace circles.
function buildFlat(units: HotspotUnit[], sizeKey: string, colorKey: string) {
  return {
    name: "root",
    children: units.map(u => leafOf(u, sizeKey, colorKey, shortNameOf(u.name), visibleGroupOf(u.name)?.color)),
  }
}

// Packed: saved groups first, then the `/`, `\` or `.` separated namespace tree.
function buildHierarchy(units: HotspotUnit[], sizeKey: string, colorKey: string) {
  const root: any = { name: "root", children: [] }
  const groupNodes = new Map<string, any>()
  const unassignedNode: any = { name: "Not in a group", children: [] }
  root.children.push(unassignedNode)

  units.forEach(unit => {
    const name = unit.name
    const group = visibleGroupOf(name)

    if (group) {
      let gNode = groupNodes.get(group.id)
      if (!gNode) {
        gNode = { name: group.name, fullName: group.name, children: [], isGroup: true, groupColor: group.color }
        root.children.push(gNode)
        groupNodes.set(group.id, gNode)
      }
      gNode.children.push(leafOf(unit, sizeKey, colorKey, shortNameOf(name), group.color))
      return
    }

    let parts = [name]
    let sep = "."
    if (name.includes("\\")) { parts = name.split("\\").filter(x => x); sep = "\\" }
    else if (name.includes("/")) { parts = name.split("/").filter(x => x); sep = "/" }
    else if (name.includes(".")) parts = name.split(".")
    if (parts.length === 0) parts = [name]

    let current = unassignedNode
    let path = ""
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx]
      const isLeaf = idx === parts.length - 1
      path = path ? `${path}/${part}` : part
      let existing = current.children.find((c: any) => c.name === part)

      if (isLeaf) {
        if (!existing) current.children.push(leafOf(unit, sizeKey, colorKey, part))
        // Directory grain: a row whose name is also a namespace of deeper rows
        // keeps its own circle inside that namespace.
        else if (existing.children) existing.children.push(leafOf(unit, sizeKey, colorKey, part))
        break
      }

      if (!existing) {
        existing = { name: part, fullName: path, children: [], sep }
        current.children.push(existing)
      } else if (existing.unit && !existing.children) {
        // The reverse order of the case above: the row arrived before its children.
        const self = existing
        existing = { name: part, fullName: path, children: [self], sep }
        current.children[current.children.indexOf(self)] = existing
      }
      current = existing
    }
  })

  function prune(node: any) {
    if (node.children && node.children.length > 0) {
      node.children.forEach(prune)
      delete node.value
    } else {
      delete node.children
    }
  }
  prune(root)

  // A namespace holding nothing but one deeper namespace is one ring, not a
  // stack of them: `org` › `broadleafcommerce` › `core` reads `org.broadleafcommerce.core`.
  const isNamespace = (n: any) => !!n.children && !n.unit && !n.isGroup
  function collapse(node: any) {
    if (!node.children) return
    for (const child of node.children) {
      while (isNamespace(child) && child.children.length === 1 && isNamespace(child.children[0])) {
        const only = child.children[0]
        child.name = `${child.name}${child.sep ?? "."}${only.name}`
        child.fullName = only.fullName
        child.children = only.children
      }
      collapse(child)
    }
  }
  collapse(root)

  root.children = root.children.filter((c: any) => c.children && c.children.length > 0)
  // A single top-level namespace adds nothing but a ring; unwrap it.
  while (root.children.length === 1 && root.children[0].children && !root.children[0].isGroup) {
    root.children = root.children[0].children
  }
  return root
}
</script>
