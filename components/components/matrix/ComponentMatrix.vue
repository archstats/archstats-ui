<template>

  <div class="h-[768px] w-full p-4" :style="{'font-size': `${blockSize}px`}"
  >
    <table class="min-w-full p-8">
      <thead class="">
      <tr>
        <th class="sticky top-0"></th>
        <th></th>
        <th class="font-semibold sticky top-0 bg-white pb-2 z-30" v-for="(component, i) in orderedComponents">
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
        <td :style="{'font-size': '0.8em'}" class=" left-0 bg-white text-left whitespace-nowrap py-0 pr-2">
          <router-link :to="`/views/components/${row.name}`"
                       class="font-mono">{{
              row.name
            }}
          </router-link>
        </td>
        <td :style="{'font-size': '0.8em'}" class="sticky left-0 bg-white text-right pr-4 py-0 whitespace-nowrap"><span
            class="font-semibold">{{
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
                       :time="500"
                       class="w-full h-full"
                       @hoverin="hoveredPair = {from: row.name, to: column.name}"
                       @hoverout="hoveredPair = null"
            >
              <template #default>
                <div
                    :class="[['w-full h-full flex items-center justify-center'], {
                      // Set the background color based on the coupling value
                      [( rowIndex < columnIndex ? tailwindBackgroundIndexVertical: tailwindBackgroundIndexHorizontal).get(`${row.name} -> ${column.name}`)]: true,
                      'border-2 border-gray-900': shouldHighlightOnHover(row.name, column.name),
                    }]">
                  <Icon class="text-gray-900" v-if="shouldHighlightOnHover(row.name, column.name)" :size="8" icon="x"/>
                </div>
              </template>
              <template #hovered-content>
                <div class="absolute bg-white rounded shadow z-10 p-4">
                  <div class="text-xs">
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
import {computed} from "vue";
import {RawComponent} from "~/utils/components";
import {useDataStore} from "~/stores/data";
import LongHover from "~/components/ui/common/LongHover.vue";
import Icon from "~/components/ui/common/Icon.vue";
import DirectConnectionDetails from "~/components/components/coupling/direct/DirectConnectionDetails.vue";

const store = useDataStore();
const props = defineProps(
    {
      components: {
        type: Array as PropType<RawComponent[]>,
        required: true
      },
      blockSize: {
        type: Number,
        default: 16
      },
      scaleColorWith: {
        type: String,
        default: "coupling",
      }
    }
)


type Connection = {
  from: string,
  to: string,
  references: number,
  coupling: number
  shared_commits: number
};
const connections = computed(() => {
  let qry: string;


  if (store.hasView("git_component_shared_commits")) {
    qry = `
      select git."pair_1"                           as "from",
             git."pair_2"                           as "to",
             coalesce(sum(conn.reference_count), 0) as "references",
             count(conn.reference_count)            as "coupling",

             git.shared_commits                as "shared_commits"
      from git_component_shared_commits git
             left join component_connections_direct conn on pair_1 = "from" and pair_2 = "to"
      where (git.shared_commits > 0 or conn.reference_count > 0)
      group by 1, 2;
    `
  } else {
    qry = `
      SELECT "from", "to", sum(reference_count) AS "references", count(reference_count) AS "coupling"
      FROM component_connections_direct
      GROUP BY 1, 2;
    `
  }
  return store.query(qry) as Connection[]
})

const connectionIndex = computed(() => {
  return connections.value.reduce((acc, connection) => {
    acc.set(`${connection.from} -> ${connection.to}`, connection)
    return acc
  }, new Map<string, Connection>())
})

const hoveredPair: Ref<{ from: string, to: string } | null> = ref(null)

function shouldHighlightOnHover(from: string, to: string) {
  return hoveredPair.value &&
      ((hoveredPair.value.from === from && hoveredPair.value.to === to) || (hoveredPair.value.from === to && hoveredPair.value.to === from))
}


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

const colorScaleProperty = computed(() => {
  switch (props.scaleColorWith) {
    case "shared_commits":
      if (store.hasView("git_component_shared_commits")) {
        return "shared_commits"
      }
    case "references":
      return "references"
    default:
      return "coupling"
  }
})
const colorScaleRange = computed(() => {
  const couplingValues = connections.value.map(c => c[colorScaleProperty.value])

  let min=0, max=0;

  couplingValues.forEach(value => {
    if ( value < min) {
      min = value
    }
    if ( value > max) {
      max = value
    }
  })
  return {
    min, max
  }
})


const tailwindBackgroundIndexVertical = computed(() => {
  const index = new Map<string, string>()

  const range = colorScaleRange.value;
  connectionIndex.value.forEach((connection, key) => {
    const color = numberToTailwindScaledColor(connection[colorScaleProperty.value], tailwindBgColorsVertical, range.min, range.max)
    index.set(key, color)
  })
  return index;
})

const tailwindBackgroundIndexHorizontal = computed(() => {
  const index = new Map<string, string>()

  const range = colorScaleRange.value;
  connectionIndex.value.forEach((connection, key) => {
    const color = numberToTailwindScaledColor(connection[colorScaleProperty.value], tailwindBgColorsHorizontal, range.min, range.max)
    index.set(key, color)
  })
  return index;
})


const tailwindBgColorsHorizontal = [
  "bg-archstats-50",
  "bg-archstats-100",
  "bg-archstats-200",
  "bg-archstats-300",
  "bg-archstats-400",
  "bg-archstats-500",
  "bg-archstats-600",
  "bg-archstats-700",
  "bg-archstats-800",
  "bg-archstats-900",
]

const tailwindBgColorsVertical = [
  "bg-secondary-50",
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
  if (num === 0) {
    return "bg-white"
  }
  if (num >= scaleMax) {
    return classes[classes.length - 1]
  }
  const range = scaleMax - scaleMin
  const step = range / classes.length
  const index = Math.floor((num - scaleMin) / step)
  return classes[index]
}
</script>