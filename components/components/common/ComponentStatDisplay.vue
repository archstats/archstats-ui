<template>
  <div>
    <div class="" v-if="!stat.children?.length">
      {{ stat.name }}<span v-if="isStat">: {{component[stat.fullName]}}</span>
    </div>
    <!--    <div v-else-if="stat.level !==1 &&stat.children?.length === 1">-->
    <!--      <X :stat="stat.children[0]"></X>-->
    <!--    </div>-->
    <div v-else>
    <span class="text-xl text-archstats-500" v-if="stat.level===1">
      {{ stat.name }} <span v-if="isStat">: {{component[stat.fullName]}}</span>

    </span>
      <span v-else class="text-archstats-500">
          {{ stat.name }}<span v-if="isStat">: {{component[stat.fullName]}}</span>
    </span>

      <div class="" :style="{'margin-left': `${(stat.level+1) * 8}px`}" v-for="child in orderedChildren">
        <ComponentStatDisplay :stat="child" :component="component"></ComponentStatDisplay>

      </div>
    </div>
  </div>


</template>

<script setup lang="ts">
import {Stat} from "~/utils/stat-tree";
import Expandable from "~/components/ui/common/Expandable.vue";
import {RawComponent} from "~/utils/components";

const props = defineProps<{
  stat: Stat,
  component: RawComponent
}>()

const orderedChildren = computed(() => {
  return props.stat.children?.sort((a, b) => {
    if (a.children?.length == b.children?.length) return a.fullName.localeCompare(b.fullName)

    const aLength = a.children?.length ?? 0
    const bLength = b.children?.length ?? 0
    return aLength - bLength
  });
})

const isStat = computed(() => {
  return Object.keys(props.component).includes(props.stat.fullName)
})


</script>