<template>
  <Headline>Component Graph Walker</Headline>
  <D3Chart ref="chartRef" class="h-96 border-2">

  </D3Chart>
</template>

<script setup lang="ts">

import Headline from "../../ui/Headline.vue";
import Chart from "../../Chart.vue";
import D3Chart from "../../ui/D3Chart.vue";
import * as d3 from "d3";
import {defineProps, ref} from "vue";
import {Component} from "~/utils/components";

const chartRef = ref(null);
const props = defineProps<{
  components: Component[],
}>()

const currentComponent = ref<Component>(null)


function renderChart(){
  const chartElement = chartRef.value.chartElement;

  const width = chartElement.clientWidth;
  const height = chartElement.clientHeight;
  const chart = d3.select(chartElement);

  let svg = chart.select("svg");

  if (svg.empty()) {
    svg = chart
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
  }

  // draw a circle representing the current component in the middle of the y-axis to the left
  const currentComponentCircle = svg.selectAll("circle.current-component")
      .data(currentComponent.value ? [currentComponent.value] : []);


}
</script>

<style scoped>

</style>