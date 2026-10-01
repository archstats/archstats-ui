<template>
  <form class="ask-composer" :class="{ 'ask-composer-busy': ask.running }" @submit.prevent="submit">
    <div v-if="ask.pendingContext" class="mb-1.5 flex">
      <span class="ask-chip" :title="chipTitle">
        <I18nT k="ask.askComposer.about"><template #icon><PanelTop :size="11" :stroke-width="1.75"/></template><template #pendingContextLabel>{{ ask.pendingContext.label }}</template><template #subjectName><template v-if="ask.pendingContext.subject"> · {{ short(ask.pendingContext.subject.name) }}</template></template><template #exhibitsLength><span v-if="ask.pendingContext.exhibits.length" class="text-neutral-400">{{ t('ask.askComposer.screen', { exhibitsLength: ask.pendingContext.exhibits.length }) }}</span></template><template #span><span v-if="ask.pendingContext.images?.length" class="text-neutral-400" :title="ask.model?.vision ? t('ask.askComposer.modelSeesTheseFigures') : t('ask.askComposer.modelCannotSeePictures')">{{ t('ask.askComposer.text', { pictures: t('common.count.picture', { count: ask.pendingContext.images.length }), value: ask.model?.vision ? "" : t('ask.askComposer.notSeen') }) }}</span></template><template #icon2><button type="button" class="ask-chip-x" :aria-label="t('ask.askComposer.askWithoutView')" :title="t('ask.askComposer.askWithoutView')" @click="ask.pendingContext = null"><X :size="11" :stroke-width="2"/></button></template></I18nT>
      </span>
    </div>
    <!-- The view they came from, offered: one click attaches it; a question saying "this" takes it anyway. -->
    <div v-else-if="ask.lastView" class="mb-1.5 flex">
      <span class="ask-chip ask-chip-offer">
        <button type="button" class="inline-flex min-w-0 items-center gap-1.5" :title="t('ask.askComposer.attachWhatShowsNext', { lastViewLabel: ask.lastView.label })" @click="ask.pendingContext = ask.lastView; ask.lastView = null">
          <Plus :size="11" :stroke-width="2"/>
          <span class="truncate">{{ t('ask.askComposer.askAbout', { lastViewLabel: ask.lastView.label }) }}<template v-if="ask.lastView.subject"> · {{ short(ask.lastView.subject.name) }}</template></span>
        </button>
        <button type="button" class="ask-chip-x" :aria-label="t('ask.askComposer.notAboutView')" :title="t('ask.askComposer.notAboutView')" @click="ask.lastView = null"><X :size="11" :stroke-width="2"/></button>
      </span>
    </div>
    <textarea
        ref="input"
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        class="block max-h-48 min-h-[24px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400"
        :aria-label="t('ask.askComposer.question')"
        @keydown.enter.exact.prevent="submit"
        @keydown.esc="ask.running && ask.stop()"
        @input="grow"
    />
    <div class="mt-2 flex items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-[11px] text-neutral-500">
        <template v-if="ask.model">{{ ask.model.label }}{{ ask.model.remote ? t('ask.askComposer.cloudLeavesMachine') : t('ask.askComposer.machine') }}</template>
        <template v-else-if="ask.loadingModels">{{ t('ask.askComposer.findingModels') }}</template>
        <template v-else>{{ ask.modelsError || t('ask.askComposer.noModel') }} <button type="button" class="underline decoration-neutral-300 hover:text-neutral-900" @click="runCommand('settings:open')">{{ t('ask.askComposer.settings') }}</button></template>
        {{ t('ask.askComposer.enterAskShiftEnter') }}
      </span>
      <template v-if="ask.running && busyElsewhere">
        <button type="button" class="ui-btn ui-btn-quiet ui-btn-sm" :title="t('ask.askComposer.modelAnswersOneQuestion')" @click="ask.runningThreadId && ask.select(ask.runningThreadId)">{{ t('ask.askComposer.answeringElsewhereShow') }}</button>
        <button type="button" class="ui-btn ui-btn-sm" @click="ask.stop()"><Square :size="10" :stroke-width="2.25"/>{{ ' ' + t('ask.askComposer.stop') }}</button>
      </template>
      <button v-else-if="ask.running" type="button" class="ui-btn ui-btn-sm" :title="t('ask.askComposer.stopEsc')" @click="ask.stop()"><Square :size="10" :stroke-width="2.25"/>{{ ' ' + t('ask.askComposer.stop') }}</button>
      <button v-else type="submit" class="ui-btn ui-btn-primary ui-btn-sm" :disabled="!text.trim() || !ask.model"><ArrowUp :size="12" :stroke-width="2.25"/>{{ ' ' + t('ask.askComposer.ask') }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { ArrowUp, PanelTop, Plus, Square, X } from "lucide-vue-next"
import { useAskStore } from "../app/ask.store"
import { runCommand } from "~/platform/commands"
import { shortName } from "../tools/shared"
import { t } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

const emit = defineEmits<{ (e: "send", q: string): void }>()
const ask = useAskStore()
const text = ref("")
const input = ref<HTMLTextAreaElement | null>(null)
const short = shortName

const busyElsewhere = computed(() => !!ask.runningThreadId && ask.runningThreadId !== ask.currentId)
const placeholder = computed(() => {
  const c = ask.pendingContext
  if (c?.subject) return t("ask.askComposer.askAbout2", { subjectName: shortName(c.subject.name) })
  if (c) return t("ask.askComposer.askAbout3", { label: c.label })
  return ask.current?.turns.length ? t("ask.askComposer.askFollowUp") : t("ask.askComposer.askAboutArchitecture")
})
const chipTitle = computed(() => {
  const c = ask.pendingContext
  if (!c) return ""
  return [t("ask.askComposer.nextQuestionCarriesWhat", { label: c.label }), ...c.exhibits.map(x => `· ${x.title}`), c.focus ? `· focus: ${c.focus}` : "", c.selection?.length ? t("ask.askComposer.selected", { selectionLength: c.selection.length }) : ""].filter(Boolean).join("\n")
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
.ask-composer { border: 1px solid rgb(var(--c-neutral-300)); border-radius: 6px; padding: 10px 12px 8px; background: rgb(var(--c-surface)); transition: border-color 0.15s; }
.ask-composer:focus-within { border-color: rgb(var(--c-accent-400)); }
.ask-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; height: 22px; font-size: 11.5px; padding: 0 3px 0 7px; border-radius: 4px; background: rgb(var(--c-neutral-100)); color: rgb(var(--c-neutral-800)); border: 1px solid rgb(var(--c-neutral-200)); }
.ask-chip-offer { background: transparent; border-style: dashed; border-color: rgb(var(--c-neutral-300)); color: rgb(var(--c-neutral-700)); }
.ask-chip-offer:hover { border-color: rgb(var(--c-accent-400)); color: rgb(var(--c-neutral-900)); }
.ask-chip-x { display: inline-flex; padding: 2px; border-radius: 3px; color: rgb(var(--c-neutral-500)); }
.ask-chip-x:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-200)); }
</style>
