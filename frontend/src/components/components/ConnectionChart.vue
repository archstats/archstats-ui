<template>
  <div class="chart-container h-full">
    <div :id="chartId" ref="chart" class=""></div>

  </div>
</template>

<script setup lang="ts">
import *  as d3 from 'd3'
import {computed, defineProps, onMounted, ref, watchEffect, watch, readonly} from "vue";
import {Component, Connection, directPredecessors,
  directSuccessors, predecessors,
  resizeConnectionsOnComponents, sinks, sources, successors} from "~/utils/components";
import {ForceLink, Simulation, SimulationLinkDatum, SimulationNodeDatum} from "d3";


const chartId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2, 10)


const props = defineProps<{
  components: Component[]
}>()
const computedComponents = computed(() => {
  return props.components
})

watch(() => props.components, () => {
  renderChart(computedComponents.value);
})
onMounted(() => {
  renderChart(computedComponents.value);
});
watchEffect(() => {
  renderChart(computedComponents.value);
});

// @ts-ignore
function linkArc(d) {
  const r = Math.hypot(d.target.x - d.source.x, d.target.y - d.source.y);
  return `
    M${d.source.x},${d.source.y}
    A${r},${r} 0 0,1 ${d.target.x},${d.target.y}
  `;
}

function drag(simulation: Simulation<ComponentWithNodeDatum, ConnectionWithLinkDatum> ) {
  return d3.drag<SVGElement, ComponentWithNodeDatum>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
}

function renderChart(components: Component[]) {
  const width = 500, height = 500;
  const nodes: ComponentWithNodeDatum[] = components.map(c => {
    return {
      ...c,
    } as ComponentWithNodeDatum
  });
  const nodeLookup = new Map<string, ComponentWithNodeDatum>(nodes.map(n => [n.name, n]))
  const connections = nodes.flatMap(comp => {
    return comp.connections.filter(c => c.type === "OUTGOING").map(c => {
      return {
        ...c,
      }
    })
  });
  const links: ConnectionWithLinkDatum[] = connections.map(c => {
    return {
      ...c,
      source: nodeLookup.get(c.from.name),
      target: nodeLookup.get(c.to.name),
    } as ConnectionWithLinkDatum
  });


  // const nodeSizes = nodes.map(node => node[sizeProp])
  // const nodeSizeScale = d3.scaleLinear().domain([d3.min(nodeSizes), d3.max(nodeSizes)]).range([4.0, 20.0]);

  const forceLink: ForceLink<ComponentWithNodeDatum, ConnectionWithLinkDatum> = d3.forceLink(links);
  const simulation: Simulation<ComponentWithNodeDatum, ConnectionWithLinkDatum> = d3.forceSimulation(nodes)
      .force("link", forceLink.id(d => d.name))
      .force("charge", d3.forceManyBody().strength(-80))
      .force("x", d3.forceX())
      .force("y", d3.forceY());


  const chart = d3.select(`#${chartId}`);
  chart.selectAll("*").remove()
  const svg = chart.append("svg")
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .style("font", "12px monospace");

  svg.append("defs")
      .selectAll("marker")
      .data(links)
      .join("marker")
      .attr("id", d => `arrow-${d.index}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#000000")
      .attr("d", "M0,-5L10,0L0,5");
  const link = svg.append("g")
      .attr("fill", "none")

      .selectAll("path")
      .data(links)
      .join("path")
      .attr("stroke", "#000000")
      // .attr("marker-end", d => `url(${new URL(`#arrow-${d.index}`, location as unknown as string)})`);

  const node = svg.append("g")
      .attr("fill", "currentColor")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .selectAll("g")
      .data(nodes)
      .join("g")
      // @ts-ignore
      .call(drag(simulation));
  node.append("circle")
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .attr("class", "fill-tertiary-500")
      .attr("r", d => 4);
  node.append("text")
      .attr("x", 8)
      .attr("y", "0.31em")
      .attr("font-size", "0.35rem")
      .text(d => d.name || "unknown")
      .clone(true).lower()
      .attr("fill", "none")
      .attr("stroke", "white")

      .attr("stroke-width", 3);


  simulation.on("tick", () => {
    link.attr("d", linkArc);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

interface ComponentWithNodeDatum extends  SimulationNodeDatum, Component {

}
interface ConnectionWithLinkDatum extends Connection, SimulationLinkDatum<ComponentWithNodeDatum>{
  source: ComponentWithNodeDatum,
  target: ComponentWithNodeDatum,
}
</script>
