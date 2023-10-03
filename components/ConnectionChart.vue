<template>
  <div class="chart-container">
    <div class="text-gray-700 w-1/2">
      <h2 class="text-3xl mb-4 font-bold text-sky-500">Coupling View</h2>
      <p class=" mb-4 text-gray-700">The Coupling View depicts the following: </p>
      <ul class="mb-12 pl-8 flex flex-col gap-4">
        <li><span class="text-sky-500 font-bold">Efferent and Afferent Couplings</span> between components. The connection flows in the direction of the arrow. The
          amount of connections between components is represented in the attraction between components, and the
          thickness of lines.
        </li>
        <li><span class="text-sky-500 font-bold">Component Size</span> relative to other components. The relative size is configurable.</li>
      </ul>
    </div>

    <div class="mb-4 flex gap-16 ">
      <div class="flex gap-2">
        <div>
          <label>Filter (RegEx) </label>
          <input type="text" v-model="filter"
                 class="p-2 box-border bg-gray-100 border-sky-400 rounded border-2 outline-sky-700">
        </div>
        <div class="self-center">
          <input type="checkbox" v-model="inverse"
                 class="p-2 box-border bg-gray-100 border-sky-400 rounded border-2 outline-sky-700">
          <label> Inverse</label>
        </div>
      </div>
      <div class="">
        <label>Max Connections </label>
        <input type="number" v-model="maxConnections"
               class="p-2 box-border bg-gray-100 border-sky-400 w-20 rounded border-2 outline-sky-700">
      </div>
      <div>
        <label>Component Size </label>
        <select v-model="relativeSize"
                class="p-2 box-border bg-gray-100 border-sky-400 rounded border-2 outline-sky-700">
          <option v-for="stat in distinctStats" :key="stat" :value="stat">{{ stat }}</option>
        </select>
      </div>

    </div>
    <div :id="chartId" ref="chart" class="border-2 border-sky-400"></div>
    <div class="grid grid-cols-2 auto-cols-min auto-rows-min w-fit mt-2 text-gray-500">
      <div>{{ computedComponents.length }}/{{ components.length }}</div>
      <div>Components</div>
    </div>
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


const filter = ref('')
const maxConnections = ref(30)
const inverse = ref(false)
const relativeSize = ref('afferent_couplings')


const computedComponents = computed(() => {
  if (!filter.value) return props.components
  return resizeConnectionsOnComponents(props.components.filter(c =>c.name.match(filter.value)))
})

const distinctStats = computed(() => {
  const properties = {}
  props.components.forEach(c => {
    Object.keys(c).forEach(k => {
      properties[k] = true
    })
  })
  return Object.keys(properties).filter(k => k !== 'name')
})


watch(() => props.components, () => {
  renderChart(computedComponents.value, relativeSize.value);
})
onMounted(() => {
  renderChart(computedComponents.value, relativeSize.value);
});
watchEffect(() => {
  renderChart(computedComponents.value, relativeSize.value);
});

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

function renderChart(components: Component[], sizeProp = "afferent_couplings") {
  const width = 500, height = 225;
  const nodes: ComponentWithNodeDatum[] = components.map(c => {
    return {
      ...c,
    } as ComponentWithNodeDatum
  });
  const nodeLookup = new Map<string, ComponentWithNodeDatum>(nodes.map(n => [n.name, n]))
  const connections = nodes.flatMap(comp => {
    return [...comp.connections.filter(c => c.type === "OUTGOING").map(c => {
      return {
        ...c,
      }
    })]
  });
  const links: ConnectionWithLinkDatum[] = connections.map(c => {
    return {
      ...c,
      source: nodeLookup.get(c.from.name),
      target: nodeLookup.get(c.to.name),
    } as ConnectionWithLinkDatum
  });

  const connectionCounts = links.map(link => link.count)
  const connectionScale = d3.scaleLinear().domain([d3.min(connectionCounts), d3.max(connectionCounts)]).range([1.0, 2.0]);
  const connectionDistanceScale = d3.scaleLinear().domain([d3.max(connectionCounts), d3.min(connectionCounts)]).range([30, 85]);

  const nodeSizes = nodes.map(node => node[sizeProp])
  const nodeSizeScale = d3.scaleLinear().domain([d3.min(nodeSizes), d3.max(nodeSizes)]).range([4.0, 20.0]);

  const forceLink: ForceLink<ComponentWithNodeDatum, ConnectionWithLinkDatum> = d3.forceLink(links);
  const simulation: Simulation<ComponentWithNodeDatum, ConnectionWithLinkDatum> = d3.forceSimulation(nodes)
      .force("link", forceLink.id(d => d.name).distance(d => connectionDistanceScale(d.count)))
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
      .attr("refX", d => 1 / connectionScale(d.count) * 20)
      .attr("refY", d => connectionScale(d.count) * -0.5)
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
      .attr("stroke-width", d => {
        return connectionScale(d.count);
      })
      .attr("stroke", "#000000")
      .attr("marker-end", d => `url(${new URL(`#arrow-${d.index}`, location as unknown as string)})`);

  const node = svg.append("g")
      .attr("fill", "currentColor")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation));
  node.append("circle")
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .attr("class", "fill-sky-500")
      .attr("r", d => nodeSizeScale(d[sizeProp]));
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
