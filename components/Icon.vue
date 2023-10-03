<template>
  <component :is="iconComponent" :size="props.size"></component>

</template>

<script setup lang="ts">
import "css.gg/icons/icons.css"
import {computed} from "vue";


import {Info, ChevronDown, ChevronUp, ChevronRight, MoreVertical, RotateCcw, Footprints, Pencil} from 'lucide-vue-next';

const props = defineProps(
    {
      icon: String,
      size: {
        type: Number,
        default: 18
      }
    }
)

const iconComponent = computed(() => {
  switch (props.icon) {
    case "info":
      return Info
    case "chevron-down":
      return ChevronDown
    case "chevron-up":
      return ChevronUp
    case "chevron-right":
      return ChevronRight
    case "more-vertical":
      return MoreVertical
    case "rotate":
      return RotateCcw
    case "footprints":
      return Footprints
    case "pencil":
      return Pencil
  }
})


</script>

<style scoped>

</style>