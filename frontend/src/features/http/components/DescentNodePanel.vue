<template>
  <!-- A class, table or folded group on the layers, read in full: where it
       sits, how far its change would carry (every endpoint that reaches it),
       what calls it and from where, what it calls, what data it touches, and
       the endpoints drawn through it. Names pick their node; the counts act. -->
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ node.kind === 'more' ? t('http.descent.more', { count: node.members.length }) : node.label }}</h2>
      <router-link v-if="space && component && componentName === space" :to="componentPath(component)" class="break-all font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline">{{ space }}</router-link>
      <p v-else-if="space" class="break-all font-mono text-[11px] text-neutral-500">{{ space }}</p>
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
        <span v-if="node.lane" class="h-2.5 w-2.5 rounded-full" :style="{ background: laneColor(node.lane) }"/>
        <span>{{ node.kind === 'table' ? t('http.descent.kindTable') : node.lane ? laneLabel(node.lane) : '' }}</span>
        <router-link v-if="component && componentName !== space" :to="componentPath(component)" class="truncate font-mono text-neutral-700 hover:underline" :title="component">· {{ componentName }}</router-link>
        <span v-if="node.plumbing" class="ui-tag !text-[10px]" :title="t('http.descent.sharedTitle')">{{ t('http.trace.shared') }}</span>
      </p>
      <router-link v-if="source" :to="sourceAt(source.file, source.line)" class="flex min-w-0 items-center gap-1.5 font-mono text-xs text-neutral-800 hover:underline" :title="`${source.file}:${source.line}`">
        <Icon icon="file-code" :size="13" class="shrink-0 text-neutral-500"/><span class="min-w-0 truncate text-neutral-500">{{ source.file.slice(0, source.file.lastIndexOf('/') + 1) }}</span><span class="shrink-0">{{ fileName(source.file) }}<span v-if="source.line" class="text-neutral-500">:{{ source.line }}</span></span>
      </router-link>
      <div v-if="node.kind !== 'more'" class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="ui-btn ui-btn-sm" @click="copy"><Icon :icon="copied ? 'check' : 'copy'" :size="13" class="text-neutral-500"/><span>{{ copied ? t('http.catalog.copied') : t('http.descent.copyName') }}</span></button>
        <button v-if="node.kind === 'table'" type="button" class="ui-btn ui-btn-sm" @click="emit('find', { kind: 'table', value: node.label })"><Icon icon="search" :size="13" class="text-neutral-500"/><span>{{ t('http.descent.findUsing') }}</span></button>
      </div>
    </div>

    <!-- How far it carries: of what is drawn, and of every endpoint. -->
    <div v-if="node.kind !== 'more'" class="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200">
      <div class="flex flex-col gap-0.5 bg-surface px-3 py-2">
        <span class="font-mono text-lg font-medium leading-tight text-neutral-900">{{ fmt(node.routes.size) }}<span class="text-sm text-neutral-400"> / {{ fmt(drawn) }}</span></span>
        <span class="text-[11px] text-neutral-500">{{ t('http.descent.drawnStat') }}</span>
      </div>
      <div class="flex flex-col gap-0.5 bg-surface px-3 py-2">
        <span class="font-mono text-lg font-medium leading-tight text-neutral-900">{{ fmt(everywhere.length) }}</span>
        <span class="text-[11px] text-neutral-500">{{ t(node.kind === 'table' ? 'http.descent.allTableStat' : 'http.descent.allStat', { count: everywhere.length }) }}</span>
      </div>
      <p v-if="node.kind === 'table' && tableUse" class="col-span-2 bg-surface px-3 py-1.5 text-[11px] text-neutral-600">{{ t('http.descent.tableUse', tableUse) }}</p>
      <button v-if="everywhere.length > node.routes.size" type="button" class="col-span-2 flex h-8 items-center gap-2 bg-surface px-3 text-left text-xs text-neutral-800 hover:bg-neutral-50" @click="emit('tick', everywhere.map(r => r.id))">
        <Icon icon="check" :size="13" class="text-neutral-500"/>{{ t('http.descent.tickAll', { count: everywhere.length }) }}
      </button>
    </div>

    <!-- A folded group: its members, most travelled first. -->
    <div v-if="node.kind === 'more'">
      <h4 class="ui-label">{{ t('http.descent.folded') }}</h4>
      <ul class="flex flex-col">
        <li v-for="m in members" :key="m.id">
          <button type="button" class="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" :title="m.title" @click="emit('node', m.id)">
            <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800">{{ m.label }}</span>
            <span class="shrink-0 font-mono text-[11px] text-neutral-500">{{ fmt(m.routes.size) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="node.kind === 'class' && methods.length">
      <h4 class="ui-label">{{ t('http.descent.runs', { count: methods.length }) }}</h4>
      <p class="flex flex-wrap gap-1"><span v-for="m in methods" :key="m" class="ui-tag font-mono !text-[11px]">{{ m }}</span></p>
    </div>

    <div v-if="incoming.length">
      <h4 class="ui-label">{{ node.kind === 'table' ? t('http.descent.usedBy') : t('http.descent.calledBy') }}</h4>
      <ul class="flex flex-col">
        <li v-for="e in incoming" :key="e.from" class="flex min-w-0 items-center gap-2 rounded px-1 hover:bg-neutral-100">
          <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: dot(e.other) }"/>
          <button type="button" class="flex h-7 min-w-0 flex-1 items-center gap-2 text-left" :title="e.other.title" @click="pickOther(e.other)">
            <span class="min-w-0 truncate font-mono text-xs text-neutral-800">{{ e.other.kind === 'route' ? e.other.title : e.other.label }}</span>
            <span v-if="e.link.up" class="shrink-0 rounded bg-red-50 px-1 text-[10px] text-red-700">{{ t('http.descent.upTag') }}</span>
            <span v-if="node.kind === 'table'" class="shrink-0 text-[11px]" :class="KIND_TEXT[e.link.kind]">{{ t(`http.descent.legend.${e.link.kind}`) }}</span>
          </button>
          <router-link v-if="e.link.site" :to="sourceAt(e.link.site.file, e.link.site.line)" class="shrink-0 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline" :title="`${e.link.site.file}:${e.link.site.line}`">{{ fileName(e.link.site.file) }}:{{ e.link.site.line }}</router-link>
        </li>
      </ul>
    </div>

    <div v-if="node.kind === 'class'">
      <h4 class="ui-label">{{ t('http.descent.callsTo') }}</h4>
      <ul v-if="calls.length" class="flex flex-col">
        <li v-for="e in calls" :key="e.to">
          <div class="flex min-w-0 items-center gap-2 rounded px-1 hover:bg-neutral-100">
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: dot(e.other) }"/>
            <button type="button" class="flex h-7 min-w-0 flex-1 items-center gap-2 text-left" :title="e.other.title" @click="pickOther(e.other)">
              <span class="min-w-0 truncate font-mono text-xs text-neutral-800">{{ e.other.label }}</span>
              <span v-if="e.link.up" class="shrink-0 rounded bg-red-50 px-1 text-[10px] text-red-700">{{ t('http.descent.upTag') }}</span>
            </button>
            <router-link v-if="e.link.site" :to="sourceAt(e.link.site.file, e.link.site.line)" class="shrink-0 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline" :title="`${e.link.site.file}:${e.link.site.line}`">{{ fileName(e.link.site.file) }}:{{ e.link.site.line }}</router-link>
          </div>
        </li>
      </ul>
      <p v-else class="text-xs text-neutral-500">{{ node.plumbing ? t('http.descent.sharedTitle') : t('http.descent.callsNothing') }}</p>
    </div>

    <div v-if="node.kind === 'class' && touched.length">
      <h4 class="ui-label">{{ t('http.descent.touches') }}</h4>
      <p class="flex flex-wrap gap-1">
        <button v-for="e in touched" :key="e.to" type="button" class="ui-tag font-mono !text-[11px]" :class="TAG[e.link.kind]" :title="`${t(`http.descent.legend.${e.link.kind}`)} ${e.other.title}`" @click="pickOther(e.other)">
          {{ e.other.kind === 'system' ? systemName(e.other.title) : e.other.label }}
        </button>
      </p>
    </div>

    <RouteList v-if="node.routes.size" :title="t('http.descent.through', { count: node.routes.size })" :routes="drawnRoutes" :method-class="methodClass" @pick="emit('route', $event)"/>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { t, intlLocale } from "~/shared/i18n"
import { componentLabel, componentPath } from "~/features/navigation/routes"
import RouteList from "./RouteList.vue"
import type { Descent, DescentLink, DescentNode, LinkKind } from "../descent"
import type { Route } from "../http"
import type { Token } from "../search"

const props = defineProps<{
  node: DescentNode
  flow: Descent
  /** The endpoints drawn. */
  drawn: number
  /** Every endpoint in the catalogue that reaches it. */
  everywhere: Route[]
  /** For a table: how many endpoints change, may change and read it. */
  tableUse: { changes: number; may: number; reads: number } | null
  component: string
  /** Where the class, or a table's entity, is declared. */
  source: { file: string; line: number } | null
  workspace?: string
  routesOf: (ids: Iterable<number>) => Route[]
  laneLabel: (lane: string) => string
  laneColor: (lane: string) => string
  methodClass: (m: string) => string
  systemName: (key: string) => string
  sourceAt: (file: string, line: number) => string
}>()
const emit = defineEmits<{
  (e: "node", id: string): void
  (e: "route", id: number): void
  (e: "system", name: string): void
  (e: "tick", ids: number[]): void
  (e: "find", token: Token): void
}>()

const fmt = (n: number) => n.toLocaleString(intlLocale)
const fileName = (f: string) => f.slice(f.lastIndexOf("/") + 1)
const componentName = computed(() => (props.component ? componentLabel(props.component, props.workspace) : ""))
// The namespace a class sits in; a table's whole name where it has one.
const space = computed(() => {
  const n = props.node
  if (n.kind === "more" || n.title === n.label) return ""
  return n.title.endsWith(n.label) ? n.title.slice(0, n.title.length - n.label.length).replace(/[.:/\\$#]+$/, "") : n.title
})

const KIND_TEXT: Record<LinkKind, string> = { call: "text-neutral-500", write: "text-blue-700", may: "text-blue-500", read: "text-neutral-500", out: "text-amber-700" }
const TAG: Record<LinkKind, string> = {
  call: "",
  write: "!bg-blue-50 !text-blue-800",
  may: "!bg-transparent !text-blue-700 ring-1 ring-inset ring-blue-200",
  read: "",
  out: "!bg-amber-50 !text-amber-800",
}
const ORDER: Record<LinkKind, number> = { write: 0, may: 1, read: 2, out: 3, call: 4 }

type Edge = { link: DescentLink; other: DescentNode }
const edges = (dir: "in" | "out") => props.flow.edges
  .filter(l => (dir === "in" ? l.to : l.from) === props.node.id)
  .map(l => ({ link: l, other: props.flow.nodes.get(dir === "in" ? l.from : l.to)! }))
  .filter(e => !!e.other)
  .sort((a, b) => ORDER[a.link.kind] - ORDER[b.link.kind] || b.link.routes.size - a.link.routes.size || a.other.label.localeCompare(b.other.label))
const incoming = computed<Edge[]>(() => edges("in"))
const outgoing = computed<Edge[]>(() => edges("out"))
const calls = computed(() => outgoing.value.filter(e => e.link.kind === "call"))
const touched = computed(() => outgoing.value.filter(e => e.link.kind !== "call"))
const methods = computed(() => [...props.node.functions].map(f => f.slice(f.lastIndexOf(".") + 1)).filter((m, i, a) => m && a.indexOf(m) === i).sort())
const members = computed(() => props.node.members.map(id => props.flow.nodes.get(id)).filter((n): n is DescentNode => !!n))
const drawnRoutes = computed(() => props.routesOf(props.node.routes))

function dot(n: DescentNode): string {
  if (n.kind === "route") return "rgb(var(--c-neutral-300))"
  if (n.kind === "table") return "rgb(var(--c-violet-400))"
  if (n.kind === "system") return "rgb(var(--c-amber-500))"
  return n.lane ? props.laneColor(n.lane) : "rgb(var(--c-neutral-400))"
}
function pickOther(n: DescentNode) {
  if (n.kind === "route") emit("route", Number(n.id.slice(2)))
  else if (n.kind === "system") emit("system", n.title)
  else emit("node", n.id)
}

const copied = ref(false)
watch(() => props.node.id, () => { copied.value = false })
async function copy() {
  try { await navigator.clipboard.writeText(props.node.title) } catch { return }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>
