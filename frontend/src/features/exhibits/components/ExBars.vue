<template>
  <!-- A ranking as bars: one row per thing, its bar as long as its value. -->
  <div class="xb" role="img" :aria-label="ariaLabel">
    <button
        v-for="it in shown"
        :key="it.key"
        type="button"
        class="xb-row"
        :class="{ 'xb-on': lit.has(`row:${it.key}`) || lit.has(`${pickAs}:${it.key}`) }"
        :title="`${it.key}: ${fmt(it.value)}`"
        @click="$emit('select', pickAs === 'row' ? it.key : `${pickAs}:${it.key}`)"
    >
      <span class="xb-label">{{ it.label }}</span>
      <span class="xb-track"><span class="xb-bar" :style="{ width: `${width(it.value)}%` }"/></span>
      <span class="xb-value">{{ fmt(it.value) }}</span>
    </button>
    <p class="xb-legend"><span class="xb-swatch"/>{{ ' ' + t('exhibits.exBars.barLength', { unit }) }}<template v-if="note"> · {{ note }}</template></p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { t, intlLocale } from "~/shared/i18n"

const props = withDefaults(defineProps<{
  items: Array<{ key: string; label: string; value: number }>
  unit: string
  note?: string
  highlight?: string[]
  density?: "inline" | "full"
  ariaLabel: string
  /** What a bar stands for when picked: a component or file (ready to group), or just its row. */
  pickAs?: "component" | "file" | "row"
}>(), { note: "", highlight: () => [], density: "inline", pickAs: "row" })
defineEmits<{ (e: "select", key: string): void }>()

const shown = computed(() => props.items.slice(0, props.density === "inline" ? 12 : 30))
const lit = computed(() => new Set(props.highlight))
const max = computed(() => Math.max(1e-9, ...props.items.map(i => Math.abs(i.value))))
const width = (v: number) => Math.max(1.5, (Math.abs(v) / max.value) * 100)
const fmt = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
</script>

<style scoped>
.xb { display: grid; gap: 2px; }
.xb-row { display: grid; grid-template-columns: minmax(90px, 34%) 1fr auto; align-items: center; gap: 10px; padding: 2px 4px; border-radius: 5px; text-align: left; font-size: 12px; }
.xb-row:hover { background: rgb(var(--c-neutral-50)); }
.xb-on { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.xb-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(var(--c-neutral-800)); }
.xb-track { height: 10px; border-radius: 3px; background: rgb(var(--c-neutral-100)); overflow: hidden; }
.xb-bar { display: block; height: 100%; border-radius: 2px; background: rgb(var(--c-blue-500)); }
.xb-on .xb-bar { background: rgb(var(--c-accent-500)); }
.xb-value { font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-900)); min-width: 40px; text-align: right; }
.xb-legend { margin-top: 6px; display: flex; align-items: center; gap: 6px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.xb-swatch { width: 10px; height: 8px; border-radius: 2px; background: rgb(var(--c-blue-500)); }
</style>
