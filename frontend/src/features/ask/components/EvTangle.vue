<template>
  <div>
    <!-- The Cycles view's own drawing: levels, the imports against them, the plan's steps numbered on the edges. -->
    <div class="ev-tangle" :style="{ height: `${height}px` }">
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
          :lines="linesOf"
          :step="stepOf"
          :title="e.title"
          :focus="guide"
          :callout="guide ? `cut ${1}` : null"
          @select-edge="(f: string, t: string) => (selectedEdge = { from: f, to: t })"
          @select-node="(n: string) => (selectedNode = n)"
          @open="(n: string) => $emit('ask', `Tell me about ${n}`)"
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
          :title="e.title"
          @select-edge="(f: string, t: string) => (selectedEdge = { from: f, to: t })"
          @select-node="(n: string) => (selectedNode = n)"
      />
    </div>
    <ol class="mt-2 space-y-1 text-[12px]">
      <li v-for="(s, i) in e.steps.slice(0, expanded ? 12 : 4)" :key="i" class="ev-step" :class="{ 'ev-step-on': applied > i }">
        <button v-if="mode === 'graph'" type="button" class="ev-step-n" :title="applied > i ? 'Undo this cut in the picture' : 'Apply the cuts up to here in the picture'" @click="applied = applied > i ? i : i + 1">{{ i + 1 }}</button>
        <span v-else class="ev-step-n ev-step-static" title="Large tangles are drawn as a matrix; open them in Cycles to apply cuts step by step">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-[11.5px] text-neutral-900" :title="`${s.from} → ${s.to}`">{{ shortName(s.from) }} → {{ shortName(s.to) }}</p>
          <p class="text-[11px] text-neutral-500">
            {{ s.imports }} import reference{{ s.imports === 1 ? "" : "s" }} ·
            frees {{ s.freed }}, {{ s.tangled }} still tangled
            <template v-if="s.carriers.length"> · in
              <button v-for="(f, fi) in s.carriers.slice(0, 2)" :key="f" type="button" class="ev-link" :title="f" @click="$emit('ask', `Outline ${f}`)">{{ f.split('/').pop() }}{{ fi < Math.min(2, s.carriers.length) - 1 ? ',' : '' }}</button>
            </template>
          </p>
        </div>
      </li>
    </ol>
    <button v-if="e.steps.length > 4" type="button" class="ev-more" @click="expanded = !expanded">{{ expanded ? "Fewer cuts" : `All ${e.steps.length} cuts` }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import TangleGraph from "~/features/cycles/components/TangleGraph.vue"
import TangleMatrix from "~/features/cycles/components/TangleMatrix.vue"
import { afterCuts, edgeId, layoutTangle, type WEdge } from "~/features/cycles/untangle"
import { useDataStore } from "~/features/snapshot/data.store"
import type { Evidence } from "../engine/types"
import { shortName } from "../tools/shared"

const props = defineProps<{ e: Extract<Evidence, { kind: "tangle" }> }>()
defineEmits<{ (ev: "ask", q: string): void }>()

const data = useDataStore()
const edges = computed<WEdge[]>(() => props.e.edges.map(x => ({ from: x.from, to: x.to, imports: x.imports, files: x.files })))
const layout = computed(() => layoutTangle(props.e.members, edges.value))
// Drawn while it stays legible; past that the matrix reads the whole of it, as the Cycles view does.
const mode = computed<"graph" | "matrix">(() => (props.e.members.length > 40 || Math.max(0, ...layout.value.layers.map(l => l.length)) > 10 ? "matrix" : "graph"))
const height = computed(() => (mode.value === "graph" ? Math.min(460, 100 + layout.value.layers.length * 84) : 380))

/** Cuts applied in the picture, by clicking a step: the tangle visibly comes apart. */
const applied = ref(0)
const cut = computed(() => new Set(props.e.steps.slice(0, applied.value).map(s => edgeId(s.from, s.to))))
const freed = computed(() => afterCuts(props.e.members, edges.value, cut.value).freed)
const selectedEdge = ref<{ from: string; to: string } | null>(null)
const selectedNode = ref<string | null>(props.e.anchor ?? null)
const matches = computed(() => new Set(props.e.anchor ? [props.e.anchor] : []))
const lit = new Set<string>()
const expanded = ref(false)
const lines = computed(() => new Map((data.allRawComponents as any[]).map(c => [String(c.name), Number(c.complexity__lines) || 0])))
const linesOf = (n: string) => lines.value.get(n) ?? 0
const stepOf = (from: string, to: string) => { const i = props.e.steps.findIndex(s => s.from === from && s.to === to); return i < 0 ? null : i + 1 }
const guide = computed(() => {
  const s = props.e.steps[applied.value]
  return s && mode.value === "graph" ? { from: s.from, to: s.to, loop: [] as string[] } : null
})
</script>

<style scoped>
.ev-tangle { border-radius: 6px; overflow: hidden; background: rgb(var(--c-surface)); }
.ev-step { display: flex; gap: 8px; align-items: flex-start; padding: 3px 0; }
.ev-step-n { flex-shrink: 0; width: 18px; height: 18px; border-radius: 999px; font-size: 10.5px; font-weight: 600; color: rgb(var(--c-accent-700)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); line-height: 16px; text-align: center; }
.ev-step-n:hover { border-color: rgb(var(--c-accent-500)); }
.ev-step-static, .ev-step-static:hover { border-color: rgb(var(--c-accent-200)); cursor: default; }
.ev-step-on .ev-step-n { color: rgb(var(--c-on-accent)); background: rgb(var(--c-accent-500)); border-color: rgb(var(--c-accent-500)); }
.ev-step-on p:first-child { text-decoration: line-through; text-decoration-color: rgb(var(--c-accent-500)); }
.ev-link { color: rgb(var(--c-neutral-700)); text-decoration: underline dotted; text-underline-offset: 2px; margin-left: 3px; }
.ev-link:hover { color: rgb(var(--c-accent-700)); }
.ev-more { margin-top: 4px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.ev-more:hover { color: rgb(var(--c-neutral-900)); }
</style>
