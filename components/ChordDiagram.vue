<template>
  <div class="">
    <Headline class="text-2xl mb-8 font-bold">Chord</Headline>
    <p class="mb-4">The Chord View is meant to visualize the relationships between software components radially in a
      circle. <span
          class="font-semibold">By hovering over a component you can see its afferent and efferent couplings.</span></p>
    <ul>
      <li class="mb-2">
        The <span class="text-secondary-500 font-semibold">efferent couplings</span> or <span class="italic text-secondary-500">dependencies / outgoing connections</span>
        are the relationships between a component and the components that it depends on. They are
        represented by the red lines in the diagram.
      </li>
      <li class="mt-2">
        The <span class="text-tertiary-500 font-semibold">afferent couplings</span> or <span class="italic text-tertiary-500">dependents / incoming connections</span>
        are the relationships between a component and
        the components that depend on it. They are represented by the blue lines in the diagram.
      </li>
    </ul>
    <p class="mt-8">See
      <Anchor href="https://en.wikipedia.org/wiki/Software_package_metrics">here</Anchor>
      for more info.
    </p>

    <div :id="chartId" ref="chart" class="border-2 border-tertiary-400 mt-12 w-[900px]"></div>
  </div>

</template>

<script lang="ts" setup>
import *  as d3 from "d3"
import {computed, defineProps, onMounted, ref, watch} from "vue";
import {Component, Connection, ConnectionType, resizeConnectionsOnComponents} from "~/utils/components";
import Headline from "~/components/ui/Headline.vue";
import Anchor from "~/components/ui/Anchor.vue";

const chartId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2, 10)


const props = defineProps<{
  components: Component[]
}>()

const orderedComponents = computed(() => {
  return props.components.sort((a, b) => {
    return a.name.localeCompare(b.name)
  })
})

const maxComponentsToShow = ref(100)
watch(() => orderedComponents.value, () => {
  renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value))
})
onMounted(() => {
  try {
    renderChart(resizedComponents(orderedComponents.value, maxComponentsToShow.value))
  } catch (e) {
    console.error(e)
  }
});

function resizedComponents(components: Component[], max: number): Component[] {
  return resizeConnectionsOnComponents(components.slice(0, max))
}


function renderChart(connectedComponents: Component[]) {
  const chart = d3.select(`#${chartId}`);
  chart.selectAll("*").remove();


  const colornone = '#888'
  const width = 300, height = 300;

  const data = [...connectedComponents.map(comp => {
    return {
      ...comp,
      valueOf: () => 1
    }
  })]
  const radius = Math.min(connectedComponents.length * 5, 90)

  const svg = chart.append("svg")
      .attr("viewBox", [-width / 2, -width / 2, width, width])
      .attr("border", "3px solid #000")
      .call(d3.zoom().on("zoom", function (event) {
        svg.attr("transform", event.transform)
      })).append("g");

  function getPointRadial(d) {
    const pointRadial = d3.pointRadial((d.startAngle + d.endAngle - 0.1) / 2, radius);
    return {x: pointRadial[0], y: pointRadial[1]};
  }

  const pieFn = d3.pie().value(() => 1);
  const pie = pieFn(data).map(d => {
    const point = getPointRadial(d);
    const angle = (d.startAngle + d.endAngle) / 2;
    //angle to degrees
    const angleDeg = angle * 180 / Math.PI;
    return {
      ...d,
      rotate: angleDeg,
      x: point.x,
      y: point.y,
      text: null,
      data: d.data as unknown as Component
    }
  })

  const pieMap = new Map(pie.map(d => {
    return [d.data.name, d];
  }))

  const node = svg.append("g")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .selectAll("g")
      .data(pie)
      .join("g")
      .attr("transform", d => `rotate(0) translate(${d.x},${d.y})`)
      .append("text")
      .attr("dy", "0.31em")
      .attr("text-anchor", d => d.x > Math.PI ? "start" : "end")
      .attr("font-size", "5px")
      .attr("transform", d => d.x < Math.PI ? `rotate(${d.rotate + 90})` : `rotate(${d.rotate + 270})`)
      .text(d => d.data.name || "unknown")
      .each(function (d) {
        d.text = this;
      })
      .on("mouseover", overed)
      .on("mouseout", outed)


  const connections: ConnectionWithPath[] = connectedComponents.flatMap(comp => {
    return [...comp.connections.filter(c => c.type === "OUTGOING").map(c => {
      return {
        ...c,
        path: null
      }
    })]
  });
  const connectionsData = connections.map(conn => {
    const from = pieMap.get(conn.from.name)
    const to = pieMap.get(conn.to.name)
    return {from, to, path: null}
  });
  const line = d3.line().curve(d3.curveBundle.beta(0.85))
  const link = svg.append("g")
      .attr("stroke", colornone)
      .attr("stroke-width", 0.6)
      .attr("stroke-opacity", 0.6)
      .attr("fill", "none")
      .selectAll("path")
      .data(connectionsData)
      .join("path")
      .style("mix-blend-mode", "multiply")
      .attr("d", (d) => {
        return line([[d.from.x, d.from.y], [0, 0], [d.to.x, d.to.y]])
      })
      .each(function (d) {
        d.path = this;
      });

  const colorout = "#00f"
  const colorin = "#f00"

  function overed(event, d) {

    link.style("mix-blend-mode", null);
    const outgoingData = connectionsData.filter(c => c.from.data.name === d.data.name)
    d3.select(this).attr("font-weight", "bold");
    d3.selectAll(outgoingData.map(d => d.path)).attr("stroke", colorin).raise();
    d3.selectAll(outgoingData.map(d => d.to.text)).attr("fill", colorin).attr("font-weight", "bold");


    const incomingData = connectionsData.filter(c => c.to.data.name === d.data.name)
    d3.selectAll(incomingData.map(d => d.path)).attr("stroke", colorout).raise();
    d3.selectAll(incomingData.map(d => d.from.text)).attr("fill", colorout).attr("font-weight", "bold");

  }

  function outed(event, d) {
    link.style("mix-blend-mode", "multiply");
    d3.select(this).attr("font-weight", null);
    const incomingData = connectionsData.filter(c => c.to.data.name === d.data.name)
    d3.selectAll(incomingData.map(d => d.path)).attr("stroke", null);
    d3.selectAll(incomingData.map(d => d.from.text)).attr("fill", null).attr("font-weight", null);


    const outgoingData = connectionsData.filter(c => c.from.data.name === d.data.name)
    d3.selectAll(outgoingData.map(d => d.path)).attr("stroke", null);
    d3.selectAll(outgoingData.map(d => d.to.text)).attr("fill", null).attr("font-weight", null);
  }
}

interface ConnectionWithPath extends Connection {
  path: SVGPathElement
}
</script>

<style scoped>

</style>
