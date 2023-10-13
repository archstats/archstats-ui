<template>

  <div class="h-[768px] w-full p-4" :style="{'font-size': `${blockSize}px`}"
  >
        <table class="min-w-full p-8">
          <thead class="">
          <tr>
            <th class="sticky top-0"></th>
            <th></th>
            <th class="font-semibold sticky top-0 bg-white pb-2" v-for="(component, i) in orderedComponents">
              <div class="relative  text-black justify-end items-center"
                   :style="{width: `${blockSize}px`, height: `${blockSize}px`, 'font-size': '0.8em'}">

                <div class="">
                  {{ i + 1 }}
                </div>
              </div>
            </th>
          </tr>
          </thead>
          <tbody class="overflow-hidden">
          <tr v-for="(row, rowIndex) in orderedComponents" class="hover:bg-gray-100 overflow-clip py-0 "
              :key="`${row.name}`" :style="{height:'1em'}">
            <td :style="{'font-size': '0.8em'}" class=" left-0 bg-white text-left whitespace-nowrap py-0 pr-2" ><span class="font-mono">{{
                row.name
              }}</span></td>
            <td :style="{'font-size': '0.8em'}" class="sticky left-0 bg-white text-right pr-4 py-0 whitespace-nowrap"><span class="font-semibold">{{
                rowIndex + 1
              }}</span></td>
            <td class="text-black border p-0" v-for="(column, columnIndex) in components"
                :key="`${row.name} -> ${column.name}`" :style="{width: '1em', height:'1em'}">
              <div class="w-full h-full">
                <div
                    v-if="rowIndex == columnIndex"
                    class="bg-gray-300 w-full h-full"
                ></div>

                <LongHover v-else
                           class="w-full h-full"
                >
                  <template #main-content>
                    <div
                        class="w-full h-full"
                        :class="{ [( rowIndex < columnIndex ? tailwindBackgroundIndexVertical: tailwindBackgroundIndexHorizontal).get(`${row.name} -> ${column.name}`)]: true }">

                    </div>
                  </template>
                  <template #hovered-content>
                    <div class="absolute bg-gray-100 rounded shadow z-10 p-4">
                      <div class="text-xs">
                        <div class="font-semibold mb-2 flex gap-1">
                          <span>{{ row.name }}</span>
                          <Icon icon="arrow-right"/>
                          <span>{{ column.name }}</span>
                        </div>
                        <DirectConnectionDetails :from="row.name" :to="column.name"/>
                      </div>
                    </div>

                  </template>
                </LongHover>

              </div>

            </td>
          </tr>

          </tbody>
        </table>

  </div>


</template>

<script setup lang="ts">
import VirtualScroller from 'primevue/virtualscroller';
import {computed} from "vue";
import {RawComponent} from "~/utils/components";
import {useDataStore} from "~/stores/data";

const store = useDataStore();
const props = defineProps<{ components: RawComponent[], blockSize: number }>()


type Connection = {
  from: string,
  to: string,
  references: number,
  coupling: number
};
const connections = computed(() => {
  return store.query(`
    SELECT "from", "to", sum(reference_count) AS "references", count(reference_count) AS "coupling"
    FROM component_connections_direct
    GROUP BY 1, 2;
  `) as Connection[]
})

const connectionIndex = computed(() => {
  return connections.value.reduce((acc, connection) => {
    acc.set(`${connection.from} -> ${connection.to}`, connection)
    return acc
  }, new Map<string, Connection>())
})


const orderedComponents = computed(() => {
  return props.components
})


function makeMatrix(strings: string[]): string[][][] {
  const matrix: string[][][] = [];
  for (let i = 0; i < strings.length; i++) {
    const row: string[][] = [];
    for (let j = 0; j < strings.length; j++) {
      row.push([strings[i], strings[j]]);
    }
    matrix.push(row);
  }
  return matrix;
}
const componentGrid = computed(() => {
  return makeMatrix(orderedComponents.value.map(e => e.name))
})

const ranges = computed(() => {
  const couplingValues = connections.value.map(c => c.coupling)
  const referenceValues = connections.value.map(c => c.references)
  return {
    minCoupling: Math.min(...couplingValues),
    maxCoupling: Math.max(...couplingValues),
    minReferences: Math.min(...referenceValues),
    maxReferences: Math.max(...referenceValues),
  }
})


const tailwindBackgroundIndexVertical = computed(() => {
  const index = new Map<string, string>()
  connectionIndex.value.forEach((connection, key) => {
    const color = numberToTailwindScaledColor(connection.coupling, tailwindBgColorsVertical, ranges.value.minCoupling, ranges.value.maxCoupling)
    index.set(key, color)
  })
  return index;
})

const tailwindBackgroundIndexHorizontal = computed(() => {
  const index = new Map<string, string>()
  connectionIndex.value.forEach((connection, key) => {
    const color = numberToTailwindScaledColor(connection.coupling, tailwindBgColorsHorizontal, ranges.value.minCoupling, ranges.value.maxCoupling)
    index.set(key, color)
  })
  return index;
})


const tailwindBgColorsHorizontal = [
  "bg-tertiary-100",
  "bg-tertiary-200",
  "bg-tertiary-300",
  "bg-tertiary-400",
  "bg-tertiary-500",
  "bg-tertiary-600",
  "bg-tertiary-700",
  "bg-tertiary-800",
  "bg-tertiary-900",
]

const tailwindBgColorsVertical = [
  "bg-secondary-100",
  "bg-secondary-200",
  "bg-secondary-300",
  "bg-secondary-400",
  "bg-secondary-500",
  "bg-secondary-600",
  "bg-secondary-700",
  "bg-secondary-800",
  "bg-secondary-900",
]
// Given a number and a scale, return the corresponding tailwind class
// like so red-100, red-200, red-300, etc.
function numberToTailwindScaledColor(num: number, classes: string[], scaleMin: number, scaleMax: number) {
  const range = scaleMax - scaleMin
  const step = range / classes.length
  const index = Math.floor((num - scaleMin) / step)
  return classes[index]
}
</script>