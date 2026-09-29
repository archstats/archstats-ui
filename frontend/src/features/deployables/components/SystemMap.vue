<template>
  <!-- The running system as a container diagram: what calls in on the left,
       what the system rests on at the right, and outside the workspace past
       the last column. A deployable's glyph says what it is (image, app,
       function, mobile app), its bar how much code it carries. Calls are
       solid ink, messages dashed violet, data dotted blue, and a join made
       on a name alone is drawn faint, so weak evidence looks weak. A click
       selects and never navigates. -->
  <ExhibitFrame :exhibit="figure">
  <div class="relative flex flex-col">
  <div class="overflow-x-auto" @click.self="emit('select', null)">
    <div class="flex min-w-full" @click.self="emit('select', null)">
      <svg ref="svgEl" :width="width" :height="height" class="mx-auto block shrink-0 select-none" role="img" :aria-label="`Map of ${nodes.length} deployables and what they talk to`" @click.self="emit('select', null)">
        <defs>
          <marker v-for="k in MARKERS" :id="`${uid}-${k.id}`" :key="k.id" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" :class="k.cls"/>
          </marker>
        </defs>

        <text v-for="(t, i) in columnTitles" :key="'h' + i" :x="xOf(i)" :y="18" class="fill-neutral-500 text-[11px] font-medium">{{ t }}</text>

        <g v-for="e in drawn" :key="e.key" :class="{ 'opacity-15': e.dim }">
          <path
            :d="e.d" fill="none" :stroke-width="e.lit ? 1.75 : 1.25"
            :class="e.cls" :stroke-dasharray="e.dash" :stroke-opacity="e.weak && !e.lit ? 0.45 : 1"
            :marker-end="`url(#${uid}-${e.marker})`"
          ><title>{{ e.title }}</title></path>
        </g>

        <g
          v-for="n in placed" :key="n.id" :transform="`translate(${n.x},${n.y})`"
          class="cursor-pointer" :class="{ 'opacity-25': n.dim }"
          role="button" :aria-pressed="selected === n.id" :aria-label="n.aria"
          @click.stop="!n.external && emit('select', n.id)" @mouseenter="hovered = n.id" @mouseleave="hovered = null"
        >
          <rect
            :width="NODE_W" :height="NODE_H" rx="5"
            :class="n.external ? 'fill-transparent stroke-neutral-300' : selected === n.id ? 'fill-accent-50 stroke-accent-500' : n.tint ? 'hover:stroke-neutral-500' : n.empty ? 'fill-neutral-50 stroke-neutral-300' : 'fill-surface stroke-neutral-300 hover:stroke-neutral-500'"
            :style="n.tint && selected !== n.id ? { fill: n.tint.fill, stroke: n.tint.stroke } : undefined"
            :stroke-width="selected === n.id ? 1.75 : 1" :stroke-dasharray="n.external ? '4 3' : undefined"
          />
          <component :is="n.glyph" :x="10" :y="9" :size="14" :stroke-width="1.75" :class="n.external ? 'text-neutral-400' : 'text-neutral-500'"/>
          <text :x="30" :y="20" class="font-mono text-[12px] font-medium" :class="n.external ? 'fill-neutral-600' : 'fill-neutral-900'">{{ n.label }}</text>
          <text :x="30" :y="35" class="text-[11px]" :class="n.external ? 'fill-neutral-400' : n.drift ? 'fill-neutral-900 font-medium' : 'fill-neutral-500'">{{ n.sub }}</text>
          <rect v-if="!n.external" :x="10" :y="NODE_H - 5" :width="NODE_W - 20" height="2" rx="1" class="fill-neutral-100"/>
          <rect v-if="!n.external && n.share" :x="10" :y="NODE_H - 5" :width="Math.max(2, (NODE_W - 20) * n.share)" height="2" rx="1" class="fill-neutral-500"/>
          <title>{{ n.aria }}</title>
        </g>
      </svg>
    </div>
  </div>
  </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { useSvgFigure } from "~/features/export/useExportables"
import type { LegendItem } from "~/features/export/figure"
import { AppWindow, Box, Database, FunctionSquare, Globe, MessagesSquare, Smartphone } from "lucide-vue-next"
import { arrangeMap, LINK_LABEL, RESOLUTION_LABEL, KIND_LABEL, type DeployableModel } from "../deployables"

const props = withDefaults(defineProps<{
  model: DeployableModel
  selected: string | null
  /** Deployables a pipeline or an environment picked in the lane; the rest fade. */
  highlight?: ReadonlySet<string> | null
  /** What the node fill says: nothing but selection, or the runtime family (versions of one family apart). */
  mark?: "kind" | "runtime"
}>(), { highlight: null, mark: "kind" })
const emit = defineEmits<{ (e: "select", id: string | null): void }>()

const uid = `sm${Math.random().toString(36).slice(2, 8)}`
const NODE_W = 188, NODE_H = 46, COL = 250, ROW = 60, PAD = 20, TOP = 30
const KINDS = new Set(["calls", "messages", "uses_datastore"])
const EDGE_STYLE: Record<string, { cls: string; dash?: string; marker: string }> = {
  calls: { cls: "stroke-neutral-400", marker: "call" },
  messages: { cls: "stroke-violet-500", dash: "6 4", marker: "msg" },
  uses_datastore: { cls: "stroke-blue-500", dash: "1.5 3", marker: "data" },
}
const MARKERS = [
  { id: "call", cls: "fill-neutral-400" }, { id: "on", cls: "fill-neutral-800" },
  { id: "msg", cls: "fill-violet-500" }, { id: "data", cls: "fill-blue-500" },
]
const KEY = [
  { label: "Calls", token: "neutral-500" },
  { label: "Messages", token: "violet-500", dash: "6 4" },
  { label: "Uses a datastore", token: "blue-500", dash: "1.5 3" },
]
const GLYPH: Record<string, Component> = { image: Box, app: AppWindow, function: FunctionSquare, mobile_app: Smartphone }
const EXTERNAL_GLYPH: Record<string, Component> = { data: Database, broker: MessagesSquare, service: Globe }
const EXTERNAL_WORDS: Record<string, string> = { data: "datastore, not built here", broker: "broker, not built here", service: "not built here" }

const svgEl = ref<SVGSVGElement | null>(null)

// Runtime families, most used first; four get a hue, the rest stay neutral.
const RUNTIME_HUES = ["blue", "green", "violet", "amber"]
const family = (r: string) => r.split(/[\s@:]/)[0].toLowerCase()
const runtimes = computed(() => {
  const by = new Map<string, Set<string>>()
  const count = new Map<string, number>()
  for (const d of props.model.deployables) {
    if (!d.runtime) continue
    const f = family(d.runtime)
    by.set(f, (by.get(f) ?? new Set()).add(d.runtime))
    count.set(f, (count.get(f) ?? 0) + 1)
  }
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return ranked.map(([f, n], i) => ({ family: f, count: n, versions: [...by.get(f)!].sort(), hue: RUNTIME_HUES[i] ?? "neutral" }))
})
const runtimeOf = computed(() => new Map(runtimes.value.map(r => [r.family, r])))

const legend = computed(() => {
  const items: LegendItem[] = [
    ...KEY.map(k => ({ label: k.label, color: `rgb(var(--c-${k.token}))`, mark: (k.dash ? "dashed" : "line") as LegendItem["mark"] })),
    { label: "Joined by name only", color: "rgb(var(--c-neutral-300))", mark: "line", title: "The join rests on a name alone, so it is drawn faint" },
    { label: "Not built here", color: "rgb(var(--c-neutral-400))", mark: "ring" },
  ]
  if (props.mark === "runtime") {
    for (const r of runtimes.value) items.push({ label: r.versions.length > 1 ? `${r.family}: ${r.versions.length} versions` : r.versions[0], color: `rgb(var(--c-${r.hue}-${r.hue === "neutral" ? 300 : 400}))`, count: r.count, title: r.versions.join(", ") })
  }
  return { items, notes: ["Columns count call steps from what nothing calls; a bar under a name is the production code it carries, on a square-root scale. Links are what configuration names, not observed traffic."] }
})
const figure = useSvgFigure({ title: "What it is configured to call", svg: () => svgEl.value, legend: () => legend.value })

const arranged = computed(() => arrangeMap(props.model, KINDS))
const byId = computed(() => new Map(props.model.deployables.map(d => [d.id, d])))
const nodes = computed(() => arranged.value.columns.flat())
const tallest = computed(() => Math.max(1, ...arranged.value.columns.map(c => c.length)))
const width = computed(() => PAD * 2 + Math.max(1, arranged.value.columns.length - 1) * COL + NODE_W)
const height = computed(() => TOP + tallest.value * ROW + PAD)
const xOf = (col: number) => PAD + col * COL

const columnTitles = computed(() => arranged.value.columns.map((col, i) => {
  if (col.every(id => arranged.value.external.has(id))) return "Outside this workspace"
  return i === 0 ? "Nothing calls these" : `${i} step${i > 1 ? "s" : ""} in`
}))

const maxFiles = computed(() => Math.max(1, ...props.model.deployables.map(d => d.files)))
const hovered = ref<string | null>(null)
const focusId = computed(() => hovered.value ?? props.selected)
const neighbours = computed(() => {
  const s = focusId.value
  if (!s) return null
  const set = new Set([s])
  for (const e of arranged.value.edges) { if (e.from === s) set.add(e.to); if (e.to === s) set.add(e.from) }
  return set
})
const isDim = (id: string) => (props.highlight ? !props.highlight.has(id) : !!neighbours.value && !neighbours.value.has(id))

const placed = computed(() => arranged.value.columns.flatMap((col, c) => {
  const offset = ((tallest.value - col.length) * ROW) / 2
  return col.map((id, r) => {
    const d = byId.value.get(id)
    const ext = arranged.value.external.get(id)
    const kind = d ? KIND_LABEL[d.kind] ?? d.kind : ""
    const sub = ext ? EXTERNAL_WORDS[ext] : d!.files ? `${d!.runtime || kind} · ${d!.files.toLocaleString("en-US")} files` : `${d!.runtime || kind} · no code of its own`
    const rt = props.mark === "runtime" && d?.runtime ? runtimeOf.value.get(family(d.runtime)) : undefined
    return {
      id, x: xOf(c), y: TOP + offset + r * ROW,
      external: !!ext, empty: !!d && !d.files,
      tint: rt ? { fill: `rgb(var(--c-${rt.hue}-${rt.hue === "neutral" ? 100 : 50}))`, stroke: `rgb(var(--c-${rt.hue}-${rt.hue === "neutral" ? 300 : 400}))` } : null,
      drift: !!rt && rt.versions.length > 1,
      glyph: ext ? EXTERNAL_GLYPH[ext] : GLYPH[d!.kind] ?? Box,
      label: id.length > 22 ? id.slice(0, 21) + "…" : id,
      sub, share: d ? Math.sqrt(d.files / maxFiles.value) : 0,
      dim: isDim(id),
      aria: ext ? `${id}: ${EXTERNAL_WORDS[ext]}` : `${id}: ${kind}${d!.runtime ? ", " + d!.runtime : ""}, ${d!.files} production files`,
    }
  })
}))

const drawn = computed(() => {
  const at = new Map(placed.value.map(n => [n.id, n]))
  // Spread the lines leaving and entering a node over its edge, in the
  // order of where they go, so a busy service does not grow a single knot.
  const outs = new Map<string, string[]>(), ins = new Map<string, string[]>()
  const keyOf = (e: { from: string; to: string; kind: string }) => `${e.from}>${e.to}>${e.kind}`
  for (const e of arranged.value.edges) {
    outs.set(e.from, [...(outs.get(e.from) ?? []), keyOf(e)])
    ins.set(e.to, [...(ins.get(e.to) ?? []), keyOf(e)])
  }
  const yAt = (list: string[] | undefined, key: string, top: number) => {
    const l = list ?? [key]
    const i = l.indexOf(key)
    return l.length === 1 ? top + NODE_H / 2 : top + 10 + ((NODE_H - 20) * i) / (l.length - 1)
  }
  const sortBy = (m: Map<string, string[]>, end: (k: string) => string) => {
    for (const [id, l] of m) m.set(id, l.slice().sort((a, b) => (at.get(end(a))?.y ?? 0) - (at.get(end(b))?.y ?? 0)))
  }
  sortBy(outs, k => k.split(">")[1])
  sortBy(ins, k => k.split(">")[0])
  return arranged.value.edges.flatMap(e => {
    const a = at.get(e.from), b = at.get(e.to)
    if (!a || !b) return []
    const key = keyOf(e)
    const style = EDGE_STYLE[e.kind] ?? EDGE_STYLE.calls
    const lit = !!focusId.value && (e.from === focusId.value || e.to === focusId.value)
    const x1 = a.x + NODE_W, y1 = yAt(outs.get(e.from), key, a.y)
    let d: string
    if (b.x > a.x) {
      const x2 = b.x - 1, y2 = yAt(ins.get(e.to), key, b.y), mid = (x1 + x2) / 2
      d = `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`
    } else {
      // A call back to an earlier column loops under its target.
      const x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H + 1
      d = `M${x1},${y1} C${x1 + 70},${y1} ${x2},${y2 + 70} ${x2},${y2}`
    }
    const dim = props.highlight ? !(props.highlight.has(e.from) && props.highlight.has(e.to)) : !!focusId.value && !lit
    return [{
      key, d, dim, lit, weak: e.weak, dash: style.dash,
      cls: lit && e.kind === "calls" ? "stroke-neutral-800" : style.cls,
      marker: lit && e.kind === "calls" ? "on" : style.marker,
      title: `${e.from} ${(LINK_LABEL[e.kind] ?? e.kind).toLowerCase()} ${e.to} via ${e.link.via}\n${e.link.file}:${e.link.line}\n${RESOLUTION_LABEL[e.link.resolution] ?? e.link.resolution}`,
    }]
  })
})

defineExpose({ isolated: computed(() => arranged.value.isolated) })
</script>
