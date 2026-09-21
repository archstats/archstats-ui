<template>
  <!-- Who flows in, what flows out.
       Both sides share one vertical scale, so 443 dependents against 16
       dependencies is the picture rather than a caption: the left stack fills
       the height and the right one is a sliver. The only licence taken is a
       floor under each band, so a side with several small groups stays
       clickable and labelled; every band prints its own count. -->
  <div ref="host" class="relative w-full select-none">
    <svg :width="width" :height="height" class="block" role="img" :aria-label="caption">
      <g v-for="side in sides" :key="side.key">
        <path
          v-for="band in side.bands"
          :key="`${side.key}-${band.key}`"
          :d="band.path"
          class="cursor-pointer transition-opacity focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          :class="band.color ? '' : colored ? 'fill-neutral-400' : side.key === 'in' ? 'fill-blue-500' : 'fill-accent-500'"
          :fill="band.color"
          :opacity="opacityOf(band.key)"
          tabindex="0"
          role="button"
          :aria-label="`${band.label}: ${band.components} ${side.noun}`"
          @click="emit('select', band.key)"
          @keydown.enter.prevent="emit('select', band.key)"
          @keydown.space.prevent="emit('select', band.key)"
          @mouseenter="hovered = band.key"
          @mouseleave="hovered = null"
        >
          <title>{{ band.label }} — {{ formatNumber(band.components) }} {{ side.noun }}, {{ formatNumber(band.references) }} references</title>
        </path>
      </g>

      <!-- The component itself: two edges on the same scale as the bands. -->
      <path :d="nodePath" class="fill-surface stroke-neutral-400"/>
      <text :x="centreX" :y="nodeLabelY" text-anchor="middle" class="fill-neutral-900 font-mono text-[11px]">{{ truncate(centreLabel, 22) }}</text>

      <!-- Band labels, on one line each, outside the ribbons -->
      <g v-for="side in sides" :key="`labels-${side.key}`">
        <text
          v-for="band in side.bands"
          :key="`label-${side.key}-${band.key}`"
          :x="side.labelX"
          :y="band.labelY"
          :text-anchor="side.labelAnchor"
          class="cursor-pointer text-[11px]"
          @click="emit('select', band.key)"
        >
          <tspan :class="band.key === selected ? 'fill-neutral-900' : 'fill-neutral-600'">{{ truncate(band.label, labelChars) }}</tspan>
          <tspan class="fill-neutral-400 font-mono text-[10px]"> {{ formatNumber(band.components) }}·{{ formatNumber(band.references) }}</tspan>
        </text>
      </g>

      <!-- Column headings carry the totals the scale is built on -->
      <g v-for="side in sides" :key="`head-${side.key}`">
        <text :x="side.headX" :y="15" :text-anchor="side.headAnchor" class="fill-neutral-500 text-[11px]">
          {{ side.heading }}
          <tspan class="fill-neutral-800 font-mono text-[12px]">{{ formatNumber(side.total) }}</tspan>
        </text>
        <text v-if="side.bands.length === 0" :x="side.headX" :y="height / 2" :text-anchor="side.headAnchor" class="fill-neutral-400 text-[11px]">{{ side.empty }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { bandHeights, type NeighbourGroup } from "~/utils/neighbours"
import { formatNumber } from "~/utils/format"

const props = defineProps<{
  dependents: NeighbourGroup[]
  dependencies: NeighbourGroup[]
  centreLabel: string
  /** Totals before the tail was folded, so the printed counts stay true. */
  totalIn: number
  totalOut: number
  selected: string | null
  /** True when the roll-up carries its own colours, so uncoloured means none. */
  colored?: boolean
}>()

const emit = defineEmits<{ (e: "select", key: string): void }>()

const NODE_W = 96
const LABEL_PAD = 12
const PAD_Y = 30
/** A band never gets thinner than its own label. */
const MIN_BAND = 22
/** The node is a smaller echo of the stacks that meet it. */
const NODE_RATIO = 0.55

const host = ref<HTMLElement | null>(null)
const width = ref(900)
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  width.value = Math.max(520, host.value.getBoundingClientRect().width)
  if (typeof ResizeObserver === "undefined") return
  observer = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width
    if (w && Math.abs(w - width.value) > 1) width.value = Math.max(520, w)
  })
  observer.observe(host.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const hovered = ref<string | null>(null)

const rows = computed(() => Math.max(props.dependents.length, props.dependencies.length, 1))
const height = computed(() => Math.min(340, Math.max(210, rows.value * 28 + PAD_Y * 2)))
const available = computed(() => height.value - PAD_Y * 2)

const labelWidth = computed(() => Math.max(130, Math.min(250, width.value * 0.23)))
const labelChars = computed(() => Math.max(12, Math.floor(labelWidth.value / 6.4)))
const centreX = computed(() => width.value / 2)

/**
 * One scale for both sides, with a floor: a side's stack is as tall as its
 * share of the larger total, unless its own bands need more room to stay
 * legible. The floor only ever grows the smaller side, never the story.
 */
function stackHeight(total: number, bands: number): number {
  if (bands === 0) return 0
  const biggest = Math.max(props.totalIn, props.totalOut, 1)
  const honest = (total / biggest) * available.value
  return Math.min(available.value, Math.max(honest, bands * MIN_BAND))
}

interface Band extends NeighbourGroup {
  path: string
  labelY: number
}

function ribbon(x0: number, y0a: number, y0b: number, x1: number, y1a: number, y1b: number): string {
  const mx = (x0 + x1) / 2
  return `M${x0},${y0a} C${mx},${y0a} ${mx},${y1a} ${x1},${y1a} L${x1},${y1b} C${mx},${y1b} ${mx},${y0b} ${x0},${y0b} Z`
}

function layout(groups: NeighbourGroup[], total: number, isLeft: boolean) {
  const stack = stackHeight(total, groups.length)
  const edge = Math.max(6, stack * NODE_RATIO)
  if (groups.length === 0) return { bands: [] as Band[], edge: 0 }

  const counts = groups.map(g => g.components)
  const outer = bandHeights(counts, stack, Math.min(MIN_BAND, stack / groups.length))
  const inner = bandHeights(counts, edge, 1)

  const outerX = isLeft ? LABEL_PAD + labelWidth.value + 10 : width.value - LABEL_PAD - labelWidth.value - 10
  const innerX = isLeft ? centreX.value - NODE_W / 2 : centreX.value + NODE_W / 2

  let outerY = (height.value - stack) / 2
  let innerY = (height.value - edge) / 2
  const bands = groups.map((group, i) => {
    const o0 = outerY, o1 = outerY + outer[i]
    const i0 = innerY, i1 = innerY + inner[i]
    outerY = o1
    innerY = i1
    return {
      ...group,
      path: isLeft ? ribbon(outerX, o0, o1, innerX, i0, i1) : ribbon(innerX, i0, i1, outerX, o0, o1),
      labelY: (o0 + o1) / 2 + 3,
    }
  })
  return { bands, edge }
}

const inSide = computed(() => layout(props.dependents, props.totalIn, true))
const outSide = computed(() => layout(props.dependencies, props.totalOut, false))

const sides = computed(() => [
  {
    key: "in" as const,
    bands: inSide.value.bands,
    total: props.totalIn,
    noun: "dependents",
    heading: "Depends on this ",
    empty: "Nothing imports it",
    labelX: LABEL_PAD + labelWidth.value,
    labelAnchor: "end" as const,
    headX: LABEL_PAD,
    headAnchor: "start" as const,
  },
  {
    key: "out" as const,
    bands: outSide.value.bands,
    total: props.totalOut,
    noun: "dependencies",
    heading: "This depends on ",
    empty: "It imports nothing",
    labelX: width.value - LABEL_PAD - labelWidth.value,
    labelAnchor: "start" as const,
    headX: width.value - LABEL_PAD,
    headAnchor: "end" as const,
  },
])

const nodePath = computed(() => {
  const x0 = centreX.value - NODE_W / 2, x1 = centreX.value + NODE_W / 2
  const mid = height.value / 2
  const a = Math.max(8, inSide.value.edge), b = Math.max(8, outSide.value.edge)
  return `M${x0},${mid - a / 2} L${x1},${mid - b / 2} L${x1},${mid + b / 2} L${x0},${mid + a / 2} Z`
})

const nodeLabelY = computed(() => height.value / 2 + Math.max(inSide.value.edge, outSide.value.edge, 8) / 2 + 15)

function opacityOf(key: string): number {
  if (props.selected === key || hovered.value === key) return 0.85
  if (props.selected && props.selected !== key) return 0.16
  return 0.45
}

function truncate(text: string, chars: number): string {
  return text.length <= chars ? text : `…${text.slice(-(chars - 1))}`
}

const caption = computed(() =>
  `${formatNumber(props.totalIn)} components depend on ${props.centreLabel}; it depends on ${formatNumber(props.totalOut)}.`)
</script>
