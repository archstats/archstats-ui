<template>
  <!-- One exhibit, drawn from its spec on its own scan: the real figure in a host frame (its title row,
       export button and legend, as every figure in the app), or its table. -->
  <div class="ex" :class="`ex-${density}`" :data-exhibit="part.id">
    <ExhibitFrame :title="caption || part.title" header-class="pb-1.5">
      <template #aside>
        <span class="ex-id" :title="`${part.id} · computed on ${part.ranOn.commit.slice(0, 7) || 'this scan'}`">{{ part.id }}</span>
        <button v-if="addable" type="button" class="ex-open" title="Add it to this conversation's report; it runs again on the report's snapshot" @click="$emit('add')"><FilePlus2 :size="12" :stroke-width="1.75"/> Report</button>
        <button v-if="part.open" type="button" class="ex-open" @click="$emit('open', part.open)"><ArrowUpRight :size="12" :stroke-width="2"/> {{ part.open.label.replace(/^Open /, "") }}</button>
      </template>
      <div class="ex-body" :style="{ minHeight: state === 'loading' ? `${reserve}px` : undefined }">
        <div v-if="figure && data" class="ex-figure" :style="def?.figure?.fill ? { height: `${reserve}px` } : undefined">
          <component :is="figure" v-bind="figureProps" v-on="listeners"/>
        </div>
        <ExhibitTable v-else-if="data && table" :table="table"/>
        <ExhibitTable v-else-if="state !== 'loading' && part.table" :table="part.table"/>
        <div v-else-if="state === 'loading'" class="ex-wait" :style="{ height: `${reserve}px` }"><span class="ex-shimmer"/><span class="ex-hint"><Loader2 :size="12" class="animate-spin"/> Drawing…</span></div>
        <p v-if="state === 'absent' || state === 'error'" class="ex-hint ex-hint-static">{{ message }}</p>
      </div>
    </ExhibitFrame>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref, shallowRef, type Component } from "vue"
import { ArrowUpRight, FilePlus2, Loader2 } from "lucide-vue-next"
import { EXPORT_SCOPE, type Exportable } from "~/features/export/useExportables"
import { defOf } from "../engine"
import { resolve } from "../engine"
import { snapshotFor } from "../app"
import { isAbsent, type ExhibitOpen, type ExhibitPart } from "../types"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ExhibitTable from "./ExhibitTable.vue"

const props = withDefaults(defineProps<{
  part: ExhibitPart
  density?: "inline" | "full"
  /** Element ids to light: what the sentence beside it cites. */
  highlight?: string[]
  caption?: string
  /** Offer "Report": the conversation can take it into its report. */
  addable?: boolean
}>(), { density: "inline", highlight: () => [], caption: "", addable: false })
const emit = defineEmits<{ (e: "open", to: ExhibitOpen): void; (e: "pick", element: string | null): void; (e: "add"): void }>()

// What the figure registers for export stays with this exhibit: the page's Export menu never offers it.
const exportables = shallowRef<Exportable[]>([])
provide(EXPORT_SCOPE, { add(item) { exportables.value = [...exportables.value, item]; return () => { exportables.value = exportables.value.filter(x => x !== item) } } })

const def = defOf(props.part.spec.kind)
const state = ref<"loading" | "done" | "absent" | "error">("loading")
const message = ref("")
const data = shallowRef<unknown>(null)
const loaded = def?.figure ? defineAsyncComponent(def.figure.load) : null
const figure = computed<Component | null>(() => (loaded && data.value && (def?.figure?.when?.(data.value) ?? true) ? loaded : null))

const opts = computed(() => {
  const known = new Set((data.value && def?.elements?.(data.value).map(e => e.id)) ?? [])
  return { density: props.density, highlight: props.highlight.filter(h => known.has(h)), title: props.part.title }
})
const figureProps = computed(() => (def?.figure && data.value ? def.figure.props(data.value, props.part.spec.params, opts.value) : {}))
const reserve = computed(() => (figure.value && data.value ? def!.figure!.height(data.value, opts.value) : props.density === "inline" ? 160 : 260))
const table = computed(() => (def && data.value && !figure.value ? def.table(data.value, props.part.spec.params) : null))
const listeners = computed(() => Object.fromEntries(Object.entries(def?.figure?.picks ?? {}).map(([event, toElement]) => [event, (...args: unknown[]) => emit("pick", toElement(...args))])))

onMounted(async () => {
  if (!def) { state.value = "error"; message.value = `This kind of exhibit (${props.part.spec.kind}) is no longer made; its table is kept.`; return }
  try {
    const snap = await snapshotFor(props.part.ranOn.scanId)
    const d = await resolve(props.part.spec, { snap })
    if (isAbsent(d)) { state.value = "absent"; message.value = d.absent; return }
    data.value = d
    state.value = "done"
  } catch (e: any) {
    state.value = "error"
    message.value = `Could not draw it from its scan (${String(e?.message ?? e)}); the table it had is kept.`
  }
})

defineExpose({ exportables })
</script>

<style scoped>
.ex { min-width: 0; max-width: 100%; border: 1px solid rgb(var(--c-neutral-200)); border-radius: 8px; background: rgb(var(--c-surface)); padding: 8px 12px 10px; }
.ex-body { position: relative; min-width: 0; overflow-x: auto; }
.ex.ex-flash { border-color: rgb(var(--c-accent-400)); box-shadow: 0 0 0 3px rgb(var(--c-accent-100)); transition: box-shadow 0.2s, border-color 0.2s; }
.ex-figure { display: block; width: 100%; }
.ex-wait { position: relative; display: grid; place-items: center; overflow: hidden; border-radius: 6px; }
.ex-shimmer { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgb(var(--c-neutral-100)) 50%, transparent 80%); background-size: 200% 100%; animation: ex-shimmer 1.4s infinite linear; }
@keyframes ex-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .ex-shimmer { animation: none; } }
.ex-hint { position: relative; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: rgb(var(--c-neutral-500)); }
.ex-hint-static { display: block; padding: 4px 0 2px; }
.ex-id { font: 500 9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-accent-700)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); border-radius: 4px; padding: 2px 3px; }
.ex-open { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; color: rgb(var(--c-neutral-600)); white-space: nowrap; }
.ex-open:hover { color: rgb(var(--c-accent-700)); }
</style>
