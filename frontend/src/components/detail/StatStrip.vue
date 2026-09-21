<template>
  <!-- The one headline strip every overview uses: six readings in one hairline
       frame, label over a 22px tabular value, a level dot when the value is a
       health or hotspot score. Values stay neutral ink; only signed line
       counts may carry the green or red data ink. -->
  <dl class="grid rounded-lg hairline" :style="{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }">
    <div v-for="(cell, i) in cells" :key="cell.label" class="flex min-w-0 flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i !== 0 }">
      <dt class="truncate text-sm leading-4 text-neutral-500" :title="cell.title || cell.label">{{ cell.label }}</dt>
      <dd class="flex items-baseline gap-2 truncate font-sans text-[22px] font-medium leading-7 tabular-nums" :class="cell.ink || 'text-neutral-900'">
        <span v-if="cell.level" class="h-2 w-2 shrink-0 translate-y-[-3px] rounded-full" :class="levelDotClass(cell.level)"></span>
        <span class="truncate">{{ cell.value }}</span>
        <DeltaChip v-if="cell.delta" :delta="cell.delta" :direction="cell.direction ?? 'neutral'" :decimals="cell.decimals ?? 0"/>
      </dd>
    </div>
  </dl>
</template>
<script setup lang="ts">
import { levelDotClass, type HealthLevel } from "~/composables/useHealth";
import DeltaChip from "~/components/component/DeltaChip.vue";
import type { Delta } from "~/utils/delta";
export interface StatCell {
  label: string; value: string | number; level?: HealthLevel; ink?: string; title?: string; key?: string;
  /** Change against an earlier snapshot, where a view has one. */
  delta?: Delta; direction?: "up-good" | "up-risk" | "neutral"; decimals?: number;
}
defineProps<{ cells: StatCell[] }>()
</script>
