<template>
  <div ref="host" class="relative h-full w-full overflow-hidden bg-surface">
    <svg
      ref="svgEl"
      class="block h-full w-full select-none"
      :class="lasso ? 'cursor-crosshair' : 'cursor-grab'"
      @pointerdown="onBackgroundDown"
      @pointermove="onBackgroundMove"
      @pointerup="onBackgroundUp"
      @pointercancel="onBackgroundUp"
      @click.self="onBackgroundClick"
    ></svg>
    <!-- What the three marks mean, showing only the kinds actually on screen. -->
    <div v-if="kindsPresent.length > 1" class="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded bg-surface/80 px-2 py-1 backdrop-blur-sm">
      <span v-for="k in kindsPresent" :key="k" class="flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="-7 -7 14 14" aria-hidden="true">
          <path :d="nodePath(k, k === 'group' ? 6 : k === 'component' ? 5 : 4)" :fill="k === 'file' ? 'rgb(var(--c-surface))' : 'rgb(var(--c-neutral-500))'" :fill-opacity="k === 'group' ? 0.25 : 1" :stroke="k === 'component' ? 'rgb(var(--c-surface))' : 'rgb(var(--c-neutral-500))'" :stroke-width="k === 'group' ? 2 : k === 'file' ? 1.6 : 1.2"/>
        </svg>
        <span class="text-xs text-neutral-500">{{ KIND_WORD[k] }}</span>
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
import { chartTheme } from "~/composables/useChartTheme";
import Icon from "~/components/ui/common/Icon.vue";
import { type CEdge, type CNode, type GroupSuggestion, edgeKey, idsInRect, topDegreeIds } from "~/utils/connections";
import type { Hull as ModelHull } from "~/composables/useConnectionsModel";
import { begin, count } from "~/utils/perf";

// The merged coupling view: a force layout where a node is a component, a
// file or a collapsed group, coloured by the group it belongs to. Hulls
// outline groups; dashed hulls are suggestions waiting to be accepted.
// Positions survive data changes by id so switching source or scope moves
// only what changed.

interface SimNode extends d3.SimulationNodeDatum { id: string; node: CNode; r: number }
interface SimLink extends d3.SimulationLinkDatum<SimNode> { edge: CEdge; /** Where the line stops, inset for the arrow head; written once per frame. */ tx?: number; ty?: number }

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
const svgEl = ref<SVGSVGElement | null>(null);
const lasso = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
const KIND_WORD: Record<string, string> = { group: "Group", component: "Component", file: "File" };
const KIND_ORDER = ["group", "component", "file"];
const kindsPresent = computed(() => KIND_ORDER.filter(k => props.nodes.some(n => n.kind === k)));

const suggestionLabels = ref<Array<{ key: string; name: string; count: number; x: number; y: number; reason?: string; reasons: string[]; split?: number; locked?: boolean }>>([]);

let simulation: d3.Simulation<SimNode, SimLink> | null = null;
let fittedEarly = false;
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
let transform = d3.zoomIdentity;
let userZoomed = false;
let simNodes: SimNode[] = [];
let simLinks: SimLink[] = [];
const positions = new Map<string, { x: number; y: number }>();
let observer: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let media: MediaQueryList | null = null;
let layers: {
  viewport: d3.Selection<SVGGElement, unknown, null, undefined>
  hulls: d3.Selection<SVGGElement, unknown, null, undefined>
  links: d3.Selection<SVGGElement, unknown, null, undefined>
  nodes: d3.Selection<SVGGElement, unknown, null, undefined>
  labels: d3.Selection<SVGGElement, unknown, null, undefined>
  slices: d3.Selection<SVGGElement, unknown, null, undefined>
  hits: d3.Selection<SVGGElement, unknown, null, undefined>
  markers: d3.Selection<SVGGElement, unknown, null, undefined>
  badges: d3.Selection<SVGGElement, unknown, null, undefined>
  lasso: d3.Selection<SVGRectElement, unknown, null, undefined>
} | null = null;

const nodeById = computed(() => new Map(props.nodes.map(n => [n.id, n])));

/**
 * The selections the frame loop writes to, resolved once per rebuild rather
 * than once per frame.
 *
 * `selectAll` walks the DOM and allocates an array of every match. Doing that
 * eight times a frame, over 454 nodes and 2,603 lines, cost more than the
 * attribute writes it was preparing for. Only `rebuild` changes which
 * elements exist, so only `rebuild` needs to look them up.
 */
let drawn: {
  lines: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>
  nodes: d3.Selection<SVGPathElement, SimNode, SVGGElement, unknown>
  slices: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>
  hits: d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>
  labels: d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown>
  markers: d3.Selection<SVGCircleElement, SimLink, SVGGElement, unknown>
  badges: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>
} | null = null;

/** Node radius by id, for the hull maths that used to scan every node. */
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

function setup() {
  const svg = svgEl.value;
  if (!svg) return;
  const root = d3.select(svg);
  root.selectAll("*").remove();
  const defs = root.append("defs");
  defs.append("marker").attr("id", "cx-arrow").attr("viewBox", "0 -4 8 8").attr("refX", 8).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L8,0L0,4").attr("class", "arrow");
  const viewport = root.append("g");
  layers = {
    viewport,
    hulls: viewport.append("g"),
    links: viewport.append("g"),
    nodes: viewport.append("g"),
    // Drawn over the node, never instead of it: a split component keeps its
    // place and its size and only stops being one colour.
    slices: viewport.append("g"),
    labels: viewport.append("g"),
    // Nodes are drawn small and the whole graph is usually zoomed out to fit,
    // so what you aim at is not what is painted: an invisible disc, never
    // smaller than a fingertip on screen, carries every pointer gesture.
    hits: viewport.append("g"),
    markers: viewport.append("g"),
    badges: viewport.append("g"),
    lasso: root.append("rect").attr("fill", "none").attr("stroke-dasharray", "4 3").attr("stroke-width", 1).style("display", "none"),
  };
  zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 4])
    // Without an extent, d3 reads the svg's own width attribute; this one is
    // sized in CSS, so that read throws the moment the pane is not rendered.
    // The host's box is the truth either way.
    .extent(() => [[0, 0], [host.value?.clientWidth || 800, host.value?.clientHeight || 600]])
    .filter((event) => !event.shiftKey && (event.type === "wheel" || event.button === 0))
    .on("zoom", (event) => {
      transform = event.transform;
      if (event.sourceEvent) userZoomed = true;
      viewport.attr("transform", transform.toString());
      sizeHits();
      placeSuggestionLabels();
    });
  sizeSvg();
  root.call(zoom).on("dblclick.zoom", null);
}

/**
 * An svg sized only by CSS carries a relative width, and reading that throws
 * whenever the pane is not rendered. Stating it in attributes leaves no
 * relative length on the element, whichever library reaches for one.
 */
function sizeSvg(): { width: number; height: number } {
  const width = host.value?.clientWidth || 800;
  const height = host.value?.clientHeight || 600;
  if (svgEl.value) d3.select(svgEl.value).attr("width", width).attr("height", height);
  return { width, height };
}

function rebuild() {
  const endRebuild = begin("graph.rebuild");
  if (!layers) return;
  const t = chartTheme();
  const { width, height } = sizeSvg();
  const ids = new Set(props.nodes.map(n => n.id));
  simNodes = props.nodes.map((n, i) => {
    const p = positions.get(n.id);
    const angle = (i / Math.max(props.nodes.length, 1)) * Math.PI * 2;
    return { id: n.id, node: n, r: radius(n), x: p?.x ?? width / 2 + Math.cos(angle) * 200, y: p?.y ?? height / 2 + Math.sin(angle) * 200 };
  });
  const byId = new Map(simNodes.map(n => [n.id, n]));
  simLinks = props.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => ({ source: byId.get(e.from)!, target: byId.get(e.to)!, edge: e }));

  // Unconnected nodes would otherwise drift to the corners under repulsion
  // and stretch the fit; they sit on an outer ring instead, still there, out
  // of the way.
  const degree = new Map<string, number>();
  for (const l of simLinks) { degree.set((l.source as SimNode).id, 1); degree.set((l.target as SimNode).id, 1); }
  const isolated = (d: SimNode) => !degree.has(d.id);
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
    .on("end", () => { if (!userZoomed) fit(); });
  fittedEarly = false;

  const link = layers.links.selectAll<SVGLineElement, SimLink>("line").data(simLinks, (d: any) => d.edge.from + "|" + d.edge.to);
  link.exit().remove();
  link.enter().append("line").style("cursor", "pointer")
    .on("click", (event, d) => { event.stopPropagation(); emit("select-pair", d.edge.from, d.edge.to); });

  const node = layers.nodes.selectAll<SVGPathElement, SimNode>("path").data(simNodes, d => d.id);
  node.exit().remove();
  node.enter().append("path").style("pointer-events", "none");

  const hit = layers.hits.selectAll<SVGCircleElement, SimNode>("circle").data(simNodes, d => d.id);
  hit.exit().remove();
  hit.enter().append("circle").attr("fill", "none").style("pointer-events", "all").style("cursor", "pointer")
    .call(d3.drag<SVGCircleElement, SimNode>()
      .on("start", (event, d) => { if (!event.active) simulation?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; dragFrom = { x: d.x ?? 0, y: d.y ?? 0 }; })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) simulation?.alphaTarget(0);
        d.fx = null; d.fy = null;
        // A real drag that ends inside a region moves the node into it.
        if ((props.suggestions.length || props.hulls.length) && dragFrom && Math.hypot((d.x ?? 0) - dragFrom.x, (d.y ?? 0) - dragFrom.y) > 14) {
          const key = regionAt(d.x ?? 0, d.y ?? 0, d.id);
          emit("drop-in-hull", { id: d.id, key });
        }
        dragFrom = null;
      }))
    .on("click", (event, d) => { event.stopPropagation(); emit("select", d.id, { shift: event.shiftKey, meta: event.metaKey || event.ctrlKey }); })
    .on("dblclick", (event, d) => { event.stopPropagation(); emit("activate", d.id); })
    .on("contextmenu", (event, d) => { event.preventDefault(); event.stopPropagation(); emit("context", { id: d.id, x: event.clientX, y: event.clientY }); })
    .on("mouseenter", (_, d) => emit("hover", d.id))
    .on("mouseleave", () => emit("hover", null))
    .append("title");

  // One wedge per group holding a share of a split component. Only the split
  // ones are here, so this layer is empty in the ordinary case.
  const divided = simNodes.filter(n => (n.node.slices?.length ?? 0) > 1);
  const wedges = layers.slices.selectAll<SVGGElement, SimNode>("g").data(divided, d => d.id);
  wedges.exit().remove();
  wedges.enter().append("g").style("pointer-events", "none");
  layers.slices.selectAll<SVGGElement, SimNode>("g").each(function (d) {
    const slices = d.node.slices ?? [];
    const total = slices.reduce((s, x) => s + Math.max(0, x.share), 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = slices.map(sl => {
      const span = (Math.max(0, sl.share) / total) * Math.PI * 2;
      const arc = { d: wedgePath(d.r, angle, angle + span), color: sl.color };
      angle += span;
      return arc;
    });
    const sel = d3.select(this).selectAll<SVGPathElement, { d: string; color: string }>("path").data(arcs);
    sel.exit().remove();
    sel.enter().append("path").merge(sel)
      .attr("d", a => a.d)
      .attr("fill", a => a.color)
      .attr("stroke", chartTheme().surface)
      .attr("stroke-width", 1);
  });

  const label = layers.labels.selectAll<SVGTextElement, SimNode>("text").data(simNodes, d => d.id);
  label.exit().remove();
  label.enter().append("text").attr("text-anchor", "middle").style("pointer-events", "none").attr("font-family", t.fontMono).attr("font-size", 11).attr("paint-order", "stroke").attr("stroke-width", 3).attr("stroke-linejoin", "round");

  // Loop markers sit on the midpoint of every edge inside a marked cycle; badges count cycles folded inside a closed node.
  const marker = layers.markers.selectAll<SVGCircleElement, SimLink>("circle").data(simLinks, (d: any) => d.edge.from + "|" + d.edge.to);
  marker.exit().remove();
  marker.enter().append("circle").attr("r", 4.5).style("cursor", "pointer")
    .on("click", (event, d) => { event.stopPropagation(); emit("select-cycle", d.edge.from); })
    .append("title").text("Part of a cycle. Click to inspect it.");
  const badge = layers.badges.selectAll<SVGGElement, SimNode>("g").data(simNodes, d => d.id);
  badge.exit().remove();
  const badgeEnter = badge.enter().append("g").style("pointer-events", "none");
  badgeEnter.append("circle").attr("r", 7.5);
  badgeEnter.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-family", t.fontMono).attr("font-size", 9).attr("font-weight", 600);

  drawn = {
    lines: layers.links.selectAll<SVGLineElement, SimLink>("line"),
    nodes: layers.nodes.selectAll<SVGPathElement, SimNode>("path"),
    slices: layers.slices.selectAll<SVGGElement, SimNode>("g"),
    hits: layers.hits.selectAll<SVGCircleElement, SimNode>("circle"),
    labels: layers.labels.selectAll<SVGTextElement, SimNode>("text"),
    markers: layers.markers.selectAll<SVGCircleElement, SimLink>("circle"),
    badges: layers.badges.selectAll<SVGGElement, SimNode>("g"),
  };
  radii.clear();
  for (const n of simNodes) radii.set(n.id, n.r);

  count("graph.nodes", simNodes.length);
  count("graph.links", simLinks.length);
  endRebuild();
  restyle();
  sizeHits();
  tick();
}

function tick() {
  if (!layers) return;
  const endTick = begin("graph.tick");
  for (const n of simNodes) positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  // The layout settles for seconds; fit once as soon as the rough shape is
  // there so a level or source switch never shows the previous zoom.
  if (!fittedEarly && simulation && simulation.alpha() < 0.45 && !userZoomed) { fittedEarly = true; fit(150); }
  if (!drawn) { endTick(); return; }
  // The lines are the bulk of the drawing — 2,603 of them against 454 nodes —
  // so they are written by hand. `.attr()` walks the whole selection once per
  // attribute, which is four passes and four closure calls per line; this is
  // one pass that also works out where the line ends, which used to cost two
  // square roots per line for the arrow-head inset alone.
  const directed = props.directed;
  drawn.lines.each(function (l) {
    const s = l.source as SimNode, t = l.target as SimNode;
    let tx = t.x!, ty = t.y!;
    if (directed) {
      const dx = tx - s.x!, dy = ty - s.y!;
      const k = (Math.hypot(dx, dy) - t.r - 2) / (Math.hypot(dx, dy) || 1);
      tx = s.x! + dx * k; ty = s.y! + dy * k;
    }
    l.tx = tx; l.ty = ty;
    this.setAttribute("x1", String(s.x!));
    this.setAttribute("y1", String(s.y!));
    this.setAttribute("x2", String(tx));
    this.setAttribute("y2", String(ty));
  });
  drawn.nodes.attr("transform", d => `translate(${d.x!},${d.y!})`);
  if (!drawn.slices.empty()) drawn.slices.attr("transform", d => `translate(${d.x!},${d.y!})`);
  drawn.hits.attr("cx", d => d.x!).attr("cy", d => d.y!);
  drawn.labels.attr("x", d => d.x!).attr("y", d => d.y! + d.r + 12);
  // Markers and badges are hidden unless something asked for them, and a
  // hidden element still costs a write. They are placed by `restyle` on the
  // frame they appear, so skipping them here cannot leave them stale.
  if (props.cycleKeys.size) placeMarkers();
  if (props.badges.size) placeBadges();
  drawHulls();
  placeSuggestionLabels();
  endTick();
}

/**
 * Loop markers sit on the midpoint of an edge, so they need to know where
 * that edge ends. `tick` works that out for every link and caches it, but
 * `restyle` can run first — on the rebuild that creates them, before a single
 * frame — and reading the cache then wrote NaN into 2,603 circles and the
 * same number of console errors. It asks for the answer rather than assuming
 * someone has already produced it.
 */
function placeMarkers() {
  drawn?.markers.each(function (l) {
    if (l.tx === undefined) endpoints(l);
    const s = l.source as SimNode;
    const cx = (s.x! + l.tx!) / 2, cy = (s.y! + l.ty!) / 2;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    this.setAttribute("cx", String(cx));
    this.setAttribute("cy", String(cy));
  });
}
function placeBadges() {
  drawn?.badges.attr("transform", d => `translate(${d.x! + d.r * 0.75},${d.y! - d.r * 0.75})`);
}

/** Ten screen pixels of target, whatever the zoom has done to the drawing. */
function sizeHits() {
  if (!layers) return;
  const reach = 10 / Math.max(0.15, transform.k);
  drawn?.hits.attr("r", d => Math.max(d.r + 2, reach));
}

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

function degreeOf(id: string): number {
  let n = 0;
  for (const l of simLinks) if ((l.source as SimNode).id === id || (l.target as SimNode).id === id) n++;
  return n;
}

function restyle() {
  if (!layers || !drawn) return;
  const end = begin("graph.restyle");
  const t = chartTheme();
  const focus = props.hovered ?? props.selectedId;
  const neighbours = new Set<string>();
  if (focus) for (const e of props.edges) { if (e.from === focus) neighbours.add(e.to); if (e.to === focus) neighbours.add(e.from); }
  const marked = (id: string) => props.selectedId === id || props.multi.has(id);
  const spot = props.highlight?.members.length ? new Set(props.highlight.members) : null;
  const related = (id: string) => (spot ? spot.has(id) : !focus || id === focus || neighbours.has(id) || props.multi.has(id));
  const pair = props.selectedPair;
  const isPair = (e: CEdge) => !!pair && ((e.from === pair[0] && e.to === pair[1]) || (e.from === pair[1] && e.to === pair[0]));
  const n = simNodes.length;
  const labelIds = n <= 40 ? new Set(simNodes.map(x => x.id)) : topDegreeIds(props.nodes, props.edges, 20);

  // Soft marking (every cycle at once) tints cycle edges and rings their nodes;
  // loop markers only sit on mutual pairs, the direct two-way cycles. Strong
  // marking (one chosen cycle) paints its edges fully and marks every one.
  const strong = !!props.cycleStrong;
  const inCycle = (e: CEdge) => props.cycleKeys.has(edgeKey(e.from, e.to));
  const mutual = (e: CEdge) => inCycle(e) && props.cycleKeys.has(edgeKey(e.to, e.from)) && e.from < e.to;
  d3.select(svgEl.value).select(".arrow").attr("fill", t.hairlineStrong);
  drawn.lines
    .attr("stroke", d => (isPair(d.edge) ? t.accent : inCycle(d.edge) ? t.red : focus && (d.edge.from === focus || d.edge.to === focus) ? t.blue : t.hairlineStrong))
    .attr("stroke-opacity", d => (spot ? (spot.has(d.edge.from) && spot.has(d.edge.to) ? 0.7 : 0.05) : isPair(d.edge) ? 1 : !focus ? (inCycle(d.edge) ? (strong ? 0.95 : 0.4) : 0.55) : d.edge.from === focus || d.edge.to === focus ? 0.95 : inCycle(d.edge) && strong ? 0.6 : 0.08))
    .attr("stroke-width", d => (isPair(d.edge) ? 2.5 : (inCycle(d.edge) && strong ? 1.4 : 0.6) + d.edge.weight * 3))
    .attr("marker-end", props.directed ? "url(#cx-arrow)" : null);
  drawn.markers
    .style("display", d => ((strong ? inCycle(d.edge) : mutual(d.edge)) ? null : "none"))
    .attr("fill", t.surface).attr("stroke", t.red).attr("stroke-width", 1.5)
    .attr("opacity", d => (!focus || d.edge.from === focus || d.edge.to === focus ? 1 : 0.35));
  drawn.badges
    .style("display", d => (props.badges.has(d.id) ? null : "none"))
    .attr("opacity", d => (related(d.id) ? 1 : 0.25))
    .each(function (d) {
      const g = d3.select(this);
      g.select("circle").attr("fill", t.red).attr("stroke", t.surface).attr("stroke-width", 1.5);
      g.select("text").attr("fill", t.surface).text(String(props.badges.get(d.id) ?? ""));
    });
  drawn.nodes
    .attr("d", d => nodePath(d.node.kind, d.r))
    // A file is hollow: the ground shows through, so it reads as a leaf next
    // to the solid components and boxed groups around it.
    .attr("fill", d => (d.node.kind === "file" ? t.surface : d.node.color ?? t.hairlineStrong))
    .attr("fill-opacity", d => (d.node.kind === "file" ? 1 : d.node.kind === "group" ? 0.25 : degreeOf(d.id) ? 1 : 0.45))
    .attr("stroke", d => (marked(d.id) ? t.accent : props.cycleNodes.has(d.id) ? t.red : d.node.kind === "component" ? t.surface : d.node.color ?? t.hairlineStrong))
    .attr("stroke-width", d => (marked(d.id) ? 3 : props.cycleNodes.has(d.id) ? (strong ? 2.5 : 1.5) : d.node.kind === "group" ? 2 : d.node.kind === "file" ? 1.6 : 1.2))
    .attr("opacity", d => (related(d.id) ? 1 : 0.2));
  drawn.slices.attr("opacity", d => (related(d.id) ? 1 : 0.2));
  // The tooltip rides the hit disc, which is what the pointer actually meets.
  drawn.hits
    .select("title").text(d => `${d.node.label}\n${KIND_WORD[d.node.kind] ?? d.node.kind}`);
  // Each kind speaks in its own voice: a group in sans and semibold, a
  // component in mono, a file in smaller, quieter mono.
  drawn.labels
    .attr("font-family", d => (d.node.kind === "group" ? t.fontSans : t.fontMono))
    .attr("font-size", d => (d.node.kind === "group" ? 12 : d.node.kind === "file" ? 10 : 11))
    .attr("fill", d => (marked(d.id) || d.id === focus ? t.ink : d.node.kind === "file" ? t.inkMuted : t.inkSecondary))
    .attr("stroke", t.surface)
    .attr("font-weight", d => (marked(d.id) ? 600 : d.node.kind === "group" ? 600 : 400))
    .style("display", d => (d.node.kind === "group" || labelIds.has(d.id) || d.id === focus || marked(d.id) || (focus && neighbours.has(d.id)) || (spot && spot.has(d.id)) ? null : "none"))
    .attr("opacity", d => (related(d.id) ? 1 : 0.25))
    .text(d => shorten(d.node.label, d.node.kind === "group" ? 32 : 26));
  layers.lasso.attr("stroke", t.accent).attr("fill", t.accent).attr("fill-opacity", 0.06);
  // `tick` leaves these alone while nothing asks for them, so this is where
  // they catch up: cycle markers and badges appear between two frames of a
  // layout that may already have stopped.
  if (props.cycleKeys.size) placeMarkers();
  if (props.badges.size) placeBadges();
  end();
  drawHulls();
}

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

function hullPath(members: string[], key?: string): string | null {
  const pts: [number, number][] = [];
  for (const id of members) {
    const p = positions.get(id);
    const r = (radii.get(id) ?? 8) + 16;
    if (!p) continue;
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) pts.push([p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]);
  }
  if (pts.length < 3) return null;
  const hull = d3.polygonHull(pts);
  if (!hull) return null;
  if (key) hullPolygons.set(key, hull as [number, number][]);
  return d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6))(hull as [number, number][]);
}

function drawHulls() {
  if (!layers) return;
  const end = begin("graph.drawHulls");
  const t = chartTheme();
  const hulls = hullList();
  const sel = layers.hulls.selectAll<SVGPathElement, Hull>("path").data(hulls, d => d.key);
  sel.exit().remove();
  hullPolygons.clear();
  sel.enter().append("path").style("pointer-events", "none").merge(sel)
    .attr("d", d => hullPath(d.members, d.key))
    .attr("fill", d => d.color ?? t.inkMuted)
    .attr("fill-opacity", d => (props.highlight ? (d.key === "s:" + props.highlight.key ? 0.14 : 0.02) : d.dashed ? 0.05 : 0.09))
    .attr("stroke", d => d.color ?? t.inkSecondary)
    .attr("stroke-opacity", d => (props.highlight ? (d.key === "s:" + props.highlight.key ? 1 : 0.2) : d.dashed ? 0.7 : 0.5))
    .attr("stroke-width", d => (props.highlight && d.key === "s:" + props.highlight.key ? 1.8 : 1.2))
    .attr("stroke-dasharray", d => (d.dashed ? "5 4" : null))
    .attr("stroke-linejoin", "round");
  // The hull label is the handle for the open group: click closes it, right-click offers more.
  const labels = layers.hulls.selectAll<SVGTextElement, Hull>("text").data(hulls.filter(h => !h.dashed), d => d.key);
  labels.exit().remove();
  labels.enter().append("text").style("cursor", "pointer").attr("font-family", t.fontSans).attr("font-size", 11).attr("font-weight", 600).attr("text-anchor", "middle")
    .attr("paint-order", "stroke").attr("stroke-width", 3).attr("stroke-linejoin", "round")
    .on("click", (event, d) => { event.stopPropagation(); emit("close-hull", d.key); })
    .on("contextmenu", (event, d) => { event.preventDefault(); event.stopPropagation(); emit("context-hull", { key: d.key, x: event.clientX, y: event.clientY }); })
    .merge(labels)
    .attr("fill", d => d.color ?? t.inkSecondary)
    .attr("stroke", t.surface)
    .attr("x", d => centroid(d.members).x)
    .attr("y", d => top(d.members) - 6)
    .text(d => d.name + "  ×")
    .select("title").remove();
  layers.hulls.selectAll<SVGTextElement, Hull>("text").each(function (d) { d3.select(this).selectAll("title").data([d]).join("title").text(`Close ${d.name}`); });
  end();
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

function fit(duration = 350) {
  if (!svgEl.value || !zoom || simNodes.length === 0 || !host.value) return;
  // A pane that has not been laid out has no box, and a simulation that has
  // not ticked has no positions. Either one turns the maths below into NaN or
  // a zero scale, and handing that to a transition is what makes the browser
  // complain about a transform it cannot resolve.
  const w = host.value.clientWidth, h = host.value.clientHeight;
  if (w <= 0 || h <= 0) return;
  // Skip the nodes the layout has not placed yet rather than abandoning the
  // fit because of them: one unplaced node must not leave the whole graph
  // framed by a stale transform.
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
  d3.select(svgEl.value).transition().duration(duration).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  userZoomed = false;
}

function zoomBy(factor: number) {
  if (!svgEl.value || !zoom) return;
  d3.select(svgEl.value).transition().duration(200).call(zoom.scaleBy, factor);
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
  if (!svgEl.value || !zoom || !host.value) return;
  const w = host.value.clientWidth, h = host.value.clientHeight;
  // Close in a little if the view is far out, but never pull back from a
  // framing the architect chose.
  const k = Math.min(2.2, Math.max(transform.k, 0.9));
  if (w <= 0 || h <= 0 || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(k) || k <= 0) return;
  const target = d3.zoomIdentity.translate(w / 2 - p.x * k, h / 2 - p.y * k).scale(k);
  userZoomed = true;
  d3.select(svgEl.value).transition().duration(420).ease(d3.easeCubicOut).call(zoom.transform, target);
}

defineExpose({ zoomIn: () => zoomBy(1.3), zoomOut: () => zoomBy(1 / 1.3), resetZoom: () => fit(), focusNode });

// Lasso: shift-drag on the background selects every node inside the box.
function onBackgroundDown(event: PointerEvent) {
  if (!event.shiftKey || event.button !== 0 || event.target !== svgEl.value) return;
  const rect = svgEl.value!.getBoundingClientRect();
  lasso.value = { x0: event.clientX - rect.left, y0: event.clientY - rect.top, x1: event.clientX - rect.left, y1: event.clientY - rect.top };
  svgEl.value!.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function onBackgroundMove(event: PointerEvent) {
  if (!lasso.value || !layers) return;
  const rect = svgEl.value!.getBoundingClientRect();
  lasso.value.x1 = event.clientX - rect.left;
  lasso.value.y1 = event.clientY - rect.top;
  const l = lasso.value;
  layers.lasso.style("display", null)
    .attr("x", Math.min(l.x0, l.x1)).attr("y", Math.min(l.y0, l.y1))
    .attr("width", Math.abs(l.x1 - l.x0)).attr("height", Math.abs(l.y1 - l.y0));
}
function onBackgroundUp(event: PointerEvent) {
  if (!lasso.value || !layers) return;
  const l = lasso.value;
  lasso.value = null;
  layers.lasso.style("display", "none");
  try { svgEl.value!.releasePointerCapture(event.pointerId); } catch {}
  if (Math.abs(l.x1 - l.x0) < 4 && Math.abs(l.y1 - l.y0) < 4) return;
  const pts = simNodes.map(n => { const [x, y] = transform.apply([n.x!, n.y!]); return { id: n.id, x, y }; });
  emit("lasso", idsInRect(pts, l));
}
function onBackgroundClick(event: MouseEvent) {
  if (event.shiftKey) return;
  emit("select", null, { shift: false, meta: false });
}

function shorten(label: string, max: number): string {
  return label.length > max ? "…" + label.slice(-(max - 1)) : label;
}

function onResize() {
  sizeSvg();
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!userZoomed) fit(); }, 100);
}

onMounted(() => {
  setup();
  rebuild();
  observer = new ResizeObserver(onResize);
  if (host.value) observer.observe(host.value);
  window.addEventListener("resize", onResize);
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", restyle);
});
onBeforeUnmount(() => {
  simulation?.stop();
  observer?.disconnect();
  window.removeEventListener("resize", onResize);
  media?.removeEventListener("change", restyle);
});
watch(() => [props.nodes, props.edges, props.directed, props.hulls.map(h => h.key).join(), props.suggestions.map(s => s.key + ":" + s.members.length).join()], rebuild);
watch(() => [props.selectedId, props.selectedPair, props.multi, props.hovered, props.suggestions, props.hulls, props.cycleKeys, props.cycleNodes, props.cycleStrong, props.badges, props.highlight], () => { restyle(); placeSuggestionLabels(); });
</script>
