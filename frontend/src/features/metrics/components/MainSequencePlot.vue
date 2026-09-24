<template>
  <!-- Martin's A/I square: every component as a dot, this one lit, and the
       perpendicular to the main sequence drawn as the distance it measures.
       The engine has shipped that distance since the first scan; this is the
       first view that renders it. -->
  <figure class="m-0">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" :aria-label="caption">
      <!-- Plot frame -->
      <rect :x="PAD_L" :y="PAD_T" :width="SIZE" :height="SIZE" rx="4" class="fill-transparent stroke-neutral-200" stroke-width="1"/>

      <!-- The main sequence: A + I = 1 -->
      <line :x1="sx(0)" :y1="sy(1)" :x2="sx(1)" :y2="sy(0)" class="stroke-neutral-400" stroke-width="1" stroke-dasharray="4 3"/>

      <!-- The two corners Martin named -->
      <text :x="PAD_L + 6" :y="PAD_T + SIZE - 6" class="fill-neutral-400 text-[9px]">Zone of pain</text>
      <text :x="PAD_L + SIZE - 6" :y="PAD_T + 12" text-anchor="end" class="fill-neutral-400 text-[9px]">Zone of uselessness</text>

      <!-- Every other component -->
      <g>
        <circle v-for="p in peers" :key="p.name" :cx="p.x" :cy="p.y" r="2" class="fill-neutral-400" opacity="0.5">
          <title>{{ p.name }} — A {{ p.a.toFixed(2) }}, I {{ p.i.toFixed(2) }}</title>
        </circle>
      </g>

      <!-- This one: the distance first, so the dot sits on top of it -->
      <template v-if="me">
        <line :x1="me.x" :y1="me.y" :x2="foot.x" :y2="foot.y" class="stroke-accent-500" stroke-width="1.5" opacity="0.55"/>
        <circle :cx="me.x" :cy="me.y" r="6" class="fill-surface"/>
        <circle :cx="me.x" :cy="me.y" r="4" class="fill-accent-500"/>
      </template>

      <!-- Axes, named where they are read -->
      <text :x="PAD_L" :y="H - 6" class="fill-neutral-500 text-[10px]">Instability 0</text>
      <text :x="PAD_L + SIZE" :y="H - 6" text-anchor="end" class="fill-neutral-500 text-[10px]">1</text>
      <text :x="12" :y="PAD_T + 4" class="fill-neutral-500 text-[10px]">1</text>
      <text :x="12" :y="PAD_T + SIZE" class="fill-neutral-500 text-[10px]" :transform="`rotate(-90 12 ${PAD_T + SIZE})`">Abstractness 0</text>
    </svg>
    <figcaption class="sr-only">{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  /** Every component with both coordinates; the current one included. */
  points: Array<{ name: string; abstractness: number; instability: number }>
  current: string
}>()

const W = 300
const H = 300
const PAD_L = 26
const PAD_T = 12
const SIZE = 258

const sx = (i: number) => PAD_L + i * SIZE
const sy = (a: number) => PAD_T + (1 - a) * SIZE

const placed = computed(() =>
  props.points
    .filter(p => Number.isFinite(p.abstractness) && Number.isFinite(p.instability))
    .map(p => ({
      name: p.name,
      a: Math.min(1, Math.max(0, p.abstractness)),
      i: Math.min(1, Math.max(0, p.instability)),
      x: sx(Math.min(1, Math.max(0, p.instability))),
      y: sy(Math.min(1, Math.max(0, p.abstractness))),
    })),
)

const me = computed(() => placed.value.find(p => p.name === props.current) ?? null)
const peers = computed(() => placed.value.filter(p => p.name !== props.current))

// The nearest point on A + I = 1, in data space, then projected. The line is
// drawn at 45° in a square plot, so the perpendicular reads true.
const foot = computed(() => {
  const p = me.value
  if (!p) return { x: 0, y: 0 }
  const t = (p.i - p.a + 1) / 2
  return { x: sx(t), y: sy(1 - t) }
})

const caption = computed(() => {
  const p = me.value
  if (!p) return "Main sequence plot"
  return `${props.current}: abstractness ${p.a.toFixed(2)}, instability ${p.i.toFixed(2)}, among ${placed.value.length} components.`
})
</script>
