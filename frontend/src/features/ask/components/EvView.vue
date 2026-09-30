<template>
  <!-- A view, previewed: its real figure drawn out of sight, and the button that opens it. -->
  <div class="ev-view" :class="{ 'ev-view-compact': compact }">
    <button type="button" class="ev-view-frame" :title="`Open ${label}`" @click="$emit('open')">
      <template v-if="figure">
        <img :src="figure.src" :alt="figure.title" class="ev-view-img" :style="imgStyle" draggable="false">
      </template>
      <div v-else-if="table" class="ev-view-table">
        <table>
          <thead><tr><th v-for="c in table.columns.slice(0, 5)" :key="c">{{ c }}</th></tr></thead>
          <tbody><tr v-for="(r, i) in table.rows.slice(0, 6)" :key="i"><td v-for="(v, j) in r.slice(0, 5)" :key="j">{{ v }}</td></tr></tbody>
        </table>
      </div>
      <div v-else-if="state === 'loading'" class="ev-view-skeleton">
        <span class="ev-view-shimmer"/>
        <span class="ev-view-hint"><Loader2 :size="12" class="animate-spin"/> Drawing {{ label }}…</span>
      </div>
      <div v-else class="ev-view-skeleton"><span class="ev-view-hint">{{ state === "error" ? `No preview: ${error}` : "Nothing drawn on this view for this snapshot" }}</span></div>
      <span class="ev-view-open"><ArrowUpRight :size="12" :stroke-width="2"/> Open {{ label }}</span>
    </button>
    <div v-if="figure && figure.legend" class="ev-view-legend" :title="figure.legend">{{ figure.legend }}</div>
    <div v-if="figures.length > 1" class="mt-1 flex gap-1">
      <button v-for="(f, i) in figures" :key="f.title" type="button" class="ev-view-tab" :class="{ 'ev-view-tab-on': i === pick }" @click="pick = i">{{ f.title }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { ArrowUpRight, Loader2 } from "lucide-vue-next"
import { takeView } from "../app/stage"
import type { StageTake } from "../app/stageHost"

const props = defineProps<{
  route: string
  label: string
  scanId: string
  focus?: string
  /** Already taken (a look_at_view result): no stage needed. */
  given?: Pick<StageTake, "figures" | "tables"> | null
  compact?: boolean
}>()
defineEmits<{ (e: "open"): void }>()

const state = ref<"loading" | "done" | "error">(props.given ? "done" : "loading")
const error = ref("")
const got = ref<Pick<StageTake, "figures" | "tables"> | null>(props.given ?? null)
const pick = ref(0)
const figures = computed(() => got.value?.figures ?? [])
const figure = computed(() => figures.value[pick.value] ?? null)
const table = computed(() => (!figure.value ? got.value?.tables[0] ?? null : null))
const imgStyle = computed(() => (figure.value && figure.value.width && figure.value.height ? { aspectRatio: `${figure.value.width} / ${figure.value.height}` } : {}))

onMounted(async () => {
  if (props.given || !props.scanId) { if (!props.scanId) state.value = "error"; return }
  try {
    got.value = await takeView(props.scanId, props.route, { focus: props.focus, figures: 3 })
    state.value = "done"
  } catch (e: any) {
    error.value = String(e?.message ?? e)
    state.value = "error"
  }
})
</script>

<style scoped>
.ev-view { width: 100%; }
.ev-view-frame { position: relative; display: block; width: 100%; overflow: hidden; border-radius: 8px; border: 1px solid rgb(var(--c-neutral-200)); background: rgb(var(--c-surface)); text-align: left; transition: border-color 0.15s; }
.ev-view-frame:hover { border-color: rgb(var(--c-accent-400)); }
.ev-view-img { display: block; width: 100%; max-height: 360px; object-fit: contain; background: rgb(var(--c-surface)); }
.ev-view-compact .ev-view-img { max-height: 220px; }
.ev-view-open { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; padding: 3px 8px; border-radius: 6px; color: rgb(var(--c-neutral-800)); background: rgb(var(--c-surface) / 0.92); border: 1px solid rgb(var(--c-neutral-200)); opacity: 0; transition: opacity 0.15s; }
.ev-view-frame:hover .ev-view-open, .ev-view-frame:focus-visible .ev-view-open { opacity: 1; }
.ev-view-skeleton { position: relative; height: 150px; display: grid; place-items: center; overflow: hidden; }
.ev-view-shimmer { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgb(var(--c-neutral-100)) 50%, transparent 80%); background-size: 200% 100%; animation: ev-shimmer 1.4s infinite linear; }
@keyframes ev-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.ev-view-hint { position: relative; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: rgb(var(--c-neutral-500)); padding: 0 16px; text-align: center; }
.ev-view-legend { margin-top: 4px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-view-table { max-height: 220px; overflow: hidden; padding: 8px 10px; }
.ev-view-table table { width: 100%; font-size: 11px; border-collapse: collapse; }
.ev-view-table th { text-align: left; font-weight: 500; color: rgb(var(--c-neutral-500)); padding: 0 8px 3px 0; border-bottom: 1px solid rgb(var(--c-neutral-200)); white-space: nowrap; }
.ev-view-table td { padding: 2px 8px 2px 0; border-bottom: 1px solid rgb(var(--c-neutral-100)); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.ev-view-tab { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; border: 1px solid rgb(var(--c-neutral-200)); color: rgb(var(--c-neutral-600)); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-view-tab-on { border-color: rgb(var(--c-accent-400)); color: rgb(var(--c-neutral-900)); background: rgb(var(--c-accent-50)); }
</style>
