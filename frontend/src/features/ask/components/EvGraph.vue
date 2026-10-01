<template>
  <div>
    <!-- The Connections view's matrix over the walked components: a row imports its columns. -->
    <div class="ev-graph" :style="{ height: `${height}px` }">
      <ConnectionsMatrix
          :nodes="nodes"
          :edges="edges"
          :directed="true"
          :selected-id="selected"
          :selected-pair="pair"
          :multi="multi"
          :hovered="hovered"
          @select="(id: string | null) => (selected = id)"
          @select-pair="(f: string, t: string) => (pair = [f, t])"
          @hover="(id: string | null) => (hovered = id)"
          @activate="(id: string) => $emit('ask', t('ask.evGraph.tellMeAbout', { id }))"
      />
    </div>
    <p class="mt-1.5 text-[11px] text-neutral-500">
      {{ t('ask.evGraph.rowsImportColumnsDarker') }}
      <template v-if="e.nodes.length < total">{{ ' ' + t('ask.evGraph.showingLargestFirst', { nodesLength: e.nodes.length, total }) }}</template>
    </p>
    <p v-if="pair" class="mt-1 text-[11.5px]">
      <button type="button" class="ev-link" @click="$emit('ask', t('ask.evGraph.whichFilesMakeImport', { value: pair[0], value2: pair[1] }))">{{ t('ask.evGraph.whichFilesMakeImport', { value: shortName(pair[0]), value2: shortName(pair[1]) }) }}</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import ConnectionsMatrix from "~/features/connections/components/ConnectionsMatrix.vue"
import type { CEdge, CNode } from "~/features/connections/connections"
import { useDataStore } from "~/features/snapshot/data.store"
import type { Evidence } from "../engine/types"
import { shortName } from "../tools/shared"
import { t } from "~/shared/i18n"

const props = defineProps<{ e: Extract<Evidence, { kind: "graph" }>; total?: number }>()
defineEmits<{ (ev: "ask", q: string): void }>()

const data = useDataStore()
const lines = computed(() => new Map((data.allRawComponents as any[]).map(c => [String(c.name), Number(c.complexity__lines) || 0])))
const maxW = computed(() => Math.max(1, ...props.e.edges.map(x => x.weight)))
const nodes = computed<CNode[]>(() => props.e.nodes.map(n => ({ id: n, label: shortName(n), kind: "component", lines: lines.value.get(n) })) as CNode[])
const edges = computed<CEdge[]>(() => props.e.edges.map(x => ({ from: x.from, to: x.to, references: x.weight, sharedCommits: 0, weight: x.weight / maxW.value })) as CEdge[])
const total = computed(() => props.total ?? props.e.nodes.length)
const height = computed(() => Math.min(420, 120 + props.e.nodes.length * 22))
const selected = ref<string | null>(props.e.anchors[0] ?? null)
const pair = ref<[string, string] | null>(null)
const hovered = ref<string | null>(null)
const multi = new Set<string>()
</script>

<style scoped>
.ev-graph { border: 1px solid rgb(var(--c-neutral-200)); border-radius: 6px; overflow: hidden; }
.ev-link { color: rgb(var(--c-accent-700)); text-decoration: underline dotted; text-underline-offset: 2px; }
</style>
