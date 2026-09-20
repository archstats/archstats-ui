<template>
  <div class="absolute right-4 z-20 flex flex-col gap-1" :class="position === 'top-right' ? 'top-4' : 'bottom-4'">
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon" aria-label="Zoom in" title="Zoom in" @click="$emit('zoom-in')"><Icon icon="zoom-in" :size="14" class="text-neutral-600"/></button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon" aria-label="Zoom out" title="Zoom out" @click="$emit('zoom-out')"><Icon icon="zoom-out" :size="14" class="text-neutral-600"/></button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon" aria-label="Reset view" title="Reset view" @click="$emit('reset')"><Icon icon="rotate" :size="14" class="text-neutral-600"/></button>
  </div>
</template>
<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
defineEmits<{ (e: 'zoom-in'): void; (e: 'zoom-out'): void; (e: 'reset'): void }>()
withDefaults(defineProps<{ position?: 'bottom-right' | 'top-right' }>(), { position: 'bottom-right' })
</script>
