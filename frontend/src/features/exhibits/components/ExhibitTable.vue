<template>
  <!-- Any exhibit as a table: its text form, for exhibits without a figure and for scans no longer at hand. -->
  <div class="ex-table">
    <table>
      <thead><tr><th v-for="c in table.columns" :key="c.id" :class="{ 'ex-num': c.numeric }">{{ c.label }}</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="i" :class="{ 'ex-on': lit.has(`row:${r[key]}`) }">
          <td v-for="c in table.columns" :key="c.id" :class="{ 'ex-num': c.numeric }" :title="String(r[c.id] ?? '')">
            <!-- A path keeps its file name in view: the folders give way first, from the left. -->
            <span v-if="isPath(r[c.id])" class="ex-path"><span class="ex-dir">{{ '‎' + dirOf(r[c.id] as string) + '‎' }}</span><span class="ex-base">/{{ baseOf(r[c.id] as string) }}</span></span>
            <template v-else>{{ fmt(r[c.id]) }}</template>
          </td>
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

const props = withDefaults(defineProps<{ table: ExhibitTable; limit?: number; highlight?: string[] }>(), { limit: 8, highlight: () => [] })
const all = ref(false)
const shown = computed(() => (all.value ? props.table.rows : props.table.rows.slice(0, props.limit)))
const total = computed(() => props.table.total ?? props.table.rows.length)
const more = computed(() => Math.min(total.value, props.table.rows.length) - props.limit)
// A row is cited by its first column (`row:<that value>`), as the exhibits name their rows.
const key = computed(() => props.table.columns[0]?.id ?? "")
const lit = computed(() => new Set(props.highlight))
const isPath = (v: unknown): v is string => typeof v === "string" && v.includes("/") && !/\s/.test(v) && !v.endsWith("/")
const dirOf = (v: string) => v.slice(0, v.lastIndexOf("/"))
const baseOf = (v: string) => v.slice(v.lastIndexOf("/") + 1)
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "number" ? v.toLocaleString(intlLocale, { maximumFractionDigits: 2 }) : String(v))
</script>

<style scoped>
.ex-table { overflow-x: auto; }
.ex-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ex-table th { text-align: left; font-weight: 500; font-size: 11.5px; color: rgb(var(--c-neutral-500)); padding: 0 12px 5px 4px; border-bottom: 1px solid rgb(var(--c-neutral-200)); white-space: nowrap; }
.ex-table td { padding: 4px 12px 4px 4px; border-bottom: 1px solid rgb(var(--c-neutral-100)); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(var(--c-neutral-800)); }
.ex-table th:last-child, .ex-table td:last-child { padding-right: 4px; }
.ex-table .ex-num { text-align: right; font-variant-numeric: tabular-nums; }
.ex-table td:has(.ex-path) { max-width: none; }
.ex-on td { background: rgb(var(--c-accent-50)); }
.ex-on td:first-child { box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.ex-path { display: flex; min-width: 0; max-width: 440px; }
/* Right to left, the ellipsis eats the start of the folders; the marks around them keep the slashes in order. */
.ex-dir { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; color: rgb(var(--c-neutral-400)); }
.ex-base { flex-shrink: 0; color: rgb(var(--c-neutral-900)); }
.ex-table-foot { margin-top: 6px; display: flex; gap: 10px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.ex-table-foot button { color: rgb(var(--c-neutral-600)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ex-table-foot button:hover { color: rgb(var(--c-neutral-900)); }
</style>
