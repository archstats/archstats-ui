<template>
  <D3Chart class="h-[800px] w-[800px]  overflow-y-scroll border">
    <svg class="w-full" :viewBox="viewBox"  ref="svgRef">
      <defs>
        <marker id="arrow-selected" viewBox="0 -5 10 10" :refX="circleSize*1.5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
          <path  d="M0,-5L10,0L0,5" class="stroke-archstats-500 fill-archstats-500"></path>
        </marker>
        <marker id="arrow-hovered" viewBox="0 -5 10 10" :refX="circleSize*1.5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
          <path  d="M0,-5L10,0L0,5" class="stroke-archstats-800 fill-archstats-800"></path>
        </marker>
      </defs>

      <circle v-for="ring in rings" :cx="canvasSize/2" :cy="canvasSize/2" :r="ring.radius"  class="fill-archstats-800"  fill-opacity="0.1" ></circle>


      <g v-for="segment in hoveredCousinPath" class="stroke-[5] stroke-archstats-800" v-if="hoveredCousin">
        <PathBetweenPoints :canvas-size="canvasSize" arrow-color="hovered" :point1="segment.from" :point2="segment.to"/>
      </g>
      <g v-for="segment in selectedCousinPath" class="stroke-[5] stroke-gray-800" v-if="selectedCousin">
        <PathBetweenPoints :canvas-size="canvasSize" arrow-color="selected" :point1="segment.from" :point2="segment.to"/>
      </g>

      <g>
        <circle :r="circleSize" :cx="canvasSize / 2" :cy="canvasSize/2" fill="red"></circle>
        <text :x="canvasSize / 2" :y="canvasSize / 2 + circleSize*2" text-anchor="middle" class="stroke-white" stroke-width="0.3em">{{component.name}}</text>
        <text :x="canvasSize / 2" :y="canvasSize / 2 + circleSize*2" text-anchor="middle">{{component.name}}</text>
      </g>
      <g class="cursor-pointer" @mouseenter="hoveredCousin = circlePoint.name" @mouseleave="hoveredCousin = null"
         @click.capture="selectedCousin = circlePoint.name" :pointidx="i" :name="circlePoint.name"
         :angleFromCenterDegrees="circlePoint.angleFromCenterDegrees" :angleFromCenter="circlePoint.angleFromCenter"
         v-for="(circlePoint, i) in circlePoints">
        <circle :cx="circlePoint.x" :cy="circlePoint.y" :r="circleSize" :class="[circlePoint.colorClass]"></circle>
      </g>

      <g
         v-for="(circlePoint, i) in circlePoints" v-show="shouldShowText(circlePoint)">
        <text :x="circlePoint.x + circleSize*1.2"  :y="circlePoint.y" class="font-mono text fill-white stroke-archstats-900" stroke-width="0.4em">{{circlePoint.name}}</text>
        <text :x="circlePoint.x + circleSize*1.2"  :y="circlePoint.y" class="font-mono text fill-archstats-50  ">{{circlePoint.name}}</text>
      </g>
    </svg>
  </D3Chart>


</template>


<script setup lang="ts">


import D3Chart from "~/components/ui/d3/D3Chart.vue";
import *  as d3 from 'd3'
import {computed} from "vue";
import PathBetweenPoints from '~/components/components/cousins/PathBetweenPoints.vue';
import type {da} from "cronstrue/dist/i18n/locales/da";

const props = defineProps<{
  component: Component,
  allComponents: Component[],
  allPaths: IndirectPath[],
  colorScale: string,
  direction: 'from' | 'to'
}>()

const toCousins = computed(() => {
  return props.allPaths.filter(path => {
    return path.to === props.component.name;
  })
})

const fromCousins = computed(() => {
  return props.allPaths.filter(path => {
    return path.from === props.component.name;
  })
})

const indirectPaths = computed(() => {
  return props.direction === 'from' ? fromCousins.value : toCousins.value;
})



type IndirectPathIndexData = {
  shortest_path_length: number,
  paths: IndirectPath[]
}

const indirectPathIndex = computed(() => {
  const idx = new Map<string, IndirectPathIndexData>();
  const otherDirection = props.direction === 'from' ? 'to' : 'from';

  indirectPaths.value.forEach(indirectPath => {
    const otherComponent = indirectPath[otherDirection];

    if (!idx.has(otherComponent)) {
      idx.set(otherComponent, {
        shortest_path_length: indirectPath.shortest_path_length,
        paths: []
      })
    }
    idx.get(otherComponent)?.paths.push(indirectPath)
  })
  return idx;
})
const filteredComponents = computed(() => {
  return props.allComponents.filter(component => {
    return indirectPathIndex.value.has(component.name)
  })
})
const componentLookup = computed(() => {
  const idx = new Map<string, Component>();
  filteredComponents.value.forEach(component => {
    idx.set(component.name, component)
  })
  return idx;
})


const minInfluence = computed(() => {
  return filteredComponents.value.reduce((acc, component) => {
    return Math.min(acc, component[props.colorScale])
  }, Infinity)
})

const maxInfluence = computed(() => {
  return filteredComponents.value.reduce((acc, component) => {
    return Math.max(acc, component[props.colorScale])
  }, -Infinity)
})

const canvasSize = 1000;
const circleSize = 15;
const distanceBetween = 150;
const selectedCousin = ref(null);
const hoveredCousin = ref(null);

type Point = {
  name: string,
  colorClass: string,
  component: Component,
  x: number,
  y: number,
  angleFromCenter: number,
  angleFromCenterDegrees: number,
  distanceFromCenter: number
}



// Create a Map<number, IndirectPath[]> where the key is the length of the path
const cousinsGroupedByLength: ComputedRef<Map<number, string[]>> = computed(() => {
  const map = new Map<number, Set<string>>();

  const otherDirection = props.direction === 'from' ? 'to' : 'from';

  for (const cousin of indirectPaths.value) {
    if (!map.has(cousin.shortest_path_length)) {
      map.set(cousin.shortest_path_length, new Set<string>())
    }

    map.get(cousin.shortest_path_length)?.add(cousin[otherDirection])
  }

  const map2 = new Map<number, string[]>();
  map.forEach((cousins, length) => {
    map2.set(length, Array.from(cousins))
  })
  return map2;
})
const levelsData = computed(() => {
  const {min, max} = getMinMaxKeys(cousinsGroupedByLength.value);

  const levelsData = new Map<number, {
    numberOfCirclePoints: number,
    circumference: number
    minimumRequiredRadius: number,
    calculatedRadius: number,
  }>();

  let previousLevelRadius = minFirstLevel;
  for (let level = min; level <= max; level++) {
    const numberOfCirclePoints = cousinsGroupedByLength.value.get(level)?.length || 0;
    const circumference = numberOfCirclePoints * (circlePointRadius + padding);
    const minimumRequiredRadius = circumference / (2 * Math.PI);

    const calculatedRadius = Math.max(minimumRequiredRadius, previousLevelRadius + minDistanceBetweenLevels);
    previousLevelRadius = calculatedRadius;
    levelsData.set(level, {
      numberOfCirclePoints,
      circumference,
      minimumRequiredRadius,
      calculatedRadius: calculatedRadius
    })
  }

  return levelsData;
});

const circlePoints = computed(() => {
  const circlePoints: Point[] = [];

  const levelDataLookup = levelsData.value;
  cousinsGroupedByLength.value.forEach((cousins, length) => {
    const totalPoints = cousins.length;
    cousins.forEach((cousin, pointIndex) => {
      const level = length ;
      const levelData = levelDataLookup.get(level)!;
      const halfCanvas = canvasSize / 2;
      const component = componentLookup.value.get(cousin)!;
      const circlePoint =  {
        name: cousin,
        component,
        // colorClass: numberToTailwindScaledColor(component[props.colorScale], tailwindBgColorsHorizontal, minInfluence.value, maxInfluence.value),
        x: halfCanvas + levelData.calculatedRadius * Math.cos(pointIndex * 2 * Math.PI / totalPoints),
        y: halfCanvas + levelData.calculatedRadius * Math.sin(pointIndex * 2 * Math.PI / totalPoints),
        angleFromCenter: pointIndex * 2 * Math.PI / totalPoints,
        angleFromCenterDegrees: pointIndex * 360 / totalPoints,
        distanceFromCenter: levelData.calculatedRadius,
        colorClass: 'fill-archstats-500'
      }
      circlePoints.push(circlePoint)
    })
  })
  return circlePoints;
})

const pointLookup = computed(() => {
  const idx = new Map<string, Point>();
  circlePoints.value.forEach(point => {
    idx.set(point.name, point)
  })
  return idx;
})

type Segment = {
  from: Point,
  to?: Point,
}
const selectedCousinPath = computed(() => {
  // return generatePathForCousin(selectedCousin.value);
})

const hoveredCousinPath = computed(() => {
   return generatePathsForCousin(hoveredCousin.value);
})
const shouldShowText = computed(() => {
  return (point: Point) => {
    if (hoveredCousin.value == point.name || selectedCousin.value == point.name) {
      return true
    }

    // concat hover and selected paths
    const paths = ((hoveredCousinPath.value || []).concat(selectedCousinPath.value || [])).map(segment => segment.from)

    return paths.some(segment => segment.name === point.name)

  }
})
function generatePathsForCousin(cousin: string | null) {
  if (!cousin) {
    return null;
  }
  const pointIdx = pointLookup.value;
  const segments: Segment[] = [];
  const cousinPaths = indirectPathIndex.value.get(cousin);


  for (let path of cousinPaths?.paths!) {

    const rawSegments = path.shortest_path.split(' -> ');

    if (props.direction === 'from') {
      rawSegments.reverse();
    }

    for (let i = 0; i < rawSegments!.length; i++) {
      const from = pointIdx.get(rawSegments![i]);
      const to = pointIdx.get(rawSegments![i + 1]);
      if (from) {
        segments.push({from, to})
      }
    }
  }

  return segments;
}

const tailwindBgColorsHorizontal = [
  // "bg-archstats-50",
  "fill-archstats-100",
  "fill-archstats-200",
  "fill-archstats-300",
  "fill-archstats-400",
  "fill-archstats-500",
  "fill-archstats-600",
  "fill-archstats-700",
  "fill-archstats-800",
  "fill-archstats-900",
]

// Given a number and a scale, return the corresponding tailwind class
// like so red-100, red-200, red-300, etc.
function numberToTailwindScaledColor(num: number, classes: string[], scaleMin: number, scaleMax: number) {
  if (num === 0) {
    return classes[0]
  }
  if (num >= scaleMax) {
    return classes[classes.length - 1]
  }
  const range = scaleMax - scaleMin
  const step = range / classes.length
  const index = Math.floor((num - scaleMin) / step)
  return classes[index]
}

const minFirstLevel = 100;
const minDistanceBetweenLevels = 150;
const circlePointRadius = 30;
const padding = 7;

// basically use minDistanceBetweenLevels  + number of circles in a level + how big the circles big the circle must be to fit all circles



function getMinMaxKeys(map: Map<number, any>): { min: number; max: number } {
  const keys = Array.from(map.keys()).sort((a, b) => a - b);
  if (keys.length === 0) {
    return { min: 0, max: 0 };
  }
  return { min: keys[0], max: keys[keys.length - 1] };
}

// basically use minDistanceBetweenLevels  + number of circles in a level + how big the circles big the circle must be to fit all circles
const levels = computed(() => {
  return Array.from(levelsData.value.keys())
})

const rings = computed(() => {

  const allLevels = Array.from(levelsData.value.values());

  let previousLevelRadius = allLevels[0].calculatedRadius;

  const toReturn: {radius: number}[] = [];
  for (let i = 1; i < allLevels.length; i++) {
    const currentLevel = allLevels[i];
    let radius = (currentLevel.calculatedRadius + previousLevelRadius) / 2;
    toReturn.push({radius});
    previousLevelRadius = currentLevel.calculatedRadius;
  }

  toReturn.push({radius: previousLevelRadius + minDistanceBetweenLevels/2})



  return toReturn
})



const transform = ref(d3.zoomIdentity);
const viewBox = computed(() => {
  const { k, x, y } = transform.value;
  const newCanvasSize = canvasSize / k;

  return `${x - (newCanvasSize - canvasSize) / 2} ${y - (newCanvasSize - canvasSize) / 2} ${newCanvasSize} ${newCanvasSize}`;
});
const svgRef = useTemplateRef('svgRef');
onMounted(() => {
  const svg = d3.select(svgRef.value);

  const zoom = d3.zoom()
      .on('zoom', (event) => {
        transform.value = event.transform;
      });

  svg.call(zoom);
});



type IndirectPath = {
  from: string,
  to: string,
  shortest_path: string
  shortest_path_length: number
}
</script>

<style scoped>

</style>