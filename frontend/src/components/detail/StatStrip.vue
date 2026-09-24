<template>
  <!-- The one headline strip every overview uses: six readings in one hairline
       frame, label over a 22px tabular value, a level dot when the value is a
       health or hotspot score. Values stay neutral ink; only signed line
       counts may carry the green or red data ink. -->
  <!-- The value scales with the strip's own width. At 22px fixed, six tiles
       in a narrow window cut "+492,520" to "+492,5…": a number that reads
       as a different number. -->
  <dl class="grid rounded-lg hairline" :style="{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, containerType: 'inline-size' }">
    <div v-for="(cell, i) in cells" :key="cell.label" class="flex min-w-0 flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i !== 0 }">
      <dt class="text-sm leading-4 text-neutral-500" style="overflow-wrap: anywhere" :title="isMetric(cell.key) ? undefined : cell.title || cell.label">
        <MetricHint v-if="isMetric(cell.key)" :id="cell.key!">{{ cell.label }}</MetricHint>
        <template v-else>{{ cell.label }}</template>
      </dt>
      <dd class="flex items-baseline gap-2 font-sans font-medium leading-7 tabular-nums" :class="cell.ink || 'text-neutral-900'"
          :style="{ fontSize: `clamp(14px, ${(13 / cells.length).toFixed(2)}cqi, 22px)` }">
        <span v-if="cell.level" class="h-2 w-2 shrink-0 translate-y-[-3px] rounded-full" :class="levelDotClass(cell.level)"></span>
        <span class="whitespace-nowrap">{{ cell.value }}</span>
        <DeltaChip v-if="cell.delta" :delta="cell.delta" :direction="cell.direction ?? 'neutral'" :decimals="cell.decimals ?? 0"/>
      </dd>
    </div>
  </dl>
</template>
<script setup lang="ts">
import MetricHint from "~/components/ui/common/MetricHint.vue";
import { useDataStore } from "~/stores/data";
import { derivedMetric } from "~/utils/derivedMetrics";
import { levelDotClass, type HealthLevel } from "~/composables/useHealth";
import DeltaChip from "~/components/component/DeltaChip.vue";
import type { Delta } from "~/utils/delta";
export interface StatCell {
  label: string; value: string | number; level?: HealthLevel; ink?: string; title?: string; key?: string;
  /** Change against an earlier snapshot, where a view has one. */
  delta?: Delta; direction?: "up-good" | "up-risk" | "neutral"; decimals?: number;
}
defineProps<{ cells: StatCell[] }>()
const data = useDataStore();
// A cell keyed by a metric id opens its definition; other keys only identify the cell.
const isMetric = (key?: string) => !!key && (data.definitions.has(key) || !!derivedMetric(key));
</script>
