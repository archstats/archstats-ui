<template>
  <!-- A figure's legend in the app: the same entries, marks and notes an
       export draws under the figure, set in the window's type. -->
  <div class="flex flex-col gap-1 text-xs leading-4 text-neutral-600" aria-label="Legend">
    <ul v-if="legend.items?.length" class="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      <li v-for="(item, i) in legend.items" :key="i" class="flex min-w-0 items-center gap-1.5" :title="item.title">
        <svg width="12" height="10" viewBox="0 0 12 10" class="shrink-0" aria-hidden="true">
          <line v-if="item.mark === 'line' || item.mark === 'dashed'" x1="0" y1="5" x2="12" y2="5" :stroke="item.color" stroke-width="2" :stroke-dasharray="item.mark === 'dashed' ? '3 2' : undefined"/>
          <circle v-else-if="item.mark === 'dot'" cx="5" cy="5" r="4" :fill="item.color"/>
          <circle v-else-if="item.mark === 'ring'" cx="5" cy="5" r="3.5" fill="none" :stroke="item.color" stroke-width="1.5"/>
          <g v-else-if="item.mark === 'hatch'" :stroke="item.color" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" rx="2"/>
            <path d="M1 9 L9 1 M1 5 L5 1 M5 9 L9 5" stroke-width="1"/>
          </g>
          <rect v-else x="0" y="0" width="10" height="10" rx="2" :fill="item.color"/>
        </svg>
        <span class="truncate">{{ item.label }}</span>
        <span v-if="item.count != null" class="font-mono text-neutral-500">{{ item.count.toLocaleString("en-US") }}</span>
      </li>
    </ul>
    <p v-for="(ramp, i) in legend.ramps ?? []" :key="`r${i}`" class="flex items-center gap-1.5">
      <span class="text-neutral-700">{{ ramp.label }}</span>
      <span class="text-neutral-500">{{ ramp.low }}</span>
      <span class="h-2.5 w-24 rounded-sm" :style="{ background: `linear-gradient(to right, ${ramp.colors.join(', ')})` }" aria-hidden="true"></span>
      <span class="text-neutral-500">{{ ramp.high }}</span>
    </p>
    <p v-for="(note, i) in legend.notes ?? []" :key="`n${i}`" class="max-w-[80ch] text-neutral-500">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import type { FigureLegend } from "~/features/export/figure";

defineProps<{ legend: FigureLegend }>();
</script>
