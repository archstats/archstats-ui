<template>
  <!-- The shape of the codebase in one read: what each lane holds, and which
       lanes lean on which. Small-N by construction -- a profile declares a
       handful of lanes -- so this can be precise instead of a hairball.

       Rows are HTML so the labels get real typography and real truncation;
       the arcs are one SVG pinned beside them. Each row is a grid whose
       middle column is the only flexible one, because laying them out with
       fixed widths let a long label push the count under the arcs. -->
  <div class="flex items-start">
    <ul class="min-w-0 flex-1">
      <li v-for="lane in rows" :key="lane.id">
        <button type="button"
                class="grid w-full items-center gap-2.5 rounded-sm pr-2 text-left transition-colors duration-150"
                :class="active(lane.id) ? 'bg-neutral-100' : 'hover:bg-neutral-50'"
                :style="{ height: PITCH + 'px', gridTemplateColumns: 'minmax(3.5rem, 9rem) minmax(24px, 1fr) 2.75rem' }"
                :title="lane.count + ' modules in ' + lane.label"
                @mouseenter="hoveredLane = lane.id" @mouseleave="hoveredLane = null"
                @click="$emit('lane', lane.id)">
          <span class="flex min-w-0 items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full transition-transform duration-150"
                  :class="[laneDotClass(lane.color), active(lane.id) ? 'scale-125' : '']"/>
            <span class="truncate text-base"
                  :class="active(lane.id) ? 'text-neutral-900' : 'text-neutral-800'">{{ lane.label }}</span>
          </span>

          <!-- A track that flexes with a fill inside it, so a long label or a
               narrow column shortens the bar instead of overflowing the row. -->
          <span class="block h-[7px] w-full overflow-hidden rounded-full bg-neutral-100">
            <span class="block h-full rounded-full transition-[width,opacity] duration-500 ease-out"
                  :class="laneDotClass(lane.color)"
                  :style="{ width: share(lane.count) + '%', opacity: active(lane.id) ? 0.95 : 0.6 }"/>
          </span>

          <span class="text-right font-mono text-[11px] tabular-nums"
                :class="active(lane.id) ? 'text-neutral-700' : 'text-neutral-500'">{{ lane.count }}</span>
        </button>
      </li>
    </ul>

    <svg v-if="links.length" :width="GUTTER" :height="rows.length * PITCH"
         :viewBox="'0 0 ' + GUTTER + ' ' + (rows.length * PITCH)"
         class="shrink-0" role="img"
         :aria-label="links.length + ' dependencies between lanes'">
      <g v-for="link in links" :key="link.key"
         :opacity="dimmed(link) ? 0.12 : 1"
         class="transition-opacity duration-200">
        <path :d="arc(link)" fill="none" stroke="rgb(var(--c-neutral-400))"
              :stroke-width="link.weight" :stroke-opacity="0.5 * (1 - link.against)"
              stroke-linecap="round"/>
        <!-- The traffic running against the dominant direction, laid over the
             arc at its own share. No threshold decides when a pair becomes a
             tangle: the reader sees how much of one it is. The grey underneath
             fades as the red rises so the two never mix into mud. -->
        <path v-if="link.against > 0" :d="arc(link)" fill="none"
              stroke="rgb(var(--c-red-500))"
              :stroke-width="link.weight" :stroke-opacity="link.against"
              stroke-linecap="round"/>
        <!-- Which way the traffic mostly runs. Without it the arc says two
             lanes are related but not which one is the dependency. -->
        <path :d="head(link)"
              :fill="link.against > 0.5 ? 'rgb(var(--c-red-500))' : 'rgb(var(--c-neutral-400))'"
              fill-opacity="0.9"/>
        <!-- A fat transparent copy so the arc is grabbable at any weight. -->
        <path :d="arc(link)" fill="none" stroke="transparent" stroke-width="16"
              class="cursor-pointer"
              @mouseenter="hoveredLink = link.key" @mouseleave="hoveredLink = null"
              @click="$emit('flow', link.a, link.b)">
          <title>{{ describe(link) }}</title>
        </path>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import type { LaneFlow } from "~/utils/graph"

const PITCH = 36
const GUTTER = 124
const MAX_LINKS = 8
// An even split is the most tangled a pair can be, so half the traffic
// running backwards is full red rather than an arbitrary ceiling.
const FULLY_TANGLED = 0.5

const props = defineProps<{
  lanes: Array<{ id: string; label: string; color: LaneColor; count: number }>
  flows: LaneFlow[]
}>()
defineEmits<{ (e: "lane", id: string): void; (e: "flow", a: string, b: string): void }>()

const hoveredLink = ref<string | null>(null)
const hoveredLane = ref<string | null>(null)

const rows = computed(() => props.lanes)
const indexOf = computed(() => new Map(rows.value.map((l, i) => [l.id, i])))
const biggest = computed(() => Math.max(1, ...rows.value.map((l) => l.count)))

function share(count: number) {
  // Square-rooted: a lane with ten times the modules is not ten times the
  // architecture, and a linear bar leaves every small lane invisible.
  return Math.max(4, Math.round(100 * Math.sqrt(count / biggest.value)))
}

/** A lane and the arcs touching it light up together, in either direction. */
function active(id: string): boolean {
  if (hoveredLane.value === id) return true
  const link = links.value.find((l) => l.key === hoveredLink.value)
  return !!link && (link.a === id || link.b === id)
}

function dimmed(link: { key: string; a: string; b: string }): boolean {
  if (hoveredLink.value) return hoveredLink.value !== link.key
  if (hoveredLane.value) return link.a !== hoveredLane.value && link.b !== hoveredLane.value
  return false
}

/**
 * One arc per pair of lanes, not per direction.
 *
 * A reciprocal dependency drawn as two arcs reads as two findings; it is one.
 *
 * What the colour says is *how lopsided* it is, not whether it is reciprocal
 * at all: in LibreChat every one of the eight lane pairs has traffic both
 * ways, so "runs both ways" would paint the whole diagram red and mean
 * nothing.
 *
 * It is a proportion rather than a threshold. A cutoff here would call 6 of
 * 35 references a tangle and 7 of 47 a layer, which is a coin toss dressed as
 * a verdict; the share against the grain is the actual quantity, so that is
 * what is drawn.
 */
const links = computed(() => {
  const pairs = new Map<string, { key: string; a: string; b: string; ab: number; ba: number }>()
  for (const f of props.flows) {
    if (!indexOf.value.has(f.from) || !indexOf.value.has(f.to)) continue
    const [a, b] = [f.from, f.to].sort()
    const key = a + "\n" + b
    const found = pairs.get(key) ?? { key, a, b, ab: 0, ba: 0 }
    if (f.from === a) found.ab = f.count
    else found.ba = f.count
    pairs.set(key, found)
  }
  const heaviest = Math.max(1, ...[...pairs.values()].map((p) => p.ab + p.ba))
  return [...pairs.values()]
    .sort((x, y) => (y.ab + y.ba) - (x.ab + x.ba))
    .slice(0, MAX_LINKS)
    .map((p) => {
      const total = p.ab + p.ba
      const minority = Math.min(p.ab, p.ba)
      return {
        ...p,
        /** The dominant direction, so the arrowhead knows where to sit. */
        towards: p.ab >= p.ba ? p.b : p.a,
        /** The share of traffic running against the arrow, 0 to 1. */
        against: total > 0 ? Math.min(1, (minority / total) / FULLY_TANGLED) : 0,
        weight: Math.max(1.5, Math.min(7, 7 * Math.sqrt(total / heaviest))),
      }
    })
})

/** Distant lanes bow further out, so no two arcs trace the same path. */
function arc(link: { a: string; b: string }) {
  const ia = indexOf.value.get(link.a) ?? 0
  const ib = indexOf.value.get(link.b) ?? 0
  const y1 = ia * PITCH + PITCH / 2
  const y2 = ib * PITCH + PITCH / 2
  const span = Math.abs(ib - ia)
  const bulge = Math.min(GUTTER - 10, 22 + span * 28)
  return 'M 2 ' + y1 + ' C ' + bulge + ' ' + y1 + ', ' + bulge + ' ' + y2 + ', 2 ' + y2
}

/** A small triangle at the end the dependency mostly points to. */
function head(link: { towards: string }) {
  const i = indexOf.value.get(link.towards) ?? 0
  const y = i * PITCH + PITCH / 2
  return 'M 1 ' + y + ' l 7 -4 l 0 8 z'
}

function describe(link: { a: string; b: string; ab: number; ba: number }) {
  const labelOf = (id: string) => rows.value.find((l) => l.id === id)?.label ?? id
  const [heavy, light] = link.ab >= link.ba
    ? [{ from: link.a, to: link.b, n: link.ab }, { n: link.ba }]
    : [{ from: link.b, to: link.a, n: link.ba }, { n: link.ab }]
  if (light.n === 0) {
    return labelOf(heavy.from) + ' imports ' + labelOf(heavy.to) + ': ' + heavy.n + ' references, none back.'
  }
  const share = Math.round((light.n / (heavy.n + light.n)) * 100)
  return labelOf(heavy.from) + ' imports ' + labelOf(heavy.to) + ': ' +
    heavy.n + ' references, ' + light.n + ' back — ' + share + '% against the grain.'
}
</script>
