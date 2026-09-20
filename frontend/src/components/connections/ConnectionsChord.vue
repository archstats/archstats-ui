<template>
  <div ref="host" class="relative h-full w-full overflow-hidden bg-surface">
    <svg ref="svgEl" class="block h-full w-full select-none" @click.self="emit('select', null, { shift: false, meta: false })"></svg>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as d3 from "d3";
import { chartTheme } from "~/composables/useChartTheme";
import { type CEdge, type CNode, edgeKey, orderNodes, topDegreeIds } from "~/utils/connections";

// A chord diagram for every source: arcs are nodes (coloured by group),
// ribbons are edges (blue, weight as thickness). Directed sources draw the
// ribbon from the user to the used; undirected ones are symmetric.

const props = defineProps<{
  nodes: CNode[]
  edges: CEdge[]
  directed: boolean
  selectedId: string | null
  selectedPair: [string, string] | null
  multi: Set<string>
  hovered: string | null
  cycleKeys?: Set<string>
  cycleNodes?: Set<string>
  badges?: Map<string, number>
}>();

const emit = defineEmits<{
  (e: "select", id: string | null, mods: { shift: boolean; meta: boolean }): void
  (e: "select-pair", from: string, to: string): void
  (e: "hover", id: string | null): void
  (e: "activate", id: string): void
  (e: "context", payload: { id: string; x: number; y: number }): void
}>();

const host = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
let observer: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let media: MediaQueryList | null = null;

function render() {
  const svg = svgEl.value;
  const el = host.value;
  if (!svg || !el) return;
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width < 50 || height < 50) return;
  const t = chartTheme();
  const nodes = orderNodes(props.nodes);
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const root = d3.select(svg);
  root.selectAll("*").remove();
  if (n === 0) return;

  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of props.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    const v = Math.max(e.weight, 0.02);
    matrix[a][b] += v;
    if (!props.directed) matrix[b][a] += v;
  }

  const labelBudget = n > 60 ? 150 : 110;
  const outer = Math.max(Math.min(width, height) / 2 - labelBudget, 60);
  const inner = Math.max(outer - 12, 40);
  const chord = (props.directed ? d3.chordDirected() : d3.chord()).padAngle(Math.min(0.03, 2 / n)).sortSubgroups(d3.descending);
  const chords = chord(matrix);
  const arc = d3.arc<d3.ChordGroup>().innerRadius(inner).outerRadius(outer);
  const ribbon = (props.directed ? d3.ribbonArrow() : d3.ribbon()).radius(inner - 2) as any;
  const g = root.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  const labelIds = n > 60 ? topDegreeIds(props.nodes, props.edges, 40) : new Set(nodes.map(x => x.id));
  const focus = props.hovered ?? props.selectedId;
  const focusIdx = focus ? index.get(focus) : undefined;
  const touches = (c: d3.Chord) => focusIdx === undefined || c.source.index === focusIdx || c.target.index === focusIdx;
  const isPair = (c: d3.Chord) => {
    const p = props.selectedPair;
    if (!p) return false;
    const s = nodes[c.source.index].id, d = nodes[c.target.index].id;
    return (s === p[0] && d === p[1]) || (s === p[1] && d === p[0]);
  };
  const isMarked = (id: string) => props.selectedId === id || props.multi.has(id);

  const inCycle = (c: d3.Chord) => !!props.cycleKeys && (props.cycleKeys.has(edgeKey(nodes[c.source.index].id, nodes[c.target.index].id)) || props.cycleKeys.has(edgeKey(nodes[c.target.index].id, nodes[c.source.index].id)));
  const ribbons = g.append("g").selectAll("path").data(chords).join("path")
    .attr("d", ribbon)
    .attr("fill", (c) => (isPair(c) ? t.accent : inCycle(c) ? t.red : t.blue))
    .attr("fill-opacity", (c) => (isPair(c) ? 0.9 : touches(c) ? (focusIdx === undefined ? (inCycle(c) ? 0.6 : 0.35) : 0.75) : inCycle(c) ? 0.2 : 0.06))
    .attr("stroke", t.surface)
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer")
    .on("click", (event, c) => { event.stopPropagation(); emit("select-pair", nodes[c.source.index].id, nodes[c.target.index].id); })
    .on("mouseenter", (_, c) => emit("hover", nodes[c.source.index].id))
    .on("mouseleave", () => emit("hover", null));
  ribbons.append("title").text((c) => `${nodes[c.source.index].label} ${props.directed ? "uses" : "with"} ${nodes[c.target.index].label}`);

  const groups = g.append("g").selectAll("g").data(chords.groups).join("g");
  groups.append("path")
    .attr("d", arc as any)
    .attr("fill", (d) => nodes[d.index].color ?? t.hairlineStrong)
    .attr("stroke", (d) => (isMarked(nodes[d.index].id) ? t.accent : props.cycleNodes?.has(nodes[d.index].id) ? t.red : t.surface))
    .attr("stroke-width", (d) => (isMarked(nodes[d.index].id) ? 2.5 : props.cycleNodes?.has(nodes[d.index].id) ? 2 : 1))
    .attr("fill-opacity", (d) => (focusIdx === undefined || focusIdx === d.index || chords.some(c => (c.source.index === focusIdx && c.target.index === d.index) || (c.target.index === focusIdx && c.source.index === d.index)) ? 1 : 0.25))
    .style("cursor", "pointer")
    .on("click", (event, d) => { event.stopPropagation(); emit("select", nodes[d.index].id, { shift: event.shiftKey, meta: event.metaKey || event.ctrlKey }); })
    .on("dblclick", (event, d) => { event.stopPropagation(); emit("activate", nodes[d.index].id); })
    .on("contextmenu", (event, d) => { event.preventDefault(); emit("context", { id: nodes[d.index].id, x: event.clientX, y: event.clientY }); })
    .on("mouseenter", (_, d) => emit("hover", nodes[d.index].id))
    .on("mouseleave", () => emit("hover", null))
    .append("title").text((d) => nodes[d.index].label);

  groups.filter((d) => labelIds.has(nodes[d.index].id) || nodes[d.index].id === focus || props.multi.has(nodes[d.index].id))
    .append("text")
    .each((d: any) => { d.angle = (d.startAngle + d.endAngle) / 2; })
    .attr("dy", "0.32em")
    .attr("transform", (d: any) => `rotate(${(d.angle * 180) / Math.PI - 90}) translate(${outer + 6}) ${d.angle > Math.PI ? "rotate(180)" : ""}`)
    .attr("text-anchor", (d: any) => (d.angle > Math.PI ? "end" : null))
    .attr("font-family", t.fontMono)
    .attr("font-size", n > 60 ? 10 : 11)
    .attr("fill", (d) => (nodes[d.index].id === focus || isMarked(nodes[d.index].id) ? t.ink : t.inkSecondary))
    .attr("font-weight", (d) => (isMarked(nodes[d.index].id) ? 600 : 400))
    .style("pointer-events", "none")
    .text((d) => shorten(nodes[d.index].label, n > 60 ? 22 : 30));
}

function shorten(label: string, max: number): string {
  return label.length > max ? "…" + label.slice(-(max - 1)) : label;
}

function scheduleRender() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 100);
}

onMounted(() => {
  render();
  observer = new ResizeObserver(scheduleRender);
  if (host.value) observer.observe(host.value);
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", scheduleRender);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  media?.removeEventListener("change", scheduleRender);
});
watch(() => [props.nodes, props.edges, props.directed, props.selectedId, props.selectedPair, props.multi, props.hovered, props.cycleKeys, props.cycleNodes], render);
</script>
