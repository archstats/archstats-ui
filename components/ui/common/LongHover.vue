<template>
  <div class="relative w-full h-full" @mouseenter="mouseEnter" @mouseleave="mouseLeave" tabindex="0">
    <slot name="default"></slot>
    <div ref="hovered-content" class="absolute" v-if="shouldShow">
      <slot name="hovered-content"></slot>
    </div>
  </div>


</template>

<script setup lang="ts">

const props = defineProps({
  time: {
    type: Number,
    default: 300
  },
  active: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const mouseInTimer = ref<NodeJS.Timeout | null>(null)

const isHovered = ref(false)
const hasFocus = ref(false)
const emits = defineEmits(["hoverin", "hoverout"])



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
  return !props.disabled &&(isHovered.value || hasFocus.value || props.active)
})

watch(shouldShow, (value) => {
  if (value) {
    emits("hoverin")
  } else {
    emits("hoverout")
  }
})


</script>
