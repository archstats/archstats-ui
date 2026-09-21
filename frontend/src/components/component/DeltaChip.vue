<template>
  <!-- The change since an earlier snapshot. Silent when there is no baseline,
       when the value did not move, or when the metric has no better direction
       to point in: a component growing by 400 lines is a fact, not a fault. -->
  <span v-if="text" class="font-mono text-xs tabular-nums" :class="ink" :title="deltaTitle(delta, decimals)">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { deltaText, deltaTitle, deltaTone, type Delta, type DeltaDirection } from "~/utils/delta"

const props = withDefaults(defineProps<{
  delta: Delta
  /** Which way is better, where the engine's own definition says so. */
  direction?: DeltaDirection
  /** Decimals, matching the value the chip sits beside. */
  decimals?: number
}>(), { direction: "neutral", decimals: 0 })

const text = computed(() => deltaText(props.delta, props.decimals))

const ink = computed(() => {
  switch (deltaTone(props.delta, props.direction, props.decimals)) {
    case "good": return "text-green-700"
    case "bad": return "text-red-700"
    case "new": return "text-accent-700"
    default: return "text-neutral-500"
  }
})
</script>
