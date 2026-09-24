<template>
  <!-- The grid is the screen, not a figure inside a document.
       It sat at 570px in a 2000px window under 290px of stacked prose, with
       the rest of the page empty: an illustration in an essay. The reading
       is one line with the rest behind a disclosure, the grid takes every
       pixel that leaves, and the controls sit under it where a chart's
       controls belong. -->
  <div class="flex h-full min-w-0 flex-col">
    <header class="shrink-0 px-5 pb-2 pt-3">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p class="text-base leading-5 text-neutral-800">{{ lines[0] }}</p>
        <button v-if="lines.length > 1" type="button"
                class="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
                :aria-expanded="detailed"
                @click="detailed = !detailed">
          <span>{{ detailed ? 'Less' : 'More' }}</span>
          <Icon :icon="detailed ? 'chevron-up' : 'chevron-down'" :size="11"/>
        </button>
      </div>
      <div v-if="detailed" class="mt-1 flex flex-col gap-0.5">
        <p v-for="line in lines.slice(1)" :key="line"
           class="max-w-[74ch] text-sm leading-5 text-neutral-500">{{ line }}</p>
      </div>
    </header>

    <div v-if="matrix.rowNodes.length > 1" class="min-h-0 flex-1 px-5 pb-1">
      <div class="h-full overflow-hidden rounded hairline">
        <ConnectionsMatrix
          :nodes="matrix.nodes" :row-nodes="matrix.rowNodes" :col-nodes="matrix.colNodes"
          :edges="matrix.edges" :directed="true"
          :selected-id="selectedPath" :selected-pair="selectedPair"
          :multi="trayed" :hovered="hovered"
          :cycle-keys="matrix.cycleKeys" :cycle-nodes="matrix.cycleNodes" :badges="matrix.badges"
          @select="(id, mods) => id && $emit('pick', id, mods)"
          @select-pair="(from, to) => $emit('inspectPair', from, to)"
          @hover="(id) => (hovered = id)"
          @activate="(id) => $emit('activate', id)"/>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
      <p class="max-w-[40ch] text-sm leading-5 text-neutral-500">
        Only one module imports anything here, so there is no grid to draw.
        The references are still listed below.
      </p>
    </div>

    <footer class="shrink-0 hairline-t px-5 py-2">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p class="flex items-center gap-1.5 text-sm leading-4 text-neutral-500">
          <span class="shrink-0 text-neutral-400"><Icon icon="info" :size="12"/></span>
          <span>A cell is one module importing another, darker for more references. Click it for
            the code behind it, a name to inspect the module, ⌘-click to collect.</span>
        </p>

        <label v-if="matrix.omitted > 0 || size > 20" class="ml-auto flex shrink-0 items-center gap-2">
          <span class="ui-label">Show</span>
          <span class="ui-segmented" role="group" aria-label="Grid size">
            <button v-for="n in SIZES" :key="n" type="button"
                    :aria-pressed="size === n" @click="$emit('resize', n)">{{ n }}</button>
          </span>
          <span class="text-sm text-neutral-500">
            of {{ (matrix.nodes.length + matrix.omitted).toLocaleString() }}
          </span>
        </label>

        <button type="button"
                class="group flex shrink-0 items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
                :class="matrix.omitted > 0 || size > 20 ? '' : 'ml-auto'"
                @click="$emit('showAll')">
          <span>List all {{ reading.total.toLocaleString() }} references</span>
          <Icon icon="arrow-right" :size="12" class="transition-transform duration-200 group-hover:translate-x-0.5"/>
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import ConnectionsMatrix from "~/components/connections/ConnectionsMatrix.vue"
import { describeReading, type ReferenceReading } from "~/utils/regionReading"
import { buildRegionMatrix } from "~/utils/regionMatrix"
import type { Reference } from "~/utils/findings"
import type { ModuleGraph } from "~/utils/moduleGraph"
import type { LaneColor } from "~/utils/javaFrameworks"

const SIZES = [20, 40, 80] as const

const props = defineProps<{
  references: Reference[]
  reading: ReferenceReading
  graph: ModuleGraph
  selectedPath: string | null
  selectedPair: [string, string] | null
  /** Modules already collected into the group tray. */
  trayPaths: string[]
  /** How many modules the grid draws on each axis. */
  size: number
  laneColor: (lane: string) => LaneColor
  laneLabel: (lane: string) => string
}>()
defineEmits<{
  (e: "pick", path: string, mods: { shift: boolean; meta: boolean }): void
  (e: "inspectPair", from: string, to: string): void
  (e: "activate", path: string): void
  (e: "resize", size: number): void
  (e: "showAll"): void
}>()

const hovered = ref<string | null>(null)
const detailed = ref(false)

const trayed = computed(() => new Set(props.trayPaths))

function nameOf(path: string) { return props.graph.byPath.get(path)?.name ?? path }

const lines = computed(() => describeReading(props.reading, nameOf))
const matrix = computed(() => buildRegionMatrix({
  references: props.references,
  graph: props.graph,
  laneLabel: props.laneLabel,
  laneColor: props.laneColor,
  cap: props.size * 2,
}))
</script>
