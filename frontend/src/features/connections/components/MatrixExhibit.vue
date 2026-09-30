<template>
  <!-- The Connections view's matrix over a few components: a row imports its columns. -->
  <div class="mx">
    <ConnectionsMatrix
        :nodes="cnodes"
        :edges="cedges"
        :directed="true"
        :selected-id="selected"
        :selected-pair="pair"
        :multi="multi"
        :hovered="hovered"
        @select="(id: string | null) => { selected = id; if (id) $emit('pick', `component:${id}`) }"
        @select-pair="(f: string, t: string) => { pair = [f, t]; $emit('pick', `edge:${f}>${t}`) }"
        @hover="(id: string | null) => (hovered = id)"
    />
    <p class="mx-note">Rows import columns; a darker cell carries more import references.<template v-if="more"> Showing {{ nodes.length }} of {{ nodes.length + more }}, the most connected first.</template></p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import type { CEdge, CNode } from "~/features/connections/connections"
import { shortName } from "~/features/snapshot/names"
import ConnectionsMatrix from "./ConnectionsMatrix.vue"

const props = withDefaults(defineProps<{
  nodes: string[]
  edges: Array<{ from: string; to: string; references: number }>
  lines: Record<string, number>
  anchors?: string[]
  highlight?: string[]
  more?: number
}>(), { anchors: () => [], highlight: () => [], more: 0 })
defineEmits<{ (e: "pick", element: string): void }>()

const maxW = computed(() => Math.max(1, ...props.edges.map(x => x.references)))
const cnodes = computed<CNode[]>(() => props.nodes.map(n => ({ id: n, label: shortName(n), kind: "component", lines: props.lines[n] })) as CNode[])
const cedges = computed<CEdge[]>(() => props.edges.map(x => ({ from: x.from, to: x.to, references: x.references, sharedCommits: 0, weight: x.references / maxW.value })))
const selected = ref<string | null>(null)
const pair = ref<[string, string] | null>(null)
const hovered = ref<string | null>(null)
const multi = new Set<string>()

// What the prose beside it cites: a pair (an import), else a component, else the one it is about.
watch(() => props.highlight.join("|"), () => {
  const edge = props.highlight.find(h => h.startsWith("edge:"))
  const node = props.highlight.find(h => h.startsWith("component:"))
  pair.value = edge ? (edge.slice(5).split(">") as [string, string]) : null
  selected.value = node ? node.slice(10) : props.anchors[0] ?? null
}, { immediate: true })
</script>

<style scoped>
.mx { display: flex; height: 100%; min-height: 0; flex-direction: column; }
.mx > :first-child { flex: 1; min-height: 0; }
.mx-note { margin-top: 6px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
</style>
