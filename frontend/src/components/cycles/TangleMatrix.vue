<template>
  <!-- The same tangle as a matrix, in the same order: row imports column.
       With the levels, every import sits above the diagonal; the ones below
       it run back against the levels and make the cycles. Levels are the
       blocks along the diagonal. Reads a 150-component tangle whole. -->
  <div ref="host" class="relative h-full w-full overflow-auto" @mouseleave="hover = null">
    <svg ref="svgRef" :width="w" :height="h" class="block select-none" role="img" :aria-label="`Matrix of a tangle of ${n} components`">
      <rect :width="w" :height="h" :fill="t.surface"/>
      <g :transform="`translate(${LABEL + 8},${HEAD})`">
        <!-- Levels: a block per level along the diagonal. -->
        <rect v-for="b in blocks" :key="`b${b.i}`" :x="b.start * s" :y="b.start * s" :width="b.len * s" :height="b.len * s" :fill="t.ground" :stroke="t.hairline" stroke-width="1"/>
        <!-- The row and column under the pointer. -->
        <template v-if="hover">
          <rect :x="0" :y="hover.r * s" :width="n * s" :height="s" :fill="t.accentSoft" opacity="0.28"/>
          <rect :x="hover.c * s" :y="0" :width="s" :height="n * s" :fill="t.accentSoft" opacity="0.28"/>
        </template>
        <line :x1="0" :y1="0" :x2="n * s" :y2="n * s" :stroke="t.hairlineStrong" stroke-width="1"/>
        <g v-for="c in cells" :key="c.key" class="cursor-pointer" @mouseenter="hover = { r: c.r, c: c.c, text: c.title }" @click="c.against ? $emit('selectEdge', c.from, c.to) : $emit('selectNode', c.from)">
          <rect
            :x="c.c * s + 0.5"
            :y="c.r * s + 0.5"
            :width="s - 1"
            :height="s - 1"
            :rx="Math.min(2, s / 5)"
            :fill="c.cut ? 'none' : c.against ? t.accent : t.inkSecondary"
            :fill-opacity="c.cut ? 0 : c.alpha"
            :stroke="c.selected ? t.ink : c.cut ? t.inkMuted : 'none'"
            :stroke-width="c.selected ? 1.5 : 1"
            :stroke-dasharray="c.cut ? '2 2' : undefined"
          />
        </g>
        <rect :x="0" :y="0" :width="n * s" :height="n * s" fill="none" :stroke="t.hairlineStrong" stroke-width="1"/>
      </g>
      <!-- Row names, and the numbers they go by across the top. -->
      <g :transform="`translate(0,${HEAD})`">
        <g v-for="(name, i) in layout.order" :key="name" class="cursor-pointer" @click="$emit('selectNode', name)" @dblclick="$emit('open', name)">
          <text v-if="s >= 9" :x="LABEL - 22" :y="i * s + s / 2 + 3.5" text-anchor="end" :font-family="t.fontMono" :font-size="Math.min(11, s - 1)" :fill="freed.has(name) ? t.inkMuted : name === selectedNode || matches.has(name) || hover?.r === i ? t.accent : t.ink" :font-weight="name === selectedNode || matches.has(name) ? 600 : 400">{{ short(label(name)) }}</text>
          <text v-if="s >= 9" :x="LABEL + 2" :y="i * s + s / 2 + 3.5" text-anchor="end" :font-family="t.fontMono" font-size="9.5" :fill="t.inkMuted">{{ i + 1 }}</text>
          <title>{{ name }}</title>
        </g>
      </g>
      <g v-if="s >= 12" :transform="`translate(${LABEL + 8},${HEAD - 6})`">
        <text v-for="(_, i) in layout.order" :key="`c${i}`" :x="i * s + s / 2" y="0" text-anchor="middle" :font-family="t.fontMono" font-size="9" :fill="hover?.c === i ? t.accent : t.inkMuted">{{ i + 1 }}</text>
      </g>
    </svg>
    <div v-if="hover" class="pointer-events-none fixed z-50 max-w-[380px] rounded-md bg-neutral-950 px-2.5 py-1.5 text-[11.5px] leading-4 text-neutral-50 shadow-lg dark:bg-neutral-100 dark:text-neutral-900" :style="tipStyle">{{ hover.text }}</div>
    <div class="pointer-events-none sticky bottom-3 left-3 ml-3 inline-flex items-center gap-4 rounded-md bg-surface/90 px-3 py-1.5 text-[11.5px] text-neutral-600 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]">
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: t.inkSecondary, opacity: 0.6 }"></span>row imports column, with the levels</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: t.accent }"></span>below the diagonal: against the levels, these make the cycles</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useSvgFigure } from "~/composables/useExportables";
import { chartTheme, useChartTheme } from "~/composables/useChartTheme";
import { edgeId, type TangleLayout } from "~/utils/untangle";

const props = defineProps<{
  layout: TangleLayout
  cut: ReadonlySet<string>
  freed: ReadonlySet<string>
  selectedEdge: { from: string; to: string } | null
  selectedNode: string | null
  matches: ReadonlySet<string>
  label: (name: string) => string
  title: string
}>();
defineEmits<{ (e: "selectEdge", from: string, to: string): void; (e: "selectNode", name: string): void; (e: "open", name: string): void }>();

const { version } = useChartTheme();
const t = computed(() => { void version.value; return chartTheme(); });
const LABEL = 230;
const HEAD = 26;
const host = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const avail = ref({ w: 800, h: 600 });
const hover = ref<{ r: number; c: number; text: string } | null>(null);
const mouse = ref({ x: 0, y: 0 });

const n = computed(() => props.layout.order.length);
// Cells as large as the space allows, never smaller than a mark you can hit.
const s = computed(() => Math.max(5, Math.min(22, Math.floor(Math.min(avail.value.w - LABEL - 30, avail.value.h - HEAD - 50) / Math.max(1, n.value)))));
const w = computed(() => LABEL + 8 + n.value * s.value + 16);
const h = computed(() => HEAD + n.value * s.value + 56);
const short = (x: string) => (x.length > 30 ? `…${x.slice(-29)}` : x);

const pos = computed(() => new Map(props.layout.order.map((x, i) => [x, i])));
const blocks = computed(() => {
  const out: Array<{ i: number; start: number; len: number }> = [];
  let start = 0;
  // The order runs level by level, so each level is a contiguous run of rows.
  const lvl = props.layout.order.map(x => props.layout.layerOf.get(x) ?? 0);
  for (let i = 1; i <= lvl.length; i++) if (i === lvl.length || lvl[i] !== lvl[i - 1]) { out.push({ i: out.length, start, len: i - start }); start = i; }
  return out;
});
const maxImports = computed(() => Math.max(1, ...[...props.layout.forward, ...props.layout.against].map(e => e.imports)));
const cells = computed(() => [...props.layout.forward.map(e => ({ e, against: false })), ...props.layout.against.map(e => ({ e, against: true }))].map(({ e, against }) => {
  const key = edgeId(e.from, e.to);
  return {
    key, from: e.from, to: e.to, against, r: pos.value.get(e.from)!, c: pos.value.get(e.to)!,
    cut: props.cut.has(key),
    selected: !!props.selectedEdge && props.selectedEdge.from === e.from && props.selectedEdge.to === e.to,
    alpha: against ? 0.55 + 0.45 * Math.log1p(e.imports) / Math.log1p(maxImports.value) : 0.18 + 0.5 * Math.log1p(e.imports) / Math.log1p(maxImports.value),
    title: `${props.label(e.from)} imports ${props.label(e.to)}: ${e.imports} ${e.imports === 1 ? "import" : "imports"} in ${e.files} ${e.files === 1 ? "file" : "files"}${against ? ", against the levels" : ""}${props.cut.has(key) ? " (cut)" : ""}`,
  };
}));
const tipStyle = computed(() => ({ left: `${mouse.value.x + 14}px`, top: `${mouse.value.y + 14}px` }));
const onMove = (e: MouseEvent) => { mouse.value = { x: e.clientX, y: e.clientY }; };

let ro: ResizeObserver | null = null;
onMounted(() => {
  const measure = () => { const r = host.value!.getBoundingClientRect(); avail.value = { w: r.width, h: r.height }; };
  ro = new ResizeObserver(measure);
  ro.observe(host.value!);
  measure();
  host.value!.addEventListener("mousemove", onMove);
});
onBeforeUnmount(() => { ro?.disconnect(); host.value?.removeEventListener("mousemove", onMove); });

useSvgFigure(() => props.title, () => svgRef.value, () => [
  { label: "Row imports column, with the levels", color: t.value.inkSecondary },
  { label: "Against the levels: these make the cycles", color: t.value.accent },
]);
</script>
