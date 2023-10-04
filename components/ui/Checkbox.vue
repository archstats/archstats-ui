<template>

  <div class="flex items-center justify-center gap-2">
    <div class="w-4 h-4 cursor-pointer" @click="emit('update:modelValue', !modelValue); emit('click')">
      <div class="w-full h-full rounded flex justify-center items-center  border-archstats-500 border"
      >
        <Icon class="text-archstats-500 transition-all duration-150 ease-in-out" :class="{'opacity-0': !modelValue, 'scale-0': !modelValue}" :size="24" icon="check"></Icon>
      </div>
    </div>

    <slot></slot>
  </div>

</template>
<script setup lang="ts">

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits(['update:modelValue', ])

</script>
<style scoped>

</style>