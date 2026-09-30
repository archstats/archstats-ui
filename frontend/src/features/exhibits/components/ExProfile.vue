<template>
  <!-- One thing read in full: its measures, then short lists (what it uses, what uses it, its declarations). -->
  <div class="xp">
    <p v-if="path" class="xp-path" :title="path">{{ path }}</p>
    <dl class="xp-values">
      <div v-for="v in values" :key="v.label" class="xp-value" :class="{ 'xp-on': lit.has(`measure:${v.label}`) }">
        <dt>{{ v.label }}</dt>
        <dd>{{ fmt(v.value) }}</dd>
      </div>
    </dl>
    <div v-if="lists.length" class="xp-lists" :class="{ 'xp-lists-2': lists.length > 1 }">
      <div v-for="l in lists" :key="l.title">
        <p class="xp-list-title">{{ l.title }}</p>
        <button
            v-for="it in l.items.slice(0, density === 'inline' ? 6 : 14)"
            :key="it.name"
            type="button"
            class="xp-item"
            :class="{ 'xp-on': lit.has(`item:${it.name}`) }"
            :title="it.name"
            @click="$emit('select', it.name)"
        ><span class="xp-name">{{ it.label ?? tail(it.name) }}</span><span v-if="it.note !== undefined" class="xp-note">{{ it.note }}</span></button>
        <p v-if="!l.items.length" class="xp-none">nothing</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{
  values: Array<{ label: string; value: number | string | null }>
  lists?: Array<{ title: string; items: Array<{ name: string; label?: string; note?: string | number }> }>
  path?: string
  highlight?: string[]
  density?: "inline" | "full"
}>(), { lists: () => [], path: "", highlight: () => [], density: "inline" })
defineEmits<{ (e: "select", name: string): void }>()

const lit = computed(() => new Set(props.highlight))
/** A long path shows its last segments; the whole name is in the title. */
const tail = (name: string) => (name.length > 48 && name.includes("/") ? `…/${name.split("/").slice(-2).join("/")}` : name)
const fmt = (v: number | string | null) => (v === null || v === "" ? "–" : typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v)
</script>

<style scoped>
.xp-path { margin-bottom: 6px; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-500)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-values { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); column-gap: 20px; }
.xp-value { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 3px 4px; border-bottom: 1px solid rgb(var(--c-neutral-100)); }
.xp-value dt { font-size: 11.5px; color: rgb(var(--c-neutral-500)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-value dd { font-size: 12px; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-900)); }
.xp-lists { margin-top: 10px; display: grid; gap: 14px; font-size: 11.5px; }
.xp-lists-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.xp-lists > div { min-width: 0; }
.xp-list-title { margin-bottom: 2px; color: rgb(var(--c-neutral-500)); }
.xp-item { display: flex; width: 100%; min-width: 0; align-items: baseline; justify-content: space-between; gap: 8px; padding: 1px 4px; border-radius: 4px; text-align: left; color: rgb(var(--c-neutral-800)); }
.xp-item:hover { background: rgb(var(--c-neutral-50)); }
.xp-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-note { flex-shrink: 0; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-400)); }
.xp-none { color: rgb(var(--c-neutral-400)); }
.xp-on { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
</style>
