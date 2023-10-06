<template>

  <div class="w-full h-[700px] ">
    <table class="min-w-full p-8">
      <thead class="">
      <tr>
        <th class="sticky top-0"></th>
        <th></th>
        <th class="font-semibold sticky top-0 bg-white" v-for="(component, i) in orderedComponents">
          <div class="relative w-6 text-black justify-end items-center">

            <div class="">

              {{ i+1 }}
            </div>
          </div>
        </th>
      </tr>
      </thead>
      <tbody class="overflow-hidden">
      <tr v-for="(current, currentIndex) in orderedComponents">
        <td class=" left-0 bg-white text-left whitespace-nowrap pr-2"><span class="font-mono text-sm">{{
            current.name
          }}</span></td>
        <td class="sticky left-0 bg-white text-right pr-4 whitespace-nowrap"><span class="font-semibold">{{
            currentIndex+1
          }}</span></td>
        <td class="text-black border" v-for="(other, otherIndex) in components">
          <div class="[&>*]:w-6 [&>*]:h-6">
            <div class="bg-gray-300" v-if="currentIndex == otherIndex"></div>

            <div v-else-if="currentIndex < otherIndex"
                 :class="{ [tailwindBackgroundIndexVertical.get(`${current.name} -> ${other.name}`)]: true }"></div>
            <div v-else
                 :class="{ [tailwindBackgroundIndexHorizontal.get(`${current.name} -> ${other.name}`)]: true }"></div>
          </div>

        </td>
      </tr>

      </tbody>
    </table>
  </div>


</template>

<script setup lang="ts">

import {computed} from "vue";
import {RawComponent} from "~/utils/components";
import {useDataStore} from "~/stores/data";

const store = useDataStore();
const props = defineProps<{ components: RawComponent[] }>()


const componentNamesFormattedForQuery = computed(() => {
  return props.components.map(c => `'${c.name}'`).join(",")
})

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

const orderedComponents = computed(() => {
  return props.components.sort((a, b) => a.name.localeCompare(b.name))
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

const connectionIndex = computed(() => {
  return connections.value.reduce((acc, connection) => {
    acc.set(`${connection.from} -> ${connection.to}`, connection)
    return acc
  }, new Map<string, Connection>())
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