<template>
  <!-- Where this component stands among all of them. One row per reading:
       value, rank, and a bar that only takes a colour where the engine's own
       definition says which way is better. Size and centrality stay neutral —
       a large component is not a failing one. -->
  <table class="ui-table">
    <thead>
      <tr>
        <th>{{ t('metrics.percentileStrip.metric') }}</th>
        <th class="w-[120px] text-right">{{ t('metrics.percentileStrip.value') }}</th>
        <th class="w-[76px] text-right">{{ t('metrics.percentileStrip.change') }}</th>
        <th class="w-[96px] text-right">{{ t('metrics.percentileStrip.rank') }}</th>
        <th class="w-[200px]">{{ t('metrics.percentileStrip.percentile') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.key">
        <td :title="row.definition">{{ row.label }}</td>
        <td class="is-num text-right">{{ row.value }}</td>
        <td class="is-num text-right">
          <DeltaChip v-if="row.delta" :delta="row.delta" :direction="row.direction" :decimals="row.decimals ?? 0"/>
        </td>
        <td class="is-num text-right">{{ row.rank }} <span class="text-neutral-400">/ {{ total }}</span></td>
        <td>
          <span class="flex items-center gap-2">
            <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
              <span class="block h-full rounded-full transition-[width] duration-500 ease-out" :class="barClass(row)" :style="{ width: `${Math.max(row.percentile, 1.5)}%` }"></span>
            </span>
            <span class="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">{{ row.percentile }}%</span>
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import DeltaChip from "~/features/trends/components/DeltaChip.vue"
import type { Delta } from "~/features/trends/delta"
import { t } from "~/shared/i18n"

export interface StandingRow {
    key: string
    label: string
    value: string
    rank: number
    percentile: number
    definition?: string
    direction: "up-good" | "up-risk" | "neutral"
    delta?: Delta
    decimals?: number
}

defineProps<{ rows: StandingRow[]; total: number }>()

function barClass(row: StandingRow): string {
    if (row.direction === "up-risk") {
        if (row.percentile >= 80) return "bg-red-500"
        if (row.percentile >= 60) return "bg-amber-500"
        return "bg-neutral-400"
    }
    if (row.direction === "up-good") {
        if (row.percentile <= 20) return "bg-red-500"
        if (row.percentile <= 40) return "bg-amber-500"
        return "bg-green-500"
    }
    return "bg-neutral-400"
}
</script>
