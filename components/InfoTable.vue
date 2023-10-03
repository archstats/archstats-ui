<template>

  <table class="">
    <tbody>

    <tr v-for="info in elementNormalized">

      <td class="mr-4 text-gray-500 flex gap-2">
        <LongHover v-if="definition.has(info.key)" :time="200">
          <template #main-content>
            <span class="hover:text-archstats-500 cursor-pointer">{{ definition.get(info.key).name }}</span>
          </template>
          <template #hovered-content>
            <div class="absolute bg-gray-50 p-6 shadow-2xl w-96 z-10">
              <Definition :definition="info.key" mode="short"/>
            </div>
          </template>
        </LongHover>
        <span v-else>{{info.key}}</span>

        </td>
      <td class="w-12 overflow-hidden ">{{ round(info.value, 3) }}</td>
    </tr>


    </tbody>
  </table>
</template>
<script setup lang="ts">
import "css.gg/icons/icons.css"
import {computed, ComputedRef, defineProps} from "vue";
import {RawComponent} from "~/utils/components";
import {round} from "~/utils/text";
import {useDataStore} from "~/stores/data";

const store = useDataStore()
const props = defineProps<{ component: RawComponent, onlyShow?: string[] }>()

const definition = computed(() => {
  return store.definitions
})

const elementNormalized: ComputedRef<{ key: string, value: any }[]> = computed(() => {
  const component = props.component
  if (component) {
    let toReturn: { key: string, value: any }[] = []
    let columns = props.onlyShow || Object.keys(component);
    columns.forEach(key => {
      if (typeof component[key] === 'number') {
        toReturn.push({key, value: component[key]})
      }
    })
    return toReturn
  }
  return []
})


</script>
