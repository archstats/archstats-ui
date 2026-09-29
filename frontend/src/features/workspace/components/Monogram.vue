<template>
  <!-- A workspace's two-letter badge. Neutral on purpose: hue belongs to data. -->
  <span
      class="flex h-5 w-5 shrink-0 select-none items-center justify-center rounded text-[11px] font-semibold leading-none"
      :class="active ? 'bg-surface text-neutral-900 shadow-[0_0_0_1px_rgb(var(--c-accent-300))]' : 'bg-surface text-neutral-600 shadow-[0_0_0_1px_rgb(var(--c-neutral-300))]'"
      aria-hidden="true"
  >{{ letters }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { monogram } from "~/features/workspace/scanFlow";

const props = defineProps<{ name: string; active?: boolean }>();
const letters = computed(() => (props.name ? monogram(props.name) : "·"));
</script>
