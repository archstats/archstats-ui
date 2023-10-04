<template>
  <tr  :class="{'border-b-2':!expanded,'font-semibold': userSelectedPositionInPath == nr-1, 'opacity-40': nr-1 > userSelectedPositionInPath }">
    <td class="font-semibold w-8 text-gray-400 px-2 text-right" v-if="pathOccurrences > 1">
      <LongHover>
        <template #main-content><span class="cursor-pointer">{{ pathOccurrences }}x</span></template>
        <template #hovered-content>
          <div class="absolute bg-gray-50 w-52 font-normal text-gray-700 p-2 shadow z-10 text-center">
            <p>This component was seen <span class="font-bold">{{ pathOccurrences }}</span> time(s) before on this path.</p>
          </div>
        </template>
      </LongHover></td>
    <td class="w-8" v-else></td>
    <td class="font-semibold pr-4 text-archstats-primary-200">{{ nr }}</td>
    <td class="font-mono cursor-pointer hover:underline text-archstats-primary-900" @click="select">{{
        segment.currentComponent
      }}
    </td>
    <td class="font-semibold pl-4 flex text-archstats-primary-900"
        :class="{'text-archstats-secondary-500': segment.relationship == 'depends on'}">
      <Icon v-if="segment.relationship" @click="expanded = !expanded" :icon="expanded ? 'chevron-down':'chevron-right'" class="cursor-pointer text-gray-700 mr-2" />

      <span>{{ segment.relationship }}</span>
    </td>
  </tr>
  <tr class = 'border-b-2 ' v-if="expanded && segment.otherComponent">
    <td></td>
    <td></td>
    <td colspan="2" class="border-2 border-gray-200  bg-white p-4">
      <DirectConnectionDetails v-if="segment.relationship == 'depends on'"
                               :from="segment.currentComponent"
                               :to="segment.otherComponent"
      />
      <DirectConnectionDetails v-else
                               :from="segment.otherComponent"
                               :to="segment.currentComponent"
      />
    </td>
  </tr>
</template>
<script setup lang="ts">

import {PathSegment} from "~/utils/path";

const props = defineProps<{
  segment: PathSegment,
  userSelectedPositionInPath: number,
  nr: number,
  pathOccurrences: number
}>()

const expanded = ref(false)
const emit = defineEmits(["select"])


function select() {
  emit("select")
}
</script>
