<template>
  <D3Chart ref="chartRef">
        <D3ChartTooltip v-if="hoveredComponent">
          <div class="bg-gray-100  flex-auto p-2 overflow-hidden ">
            {{ hoveredComponent.name}}
            <ComponentInfoTable :component="hoveredComponent"/>
          </div>
        </D3ChartTooltip>
  </D3Chart>
</template>

<script setup lang="ts">
import *  as d3 from 'd3'


import Headline from "../../ui/common/Headline.vue";
import {computed, defineProps, getCurrentInstance, nextTick, onMounted, Ref, ref, UnwrapRef, watch} from "vue";
import {Component, RawComponent} from "~/utils/components";
import {SimulationNodeDatum} from "d3-force";
import D3ChartTooltip from "../../ui/d3/D3ChartTooltip.vue";
import ComponentInfoTable from "../../ui/tables/InfoTable.vue";
import D3Chart from "../../ui/d3/D3Chart.vue";


const router = useRouter();

const chartRef = ref(null);

const props = defineProps<{
  components: Component[],
  relativeSize: string
}>()


const hoveredComponent = ref<RawComponent | null>(null)

type Node = { component: RawComponent; radius: number };
const nodes: Ref<UnwrapRef<Node[]>> = computed(() => props.components.map(component => {
  return {
    component: component,
    radius: component[props.relativeSize],
    x: Math.random() * 100,
    y: Math.random() * 100,
    vx: 0,
    vy: 0
  }
}));
const padding = 2; // separation between same-color nodes


onMounted(() => {
    renderChart();
    // TODO figure out why this is necessary
    renderChart();
});

watch(() => [hoveredComponent.value, props.relativeSize, props.components], () => {
renderChart();  renderChart();
})


const minRadius = 5.0;
const maxRadius = 40.0;
const nodeSizes = computed(() => nodes.value.map(node => node.component[props.relativeSize]))
const nodeSizeScale = computed(() => d3.scaleLinear().domain([d3.min(nodeSizes.value), d3.max(nodeSizes.value)]).range([minRadius, maxRadius]));
const simulation = computed(() => d3.forceSimulation()
    .force("charge", d3.forceManyBody())
    .force("collide", d3.forceCollide((d: any) => nodeSizeScale.value(d.radius) + padding))
    .force("cluster", (alpha: number) => {
      for (const node of nodes.value) {
        let x = node.x;
        let y = node.y;
        let l = Math.sqrt(x * x + y * y);
        let r = nodeSizeScale.value(node.radius);
        if (l !== r) {
          l = (l - r) / l * alpha;
          node.x -= x *= l;
          node.y -= y *= l;
        }
      }
    })
    .nodes(nodes.value as SimulationNodeDatum[]));

// The chart is a clustered bubble chart using forceCollide and forceCluster
function renderChart() {
  const force = simulation.value;
  const chartElement = chartRef.value.chartElement;
  const chart = d3.select(chartElement);
  let svg = chart.select("svg");

  if (svg.empty()) {
    svg = chart
        .append("svg")
        .attr("viewBox", `0 0 ${chartElement.clientWidth} ${chartElement.clientHeight}`);
  }

  const color = d3.scaleOrdinal(d3.schemeCategory10);
  force.force("center", d3.forceCenter(chart.node().clientWidth / 2, chart.node().clientHeight / 2))

  force.on("tick", () => {
        node
            .attr("cx", (d: any) => d.x)
            .attr("cy", (d: any) => d.y)

      }
  );

  const node = svg.selectAll("circle")
      .data(nodes.value);

  node
      .enter().append("circle")
      .merge(node)
      .attr("r", (d: any) => nodeSizeScale.value(d.radius))
      .attr("class", (d: any) => {
        if (d.component.name === hoveredComponent.value?.name) {
          return 'fill-tertiary-800'
        }
        return 'fill-tertiary-500';
      })
      .on("mousemove", (event: any, d: any) => {
        hoveredComponent.value = d.component
      })
      .on("mouseleave", (event: any, d: any) => {
        // TODO fix glitch where the tooltip stutters when moving the mouse from the node to the tooltip
        setTimeout(() => {
          hoveredComponent.value = null
        }, 10);
      })
      .on("click", (event: any, d: any) => {

        router.push(`/views/components/${d.component.name}`)
      })
      .call(d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));



  function dragstarted(event: any, d: any) {
    if (!event.active) force.alphaTarget(0.99999).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event: any, d: any) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event: any, d: any) {
    if (!event.active) force.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

}


</script>

<style scoped>

</style>
