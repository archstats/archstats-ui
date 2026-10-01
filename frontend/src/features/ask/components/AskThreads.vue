<template>
  <nav class="flex h-full flex-col" :aria-label="t('ask.askThreads.conversations')">
    <div class="flex h-9 shrink-0 items-center gap-2 px-3">
      <span class="ui-section-title flex-1">{{ t('ask.askThreads.conversations') }}</span>
      <button type="button" class="ui-btn ui-btn-quiet ui-btn-icon ui-btn-sm" :title="t('ask.askThreads.newConversation')" :aria-label="t('ask.askThreads.newConversation')" @click="$emit('new')"><Plus :size="13" :stroke-width="1.75"/></button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <p v-if="!ask.threads.length" class="px-2 py-3 text-[12px] leading-relaxed text-neutral-500">{{ t('ask.askThreads.questionsYouAskKept') }}</p>
      <template v-for="g in grouped" :key="g.label">
        <p class="ui-section-title px-2 pb-1 pt-3">{{ g.label }}</p>
        <div
            v-for="item in g.items"
            :key="item.id"
            class="ask-thread group"
            :class="{ 'ask-thread-on': item.id === ask.currentId, 'opacity-60': item.scanId !== ask.openScanId && item.turns.length }"
            role="button"
            tabindex="0"
            :aria-current="item.id === ask.currentId ? 'true' : undefined"
            @click="ask.select(item.id)"
            @keydown.enter="ask.select(item.id)"
            @dblclick="startRename(item.id, item.title)"
        >
          <input
              v-if="renaming === item.id"
              v-model="draft"
              class="ui-input ui-input-sm w-full"
              :aria-label="t('ask.askThreads.conversationName')"
              @keydown.enter.prevent="endRename(true)"
              @keydown.esc.prevent="endRename(false)"
              @blur="endRename(true)"
              @click.stop
          >
          <template v-else>
            <p class="line-clamp-2 text-[12.5px] leading-snug text-neutral-900">{{ item.title }}</p>
            <p class="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-neutral-500">
              <span>{{ questions(item) }}</span><span>·</span><span>{{ relativeAge(item.updatedAt) }}</span>
              <span v-if="item.scanId !== ask.openScanId && item.turns.length" class="ui-tag" :title="t('ask.askThreads.aboutSnapshot', { snapshot: item.snapshot })">{{ item.snapshot }}</span>
            </p>
            <button type="button" class="ask-thread-x" :title="t('ask.askThreads.delete', { itemTitle: item.title })" :aria-label="t('ask.askThreads.deleteConversation')" @click.stop="ask.remove(item.id)"><Trash2 :size="12" :stroke-width="1.75"/></button>
          </template>
        </div>
      </template>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import { Plus, Trash2 } from "lucide-vue-next"
import { relativeAge } from "~/shared/time"
import { useAskStore, type Thread } from "../app/ask.store"
import { t } from "~/shared/i18n"

defineEmits<{ (e: "new"): void }>()
const ask = useAskStore()

const grouped = computed(() => {
  const today = new Date().toDateString()
  const week = Date.now() - 7 * 864e5
  const g: Array<{ label: string; items: Thread[] }> = [{ label: t("ask.askThreads.today"), items: [] }, { label: t("ask.askThreads.week"), items: [] }, { label: t("ask.askThreads.earlier"), items: [] }]
  for (const t of ask.sorted) {
    if (!t.turns.length && t.id !== ask.currentId) continue
    const d = new Date(t.updatedAt)
    ;(d.toDateString() === today ? g[0] : d.getTime() > week ? g[1] : g[2]).items.push(t)
  }
  return g.filter(x => x.items.length)
})
const questions = (thread: Thread) => (thread.turns.length === 1 ? "1 question" : t("ask.askThreads.questions", { turnsLength: thread.turns.length }))

const renaming = ref<string | null>(null)
const draft = ref("")
function startRename(id: string, title: string) {
  renaming.value = id
  draft.value = title
  void nextTick(() => (document.querySelector(".ask-thread input") as HTMLInputElement | null)?.select())
}
function endRename(keep: boolean) {
  if (renaming.value && keep) ask.rename(renaming.value, draft.value)
  renaming.value = null
}
</script>

<style scoped>
.ask-thread { position: relative; padding: 6px 26px 6px 8px; border-radius: 6px; cursor: pointer; outline: none; }
.ask-thread:hover { background: rgb(var(--c-neutral-200) / 0.6); }
.ask-thread:focus-visible { box-shadow: inset 0 0 0 2px rgb(var(--c-accent-400)); }
.ask-thread-on, .ask-thread-on:hover { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.ask-thread-x { position: absolute; right: 5px; top: 7px; padding: 2px; border-radius: 4px; color: rgb(var(--c-neutral-400)); opacity: 0; }
.ask-thread:hover .ask-thread-x, .ask-thread-x:focus-visible { opacity: 1; }
.ask-thread-x:hover { color: rgb(var(--c-red-700)); background: rgb(var(--c-neutral-100)); }
</style>
