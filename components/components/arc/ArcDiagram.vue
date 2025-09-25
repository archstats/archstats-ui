<template>

  <D3Chart class="h-[756px]  overflow-y-scroll">
    <svg class="w-full" :viewBox="viewBox">

      <g v-for="node in nodes" class="font-mono text-xs">
        <text :x="node.x - 20" :y="node.y" :fill="node.component.color" text-anchor="end">{{
            node.component.name
          }}
        </text>
      </g>

      <g v-for="(link, i) in linkData">
        <path :d="lineCurvePaths[i]"  class="mix-blend-multiply" :class="link.colorClass" fill="none" stroke-width="2" stroke-opacity="0.6"/>
      </g>
      <g v-for="node in nodes" v-on:mouseover="hoverNode(node)">
        <circle :cx="node.x" :cy="node.y" :r="nodeRadius" :fill="node.component.color"/>
      </g>

    </svg>

  </D3Chart>


</template>
<script setup lang="ts">
import *  as d3 from 'd3'


import Headline from "../../ui/common/Headline.vue";
import {SimulationNodeDatum} from "d3-force";
import D3ChartTooltip from "../../ui/d3/D3ChartTooltip.vue";
import ComponentInfoTable from "../../ui/tables/InfoTable.vue";
import D3Chart from "../../ui/d3/D3Chart.vue";
import {computed} from "vue";

type Node = { name: string };
type Point = { x: number, y: number }
type Edge = { from: string; to: string };
const chartRef = ref(null);

const props = defineProps<{
  components: Component[],
  connections: RawComponentConnection[]
}>()

const highlightedComponent = ref<RawComponent | null>(null)
const selectedComponent = ref<RawComponent | null>(null)

const currentComponents = ref(props.components)

const currentConnections = computed(() => {
  return props.connections.filter(connection => {
    return currentComponents.value.some(component => component.name === connection.from) &&
        currentComponents.value.some(component => component.name === connection.to)
  })
})

const orderedComponents = computed(() => {
  // return orderByConnections(new Set(currentComponents.value), new Set(currentConnections.value))
  return currentComponents.value.sort((a, b) => a.name.localeCompare(b.name))
})


const nodeRadius = 10;
const nodePadding = 2;
const nodes = computed(() => {
  const highlighted = highlightedComponent.value
  return orderedComponents.value.map((component, i) => {

    return {
      name: component.name,
      component: component,
      classes: [],
      y: nodeRadius + i * (nodeRadius * 2 + nodePadding),
      x: 300,
    }
  })
})

const viewBox = computed(() => {
  if (nodes.value.length === 0) {
    return `0 0 1000 1000`
  }

  const maxY = (nodes.value[nodes.value.length - 1]?.y) + nodeRadius;
  return `0 0 1000 ${maxY}`
})

const nodesIndexLookup = computed(() => {
  return nodes.value.reduce((acc, node, i) => {
    acc[node.component.name] = i
    return acc
  }, {} as Record<string, number>)
})

const linkData = computed(() => {
  const allNodes = nodes.value
  const lookup = nodesIndexLookup.value
  const highlighted = highlightedComponent.value

  return currentConnections.value.map(connection => {
    const source = allNodes[lookup[connection.from]]
    const target = allNodes[lookup[connection.to]]

    const isFromHighlighted = highlighted && highlighted.name === connection.from
    const isToHighlighted = highlighted && highlighted.name === connection.to
    let colorClass = 'stroke-neutral-200'

    if (isFromHighlighted && isToHighlighted) {
      colorClass = 'stroke-red-500'
    } else if (isFromHighlighted) {
      colorClass = 'stroke-archstats-500'
    } else if (isToHighlighted) {
      colorClass = 'stroke-secondary-500'
    }

    return {
      from: source,
      to: target,
      colorClass: [colorClass],

      fromPos: {
        x: source.x,
        y: source.y
      },
      toPos: {
        x: target.x,
        y: target.y
      }
    }
  })
})

const fromSet = computed(() => {
  return new Set(currentConnections.value.map(c => c.from))
})

const toSet = computed(() => {
  return new Set(currentConnections.value.map(c => c.to))
})

const lineCurvePaths = computed(() => {
  return linkData.value.map(link => {
    return getBezierPathData(link.from, link.to, {x: 500, y: 500})
    // return drawCurve(link.from.x, link.from.y, link.to.x, link.to.y, 500)
  })
})

function getBezierPathData(pointA: Point, pointB: Point, anchor: Point) {
  const verticalDistance = Math.abs(pointA.y - pointB.y);

  const anchorX = Math.max(350, verticalDistance);
  const anchorY = pointA.y + (pointB.y - pointA.y) / 2;
  // Create a path data string for the Bezier curve
  const pathData = `M ${pointA.x},${pointA.y}
                   Q ${anchorX},${anchorY}
                   ${pointB.x},${pointB.y}`;
  return pathData;
}

function hoverNode(node: { component: Component, x: number, y: number }) {
  highlightedComponent.value = node.component
}



function removeNode(node: { component: Component, x: number, y: number }) {
  currentComponents.value = currentComponents.value.filter(c => c.name !== node.component.name)
}

function orderByConnections(nodes: Node[], edges: Edge[]): Node[] {
  const connectionCounts: { [key: string]: number } = {};

  for (const { from, to } of edges) {
    connectionCounts[from] = (connectionCounts[from] || 0) + 1;
    connectionCounts[to] = (connectionCounts[to] || 0) + 1;
  }

  const orderedNodes = Array.from(nodes).sort((a, b) => {
    const countA = connectionCounts[a.name] || 0;
    const countB = connectionCounts[b.name] || 0;
    if (countA !== countB) {
      return countB - countA; // Sort by connection count (descending)
    } else {
      return a.name.localeCompare(b.name); // Sort alphabetically for ties
    }
  });

  return orderedNodes;
}

</script>
