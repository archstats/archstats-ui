<template>
  <!-- A count per period as columns, oldest left. -->
  <div class="xt">
    <div class="xt-cols" role="img" :aria-label="ariaLabel">
      <button
          v-for="p in points"
          :key="p.label"
          type="button"
          class="xt-col"
          :class="{ 'xt-on': lit.has(`period:${p.label}`) }"
          :title="`${p.label}: ${p.value.toLocaleString('en-US')} ${unit}`"
          @click="$emit('select', p.label)"
      ><span class="xt-bar" :style="{ height: `${Math.max(2, (p.value / max) * 100)}%` }"/></button>
    </div>
    <div class="xt-axis"><span>{{ points[0]?.label }}</span><span>{{ points[points.length - 1]?.label }}</span></div>
    <p class="xt-legend"><span class="xt-swatch"/> column height = {{ unit }} per {{ period }}<template v-if="note"> · {{ note }}</template></p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{
  points: Array<{ label: string; value: number }>
  unit: string
  period?: string
  note?: string
  highlight?: string[]
  ariaLabel: string
}>(), { period: "month", note: "", highlight: () => [] })
defineEmits<{ (e: "select", label: string): void }>()

const lit = computed(() => new Set(props.highlight))
const max = computed(() => Math.max(1, ...props.points.map(p => p.value)))
</script>

<style scoped>
.xt-cols { display: flex; align-items: flex-end; gap: 2px; height: 120px; }
.xt-col { flex: 1; height: 100%; display: flex; align-items: flex-end; min-width: 3px; border-radius: 2px; }
.xt-col:hover { background: rgb(var(--c-neutral-50)); }
.xt-bar { display: block; width: 100%; border-radius: 2px 2px 0 0; background: rgb(var(--c-accent-400)); }
.xt-on .xt-bar { background: rgb(var(--c-accent-700)); }
.xt-axis { margin-top: 4px; display: flex; justify-content: space-between; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.xt-legend { margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.xt-swatch { width: 8px; height: 10px; border-radius: 2px; background: rgb(var(--c-accent-400)); }
</style>
