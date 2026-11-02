<template>
  <Teleport to="body">
    <div
      v-if="rect && (target || marks?.length)"
      class="ui-popover symbol-card"
      :style="placement"
      role="dialog"
      :aria-label="target ? own(target) : t('files.symbolCard.lineFacts')"
      @pointerenter="emit('enter')"
      @pointerleave="emit('leave')"
    >
      <template v-if="target">
        <!-- Who: the name in the language's own word, and where it lives. -->
        <div class="px-3 pt-2.5">
          <div class="flex items-baseline gap-2">
            <span class="min-w-0 truncate font-mono text-sm font-semibold text-neutral-900" :title="target.fn ?? target.unit">{{ own(target) }}</span>
            <span v-if="kindWord" class="shrink-0 font-mono text-xs text-neutral-500">{{ kindWord }}</span>
            <span v-if="boundary !== 'same'" class="boundary-chip ml-auto shrink-0" :class="`is-${boundary}`" :title="boundaryTitle">{{ boundaryLabel }}</span>
          </div>
          <div class="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-neutral-500">
            <template v-if="ownerType">
              <span class="shrink-0">{{ t('files.symbolCard.in') }}</span>
              <span class="truncate font-mono text-neutral-700" :title="target.unit">{{ ownerType }}</span>
            </template>
            <router-link v-else-if="target.component" :to="componentPath(target.component)" class="truncate font-mono hover:text-neutral-900 hover:underline" :title="t('files.symbolCard.openComponent')" @click="emit('leave')">{{ target.component }}</router-link>
            <span v-else class="truncate font-mono">{{ packageOf(target) }}</span>
            <span v-if="target.module" class="shrink-0 truncate">· {{ target.module }}</span>
          </div>
        </div>

        <!-- What it is for, in its author's words. -->
        <p v-if="parts?.doc" class="doc">{{ parts.doc }}</p>
        <div v-if="parts?.annotations.length" class="flex flex-wrap gap-1 px-3 pt-2">
          <span v-for="a in parts.annotations.slice(0, 6)" :key="a" class="annotation">{{ a }}</span>
        </div>

        <!-- What it looks like: the declaration and the start of its body. -->
        <button v-if="code.length" type="button" class="preview" :title="isHere ? undefined : t('files.symbolCard.openDefinition')" :disabled="isHere" @click="emit('go', target, false)">
          <pre class="preview-code code-colours"><code><span v-for="(l, i) in code" :key="i" class="block" :class="{ 'is-declaration': i < declarationLines }" v-html="l || ' '"></span></code></pre>
          <span v-if="parts?.more" class="preview-fade"></span>
        </button>
        <div v-else-if="loadingPreview" class="preview-skeleton"><span></span><span></span><span></span></div>
        <template v-else-if="!target.file">
          <pre v-if="target.signature" class="preview-code code-colours mx-3 mt-2"><code v-html="highlightOne(target.signature)"></code></pre>
          <p class="px-3 pt-2 text-xs text-neutral-500">{{ t('files.symbolCard.outsideSnapshot') }}</p>
        </template>

        <div v-if="target.alternatives.length" class="px-3 pt-2 text-xs">
          <span class="text-neutral-500">{{ t('files.symbolCard.runsAs', { count: target.alternatives.length }) }}</span>
          <span class="ml-1 inline-flex flex-wrap gap-1 align-middle">
            <button v-for="a in target.alternatives.slice(0, 5)" :key="a.key" type="button" class="alt-chip" :title="a.unit" @click="emit('go', a, false)">{{ ownerOf(a) ?? own(a) }}</button>
            <span v-if="target.alternatives.length > 5" class="text-neutral-400">+{{ target.alternatives.length - 5 }}</span>
          </span>
        </div>

        <!-- What to do next. The counts are the way into the pane. -->
        <div class="footer">
          <button v-if="usageCount" type="button" class="footer-link" @click="inquire('usages')">{{ usageLabel }}</button>
          <button v-if="declaration && declaration.implementations > 0" type="button" class="footer-link" @click="inquire('types')">{{ t('files.symbolCard.implementations', { count: declaration.implementations }) }}</button>
          <span class="ml-auto flex items-center">
            <button v-if="!isHere && target.file" type="button" class="card-action" :title="t('files.symbolCard.goTitle')" @click="emit('go', target, false)"><Icon icon="arrow-right" :size="12"/>{{ t('files.symbolCard.go') }}</button>
            <button v-if="target.file" type="button" class="card-action" :title="t('files.symbolCard.besideTitle')" @click="emit('go', target, true)"><Icon icon="columns" :size="12"/>{{ t('files.symbolCard.beside') }}</button>
            <button v-if="!usageCount" type="button" class="card-action" :title="t('files.symbolCard.findUsages')" @click="inquire('usages')"><Icon icon="search-code" :size="12"/>{{ t('files.symbolCard.findUsages') }}</button>
            <button v-if="target.kind === 'unit'" type="button" class="card-action" :title="t('files.symbolCard.hierarchyTitle')" @click="inquire('types')"><Icon icon="list-tree" :size="12"/>{{ t('files.symbolCard.hierarchy') }}</button>
            <button v-else type="button" class="card-action" :title="t('files.symbolCard.callsTitle')" @click="inquire('calls')"><Icon icon="waypoints" :size="12"/>{{ t('files.symbolCard.calls') }}</button>
          </span>
        </div>
      </template>

      <div v-if="marks?.length" class="py-1" :class="{ 'hairline-t': target }">
        <div v-for="(m, i) in marks" :key="i" class="flex items-start gap-2 px-3 py-1.5">
          <Icon :icon="MARK_ICON[m.kind]" :size="13" class="mt-0.5 shrink-0" :class="`mark-${m.kind}`"/>
          <div class="min-w-0 grow">
            <div class="truncate font-mono text-sm text-neutral-900" :title="markTitle(m)">{{ markTitle(m) }}</div>
            <div v-if="markDetail(m)" class="truncate text-xs text-neutral-500" :title="markDetail(m)">{{ markDetail(m) }}</div>
          </div>
          <button v-if="m.kind === 'entry' && m.data.id !== null && m.data.id !== undefined" type="button" class="card-action shrink-0" @click="emit('inquire', { kind: 'reach', unit: '', fn: null, entry: Number(m.data.id) })">
            {{ t('files.symbolCard.whatItReaches') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// What a symbol under the pointer is, before the reader goes anywhere, as an
// IDE's hover reads: its name in the language's own word (abstract class,
// interface, def) and where it lives, its doc comment as prose, its
// annotations, then the declaration and the start of its body in colour.
// The counts at the foot open its usages or implementations; the actions
// go to it, open it beside, or ask for its hierarchy or calls. A line's
// marks (a route, an outbound call, data access) are worded below.
import { computed, ref, watch, type PropType } from "vue"
import hljs from "highlight.js"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { componentPath } from "~/features/navigation/routes"
import { useDataStore } from "~/features/snapshot/data.store"
import { sqlLiteral } from "~/shared/sql"
import { simpleName, type Boundary, type Declaration, type LineMark, type SymbolTarget } from "~/features/files/codeIntel"
import { MARK_ICON, markDetail, markTitle } from "~/features/files/codeMarks"
import { declaredKind, definitionPreview, type DefinitionPreview } from "~/features/files/definitionPreview"
import { detectLanguage } from "~/features/files/language"
import { splitHighlighted } from "~/features/files/highlightLines"
import type { Inquiry, InquiryKind } from "~/features/files/codeInquiry"
import "./codeColours.css"

const props = defineProps({
  rect: { type: Object as PropType<{ left: number; top: number; bottom: number } | null>, default: null },
  target: { type: Object as PropType<SymbolTarget | null>, default: null },
  declaration: { type: Object as PropType<Declaration | null>, default: null },
  marks: { type: Array as PropType<LineMark[] | null>, default: null },
  boundary: { type: String as PropType<Boundary>, default: "same" },
  forbiddenBy: { type: String as PropType<string | null>, default: null },
})
const emit = defineEmits<{ go: [target: SymbolTarget, beside: boolean]; inquire: [inquiry: Inquiry]; enter: []; leave: [] }>()

const store = useDataStore()

const WIDTH = 440
const placement = computed(() => {
  const r = props.rect
  if (!r) return {}
  const left = Math.max(8, Math.min(r.left - 12, window.innerWidth - WIDTH - 8))
  const below = window.innerHeight - r.bottom
  return below > 320 || below > r.top
    ? { left: `${left}px`, top: `${Math.round(r.bottom + 4)}px`, width: `${WIDTH}px` }
    : { left: `${left}px`, bottom: `${Math.round(window.innerHeight - r.top + 4)}px`, width: `${WIDTH}px` }
})

function own(target: SymbolTarget): string {
  return target.kind === "function" && target.fn ? `${simpleName(target.fn)}()` : target.name
}
/** The type a function belongs to: `LoanReadPlatformService` of `LoanReadPlatformService.retrieveAll`. */
function ownerOf(target: SymbolTarget): string | null {
  const fn = target.fn
  return fn && fn.includes(".") ? simpleName(fn.slice(0, fn.lastIndexOf("."))) : null
}
const ownerType = computed(() => (props.target ? ownerOf(props.target) : null))
function packageOf(target: SymbolTarget): string {
  const i = target.unit.lastIndexOf(".")
  return i > 0 ? target.unit.slice(0, i) : target.unit
}
const isHere = computed(() => !!props.declaration)

const boundaryLabel = computed(() => ({
  same: "",
  component: t("files.symbolCard.otherComponent"),
  module: t("files.symbolCard.otherModule"),
  forbidden: t("files.symbolCard.forbidden"),
}[props.boundary]))
const boundaryTitle = computed(() => props.boundary === "forbidden" && props.forbiddenBy
  ? t("files.symbolCard.forbiddenTitle", { lens: props.forbiddenBy })
  : t("files.symbolCard.crossingTitle"))

const usageCount = computed(() => {
  const d = props.declaration
  if (d) return d.usages
  const target = props.target
  return target?.kind === "unit" ? target.usedBy ?? 0 : 0
})
const usageLabel = computed(() => (props.declaration?.target.kind === "function"
  ? t("files.symbolCard.usages", { count: usageCount.value })
  : t("files.symbolCard.usedBy", { count: usageCount.value })))

function inquire(kind: InquiryKind) {
  const target = props.target
  if (!target) return
  emit("inquire", { kind, unit: target.unit, fn: target.kind === "function" ? target.fn : null, entry: null })
}

// ── The definition, read from its file ────────────────────────────
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

const parts = ref<DefinitionPreview | null>(null)
const loadingPreview = ref(false)
watch(() => [props.target?.file, props.target?.line, props.target?.key] as const, async ([file, line]) => {
  parts.value = null
  if (!file || !line || !props.target) return
  loadingPreview.value = true
  const lines = await linesOf(file)
  loadingPreview.value = false
  const target = props.target
  if (target?.file !== file) return
  const ident = target.kind === "function" && target.fn ? simpleName(target.fn) : target.name
  parts.value = definitionPreview(lines, line, ident, 7)
}, { immediate: true })

const kindWord = computed(() => {
  const target = props.target
  if (!target) return ""
  const word = parts.value ? declaredKind(parts.value.declaration) : null
  if (word && !["func", "function", "fn", "def", "fun"].includes(word)) return word
  if (target.kind === "function") return ownerType.value ? t("files.symbolCard.method") : t("files.symbolCard.function")
  return word ?? (target.unitKind && target.unitKind !== "type" ? target.unitKind : "")
})

// The declaration line, then the body, highlighted together so a string
// or comment that spans them keeps its colour.
const declarationLines = computed(() => (parts.value ? 1 : 0))
const code = computed(() => {
  const p = parts.value
  const file = props.target?.file
  if (!p || !file) return []
  const text = [p.declaration, ...p.body].join("\n")
  const lang = detectLanguage(file.slice(file.lastIndexOf("/") + 1))
  try {
    return splitHighlighted(lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : hljs.highlightAuto(text).value)
  } catch {
    return [p.declaration, ...p.body]
  }
})
function highlightOne(text: string): string {
  const lang = props.target?.file ? detectLanguage(props.target.file) : ""
  try {
    return lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : hljs.highlightAuto(text).value
  } catch {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  }
}
</script>

<style scoped>
.symbol-card { position: fixed; z-index: 80; max-width: calc(100vw - 16px); overflow: hidden; }
.doc { margin: 0; padding: 0.5rem 0.75rem 0; font-size: 0.75rem; line-height: 1.125rem; color: rgb(var(--c-neutral-700)); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.annotation { padding: 0 0.3125rem; border-radius: 0.1875rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1.125rem; color: rgb(var(--c-amber-800)); background: rgb(var(--c-amber-50)); }
.preview { position: relative; display: block; width: calc(100% - 1.5rem); margin: 0.5rem 0.75rem 0; border-radius: 0.375rem; text-align: left; background: rgb(var(--c-neutral-50)); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-200)); overflow: hidden; }
.preview:not(:disabled):hover { box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-300)); }
.preview:disabled { cursor: default; }
.preview-code { margin: 0; padding: 0.375rem 0.625rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1.0625rem; color: rgb(var(--c-neutral-800)); white-space: pre; overflow: hidden; }
.preview-code .is-declaration { font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; padding-left: 1.5em; text-indent: -1.5em; }
.preview-code .is-declaration + .block:not(.is-declaration) { margin-top: 0.125rem; }
.preview-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 1.25rem; background: linear-gradient(to bottom, transparent, rgb(var(--c-neutral-50))); pointer-events: none; }
.preview-skeleton { display: grid; gap: 0.375rem; margin: 0.5rem 0.75rem 0; padding: 0.5rem 0.625rem; border-radius: 0.375rem; background: rgb(var(--c-neutral-50)); }
.preview-skeleton span { height: 0.5rem; border-radius: 0.25rem; background: rgb(var(--c-neutral-200)); }
.preview-skeleton span:nth-child(1) { width: 70%; }
.preview-skeleton span:nth-child(2) { width: 45%; }
.preview-skeleton span:nth-child(3) { width: 55%; }
.boundary-chip { padding: 0 0.375rem; border-radius: 0.25rem; font-size: 0.6875rem; line-height: 1.125rem; white-space: nowrap; }
.boundary-chip.is-component { color: rgb(var(--c-blue-800)); background: rgb(var(--c-blue-50)); }
.boundary-chip.is-module { color: rgb(var(--c-amber-800)); background: rgb(var(--c-amber-50)); }
.boundary-chip.is-forbidden { color: rgb(var(--c-red-700)); background: rgb(var(--c-red-50)); }
.alt-chip { padding: 0 0.375rem; border-radius: 0.25rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1.125rem; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-100)); }
.alt-chip:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-200)); }
.footer { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.625rem; padding: 0.25rem 0.375rem 0.25rem 0.75rem; box-shadow: inset 0 1px 0 rgb(var(--c-neutral-200)); }
.footer-link { font-size: 0.75rem; color: rgb(var(--c-neutral-600)); white-space: nowrap; }
.footer-link:hover { color: rgb(var(--c-neutral-900)); text-decoration: underline; text-underline-offset: 2px; }
.card-action { display: inline-flex; align-items: center; gap: 0.25rem; height: 1.5rem; padding: 0 0.375rem; border-radius: 0.25rem; font-size: 0.75rem; color: rgb(var(--c-neutral-600)); white-space: nowrap; }
.card-action:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-100)); }
.mark-entry { color: rgb(var(--c-violet-700)); }
.mark-outbound { color: rgb(var(--c-blue-700)); }
.mark-data { color: rgb(var(--c-green-700)); }
.mark-config, .mark-binding, .mark-unresolved { color: rgb(var(--c-neutral-500)); }
.mark-flag { color: rgb(var(--c-red-700)); }
</style>
