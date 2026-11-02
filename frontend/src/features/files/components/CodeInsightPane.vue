<template>
  <aside class="flex w-[340px] shrink-0 flex-col bg-ground hairline-l" :aria-label="title">
    <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
      <Icon :icon="icon" :size="13" class="shrink-0 text-neutral-500"/>
      <span class="ui-section-title shrink-0">{{ title }}</span>
      <span v-if="count !== null" class="ui-tag">{{ formatNumber(count) }}</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto px-1.5" :aria-label="t('files.codeInsightPane.close')" :title="t('files.codeInsightPane.close')" @click="emit('close')">
        <Icon icon="x" :size="13" class="text-neutral-500"/>
      </button>
    </div>
    <div v-if="subject" class="shrink-0 px-3 py-2 hairline-b">
      <div class="truncate font-mono text-sm font-semibold text-neutral-900" :title="subjectTitle">{{ subject }}</div>
      <div v-if="subjectOwner" class="truncate font-mono text-xs text-neutral-500" :title="subjectOwner">{{ subjectOwner }}</div>
      <div v-if="inquiry.kind === 'calls'" class="ui-segmented mt-2" role="group" :aria-label="t('files.codeInsightPane.direction')">
        <button type="button" :aria-pressed="direction === 'in'" @click="direction = 'in'">{{ t('files.codeInsightPane.callers') }}</button>
        <button type="button" :aria-pressed="direction === 'out'" @click="direction = 'out'">{{ t('files.codeInsightPane.callees') }}</button>
      </div>
    </div>

    <div class="min-h-0 grow overflow-y-auto px-1.5 py-1.5">
      <LoadingState v-if="loading" class="py-8"/>
      <EmptyState v-else-if="error" icon="alert" :title="t('files.codeInsightPane.failed')" :text="error"/>

      <!-- Usages, by component -->
      <template v-else-if="inquiry.kind === 'usages'">
        <EmptyState v-if="!usages.length" icon="search-code" :title="t('files.codeInsightPane.noUsages')" :text="t('files.codeInsightPane.noUsagesText')"/>
        <p v-else-if="usages.length >= USAGE_LIMIT" class="px-2 pb-1 text-xs text-neutral-500">{{ t('files.codeInsightPane.capped', { limit: formatNumber(USAGE_LIMIT) }) }}</p>
        <div v-for="g in usageGroups" :key="g.component" class="mb-1.5">
          <div class="group-head">
            <span class="cross-dot" :class="{ 'is-home': g.component === home }"></span>
            <span class="min-w-0 grow truncate font-mono text-xs" :title="g.component">{{ g.component || t('files.codeInsightPane.noComponent') }}</span>
            <span class="shrink-0 text-xs text-neutral-400">{{ t('files.codeInsightPane.inFiles', { count: g.files }) }}</span>
          </div>
          <button v-for="(u, i) in g.usages" :key="u.file + ':' + (u.line ?? i)" type="button" class="row" :title="`${u.file}${u.line ? ':' + u.line : ''}`" @click="emit('open', u.file, u.line, null)">
            <span class="min-w-0 grow truncate">
              <span class="font-mono text-sm text-neutral-900">{{ basename(u.file) }}</span><span v-if="u.line" class="font-mono text-xs text-neutral-400">:{{ u.line }}</span>
              <span v-if="u.from" class="ml-1.5 font-mono text-xs text-neutral-500">{{ short(u.from) }}</span>
              <span v-else-if="!u.line" class="ml-1.5 text-xs text-neutral-400">{{ t('files.codeInsightPane.references') }}</span>
            </span>
          </button>
        </div>
      </template>

      <!-- Type hierarchy -->
      <template v-else-if="inquiry.kind === 'types'">
        <div class="group-head"><Icon icon="arrow-up-right" :size="12" class="text-neutral-400"/><span class="grow text-xs text-neutral-600">{{ t('files.codeInsightPane.extends') }}</span></div>
        <p v-if="!types.up.length" class="px-2 pb-2 text-xs text-neutral-400">{{ t('files.codeInsightPane.nothing') }}</p>
        <button v-for="u in types.up" :key="'u' + u.id" type="button" class="row" :disabled="!u.file" :title="u.id" @click="u.file && emit('open', u.file, u.line, null)">
          <span class="min-w-0 grow truncate font-mono text-sm" :class="u.file ? 'text-neutral-900' : 'text-neutral-500'">{{ u.name }}</span>
          <span v-if="!u.file" class="shrink-0 text-xs text-neutral-400">{{ t('files.codeInsightPane.external') }}</span>
          <span v-else-if="u.component && u.component !== home" class="cross-dot" :title="u.component"></span>
        </button>
        <div class="group-head mt-2"><Icon icon="corner-down-right" :size="12" class="text-neutral-400"/><span class="grow text-xs text-neutral-600">{{ t('files.codeInsightPane.implementedBy') }}</span><span class="text-xs text-neutral-400">{{ formatNumber(types.down.length) }}</span></div>
        <p v-if="!types.down.length" class="px-2 pb-2 text-xs text-neutral-400">{{ t('files.codeInsightPane.nothing') }}</p>
        <button v-for="u in types.down" :key="'d' + u.id" type="button" class="row" :disabled="!u.file" :title="u.id" @click="u.file && emit('open', u.file, u.line, null)">
          <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ u.name }}</span>
          <span v-if="u.how && u.how !== 'extends'" class="via-tag">{{ u.how.replace(/_/g, ' ') }}</span>
          <span v-if="u.component && u.component !== home" class="cross-dot" :title="u.component"></span>
        </button>
      </template>

      <!-- Call hierarchy -->
      <template v-else-if="inquiry.kind === 'calls'">
        <EmptyState v-if="!roots.length" icon="waypoints" :title="direction === 'in' ? t('files.codeInsightPane.noCallers') : t('files.codeInsightPane.noCallees')" :text="t('files.codeInsightPane.callsText')"/>
        <CallTree v-else :key="direction + inquiry.fn" :nodes="roots" :direction="direction" :home="home" :load="loadLevel" @open="n => emit('open', n.file, n.line, null)"/>
      </template>

      <!-- What a route reaches -->
      <template v-else-if="inquiry.kind === 'reach' && reach.entry">
        <div class="grid grid-cols-3 gap-1 px-1.5 pb-2">
          <div v-for="s in reachStats" :key="s.label" class="stat">
            <div class="font-mono text-base tabular-nums text-neutral-900">{{ s.value === null ? '–' : formatNumber(s.value) }}</div>
            <div class="truncate text-xs text-neutral-500">{{ s.label }}</div>
          </div>
        </div>
        <p v-if="reach.entry.auth" class="px-2 pb-2 text-xs text-neutral-600"><Icon icon="lock" :size="11" class="mr-1 inline"/>{{ reach.entry.auth }}</p>
        <template v-for="kind in reachKinds" :key="kind">
          <div class="group-head"><Icon :icon="kind === 'table' ? 'database' : 'arrow-up-right'" :size="12" class="text-neutral-400"/><span class="grow text-xs text-neutral-600">{{ kind === 'table' ? t('files.codeInsightPane.tables') : t('files.codeInsightPane.outbound') }}</span></div>
          <button v-for="r in reach.targets.filter(x => x.kind === kind)" :key="kind + r.target" type="button" class="row" :disabled="!r.file" :title="r.target" @click="r.file && emit('open', r.file, r.line, null)">
            <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ r.name || r.target }}</span>
            <span class="shrink-0 text-xs text-neutral-400" :title="t('files.codeInsightPane.depthTitle')">{{ t('files.codeInsightPane.depth', { depth: r.depth }) }}</span>
          </button>
        </template>
        <template v-if="handlerRoot.length">
          <div class="group-head mt-2"><Icon icon="waypoints" :size="12" class="text-neutral-400"/><span class="grow text-xs text-neutral-600">{{ t('files.codeInsightPane.followCalls') }}</span></div>
          <CallTree :nodes="handlerRoot" direction="out" :home="home" :load="n => loadCallees(q, n.unit, n.fn)" @open="n => emit('open', n.file, n.line, null)"/>
        </template>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
// The answer to a question asked of a symbol in the code: its usages by
// component, its type hierarchy, its callers or callees, or what a route
// reaches. Rows open the code they point at; a dot marks another component.
import { computed, ref, watch, type PropType } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import CallTree from "./CallTree.vue"
import { t } from "~/shared/i18n"
import { formatNumber } from "~/shared/format"
import { useDataStore } from "~/features/snapshot/data.store"
import { simpleName } from "~/features/files/codeIntel"
import {
  USAGE_LIMIT, groupUsages, loadCallees, loadCallers, loadReach, loadTypeHierarchy, loadUsages,
  type CallNode, type EntryFacts, type Inquiry, type ReachTarget, type TypeLink, type Usage,
} from "~/features/files/codeInquiry"

const props = defineProps({
  inquiry: { type: Object as PropType<Inquiry>, required: true },
  /** The component of the file being read; rows elsewhere get a dot. */
  home: { type: String as PropType<string | null>, default: null },
})
const emit = defineEmits<{ close: []; open: [file: string | null, line: number | null, end: number | null] }>()

const store = useDataStore()
const q = <T,>(sql: string) => store.query<T>(sql)
const has = (table: string, column: string) => store.hasColumn(table, column)

const loading = ref(false)
const error = ref<string | null>(null)
const usages = ref<Usage[]>([])
const types = ref<{ up: TypeLink[]; down: TypeLink[] }>({ up: [], down: [] })
const roots = ref<CallNode[]>([])
const reach = ref<{ entry: EntryFacts | null; targets: ReachTarget[] }>({ entry: null, targets: [] })
const direction = ref<"in" | "out">("in")

const usageGroups = computed(() => groupUsages(usages.value, props.home))
const reachKinds = computed(() => [...new Set(reach.value.targets.map(r => r.kind))].sort())
const handlerRoot = computed<CallNode[]>(() => {
  const e = reach.value.entry
  return e?.unit && e.function ? [{ unit: e.unit, fn: e.function, file: e.file, line: e.line, component: props.home, via: null, sites: 1 }] : []
})
const reachStats = computed(() => {
  const e = reach.value.entry
  return [
    { label: t("files.codeInsightPane.functions"), value: e?.functions ?? null },
    { label: t("files.codeInsightPane.tables"), value: e?.tables ?? null },
    { label: t("files.codeInsightPane.outbound"), value: e?.outbound ?? null },
  ]
})

const loadLevel = (n: CallNode) => (direction.value === "in" ? loadCallers(q, n.unit, n.fn) : loadCallees(q, n.unit, n.fn))

let token = 0
let turned = false
watch(() => [props.inquiry.unit, props.inquiry.fn], () => { turned = false; direction.value = "in" })
async function run() {
  const mine = ++token
  const i = props.inquiry
  loading.value = true
  error.value = null
  try {
    if (i.kind === "usages") {
      const rows = await loadUsages(q, i.unit, i.fn, has("calls", "to_function"))
      if (mine === token) usages.value = rows
    } else if (i.kind === "types") {
      const rows = await loadTypeHierarchy(q, i.unit, has)
      if (mine === token) types.value = rows
    } else if (i.kind === "calls" && i.fn) {
      const rows = await loadLevel({ unit: i.unit, fn: i.fn, file: null, line: null, component: null, via: null, sites: 1 })
      if (mine !== token) return
      roots.value = rows
      // Nothing calls a route handler or a main: what it calls is the answer.
      if (!rows.length && direction.value === "in" && !turned) {
        turned = true
        direction.value = "out"
      }
    } else if (i.kind === "reach" && i.entry !== null) {
      const rows = await loadReach(q, i.entry, has)
      if (mine === token) reach.value = rows
    }
  } catch (e: any) {
    if (mine === token) error.value = e?.message ? String(e.message) : String(e)
  } finally {
    if (mine === token) loading.value = false
  }
}
watch(() => [props.inquiry.kind, props.inquiry.unit, props.inquiry.fn, props.inquiry.entry, direction.value, store.datasetKey], run, { immediate: true })

const count = computed(() => {
  if (loading.value) return null
  switch (props.inquiry.kind) {
    case "usages": return usages.value.length
    case "types": return types.value.down.length
    case "calls": return roots.value.length
    default: return null
  }
})
const title = computed(() => ({
  usages: t("files.codeInsightPane.usages"),
  types: t("files.codeInsightPane.typeHierarchy"),
  calls: t("files.codeInsightPane.callHierarchy"),
  reach: t("files.codeInsightPane.reach"),
}[props.inquiry.kind]))
const icon = computed(() => ({ usages: "search-code", types: "list-tree", calls: "waypoints", reach: "log-in" }[props.inquiry.kind]))
const subject = computed(() => {
  const i = props.inquiry
  if (i.kind === "reach") {
    const e = reach.value.entry
    return e ? [e.method, e.path].filter(Boolean).join(" ") : ""
  }
  return i.fn ? `${simpleName(i.fn)}()` : simpleName(i.unit)
})
const subjectOwner = computed(() => (props.inquiry.kind === "reach" ? reach.value.entry?.function ?? "" : props.inquiry.unit))
const subjectTitle = computed(() => props.inquiry.fn ?? props.inquiry.unit)

const basename = (file: string) => file.slice(file.lastIndexOf("/") + 1)
const short = (fn: string) => `${simpleName(fn)}()`
</script>

<style scoped>
.group-head { display: flex; align-items: center; gap: 0.375rem; height: 1.5rem; padding: 0 0.5rem; }
.row { display: flex; width: 100%; align-items: center; gap: 0.375rem; height: 1.625rem; padding: 0 0.5rem 0 1.25rem; border-radius: 0.25rem; text-align: left; }
.row:hover:not(:disabled) { background: rgb(var(--c-neutral-100)); }
.row:disabled { cursor: default; }
.cross-dot { flex: none; width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: rgb(var(--c-blue-500)); }
.cross-dot.is-home { background: rgb(var(--c-neutral-300)); }
.via-tag { flex: none; padding: 0 0.25rem; border-radius: 0.1875rem; font-size: 0.625rem; line-height: 0.875rem; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-100)); }
.stat { padding: 0.375rem 0.5rem; border-radius: 0.375rem; background: rgb(var(--c-surface)); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-200)); }
</style>
