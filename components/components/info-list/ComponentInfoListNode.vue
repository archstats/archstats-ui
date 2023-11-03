<template>


  <div :class="[divClasses]">
    <span :class="[headingClasses]">
      {{ stat.name }}
    </span>

    <div v-if="realStats.length">

      <table class="w-full">
        <tr class="group transition-all" v-for="realStat in realStats">
          <td class="mr-4 text-archstats-200 flex gap-2 group-hover:text-archstats-800">
            {{ realStat.name }}

          </td>
          <td class="w-12 overflow-hidden text-archstats-900  group-hover:text-black">
            {{ round(component[realStat.fullName], 3) }}
          </td>
        </tr>
      </table>
    </div>
    <div :style="{'margin-left': `${(stat.level) * 0}px`}" v-for="child in categories">
      <ComponentInfoListNode :stat="child" :component="component"></ComponentInfoListNode>
    </div>
  </div>


</template>
<script setup lang="ts">
import {Stat} from "~/utils/stat-tree";
import {RawComponent} from "~/utils/components";
import ComponentStatDisplay from "~/components/components/common/ComponentStatDisplay.vue";
import {round} from "~/utils/text";
import InfoTable from "~/components/ui/tables/InfoTable.vue";

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



const headingClasses = computed(() => {
  const styles = [
    "",
    "text-xl text-archstats-700",
    "text-base text-archstats-600",
    "text-xl text-archstats-500",
  ]
  if(props.stat.level > styles.length) return ""
  return styles[props.stat.level]
})

const divClasses = computed(() => {
  const styles = [
    "",
    "[&:not(:first-child)]:mt-6 border transition transition-all hover:border-archstats-300 p-4",
    "my-2",
  ]
  if(props.stat.level > styles.length) return ""
  return styles[props.stat.level]
})
</script>