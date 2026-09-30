<template>
  <aside class="flex h-full flex-col" aria-label="Inspector">
    <div class="flex h-9 shrink-0 items-center gap-1 px-2 hairline-b">
      <div class="ui-segmented" role="tablist" aria-label="Inspector">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="ask.inspector.tab === t.id" :class="{ 'is-active': ask.inspector.tab === t.id }" @click="ask.inspector.tab = t.id">{{ t.label }}</button>
      </div>
      <span class="flex-1"/>
      <button type="button" class="ui-btn ui-btn-quiet ui-btn-icon ui-btn-sm" title="Close the inspector" aria-label="Close the inspector" @click="ask.inspector.open = false"><X :size="13" :stroke-width="1.75"/></button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Evidence: the chosen piece large, and every piece of the conversation. -->
      <div v-if="ask.inspector.tab === 'evidence'" class="p-3">
        <template v-if="chosen">
          <AskEvidence :e="chosen" compact @open="actions.open" @add="actions.add" @pin="actions.pin" @sql="actions.sql" @ask="q => $emit('ask', q)"/>
          <p class="mt-2 text-[11px] text-neutral-500">Asked in: “{{ turnOf(chosen.id)?.question }}”</p>
        </template>
        <p v-else-if="!all.length && !figures.length" class="py-6 text-center text-[12px] leading-relaxed text-neutral-500">Evidence appears here as the answers find it: every number an answer states points at one of these.</p>
        <!-- The figures of the conversation and what each states: every fact id an answer cites is one of these. -->
        <div v-if="figures.length" :class="chosen ? 'mt-4' : ''">
          <p class="ui-section-title mb-1">Figures and their facts · {{ figures.length }}</p>
          <details v-for="x in figures" :key="x.id" class="ask-fig" :open="x.id === openFigure">
            <summary class="ask-ev-row" :class="{ 'ask-ev-row-on': x.id === openFigure }" @click="$emit('cite', x.id)">
              <span class="ask-ev-id">{{ x.id }}</span>
              <span class="min-w-0 flex-1 truncate">{{ x.title }}</span>
              <span class="shrink-0 text-[10.5px] text-neutral-400">{{ x.facts.length }}</span>
            </summary>
            <ol class="ask-facts">
              <li v-for="f in x.facts" :key="f.id">
                <button type="button" :class="{ 'ask-fact-on': f.id === ask.inspector.evidenceId }" @click="$emit('cite', f.id)"><span class="ask-ev-id">{{ f.id }}</span><span class="min-w-0 flex-1">{{ f.text }}</span></button>
              </li>
            </ol>
          </details>
        </div>
        <div v-if="all.length" class="mt-4">
          <p class="ui-section-title mb-1">All evidence · {{ all.length }}</p>
          <button v-for="e in all" :key="e.id" type="button" class="ask-ev-row" :class="{ 'ask-ev-row-on': e.id === ask.inspector.evidenceId }" @click="$emit('cite', e.id)">
            <span class="ask-ev-id">{{ e.id }}</span>
            <component :is="iconOf(e.kind)" :size="12" :stroke-width="1.75" class="shrink-0 text-neutral-400"/>
            <span class="min-w-0 flex-1 truncate">{{ e.title }}</span>
          </button>
        </div>
      </div>

      <!-- Context: what the model knows before it looks. -->
      <div v-else-if="ask.inspector.tab === 'context'" class="space-y-4 p-3 text-[12px]">
        <section>
          <p class="ui-section-title mb-1">The snapshot card</p>
          <p class="mb-1.5 text-[11px] text-neutral-500">Every question starts with this brief, so the model never starts from zero.</p>
          <pre class="ask-pre">{{ ask.cardText || "Building…" }}</pre>
        </section>
        <section v-if="context">
          <p class="ui-section-title mb-1">From the view</p>
          <p class="mb-1 text-neutral-700">{{ context.label }}<template v-if="context.subject"> · {{ context.subject.name }}</template></p>
          <ul class="space-y-0.5 text-[11.5px] text-neutral-600">
            <li v-if="context.focus">Focus: <span class="font-mono">{{ context.focus }}</span></li>
            <li v-if="context.selection?.length">Selected: {{ context.selection.length }}</li>
            <li v-for="x in context.exhibits" :key="x.title">{{ x.kind === "table" ? `Table · ${x.title} (${x.total} rows)` : `Figure · ${x.title}` }}</li>
          </ul>
        </section>
        <section>
          <p class="ui-section-title mb-1">What it can answer</p>
          <div class="flex flex-wrap gap-1">
            <button v-for="c in capabilities" :key="c.id" type="button" class="ask-cap" :title="c.how" @click="$emit('ask', capitalise(c.asks[0]) + '?')">{{ c.asks[0] }}</button>
          </div>
        </section>
      </div>

      <!-- Trace: everything the last turns did, for tuning the harness. -->
      <div v-else class="space-y-3 p-3 text-[11.5px]">
        <p v-if="!traced" class="py-6 text-center text-[12px] text-neutral-500">Ask something; each step shows here.</p>
        <template v-else>
          <div class="flex items-center gap-2">
            <select v-model="traceId" class="ui-input ui-input-sm min-w-0 flex-1" aria-label="Which question">
              <option v-for="t in turns" :key="t.id" :value="t.id">{{ t.question.slice(0, 60) }}</option>
            </select>
          </div>
          <section>
            <p class="ui-section-title mb-1">Route</p>
            <p class="text-neutral-700">{{ traced.namespaces.join(" · ") }}<span class="text-neutral-400"> — offered tools follow these namespaces</span></p>
          </section>
          <section v-if="traced.plan.length">
            <p class="ui-section-title mb-1">Plan</p>
            <ol class="list-decimal pl-4 text-neutral-700"><li v-for="(p, i) in traced.plan" :key="i">{{ p.claim }} <span class="text-neutral-400">— {{ p.test }}</span></li></ol>
          </section>
          <section>
            <p class="ui-section-title mb-1">Model calls · {{ traced.trace.length }}</p>
            <div v-for="c in traced.trace" :key="c.step" class="ask-trace">
              <p class="flex gap-2 text-neutral-500"><span>step {{ c.step + 1 }}</span><span class="tabular-nums">{{ c.promptTokens }} in · {{ c.outputTokens }} out · {{ (c.ms / 1000).toFixed(1) }} s</span></p>
              <p v-for="tc in c.toolCalls" :key="tc" class="font-mono text-[10.5px] text-neutral-800">→ {{ tc }}</p>
              <details v-if="c.content"><summary class="cursor-pointer text-neutral-500">text</summary><pre class="ask-pre">{{ c.content }}</pre></details>
              <details v-if="c.thinking"><summary class="cursor-pointer text-neutral-500">reasoning</summary><pre class="ask-pre">{{ c.thinking }}</pre></details>
            </div>
          </section>
          <section>
            <p class="ui-section-title mb-1">Checks</p>
            <p v-for="c in traced.checks" :key="c.id" class="flex gap-1.5" :class="c.ok ? 'text-neutral-600' : 'text-amber-800'"><span>{{ c.ok ? "✓" : "✗" }}</span><span>{{ c.detail }}</span></p>
            <p v-for="(r, i) in traced.repairs" :key="i" class="mt-1 text-neutral-500">Repair sent: {{ r }}</p>
          </section>
          <section>
            <details>
              <summary class="ui-section-title cursor-pointer">System prompt (last turn) · tools {{ ask.lastTools.length }}</summary>
              <p class="mt-1 text-neutral-500">{{ ask.lastTools.join(", ") }}</p>
              <pre class="ask-pre mt-1">{{ ask.lastSystem || "Not in this session yet." }}</pre>
            </details>
          </section>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ExhibitPart } from "~/features/exhibits/types"
import { computed, ref, watch } from "vue"
import { BarChart3, Braces, FileCode, FileText, GitBranch, Image, Layers, LayoutGrid, Link2, Network, RefreshCw, Table2, Users, X } from "lucide-vue-next"
import { useAskStore } from "../app/ask.store"
import { useAskActions } from "../app/useAskActions"
import { CAPABILITIES } from "../knowledge/capabilities"
import AskEvidence from "./AskEvidence.vue"

defineEmits<{ (e: "cite", id: string): void; (e: "ask", q: string): void }>()
const ask = useAskStore()
const actions = useAskActions()
const tabs = [{ id: "evidence", label: "Evidence" }, { id: "context", label: "Context" }, { id: "trace", label: "Trace" }] as const

const turns = computed(() => [...(ask.current?.turns ?? [])].reverse())
const all = computed(() => ask.allEvidence.filter(e => e.kind !== "link"))
const figures = computed<ExhibitPart[]>(() => ask.current?.turns.flatMap(t => t.exhibits ?? []) ?? [])
/** The figure whose fact (or itself) was cited last: open, to show where the number comes from. */
const openFigure = computed(() => (ask.inspector.evidenceId ?? "").split(".")[0])
const chosen = computed(() => all.value.find(e => e.id === ask.inspector.evidenceId) ?? null)
const turnOf = (id: string) => ask.current?.turns.find(t => t.evidence.some(e => e.id === id))
const context = computed(() => ask.pendingContext ?? [...(ask.current?.turns ?? [])].reverse().find(t => t.context)?.context ?? null)
const capabilities = CAPABILITIES.filter(c => c.tools.length).slice(0, 18)
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const traceId = ref<string | null>(null)
watch(() => ask.inspector.evidenceId, id => { if (id?.startsWith("turn:")) { traceId.value = id.slice(5); ask.inspector.evidenceId = null } })
watch(() => turns.value[0]?.id, id => { if (id) traceId.value = id }, { immediate: true })
const traced = computed(() => turns.value.find(t => t.id === traceId.value) ?? turns.value[0] ?? null)

const iconOf = (k: string) => ({ bars: BarChart3, table: Table2, component: Braces, graph: Network, tangle: RefreshCw, file: FileText, code: FileCode, timeline: GitBranch, link: Link2, layers: Layers, folders: LayoutGrid, knowledge: Users, view: Image } as Record<string, any>)[k] ?? Table2
</script>

<style scoped>
.ask-pre { white-space: pre-wrap; font: 10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-50)); border-radius: 6px; padding: 8px 10px; max-height: 360px; overflow: auto; }
.ask-ev-row { display: flex; width: 100%; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px; font-size: 12px; color: rgb(var(--c-neutral-800)); text-align: left; }
.ask-ev-row:hover { background: rgb(var(--c-neutral-100)); }
.ask-ev-row-on { background: rgb(var(--c-accent-50)); }
.ask-ev-id { flex-shrink: 0; width: 26px; font: 500 10px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-accent-700)); }
.ask-cap { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgb(var(--c-neutral-200)); color: rgb(var(--c-neutral-700)); }
.ask-cap:hover { border-color: rgb(var(--c-accent-400)); color: rgb(var(--c-neutral-900)); }
.ask-trace { border-left: 2px solid rgb(var(--c-neutral-200)); padding: 2px 0 4px 8px; margin-bottom: 6px; }
.ask-fig > summary { list-style: none; }
.ask-fig > summary::-webkit-details-marker { display: none; }
.ask-facts { margin: 2px 0 8px 8px; padding-left: 8px; border-left: 1px solid rgb(var(--c-neutral-200)); display: grid; gap: 1px; }
.ask-facts button { display: flex; width: 100%; gap: 6px; align-items: baseline; padding: 2px 4px; border-radius: 4px; text-align: left; font-size: 11.5px; line-height: 1.4; color: rgb(var(--c-neutral-700)); }
.ask-facts button:hover { background: rgb(var(--c-neutral-50)); color: rgb(var(--c-neutral-900)); }
.ask-facts .ask-fact-on { background: rgb(var(--c-accent-50)); color: rgb(var(--c-neutral-900)); }
</style>
