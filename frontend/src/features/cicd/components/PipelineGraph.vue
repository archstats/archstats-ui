<template>
  <!-- A pipeline drawn the way it runs: what starts it, its jobs by how many
       others they wait for, what each runs, and what comes out. One SVG in
       the theme's colours, so it exports as drawn. A click selects; the
       inspector says the rest. -->
  <ExhibitFrame :exhibit="figure" header-class="pb-2">
    <svg
      ref="svg" :width="layout.width" :height="layout.height + HEAD" :viewBox="`0 0 ${layout.width} ${layout.height + HEAD}`"
      role="img" :aria-label="t('cicd.graph.figure', { name })" :font-family="th.fontSans" class="select-none"
    >
      <defs>
        <pattern :id="`hatch-${uid}`" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" :fill="th.surface"/>
          <line x1="0" y1="0" x2="0" y2="8" :stroke="th.amberSoft" stroke-width="4"/>
        </pattern>
      </defs>
      <rect :width="layout.width" :height="layout.height + HEAD" :fill="th.ground"/>

      <text v-if="layout.triggers.length" :x="G.pad" y="13" font-size="10.5" font-weight="600" letter-spacing="0.4" :fill="th.inkMuted">{{ t('cicd.graph.starts').toUpperCase() }}</text>
      <text v-if="layout.outputs.length" :x="layout.outputs[0].x" y="13" font-size="10.5" font-weight="600" letter-spacing="0.4" :fill="th.inkMuted">{{ t('cicd.graph.produces').toUpperCase() }}</text>

      <g :transform="`translate(0, ${HEAD})`">
        <path
          v-for="e in layout.edges" :key="e.key" :d="e.d" fill="none"
          :stroke="lit(e) ? th.accent : e.kind === 'produces' ? th.hairlineStrong : th.inkMuted"
          :stroke-width="lit(e) ? 1.75 : 1.1" :stroke-dasharray="e.kind === 'produces' ? '3 3' : undefined" :opacity="lit(e) ? 1 : 0.7"
        />

        <g v-for="(b, i) in layout.triggers" :key="`t${i}`" class="cursor-pointer" @click="emit('select', `trigger:${i}`)">
          <title>{{ t(`cicd.events.${b.trigger.event}`) }}{{ b.trigger.filter ? ` · ${b.trigger.filter}` : '' }}</title>
          <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="4" :fill="selected === `trigger:${i}` ? th.accentSoft : th.surface" :stroke="selected === `trigger:${i}` ? th.accent : th.hairlineStrong"/>
          <text :x="b.x + 8" :y="b.y + b.h / 2" dominant-baseline="central" font-size="11.5" :fill="th.ink">{{ t(`cicd.events.${b.trigger.event}`) }}</text>
          <text :x="b.x + 8 + textW(t(`cicd.events.${b.trigger.event}`), 6.4) + 6" :y="b.y + b.h / 2" dominant-baseline="central" font-size="10.5" :font-family="th.fontMono" :fill="th.inkMuted">{{ clip(b.trigger.filter, Math.floor((b.w - 22 - textW(t(`cicd.events.${b.trigger.event}`), 6.4)) / 6.2)) }}</text>
        </g>

        <g v-for="c in layout.cards" :key="c.job.id">
          <rect
            :x="c.x" :y="c.y" :width="c.w" :height="c.h" rx="6" :fill="th.surface"
            :stroke="selected === `job:${c.job.id}` ? th.accent : isNeighbour(c.job.id) ? th.accent : th.hairlineStrong"
            :stroke-width="selected === `job:${c.job.id}` ? 2 : 1" :stroke-opacity="isNeighbour(c.job.id) && selected !== `job:${c.job.id}` ? 0.5 : 1"
          />
          <g class="cursor-pointer" @click="emit('select', `job:${c.job.id}`)">
            <title>{{ c.job.name }}{{ c.job.condition ? `\n${t('cicd.graph.condition', { cond: c.job.condition })}` : '' }}{{ c.job.gate ? `\n${t(`cicd.graph.gate.${c.job.gate}`)}` : '' }}</title>
            <rect :x="c.x" :y="c.y" :width="c.w" height="42" fill="transparent"/>
            <text :x="c.x + 10" :y="c.y + 17" font-size="12.5" font-weight="600" :fill="th.ink">{{ clip(c.job.name, Math.floor((c.w - 20 - badgesW(c)) / 7)) }}</text>
            <g v-for="b in badges(c)" :key="b.key">
              <rect :x="b.x" :y="c.y + 7" :width="b.w" height="15" rx="3" :fill="b.prod ? th.accentSoft : th.ground" :stroke="b.prod ? th.accent : th.hairline"/>
              <text :x="b.x + b.w / 2" :y="c.y + 14.5" dominant-baseline="central" text-anchor="middle" font-size="9.5" :font-family="b.mono ? th.fontMono : th.fontSans" :fill="b.prod ? th.accent : th.inkSecondary">{{ b.text }}</text>
            </g>
            <text :x="c.x + 10" :y="c.y + 34" font-size="10" :font-family="th.fontMono" :fill="th.inkMuted">{{ clip(metaOf(c), Math.floor((c.w - 20) / 6)) }}</text>
          </g>
          <g v-for="(s, i) in c.steps" :key="s.index" class="cursor-pointer" @click="emit('select', `step:${c.job.id}:${s.index}`)">
            <title>{{ t(`cicd.verbs.${s.verb}`) }}: {{ s.text }}</title>
            <rect :x="c.x + 1" :y="c.y + G.head + i * G.stepH - 2" :width="c.w - 2" :height="G.stepH" :fill="selected === `step:${c.job.id}:${s.index}` ? th.accentSoft : 'transparent'"/>
            <rect :x="c.x + 10" :y="c.y + G.head + i * G.stepH + G.stepH / 2 - 5.5" width="7" height="7" rx="1.5" :fill="verbColour(s.verb)"/>
            <text :x="c.x + 23" :y="c.y + G.head + i * G.stepH + G.stepH / 2 - 2" dominant-baseline="central" font-size="10.5" :font-family="th.fontMono" :fill="quiet(s.verb) ? th.inkMuted : th.ink">{{ clip(s.name || s.text, Math.floor((c.w - 33) / 6.3)) }}</text>
          </g>
          <text v-if="c.more" :x="c.x + 10" :y="c.y + G.head + c.steps.length * G.stepH + 10" font-size="10.5" :fill="th.inkMuted">{{ t('cicd.graph.more', { count: c.more }) }}</text>
          <g
            v-for="(h, i) in c.handoffs" :key="h.kind + h.target + h.line" class="cursor-pointer"
            @click="emit('select', `handoff:${handoffIndex(h)}`)"
          >
            <title>{{ t(`cicd.handoffs.${h.kind}`) }}: {{ h.target }}{{ h.ref ? '@' + h.ref : '' }}{{ h.pinned ? ` (${t(`cicd.pins.${h.pinned}`)})` : '' }}</title>
            <rect
              :x="c.x + 6" :y="handoffY(c, i)" :width="c.w - 12" height="19" rx="3"
              :fill="selected === `handoff:${handoffIndex(h)}` ? th.accentSoft : th.surface"
              :stroke="selected === `handoff:${handoffIndex(h)}` ? th.accent : th.hairlineStrong" stroke-dasharray="3 2"
            />
            <text :x="c.x + 13" :y="handoffY(c, i) + 9.5" dominant-baseline="central" font-size="10.5" :font-family="th.fontMono" :fill="th.inkSecondary">↗ {{ clip(h.target, Math.floor((c.w - 30 - refW(h)) / 6.3)) }}</text>
            <text v-if="refText(h)" :x="c.x + c.w - 12" :y="handoffY(c, i) + 9.5" dominant-baseline="central" text-anchor="end" font-size="9.5" :font-family="th.fontMono" :fill="h.pinned === 'branch' || h.pinned === 'none' ? th.amber : th.inkMuted">{{ refText(h) }}</text>
          </g>
        </g>

        <g v-for="(p, i) in layout.placeholders" :key="`u${i}`">
          <title>{{ t(`cicd.unread.${p.unread.reason}`) }}</title>
          <rect :x="p.x" :y="p.y" :width="p.w" :height="p.h" rx="6" :fill="`url(#hatch-${uid})`" :stroke="th.amber" stroke-dasharray="4 3"/>
          <text :x="p.x + 10" :y="p.y + 22" font-size="11.5" font-weight="600" :fill="th.amber">{{ t('cicd.graph.notReadHere') }} · {{ p.unread.from_line }}–{{ p.unread.to_line }}</text>
          <text :x="p.x + 10" :y="p.y + 42" font-size="10.5" :fill="th.inkSecondary">{{ clip(t(`cicd.unread.${p.unread.reason}`), Math.floor((p.w - 20) / 5.6)) }}</text>
        </g>

        <g v-for="o in layout.outputs" :key="o.key" class="cursor-pointer" @click="emit('select', `output:${o.key}`)">
          <title>{{ t(`cicd.outputs.${o.outputs[0].kind}`) }}: {{ o.outputs[0].target }}{{ o.outputs[0].environment ? ` → ${o.outputs[0].environment}` : '' }}</title>
          <rect :x="o.x" :y="o.y" :width="o.w" :height="o.h" rx="5" :fill="selected === `output:${o.key}` ? th.accentSoft : th.surface" :stroke="selected === `output:${o.key}` ? th.accent : th.hairlineStrong" :stroke-width="selected === `output:${o.key}` ? 2 : 1"/>
          <text :x="o.x + 10" :y="o.y + 14" font-size="10" :fill="th.inkMuted">{{ outputLabel(o.outputs[0]) }}</text>
          <g v-if="o.outputs[0].environment">
            <rect :x="o.x + o.w - envW(o.outputs[0].environment) - 8" :y="o.y + 5" :width="envW(o.outputs[0].environment)" height="14" rx="3" :fill="isProd(o.outputs[0].environment) ? th.accentSoft : th.ground" :stroke="isProd(o.outputs[0].environment) ? th.accent : th.hairline"/>
            <text :x="o.x + o.w - envW(o.outputs[0].environment) / 2 - 8" :y="o.y + 12" dominant-baseline="central" text-anchor="middle" font-size="9.5" :fill="isProd(o.outputs[0].environment) ? th.accent : th.inkSecondary">{{ o.outputs[0].environment }}</text>
          </g>
          <text :x="o.x + 10" :y="o.y + 30" font-size="11.5" :font-family="th.fontMono" :fill="o.outputs[0].artifact ? th.ink : th.inkSecondary">{{ clip(o.outputs[0].artifact || o.outputs[0].target, Math.floor((o.w - 20) / 6.8)) }}</text>
        </g>
      </g>
    </svg>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { useSvgFigure } from "~/features/export/useExportables"
import { chartTheme } from "~/shared/ui/useChartTheme"
import { G, layoutPipeline, needsOf, type Card, type Edge } from "../layout"
import type { CicdIndex, Handoff, Output } from "../cicd"
import { PRODUCTION_NAMES } from "../flags"
import { t } from "~/shared/i18n"

const props = defineProps<{ ix: CicdIndex; pipeline: string; name: string; selected: string | null }>()
const emit = defineEmits<{ select: [key: string] }>()

/** Room above the drawing for the column labels. */
const HEAD = 20
const uid = Math.random().toString(36).slice(2, 8)
const svg = ref<SVGSVGElement | null>(null)
const th = computed(() => chartTheme())

const layout = computed(() => layoutPipeline(props.ix, props.pipeline))
const handoffs = computed(() => props.ix.handoffsOf.get(props.pipeline) ?? [])
const handoffIndex = (h: Handoff) => handoffs.value.indexOf(h)

// ---------------------------------------------------------------------------
// Words and widths. SVG text does not wrap or truncate, so text is clipped to
// the characters that fit, at an average width per character.
// ---------------------------------------------------------------------------

const clip = (s: string, n: number) => (!s ? "" : s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s)
const textW = (s: string, perChar: number) => s.length * perChar
const isProd = (env: string) => PRODUCTION_NAMES.some(n => env.toLowerCase().split(/[\s|()]+/).includes(n))
const envW = (env: string) => Math.min(90, env.length * 5.8 + 10)
const quiet = (verb: string) => verb === "other" || verb === "checkout" || verb === "setup"

const VERB_COLOUR: Record<string, keyof ReturnType<typeof chartTheme>> = {
  build: "inkSecondary", test: "blue", scan: "violet", package: "amberSoft", publish: "amber", deploy: "accent", approve: "green",
}
const verbColour = (verb: string) => (VERB_COLOUR[verb] ? (th.value[VERB_COLOUR[verb]] as string) : th.value.hairlineStrong)

interface Badge { key: string; text: string; x: number; w: number; prod?: boolean; mono?: boolean }
function badges(c: Card): Badge[] {
  const out: Badge[] = []
  let x = c.x + c.w - 8
  const add = (key: string, text: string, opts: Partial<Badge> = {}) => {
    const w = Math.min(84, text.length * 5.6 + 10)
    x -= w
    out.push({ key, text: clip(text, Math.floor((w - 8) / 5.4)), x, w, ...opts })
    x -= 4
  }
  if (c.job.gate) add("gate", t(`cicd.graph.gateTag.${c.job.gate}`))
  if (c.job.environment) add("env", c.job.environment, { prod: isProd(c.job.environment) })
  if (c.job.matrix) add("matrix", c.job.matrix < 0 ? t("cicd.graph.matrixEach") : t("cicd.graph.matrix", { count: c.job.matrix }), { mono: true })
  return out
}
const badgesW = (c: Card) => badges(c).reduce((w, b) => w + b.w + 4, 0)
const metaOf = (c: Card) => [c.job.group, c.job.runner].filter(Boolean).join(" · ")

const handoffY = (c: Card, i: number) => c.y + G.head + c.steps.length * G.stepH + (c.more ? G.moreH : 0) + i * G.handoffH
const refText = (h: Handoff) => (h.pinned === "branch" || h.pinned === "none" ? h.ref || "—" : h.ref && h.pinned !== "implicit" ? clip(h.ref, 10) : "")
const refW = (h: Handoff) => (refText(h) ? refText(h).length * 5.8 + 6 : 0)
const outputLabel = (o: Output) => [t(`cicd.outputs.${o.kind}`), o.platform].filter(Boolean).join(" · ")

// ---------------------------------------------------------------------------
// What the selection lights
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The figure
// ---------------------------------------------------------------------------

const verbsShown = computed(() => {
  const seen = new Set<string>()
  for (const c of layout.value.cards) for (const s of c.steps) if (!quiet(s.verb)) seen.add(s.verb)
  return ["build", "test", "scan", "package", "publish", "deploy", "approve"].filter(v => seen.has(v))
})
const figure = useSvgFigure({
  title: () => t("cicd.graph.figure", { name: props.name }),
  legend: () => ({
    items: verbsShown.value.map(v => ({ label: t(`cicd.verbs.${v}`), color: verbColour(v), mark: "swatch" as const })),
    notes: [t("cicd.graph.legendNeeds"), ...(handoffs.value.length ? [t("cicd.graph.legendHandoff")] : [])],
  }),
  svg: () => svg.value,
})
</script>
