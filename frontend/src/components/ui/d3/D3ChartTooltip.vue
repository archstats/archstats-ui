
<!-- figure: none: a tooltip that follows the pointer over other charts. -->
<template>
  <div class="ui-tooltip pointer-events-none absolute z-50" :style="{top: tooltipLocation.y + 'px', left: tooltipLocation.x + 'px'}">
    <slot></slot>
  </div>
</template>
<script setup lang="ts">
import {getCurrentInstance, onMounted, ref} from "vue";
import * as d3 from "d3";

type Coordinates = { x: number, y: number };
const tooltipLocation = ref<Coordinates>({x: 0, y: 0})
const mouseLocation = ref<Coordinates>({x: 0, y: 0})
const chartDiv = getCurrentInstance().parent.refs["chartElement"] as HTMLElement

onMounted(()=>{
  // @ts-ignore
  chartDiv.addEventListener('mousemove', mouseMovedInDiv);
})

function mouseMovedInDiv(event: MouseEvent) {
  const chart = d3.select(chartDiv);
  const mouse = d3.pointer(event, chart.node());
  tooltipLocation.value = {x: mouse[0] + 5, y: mouse[1] + 5}
}

</script>

<style scoped>

</style>