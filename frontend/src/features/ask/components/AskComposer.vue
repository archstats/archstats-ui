<template>
  <form class="ask-composer" :class="{ 'ask-composer-busy': ask.running }" @submit.prevent="submit">
    <div v-if="ask.pendingContext" class="mb-1.5 flex">
      <span class="ask-chip" :title="chipTitle">
        <PanelTop :size="11" :stroke-width="1.75"/>
        About {{ ask.pendingContext.label }}<template v-if="ask.pendingContext.subject"> · {{ short(ask.pendingContext.subject.name) }}</template>
        <span v-if="ask.pendingContext.exhibits.length" class="text-neutral-400">· {{ ask.pendingContext.exhibits.length }} on screen</span>
        <span v-if="ask.pendingContext.images?.length" class="text-neutral-400" :title="ask.model?.vision ? 'The model sees these figures' : 'This model cannot see pictures; it gets the figures as data'">· {{ ask.pendingContext.images.length }} picture{{ ask.pendingContext.images.length === 1 ? "" : "s" }}{{ ask.model?.vision ? "" : " (not seen)" }}</span>
        <button type="button" class="ask-chip-x" aria-label="Ask without this view" title="Ask without this view" @click="ask.pendingContext = null"><X :size="11" :stroke-width="2"/></button>
      </span>
    </div>
    <textarea
        ref="input"
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        class="block max-h-48 min-h-[24px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400"
        aria-label="Question"
        @keydown.enter.exact.prevent="submit"
        @keydown.esc="ask.running && ask.stop()"
        @input="grow"
    />
    <div class="mt-2 flex items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-[10.5px] text-neutral-400">
        <template v-if="ask.model">{{ ask.model.name }}{{ ask.model.remote ? " · cloud: leaves this machine" : " · on this machine" }}</template>
        <template v-else-if="ask.loadingModels">Finding local models…</template>
        <template v-else>No model</template>
        · Enter to ask, Shift+Enter for a new line
      </span>
      <template v-if="ask.running && busyElsewhere">
        <button type="button" class="ui-btn ui-btn-quiet ui-btn-sm" title="The local model answers one question at a time" @click="ask.runningThreadId && ask.select(ask.runningThreadId)">Answering elsewhere · show</button>
        <button type="button" class="ui-btn ui-btn-sm" @click="ask.stop()"><Square :size="10" :stroke-width="2.25"/> Stop</button>
      </template>
      <button v-else-if="ask.running" type="button" class="ui-btn ui-btn-sm" title="Stop (Esc)" @click="ask.stop()"><Square :size="10" :stroke-width="2.25"/> Stop</button>
      <button v-else type="submit" class="ui-btn ui-btn-primary ui-btn-sm" :disabled="!text.trim() || !ask.model"><ArrowUp :size="12" :stroke-width="2.25"/> Ask</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { ArrowUp, PanelTop, Square, X } from "lucide-vue-next"
import { useAskStore } from "../app/ask.store"
import { shortName } from "../tools/shared"

const emit = defineEmits<{ (e: "send", q: string): void }>()
const ask = useAskStore()
const text = ref("")
const input = ref<HTMLTextAreaElement | null>(null)
const short = shortName

const busyElsewhere = computed(() => !!ask.runningThreadId && ask.runningThreadId !== ask.currentId)
const placeholder = computed(() => {
  const c = ask.pendingContext
  if (c?.subject) return `Ask about ${shortName(c.subject.name)}…`
  if (c) return `Ask about ${c.label}…`
  return ask.current?.turns.length ? "Ask a follow-up…" : "Ask about the architecture…"
})
const chipTitle = computed(() => {
  const c = ask.pendingContext
  if (!c) return ""
  return [`The next question carries what ${c.label} showed:`, ...c.exhibits.map(x => `· ${x.title}`), c.focus ? `· focus: ${c.focus}` : "", c.selection?.length ? `· ${c.selection.length} selected` : ""].filter(Boolean).join("\n")
})

function grow() {
  const el = input.value
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${Math.min(192, el.scrollHeight)}px`
}
function submit() {
  // While an answer is still working, the question waits for it (the page queues it) instead of being refused.
  if (!text.value.trim()) return
  emit("send", text.value)
  text.value = ""
  void nextTick(grow)
}
function focus() { input.value?.focus() }
function fill(q: string) { text.value = q; void nextTick(() => { grow(); focus() }) }
defineExpose({ focus, fill })
</script>

<style scoped>
.ask-composer { border: 1px solid rgb(var(--c-neutral-200)); border-radius: 12px; padding: 10px 12px 8px; background: rgb(var(--c-surface)); box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12); transition: border-color 0.15s; }
.ask-composer:focus-within { border-color: rgb(var(--c-accent-400)); }
.ask-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; font-size: 11.5px; padding: 2px 4px 2px 8px; border-radius: 999px; background: rgb(var(--c-accent-50)); color: rgb(var(--c-accent-800)); border: 1px solid rgb(var(--c-accent-200)); }
.ask-chip-x { display: inline-flex; padding: 2px; border-radius: 999px; color: rgb(var(--c-accent-700)); }
.ask-chip-x:hover { background: rgb(var(--c-accent-100)); }
</style>
