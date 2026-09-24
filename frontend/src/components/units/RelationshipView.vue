<template>
  <!-- A boundary is a flow, so the flow is the page.
       This screen went through three ranked lists with small bars before the
       obvious thing: every quantity asked about here -- how much crosses, who
       sends most, what it lands on, how much comes back -- is a length, and a
       list makes each one a number to compare by reading.
       The warnings are marks on the diagram rather than a list beside it. -->
  <div class="flex h-full min-w-0 flex-col">
    <!-- What is wrong, as a row of switches into the picture. It folds,
         because on a tall boundary four wrapped headlines and a legend take
         a fifth of the room from the thing they are notes about. -->
    <div class="flex shrink-0 items-start gap-2 px-5 pb-1 pt-3">
      <button type="button"
              class="mt-0.5 shrink-0 rounded p-0.5 text-neutral-500 transition-colors
                     duration-100 hover:bg-neutral-100 hover:text-neutral-900"
              :aria-expanded="notesOpen"
              :title="notesOpen ? 'Hide the notes and give the room to the diagram' : 'Show what is wrong at this boundary'"
              @click="notesOpen = !notesOpen">
        <Icon :icon="notesOpen ? 'chevron-down' : 'chevron-right'" :size="14"/>
      </button>

      <div v-if="notesOpen" class="flex min-w-0 flex-wrap items-center gap-2">
        <button v-for="a in relationship.anomalies" :key="a.id" type="button"
                class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-4 transition-colors duration-100"
                :class="chipClass(a)"
                :disabled="!a.references.length"
                :title="a.detail"
                @click="$emit('openAnomaly', a.id)">
          <Icon :icon="a.tone === 'warn' ? 'alert' : 'check'" :size="12"/>
          <span>{{ a.headline }}</span>
        </button>
      </div>
      <button v-else type="button"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-4
                     transition-colors duration-100"
              :class="warnCount ? 'bg-neutral-100 text-red-600 hover:bg-neutral-200'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'"
              @click="notesOpen = true">
        <Icon :icon="warnCount ? 'alert' : 'check'" :size="12"/>
        <span>{{ summary }}</span>
      </button>

      <p class="ml-auto mt-1 shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
        {{ forwardCount.toLocaleString() }} across<template v-if="backwardCount"> ·
          <span class="text-red-500">{{ backwardCount.toLocaleString() }} back</span></template>
      </p>
    </div>

    <!-- The gutter is reserved whether or not it scrolls, so the drawing's
         own height cannot change the width it is measured against. -->
    <div ref="stage" class="min-h-0 flex-1 overflow-y-auto px-5 pb-3"
         style="scrollbar-gutter: stable">
      <BoundaryFlow
                    :flow="flow" :head-lane="headLane" :tail-lane="tailLane"
                    :head-label="headLabel" :tail-label="tailLabel"
                    :selected-path="selectedPath" :flagged-paths="flaggedPaths"
                    :can-expand="canExpand"
                    :lane-color="laneColor"
                    @select="$emit('select', $event)"
                    @expand="expand"
                    @inspect-pair="(f, t) => $emit('inspectPair', f, t)"/>
    </div>

    <footer class="shrink-0 hairline-t px-5 py-2">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm leading-4 text-neutral-500">
        <!-- The key is where direction lives now. A module is drawn in the
             column of its own lane whichever way its dependencies run, so
             the columns cannot say which way a given reference goes and the
             colour has to say it, in the lanes' own names. -->
        <template v-if="notesOpen">
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-5 shrink-0 rounded-sm bg-neutral-400" style="opacity:.5"/>
            <span>{{ headLabel }} into {{ tailLabel }}</span>
          </span>
          <span v-if="backwardCount" class="flex items-center gap-1.5">
            <span class="h-2 w-5 shrink-0 rounded-sm bg-red-500" style="opacity:.75"/>
            <span>{{ tailLabel }} back into {{ headLabel }}</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-5 shrink-0 rounded-sm bg-accent-500" style="opacity:.85"/>
            <span>in focus</span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-neutral-400"><Icon icon="info" :size="12"/></span>
            <span>Thickness is references. A bar is red in proportion to what runs
              the other way. Hover to trace, click to open, arrow keys to walk.</span>
          </span>
        </template>

        <label v-if="flow.leftOmitted || flow.rightOmitted || named > SIZES[0]"
               class="ml-auto flex shrink-0 items-center gap-2">
          <span class="ui-label">Name</span>
          <span class="ui-segmented" role="group" aria-label="Modules named">
            <button v-for="n in SIZES" :key="n" type="button"
                    :aria-pressed="named === n" @click="named = n">{{ n }}</button>
          </span>
          <span>a side</span>
        </label>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import BoundaryFlow from "~/components/units/BoundaryFlow.vue"
import { layoutBoundary } from "~/utils/boundaryFlow"
import type { LaneColor } from "~/utils/javaFrameworks"
import type { Anomaly, Relationship } from "~/utils/relationship"

const SIZES = [12, 24, 48] as const

const props = defineProps<{
  relationship: Relationship
  laneOfModule: Map<string, string>
  headLane: string
  tailLane: string
  headLabel: string
  tailLabel: string
  selectedPath: string | null
  selectedAnomaly: string | null
  nameOf: (path: string) => string
  laneColor: (lane: string) => LaneColor
}>()
defineEmits<{
  (e: "select", path: string): void
  (e: "inspectPair", from: string, to: string): void
  (e: "openAnomaly", id: string): void
}>()

const forwardCount = computed(() => props.relationship.forward.length)
const backwardCount = computed(() => props.relationship.backward.length)

const named = ref<number>(SIZES[0])
const notesOpen = ref(true)

const warnCount = computed(() =>
  props.relationship.anomalies.filter((a) => a.tone === "warn").length)
const summary = computed(() => {
  const n = warnCount.value
  if (!n) return "Nothing wrong at this boundary"
  return n === 1 ? "1 problem here" : `${n} problems here`
})

// The drawing fills the room it is given rather than sitting at its own
// minimum in a tall window, which left half the page empty.
const stage = ref<HTMLElement | null>(null)
const stageHeight = ref(420)
let observer: ResizeObserver | null = null
onMounted(() => {
  const el = stage.value
  if (!el) return
  stageHeight.value = Math.max(240, el.clientHeight - 48)
  observer = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      const h = stage.value?.clientHeight
      if (h) stageHeight.value = Math.max(240, h - 48)
    })
  })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const flow = computed(() => layoutBoundary({
  forward: props.relationship.forward,
  backward: props.relationship.backward,
  laneOf: props.laneOfModule,
  headLane: props.headLane,
  nameOf: props.nameOf,
  top: named.value,
  minHeight: stageHeight.value,
  // Whatever is selected is drawn even when it ranks nowhere near the top,
  // so following a link from the inspector always lands on something.
  pin: props.selectedPath ? [props.selectedPath] : [],
}))

const canExpand = computed(() =>
  (flow.value.leftOmitted > 0 || flow.value.rightOmitted > 0) &&
  named.value < SIZES[SIZES.length - 1])

function expand() {
  named.value = SIZES.find((n) => n > named.value) ?? named.value
}

/** An open warning lights its modules up in the diagram, so the chip and the
 *  picture are the same finding rather than two views of it. */
const flaggedPaths = computed(() => {
  const open = props.relationship.anomalies.find((a) => a.id === props.selectedAnomaly)
  return open?.paths ?? []
})

function chipClass(a: Anomaly): string {
  if (!a.references.length) return "text-neutral-500"
  if (a.id === props.selectedAnomaly) return "bg-red-500 text-white"
  // red-500 on the tint measured 3.55:1 in the light appearance.
  return a.tone === "warn"
    ? "bg-neutral-100 text-red-600 hover:bg-neutral-200"
    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
}
</script>
