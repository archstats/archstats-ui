

<template>
  <path :d="generateArcBetweenPoints(distance, point1, point2)()"  :transform="`translate(${canvasSize/2},${canvasSize/2}) rotate(90)`" v-if="point2"/>
  <line :x1="line1.x1" :x2="line1.x2" :y1="line1.y1" :y2 = "line1.y2"  :marker-end="`url(#arrow-${arrowColor})`"></line>
  <line :x1="line2.x1" :x2="line2.x2" :y1="line2.y1" :y2 = "line2.y2" :marker-end="`url(#arrow-${arrowColor})`"  ></line>
</template>
<script setup lang="ts">
import * as d3 from "d3";
import {computed} from "vue";

const props = defineProps<{
  canvasSize: number,
  arrowColor: 'selected' | 'hovered'
  point1: Point,
  point2?: Point
}>()
type Point = { x: number, y: number, angleFromCenter: number, angleFromCenterDegrees: number, distanceFromCenter: number }
function generateArcBetweenPoints(distance: number, point1: Point, point2: Point): any {
  return generateArcBetweenAngles(distance, point2.angleFromCenter, point1.angleFromCenter);
}

function generateArcBetweenAngles(distanceInPoints: number, startAngle: number, endAngle: number){
  let difference = endAngle - startAngle;
  if (difference > Math.PI) {
    difference -= 2 * Math.PI;
  } else if (difference < -Math.PI) {
    difference += 2 * Math.PI;
  }

  const newEndAngle = startAngle + difference;

  return d3.arc()
      .innerRadius(distanceInPoints)
      .outerRadius(distanceInPoints)
      .startAngle(startAngle)
      .endAngle(newEndAngle);
}
const distance = computed(() => {
  if(!props.point2) {
    return 0;
  }
 return (props.point1.distanceFromCenter + props.point2.distanceFromCenter) / 2;
})
const line1 = computed(() => {
  const point = props.point1;

  const halfCanvas = props.canvasSize / 2;
  return {
    x1: point.x,
    y1: point.y,
    x2: halfCanvas + distance.value * Math.cos(point.angleFromCenter),
    y2: halfCanvas + distance.value * Math.sin(point.angleFromCenter)
  }
})
const line2 = computed(() => {
  if (!props.point2) {
    return {x1: props.point1.x, y1: props.point1.y, x2: props.canvasSize/2, y2: props.canvasSize/2}
  }

  const point = props.point2;

  const halfCanvas = props.canvasSize / 2;
  return {
    x2: point.x,
    y2: point.y,
    x1: halfCanvas + distance.value * Math.cos(point.angleFromCenter),
    y1: halfCanvas + distance.value * Math.sin(point.angleFromCenter)
  }
})

</script>
<style scoped>

</style>