<template>
  <!-- One thing read in full: where it sits, its measures, then short lists (what it uses, what uses it, its declarations). -->
  <div class="xp">
    <p v-if="dir" class="xp-dir" :title="path">{{ dir }}</p>
    <dl v-if="facts.length" class="xp-facts">
      <div v-for="v in facts" :key="v.label" class="xp-fact" :class="{ 'xp-on': lit.has(`measure:${v.label}`) }">
        <dt>{{ v.label }}</dt>
        <dd :title="String(v.value)">{{ v.value }}</dd>
      </div>
    </dl>
    <dl class="xp-values">
      <div v-for="v in measures" :key="v.label" class="xp-value" :class="{ 'xp-on': lit.has(`measure:${v.label}`) }">
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
            :class="{ 'xp-on': lit.has(`item:${it.name}`), 'xp-item-lead': l.lead }"
            :title="it.name"
            @click="$emit('select', it.name)"
        >
          <template v-if="l.lead"><span class="xp-line">{{ it.note }}</span><span class="xp-name xp-code">{{ it.label ?? it.name }}</span></template>
          <template v-else>
            <span class="xp-name"><span class="xp-shared">{{ split(it).shared }}</span>{{ split(it).own }}</span>
            <span v-if="it.note !== undefined" class="xp-note">{{ it.note }}</span>
          </template>
        </button>
        <p v-if="!l.items.length" class="xp-none">{{ t('exhibits.exProfile.nothing') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { t, intlLocale } from "~/shared/i18n"

type Item = { name: string; label?: string; note?: string | number }
const props = withDefaults(defineProps<{
  values: Array<{ label: string; value: number | string | null }>
  lists?: Array<{ title: string; items: Item[]; lead?: boolean }>
  path?: string
  /** The component read: neighbours' names dim the part they share with it. */
  subject?: string
  highlight?: string[]
  density?: "inline" | "full"
}>(), { lists: () => [], path: "", subject: "", highlight: () => [], density: "inline" })
defineEmits<{ (e: "select", name: string): void }>()

const lit = computed(() => new Set(props.highlight))
// Words (its component, its role) read as a line of their own; numbers go in the grid.
const facts = computed(() => props.values.filter(v => typeof v.value === "string" && v.value !== ""))
const measures = computed(() => props.values.filter(v => typeof v.value !== "string" || v.value === ""))
/** The folder the file sits in; the file's own name is the title. */
const dir = computed(() => (props.path.includes("/") ? props.path.slice(0, props.path.lastIndexOf("/") + 1) : ""))

/** A long path shows its last segments; the whole name is in the title. */
const tail = (name: string) => (name.length > 48 && name.includes("/") ? `…/${name.split("/").slice(-2).join("/")}` : name)
/** The leading segments a neighbour shares with the subject, and the part that tells it apart (never empty). */
function split(it: Item): { shared: string; own: string } {
  const text = it.label ?? tail(it.name)
  if (!props.subject || it.label) return { shared: "", own: text }
  const sep = /[./\\]/
  const a = text.split(sep), b = props.subject.split(sep)
  let k = 0
  while (k < a.length - 1 && k < b.length && a[k] === b[k]) k++
  if (!k) return { shared: "", own: text }
  const cut = a.slice(0, k).reduce((len, seg) => len + seg.length + 1, 0)
  return { shared: text.slice(0, cut), own: text.slice(cut) }
}
const fmt = (v: number | string | null) => (v === null || v === "" ? "–" : typeof v === "number" ? v.toLocaleString(intlLocale, { maximumFractionDigits: 2 }) : v)
</script>

<style scoped>
.xp-dir { margin: -2px 0 8px; font: 11px/15px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-500)); overflow-wrap: anywhere; }
.xp-facts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 8px; font-size: 12px; }
.xp-fact { display: flex; min-width: 0; align-items: baseline; gap: 6px; border-radius: 4px; }
.xp-fact dt { color: rgb(var(--c-neutral-500)); }
.xp-fact dd { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgb(var(--c-neutral-900)); }
.xp-values { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); column-gap: 24px; border-top: 1px solid rgb(var(--c-neutral-100)); }
.xp-value { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 5px 4px 4px; border-bottom: 1px solid rgb(var(--c-neutral-100)); }
.xp-value dt { min-width: 0; font-size: 11.5px; line-height: 15px; color: rgb(var(--c-neutral-500)); }
.xp-value dd { flex-shrink: 0; font-size: 12.5px; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-900)); }
.xp-lists { margin-top: 14px; display: grid; gap: 8px 24px; font-size: 12px; }
.xp-lists-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.xp-lists > div { min-width: 0; }
.xp-list-title { margin: 0 0 4px 4px; font-size: 11.5px; color: rgb(var(--c-neutral-500)); }
.xp-item { display: flex; width: 100%; max-width: 26rem; min-width: 0; align-items: baseline; justify-content: space-between; gap: 12px; padding: 2px 4px; border-radius: 4px; text-align: left; line-height: 17px; color: rgb(var(--c-neutral-800)); }
.xp-item-lead { justify-content: flex-start; gap: 10px; }
.xp-item:hover { background: rgb(var(--c-neutral-50)); }
.xp-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-shared { color: rgb(var(--c-neutral-400)); }
.xp-code { font: 11.5px/17px ui-monospace, SFMono-Regular, Menlo, monospace; }
.xp-line { flex-shrink: 0; min-width: 3ch; text-align: right; font: 11px/17px ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-400)); }
.xp-note { flex-shrink: 0; font-variant-numeric: tabular-nums; color: rgb(var(--c-neutral-500)); }
.xp-none { margin-left: 4px; color: rgb(var(--c-neutral-400)); }
.xp-on { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
</style>
