<template>

  <Headline class="text-2xl mb-4">Distance from main sequence</Headline>
  <p class="mb-4">The main sequence is a concept in software engineering that refers to the ideal balance between
    abstractness and
    stability for a module or component. Modules that are too abstract or too unstable tend to be farther from the main
    sequence and can be more difficult to work with.</p>
  <ul class="mb-4">
    <li class="mb-2"><span class="text-tertiary-500 font-semibold">Abstractness</span> refers to how much a
      software
      component is
      removed from the details of its implementation.
    </li>
    <li class="mb-2"><span class="text-tertiary-500 font-semibold">Instability</span> refers to how likely a
      software
      component is to
      change over time.
    </li>
  </ul>

  <p class="mb-8">To help visualize this concept,
    the chart below displays various
    components in relation to the main sequence. The x-axis represents the degree of abstractness, while the y-axis
    represents the degree of stability. The closer a component is to the center of the chart, the better it is
    considered to be in terms of design quality. By understanding how components relate to the main sequence, software
    engineers can make better decisions about the design and maintenance of their software systems. See
    <Anchor href="https://en.wikipedia.org/wiki/Software_package_metrics">here</Anchor>
    for more info.
  </p>
  <p class="text-archstats-600 text-sm">{{ nrOfComponentsInMainSequence }} of {{ nrOfComponents }} components
    are in the main
    sequence</p>
  <div class="mt-2 flex mb-8">
    <label class="mr-4">Main sequence threshold</label>
    <input v-model="outOfBandThreshold" type="range" min="0" max="1" step="0.01">
    <input class="ml-4 w-12" type="number" v-model="outOfBandThreshold">

  </div>


  <div class="w-full flex border-2 border-tertiary-400 mt-4 w-[900px]">
    <div :id="chartId" class=" w-full"></div>
    <div class="bg-gray-100 flex-auto py-8 px-4 w-96 ">

      <div class="w-72" v-if="hoveredComponent || selectedComponent">

        <h3 class="w-full font-mono text-xs font-semibold py-4 overflow-x-scroll">
          {{ (hoveredComponent || selectedComponent).name }}</h3>
        <ComponentInfoTable class="text-sm" :component="hoveredComponent || selectedComponent"/>
      </div>

    </div>

  </div>

</template>

<script setup lang="ts">
import *  as d3 from 'd3'
import {Component, resizeConnectionsOnComponents} from "~/utils/components";
import {computed, defineProps, onMounted, ref, watch} from "vue";
import ComponentInfoTable from "../../InfoTable.vue";
import Headline from "../../ui/Headline.vue";
import Anchor from "../../ui/Anchor.vue";

const props = defineProps<{
  components: Component[],
  applyToScopeEnabled: boolean,
}>()
const chartId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2, 10)

const hoveredComponent = ref<Component>(null)
const selectedComponent = ref<Component>(null)

const outOfBandThreshold = ref<number>(0.7)

onMounted(() => {
  renderChart();
});
watch(() => [outOfBandThreshold.value, props.components, selectedComponent.value, hoveredComponent.value], () => {
  renderChart();
})


const nrOfComponentsInMainSequence = computed(() => {
  const threshold = outOfBandThreshold.value
  return props.components.filter(component => {
    return component["distance_main_sequence"] <= threshold
  }).length
})

const nrOfComponents = computed(() => {
  return props.components.length
})


function renderChart() {
  const allComponents = props.components;
  const relativeSize = 'afferent_couplings'

  const chart = d3.select(`#${chartId}`);
  chart.selectAll("*").remove();

  const components = resizeConnectionsOnComponents(allComponents)
  const margin = {top: 30, right: 30, bottom: 30, left: 30},
      width = 500,
      height = 500;
  const nodeSizes = components.map(node => node[relativeSize])
  const nodeSizeScale = d3.scaleLinear().domain([d3.min(nodeSizes), d3.max(nodeSizes)]).range([6.0, 20.0]);


  const svg = chart
      .append("svg")
      .attr("viewBox", [0 - margin.left, 0 - margin.top, width + (margin.left + margin.right), height + (margin.top + margin.bottom)])
      .append("g").on('click', () => {
        selectedComponent.value = null
      })

  const x = d3.scaleLinear()
      .domain([0, 1])
      .range([0, width]);

  // Add X axis
  svg.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x));

  const y = d3.scaleLinear()
      .domain([0, 1])
      .range([height, 0]);

  // Add Y axis
  svg.append("g")
      .call(d3.axisLeft(y));

  const threshold = outOfBandThreshold.value

  svg.append('line')
      .attr('x1', x(0))
      .attr('y1', y(1))
      .attr('x2', x(1))
      .attr('y2', y(0))
      .style('stroke', '#000')
      .style('stroke-width', 3)
  //
  svg.append('line')
      .attr('x1', x(0))
      .attr('y1', y(1 - threshold))
      .attr('x2', x(1 - threshold))
      .attr('y2', y(0))
      .style('stroke', 'red')
      .style('stroke-width', 1.5)

  svg.append('line')
      .attr('x1', x(threshold))
      .attr('y1', y(1))
      .attr('x2', x(1))
      .attr('y2', y(threshold))
      .style('stroke', 'blue')
      .style('stroke-width', 1.5)

  // Add dots
  svg.append('g')
      .selectAll("dot")
      .data(components)
      .enter()
      .append("circle")
      .attr("cx", (d) => x(d.instability))
      .attr("cy", (d) => y(d.abstractness))
      .attr("r", d => nodeSizeScale(d[relativeSize]))
      .attr("class", (component) => (hoveredComponent.value || selectedComponent.value)?.name === component.name ? 'fill-tertiary-700' : "fill-tertiary-500")
      .style('stroke', '#000')
      .style('stroke-width', 1)
      .on("mouseout", (x, y) => {
        hoveredComponent.value = null
      })
      .on("mouseover", (x, y) => {
        hoveredComponent.value = y
      })
      .on("click", (x, y) => {
        selectedComponent.value = y
      })


  svg.append("text")
      .style('stroke-width', 2)
      .attr("x", x(0.5))
      .attr("y", y(0.5))
      .attr("font-size", "12")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(45," + x(0.5) + "," + y(0.5) + ")")
      .attr("dy", "-5")
      .text("Main sequence")


}
</script>
