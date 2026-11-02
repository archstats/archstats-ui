<template>
  <Teleport to="body">
    <div
      v-if="rect && (target || marks?.length)"
      ref="cardRef"
      class="ui-popover symbol-card"
      :style="placement"
      role="dialog"
      :aria-label="target ? own(target) : t('files.symbolCard.lineFacts')"
      @pointerenter="emit('enter')"
      @pointerleave="emit('leave')"
    >
      <template v-if="target">
        <div class="flex items-start gap-2 px-3 pt-2.5">
          <span class="ui-tag shrink-0">{{ kindLabel }}</span>
          <div class="min-w-0 grow">
            <div class="truncate font-mono text-sm font-semibold text-neutral-900" :title="target.fn ?? target.unit">{{ own(target) }}</div>
            <div class="truncate font-mono text-xs text-neutral-500" :title="target.unit">{{ ownerLabel }}</div>
          </div>
          <span v-if="boundary !== 'same'" class="boundary-chip shrink-0" :class="`is-${boundary}`" :title="boundaryTitle">{{ boundaryLabel }}</span>
        </div>

        <div v-if="target.component" class="flex items-center gap-1.5 px-3 pt-1.5 text-xs text-neutral-500">
          <Icon icon="boxes" :size="12"/>
          <router-link :to="componentPath(target.component)" class="truncate font-mono hover:text-neutral-900 hover:underline" @click="emit('leave')">{{ target.component }}</router-link>
          <span v-if="target.module" class="truncate">· {{ target.module }}</span>
        </div>

        <pre v-if="target.signature" class="signature">{{ target.signature }}</pre>

        <div v-if="preview.length" class="preview" :title="t('files.symbolCard.openDefinition')" @click="emit('go', target, false)">
          <div class="preview-caption">{{ basename(target.file) }}:{{ target.line }}</div>
          <pre class="preview-code"><code><span v-for="(l, i) in preview" :key="i" class="block">{{ l || ' ' }}</span></code></pre>
        </div>
        <div v-else-if="!target.file" class="px-3 pt-2 text-xs text-neutral-500">{{ t('files.symbolCard.outsideSnapshot') }}</div>

        <div v-if="target.alternatives.length" class="px-3 pt-2 text-xs">
          <div class="text-neutral-500">{{ t('files.symbolCard.runsAs', { count: target.alternatives.length }) }}</div>
          <div class="mt-1 flex flex-wrap gap-1">
            <button v-for="a in target.alternatives.slice(0, 6)" :key="a.key" type="button" class="alt-chip" :title="a.unit" @click="emit('go', a, false)">{{ own(a) }}</button>
            <span v-if="target.alternatives.length > 6" class="text-neutral-400">+{{ target.alternatives.length - 6 }}</span>
          </div>
        </div>

        <div class="flex items-center gap-3 px-3 pt-2 text-xs text-neutral-500">
          <span v-if="declaration && declaration.usages > 0">{{ t('files.symbolCard.usages', { count: declaration.usages }) }}</span>
          <span v-else-if="target.usedBy">{{ t('files.symbolCard.usedBy', { count: target.usedBy }) }}</span>
          <span v-if="declaration && declaration.implementations > 0">{{ t('files.symbolCard.implementations', { count: declaration.implementations }) }}</span>
          <span v-if="target.via && target.via !== 'self'">{{ viaLabel }}</span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1 px-2 pb-2 hairline-t pt-2">
          <button v-if="!isHere && target.file" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="emit('go', target, false)">
            <Icon icon="arrow-right" :size="12"/>{{ t('files.symbolCard.goToDefinition') }}
          </button>
          <button v-if="target.file" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('files.symbolCard.besideTitle')" @click="emit('go', target, true)">
            <Icon icon="columns" :size="12"/>{{ t('files.symbolCard.beside') }}
          </button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="inquire('usages')">
            <Icon icon="search-code" :size="12"/>{{ t('files.symbolCard.findUsages') }}
          </button>
          <button v-if="target.kind === 'unit'" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="inquire('types')">
            <Icon icon="list-tree" :size="12"/>{{ t('files.symbolCard.hierarchy') }}
          </button>
          <button v-else type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="inquire('calls')">
            <Icon icon="waypoints" :size="12"/>{{ t('files.symbolCard.calls') }}
          </button>
        </div>
      </template>

      <div v-if="marks?.length" class="py-1" :class="{ 'hairline-t': target }">
        <div v-for="(m, i) in marks" :key="i" class="flex items-start gap-2 px-3 py-1.5">
          <Icon :icon="MARK_ICON[m.kind]" :size="13" class="mt-0.5 shrink-0" :class="`mark-${m.kind}`"/>
          <div class="min-w-0 grow">
            <div class="truncate font-mono text-sm text-neutral-900" :title="markTitle(m)">{{ markTitle(m) }}</div>
            <div v-if="markDetail(m)" class="truncate text-xs text-neutral-500" :title="markDetail(m)">{{ markDetail(m) }}</div>
          </div>
          <button v-if="m.kind === 'entry' && m.data.id !== null && m.data.id !== undefined" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="emit('inquire', { kind: 'reach', unit: '', fn: null, entry: Number(m.data.id) })">
            {{ t('files.symbolCard.whatItReaches') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// What a symbol under the pointer is, before the reader goes anywhere: its
// kind and owner, the component it lives in and whether reaching it crosses
// a boundary, its signature and the first lines of its definition, the
// implementations a call resolves to, and what to do next. A line's marks
// (a route, an outbound call, data access) are worded below it.
import { computed, ref, watch, type PropType } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { componentPath } from "~/features/navigation/routes"
import { useDataStore } from "~/features/snapshot/data.store"
import { sqlLiteral } from "~/shared/sql"
import { simpleName, type Boundary, type Declaration, type LineMark, type SymbolTarget } from "~/features/files/codeIntel"
import { MARK_ICON, markDetail, markTitle } from "~/features/files/codeMarks"
import type { Inquiry, InquiryKind } from "~/features/files/codeInquiry"

const props = defineProps({
  rect: { type: Object as PropType<{ left: number; top: number; bottom: number } | null>, default: null },
  target: { type: Object as PropType<SymbolTarget | null>, default: null },
  declaration: { type: Object as PropType<Declaration | null>, default: null },
  marks: { type: Array as PropType<LineMark[] | null>, default: null },
  boundary: { type: String as PropType<Boundary>, default: "same" },
  forbiddenBy: { type: String as PropType<string | null>, default: null },
  /** The file the card is shown over: a definition in it is already here. */
  here: { type: String, default: "" },
})
const emit = defineEmits<{ go: [target: SymbolTarget, beside: boolean]; inquire: [inquiry: Inquiry]; enter: []; leave: [] }>()

const store = useDataStore()
const cardRef = ref<HTMLElement | null>(null)

const WIDTH = 416
const placement = computed(() => {
  const r = props.rect
  if (!r) return {}
  const left = Math.max(8, Math.min(r.left - 12, window.innerWidth - WIDTH - 8))
  const below = window.innerHeight - r.bottom
  return below > 300 || below > r.top
    ? { left: `${left}px`, top: `${Math.round(r.bottom + 4)}px`, width: `${WIDTH}px` }
    : { left: `${left}px`, bottom: `${Math.round(window.innerHeight - r.top + 4)}px`, width: `${WIDTH}px` }
})

function own(target: SymbolTarget): string {
  return target.kind === "function" && target.fn ? `${simpleName(target.fn)}()` : target.name
}
const ownerLabel = computed(() => props.target?.unit ?? "")
const basename = (file: string | null) => (file ? file.slice(file.lastIndexOf("/") + 1) : "")
const isHere = computed(() => !!props.declaration)

const kindLabel = computed(() => {
  const target = props.target
  if (!target) return ""
  if (target.kind === "function") return t("files.symbolCard.function")
  return target.unitKind && target.unitKind !== "type" ? target.unitKind : t("files.symbolCard.type")
})

const boundaryLabel = computed(() => ({
  same: "",
  component: t("files.symbolCard.otherComponent"),
  module: t("files.symbolCard.otherModule"),
  forbidden: t("files.symbolCard.forbidden"),
}[props.boundary]))
const boundaryTitle = computed(() => props.boundary === "forbidden" && props.forbiddenBy
  ? t("files.symbolCard.forbiddenTitle", { lens: props.forbiddenBy })
  : t("files.symbolCard.crossingTitle"))

const viaLabel = computed(() => {
  const via = props.target?.via
  if (via === "implementation") return t("files.symbolCard.viaImplementation")
  if (via === "field") return t("files.symbolCard.viaField")
  if (via === "static") return t("files.symbolCard.viaStatic")
  return via ?? ""
})

function inquire(kind: InquiryKind) {
  const target = props.target
  if (!target) return
  emit("inquire", { kind, unit: target.unit, fn: target.kind === "function" ? target.fn : null, entry: null })
}

// ── The first lines of the definition ─────────────────────────────
// Files read for previews are kept for the session: a reader hovers the
// same few types again and again.
const cache = new Map<string, Promise<string[]>>()
function linesOf(file: string): Promise<string[]> {
  let hit = cache.get(file)
  if (!hit) {
    hit = store.query<{ content: string }>(`SELECT content FROM file_contents WHERE file = ${sqlLiteral(file)} LIMIT 1`)
      .then(rows => (rows[0]?.content ?? "").split("\n"))
      .catch(() => [])
    cache.set(file, hit)
    if (cache.size > 40) cache.delete(cache.keys().next().value!)
  }
  return hit
}
const preview = ref<string[]>([])
watch(() => [props.target?.file, props.target?.line] as const, async ([file, line]) => {
  preview.value = []
  if (!file || !line) return
  const lines = await linesOf(file)
  if (props.target?.file !== file) return
  const slice = lines.slice(line - 1, line + 7)
  const indent = Math.min(...slice.filter(l => l.trim()).map(l => l.match(/^\s*/)![0].length))
  preview.value = slice.map(l => l.slice(Number.isFinite(indent) ? indent : 0))
}, { immediate: true })
</script>

<style scoped>
.symbol-card { position: fixed; z-index: 80; max-width: calc(100vw - 16px); overflow: hidden; }
.signature { margin: 0.5rem 0.75rem 0; padding: 0; white-space: pre-wrap; word-break: break-word; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.75rem; line-height: 1.125rem; color: rgb(var(--c-neutral-800)); max-height: 4.5rem; overflow: hidden; }
.preview { margin: 0.5rem 0.75rem 0; border-radius: 0.375rem; background: rgb(var(--c-neutral-50)); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-200)); cursor: pointer; overflow: hidden; }
.preview:hover { box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-300)); }
.preview-caption { padding: 0.25rem 0.5rem 0; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; color: rgb(var(--c-neutral-500)); }
.preview-code { margin: 0; padding: 0.25rem 0.5rem 0.375rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1rem; color: rgb(var(--c-neutral-700)); white-space: pre; overflow: hidden; }
.boundary-chip { padding: 0 0.375rem; border-radius: 0.25rem; font-size: 0.6875rem; line-height: 1.125rem; white-space: nowrap; }
.boundary-chip.is-component { color: rgb(var(--c-blue-800)); background: rgb(var(--c-blue-50)); }
.boundary-chip.is-module { color: rgb(var(--c-amber-800)); background: rgb(var(--c-amber-50)); }
.boundary-chip.is-forbidden { color: rgb(var(--c-red-700)); background: rgb(var(--c-red-50)); }
.alt-chip { padding: 0 0.375rem; border-radius: 0.25rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1.125rem; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-100)); }
.alt-chip:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-200)); }
.mark-entry { color: rgb(var(--c-violet-700)); }
.mark-outbound { color: rgb(var(--c-blue-700)); }
.mark-data { color: rgb(var(--c-green-700)); }
.mark-config, .mark-binding, .mark-unresolved { color: rgb(var(--c-neutral-500)); }
.mark-flag { color: rgb(var(--c-red-700)); }
</style>
