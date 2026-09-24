<template>
  <div ref="host" class="relative h-full w-full overflow-hidden bg-surface">
    <canvas
      ref="canvasEl"
      class="block h-full w-full select-none"
      role="img"
      :aria-label="`Coupling graph of ${nodes.length} nodes and ${edges.length} connections`"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @click="onClick"
      @dblclick="onDblClick"
      @contextmenu="onContextMenu"
    ></canvas>
    <!-- The tooltip a <title> used to give; the canvas has no elements to carry one. -->
    <div
      v-if="tip"
      class="ui-popover pointer-events-none absolute z-20 w-max max-w-[min(380px,60%)] px-2 py-1 text-xs"
      :style="tipStyle"
    >
      <div class="break-all font-mono text-neutral-900">{{ tip.title }}</div>
      <div v-if="tip.sub" class="text-neutral-500">{{ tip.sub }}</div>
    </div>
    <!-- What the three marks mean, showing only the kinds actually on screen. -->
    <div v-if="kindsPresent.length > 1 || dynamicPairs" class="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded bg-surface/80 px-2 py-1 backdrop-blur-sm">
      <span v-for="k in kindsPresent" :key="k" class="flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="-7 -7 14 14" aria-hidden="true">
          <path :d="nodePath(k, k === 'group' ? 6 : k === 'component' ? 5 : 4)" :fill="k === 'file' ? 'rgb(var(--c-surface))' : 'rgb(var(--c-neutral-500))'" :fill-opacity="k === 'group' ? 0.25 : 1" :stroke="k === 'component' ? 'rgb(var(--c-surface))' : 'rgb(var(--c-neutral-500))'" :stroke-width="k === 'group' ? 2 : k === 'file' ? 1.6 : 1.2"/>
        </svg>
        <span class="text-xs text-neutral-500">{{ KIND_WORD[k] }}</span>
      </span>
      <span v-if="dynamicPairs" class="flex items-center gap-1.5" :title="`${dynamicPairs} pair${dynamicPairs === 1 ? '' : 's'} joined only by a string naming a module at runtime; no import names them, so a rename breaks them silently`">
        <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke="rgb(var(--c-neutral-500))" stroke-width="1.5" stroke-dasharray="4 3"/></svg>
        <span class="text-xs text-neutral-500">Only by runtime lookup</span>
      </span>
    </div>

    <!-- Suggestion labels ride on top of their dashed hulls; HTML so they can be buttons. -->
    <div
      v-for="s in suggestionLabels"
      :key="s.key"
      class="ui-popover absolute z-10 flex max-w-[280px] -translate-x-1/2 items-center gap-1.5 px-1.5 py-1"
      :style="{ left: s.x + 'px', top: s.y + 'px' }"
      :title="s.reasons.join('\n')"
      @mouseenter="emit('hover-suggestion', s.key)"
      @mouseleave="emit('hover-suggestion', null)"
    >
      <span class="flex min-w-0 flex-col px-1">
        <span class="flex items-center gap-1.5 text-xs font-medium text-neutral-700"><Icon v-if="s.locked" icon="bookmark" :size="11" class="shrink-0 text-accent-700" aria-label="Locked"/><span class="truncate">{{ s.name }}</span><span class="font-mono text-neutral-400">{{ s.count }}</span><span v-if="s.split" class="font-mono text-neutral-400" :title="`${s.split} component${s.split === 1 ? '' : 's'} only partly in`">· {{ s.split }} split</span></span>
        <span v-if="s.reason" class="truncate text-[11px] leading-3.5 text-neutral-500">{{ s.reason }}</span>
      </span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" title="Save this group now" @click="emit('accept-suggestion', s.key)">Save</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as d3 from "d3";
import { chartTheme, readChartTheme, refreshChartTheme, type ChartTheme } from "~/composables/useChartTheme";
import { useExportables } from "~/composables/useExportables";
import { withLightTokens, type FigureOptions, type FigureOutput, type LegendItem } from "~/utils/figure";
import Icon from "~/components/ui/common/Icon.vue";
import { type CEdge, type CNode, type GroupSuggestion, edgeKey, idsInRect, isDynamicOnly, topDegreeIds } from "~/utils/connections";
import type { Hull as ModelHull } from "~/composables/useConnectionsModel";
import { begin, count } from "~/utils/perf";

// The merged coupling view: a force layout where a node is a component, a
// file or a collapsed group, coloured by the group it belongs to. Hulls
// outline groups; dashed hulls are suggestions waiting to be accepted.
// Positions survive data changes by id so switching source or scope moves
// only what changed.
//
// It draws on one canvas. As SVG it was 11,000 elements -- 2,600 lines each
// with an arrow marker, 3,500 circles, 900 texts, 3,000 titles -- and every
// hover, selection, pan and layout frame made the browser restyle and repaint
// all of them. A canvas frame is a few milliseconds whatever changed; the
// pointer is matched to nodes, edges and hull labels here instead.

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  node: CNode
  r: number
  shape: Path2D
  /** A split component: one wedge per group holding a share of it. */
  wedges: Array<{ path: Path2D; color: string }> | null
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> { edge: CEdge; /** Where the line stops, inset for the arrow head. */ tx?: number; ty?: number }

const props = defineProps<{
  nodes: CNode[]
  edges: CEdge[]
  directed: boolean
  selectedId: string | null
  selectedPair: [string, string] | null
  multi: Set<string>
  hovered: string | null
  suggestions: GroupSuggestion[]
  hulls: ModelHull[]
  cycleKeys: Set<string>
  cycleNodes: Set<string>
  /** Strong marking when the user asked for one cycle; soft when every cycle is shown at once. */
  cycleStrong?: boolean
  badges: Map<string, number>
  /** A suggestion under the pointer: its members stay lit, the rest fades. */
  highlight?: { key: string; members: string[] } | null
}>();

const emit = defineEmits<{
  (e: "select", id: string | null, mods: { shift: boolean; meta: boolean }): void
  (e: "select-pair", from: string, to: string): void
  (e: "select-cycle", id: string): void
  (e: "hover", id: string | null): void
  (e: "activate", id: string): void
  (e: "context", payload: { id: string; x: number; y: number }): void
  (e: "lasso", ids: string[]): void
  (e: "accept-suggestion", key: string): void
  (e: "hover-suggestion", key: string | null): void
  /** A node dragged and released inside a suggested hull (key) or on open ground (null). */
  (e: "drop-in-hull", payload: { id: string; key: string | null }): void
  (e: "close-hull", key: string): void
  (e: "context-hull", payload: { key: string; x: number; y: number }): void
}>();

const host = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const KIND_WORD: Record<string, string> = { group: "Group", component: "Component", file: "File" };
const KIND_ORDER = ["group", "component", "file"];
const kindsPresent = computed(() => KIND_ORDER.filter(k => props.nodes.some(n => n.kind === k)));

const suggestionLabels = ref<Array<{ key: string; name: string; count: number; x: number; y: number; reason?: string; reasons: string[]; split?: number; locked?: boolean }>>([]);
const tip = ref<{ x: number; y: number; title: string; sub?: string } | null>(null);
// Past the middle of the canvas the tooltip opens to the left of the pointer, so it never squeezes against the edge.
const tipStyle = computed(() => {
  const t = tip.value;
  if (!t) return {};
  const w = host.value?.clientWidth ?? 0;
  return { top: t.y + 14 + "px", ...(t.x > w / 2 ? { right: w - t.x + 10 + "px" } : { left: t.x + 14 + "px" }) };
});

let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
/** Set while drawing an export offscreen; the draw targets it instead of the screen. */
let exportCanvas: HTMLCanvasElement | null = null;
let simulation: d3.Simulation<SimNode, SimLink> | null = null;
let fittedEarly = false;
let zoom: d3.ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
let transform = d3.zoomIdentity;
let userZoomed = false;
let simNodes: SimNode[] = [];
let simLinks: SimLink[] = [];
const positions = new Map<string, { x: number; y: number }>();
let observer: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let media: MediaQueryList | null = null;
let drawFrame = 0;
let settleFrame = 0;
// Hover stays inside the graph. Sent up to the page and handed back as a
// prop, it re-rendered the page and its layout on every node crossed.
let hoverId: string | null = null;
let dragging = false;
let lasso: { x0: number; y0: number; x1: number; y1: number } | null = null;
/** Links per node and the hubs that keep their labels: both fixed until the next rebuild. */
let linksOf = new Map<string, number>();
let labelIds = new Set<string>();
/** What the last frame drew that the pointer can hit, in layout coordinates. */
let markerHits: Array<{ x: number; y: number; link: SimLink }> = [];
let hullLabelHits: Array<{ key: string; name: string; x0: number; y0: number; x1: number; y1: number }> = [];

const nodeById = computed(() => new Map(props.nodes.map(n => [n.id, n])));

/** Node radius by id, for the hull maths. */
const radii = new Map<string, number>();

// Colour belongs to the dimension, so the kind is carried by the mark itself:
// a group is a box (it holds components), a component a filled disc (it holds
// files), a file a hollow ring (it holds nothing). Sizes sit in three bands so
// the three never read as the same thing.
const BAND = {
  group: { base: 17, max: 38 },
  component: { base: 7.5, max: 26 },
  file: { base: 4, max: 15 },
} as const;

function radius(n: CNode): number {
  const band = BAND[n.kind as keyof typeof BAND] ?? BAND.component;
  // A group also grows with how many components it holds, so a container is
  // never drawn smaller than the things inside it.
  const held = n.kind === "group" ? (n.files ?? 0) * 0.25 : 0;
  return Math.min(band.base + Math.sqrt(n.lines ?? 1) * 0.35 + held, band.max);
}

/** One wedge of a divided node, from one angle to the next. */
function wedgePath(r: number, from: number, to: number): string {
  const x0 = Math.cos(from) * r, y0 = Math.sin(from) * r;
  const x1 = Math.cos(to) * r, y1 = Math.sin(to) * r;
  const big = to - from > Math.PI ? 1 : 0;
  return `M 0,0 L ${x0},${y0} A ${r},${r} 0 ${big} 1 ${x1},${y1} Z`;
}

/** The silhouette for a kind: a rounded box for a group, a circle otherwise. */
function nodePath(kind: string, r: number): string {
  if (kind === "group") {
    const s = r * 0.92, c = r * 0.42;
    return `M ${-s + c},${-s} H ${s - c} A ${c},${c} 0 0 1 ${s},${-s + c} V ${s - c} A ${c},${c} 0 0 1 ${s - c},${s} H ${-s + c} A ${c},${c} 0 0 1 ${-s},${s - c} V ${-s + c} A ${c},${c} 0 0 1 ${-s + c},${-s} Z`;
  }
  return `M ${-r},0 A ${r},${r} 0 1,0 ${r},0 A ${r},${r} 0 1,0 ${-r},0 Z`;
}

// ── Canvas and zoom ─────────────────────────────────────────────────────

function setup() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  const drag = d3.drag<HTMLCanvasElement, unknown, SimNode | undefined>()
    .container(canvas)
    .subject((event) => { const [x, y] = worldAt(event.sourceEvent ?? event); return nodeAt(x, y) ?? undefined; })
    .on("start", (event) => {
      const d = event.subject as SimNode;
      stopSettle();
      dragging = true;
      tip.value = null;
      if (!event.active) simulation?.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
      dragFrom = { x: d.x ?? 0, y: d.y ?? 0 };
    })
    .on("drag", (event) => {
      const d = event.subject as SimNode;
      const [x, y] = worldAt(event.sourceEvent);
      d.fx = x; d.fy = y;
    })
    .on("end", (event) => {
      const d = event.subject as SimNode;
      dragging = false;
      if (!event.active) simulation?.alphaTarget(0);
      d.fx = null; d.fy = null;
      // A real drag that ends inside a region moves the node into it.
      if ((props.suggestions.length || props.hulls.length) && dragFrom && Math.hypot((d.x ?? 0) - dragFrom.x, (d.y ?? 0) - dragFrom.y) > 14) {
        const key = regionAt(d.x ?? 0, d.y ?? 0, d.id);
        emit("drop-in-hull", { id: d.id, key });
      }
      dragFrom = null;
    });
  zoom = d3.zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.15, 4])
    .extent(() => [[0, 0], [host.value?.clientWidth || 800, host.value?.clientHeight || 600]])
    .filter((event) => !event.shiftKey && (event.type === "wheel" || event.button === 0))
    .on("zoom", (event) => {
      transform = event.transform;
      if (event.sourceEvent) userZoomed = true;
      requestDraw();
      placeSuggestionLabels();
    });
  sizeCanvas();
  // Drag first: on a node it stops the event before the zoom can pan.
  d3.select(canvas).call(drag).call(zoom).on("dblclick.zoom", null);
}

function sizeCanvas(): { width: number; height: number } {
  const width = host.value?.clientWidth || 800;
  const height = host.value?.clientHeight || 600;
  dpr = window.devicePixelRatio || 1;
  const c = canvasEl.value;
  if (c && (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr))) {
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
  }
  return { width, height };
}

function worldAt(event: MouseEvent | PointerEvent): [number, number] {
  return transform.invert(d3.pointer(event, canvasEl.value));
}

// ── Layout ──────────────────────────────────────────────────────────────

function rebuild() {
  const endRebuild = begin("graph.rebuild");
  if (!ctx) return;
  const { width, height } = sizeCanvas();
  const ids = new Set(props.nodes.map(n => n.id));
  simNodes = props.nodes.map((n, i) => {
    const p = positions.get(n.id);
    const angle = (i / Math.max(props.nodes.length, 1)) * Math.PI * 2;
    const r = radius(n);
    return {
      id: n.id, node: n, r, shape: new Path2D(nodePath(n.kind, r)), wedges: wedgesOf(n, r),
      x: p?.x ?? width / 2 + Math.cos(angle) * 200, y: p?.y ?? height / 2 + Math.sin(angle) * 200,
    };
  });
  const byId = new Map(simNodes.map(n => [n.id, n]));
  simLinks = props.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => ({ source: byId.get(e.from)!, target: byId.get(e.to)!, edge: e }));

  // Unconnected nodes would otherwise drift to the corners under repulsion
  // and stretch the fit; they sit on an outer ring instead, still there, out
  // of the way.
  linksOf = new Map();
  for (const l of simLinks) {
    const a = (l.source as SimNode).id, b = (l.target as SimNode).id;
    linksOf.set(a, (linksOf.get(a) ?? 0) + 1);
    linksOf.set(b, (linksOf.get(b) ?? 0) + 1);
  }
  const isolated = (d: SimNode) => !linksOf.has(d.id);
  const ring = Math.min(width, height) / 2 - 40;

  // Members of an open group sit together: a hull pulls its members toward
  // their shared centre, and links that cross hulls are kept longer so the
  // edges between groups stay legible. Suggested groups pull the same way,
  // so the dashed outlines read as regions instead of overlapping loops.
  const hullOf = new Map<string, string>();
  for (const h of props.hulls) for (const m of h.members) hullOf.set(m, h.key);
  for (const s of props.suggestions) for (const m of s.members) if (!hullOf.has(m)) hullOf.set(m, "s:" + s.key);
  const sameHull = (l: SimLink) => { const a = hullOf.get((l.source as SimNode).id), b = hullOf.get((l.target as SimNode).id); return !!a && a === b; };
  const anyHull = hullOf.size > 0;
  const suggested = (h: string) => h.startsWith("s:");
  // Suggestions pull harder than open groups, and hull centres keep their
  // distance from each other, so every dashed region has its own ground.
  const clusterForce = (alpha: number) => {
    if (!anyHull) return;
    const centres = new Map<string, { x: number; y: number; n: number; r: number }>();
    for (const n of simNodes) { const h = hullOf.get(n.id); if (!h) continue; const c = centres.get(h) ?? { x: 0, y: 0, n: 0, r: 0 }; c.x += n.x!; c.y += n.y!; c.n++; centres.set(h, c); }
    centres.forEach(c => { c.x /= c.n; c.y /= c.n; c.r = 40 + Math.sqrt(c.n) * 28; });
    const shove = new Map<string, { x: number; y: number }>();
    const list = Array.from(centres.entries());
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ka, a] = list[i], [kb, b] = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const min = a.r + b.r;
      if (dist >= min) continue;
      const f = ((min - dist) / dist) * alpha * 0.35;
      const sa = shove.get(ka) ?? { x: 0, y: 0 }; sa.x -= dx * f; sa.y -= dy * f; shove.set(ka, sa);
      const sb = shove.get(kb) ?? { x: 0, y: 0 }; sb.x += dx * f; sb.y += dy * f; shove.set(kb, sb);
    }
    for (const n of simNodes) {
      const h = hullOf.get(n.id); if (!h) continue;
      const c = centres.get(h)!;
      const k = suggested(h) ? 0.5 : 0.25;
      n.vx! += (c.x - n.x!) * alpha * k;
      n.vy! += (c.y - n.y!) * alpha * k;
      const sh = shove.get(h);
      if (sh) { n.vx! += sh.x; n.vy! += sh.y; }
    }
  };

  simulation?.stop();
  simulation = d3.forceSimulation<SimNode>(simNodes)
    .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id)
      .distance(l => (anyHull && !sameHull(l) ? 200 : 50) + (1 - l.edge.weight) * 90 + ((l.source as SimNode).node.kind === "group" ? 70 : 0) + ((l.target as SimNode).node.kind === "group" ? 70 : 0))
      .strength(l => (anyHull && !sameHull(l) ? 0.05 : 0.15) + l.edge.weight * 0.5))
    .force("charge", d3.forceManyBody<SimNode>().strength(d => (isolated(d) ? -30 : d.node.kind === "group" ? -700 - d.r * 10 : -160 - d.r * 6)))
    .force("cluster", clusterForce)
    .force("collide", d3.forceCollide<SimNode>().radius(d => d.r + (d.node.kind === "group" ? 24 : 5)))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
    .force("x", d3.forceX(width / 2).strength(d => (isolated(d) ? 0 : 0.06)))
    .force("y", d3.forceY(height / 2).strength(d => (isolated(d) ? 0 : 0.06)))
    .force("ring", d3.forceRadial<SimNode>(ring, width / 2, height / 2).strength(d => (isolated(d) ? 0.9 : 0)))
    .alpha(0.9)
    .on("tick", tick)
    .on("end", () => { if (!userZoomed) fit(); })
    // `settle` drives the layout to rest; the timer is only for drags.
    .stop();
  fittedEarly = false;

  radii.clear();
  for (const n of simNodes) radii.set(n.id, n.r);
  labelIds = simNodes.length <= 40 ? new Set(simNodes.map(x => x.id)) : topDegreeIds(props.nodes, props.edges, 20);
  if (hoverId && !byId.has(hoverId)) hoverId = null;

  count("graph.nodes", simNodes.length);
  count("graph.links", simLinks.length);
  endRebuild();
  tick();
  settle();
}

function wedgesOf(n: CNode, r: number): SimNode["wedges"] {
  const slices = n.slices ?? [];
  if (slices.length <= 1) return null;
  const total = slices.reduce((s, x) => s + Math.max(0, x.share), 0) || 1;
  let angle = -Math.PI / 2;
  return slices.map(sl => {
    const span = (Math.max(0, sl.share) / total) * Math.PI * 2;
    const w = { path: new Path2D(wedgePath(r, angle, angle + span)), color: sl.color };
    angle += span;
    return w;
  });
}

/**
 * Runs the layout to rest a frame's worth of ticks at a time, drawing each
 * frame. Driven by d3's own timer it took one tick per frame: 300 ticks,
 * seconds of motion before the page stood still.
 */
const SETTLE_BUDGET_MS = 10;
function settle() {
  stopSettle();
  const sim = simulation;
  if (!sim) return;
  const step = () => {
    settleFrame = 0;
    if (sim !== simulation) return;
    const end = begin("graph.settle");
    const started = performance.now();
    while (sim.alpha() > sim.alphaMin() && performance.now() - started < SETTLE_BUDGET_MS) sim.tick();
    end();
    tick();
    if (sim.alpha() <= sim.alphaMin()) { if (!userZoomed) fit(); return; }
    settleFrame = requestAnimationFrame(step);
  };
  settleFrame = requestAnimationFrame(step);
}
function stopSettle() {
  if (settleFrame) cancelAnimationFrame(settleFrame);
  settleFrame = 0;
}

function tick() {
  for (const n of simNodes) positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  // Fit once as soon as the rough shape is there so a level or source switch
  // never shows the previous zoom.
  if (!fittedEarly && simulation && simulation.alpha() < 0.45 && !userZoomed) { fittedEarly = true; fit(150); }
  requestDraw();
  placeSuggestionLabels();
}

// ── Drawing ─────────────────────────────────────────────────────────────

/** Selection, hover and data changes all end here: one frame, drawn once. */
function requestDraw() {
  if (!drawFrame) drawFrame = requestAnimationFrame(draw);
}
const restyle = requestDraw;

// Shorten directed links so the arrow head lands on the target's edge.
function endpoints(l: SimLink): void {
  const s = l.source as SimNode, tt = l.target as SimNode;
  if (!props.directed) { l.tx = tt.x!; l.ty = tt.y!; return; }
  const dx = tt.x! - s.x!, dy = tt.y! - s.y!;
  const len = Math.hypot(dx, dy) || 1;
  const k = (len - tt.r - 2) / len;
  l.tx = s.x! + dx * k;
  l.ty = s.y! + dy * k;
}

function draw() {
  drawFrame = 0;
  const c = exportCanvas ?? canvasEl.value;
  if (!ctx || !c) return;
  const end = begin("graph.draw");
  const g = ctx;
  const t = chartTheme();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(dpr * transform.k, 0, 0, dpr * transform.k, dpr * transform.x, dpr * transform.y);

  const focus = hoverId ?? props.hovered ?? props.selectedId;
  const neighbours = new Set<string>();
  if (focus) for (const e of props.edges) { if (e.from === focus) neighbours.add(e.to); if (e.to === focus) neighbours.add(e.from); }
  const marked = (id: string) => props.selectedId === id || props.multi.has(id);
  const spot = props.highlight?.members.length ? new Set(props.highlight.members) : null;
  const related = (id: string) => (spot ? spot.has(id) : !focus || id === focus || neighbours.has(id) || props.multi.has(id));
  const pair = props.selectedPair;
  const isPair = (e: CEdge) => !!pair && ((e.from === pair[0] && e.to === pair[1]) || (e.from === pair[1] && e.to === pair[0]));
  // Soft marking (every cycle at once) tints cycle edges and rings their nodes;
  // loop markers only sit on mutual pairs, the direct two-way cycles. Strong
  // marking (one chosen cycle) paints its edges fully and marks every one.
  const strong = !!props.cycleStrong;
  const anyCycle = props.cycleKeys.size > 0;
  const inCycle = (e: CEdge) => anyCycle && props.cycleKeys.has(edgeKey(e.from, e.to));
  const mutual = (e: CEdge) => inCycle(e) && props.cycleKeys.has(edgeKey(e.to, e.from)) && e.from < e.to;

  // What is on screen, in layout coordinates, with a margin for labels.
  const [vx0, vy0] = transform.invert([-60, -60]);
  const [vx1, vy1] = transform.invert([c.width / dpr + 60, c.height / dpr + 60]);
  const onScreen = (x: number, y: number, r: number) => x + r >= vx0 && x - r <= vx1 && y + r >= vy0 && y - r <= vy1;

  drawHulls(g, t);

  // Links: faint ones first, emphasised ones over them.
  g.lineCap = "butt";
  const late: Array<[SimLink, string, number, number]> = [];
  markerHits = [];
  for (const l of simLinks) {
    endpoints(l);
    const s = l.source as SimNode;
    if (!onScreen(s.x!, s.y!, 0) && !onScreen(l.tx!, l.ty!, 0) && !crossesView(s.x!, s.y!, l.tx!, l.ty!, vx0, vy0, vx1, vy1)) continue;
    const e = l.edge;
    const p = isPair(e), cy = inCycle(e), touches = !!focus && (e.from === focus || e.to === focus);
    const stroke = p ? t.accent : cy ? t.red : touches ? t.blue : t.hairlineStrong;
    const alpha = spot ? (spot.has(e.from) && spot.has(e.to) ? 0.7 : 0.05) : p ? 1 : !focus ? (cy ? (strong ? 0.95 : 0.4) : 0.55) : touches ? 0.95 : cy && strong ? 0.6 : 0.08;
    const width = p ? 2.5 : (cy && strong ? 1.4 : 0.6) + e.weight * 3;
    if (p || touches || (cy && (strong || !focus))) { late.push([l, stroke, alpha, width]); continue; }
    strokeLink(g, l, stroke, alpha, width);
  }
  for (const [l, stroke, alpha, width] of late) strokeLink(g, l, stroke, alpha, width);

  // Loop markers on the midpoint of cycle edges.
  if (anyCycle) {
    g.lineWidth = 1.5;
    for (const l of simLinks) {
      const e = l.edge;
      if (!(strong ? inCycle(e) : mutual(e))) continue;
      const s = l.source as SimNode;
      const x = (s.x! + l.tx!) / 2, y = (s.y! + l.ty!) / 2;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      markerHits.push({ x, y, link: l });
      g.globalAlpha = !focus || e.from === focus || e.to === focus ? 1 : 0.35;
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fillStyle = t.surface; g.fill();
      g.strokeStyle = t.red; g.stroke();
    }
  }

  // Nodes.
  for (const n of simNodes) {
    if (!onScreen(n.x!, n.y!, n.r + 4)) continue;
    const k = n.node.kind, m = marked(n.id), cyc = props.cycleNodes.has(n.id);
    const op = related(n.id) ? 1 : 0.2;
    g.translate(n.x!, n.y!);
    // A file is hollow: the ground shows through, so it reads as a leaf next
    // to the solid components and boxed groups around it.
    g.globalAlpha = op * (k === "file" ? 1 : k === "group" ? 0.25 : linksOf.get(n.id) ? 1 : 0.45);
    g.fillStyle = k === "file" ? t.surface : n.node.color ?? t.hairlineStrong;
    g.fill(n.shape);
    if (n.wedges) {
      g.globalAlpha = op;
      g.lineWidth = 1;
      g.strokeStyle = t.surface;
      for (const w of n.wedges) { g.fillStyle = w.color; g.fill(w.path); g.stroke(w.path); }
    }
    g.globalAlpha = op;
    g.strokeStyle = m ? t.accent : cyc ? t.red : k === "component" ? t.surface : n.node.color ?? t.hairlineStrong;
    g.lineWidth = m ? 3 : cyc ? (strong ? 2.5 : 1.5) : k === "group" ? 2 : k === "file" ? 1.6 : 1.2;
    g.stroke(n.shape);
    g.translate(-n.x!, -n.y!);
  }

  // Labels: every group, the hubs, and whatever the focus touches. Each kind
  // speaks in its own voice: a group in sans and semibold, a component in
  // mono, a file in smaller, quieter mono.
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.strokeStyle = t.surface;
  for (const n of simNodes) {
    const k = n.node.kind, m = marked(n.id);
    const show = k === "group" || labelIds.has(n.id) || n.id === focus || m || (!!focus && neighbours.has(n.id)) || (!!spot && spot.has(n.id));
    if (!show || !onScreen(n.x!, n.y! + n.r + 12, 80)) continue;
    g.globalAlpha = related(n.id) ? 1 : 0.25;
    g.font = `${m || k === "group" ? 600 : 400} ${k === "group" ? 12 : k === "file" ? 10 : 11}px ${k === "group" ? t.fontSans : t.fontMono}`;
    g.fillStyle = m || n.id === focus ? t.ink : k === "file" ? t.inkMuted : t.inkSecondary;
    const text = shorten(n.node.label, k === "group" ? 32 : 26);
    const y = n.y! + n.r + 12;
    g.strokeText(text, n.x!, y);
    g.fillText(text, n.x!, y);
  }

  // Badges: cycles folded inside a closed node.
  if (props.badges.size) {
    g.textBaseline = "middle";
    g.font = `600 9px ${t.fontMono}`;
    for (const n of simNodes) {
      const b = props.badges.get(n.id);
      if (!b) continue;
      const x = n.x! + n.r * 0.75, y = n.y! - n.r * 0.75;
      g.globalAlpha = related(n.id) ? 1 : 0.25;
      g.beginPath();
      g.arc(x, y, 7.5, 0, Math.PI * 2);
      g.fillStyle = t.red; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = t.surface; g.stroke();
      g.fillStyle = t.surface;
      g.fillText(String(b), x, y + 0.5);
    }
  }

  drawHullLabels(g, t);
  g.globalAlpha = 1;

  // The lasso lives in screen space.
  if (lasso) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = Math.min(lasso.x0, lasso.x1), y = Math.min(lasso.y0, lasso.y1);
    const w = Math.abs(lasso.x1 - lasso.x0), h = Math.abs(lasso.y1 - lasso.y0);
    g.globalAlpha = 0.06; g.fillStyle = t.accent; g.fillRect(x, y, w, h);
    g.globalAlpha = 1; g.strokeStyle = t.accent; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(x, y, w, h); g.setLineDash([]);
  }
  end();
}

function strokeLink(g: CanvasRenderingContext2D, l: SimLink, stroke: string, alpha: number, width: number) {
  const s = l.source as SimNode;
  g.globalAlpha = alpha;
  g.strokeStyle = stroke;
  g.lineWidth = width;
  // A pair only a runtime lookup joins is dashed: no import will name it.
  const dynamic = isDynamicOnly(l.edge);
  if (dynamic) g.setLineDash([4, 3]);
  g.beginPath();
  g.moveTo(s.x!, s.y!);
  g.lineTo(l.tx!, l.ty!);
  g.stroke();
  if (dynamic) g.setLineDash([]);
  if (!props.directed) return;
  // The arrow head grows with the line, as an SVG marker in stroke units did.
  const dx = l.tx! - s.x!, dy = l.ty! - s.y!;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const size = Math.min(12, Math.max(3.5, width * 4));
  const bx = l.tx! - ux * size, by = l.ty! - uy * size;
  g.fillStyle = stroke;
  g.beginPath();
  g.moveTo(l.tx!, l.ty!);
  g.lineTo(bx - uy * size * 0.5, by + ux * size * 0.5);
  g.lineTo(bx + uy * size * 0.5, by - ux * size * 0.5);
  g.closePath();
  g.fill();
}

/** Whether a segment with both ends off screen still passes across it. */
function crossesView(x0: number, y0: number, x1: number, y1: number, vx0: number, vy0: number, vx1: number, vy1: number): boolean {
  if ((x0 < vx0 && x1 < vx0) || (x0 > vx1 && x1 > vx1) || (y0 < vy0 && y1 < vy0) || (y0 > vy1 && y1 > vy1)) return false;
  return true;
}

// ── Hulls ───────────────────────────────────────────────────────────────

interface Hull { key: string; name: string; color: string | null; members: string[]; dashed: boolean }

function hullList(): Hull[] {
  const out: Hull[] = [];
  for (const h of props.hulls) {
    const members = h.members.filter(m => nodeById.value.has(m));
    if (members.length >= 2) out.push({ key: h.key, name: h.name, color: h.color, members, dashed: false });
  }
  for (const s of props.suggestions) {
    const members = s.members.filter(m => nodeById.value.has(m));
    if (members.length >= 2) out.push({ key: "s:" + s.key, name: s.name, color: null, members, dashed: true });
  }
  return out;
}

let dragFrom: { x: number; y: number } | null = null;
const hullPolygons = new Map<string, [number, number][]>();

/** The suggestion whose outline contains the point, ignoring the one the node already sits in. */
function regionAt(x: number, y: number, id: string): string | null {
  for (const h of props.hulls) {
    if (h.members.includes(id)) continue;
    const poly = hullPolygons.get(h.key);
    if (poly && d3.polygonContains(poly, [x, y])) return h.key;
  }
  for (const s of props.suggestions) {
    if (s.members.includes(id)) continue;
    const poly = hullPolygons.get("s:" + s.key);
    if (poly && d3.polygonContains(poly, [x, y])) return s.key;
  }
  return null;
}

function hullPolygon(members: string[]): [number, number][] | null {
  const pts: [number, number][] = [];
  for (const id of members) {
    const p = positions.get(id);
    const r = (radii.get(id) ?? 8) + 16;
    if (!p) continue;
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) pts.push([p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]);
  }
  if (pts.length < 3) return null;
  return d3.polygonHull(pts) as [number, number][] | null;
}

let hullsDrawn: Hull[] = [];
function drawHulls(g: CanvasRenderingContext2D, t: ChartTheme) {
  const end = begin("graph.drawHulls");
  hullsDrawn = hullList();
  hullPolygons.clear();
  const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6)).context(g);
  g.lineJoin = "round";
  for (const h of hullsDrawn) {
    const poly = hullPolygon(h.members);
    if (!poly) continue;
    hullPolygons.set(h.key, poly);
    const lit = props.highlight && h.key === "s:" + props.highlight.key;
    g.beginPath();
    line(poly);
    g.globalAlpha = props.highlight ? (lit ? 0.14 : 0.02) : h.dashed ? 0.05 : 0.09;
    g.fillStyle = h.color ?? t.inkMuted;
    g.fill();
    g.globalAlpha = props.highlight ? (lit ? 1 : 0.2) : h.dashed ? 0.7 : 0.5;
    g.strokeStyle = h.color ?? t.inkSecondary;
    g.lineWidth = lit ? 1.8 : 1.2;
    g.setLineDash(h.dashed ? [5, 4] : []);
    g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
  end();
}

/** The hull label is the handle for the open group: click closes it, right-click offers more. */
function drawHullLabels(g: CanvasRenderingContext2D, t: ChartTheme) {
  hullLabelHits = [];
  g.font = `600 11px ${t.fontSans}`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.globalAlpha = 1;
  for (const h of hullsDrawn) {
    if (h.dashed || !hullPolygons.has(h.key)) continue;
    const x = centroid(h.members).x, y = top(h.members) - 6;
    const text = h.name + "  ×";
    const w = g.measureText(text).width;
    g.strokeStyle = t.surface;
    g.strokeText(text, x, y);
    g.fillStyle = h.color ?? t.inkSecondary;
    g.fillText(text, x, y);
    hullLabelHits.push({ key: h.key, name: h.name, x0: x - w / 2, x1: x + w / 2, y0: y - 11, y1: y + 3 });
  }
}

function centroid(members: string[]): { x: number; y: number } {
  let x = 0, y = 0, n = 0;
  for (const id of members) { const p = positions.get(id); if (p) { x += p.x; y += p.y; n++; } }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
function top(members: string[]): number {
  let min = Infinity;
  for (const id of members) { const p = positions.get(id); const r = radii.get(id) ?? 8; if (p) min = Math.min(min, p.y - r - 16); }
  return isFinite(min) ? min : 0;
}

function placeSuggestionLabels() {
  if (props.suggestions.length === 0) { if (suggestionLabels.value.length) suggestionLabels.value = []; return; }
  const end = begin("graph.suggestionLabels");
  suggestionLabels.value = props.suggestions
    .map(s => ({ s, members: s.members.filter(m => positions.has(m)) }))
    .filter(x => x.members.length >= 2)
    .map(({ s, members }) => {
      const c = centroid(members);
      const [x, y] = transform.apply([c.x, top(members) - 10]);
      return { key: s.key, name: s.name, count: members.length, x, y: y - 34, reason: s.reason, reasons: s.reasons ?? [], split: s.split, locked: s.locked };
    });
  end();
}

// ── Hit testing ─────────────────────────────────────────────────────────

/** The node under a point: the nearest whose disc -- never smaller than ten screen pixels -- contains it. */
function nodeAt(x: number, y: number): SimNode | null {
  const reach = 10 / Math.max(0.15, transform.k);
  let best: SimNode | null = null, bestD = Infinity;
  for (const n of simNodes) {
    const d = Math.hypot(n.x! - x, n.y! - y);
    if (d <= Math.max(n.r + 2, reach) && d < bestD) { best = n; bestD = d; }
  }
  return best;
}
function markerAt(x: number, y: number): SimLink | null {
  const reach = 4.5 + 3 / transform.k;
  for (const m of markerHits) if (Math.hypot(m.x - x, m.y - y) <= reach) return m.link;
  return null;
}
function hullLabelAt(x: number, y: number) {
  return hullLabelHits.find(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) ?? null;
}
function linkAt(x: number, y: number): SimLink | null {
  const reach = 4 / transform.k;
  let best: SimLink | null = null, bestD = Infinity;
  for (const l of simLinks) {
    const s = l.source as SimNode;
    const ax = s.x!, ay = s.y!, bx = l.tx ?? (l.target as SimNode).x!, by = l.ty ?? (l.target as SimNode).y!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(ax + u * dx - x, ay + u * dy - y) - (0.6 + l.edge.weight * 3) / 2;
    if (d <= reach && d < bestD) { best = l; bestD = d; }
  }
  return best;
}

// ── Pointer ─────────────────────────────────────────────────────────────

/** One redraw per frame however many nodes the pointer crossed in it. */
function setHover(id: string | null) {
  if (id === hoverId) return;
  hoverId = id;
  emit("hover", id);
  requestDraw();
}

function onPointerDown(event: PointerEvent) {
  if (!event.shiftKey || event.button !== 0) return;
  const [x, y] = worldAt(event);
  if (nodeAt(x, y)) return;
  // Lasso: shift-drag on open ground selects every node inside the box.
  const [px, py] = d3.pointer(event, canvasEl.value);
  lasso = { x0: px, y0: py, x1: px, y1: py };
  canvasEl.value!.setPointerCapture(event.pointerId);
  canvasEl.value!.style.cursor = "crosshair";
  event.preventDefault();
}

let tipKey: string | null = null;
function onPointerMove(event: PointerEvent) {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const [px, py] = d3.pointer(event, canvas);
  if (lasso) { lasso.x1 = px; lasso.y1 = py; requestDraw(); return; }
  if (dragging || event.buttons) return;
  const [x, y] = transform.invert([px, py]);
  const n = nodeAt(x, y);
  setHover(n?.id ?? null);
  let key: string | null = null, title = "", sub: string | undefined;
  if (n) { key = "n:" + n.id; title = n.node.label; sub = KIND_WORD[n.node.kind] ?? n.node.kind; }
  else {
    const m = markerAt(x, y);
    const h = m ? null : hullLabelAt(x, y);
    const l = m || h ? null : linkAt(x, y);
    if (m) { key = "m:" + m.edge.from + "|" + m.edge.to; title = "Part of a cycle"; sub = "Click to inspect it."; }
    else if (h) { key = "h:" + h.key; title = `Close ${h.name}`; }
    else if (l) { key = "l:" + l.edge.from + "|" + l.edge.to; title = `${nodeById.value.get(l.edge.from)?.label ?? l.edge.from} ${props.directed ? "→" : "↔"} ${nodeById.value.get(l.edge.to)?.label ?? l.edge.to}`; sub = `${l.edge.references ? `${l.edge.references} ref${l.edge.references === 1 ? "" : "s"}${l.edge.dynamicRefs ? ` (${l.edge.dynamicRefs} dynamic)` : ""}. ` : ""}Click to inspect this edge.`; }
  }
  canvas.style.cursor = key ? "pointer" : "grab";
  if (key !== tipKey) { tipKey = key; tip.value = key ? { x: px, y: py, title, sub } : null; }
}

function onPointerUp(event: PointerEvent) {
  if (!lasso) return;
  const l = lasso;
  lasso = null;
  if (canvasEl.value) canvasEl.value.style.cursor = "grab";
  try { canvasEl.value!.releasePointerCapture(event.pointerId); } catch {}
  requestDraw();
  if (Math.abs(l.x1 - l.x0) < 4 && Math.abs(l.y1 - l.y0) < 4) return;
  suppressClick = true;
  const pts = simNodes.map(n => { const [x, y] = transform.apply([n.x!, n.y!]); return { id: n.id, x, y }; });
  emit("lasso", idsInRect(pts, l));
}

function onPointerLeave() {
  if (lasso || dragging) return;
  setHover(null);
  tipKey = null;
  tip.value = null;
}

let suppressClick = false;
function onClick(event: MouseEvent) {
  if (suppressClick) { suppressClick = false; return; }
  const [x, y] = worldAt(event);
  const n = nodeAt(x, y);
  if (n) { emit("select", n.id, { shift: event.shiftKey, meta: event.metaKey || event.ctrlKey }); return; }
  const m = markerAt(x, y);
  if (m) { emit("select-cycle", m.edge.from); return; }
  const h = hullLabelAt(x, y);
  if (h) { emit("close-hull", h.key); return; }
  const l = linkAt(x, y);
  if (l) { emit("select-pair", l.edge.from, l.edge.to); return; }
  if (event.shiftKey) return;
  emit("select", null, { shift: false, meta: false });
}

function onDblClick(event: MouseEvent) {
  const [x, y] = worldAt(event);
  const n = nodeAt(x, y);
  if (n) emit("activate", n.id);
}

function onContextMenu(event: MouseEvent) {
  const [x, y] = worldAt(event);
  const n = nodeAt(x, y);
  if (n) { event.preventDefault(); emit("context", { id: n.id, x: event.clientX, y: event.clientY }); return; }
  const h = hullLabelAt(x, y);
  if (h) { event.preventDefault(); emit("context-hull", { key: h.key, x: event.clientX, y: event.clientY }); }
}

// ── Framing ─────────────────────────────────────────────────────────────

function fit(duration = 350) {
  if (!canvasEl.value || !zoom || simNodes.length === 0 || !host.value) return;
  // A pane that has not been laid out has no box, and a simulation that has
  // not ticked has no positions. Either one turns the maths below into NaN or
  // a zero scale.
  const w = host.value.clientWidth, h = host.value.clientHeight;
  if (w <= 0 || h <= 0) return;
  // Skip the nodes the layout has not placed yet rather than abandoning the
  // fit because of them.
  const xs: number[] = [], ys: number[] = [];
  for (const n of simNodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    xs.push(n.x!); ys.push(n.y!);
  }
  if (xs.length === 0) return;
  const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
  const k = Math.min(1.6, 0.92 / Math.max((x1 - x0) / w, (y1 - y0) / h));
  if (!Number.isFinite(k) || k <= 0) return;
  const tx = w / 2 - (k * (x0 + x1)) / 2, ty = h / 2 - (k * (y0 + y1)) / 2;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
  d3.select(canvasEl.value).transition().duration(duration).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  userZoomed = false;
}

function zoomBy(factor: number) {
  if (!canvasEl.value || !zoom) return;
  d3.select(canvasEl.value).transition().duration(200).call(zoom.scaleBy, factor);
}
/**
 * Bring one node to the middle of the canvas. A node that has just been
 * revealed (a file inside a component opened a moment ago) has no position
 * yet, so this waits for the layout to place it rather than doing nothing.
 */
function focusNode(id: string, tries = 0) {
  const p = positions.get(id);
  if (!p) {
    if (tries < 40) window.setTimeout(() => focusNode(id, tries + 1), 100);
    return;
  }
  if (!canvasEl.value || !zoom || !host.value) return;
  const w = host.value.clientWidth, h = host.value.clientHeight;
  // Close in a little if the view is far out, but never pull back from a
  // framing the architect chose.
  const k = Math.min(2.2, Math.max(transform.k, 0.9));
  if (w <= 0 || h <= 0 || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(k) || k <= 0) return;
  const target = d3.zoomIdentity.translate(w / 2 - p.x * k, h / 2 - p.y * k).scale(k);
  userZoomed = true;
  d3.select(canvasEl.value).transition().duration(420).ease(d3.easeCubicOut).call(zoom.transform, target);
}

// ── Export ──────────────────────────────────────────────────────────────

/** The graph as it is framed now, redrawn offscreen at twice the density, without hover. */
function exportFigure(opts: FigureOptions): FigureOutput | null {
  if (!ctx || !canvasEl.value || simNodes.length === 0) return null;
  const width = host.value?.clientWidth || 800;
  const height = host.value?.clientHeight || 600;
  const scale = 2;
  const off = document.createElement("canvas");
  off.width = Math.round(width * scale);
  off.height = Math.round(height * scale);
  const offCtx = off.getContext("2d");
  if (!offCtx) return null;
  const saved = { ctx, dpr, hoverId };
  const run = () => {
    refreshChartTheme();
    ctx = offCtx; dpr = scale; exportCanvas = off; hoverId = null;
    try { draw(); } finally { ctx = saved.ctx; dpr = saved.dpr; exportCanvas = null; hoverId = saved.hoverId; }
  };
  if (opts.light) withLightTokens(run); else run();
  refreshChartTheme();
  requestDraw();
  return { kind: "canvas", canvas: off, width, height, scale, legend: figureLegend(opts) };
}

const dynamicPairs = computed(() => props.edges.filter(isDynamicOnly).length);

function figureLegend(opts: FigureOptions): LegendItem[] {
  const t = opts.light ? withLightTokens(() => readChartTheme()) : chartTheme();
  const out: LegendItem[] = [{ label: props.directed ? "Depends on (arrow points at the dependency)" : "Changed together", color: t.inkMuted, line: true }];
  if (props.edges.some(isDynamicOnly)) out.push({ label: "Only by runtime lookup", color: t.inkMuted, dashed: true });
  if (props.cycleKeys.size) out.push({ label: "In a cycle", color: t.red, line: true });
  for (const h of props.hulls) if (h.color) out.push({ label: h.name, color: h.color });
  if (props.suggestions.length) out.push({ label: "Suggested group", color: t.inkMuted, dashed: true });
  return out;
}

useExportables().register({ kind: "figure", title: "Connections graph", ready: () => !!ctx && simNodes.length > 0, render: exportFigure, svg: false });

defineExpose({ zoomIn: () => zoomBy(1.3), zoomOut: () => zoomBy(1 / 1.3), resetZoom: () => fit(), focusNode, exportFigure });

function shorten(label: string, max: number): string {
  return label.length > max ? "…" + label.slice(-(max - 1)) : label;
}

function onResize() {
  sizeCanvas();
  requestDraw();
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!userZoomed) fit(); }, 100);
}
function onScheme() {
  refreshChartTheme();
  requestDraw();
}

onMounted(() => {
  setup();
  rebuild();
  observer = new ResizeObserver(onResize);
  if (host.value) observer.observe(host.value);
  window.addEventListener("resize", onResize);
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onScheme);
});
onBeforeUnmount(() => {
  simulation?.stop();
  stopSettle();
  if (drawFrame) cancelAnimationFrame(drawFrame);
  observer?.disconnect();
  window.removeEventListener("resize", onResize);
  media?.removeEventListener("change", onScheme);
});
watch(() => [props.nodes, props.edges, props.directed, props.hulls.map(h => h.key).join(), props.suggestions.map(s => s.key + ":" + s.members.length).join()], rebuild);
watch(() => [props.selectedId, props.selectedPair, props.multi, props.hovered, props.suggestions, props.hulls, props.cycleKeys, props.cycleNodes, props.cycleStrong, props.badges, props.highlight], () => { restyle(); placeSuggestionLabels(); });
</script>
