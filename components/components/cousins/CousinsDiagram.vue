<template>
  <div class="relative w-full h-full flex items-center justify-center">
    <D3Chart class="h-[600px] w-full max-w-[600px] overflow-hidden border border-slate-100 rounded-2xl bg-white shadow-3xs">
      <svg class="w-full h-full" :viewBox="viewBox" ref="svgRef">
        <defs>
          <marker id="arrow-selected" viewBox="0 -5 10 10" :refX="circleSize*1.5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
            <path d="M0,-5L10,0L0,5" class="stroke-indigo-600 fill-indigo-600"></path>
          </marker>
          <marker id="arrow-hovered" viewBox="0 -5 10 10" :refX="circleSize*1.5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
            <path d="M0,-5L10,0L0,5" class="stroke-slate-600 fill-slate-600"></path>
          </marker>
        </defs>
        
        <!-- Canvas Background (click to reset zoom) -->
        <rect :width="canvasSize" :height="canvasSize" fill="transparent" @click="resetFocus" class="cursor-default"></rect>

        <!-- Labeled Clickable Radar Rings -->
        <g v-for="lvl in levelsList" :key="lvl.level">
          <!-- Thick Clickable Hit Area (Translucent highlights on hover) -->
          <circle
            :cx="canvasSize/2"
            :cy="canvasSize/2"
            :r="lvl.radius"
            class="fill-none stroke-indigo-500/0 hover:stroke-indigo-500/5 cursor-pointer transition-colors duration-150"
            stroke-width="24"
            @click.stop="onRingClick(lvl.level)"
          ></circle>
          
          <!-- Visual Dashed Ring -->
          <circle
            :cx="canvasSize/2"
            :cy="canvasSize/2"
            :r="lvl.radius"
            class="fill-none stroke-slate-200 pointer-events-none transition-all duration-300"
            :class="{ 'stroke-indigo-400/80 stroke-[1.5]': maxHops === lvl.level }"
            stroke-width="1"
            stroke-dasharray="4 6"
          ></circle>
          
          <!-- Ring Hop Label -->
          <text
            :x="canvasSize/2"
            :y="canvasSize/2 - lvl.radius - 12"
            text-anchor="middle"
            class="fill-slate-400 font-mono font-bold select-none pointer-events-none transition-all duration-300"
            :class="{ 'fill-indigo-600 font-black': maxHops === lvl.level }"
            :style="{ fontSize: `${18 / transform.k}px` }"
          >
            {{ lvl.level }} {{ lvl.level === 1 ? 'Hop' : 'Hops' }}
          </text>
        </g>

        <!-- Hovered Cousin Paths -->
        <g 
          v-for="(segment, idx) in hoveredCousinPath" 
          :key="`hover-path-${idx}`" 
          class="stroke-slate-400" 
          :style="{ strokeWidth: `${6 / transform.k}px` }"
          v-if="hoveredCousin"
        >
          <PathBetweenPoints :canvas-size="canvasSize" :direction="direction" arrow-color="hovered" :point1="segment.from" :point2="segment.to"/>
        </g>
        
        <!-- Selected Cousin Paths -->
        <g 
          v-for="(segment, idx) in selectedCousinPath" 
          :key="`select-path-${idx}`" 
          class="stroke-indigo-500" 
          :style="{ strokeWidth: `${7 / transform.k}px` }"
          v-if="selectedCousin"
        >
          <PathBetweenPoints :canvas-size="canvasSize" :direction="direction" arrow-color="selected" :point1="segment.from" :point2="segment.to"/>
        </g>

        <!-- Center Node (Active Component) -->
        <g class="select-none pointer-events-none">
          <circle 
            :cx="canvasSize/2" 
            :cy="canvasSize/2" 
            r="22" 
            class="fill-indigo-500/10 stroke-indigo-500/20" 
            stroke-width="2"
          ></circle>
          <circle 
            :cx="canvasSize/2" 
            :cy="canvasSize/2" 
            r="12" 
            class="fill-indigo-600 shadow-sm"
          ></circle>
          <text 
            :x="canvasSize / 2" 
            :y="canvasSize / 2 + 45" 
            text-anchor="middle" 
            class="font-mono font-black fill-slate-800"
            :style="{ fontSize: `${22 / transform.k}px` }"
          >
            {{ getAbbreviatedName(component.name) }}
          </text>
        </g>

        <!-- Cousin Node Dots -->
        <g 
          v-for="circlePoint in circlePoints"
          :key="circlePoint.name"
          class="cursor-pointer group"
          @mouseenter="hoveredCousin = circlePoint.name" 
          @mouseleave="hoveredCousin = null"
          @click.capture.stop="selectedCousin = circlePoint.name"
        >
          <!-- Outer glow on hover/selection -->
          <circle 
            :cx="circlePoint.x" 
            :cy="circlePoint.y" 
            :r="circleSize + 4" 
            class="fill-indigo-500/0 group-hover:fill-indigo-500/15 transition-all duration-150"
            :class="{
              'fill-indigo-500/20': selectedCousin === circlePoint.name,
              'fill-indigo-500/10': hoveredCousin === circlePoint.name
            }"
          ></circle>
          <!-- Inner solid dot -->
          <circle 
            :cx="circlePoint.x" 
            :cy="circlePoint.y" 
            :r="circleSize - 5" 
            class="fill-slate-400 group-hover:fill-indigo-600 transition-all duration-150"
            :class="{
              'fill-indigo-600 stroke-[3] stroke-indigo-100': selectedCousin === circlePoint.name,
              'fill-indigo-500': hoveredCousin === circlePoint.name
            }"
          ></circle>
        </g>

        <!-- Text Labels for Hovered/Selected Nodes -->
        <g
           v-for="circlePoint in circlePoints" 
           :key="`text-${circlePoint.name}`"
           v-show="shouldShowText(circlePoint)"
           class="select-none pointer-events-none"
        >
          <text 
            :x="circlePoint.x + circleSize + 6"  
            :y="circlePoint.y + 6" 
            class="font-mono font-bold fill-white stroke-white" 
            :style="{ 
              fontSize: `${18 / transform.k}px`,
              strokeWidth: `${6 / transform.k}px`
            }"
          >
            {{ getAbbreviatedName(circlePoint.name) }}
          </text>
          <text 
            :x="circlePoint.x + circleSize + 6"  
            :y="circlePoint.y + 6" 
            class="font-mono font-bold fill-slate-700"
            :class="{
              'fill-indigo-900 font-extrabold': selectedCousin === circlePoint.name || hoveredCousin === circlePoint.name
            }"
            :style="{ fontSize: `${18 / transform.k}px` }"
          >
            {{ getAbbreviatedName(circlePoint.name) }}
          </text>
        </g>
      </svg>
    </D3Chart>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, useTemplateRef } from "vue"
import * as d3 from 'd3'
import D3Chart from "~/components/ui/d3/D3Chart.vue"
import PathBetweenPoints from '~/components/components/cousins/PathBetweenPoints.vue'

const props = defineProps<{
  component: any,
  allComponents: any[],
  allPaths: any[],
  colorScale: string,
  direction: 'from' | 'to',
  maxHops: number
}>()

const emit = defineEmits<{
  (e: 'select-node', node: any | null): void
  (e: 'hover-node', node: any | null): void
  (e: 'update:maxHops', hops: number): void
}>()

const toCousins = computed(() => {
  return props.allPaths.filter(path => {
    return path.to === props.component.name
  })
})

const fromCousins = computed(() => {
  return props.allPaths.filter(path => {
    return path.from === props.component.name
  })
})

const indirectPaths = computed(() => {
  return props.direction === 'from' ? fromCousins.value : toCousins.value
})

type IndirectPathIndexData = {
  shortest_path_length: number,
  paths: any[]
}

const indirectPathIndex = computed(() => {
  const idx = new Map<string, IndirectPathIndexData>()
  const otherDirection = props.direction === 'from' ? 'to' : 'from'

  indirectPaths.value.forEach(indirectPath => {
    const otherComponent = indirectPath[otherDirection]

    if (!idx.has(otherComponent)) {
      idx.set(otherComponent, {
        shortest_path_length: indirectPath.shortest_path_length,
        paths: []
      })
    }
    idx.get(otherComponent)?.paths.push(indirectPath)
  })
  return idx
})

const filteredComponents = computed(() => {
  return props.allComponents.filter(component => {
    return indirectPathIndex.value.has(component.name)
  })
})

const componentLookup = computed(() => {
  const idx = new Map<string, any>()
  filteredComponents.value.forEach(component => {
    idx.set(component.name, component)
  })
  return idx
})

const canvasSize = 1000
const circleSize = 12
const selectedCousin = ref<string | null>(null)
const hoveredCousin = ref<string | null>(null)

type Point = {
  name: string,
  colorClass: string,
  component: any,
  x: number,
  y: number,
  angleFromCenter: number,
  angleFromCenterDegrees: number,
  distanceFromCenter: number
}

const cousinsGroupedByLength = computed(() => {
  const map = new Map<number, Set<string>>()
  const otherDirection = props.direction === 'from' ? 'to' : 'from'

  for (const cousin of indirectPaths.value) {
    if (cousin.shortest_path_length > props.maxHops) continue

    if (!map.has(cousin.shortest_path_length)) {
      map.set(cousin.shortest_path_length, new Set<string>())
    }
    map.get(cousin.shortest_path_length)?.add(cousin[otherDirection])
  }

  const map2 = new Map<number, string[]>()
  map.forEach((cousins, length) => {
    map2.set(length, Array.from(cousins))
  })
  return map2
})

const minFirstLevel = computed(() => {
  if (props.maxHops === 1) return 380
  if (props.maxHops === 2) return 240
  if (props.maxHops === 3) return 165
  return 120
})

const minDistanceBetweenLevels = computed(() => {
  if (props.maxHops === 1) return 240
  if (props.maxHops === 2) return 200
  if (props.maxHops === 3) return 155
  return 140
})

const circlePointRadius = 24
const padding = 6

const levelsData = computed(() => {
  const { min, max } = getMinMaxKeys(cousinsGroupedByLength.value)

  const levelsData = new Map<number, {
    numberOfCirclePoints: number,
    circumference: number,
    minimumRequiredRadius: number,
    calculatedRadius: number
  }>()

  let previousLevelRadius = minFirstLevel.value
  for (let level = min; level <= max; level++) {
    const numberOfCirclePoints = cousinsGroupedByLength.value.get(level)?.length || 0
    const circumference = numberOfCirclePoints * (circlePointRadius + padding)
    const minimumRequiredRadius = circumference / (2 * Math.PI)

    const calculatedRadius = Math.max(minimumRequiredRadius, previousLevelRadius + minDistanceBetweenLevels.value)
    previousLevelRadius = calculatedRadius
    levelsData.set(level, {
      numberOfCirclePoints,
      circumference,
      minimumRequiredRadius,
      calculatedRadius: calculatedRadius
    })
  }

  return levelsData
})

const levelsList = computed(() => {
  const list: Array<{
    level: number,
    radius: number,
    pointsCount: number
  }> = []
  
  levelsData.value.forEach((data, level) => {
    list.push({
      level,
      radius: data.calculatedRadius,
      pointsCount: data.numberOfCirclePoints
    })
  })
  
  return list
})

const circlePoints = computed(() => {
  const circlePoints: Point[] = []
  const levelDataLookup = levelsData.value

  cousinsGroupedByLength.value.forEach((cousins, length) => {
    const totalPoints = cousins.length
    cousins.forEach((cousin, pointIndex) => {
      const level = length
      const levelData = levelDataLookup.get(level)
      if (!levelData) return

      const halfCanvas = canvasSize / 2
      const component = componentLookup.value.get(cousin)!
      
      const circlePoint = {
        name: cousin,
        component,
        x: halfCanvas + levelData.calculatedRadius * Math.cos(pointIndex * 2 * Math.PI / totalPoints),
        y: halfCanvas + levelData.calculatedRadius * Math.sin(pointIndex * 2 * Math.PI / totalPoints),
        angleFromCenter: pointIndex * 2 * Math.PI / totalPoints,
        angleFromCenterDegrees: pointIndex * 360 / totalPoints,
        distanceFromCenter: levelData.calculatedRadius,
        colorClass: 'fill-slate-400'
      }
      circlePoints.push(circlePoint)
    })
  })
  return circlePoints
})

const pointLookup = computed(() => {
  const idx = new Map<string, Point>()
  circlePoints.value.forEach(point => {
    idx.set(point.name, point)
  })
  return idx
})

const selectedCousinPath = computed(() => {
  return generatePathsForCousin(selectedCousin.value)
})

const hoveredCousinPath = computed(() => {
  return generatePathsForCousin(hoveredCousin.value)
})

const shouldShowText = computed(() => {
  return (point: Point) => {
    if (hoveredCousin.value === point.name || selectedCousin.value === point.name) {
      return true
    }

    // concat hover and selected paths
    const hoverPaths = hoveredCousinPath.value || []
    const selectPaths = selectedCousinPath.value || []
    const paths = hoverPaths.concat(selectPaths).map(segment => segment.from)

    return paths.some(segment => segment.name === point.name)
  }
})

function generatePathsForCousin(cousin: string | null) {
  if (!cousin) {
    return null
  }
  const pointIdx = pointLookup.value
  const segments: any[] = []
  const cousinPaths = indirectPathIndex.value.get(cousin)

  for (let path of cousinPaths?.paths || []) {
    const rawSegments = path.shortest_path.split(' -> ')

    if (props.direction === 'from') {
      rawSegments.reverse()
    }

    for (let i = 0; i < rawSegments.length - 1; i++) {
      const from = pointIdx.get(rawSegments[i])
      const to = pointIdx.get(rawSegments[i + 1])
      if (from) {
        segments.push({ from, to })
      }
    }
  }

  return segments
}

function getMinMaxKeys(map: Map<number, any>): { min: number; max: number } {
  const keys = Array.from(map.keys()).sort((a, b) => a - b)
  if (keys.length === 0) {
    return { min: 0, max: 0 }
  }
  return { min: keys[0], max: keys[keys.length - 1] }
}

function getAbbreviatedName(name: string): string {
  const parts = name.split(".")
  if (parts.length <= 2) return name
  return parts.slice(-2).join(".")
}

function onRingClick(level: number) {
  emit('update:maxHops', level)
}

function resetFocus() {
  selectedCousin.value = null
  emit('update:maxHops', 999)
}

// Emitting selections up to parent for detailed display
watch(selectedCousin, (newVal) => {
  if (newVal) {
    const point = pointLookup.value.get(newVal)
    const trace = indirectPathIndex.value.get(newVal)?.paths[0]?.shortest_path || newVal
    emit('select-node', point ? {
      name: newVal,
      component: point.component,
      pathLength: indirectPathIndex.value.get(newVal)?.shortest_path_length || 1,
      pathTrace: trace
    } : null)
  } else {
    emit('select-node', null)
  }
})

watch(hoveredCousin, (newVal) => {
  if (newVal) {
    const point = pointLookup.value.get(newVal)
    const trace = indirectPathIndex.value.get(newVal)?.paths[0]?.shortest_path || newVal
    emit('hover-node', point ? {
      name: newVal,
      component: point.component,
      pathLength: indirectPathIndex.value.get(newVal)?.shortest_path_length || 1,
      pathTrace: trace
    } : null)
  } else {
    emit('hover-node', null)
  }
})

// Reset selections when direction change clears nodes
watch(() => props.direction, () => {
  selectedCousin.value = null
  hoveredCousin.value = null
  resetZoom()
})

watch(() => props.maxHops, () => {
  resetZoom()
})

const transform = ref(d3.zoomIdentity)
const viewBox = computed(() => {
  const { k, x, y } = transform.value
  return `${-x / k} ${-y / k} ${canvasSize / k} ${canvasSize / k}`
})

const svgRef = useTemplateRef('svgRef')
let zoomBehavior: any = null

onMounted(() => {
  const svg = d3.select(svgRef.value)
  zoomBehavior = d3.zoom()
      .translateExtent([[0, 0], [canvasSize, canvasSize]])
      .on('zoom', (event) => {
        transform.value = event.transform
      })
  svg.call(zoomBehavior)
})

function resetZoom() {
  if (svgRef.value && zoomBehavior) {
    d3.select(svgRef.value)
      .transition()
      .duration(300)
      .call(zoomBehavior.transform, d3.zoomIdentity)
  }
}
</script>

<style scoped>
.stroke-archstats-850 {
  stroke: #4f46e5;
}
.stroke-gray-800 {
  stroke: #4f46e5;
}
.stroke-archstats-500 {
  stroke: #818cf8;
}
.stroke-archstats-900 {
  stroke: #1e1b4b;
}
.fill-archstats-50 {
  fill: #e0e7ff;
}
.fill-archstats-800 {
  fill: #312e81;
}
</style>