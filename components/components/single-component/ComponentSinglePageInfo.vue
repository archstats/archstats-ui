<template>
  <div :class="[divClasses]">
    <div :class="[headingClasses]">
      {{ makeNiceName(props.stat.name) }}
    </div>

    <div v-if="realStats.length">
      <table class="w-full leading-5">
        <tr class="group transition-all " v-for="realStat in realStats">
          <td class="mr-4 text-archstats-50 flex gap-2 ">
            {{ makeNiceName(realStat.name) }}

          </td>
          <td class="w-12 overflow-hidden text-archstats-50">
            {{ round(component[realStat.fullName], 3) }}
          </td>
        </tr>
      </table>
    </div>
    <div v-for="child in categories">
      <ComponentSinglePageInfo :stat="child" :component="component"></ComponentSinglePageInfo>
    </div>
  </div>


</template>
<script setup lang="ts">
import {Stat} from "~/utils/stat-tree";
import {RawComponent} from "~/utils/components";
import * as changeCase from "change-case";
import {round} from "~/utils/text";

const props = defineProps<{
  component: RawComponent,
  stat: Stat
}>()


const realStats = computed<Stat[]>(() => {
  return props.stat.children?.filter(c => c.isRealStat) ?? []
})

const categories = computed<Stat[]>(() => {
  return props.stat.children?.filter(c => !c.isRealStat) ?? []
})

const niceName = computed(() => {
  return makeNiceName(props.stat.name)
})


function makeNiceName(str: string) {
  return changeCase.sentenceCase(str)
}

const headingClasses = computed(() => {
  const styles = [
    "",
    "text-xl text-secondary-500 font-medium mb-2",
    "text-base text-secondary-200 font-medium",
  ]
  if(props.stat.level > styles.length) return ""
  return styles[props.stat.level]
})

const divClasses = computed(() => {
  const styles = [
    "",
    "[&:not(:first-child)]:mt-6 bg-archstats-900  rounded shadow-md transition transition-all p-6",
    "mt-4",
  ]
  if(props.stat.level > styles.length) return ""
  return styles[props.stat.level]
})
</script>
