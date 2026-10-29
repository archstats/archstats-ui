<template>
  <!-- A pipeline drawn the way it runs: what starts it, its jobs by how many
       others they wait for, what each runs, and what comes out. A click
       selects; the inspector says the rest. -->
  <div class="relative" :style="{ width: `${layout.width}px`, height: `${layout.height + HEAD}px` }" role="figure" :aria-label="t('cicd.graph.figure', { name })">
    <span v-if="layout.triggers.length" class="ui-label absolute" :style="{ left: `${G.pad}px`, top: '2px' }">{{ t('cicd.graph.starts') }}</span>
    <span v-if="layout.outputs.length" class="ui-label absolute" :style="{ left: `${layout.outputs[0].x}px`, top: '2px' }">{{ t('cicd.graph.produces') }}</span>

    <svg class="pointer-events-none absolute left-0" :style="{ top: `${HEAD}px` }" :width="layout.width" :height="layout.height" aria-hidden="true">
      <path
        v-for="e in layout.edges" :key="e.key" :d="e.d" fill="none"
        :class="lit(e) ? 'stroke-accent-500' : e.kind === 'produces' ? 'stroke-neutral-300' : 'stroke-neutral-400'"
        :stroke-width="lit(e) ? 1.75 : 1.25" :stroke-dasharray="e.kind === 'produces' ? '3 3' : undefined"
      />
    </svg>

    <div class="absolute left-0" :style="{ top: `${HEAD}px` }">
      <button
        v-for="(b, i) in layout.triggers" :key="`t${i}`" type="button"
        class="absolute flex items-center gap-1.5 rounded px-2 text-left text-xs ring-1"
        :class="selected === `trigger:${i}` ? 'bg-accent-50 ring-accent-400' : 'bg-surface ring-neutral-200 hover:ring-neutral-400'"
        :style="box(b)" :title="b.trigger.filter"
        @click="emit('select', `trigger:${i}`)"
      >
        <Icon :icon="EVENT_ICON[b.trigger.event] ?? 'play'" :size="12" class="shrink-0 text-neutral-500"/>
        <span class="shrink-0 text-neutral-800">{{ t(`cicd.events.${b.trigger.event}`) }}</span>
        <span class="min-w-0 truncate font-mono text-[11px] text-neutral-500">{{ b.trigger.filter }}</span>
      </button>

      <div
        v-for="c in layout.cards" :key="c.job.id"
        class="absolute flex flex-col overflow-hidden rounded-md bg-surface text-left ring-1"
        :class="selected === `job:${c.job.id}` ? 'ring-2 ring-accent-500' : isNeighbour(c.job.id) ? 'ring-accent-300' : 'ring-neutral-200 hover:ring-neutral-400'"
        :style="box(c)"
      >
        <button type="button" class="flex min-w-0 flex-col gap-0.5 px-2.5 pb-1 pt-1.5 text-left" @click="emit('select', `job:${c.job.id}`)">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900" :title="c.job.name">{{ c.job.name }}</span>
            <span v-if="c.job.matrix" class="ui-tag shrink-0 !px-1 !py-0 font-mono !text-[10.5px]" :title="c.job.matrix < 0 ? t('cicd.graph.matrixEachTitle') : t('cicd.graph.matrixTitle', { count: c.job.matrix })">{{ c.job.matrix < 0 ? t('cicd.graph.matrixEach') : t('cicd.graph.matrix', { count: c.job.matrix }) }}</span>
            <span v-if="c.job.environment" class="ui-tag shrink-0 !px-1 !py-0 !text-[10.5px]" :class="isProd(c.job.environment) ? '!bg-accent-50 !text-accent-700' : ''" :title="c.job.environment">{{ c.job.environment }}</span>
            <Icon v-if="c.job.gate" :icon="c.job.gate === 'environment' ? 'lock' : 'hand'" :size="12" class="shrink-0 text-green-700" :title="t(`cicd.graph.gate.${c.job.gate}`)"/>
          </span>
          <span class="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
            <span v-if="c.job.group" class="shrink-0 truncate" :title="c.job.group">{{ c.job.group }}</span>
            <span v-if="c.job.group && c.job.runner" class="text-neutral-300">·</span>
            <span class="min-w-0 truncate font-mono" :title="c.job.runner">{{ c.job.runner }}</span>
            <Icon v-if="c.job.condition" icon="filter" :size="10" class="ml-auto shrink-0 text-neutral-400" :title="t('cicd.graph.condition', { cond: c.job.condition })"/>
          </span>
        </button>
        <button
          v-for="s in c.steps" :key="s.index" type="button"
          class="flex h-[21px] min-w-0 items-center gap-1.5 px-2.5 text-left"
          :class="selected === `step:${c.job.id}:${s.index}` ? 'bg-accent-50' : 'hover:bg-neutral-100'"
          :title="s.text"
          @click="emit('select', `step:${c.job.id}:${s.index}`)"
        >
          <span class="h-[7px] w-[7px] shrink-0 rounded-[2px]" :class="VERB_TONE[s.verb] ?? 'bg-neutral-200'" :title="t(`cicd.verbs.${s.verb}`)"></span>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px]" :class="s.verb === 'other' || s.verb === 'checkout' || s.verb === 'setup' ? 'text-neutral-500' : 'text-neutral-800'">{{ s.name || s.text }}</span>
        </button>
        <span v-if="c.more" class="flex h-5 items-center px-2.5 text-[11px] text-neutral-500">{{ t('cicd.graph.more', { count: c.more }) }}</span>
        <button
          v-for="h in c.handoffs" :key="h.kind + h.target + h.line" type="button"
          class="mx-1.5 mb-1 flex h-[20px] min-w-0 items-center gap-1.5 rounded border border-dashed px-1.5 text-left"
          :class="selected === `handoff:${handoffIndex(h)}` ? 'border-accent-500 bg-accent-50' : 'border-neutral-300 hover:border-neutral-500'"
          :title="`${t(`cicd.handoffs.${h.kind}`)}: ${h.target}${h.ref ? '@' + h.ref : ''}`"
          @click="emit('select', `handoff:${handoffIndex(h)}`)"
        >
          <Icon icon="arrow-up-right" :size="11" class="shrink-0 text-neutral-500"/>
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-700">{{ h.target }}</span>
          <span v-if="h.pinned === 'branch' || h.pinned === 'none'" class="shrink-0 text-[10px] text-amber-700">{{ h.ref || '—' }}</span>
          <span v-else-if="h.ref && h.pinned !== 'implicit'" class="max-w-[60px] shrink-0 truncate font-mono text-[10px] text-neutral-500">{{ h.ref }}</span>
        </button>
      </div>

      <div
        v-for="(p, i) in layout.placeholders" :key="`u${i}`"
        class="hatched absolute flex flex-col justify-center gap-0.5 rounded-md px-2.5 text-xs ring-1 ring-dashed ring-amber-300"
        :style="box(p)"
      >
        <span class="font-medium text-amber-800">{{ t('cicd.graph.notReadHere') }} · {{ p.unread.from_line }}–{{ p.unread.to_line }}</span>
        <span class="text-neutral-600">{{ t(`cicd.unread.${p.unread.reason}`) }}</span>
      </div>

      <button
        v-for="o in layout.outputs" :key="o.key" type="button"
        class="absolute flex flex-col justify-center rounded-md px-2.5 text-left ring-1"
        :class="selected === `output:${o.key}` ? 'bg-accent-50 ring-2 ring-accent-500' : 'bg-ground ring-neutral-200 hover:ring-neutral-400'"
        :style="box(o)"
        @click="emit('select', `output:${o.key}`)"
      >
        <span class="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
          <Icon :icon="OUTPUT_ICON[o.outputs[0].kind] ?? 'package'" :size="12" class="shrink-0"/>
          <span>{{ t(`cicd.outputs.${o.outputs[0].kind}`) }}</span>
          <span v-if="o.outputs[0].platform" class="truncate">· {{ o.outputs[0].platform }}</span>
          <span v-if="o.outputs[0].environment" class="ml-auto shrink-0 ui-tag !px-1 !py-0 !text-[10.5px]" :class="isProd(o.outputs[0].environment) ? '!bg-accent-50 !text-accent-700' : ''">{{ o.outputs[0].environment }}</span>
        </span>
        <span class="min-w-0 truncate font-mono text-[12px]" :class="o.outputs[0].artifact ? 'text-neutral-900' : 'text-neutral-600'" :title="o.outputs[0].target">{{ o.outputs[0].artifact || o.outputs[0].target }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { G, layoutPipeline, needsOf, type Edge } from "../layout"
import { VERB_TONE } from "../verbs"
import type { CicdIndex, Handoff } from "../cicd"
import { PRODUCTION_NAMES } from "../flags"
import { t } from "~/shared/i18n"

const props = defineProps<{ ix: CicdIndex; pipeline: string; name: string; selected: string | null }>()
const emit = defineEmits<{ select: [key: string] }>()

/** Room above the drawing for the column labels. */
const HEAD = 20

const layout = computed(() => layoutPipeline(props.ix, props.pipeline))
const handoffs = computed(() => props.ix.handoffsOf.get(props.pipeline) ?? [])
const handoffIndex = (h: Handoff) => handoffs.value.indexOf(h)

const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })
const isProd = (env: string) => PRODUCTION_NAMES.some(n => env.toLowerCase().split(/[\s|()]+/).includes(n))

const selectedJob = computed(() => {
  const s = props.selected ?? ""
  if (s.startsWith("job:")) return s.slice(4)
  if (s.startsWith("step:")) return s.slice(5, s.lastIndexOf(":"))
  return null
})
/** The jobs the selected one waits for and those waiting for it. */
const neighbours = computed(() => {
  const id = selectedJob.value
  const out = new Set<string>()
  if (!id) return out
  for (const c of layout.value.cards) {
    if (c.job.id === id) needsOf(c.job).forEach(n => out.add(n))
    if (needsOf(c.job).includes(id)) out.add(c.job.id)
  }
  return out
})
const isNeighbour = (id: string) => neighbours.value.has(id)
const lit = (e: Edge) => !!selectedJob.value && (e.from === selectedJob.value || e.to === selectedJob.value)

const EVENT_ICON: Record<string, string> = { push: "git-commit", pull_request: "git-pull-request", tag: "tag", schedule: "clock", manual: "hand", called: "arrow-right", upstream: "network", other: "play" }
const OUTPUT_ICON: Record<string, string> = { image: "container", build: "hammer", package: "package", release: "tag", deploy: "rocket" }
</script>

<style scoped>
.hatched {
  background-image: repeating-linear-gradient(135deg, rgb(var(--c-amber-100, 254 243 199) / 0.6) 0 6px, transparent 6px 12px);
}
.ring-dashed { --tw-ring-offset-width: 0; outline: 1px dashed currentColor; outline-offset: -1px; }
</style>
