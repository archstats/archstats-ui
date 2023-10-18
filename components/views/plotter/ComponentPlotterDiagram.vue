<template>
  <div id="chart1" class="w-[700px] h-[700px]">
    <svg class=""
         :viewBox="`${-margin.left} ${-margin.top} ${width + (margin.left + margin.right)} ${height + (margin.top + margin.bottom)}`"
    >

      <g v-for="(component, index) in components">
        <circle :r="radiusScaledValues[index]"
                :cx="xScaledValues[index]"
                :cy="yScaledValues[index]"
                class="fill-archstats-500"
        />
        <text v-if="shouldShowText(index)"
              :x="xScaledValues[index] + radiusScaledValues[index] + 2"
              :y="yScaledValues[index] + radiusScaledValues[index] / 2"
              class="text-xs text-white "
        > {{ component.name }}
        </text>

      </g>

      <g ref="xAxisElement"></g>

      <g ref="yAxisElement"></g>

      <text :y="height/2" :x="-60" :transform="`rotate(-90, -60, 250)`" text-anchor="middle" dominant-baseline="central" class="font-bold" >
        {{ yAxisProperty }}
      </text>

      <text :y="height + 50" :x="width/2" text-anchor="middle" class="font-bold">
        {{ xAxisProperty }}
      </text>

    </svg>
  </div>

</template>
<script setup lang="ts">
import D3Chart from "~/components/ui/D3Chart.vue";
import {RawComponent} from "~/utils/components";
import {PropType} from "@vue/runtime-core";
import * as d3 from "d3";

const props = defineProps(
    {
      components: {
        type: Array as PropType<RawComponent[]>,
        required: true
      },
      showText: {
        type: Boolean,
        default: true
      },

      xAxisProperty: {
        type: String,
        default: 'line_count'
      },
      yAxisProperty: {
        type: String,
        default: 'line_count'
      },
      radiusProperty: {
        type: String,
        default: 'line_count'
      },
    }
)

const width = 500
const height = 500
const margin = {top: 150, right: 150, bottom: 150, left: 150};

function shouldShowText(idx: number) {
  return false
  return props.showText
}

// make a scale according to xAxisProperty based in components
const xScale = computed(() => {
  const min = d3.min(props.components, c => c[props.xAxisProperty])
  const max = d3.max(props.components, c => c[props.xAxisProperty]) * 1.1
  return d3.scaleLinear().domain([min, max]).range([0, width])
})

// make a scale according to yAxisProperty based in components
const yScale = computed(() => {
  const min = d3.min(props.components, c => c[props.yAxisProperty])
  const max = d3.max(props.components, c => c[props.yAxisProperty]) * 1.1
  return d3.scaleLinear().domain([min, max]).range([height, 0])
})

// make a scale according to radiusProperty based in components
const radiusScale = computed(() => {
  const min = d3.min(props.components, c => c[props.radiusProperty])
  const max = d3.max(props.components, c => c[props.radiusProperty])
  return d3.scaleLinear().domain([min, max]).range([5, 20])
})

const xScaledValues = computed(() => {
  return props.components.map(component => xScale.value(component[props.xAxisProperty]))
})

const yScaledValues = computed(() => {
  return props.components.map(component => yScale.value(component[props.yAxisProperty]))
})

const radiusScaledValues = computed(() => {
  return props.components.map(component => radiusScale.value(component[props.radiusProperty]))
})

const yAxisElement = ref(null)
const xAxisElement = ref(null)

function drawYAxis() {
  const yAxis = d3.axisLeft(yScale.value).ticks(20)
  d3.select(yAxisElement.value).call(yAxis)
}

function drawXAxis() {
  const xAxis = d3.axisBottom(xScale.value).ticks(20)
  d3.select(xAxisElement.value).attr("transform", "translate(0," + height + ")").call(xAxis)
}

watch(() => [props.xAxisProperty, props.yAxisProperty], () => {
  drawXAxis()
  drawYAxis()
}, {immediate: true})

onMounted(() => {
  drawXAxis()
  drawYAxis()
})
</script>