<template>

  <div class="flex items-center justify-center gap-2 group" @click="emit('update:modelValue', !modelValue); emit('click')">
    <div class="w-4 h-4 cursor-pointer" >
      <div class="w-full h-full rounded flex justify-center items-center transition-all  border-secondary-500 border group-hover:bg-secondary-50"
      >
        <Icon class="text-secondary-500 transition-all duration-150 ease-in-out" :class="{'opacity-0': !modelValue, 'scale-0': !modelValue}" :size="24" icon="check"></Icon>
      </div>
    </div>

    <slot></slot>
  </div>

</template>
<script setup lang="ts">

import Icon from "~/components/ui/common/Icon.vue";

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits(['update:modelValue', 'click' ])

</script>
<style scoped>

</style>
