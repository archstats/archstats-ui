<template>
  <div id="chart1" @mouseleave="hoveredComponent=null" >
    <div class="fixed p-4 bg-archstats-50 shadow-xl" v-if="hoveredComponent" :style="{'top': `${hoveredComponent.posY}px`, 'left': `${hoveredComponent.posX}px`}">
      <h3 class="font-semibold font-mono text-sm mb-4">{{components[hoveredComponent.index].name}}</h3>
      <InfoTable :component="components[hoveredComponent.index]"
      :only-show="[xAxisProperty, yAxisProperty, radiusProperty]"
      />
      <Expandable class="mt-4">
        <span class="text-archstats-300 hover:text-archstats-500 cursor-pointer transition">Show all <span class="text-archstats-800">{{Object.keys(components[hoveredComponent.index]).length}}</span> stats</span>

        <template #expanded-content>
          <div class="h-72 overflow-y-scroll p-2 bg-white border mt-2">
            <InfoTable :component="components[hoveredComponent.index]"/>
          </div>

        </template>
      </Expandable>
    </div>
    <svg class=""
         :viewBox="`${-margin.left} ${-margin.top} ${width + (margin.left + margin.right)} ${height + (margin.top + margin.bottom)}`"
    >

      <g v-for="(component, index) in components">
        <circle @mouseenter="hoverOver(index, $event)"

                :r="radiusScaledValues[index]"
                :cx="xScaledValues[index]"
                :cy="yScaledValues[index]"
                :class="[['stroke-archstats-800'],{'fill-secondary-500': hoveredComponent?.index === index, 'fill-archstats-500': hoveredComponent?.index !== index}]"
                :ref="el => circles[index] = el"

        />
        <text v-if="shouldShowText(index)"
              :x="xScaledValues[index] + radiusScaledValues[index] + 6"
              :y="yScaledValues[index] + radiusScaledValues[index] / 2"
              class="text-xs text-white "
        > {{ component.name }}
        </text>

      </g>

      <g ref="xAxisElement"></g>

      <g ref="yAxisElement"></g>

      <text :y="height/2" :x="-60" :transform="`rotate(-90, -60, 250)`" text-anchor="middle" dominant-baseline="central"
            class="font-bold">
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
import Expandable from "~/components/ui/Expandable.vue";

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
const margin = {top: 0, right: 0, bottom: 65, left: 70};

const circles = ref<SVGCircleElement[]>([])

const hoveredComponent = ref<{ index: number, posX: number, posY: number } | null>(null)

function hoverOver(index: number, event: MouseEvent) {
  if(hoveredComponent.value?.index === index) {
    return
  }

  const svgCircle = circles.value[index]


  let domRect = svgCircle.getBoundingClientRect();
  hoveredComponent.value = {
    index,
    posX: domRect.x + domRect.width,
    posY: domRect.y + domRect.height
  }
}

function shouldShowText(idx: number) {
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
  hoveredComponent.value=null;
}, {immediate: true})

onMounted(() => {
  drawXAxis()
  drawYAxis()
})
</script>