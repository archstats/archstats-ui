<template>
  <!-- Any exhibit as a table: its text form, for exhibits without a figure and for scans no longer at hand. -->
  <div class="ex-table">
    <table>
      <thead><tr><th v-for="c in table.columns" :key="c.id" :class="{ 'text-right': c.numeric }">{{ c.label }}</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="i">
          <td v-for="c in table.columns" :key="c.id" :class="{ 'text-right tabular-nums': c.numeric }" :title="String(r[c.id] ?? '')">{{ fmt(r[c.id]) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="more > 0 || table.note" class="ex-table-foot">
      <button v-if="more > 0" type="button" @click="all = !all">{{ all ? t('exhibits.exhibitTable.fewerRows') : t('exhibits.exhibitTable.allRows', { value: total.toLocaleString(intlLocale) }) }}</button>
      <span v-if="table.note">{{ table.note }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { ExhibitTable } from "../types"
import { t, intlLocale } from "~/shared/i18n"

const props = withDefaults(defineProps<{ table: ExhibitTable; limit?: number }>(), { limit: 8 })
const all = ref(false)
const shown = computed(() => (all.value ? props.table.rows : props.table.rows.slice(0, props.limit)))
const total = computed(() => props.table.total ?? props.table.rows.length)
const more = computed(() => Math.min(total.value, props.table.rows.length) - props.limit)
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "number" ? v.toLocaleString(intlLocale, { maximumFractionDigits: 2 }) : String(v))
</script>

<style scoped>
.ex-table { overflow-x: auto; }
.ex-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ex-table th { text-align: left; font-weight: 500; color: rgb(var(--c-neutral-500)); padding: 0 10px 4px 0; border-bottom: 1px solid rgb(var(--c-neutral-200)); white-space: nowrap; }
.ex-table td { padding: 3px 10px 3px 0; border-bottom: 1px solid rgb(var(--c-neutral-100)); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(var(--c-neutral-800)); }
.ex-table-foot { margin-top: 6px; display: flex; gap: 10px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.ex-table-foot button { color: rgb(var(--c-neutral-600)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ex-table-foot button:hover { color: rgb(var(--c-neutral-900)); }
</style>
