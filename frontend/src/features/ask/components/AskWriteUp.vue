<template>
  <div v-if="ask.writeup.open" class="ask-veil" role="dialog" aria-modal="true" aria-label="Write up" @keydown.esc="close" @click.self="close">
    <div class="ask-sheet">
      <header class="flex items-start gap-3 px-5 pt-5">
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] font-semibold text-neutral-900">Write this up as a report</h2>
          <p class="mt-0.5 text-[12px] leading-relaxed text-neutral-500">Choose the kind of report. Ask lays out its sections, fills them with the conversation's evidence and the template's own readings and queries, then writes every section and a summary. Numbers come only from the evidence.</p>
        </div>
        <button type="button" class="ui-btn ui-btn-quiet ui-btn-icon ui-btn-sm" aria-label="Close" @click="close"><X :size="14" :stroke-width="1.75"/></button>
      </header>

      <!-- Choosing. -->
      <div v-if="!p" class="px-5 pb-5 pt-4">
        <p v-if="ask.writeup.loading" class="flex items-center gap-2 py-6 text-[12.5px] text-neutral-500"><Loader2 :size="13" class="animate-spin"/> Finding the templates that fit…</p>
        <div v-else class="grid gap-2">
          <button
              v-for="s in ask.writeup.suggestions"
              :key="s.id"
              type="button"
              class="ask-opt"
              :class="{ 'ask-opt-on': ask.writeup.chosen === s.id }"
              @click="ask.writeup.chosen = s.id"
          >
            <FileText :size="15" :stroke-width="1.75" class="mt-0.5 shrink-0 text-accent-600"/>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2 text-[13px] font-medium text-neutral-900">{{ s.name }}<span v-if="s.recommended" class="ask-rec">Recommended</span></span>
              <span class="block text-[12px] leading-snug text-neutral-600">{{ s.summary }}</span>
              <span class="mt-0.5 block text-[11px] text-neutral-400">For {{ s.audience }} · {{ s.why }}</span>
            </span>
          </button>
          <button type="button" class="ask-opt" :class="{ 'ask-opt-on': ask.writeup.chosen === null }" @click="ask.writeup.chosen = null">
            <ListTree :size="15" :stroke-width="1.75" class="mt-0.5 shrink-0 text-neutral-500"/>
            <span class="min-w-0 flex-1">
              <span class="block text-[13px] font-medium text-neutral-900">Free form</span>
              <span class="block text-[12px] leading-snug text-neutral-600">Sections made from what this conversation found, related questions merged.</span>
            </span>
          </button>
        </div>
        <p v-if="ask.writeup.error" class="mt-3 text-[12px] text-red-700">{{ ask.writeup.error }}</p>
        <div class="mt-4 flex items-center justify-end gap-2">
          <button type="button" class="ui-btn ui-btn-sm" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" :disabled="ask.writeup.loading || ask.running" @click="start"><PenLine :size="12" :stroke-width="2"/> Write the report</button>
        </div>
      </div>

      <!-- Writing. -->
      <div v-else class="px-5 pb-5 pt-4">
        <p class="flex items-center gap-2 text-[12.5px] text-neutral-700">
          <Loader2 v-if="busy" :size="13" class="animate-spin text-accent-600"/>
          <Check v-else-if="p.phase === 'done'" :size="13" :stroke-width="2.25" class="text-green-600"/>
          <AlertCircle v-else :size="13" class="text-red-600"/>
          {{ p.phase === "error" ? ask.writeup.error : p.message }}
          <span v-if="busy" class="ml-auto tabular-nums text-neutral-400">{{ elapsed }} s</span>
        </p>
        <ol v-if="p.sections.length" class="mt-3 grid gap-1">
          <li v-for="(s, i) in p.sections" :key="i" class="flex items-center gap-2 text-[12.5px]">
            <Loader2 v-if="s.status === 'writing'" :size="12" class="animate-spin text-accent-600"/>
            <Check v-else-if="s.status === 'done' || s.status === 'revised'" :size="12" :stroke-width="2.25" class="text-green-600"/>
            <Minus v-else-if="s.status === 'skipped'" :size="12" class="text-neutral-300"/>
            <Circle v-else :size="10" class="text-neutral-300"/>
            <span class="min-w-0 flex-1 truncate" :class="s.status === 'waiting' ? 'text-neutral-400' : 'text-neutral-800'">{{ s.heading }}</span>
            <span v-if="s.status === 'revised'" class="text-[10.5px] text-neutral-400" title="A number was not in the evidence; the section was written again">checked, rewritten</span>
            <span v-if="s.status === 'skipped'" class="text-[10.5px] text-neutral-400">no evidence: left for you</span>
          </li>
        </ol>
        <div class="mt-4 flex items-center justify-end gap-2">
          <button v-if="busy" type="button" class="ui-btn ui-btn-sm" @click="ask.cancelWriteUp()">Stop</button>
          <template v-else>
            <button type="button" class="ui-btn ui-btn-sm" @click="close">Close</button>
            <button v-if="ask.writeup.reportId" type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="openReport">Open “{{ ask.writeup.title }}”</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { AlertCircle, Check, Circle, FileText, ListTree, Loader2, Minus, PenLine, X } from "lucide-vue-next"
import { useReportsStore } from "~/features/reports/reports.store"
import { useAskStore } from "../app/ask.store"

const ask = useAskStore()
const router = useRouter()
const p = computed(() => ask.writeup.progress)
const busy = computed(() => !!p.value && !["done", "error"].includes(p.value.phase))

const started = ref(0)
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
watch(busy, b => {
  if (b) { started.value = Date.now(); tick = setInterval(() => (now.value = Date.now()), 1000) }
  else if (tick) { clearInterval(tick); tick = null }
})
onBeforeUnmount(() => { if (tick) clearInterval(tick) })
const elapsed = computed(() => Math.max(0, Math.round((now.value - started.value) / 1000)))

async function start() {
  const id = await ask.runWriteUp(ask.writeup.chosen)
  if (id) await openReport()
}
async function openReport() {
  const id = ask.writeup.reportId
  if (!id) return
  useReportsStore().open(id)
  ask.writeup.open = false
  await router.push("/views/evidence")
}
function close() {
  if (busy.value) return
  ask.writeup.open = false
}
</script>

<style scoped>
.ask-veil { position: fixed; inset: 0; z-index: 60; display: grid; place-items: start center; padding-top: 12vh; background: rgb(0 0 0 / 0.28); }
.ask-sheet { width: min(560px, 92vw); max-height: 76vh; overflow-y: auto; border-radius: 12px; background: rgb(var(--c-surface)); border: 1px solid rgb(var(--c-neutral-200)); box-shadow: 0 24px 64px -16px rgb(0 0 0 / 0.35); }
.ask-opt { display: flex; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 9px; border: 1px solid rgb(var(--c-neutral-200)); }
.ask-opt:hover { border-color: rgb(var(--c-neutral-300)); background: rgb(var(--c-neutral-50)); }
.ask-opt-on, .ask-opt-on:hover { border-color: rgb(var(--c-accent-400)); background: rgb(var(--c-accent-50)); }
.ask-rec { font-size: 10px; font-weight: 500; color: rgb(var(--c-accent-800)); background: rgb(var(--c-accent-100)); border-radius: 999px; padding: 1px 7px; }
</style>
