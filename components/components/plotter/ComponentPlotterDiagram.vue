<template>
  <div id="chart1" @mouseleave="hoveredComponent=null" @mousemove="mouseMove">
    <div
        v-if="dragSelectionAnchorPoint==null && hoveredComponent "
        class="fixed p-4 bg-archstats-50 shadow-xl"
        @mouseenter='isHoveringOverTooltip = true'
        @mouseleave="isHoveringOverTooltip=false"
        :style="{'top': `${hoveredComponent?.posY}px`, 'left': `${hoveredComponent?.posX}px`}"
    >
      <h3 class="font-semibold font-mono text-sm mb-4">{{ componentsInScope[hoveredComponent.index].name }}</h3>
      <InfoTable :component="componentsInScope[hoveredComponent?.index]"
                 :only-show="[xAxisProperty, yAxisProperty, radiusProperty]"
      />
      <Expandable class="mt-4">
        <span class="text-archstats-300 hover:text-archstats-500 cursor-pointer transition">Show all <span
            class="text-archstats-800">{{ Object.keys(componentsInScope[hoveredComponent.index]).length }}</span> stats</span>

        <template #expanded-content>
          <div class="h-72 overflow-y-scroll p-2 bg-white border mt-2">
            <InfoTable :component="componentsInScope[hoveredComponent?.index]"/>
          </div>

        </template>
      </Expandable>
    </div>
    <svg ref="svg" @mousedown="beginDragSelecting" @mouseup="doneDragSelecting" @mousemove="updateMouseCoords"
         :viewBox="`${-margin.left} ${-margin.top} ${width + (margin.left + margin.right)} ${height + (margin.top + margin.bottom)}`"
         class="w-full h-full border border-gray-200 p-3">
      >

      <g v-for="(component, index) in componentsInScope">
        <circle @mouseenter="hoverOver(index, $event)"

                @click="componentClicked(component)"
                :r="radiusScaledValues[index]"
                :cx="xScaledValues[index]"
                :cy="yScaledValues[index]"
                :class="[['stroke-archstats-800'],
                {'fill-archstats-400': hoveredComponent?.index === index,
                 'fill-archstats-500': hoveredComponent?.index !== index,
                 'fill-secondary-300': selectingComponents.has(component.name) || selectedComponentsIndex.includes(component.name),
                }]"
                :ref="el => circles[index] = el"

        />
        <text v-if="shouldShowText(index)"
              :x="xScaledValues[index] + radiusScaledValues[index] + 6"
              :y="yScaledValues[index] + radiusScaledValues[index] / 2"
              class="text-xs text-white "
        > {{ component.name }}
        </text>

      </g>

      <g ref="xAxisElement" class="select-none"></g>

      <g ref="yAxisElement" class="select-none"></g>

      <text :y="height/2" :x="-60" :transform="`rotate(-90, -60, 250)`" text-anchor="middle" dominant-baseline="central"
            class="font-bold select-none">
        {{ yAxisProperty }}
      </text>

      <text :y="height + 50" :x="width/2" text-anchor="middle" class="font-bold select-none">
        {{ xAxisProperty }}
      </text>

      <g v-if="isDistanceMainSequence">
        <line :x1="xScale(0)"
              :y1="yScale(1)"
              :x2="xScale(1)"
              :y2="yScale(0)"
              class="stroke-archstats-900"
              stroke-width="1"
        ></line>
        <text :transform="`rotate(45, ${xScale(0.5)}, ${yScale(0.5)})`"
              :x="xScale(0.5)"
              :y="yScale(0.5)"
              stroke-width="2"
              text-anchor="middle"
              dy="-6"
              font-size="12"
              class="select-none"
        >
          Main Sequence
        </text>
      </g>

      <g v-if="dragRectangle">
        <rect
            :x="dragRectangle.x"
            :y="dragRectangle.y"
            :width="dragRectangle.width"
            :height="dragRectangle.height"
            class="fill-archstats-200 opacity-50"

        ></rect>
      </g>

    </svg>
  </div>

</template>
<script setup lang="ts">
import {RawComponent} from "~/utils/components";
import {PropType} from "@vue/runtime-core";
import * as d3 from "d3";
import Expandable from "~/components/ui/common/Expandable.vue";
import InfoTable from "~/components/ui/tables/InfoTable.vue";


const props = defineProps(
    {
      componentsInScope: {
        type: Array as PropType<RawComponent[]>,
        required: true
      },
      allComponents: {
        type: Array as PropType<RawComponent[]>,
        required: true
      },
      selectedComponents: {
        type: Array as PropType<RawComponent[]>,
        default: () => []
      },
      showText: {
        type: Boolean,
        default: true
      },

      xAxisProperty: {
        type: String,
        default: 'complexity:lines'
      },
      yAxisProperty: {
        type: String,
        default: 'complexity:lines'
      },
      radiusProperty: {
        type: String,
        required: false,
      },
    }
)

const emit = defineEmits(['components-selected', 'component-clicked'])
const svg = ref<SVGSVGElement | null>(null)
const svgPoint = computed(() => {
  return svg.value?.createSVGPoint()
})
const width = 500
const height = 500
const margin = {top: 0, right: 0, bottom: 65, left: 70};

const circles = ref<SVGCircleElement[]>([])

type HoveredComponent = { index: number, posX: number, posY: number };
const hoveredComponent = ref<HoveredComponent | null>(null)

const isHoveringOverTooltip = ref(false)

function mouseMove(event: MouseEvent) {
  if (!hoveredComponent.value || isHoveringOverTooltip.value) return

  // distance from mouse to hovered component
  const distance = Math.sqrt(Math.pow(event.clientX - hoveredComponent.value.posX, 2) + Math.pow(event.clientY - hoveredComponent.value.posY, 2))

  if (distance > 120) {
    hoveredComponent.value = null
  }
}
const mouseCoords = ref({x: 0, y: 0})

function updateMouseCoords(evt: MouseEvent) {
  const point = scaledPoint({
    x: evt.clientX,
    y: evt.clientY
  })
  if (!point) return
  mouseCoords.value = point
}

const dragSelectionAnchorPoint = ref<{ x: number, y: number } | null>(null)

const dragRectangle = computed(() => {
  if (dragSelectionAnchorPoint.value == null) return null
  const end = mouseCoords.value
  return calculateSVGRectangleFromTwoPoints(dragSelectionAnchorPoint.value, end)
})
const calculateSVGRectangleFromTwoPoints = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
  const x = Math.min(p1.x, p2.x)
  const y = Math.min(p1.y, p2.y)
  const width = Math.abs(p1.x - p2.x)
  const height = Math.abs(p1.y - p2.y)
  return {x, y, width, height}
}

function beginDragSelecting(event: MouseEvent) {
  dragSelectionAnchorPoint.value = scaledPoint({
    x: event.clientX,
    y: event.clientY
  })
}

function doneDragSelecting(event: MouseEvent) {
  const componentNames = Array.from(selectingComponents.value)
  const components = props.componentsInScope.filter(c => componentNames.includes(c.name))

  emit('components-selected', components)

  dragSelectionAnchorPoint.value = null
}

function scaledPoint(coord: { x: number, y: number }) {
  const pt = svgPoint.value
  if (!pt) return null
  pt.x = coord.x;
  pt.y = coord.y;
  const svgP = pt.matrixTransform(svg.value?.getScreenCTM()?.inverse());
  return svgP
}


const selectedComponentsIndex = computed(() => {
  return props.selectedComponents.map(c => c.name)
})

const selectingComponents: ComputedRef<Set<string>> = computed(() => {

  const components = componentWithCurrentCoords.value.filter((component, index) => {
    const x = component.posX
    const y = component.posY
    const radius = component.radius
    if (dragRectangle.value == null) return false
    const rect = dragRectangle.value
    return x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height
  })
  return new Set(components.map(c => c.name))
})

function hoverOver(index: number, event: MouseEvent) {
  if (hoveredComponent.value?.index === index || dragSelectionAnchorPoint.value != null) {
    return
  }
  const svgCircle = circles.value[index]

  let domRect = svgCircle.getBoundingClientRect();


  hoveredComponent.value = {
    index,
    posX: 10+ domRect.x + domRect.width / 2,
    posY: 10+domRect.y + domRect.height / 2
  }
}

const isDistanceMainSequence = computed(() => {
  return props.xAxisProperty === "instability" && props.yAxisProperty === "abstractness"
})

function shouldShowText(idx: number) {
  return props.showText
}

// make a scale according to xAxisProperty based in components
const xScale = computed(() => {
  const min = d3.min(props.allComponents, c => c[props.xAxisProperty])
  const max = d3.max(props.allComponents, c => c[props.xAxisProperty]) * 1.1
  return d3.scaleLinear().domain([min, max]).range([0, width])
})

// make a scale according to yAxisProperty based in components
const yScale = computed(() => {
  const min = d3.min(props.allComponents, c => c[props.yAxisProperty])
  const max = d3.max(props.allComponents, c => c[props.yAxisProperty]) * 1.1
  return d3.scaleLinear().domain([min, max]).range([height, 0])
})

// make a scale according to radiusProperty based in components
const radiusScale = computed(() => {
  if (props.radiusProperty == null) return () => 5
  const min = d3.min(props.allComponents, c => c[props.radiusProperty])
  const max = d3.max(props.allComponents, c => c[props.radiusProperty])
  return d3.scaleLinear().domain([min, max]).range([5, 20])
})

const xScaledValues = computed(() => {
  return props.componentsInScope.map(component => xScale.value(component[props.xAxisProperty]))
})

const yScaledValues = computed(() => {
  return props.componentsInScope.map(component => yScale.value(component[props.yAxisProperty]))
})

const radiusScaledValues = computed(() => {
  return props.componentsInScope.map(component => radiusScale.value(component[props.radiusProperty]))
})

const componentWithCurrentCoords = computed(() => {
  return props.componentsInScope.map((component, index) => {
    return {
      ...component,
      posX: xScaledValues.value[index],
      posY: yScaledValues.value[index],
      radius: radiusScaledValues.value[index]
    }
  })
})

const yAxisElement = ref(null)
const xAxisElement = ref(null)

function drawYAxis() {
  const yAxis = d3.axisLeft(yScale.value).ticks(10)
  d3.select(yAxisElement.value).call(yAxis)
}

function drawXAxis() {
  const xAxis = d3.axisBottom(xScale.value).ticks(10)
  d3.select(xAxisElement.value).attr("transform", "translate(0," + height + ")").call(xAxis)
}

watch(() => [props.xAxisProperty, props.yAxisProperty, props.componentsInScope], () => {
  drawXAxis()
  drawYAxis()
  hoveredComponent.value = null;
}, {immediate: true})

onMounted(() => {
  drawXAxis()
  drawYAxis()
})

function componentClicked(c: RawComponent){
  emit('component-clicked', c)
}
</script>