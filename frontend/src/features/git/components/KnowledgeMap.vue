<template>
  <!-- The codebase as area: every component a tile sized by its lines today,
       grouped by name, coloured by how well someone still here knows it.
       Hatched tiles are code nobody still here has worked on. Packages too
       deep to show roll into one quiet tile with their mix along the bottom. -->
  <div class="flex flex-col gap-2">
    <nav class="flex h-6 items-center gap-0.5 text-sm" aria-label="Where on the map">
      <button type="button" class="rounded px-1.5 py-0.5 hover:bg-neutral-100" :class="zoom.length ? 'text-neutral-600 hover:text-neutral-900' : 'font-medium text-neutral-900'" @click="zoom = []">{{ rootLabel }}</button>
      <template v-for="(z, i) in zoom" :key="z.path">
        <Icon icon="chevron-right" :size="12" class="text-neutral-400"/>
        <button type="button" class="rounded px-1.5 py-0.5 font-mono text-[12px] hover:bg-neutral-100" :class="i === zoom.length - 1 ? 'font-medium text-neutral-900' : 'text-neutral-600'" @click="zoom = zoom.slice(0, i + 1)">{{ z.label }}</button>
      </template>
      <span class="ml-auto text-xs text-neutral-500">{{ zoom.length ? "Press Esc to go back up" : "Size shows lines of code · click a package to open it" }}</span>
    </nav>

    <ExhibitFrame :exhibit="figure">
      <div ref="hostRef" class="relative w-full select-none outline-none" :style="{ height: `${height}px` }" tabindex="-1"
           @mouseleave="hover = null; hoverRolled = null" @keydown.esc="zoom = zoom.slice(0, -1)">
        <svg v-if="width > 0" ref="svgRef" class="block" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img"
             aria-label="Components sized by lines of code, grouped by package, coloured by how much active contributors wrote or changed them">
          <defs>
            <pattern :id="hatchId" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" :fill="p.hatchGround"/>
              <line x1="0" y1="0" x2="0" y2="6" :stroke="p.hatchLine" stroke-width="2.2"/>
            </pattern>
          </defs>

          <!-- Group headers: the name, and its size in lines. -->
          <g :font-family="t.fontSans">
            <g v-for="g in groups" :key="`g${g.path}`">
              <template v-if="g.showLabel">
                <text :x="g.x0 + 1" :y="g.y0 + (g.depth === 1 ? 13 : 10)" :font-size="g.depth === 1 ? 12 : 10.5" :font-weight="g.depth === 1 ? 600 : 500"
                      :fill="g.depth === 1 ? t.ink : t.inkSecondary">{{ g.text }}<tspan v-if="g.size" :fill="t.inkMuted" font-weight="400" :font-family="t.fontMono" font-size="10.5">{{ "  " + g.size }}</tspan></text>
              </template>
            </g>
          </g>

          <!-- Rolled packages: the package's mix across the whole tile, known to the left,
               its name on a chip, a double edge to say "there is more inside". -->
          <g v-for="r in rolled" :key="`r${r.node.path}`" class="cursor-zoom-in" :opacity="r.dim ? 0.16 : 1"
             @click="onRolled(r, $event)" @mouseenter="hover = null; hoverRolled = r">
            <clipPath :id="`${hatchId}-c-${r.i}`"><rect :x="r.x0" :y="r.y0" :width="r.w" :height="r.h" rx="3"/></clipPath>
            <g :clip-path="`url(#${hatchId}-c-${r.i})`">
              <rect v-for="b in r.bands" :key="b.id" :x="b.x" :y="r.y0" :width="b.w + 0.5" :height="r.h"
                    :fill="b.id === 'nobody' ? `url(#${hatchId})` : p.fill[b.id]"/>
            </g>
            <rect :x="r.x0 + 0.5" :y="r.y0 + 0.5" :width="Math.max(0, r.w - 1)" :height="Math.max(0, r.h - 1)" rx="3" fill="none"
                  :stroke="hoverRolled === r ? t.ink : t.hairlineStrong" :stroke-width="hoverRolled === r ? 1.5 : 1"/>
            <rect v-if="r.w > 16 && r.h > 16" :x="r.x0 + 3.5" :y="r.y0 + 3.5" :width="Math.max(0, r.w - 7)" :height="Math.max(0, r.h - 7)" rx="2" fill="none" :stroke="t.surface" stroke-opacity="0.55"/>
            <g v-if="r.name" class="pointer-events-none">
              <rect :x="r.x0 + 6" :y="r.y0 + 6" :width="r.chip" :height="r.sub ? 34 : 20" rx="3" :fill="t.surface" fill-opacity="0.94"/>
              <text :x="r.x0 + 12" :y="r.y0 + 20" :font-family="t.fontSans" font-size="12" font-weight="600" :fill="t.ink">{{ r.name }}</text>
              <text v-if="r.sub" :x="r.x0 + 12" :y="r.y0 + 34" :font-family="t.fontSans" font-size="11" :fill="t.inkSecondary">{{ r.sub }}</text>
            </g>
          </g>

          <!-- Components. -->
          <g v-for="n in tiles" :key="n.row.component" class="cursor-pointer" :opacity="dimmed(n.row) ? 0.16 : 1"
             @click="emit('pick', n.row.component, $event)" @mouseenter="hoverRolled = null; hover = n">
            <rect :x="n.x0" :y="n.y0" :width="n.w" :height="n.h" rx="3"
                  :fill="n.row.state === 'nobody' ? `url(#${hatchId})` : p.fill[n.row.state]"
                  :stroke="ring(n.row) ?? (n.row.state === 'nobody' ? p.hatchLine : 'none')"
                  :stroke-width="n.row.component === focused ? 2.5 : ring(n.row) ? 1.5 : 1"/>
            <text v-if="n.name" :x="n.x0 + 7" :y="n.y0 + 17" :font-family="t.fontSans" font-size="12" font-weight="600" :fill="p.ink[n.row.state]" class="pointer-events-none">{{ n.name }}</text>
            <text v-if="n.sub" :x="n.x0 + 7" :y="n.y0 + 32" :font-family="t.fontSans" font-size="11" :fill="p.inkSoft[n.row.state]" class="pointer-events-none">{{ n.sub }}</text>
          </g>
        </svg>

        <!-- Hover cards: the reading behind a tile, in words. -->
        <div v-if="hoverRolled" class="ui-popover pointer-events-none absolute z-10 flex w-[280px] flex-col gap-1.5 px-3 py-2.5" :style="cardAt(hoverRolled.x0, hoverRolled.y0, hoverRolled.y0 + hoverRolled.h, 150)">
          <span class="truncate font-mono text-sm font-medium text-neutral-900">{{ hoverRolled.node.path }}</span>
          <span v-for="b in hoverRolled.bands" :key="b.id" class="flex items-center gap-2 text-sm text-neutral-700">
            <span class="h-2.5 w-2.5 rounded-sm" :class="{ hairline: b.id === 'nobody' }" :style="{ background: b.id === 'nobody' ? hatchCss : p.fill[b.id] }"></span>
            <span class="flex-1">{{ STATES.find(x => x.id === b.id)!.label }}</span><span class="font-mono text-xs tabular-nums">{{ b.pct }}</span>
          </span>
          <span class="text-xs text-neutral-500">{{ formatNumber(hoverRolled.count, 0) }} components · click to open · ⌘-click to select them all</span>
        </div>
        <div v-if="hover" class="ui-popover pointer-events-none absolute z-10 flex w-[280px] flex-col gap-1 px-3 py-2.5" :style="cardAt(hover.x0, hover.y0, hover.y1, 110)">
          <span class="truncate font-mono text-sm font-medium text-neutral-900" :title="hover.row.component">{{ hover.row.component }}</span>
          <span class="text-sm leading-5 text-neutral-700">{{ sentence(hover.row) }}</span>
          <span class="text-xs text-neutral-500">{{ formatNumber(hover.row.lines, 0) }} lines · click for details · ⌘-click to select</span>
        </div>
      </div>
    </ExhibitFrame>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import * as d3 from "d3"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { useSvgFigure } from "~/features/export/useExportables"
import { formatNumber } from "~/shared/format"
import { chartTheme, useChartTheme } from "~/shared/ui/useChartTheme"
import { useAuthorsStore } from "../authors.store"
import { STATES, type KnowledgeRow, type StateId, type TreeNode } from "../knowledgeLeft"
import { stateBackground, useKnowledgePalette } from "./knowledgeColors"

const props = defineProps<{
  tree: TreeNode
  selected: Set<string>
  focused: string | null
  /** When set, tiles in other states fade. */
  only: StateId | null
  /** When set, tiles not in it fade: a search, or a person's components. */
  matching: Set<string> | null
  windowWords: string
}>()
const emit = defineEmits<{
  (e: "pick", component: string, ev: MouseEvent): void
  (e: "pickMany", components: string[]): void
}>()

const authors = useAuthorsStore()
const { version } = useChartTheme()
const t = computed(() => { void version.value; return chartTheme() })
const p = useKnowledgePalette()
const hatchCss = computed(() => stateBackground("nobody", p.value))
const hatchId = `kn-hatch-${Math.random().toString(36).slice(2, 8)}`

const hostRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const width = ref(0)
const height = computed(() => Math.round(Math.min(640, Math.max(400, width.value * 0.6))))

// ── Where the map stands ────────────────────────────────────────────────
const zoom = ref<TreeNode[]>([])
watch(() => props.tree, () => { zoom.value = [] })
const here = computed(() => zoom.value.at(-1) ?? props.tree)
const rootLabel = computed(() => "All code")
/** Where the map stands, for the list to follow: "" at the top. */
const at = defineModel<string>("at", { default: "" })
watch(here, n => { at.value = zoom.value.length ? n.path : "" })

type Disp = TreeNode & { rolledFrom?: TreeNode }
function rowsOf(n: TreeNode): KnowledgeRow[] { return n.row ? [n.row] : n.children.flatMap(rowsOf) }
const lineMemo = new WeakMap<TreeNode, number>()
function linesOf(n: TreeNode): number {
  let v = lineMemo.get(n)
  if (v === undefined) { v = rowsOf(n).reduce((s, r) => s + Math.max(1, r.lines), 0); lineMemo.set(n, v) }
  return v
}
// Opens the largest packages first while the tiles stay within budget: about
// one tile per 9,000 px², so a tile has room for its name.
const expanded = computed(() => {
  const budget = Math.max(24, Math.round((width.value * height.value) / 9000))
  const open = new Set<TreeNode>([here.value])
  let count = here.value.children.length
  const rolledNow = () => [...open].flatMap(n => n.children).filter(c => !c.row && !open.has(c)).sort((a, b) => linesOf(b) - linesOf(a))
  for (let guard = 0; guard < 500; guard++) {
    const next = rolledNow().find(c => count - 1 + c.children.length <= budget)
    if (!next) break
    open.add(next)
    count += next.children.length - 1
  }
  return open
})
function toDisp(n: TreeNode): Disp {
  if (n.row) return { ...n, children: [] }
  if (expanded.value.has(n)) return { ...n, children: n.children.map(toDisp) }
  return { ...n, children: [], rolledFrom: n }
}
const shown = computed<Disp>(() => ({ ...here.value, children: here.value.children.map(toDisp) }))

const layout = computed(() => {
  if (width.value <= 0) return null
  const root = d3.hierarchy<Disp>(shown.value, n => (n.children.length ? n.children : undefined))
    .sum(n => (n.row ? Math.max(1, n.row.lines) : n.rolledFrom ? linesOf(n.rolledFrom) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return d3.treemap<Disp>()
    .tile(d3.treemapSquarify.ratio(1.3))
    .size([width.value, height.value])
    .paddingTop(n => (n.depth === 0 ? 0 : n.depth === 1 ? 20 : n.depth === 2 && n.x1 - n.x0 > 80 && n.y1 - n.y0 > 50 ? 16 : 2))
    .paddingInner(n => (n.depth === 0 ? 12 : 2))
    .round(true)(root)
})

// Characters that fit in a width at the tile's type size. A name cut to a
// few letters says nothing, so it is left to the hover instead.
const fit = (s: string, w: number, px = 7) => {
  const n = Math.floor((w - 12) / px)
  return s.length <= n ? s : n < 7 ? "" : `${s.slice(0, n - 1)}…`
}
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

const groups = computed(() => (layout.value?.descendants() ?? [])
  .filter(n => n.depth > 0 && n.children)
  .map(n => {
    const w = n.x1 - n.x0
    const text = fit(n.data.label, w, n.depth === 1 ? 7.4 : 6.6)
    const size = n.depth === 1 && text === n.data.label && (text.length + 8) * 7.4 < w ? `${compact(n.value ?? 0)} lines` : ""
    return { path: n.data.path, depth: n.depth, x0: n.x0, y0: n.y0, text, size, showLabel: !!text && (n.depth === 1 || (n.depth === 2 && w > 80 && n.y1 - n.y0 > 50)) }
  }))

const rolled = computed(() => (layout.value?.leaves() ?? [])
  .filter(n => n.data.rolledFrom)
  .map(n => {
    const node = n.data.rolledFrom!
    const rows = rowsOf(node)
    const w = Math.max(0, n.x1 - n.x0), h = Math.max(0, n.y1 - n.y0)
    const total = linesOf(node) || 1
    let x = n.x0
    const bands = STATES.map(st => {
      const lines = rows.filter(r => r.state === st.id).reduce((s, r) => s + Math.max(1, r.lines), 0)
      const b = { id: st.id as StateId, x, w: (lines / total) * w, pct: `${Math.round((lines / total) * 100)}%` }
      x += b.w
      return b
    }).filter(b => b.w > 0)
    const name = h >= 34 ? fit(n.data.label, w - 12, 7.4) : ""
    const sub = name && h >= 54 ? fit(`${rows.length} components`, w - 12, 6.4) : ""
    const chip = Math.min(w - 12, Math.max(name.length * 7.4, sub.length * 6.4) + 14)
    const dim = (!!props.only && !rows.some(r => r.state === props.only)) || (!!props.matching && !rows.some(r => props.matching!.has(r.component)))
    return { node, rows, count: rows.length, x0: n.x0, y0: n.y0, w, h, bands, name, sub, chip, dim }
  })
  .map((r, i) => ({ ...r, i })))
const hoverRolled = ref<(typeof rolled.value)[number] | null>(null)
function onRolled(r: (typeof rolled.value)[number], ev: MouseEvent) {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey) { emit("pickMany", r.rows.map(x => x.component)); return }
  hoverRolled.value = null
  // Go in through every level on the way, so the breadcrumb steps back one at a time.
  const path = (target: TreeNode, from: TreeNode, acc: TreeNode[]): TreeNode[] | null => {
    for (const c of from.children) {
      if (c === target) return [...acc, c]
      const found = path(target, c, [...acc, c])
      if (found) return found
    }
    return null
  }
  zoom.value = [...zoom.value, ...(path(r.node, here.value, []) ?? [r.node])]
}

const tiles = computed(() => (layout.value?.leaves() ?? [])
  .filter(n => n.data.row)
  .map(n => {
    const row = n.data.row!
    const w = n.x1 - n.x0, h = n.y1 - n.y0
    const own = n.data.label === "(own files)"
    const name = h >= 24 ? fit(own ? "own files" : n.data.label, w) : ""
    const who = row.ask ? authors.display(row.ask.author) : "no active contributor"
    const sub = name && h >= 42 ? fit(who, w, 6.4) : ""
    return { row, x0: n.x0, y0: n.y0, y1: n.y1, w: Math.max(0, w), h: Math.max(0, h), name, sub }
  }))

const dimmed = (r: KnowledgeRow) => (!!props.only && r.state !== props.only) || (!!props.matching && !props.matching.has(r.component))
const ring = (r: KnowledgeRow) => (r.component === props.focused || props.selected.has(r.component) ? t.value.accent : null)

const hover = ref<(typeof tiles.value)[number] | null>(null)
function cardAt(x0: number, y0: number, y1: number, h: number) {
  const below = y1 + 8 + h <= height.value
  return { left: `${Math.max(0, Math.min(x0 + 8, width.value - 288))}px`, top: `${below ? y1 + 8 : Math.max(0, y0 - h - 8)}px` }
}
function sentence(r: KnowledgeRow): string {
  const pct = Math.round(r.hereShare * 100)
  const ask = r.ask ? authors.display(r.ask.author) : ""
  if (r.state === "wrote") return `Active contributors wrote ${pct}% of it. Most active: ${ask}.`
  if (r.state === "works") return `Active contributors changed it ${r.hereCommits} times in the ${props.windowWords} and wrote ${pct}% of it. Most active: ${ask}.`
  if (r.state === "once") return `Changed once in the ${props.windowWords}, by ${ask}.`
  const main = r.main ? ` ${authors.display(r.main.author)} wrote most of it (${Math.round(r.main.share * 100)}%)${r.main.here ? "" : " and is no longer active"}.` : ""
  return `No active contributor wrote much of it or changed it in the ${props.windowWords}.${main}`
}

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = Math.floor(e.contentRect.width) })
  if (hostRef.value) ro.observe(hostRef.value)
})
onBeforeUnmount(() => ro?.disconnect())

// The ladder above the map is its legend, and each part of it filters; the frame shows it only in exports.
const figure = useSvgFigure({
  title: "Code by active contributors",
  svg: () => svgRef.value,
  filled: true,
  legendInUi: false,
  legend: () => ({
    items: STATES.map(s => (s.id === "nobody" ? { label: s.label, color: p.value.hatchLine, mark: "hatch" as const } : { label: s.label, color: p.value.fill[s.id] })),
    notes: ["A tile is a component, sized by its lines of code today and grouped by package."],
  }),
})
</script>
