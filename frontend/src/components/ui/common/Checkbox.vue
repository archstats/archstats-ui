
<template>
  <div class="group inline-flex cursor-pointer select-none items-center gap-2" role="checkbox" :aria-checked="modelValue" tabindex="0"
       @click="emit('update:modelValue', !modelValue); emit('click')"
       @keydown.space.prevent="emit('update:modelValue', !modelValue); emit('click')">
    <span class="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-xs transition-colors"
          :class="modelValue ? 'bg-accent-500 text-on-accent' : 'bg-surface shadow-[0_0_0_1px_rgb(var(--c-neutral-300))] group-hover:shadow-[0_0_0_1px_rgb(var(--c-neutral-400))]'">
      <Icon v-if="modelValue" icon="check" :size="11" class="stroke-[3]"/>
    </span>
    <span class="text-base text-neutral-800"><slot></slot></span>
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
