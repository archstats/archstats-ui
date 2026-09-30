<template>
  <!-- A view to open, previewed: its real figure, drawn out of sight. The window moves only when it is clicked. -->
  <div v-if="e.kind === 'link'" :data-evidence="e.id">
    <EvView :route="e.open!.route" :focus="e.open?.focus" :label="(e.open?.label ?? e.title).replace(/^Open /, '')" :scan-id="e.ranOn.scanId" compact @open="$emit('open', e)"/>
  </div>

  <figure v-else class="ev-card" :class="{ 'ev-card-on': selected, 'ev-card-flash': flash }" :data-evidence="e.id">
    <header class="flex items-center gap-2 px-3 pt-2.5">
      <span class="ev-id">{{ e.id }}</span>
      <figcaption class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-neutral-900" :title="e.title">{{ e.title }}</figcaption>
      <span v-if="e.verified" class="ev-verified" title="From a verified cookbook query: the SQL is checked against real snapshots"><BadgeCheck :size="12" :stroke-width="1.75"/> verified</span>
      <button v-if="!compact" type="button" class="ev-icon" title="Inspect" aria-label="Inspect" @click="$emit('inspect', e)"><Maximize2 :size="12" :stroke-width="1.75"/></button>
    </header>

    <div class="px-3 pb-1 pt-2">
      <!-- Ranked bars. -->
      <template v-if="e.kind === 'bars'">
        <div v-for="it in e.items" :key="it.key ?? it.label" class="ev-bar-row" :title="`${it.key ?? it.label}: ${fmt(it.value)}`">
          <button type="button" class="ev-bar-label" @click="$emit('ask', `Tell me about ${it.key ?? it.label}`)">{{ it.label }}</button>
          <div class="ev-bar-track"><div class="ev-bar" :style="{ width: `${barWidth(it.value)}%` }"/></div>
          <span class="ev-bar-value">{{ fmt(it.value) }}</span>
        </div>
        <p class="ev-legend"><span class="ev-swatch"/> bar length = {{ e.unit.toLowerCase() }}<template v-if="e.note"> · {{ e.note }}</template></p>
      </template>

      <!-- Commits per month. -->
      <template v-else-if="e.kind === 'timeline'">
        <div class="ev-cols" role="img" :aria-label="e.title">
          <div v-for="p in e.points" :key="p.label" class="ev-col" :title="`${p.label}: ${fmt(p.value)} ${e.unit}`">
            <div class="ev-col-bar" :style="{ height: `${Math.max(2, (p.value / maxPoint) * 100)}%` }"/>
          </div>
        </div>
        <div class="mt-1 flex justify-between text-[10.5px] text-neutral-500"><span>{{ e.points[0]?.label }}</span><span>{{ e.points[e.points.length - 1]?.label }}</span></div>
        <p class="ev-legend"><span class="ev-swatch"/> bar height = {{ e.unit }} per month (months without commits left out)</p>
      </template>

      <!-- One component. -->
      <template v-else-if="e.kind === 'component'">
        <dl class="grid grid-cols-2 gap-x-5 gap-y-0.5">
          <div v-for="v in e.values" :key="v.id" class="flex items-baseline justify-between gap-2 border-b border-neutral-100 py-[3px]">
            <dt class="truncate text-[11.5px] text-neutral-500">{{ v.label }}</dt>
            <dd class="shrink-0 tabular-nums text-[12px] text-neutral-900">{{ fmt(v.value) }}</dd>
          </div>
        </dl>
        <div class="mt-2.5 grid grid-cols-2 gap-4 text-[11.5px]">
          <div v-for="side in sides" :key="side.title">
            <p class="mb-0.5 text-neutral-500">{{ side.title }}</p>
            <button v-for="d in side.items.slice(0, 5)" :key="d.name" type="button" class="ev-name" :title="d.name" @click="$emit('ask', `Tell me about ${d.name}`)">{{ short(d.name) }} <span class="text-neutral-400">{{ fmt(d.refs) }}</span></button>
            <p v-if="!side.items.length" class="text-neutral-400">nothing</p>
          </div>
        </div>
        <p class="ev-legend">numbers after names = import references</p>
      </template>

      <!-- A file, skimmed. -->
      <template v-else-if="e.kind === 'file'">
        <p class="mb-1.5 truncate font-mono text-[11px] text-neutral-500" :title="e.path">{{ e.path }}</p>
        <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px]">
          <span v-for="v in e.values" :key="v.label" class="text-neutral-500">{{ v.label }} <span class="tabular-nums text-neutral-900">{{ fmt(v.value) }}</span></span>
          <span class="text-neutral-500">Role <span class="text-neutral-900">{{ e.role }}</span></span>
        </div>
        <ol v-if="e.outline.length" class="ev-outline">
          <li v-for="o in e.outline.slice(0, outlineAll ? 60 : 12)" :key="`${o.line}-${o.text}`">
            <button type="button" :title="`Read from line ${o.line}`" @click="$emit('ask', `Read ${e.path} from line ${Math.max(1, o.line - 3)}`)">
              <span class="ev-line">{{ o.line }}</span><span class="ev-kind">{{ o.kind }}</span><span class="truncate">{{ o.text }}</span>
            </button>
          </li>
        </ol>
        <button v-if="e.outline.length > 12" type="button" class="ev-more" @click="outlineAll = !outlineAll">{{ outlineAll ? "Fewer" : `All ${e.outline.length} declarations` }}</button>
        <div v-if="e.importedBy.length || e.importsFrom.length" class="mt-2 grid grid-cols-2 gap-4 text-[11.5px]">
          <div><p class="mb-0.5 text-neutral-500">Used by</p><button v-for="f in e.importedBy.slice(0, 5)" :key="f" type="button" class="ev-name" :title="f" @click="$emit('ask', `Outline ${f}`)">{{ f.split("/").pop() }}</button><p v-if="!e.importedBy.length" class="text-neutral-400">nothing recorded</p></div>
          <div><p class="mb-0.5 text-neutral-500">Uses</p><button v-for="f in e.importsFrom.slice(0, 5)" :key="f" type="button" class="ev-name" :title="f" @click="$emit('ask', f.includes('/') ? `Outline ${f}` : `Tell me about ${f}`)">{{ f.split("/").pop() }}</button></div>
        </div>
      </template>

      <!-- Code, numbered. -->
      <template v-else-if="e.kind === 'code'">
        <pre class="ev-code"><code><span v-for="(l, i) in highlighted" :key="i" class="ev-code-line"><span class="ev-code-n">{{ e.from + i }}</span><span v-html="l || ' '"/></span></code></pre>
      </template>

      <!-- Rows. -->
      <template v-else-if="e.kind === 'table'">
        <div class="overflow-x-auto">
          <table class="ev-table">
            <thead><tr><th v-for="c in e.columns.slice(0, 6)" :key="c">{{ c }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in e.rows.slice(0, tableAll ? 60 : 8)" :key="i">
                <td v-for="(v, j) in r.slice(0, 6)" :key="j" :class="typeof v === 'number' ? 'text-right tabular-nums' : ''" :title="String(v ?? '')">{{ typeof v === "number" ? fmt(v) : v ?? "" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="e.rows.length > 8" type="button" class="ev-more" @click="tableAll = !tableAll">{{ tableAll ? "Fewer rows" : `All ${e.rows.length} rows` }}</button>
        <p v-if="e.note" class="ev-legend whitespace-pre-line">{{ e.note }}</p>
      </template>

      <EvTangle v-else-if="e.kind === 'tangle'" :e="e" @ask="q => $emit('ask', q)"/>
      <EvGraph v-else-if="e.kind === 'graph'" :e="e" @ask="q => $emit('ask', q)"/>
      <EvFigures v-else-if="e.kind === 'layers' || e.kind === 'folders' || e.kind === 'knowledge'" :e="e" @ask="q => $emit('ask', q)"/>
      <EvView v-else-if="e.kind === 'view'" :route="e.route" :focus="e.focus" :label="e.title" :scan-id="e.ranOn.scanId" :given="e.figures.length ? { figures: e.figures, tables: e.tables } : null" @open="$emit('open', e)"/>
    </div>

    <footer class="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
      <span class="min-w-0 flex-1 truncate px-1 text-[10.5px] text-neutral-400" :title="provenance">{{ provenance }}</span>
      <button v-if="e.open" type="button" class="ui-btn ui-btn-quiet ui-btn-sm" @click="$emit('open', e)"><ArrowUpRight :size="12" :stroke-width="1.75"/> {{ e.open.label }}</button>
      <button v-if="pinnable" type="button" class="ui-btn ui-btn-quiet ui-btn-sm" title="Keep it in Evidence; it is re-checked on every scan" @click="$emit('pin', e)"><Pin :size="12" :stroke-width="1.75"/> Pin</button>
      <button type="button" class="ui-btn ui-btn-quiet ui-btn-sm" :title="addTitle" @click="$emit('add', e)"><FilePlus2 :size="12" :stroke-width="1.75"/> Report</button>
      <button v-if="e.sql" type="button" class="ui-btn ui-btn-quiet ui-btn-sm" title="Open the query in the SQL console" @click="$emit('sql', e)"><Terminal :size="12" :stroke-width="1.75"/></button>
    </footer>
  </figure>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import hljs from "highlight.js"
import { ArrowUpRight, BadgeCheck, FilePlus2, Maximize2, Pin, Terminal } from "lucide-vue-next"
void ArrowUpRight
import type { Evidence } from "../engine/types"
import { fmt, shortName } from "../tools/shared"
import EvTangle from "./EvTangle.vue"
import EvGraph from "./EvGraph.vue"
import EvFigures from "./EvFigures.vue"
import EvView from "./EvView.vue"

const props = defineProps<{ e: Evidence; selected?: boolean; flash?: boolean; compact?: boolean }>()
defineEmits<{
  (ev: "open", e: Evidence): void
  (ev: "add", e: Evidence): void
  (ev: "pin", e: Evidence): void
  (ev: "sql", e: Evidence): void
  (ev: "inspect", e: Evidence): void
  (ev: "ask", q: string): void
}>()

const short = shortName
// Figures size themselves from their box; a card mounted while the answer grows can miss its first measure.
onMounted(() => { for (const ms of [120, 600]) setTimeout(() => window.dispatchEvent(new Event("resize")), ms) })
const outlineAll = ref(false)
const tableAll = ref(false)

const provenance = computed(() => {
  const r = props.e.ranOn
  return `${r.workspace} · ${r.commit ? r.commit.slice(0, 7) : "no commit"} · rev ${r.revision}`
})
const pinnable = computed(() => props.e.kind === "component" || props.e.kind === "file")
const addTitle = computed(() => {
  const e = props.e
  if (e.kind === "component") return "Add the component reading to this conversation's report; it runs again on newer scans"
  if (e.sql) return "Add the query to this conversation's report; it runs again on newer scans"
  if (e.kind === "code") return "Quote the code in this conversation's report"
  return "Add it to this conversation's report, as captured now"
})

const maxValue = computed(() => (props.e.kind === "bars" ? Math.max(1e-9, ...props.e.items.map(i => Math.abs(i.value))) : 1))
const barWidth = (v: number) => Math.max(1.5, (Math.abs(v) / maxValue.value) * 100)
const maxPoint = computed(() => (props.e.kind === "timeline" ? Math.max(1, ...props.e.points.map(p => p.value)) : 1))

const sides = computed(() => (props.e.kind === "component"
  ? [{ title: "Used most by", items: props.e.dependents }, { title: "Depends most on", items: props.e.dependencies }]
  : []))

const highlighted = computed(() => {
  if (props.e.kind !== "code") return []
  const ext = props.e.path.split(".").pop()?.toLowerCase() ?? ""
  const lang = ({ vue: "xml", tsx: "typescript", jsx: "javascript", kt: "kotlin", rs: "rust", py: "python", rb: "ruby", cs: "csharp", yml: "yaml", md: "markdown" } as Record<string, string>)[ext] ?? ext
  const text = props.e.lines.join("\n")
  let html: string
  try { html = hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : escape(text) } catch { html = escape(text) }
  return html.split("\n")
})
function escape(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }
</script>

<style scoped>
.ev-card { border: 1px solid rgb(var(--c-neutral-200)); border-radius: 8px; background: rgb(var(--c-surface)); transition: border-color 0.2s, box-shadow 0.2s; }
.ev-card-on { border-color: rgb(var(--c-accent-400)); }
.ev-card-flash { box-shadow: 0 0 0 3px rgb(var(--c-accent-200)); }
.ev-id { font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-accent-700)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); border-radius: 4px; padding: 2px 4px; }
.ev-verified { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; color: rgb(var(--c-green-700, 21 128 61)); }
.ev-icon { color: rgb(var(--c-neutral-400)); padding: 2px; border-radius: 4px; }
.ev-icon:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-100)); }
.ev-open-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgb(var(--c-neutral-200)); color: rgb(var(--c-neutral-800)); background: rgb(var(--c-surface)); }
.ev-open-pill:hover { border-color: rgb(var(--c-accent-400)); color: rgb(var(--c-neutral-900)); }
.ev-bar-row { display: grid; grid-template-columns: minmax(0, 40%) minmax(0, 1fr) auto; align-items: center; gap: 10px; height: 20px; }
.ev-bar-label { text-align: left; font-size: 11.5px; color: rgb(var(--c-neutral-700)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-bar-label:hover { color: rgb(var(--c-accent-700)); }
.ev-bar-track { height: 10px; }
.ev-bar { height: 10px; border-radius: 2px; background: rgb(var(--c-accent-400)); }
.ev-bar-value { font-size: 11px; color: rgb(var(--c-neutral-600)); font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
.ev-cols { display: flex; align-items: flex-end; gap: 2px; height: 72px; }
.ev-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.ev-col-bar { width: 100%; border-radius: 1.5px 1.5px 0 0; background: rgb(var(--c-accent-400)); }
.ev-col:hover .ev-col-bar { background: rgb(var(--c-accent-600)); }
.ev-legend { margin-top: 6px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.ev-swatch { display: inline-block; width: 10px; height: 6px; border-radius: 1px; background: rgb(var(--c-accent-400)); }
.ev-name { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; color: rgb(var(--c-neutral-800)); line-height: 1.55; }
.ev-name:hover { color: rgb(var(--c-accent-700)); }
.ev-outline { margin-top: 8px; border-top: 1px solid rgb(var(--c-neutral-100)); padding-top: 4px; }
.ev-outline button { display: flex; width: 100%; gap: 8px; align-items: baseline; font-size: 11.5px; padding: 1px 4px; border-radius: 4px; text-align: left; color: rgb(var(--c-neutral-800)); }
.ev-outline button:hover { background: rgb(var(--c-neutral-100)); }
.ev-line { flex-shrink: 0; width: 34px; text-align: right; font: 10.5px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-400)); }
.ev-kind { flex-shrink: 0; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.ev-more { margin-top: 4px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.ev-more:hover { color: rgb(var(--c-neutral-900)); }
.ev-code { margin: 0; max-height: 360px; overflow: auto; font: 11.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; background: rgb(var(--c-neutral-50)); border-radius: 6px; padding: 6px 0; }
.ev-code-line { display: block; padding-right: 12px; white-space: pre; }
/* Syntax colours as the file viewer draws them. */
.ev-code :deep(.hljs-comment), .ev-code :deep(.hljs-quote) { color: rgb(var(--c-neutral-500)); font-style: italic; }
.ev-code :deep(.hljs-keyword), .ev-code :deep(.hljs-selector-tag), .ev-code :deep(.hljs-literal), .ev-code :deep(.hljs-doctag), .ev-code :deep(.hljs-formula) { color: rgb(var(--c-violet-700)); }
.ev-code :deep(.hljs-string), .ev-code :deep(.hljs-regexp), .ev-code :deep(.hljs-addition), .ev-code :deep(.hljs-meta .hljs-string) { color: rgb(var(--c-green-700)); }
.ev-code :deep(.hljs-number), .ev-code :deep(.hljs-symbol), .ev-code :deep(.hljs-bullet), .ev-code :deep(.hljs-link), .ev-code :deep(.hljs-selector-attr), .ev-code :deep(.hljs-selector-pseudo) { color: rgb(var(--c-amber-700)); }
.ev-code :deep(.hljs-title), .ev-code :deep(.hljs-title.function_), .ev-code :deep(.hljs-section), .ev-code :deep(.hljs-name) { color: rgb(var(--c-blue-700)); }
.ev-code :deep(.hljs-title.class_), .ev-code :deep(.hljs-type), .ev-code :deep(.hljs-built_in), .ev-code :deep(.hljs-class .hljs-title) { color: rgb(var(--c-blue-800)); }
.ev-code :deep(.hljs-attr), .ev-code :deep(.hljs-attribute), .ev-code :deep(.hljs-variable), .ev-code :deep(.hljs-template-variable), .ev-code :deep(.hljs-params) { color: rgb(var(--c-neutral-800)); }
.ev-code :deep(.hljs-meta), .ev-code :deep(.hljs-selector-id), .ev-code :deep(.hljs-selector-class) { color: rgb(var(--c-amber-800)); }
.ev-code :deep(.hljs-deletion) { color: rgb(var(--c-red-700)); }
.ev-code :deep(.hljs-emphasis) { font-style: italic; }
.ev-code :deep(.hljs-strong) { font-weight: 600; }
.ev-code-n { display: inline-block; width: 44px; padding-right: 12px; text-align: right; color: rgb(var(--c-neutral-400)); user-select: none; }
.ev-table { width: 100%; font-size: 11.5px; border-collapse: collapse; }
.ev-table th { text-align: left; font-weight: 500; color: rgb(var(--c-neutral-500)); border-bottom: 1px solid rgb(var(--c-neutral-200)); padding: 0 10px 4px 0; white-space: nowrap; }
.ev-table td { border-bottom: 1px solid rgb(var(--c-neutral-100)); padding: 3px 10px 3px 0; max-width: 320px; overflow-wrap: anywhere; vertical-align: top; }
.ev-table td.tabular-nums { white-space: nowrap; }
</style>
