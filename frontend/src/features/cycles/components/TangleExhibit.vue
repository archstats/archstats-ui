<template>
  <!-- A tangle and its cut plan, as the Cycles view draws it: the steps numbered on the edges,
       each step applied in the picture by clicking it; a matrix when it is large. -->
  <div class="tx">
    <div class="tx-figure">
      <TangleGraph
          v-if="mode === 'graph'"
          :layout="layout"
          :cut="cut"
          :freed="freed"
          :selected-edge="selectedEdge"
          :selected-node="selectedNode"
          :matches="matches"
          :lit="lit"
          :label="shortName"
          :color="() => null"
          :lines="(id: string) => lines[id] ?? 0"
          :step="stepOf"
          :title="title"
          :focus="guide"
          :callout="guide ? t('cycles.tangleExhibit.cut', { value: applied + 1 }) : null"
          @select-edge="(f: string, t: string) => { selectedEdge = { from: f, to: t }; $emit('select-edge', f, t) }"
          @select-node="(id: string) => { selectedNode = id; $emit('select-node', id) }"
          @clear="selectedEdge = null; selectedNode = null"
      />
      <TangleMatrix
          v-else
          :layout="layout"
          :cut="cut"
          :freed="freed"
          :selected-edge="selectedEdge"
          :selected-node="selectedNode"
          :matches="matches"
          :label="shortName"
          :title="title"
          @select-edge="(f: string, t: string) => { selectedEdge = { from: f, to: t }; $emit('select-edge', f, t) }"
          @select-node="(id: string) => { selectedNode = id; $emit('select-node', id) }"
      />
    </div>
    <ol v-if="steps.length" class="tx-steps">
      <li v-for="(s, i) in steps.slice(0, 8)" :key="i" :class="{ 'tx-on': applied > i }">
        <button type="button" class="tx-n" :title="applied > i ? t('cycles.tangleExhibit.undoCutPicture') : t('cycles.tangleExhibit.applyCutsUpHere')" @click="applied = applied > i ? i : i + 1">{{ i + 1 }}</button>
        <span class="min-w-0 flex-1 truncate font-mono" :title="`${s.from} → ${s.to}`">{{ shortName(s.from) }} → {{ shortName(s.to) }}</span>
        <span class="shrink-0 text-neutral-500" :title="t('cycles.tangleExhibit.cutFreesCutsBefore', { value: s.frees ?? 0, freed: s.freed })">{{ t('cycles.tangleExhibit.freesOut', { refs: t('common.count.ref', { count: s.imports }), value: s.frees ?? s.freed, freed: s.freed }) }}</span>
      </li>
      <li v-if="steps.length > 8" class="pl-[26px] text-neutral-500">{{ t('cycles.tangleExhibit.moreCyclesView', { value: steps.length - 8, cuts: t('common.noun.cut', { count: steps.length - 8 }) }) }}</li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { afterCuts, edgeId, layoutTangle, type WEdge } from "~/features/cycles/untangle"
import { shortName } from "~/features/snapshot/names"
import type { TangleStep } from "../exhibits/tangle"
import TangleGraph from "./TangleGraph.vue"
import TangleMatrix from "./TangleMatrix.vue"
import { t } from "~/shared/i18n"

const props = withDefaults(defineProps<{
  members: string[]
  edges: WEdge[]
  steps: TangleStep[]
  lines: Record<string, number>
  anchor?: string | null
  /** Element ids to light: `component:x` or `edge:a>b`. */
  highlight?: string[]
  title: string
  density?: "inline" | "full"
}>(), { anchor: null, highlight: () => [], density: "inline" })
defineEmits<{ (e: "select-edge", from: string, to: string): void; (e: "select-node", id: string): void }>()

const layout = computed(() => layoutTangle(props.members, props.edges))
// Drawn while it stays legible; past that the matrix reads the whole of it, as the Cycles view does.
const mode = computed<"graph" | "matrix">(() => (props.members.length > 40 || Math.max(0, ...layout.value.layers.map(l => l.length)) > 10 ? "matrix" : "graph"))

/** Cuts applied in the picture, by clicking a step: the tangle visibly comes apart. */
const applied = ref(0)
const cut = computed(() => new Set(props.steps.slice(0, applied.value).map(s => edgeId(s.from, s.to))))
const freed = computed(() => afterCuts(props.members, props.edges, cut.value).freed)
const selectedEdge = ref<{ from: string; to: string } | null>(null)
const selectedNode = ref<string | null>(null)
const matches = computed(() => new Set(props.anchor ? [props.anchor] : []))
const lit = new Set<string>()
const stepOf = (from: string, to: string) => { const i = props.steps.findIndex(s => s.from === from && s.to === to); return i < 0 ? null : i + 1 }
const guide = computed(() => {
  const s = props.steps[applied.value]
  return s && mode.value === "graph" && applied.value > 0 ? { from: s.from, to: s.to, loop: [] as string[] } : null
})

// What the prose beside it cites lights up: an edge (a cut), else a component.
watch(() => props.highlight.join("|"), () => {
  const edge = props.highlight.find(h => h.startsWith("edge:"))
  const node = props.highlight.find(h => h.startsWith("component:"))
  if (edge) { const [from, to] = edge.slice(5).split(">"); selectedEdge.value = { from, to }; selectedNode.value = null }
  else selectedEdge.value = null
  selectedNode.value = node ? node.slice(10) : edge ? null : props.anchor
}, { immediate: true })
</script>

<style scoped>
.tx { display: flex; height: 100%; min-height: 0; flex-direction: column; }
.tx-figure { position: relative; flex: 1; min-height: 0; border-radius: 6px; overflow: hidden; }
.tx-steps { margin-top: 6px; display: grid; gap: 3px; font-size: 11.5px; }
.tx-steps li { display: flex; align-items: center; gap: 8px; }
.tx-n { flex-shrink: 0; width: 18px; height: 18px; border-radius: 3px; font-size: 11px; font-weight: 600; color: rgb(var(--c-accent-700)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); line-height: 16px; text-align: center; }
.tx-n:hover { border-color: rgb(var(--c-accent-500)); }
.tx-on .tx-n { color: rgb(var(--c-on-accent)); background: rgb(var(--c-accent-500)); border-color: rgb(var(--c-accent-500)); }
.tx-on .font-mono { text-decoration: line-through; text-decoration-color: rgb(var(--c-accent-500)); }
</style>
