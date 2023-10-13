<template>
  <div class="relative w-full h-full" @mouseleave="mouseLeave" tabindex="0" @click="mouseEnter" @focusin="hasFocus = true" @focusout="hasFocus = false">
    <div ref="main-content" @mouseenter="mouseEnter" class="w-full h-full" >
      <slot name="main-content"></slot>
    </div>
    <div ref="hovered-content" v-if="shouldShow">
      <slot class="absolute" name="hovered-content"></slot>
    </div>
  </div>


</template>

<script setup lang="ts">
import {useDataStore} from "~/stores/data";

const props = defineProps({
  time: {
    type: Number,
    default: 300
  },
  active: {
    type: Boolean,
    default: false
  }
})

const mouseInTimer = ref<NodeJS.Timeout | null>(null)

const isHovered = ref(false)
const hasFocus = ref(false)

function mouseEnter() {
  mouseInTimer.value = setTimeout(() => {
    isHovered.value = true
  }, props.time)
}

function mouseLeave() {
  if (mouseInTimer.value) {
    clearTimeout(mouseInTimer.value)
  }
  isHovered.value = false
}

const shouldShow = computed(() => {
  return isHovered.value || hasFocus.value || props.active
})



</script>