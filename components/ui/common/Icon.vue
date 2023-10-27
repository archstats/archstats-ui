<template>
  <component :is="iconComponent" :size="props.size"></component>

</template>

<script setup lang="ts">
import "css.gg/icons/icons.css"
import {computed} from "vue";


import {
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreVertical,
  RotateCcw,
  Footprints,
  Pencil,
  ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ArrowRightFromLine, Check, ArrowRight, ArrowLeft, Recycle
} from 'lucide-vue-next';

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
    case "recycle":
      return Recycle
    case "info":
      return Info
    case "chevron-down":
      return ChevronDown
    case "chevron-up":
      return ChevronUp
    case "chevron-right":
      return ChevronRight
    case "chevron-left":
      return ChevronLeft
    case "more-vertical":
      return MoreVertical
    case "rotate":
      return RotateCcw
    case "footprints":
      return Footprints
    case "pencil":
      return Pencil
    case "arrow-left-to-line":
      return ArrowLeftToLine
    case "arrow-right-to-line":
      return ArrowRightToLine
    case "arrow-right-from-line":
      return ArrowRightFromLine
    case "check":
      return Check
    case "arrow-right":
      return ArrowRight
    case "arrow-left":
      return ArrowLeft
    case "x":
      return X
  }
})


</script>

<style scoped>

</style>