<template>
  <!-- A tangle in levels: importers at the top, what they import below.
       Imports that run down with the levels are hairlines; the few that run
       back up against them arc out to the right in the accent, and they are
       what make every cycle. A cut one is dashed; a component no longer in
       any tangle fades. -->
  <div ref="host" class="relative h-full w-full overflow-hidden" @mouseleave="hover = null">
    <svg ref="svgRef" class="block h-full w-full select-none" :viewBox="`0 0 ${size.w} ${size.h}`" role="img" :aria-label="`Tangle of ${layout.order.length} components in ${layout.layers.length} levels`" @click.self="$emit('clear')">
      <defs>
        <marker :id="`${uid}-arrow`" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0.5 L7.5 4 L0 7.5 z" :fill="t.accent"/></marker>
        <marker :id="`${uid}-arrow-sel`" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0.5 L7.5 4 L0 7.5 z" :fill="t.ink"/></marker>
        <marker :id="`${uid}-arrow-fwd`" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0.5 L7.5 4 L0 7.5 z" :fill="t.inkMuted"/></marker>
      </defs>
      <rect :width="size.w" :height="size.h" :fill="t.surface" @click="$emit('clear')"/>
      <g :transform="transform">
        <!-- Levels. -->
        <g v-for="(l, i) in layout.layers" :key="`lvl${i}`">
          <rect x="0" :y="rowY(i) - 24" :width="bandW" :height="ROW" rx="6" :fill="i % 2 ? 'transparent' : t.ground" opacity="0.7"/>
          <text x="12" :y="rowY(i) - 6" :font-family="t.fontSans" font-size="10.5" :fill="t.inkMuted" letter-spacing="0.04em">LEVEL {{ i + 1 }}</text>
        </g>

        <!-- Imports that run with the levels. -->
        <g fill="none">
          <path
            v-for="e in forward"
            :key="e.key"
            :d="e.d"
            :stroke="e.inLoop ? t.ink : e.lit ? t.inkSecondary : t.hairlineStrong"
            :stroke-width="e.inLoop ? e.w + 1 : e.w"
            :opacity="e.dim ? (focus ? 0.07 : 0.12) : e.lit || e.inLoop ? 0.9 : 0.55"
            :marker-end="e.lit ? `url(#${uid}-arrow-fwd)` : undefined"
          />
        </g>

        <!-- Imports that run against them: the cycles' makers. -->
        <g fill="none">
          <g v-for="e in against" :key="e.key" class="cursor-pointer" @click.stop="$emit('selectEdge', e.from, e.to)" @mouseenter="hoverEdge = e.key" @mouseleave="hoverEdge = null">
            <path :d="e.d" stroke="transparent" stroke-width="12"/>
            <path
              :d="e.d"
              :class="{ 'tg-ants': e.focused && !e.cut }"
              :stroke="e.focused ? t.accent : e.inLoop ? t.ink : e.selected ? t.ink : e.cut ? t.inkMuted : t.accent"
              :stroke-width="e.focused ? e.w + 2 : e.selected || e.inLoop || hoverEdge === e.key ? e.w + 1.25 : e.w"
              :stroke-dasharray="e.focused && !e.cut ? '9 6' : e.cut ? '4 4' : undefined"
              :opacity="e.dim ? (focus ? 0.07 : 0.15) : e.cut && !e.focused ? 0.55 : 1"
              :marker-end="e.cut ? undefined : `url(#${uid}-${e.selected || (e.inLoop && !e.focused) ? 'arrow-sel' : 'arrow'})`"
            />
            <title>{{ e.title }}</title>
          </g>
        </g>

        <!-- The loop in hand: where to cut, and what it does. -->
        <g v-if="calloutAt" class="pointer-events-none">
          <rect :x="calloutAt.x" :y="calloutAt.y - 13" :width="calloutAt.w" height="26" rx="13" :fill="t.accent"/>
          <text :x="calloutAt.x + 13" :y="calloutAt.y + 4.5" :font-family="t.fontSans" font-size="12" font-weight="600" :fill="t.surface">{{ callout }}</text>
        </g>

        <!-- Components. -->
        <g v-for="n in nodes" :key="n.name" class="cursor-pointer" :opacity="n.dim ? 0.25 : 1" @mouseenter="hover = n.name" @click.stop="$emit('selectNode', n.name)" @dblclick.stop="$emit('open', n.name)">
          <rect :x="n.x - n.labelW / 2 - 6" :y="n.y - n.r - 5" :width="n.labelW + 12" :height="n.r + 26" rx="5" :fill="n.selected ? t.accentSoft : t.surface" :opacity="n.selected ? 0.6 : 0.85"/>
          <circle :cx="n.x" :cy="n.y" :r="n.r + (n.tangled ? 2.5 : 0)" :fill="n.tangled ? t.accentSoft : 'none'" :opacity="n.tangled ? 0.9 : 0"/>
          <circle v-if="n.inLoop" :cx="n.x" :cy="n.y" :r="n.r + 5" fill="none" :stroke="t.ink" stroke-width="1.5"/>
          <circle v-if="flashed.has(n.name)" class="tg-flash" :cx="n.x" :cy="n.y" :r="n.r + 4" fill="none" :stroke="t.accent" stroke-width="3"/>
          <circle :cx="n.x" :cy="n.y" :r="n.r" :fill="n.freed ? t.surface : n.color" :stroke="n.freed ? t.inkMuted : n.color" stroke-width="1.5"/>
          <text :x="n.x" :y="n.y + n.r + 14" text-anchor="middle" :font-family="t.fontMono" :font-size="n.inLoop ? 12 : 11" :fill="n.freed ? t.inkMuted : n.match ? t.accent : t.ink" :font-weight="n.selected || n.match || n.inLoop ? 600 : 400">{{ n.label }}</text>
          <title>{{ n.title }}</title>
        </g>
      </g>
    </svg>

    <!-- Reading the drawing. -->
    <div class="pointer-events-none absolute bottom-3 left-3 flex items-center gap-4 rounded-md bg-surface/90 px-3 py-1.5 text-[11.5px] text-neutral-600 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]">
      <span class="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4 H21" :stroke="t.hairlineStrong" stroke-width="1.5"/></svg>imports pointing down</span>
      <span class="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4 H21" :stroke="t.accent" stroke-width="2"/></svg>imports pointing back up: each closes loops</span>
      <span class="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><path d="M1 4 H21" :stroke="t.inkMuted" stroke-width="1.5" stroke-dasharray="4 4"/></svg>cut</span>
    </div>
    <div class="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]">
      <button type="button" class="flex h-7 w-7 items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Zoom in" @click="zoomBy(1.3)"><Icon icon="zoom-in" :size="14"/></button>
      <button type="button" class="flex h-7 w-7 items-center justify-center text-neutral-500 hairline-t hover:bg-neutral-100 hover:text-neutral-900" aria-label="Zoom out" @click="zoomBy(1 / 1.3)"><Icon icon="zoom-out" :size="14"/></button>
      <button type="button" class="flex h-7 w-7 items-center justify-center text-neutral-500 hairline-t hover:bg-neutral-100 hover:text-neutral-900" aria-label="Fit to view" @click="fit(true)"><Icon icon="maximize" :size="13"/></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as d3 from "d3";
import Icon from "~/components/ui/common/Icon.vue";
import { useSvgFigure } from "~/composables/useExportables";
import { chartTheme, useChartTheme } from "~/composables/useChartTheme";
import { edgeId, type TangleLayout } from "~/utils/untangle";

const props = defineProps<{
  layout: TangleLayout
  /** Edge ids cut, as the plan applies them. */
  cut: ReadonlySet<string>
  /** Components no longer in any tangle. */
  freed: ReadonlySet<string>
  selectedEdge: { from: string; to: string } | null
  selectedNode: string | null
  /** Components the search names. */
  matches: ReadonlySet<string>
  /** Edges of a cycle being looked at, to light up. */
  lit: ReadonlySet<string>
  label: (name: string) => string
  color: (name: string) => string | null
  lines: (name: string) => number
  step: (from: string, to: string) => number | null
  title: string
  /** The loop the guide is on: the import to cut, and the way back that closes it. */
  focus?: { from: string; to: string; loop: string[] } | null
  /** The label at the import to cut. */
  callout?: string | null
  /** Components a cut just freed, marked once. */
  flashed?: ReadonlySet<string>
}>();
defineEmits<{ (e: "selectEdge", from: string, to: string): void; (e: "selectNode", name: string): void; (e: "open", name: string): void; (e: "clear"): void }>();

const uid = `tg${Math.random().toString(36).slice(2, 7)}`;
// Levels are rows; a row is as wide as its most populous level.
const CELL = 176;
const ROW = 84;
const TOP = 52;
const LEFT = 96;
const { version } = useChartTheme();
const t = computed(() => { void version.value; return chartTheme(); });

const host = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const size = ref({ w: 800, h: 600 });
const hover = ref<string | null>(null);
const hoverEdge = ref<string | null>(null);

const widest = computed(() => Math.max(1, ...props.layout.layers.map(l => l.length)));
const rowY = (i: number) => TOP + i * ROW;
const bandW = computed(() => LEFT + widest.value * CELL + 160);
const MAX_LABEL = 24;
const short = (s: string) => (s.length > MAX_LABEL ? `…${s.slice(-(MAX_LABEL - 1))}` : s);

const place = computed(() => {
  const out = new Map<string, { x: number; y: number }>();
  props.layout.layers.forEach((l, li) => {
    const offset = (widest.value - l.length) / 2;
    l.forEach((n, i) => out.set(n, { x: LEFT + (offset + i) * CELL + CELL / 2, y: rowY(li) + 12 }));
  });
  return out;
});
const maxLines = computed(() => Math.max(1, ...props.layout.order.map(n => props.lines(n))));
const radius = (n: string) => 3.5 + 4.5 * Math.sqrt(props.lines(n) / maxLines.value);

// What the pointer or the selection is about: its edges light up, the rest recede.
const focusNode = computed(() => (props.focus ? null : hover.value ?? props.selectedNode));
const flashed = computed(() => props.flashed ?? new Set<string>());
const loopNodes = computed(() => new Set(props.focus?.loop ?? []));
const loopEdges = computed(() => {
  const l = props.focus?.loop ?? [];
  return new Set(l.map((n, i) => edgeId(n, l[(i + 1) % l.length])));
});
const touches = (from: string, to: string) => !focusNode.value || from === focusNode.value || to === focusNode.value;

const nodes = computed(() => props.layout.order.map(name => {
  const p = place.value.get(name)!;
  const label = short(props.label(name));
  const lines = props.lines(name);
  const freed = props.freed.has(name);
  return {
    name, label, x: p.x, y: p.y, r: radius(name), labelW: label.length * 6.6,
    freed, tangled: !freed,
    color: props.color(name) ?? t.value.ink,
    selected: props.selectedNode === name,
    match: props.matches.has(name),
    inLoop: loopNodes.value.has(name),
    dim: props.focus ? !loopNodes.value.has(name) : !!focusNode.value && focusNode.value !== name && !neighbours.value.get(focusNode.value)?.has(name),
    title: `${name}\n${lines.toLocaleString("en-US")} lines${freed ? "\nNo longer in a tangle with the cuts applied" : ""}\nDouble-click to open`,
  };
}));
const neighbours = computed(() => {
  const m = new Map<string, Set<string>>();
  for (const e of [...props.layout.forward, ...props.layout.against]) {
    (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(e.to);
    (m.get(e.to) ?? m.set(e.to, new Set()).get(e.to)!).add(e.from);
  }
  return m;
});
const widthOf = (imports: number) => Math.min(4, 0.9 + Math.log2(1 + imports) * 0.55);

const forward = computed(() => props.layout.forward.map(e => {
  const a = place.value.get(e.from)!, b = place.value.get(e.to)!;
  // From under the label down to the top of the next dot.
  const y1 = a.y + radius(e.from) + 20;
  const y2 = b.y - radius(e.to) - 2;
  const dy = Math.max(24, (y2 - y1) * 0.5);
  const key = edgeId(e.from, e.to);
  const lit = props.lit.has(key) || (!!focusNode.value && touches(e.from, e.to));
  const inLoop = loopEdges.value.has(key);
  return { key, d: `M${a.x},${y1} C${a.x},${y1 + dy} ${b.x},${y2 - dy} ${b.x},${y2}`, w: widthOf(e.imports), lit, inLoop, dim: props.focus ? !inLoop : (!!focusNode.value || props.lit.size > 0) && !lit };
}));
const against = computed(() => props.layout.against.map(e => {
  const a = place.value.get(e.from)!, b = place.value.get(e.to)!;
  // Back up to an earlier level: an arc out to the right, wider the further it climbs.
  // Within one level it dips below the row instead.
  const rise = Math.abs(a.y - b.y);
  const r1 = radius(e.from), r2 = radius(e.to);
  const key = edgeId(e.from, e.to);
  let d: string;
  let apex: { x: number; y: number };
  if (rise < 1) {
    const dip = 34 + Math.abs(a.x - b.x) * 0.12;
    d = `M${a.x},${a.y + r1} C${a.x},${a.y + dip} ${b.x},${b.y + dip} ${b.x},${b.y + r2 + 3}`;
    apex = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + dip * 0.75 };
  } else {
    const bulge = 60 + rise * 0.32 + Math.abs(a.x - b.x) * 0.1;
    const x1 = a.x + r1 + 1, x2 = b.x + r2 + 3;
    const cx = Math.max(x1, x2) + bulge;
    d = `M${x1},${a.y} C${cx},${a.y} ${cx},${b.y} ${x2},${b.y}`;
    // The curve's middle: (P0 + 3P1 + 3P2 + P3) / 8.
    apex = { x: (x1 + 6 * cx + x2) / 8, y: (a.y + b.y) / 2 };
  }
  const selected = !!props.selectedEdge && props.selectedEdge.from === e.from && props.selectedEdge.to === e.to;
  const step = props.step(e.from, e.to);
  const lit = props.lit.has(key) || selected || (!!focusNode.value && touches(e.from, e.to)) || hoverEdge.value === key;
  const focused = !!props.focus && props.focus.from === e.from && props.focus.to === e.to;
  const inLoop = loopEdges.value.has(key);
  return {
    key, from: e.from, to: e.to, selected, cut: props.cut.has(key), focused, inLoop, apex,
    d,
    w: widthOf(e.imports) + 0.6,
    dim: props.focus ? !inLoop : (!!focusNode.value || props.lit.size > 0) && !lit,
    title: `${props.label(e.from)} imports ${props.label(e.to)}, back up against the levels\n${e.imports} ${e.imports === 1 ? "import" : "imports"} in ${e.files} ${e.files === 1 ? "file" : "files"}${step ? `\nCut ${step} of the plan` : ""}`,
  };
}));

const calloutAt = computed(() => {
  if (!props.focus || !props.callout) return null;
  const e = against.value.find(x => x.focused);
  if (!e) return null;
  return { x: e.apex.x + 8, y: e.apex.y, w: props.callout.length * 6.7 + 26 };
});

// ── Zoom ────────────────────────────────────────────────────────────────
const zt = ref(d3.zoomIdentity);
const transform = computed(() => `translate(${zt.value.x},${zt.value.y}) scale(${zt.value.k})`);
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
const content = computed(() => ({ w: bandW.value + 120, h: TOP + props.layout.layers.length * ROW + 40 }));
function fit(animate = false) {
  const svg = svgRef.value;
  if (!svg || !zoom) return;
  const { w, h } = size.value;
  const k = Math.min(1.1, (w - 24) / content.value.w, (h - 24) / content.value.h);
  const x = (w - content.value.w * k) / 2, y = Math.max(8, (h - content.value.h * k) / 2 - 8);
  const sel = d3.select(svg);
  (animate ? sel.transition().duration(300) : sel).call(zoom.transform as any, d3.zoomIdentity.translate(x, y).scale(k));
}
function zoomBy(f: number) { if (svgRef.value && zoom) d3.select(svgRef.value).transition().duration(200).call(zoom.scaleBy as any, f); }

let ro: ResizeObserver | null = null;
onMounted(() => {
  const svg = svgRef.value!;
  zoom = d3.zoom<SVGSVGElement, unknown>()
    .extent([[0, 0], [size.value.w, size.value.h]])
    .scaleExtent([0.1, 3])
    .on("zoom", ev => { zt.value = ev.transform; });
  d3.select(svg).call(zoom).on("dblclick.zoom", null);
  ro = new ResizeObserver(() => {
    const r = host.value!.getBoundingClientRect();
    size.value = { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  });
  ro.observe(host.value!);
  const r = host.value!.getBoundingClientRect();
  size.value = { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  void nextTick(() => fit());
});
onBeforeUnmount(() => ro?.disconnect());
watch(() => props.layout, () => void nextTick(() => (props.focus ? fitFocus() : fit())));

/** Brings the loop in hand to the middle, large enough to read. */
function fitFocus() {
  const svg = svgRef.value;
  if (!svg || !zoom || !props.focus) return;
  const pts = props.focus.loop.map(n => place.value.get(n)).filter(Boolean) as Array<{ x: number; y: number }>;
  const c = calloutAt.value;
  if (c) pts.push({ x: c.x + c.w, y: c.y });
  for (const e of against.value) if (e.focused) pts.push(e.apex);
  if (!pts.length) return;
  const x0 = Math.min(...pts.map(p => p.x)) - 110, x1 = Math.max(...pts.map(p => p.x)) + 110;
  const y0 = Math.min(...pts.map(p => p.y)) - 60, y1 = Math.max(...pts.map(p => p.y)) + 70;
  const { w, h } = size.value;
  const k = Math.max(0.35, Math.min(1.35, w / (x1 - x0), h / (y1 - y0)));
  const tx = w / 2 - ((x0 + x1) / 2) * k, ty = h / 2 - ((y0 + y1) / 2) * k;
  d3.select(svg).transition().duration(matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520).ease(d3.easeCubicOut).call(zoom.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
}
watch(() => (props.focus ? `${props.focus.from}>${props.focus.to}` : ""), (k, was) => {
  if (k) void nextTick(fitFocus);
  else if (was) fit(true);
});
watch(size, (s, was) => { if (Math.abs(s.w - was.w) > 40 || Math.abs(s.h - was.h) > 40) fit(); });

useSvgFigure(() => props.title, () => svgRef.value, () => [
  { label: "Imports, top to bottom", color: t.value.hairlineStrong, line: true },
  { label: "Imports back up against the levels", color: t.value.accent, line: true },
  { label: "Cut", color: t.value.inkMuted, dashed: true },
]);
</script>

<style scoped>
.tg-ants { animation: tg-march 0.9s linear infinite; }
@keyframes tg-march { to { stroke-dashoffset: -15; } }
.tg-flash { transform-box: fill-box; transform-origin: center; animation: tg-flash 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes tg-flash { from { opacity: 1; transform: scale(0.6); } to { opacity: 0; transform: scale(2.6); } }
@media (prefers-reduced-motion: reduce) { .tg-ants, .tg-flash { animation: none; } }
</style>
