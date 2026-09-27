<template>
  <!-- The deployables left to right, from what nothing calls to what the
       system rests on. A click selects and never navigates. Calls are solid,
       messages dashed and accented, datastores dotted; a line joined only by
       a name is drawn fainter, so the weak evidence looks weak. -->
  <div class="relative min-h-0 grow overflow-auto" @click.self="emit('select', null)">
    <svg :width="width" :height="height" class="block" role="img" :aria-label="`Map of ${nodes.length} deployables and what they talk to`" @click.self="emit('select', null)">
      <defs>
        <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" class="fill-neutral-400"/>
        </marker>
        <marker id="dep-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" class="fill-neutral-800"/>
        </marker>
      </defs>
      <g v-for="(col, i) in columnTitles" :key="'h' + i">
        <text :x="PAD + i * COL" :y="16" class="fill-neutral-400 text-[11px]">{{ col }}</text>
      </g>
      <path
        v-for="e in drawn" :key="e.key" :d="e.d" fill="none"
        :class="[e.lit ? 'stroke-neutral-800' : 'stroke-neutral-300', e.kind === 'messages' ? 'stroke-accent-500' : '', e.dim ? 'opacity-20' : '']"
        :stroke-width="e.lit ? 1.75 : 1.25"
        :stroke-dasharray="e.kind === 'messages' ? '6 4' : e.kind === 'uses_datastore' ? '1.5 3' : e.weak ? '0' : undefined"
        :stroke-opacity="e.weak && !e.lit ? 0.6 : 1"
        :marker-end="e.lit ? 'url(#dep-arrow-on)' : 'url(#dep-arrow)'"
      >
        <title>{{ e.title }}</title>
      </path>
      <g
        v-for="n in placed" :key="n.id" :transform="`translate(${n.x},${n.y})`"
        class="cursor-pointer" :class="n.dim ? 'opacity-30' : ''"
        role="button" :aria-pressed="selected === n.id" :aria-label="n.external ? `${n.id}, not built here` : n.id"
        @click.stop="!n.external && emit('select', n.id)"
      >
        <rect :width="NODE_W" :height="NODE_H" rx="4"
          :class="n.external ? 'fill-transparent stroke-neutral-300' : selected === n.id ? 'fill-neutral-800 stroke-neutral-800' : 'fill-surface stroke-neutral-300 hover:stroke-neutral-500'"
          :stroke-dasharray="n.external ? '3 3' : undefined"/>
        <text :x="10" :y="NODE_H / 2 + 4" class="text-[12px]"
          :class="n.external ? 'fill-neutral-500' : selected === n.id ? 'fill-neutral-50' : 'fill-neutral-800'">{{ n.label }}</text>
        <title>{{ n.external ? `${n.id}: named in configuration, not built in this workspace` : n.id }}</title>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { layoutMap, LINK_LABEL, RESOLUTION_LABEL, type DeployableModel } from "../deployables"

const props = defineProps<{ model: DeployableModel; selected: string | null; kinds: Set<string> }>()
const emit = defineEmits<{ (e: "select", id: string | null): void }>()

const NODE_W = 190, NODE_H = 28, COL = 250, ROW = 40, PAD = 16, TOP = 30

const layout = computed(() => layoutMap(props.model, props.kinds))
const nodes = computed(() => layout.value.nodes)
const width = computed(() => PAD * 2 + Math.max(1, layout.value.columns) * COL)
const height = computed(() => TOP + PAD + Math.max(1, ...nodes.value.map(n => n.row + 1)) * ROW)

const columnTitles = computed(() => {
  const hasExternal = nodes.value.some(n => n.external)
  return Array.from({ length: layout.value.columns }, (_, i) =>
    i === 0 ? "Nothing calls these" : hasExternal && i === layout.value.columns - 1 ? "Not built here" : `${i} step${i > 1 ? "s" : ""} in`)
})

const neighbours = computed(() => {
  const s = props.selected
  if (!s) return null
  const set = new Set([s])
  for (const e of layout.value.edges) {
    if (e.from === s) set.add(e.to)
    if (e.to === s) set.add(e.from)
  }
  return set
})

const placed = computed(() => nodes.value.map(n => ({
  ...n,
  x: PAD + n.column * COL,
  y: TOP + n.row * ROW,
  label: n.id.length > 24 ? n.id.slice(0, 23) + "…" : n.id,
  dim: !!neighbours.value && !neighbours.value.has(n.id),
})))

const drawn = computed(() => {
  const at = new Map(placed.value.map(n => [n.id, n]))
  return layout.value.edges.flatMap((e, i) => {
    const a = at.get(e.from), b = at.get(e.to)
    if (!a || !b) return []
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
    let x2 = b.x, y2 = b.y + NODE_H / 2
    // A call backwards (a cycle) loops round the bottom of the target.
    if (b.column <= a.column) { x2 = b.x + NODE_W / 2; y2 = b.y + NODE_H }
    const mid = (x1 + x2) / 2
    const lit = !!props.selected && (e.from === props.selected || e.to === props.selected)
    return [{
      key: `${e.from}>${e.to}>${e.kind}>${i}`,
      d: b.column <= a.column ? `M${x1},${y1} C${x1 + 60},${y1} ${x2},${y2 + 60} ${x2},${y2}` : `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 2},${y2}`,
      kind: e.kind, weak: e.weak, lit,
      dim: !!props.selected && !lit,
      title: `${e.from} ${(LINK_LABEL[e.kind] ?? e.kind).toLowerCase()} ${e.to} via ${e.link.via}\n${e.link.file}:${e.link.line}\n${RESOLUTION_LABEL[e.link.resolution] ?? e.link.resolution}`,
    }]
  })
})
</script>
