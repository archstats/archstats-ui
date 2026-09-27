<template>
  <!-- What a pipeline does, in the order a delivery runs: every stage is
       shown, the ones it does in ink, the rest as a faint outline, so two
       strips compare at a glance. -->
  <span class="inline-flex items-center gap-0.5" :aria-label="`Stages: ${on.join(', ') || 'none recognised'}`">
    <span
      v-for="s in strip" :key="s.stage"
      class="inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] leading-none"
      :class="s.on ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 ring-1 ring-inset ring-neutral-200'"
      :title="s.on ? `${s.label}: yes` : `${s.label}: not seen in this pipeline`"
    >{{ s.label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { stageStrip } from "../deployables"

const props = defineProps<{ stages: string }>()
const strip = computed(() => stageStrip(props.stages))
const on = computed(() => strip.value.filter(s => s.on).map(s => s.label))
</script>
