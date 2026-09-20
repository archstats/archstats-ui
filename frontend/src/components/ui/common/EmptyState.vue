<template>
  <div class="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <Icon v-if="icon" :icon="icon" :size="20" class="text-neutral-300"/>
    <p class="text-base font-medium text-neutral-700">{{ title }}</p>
    <p v-if="text" class="max-w-[42ch] text-sm leading-4 text-neutral-500">{{ text }}</p>
    <div v-if="$slots.default" class="mt-2 flex items-center gap-2"><slot></slot></div>
  </div>
</template>
<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
defineProps<{ title: string; text?: string; icon?: string }>()
</script>
