<template>
  <Teleport to="body">
    <Transition name="whatsnew">
      <div v-if="updates.notesOpen" class="whatsnew-scrim fixed inset-0 z-[60] flex items-start justify-center pt-[8vh]" @click.self="close">
        <div ref="card" class="whatsnew-card ui-popover flex max-h-[84vh] w-[640px] max-w-[94vw] flex-col outline-none" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title" tabindex="-1">
          <header class="flex h-12 shrink-0 items-center gap-3 pl-5 pr-3 hairline-b">
            <h2 id="whatsnew-title" class="text-[15px] font-semibold leading-5 text-neutral-900">
              {{ updates.notesAfterUpdate ? t('updates.whatsNewSheet.sinceLastTime', { version: updates.about?.version ?? '' }) : t('updates.whatsNewSheet.title') }}
            </h2>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" :aria-label="t('updates.whatsNewSheet.close')" :title="t('updates.whatsNewSheet.close')" @click="close"><Icon icon="x" :size="14"/></button>
          </header>
          <div class="flex min-h-0 grow flex-col gap-6 overflow-y-auto px-5 pb-6 pt-5">
            <p v-if="!updates.notes.length" class="text-sm text-neutral-600">{{ t('updates.whatsNewSheet.noNotes') }}</p>
            <article v-for="s in updates.notes" :key="s.version" class="flex flex-col gap-2">
              <h3 class="flex items-baseline gap-2 text-base font-semibold text-neutral-900">
                <span class="font-mono">{{ s.version }}</span>
                <span v-if="s.date" class="text-sm font-normal text-neutral-500">{{ s.date }}</span>
              </h3>
              <!-- The changelog the app was built with; its HTML is dropped, only Markdown renders. -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="whatsnew-body text-sm text-neutral-800" v-html="render(s.body)"/>
            </article>
          </div>
          <footer class="flex shrink-0 items-center gap-3 px-5 py-3 hairline-t">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="updates.open(updates.about?.releases)">
              {{ t('updates.whatsNewSheet.allReleases') }}<ArrowUpRight :size="12" :stroke-width="2" aria-hidden="true"/>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary ml-auto" @click="close">{{ t('updates.whatsNewSheet.done') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// Help → What's New, and the same sheet once after an update: the notes of
// every release since the one last run. The notes stay in English, like the
// changelog they come from.
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import { ArrowUpRight } from "lucide-vue-next"
import { Marked } from "marked"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { useUpdatesStore } from "../updates.store"

const updates = useUpdatesStore()
const card = ref<HTMLElement | null>(null)
const marked = new Marked({ renderer: { html: () => "" } as any })

function render(body: string): string {
  return marked.parse(body, { async: false }) as string
}
function close() { updates.notesOpen = false }
function onKey(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); close() } }

let returnTo: HTMLElement | null = null
watch(() => updates.notesOpen, async on => {
  if (on) {
    returnTo = document.activeElement as HTMLElement | null
    window.addEventListener("keydown", onKey)
    await nextTick()
    card.value?.focus()
  } else {
    window.removeEventListener("keydown", onKey)
    returnTo?.focus?.()
    returnTo = null
  }
})
onBeforeUnmount(() => window.removeEventListener("keydown", onKey))
</script>

<style scoped>
.whatsnew-scrim { background: rgb(0 0 0 / 0.28); backdrop-filter: blur(2px); }
.whatsnew-body :deep(h3) { margin-top: 0.75rem; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: rgb(var(--c-neutral-500)); }
.whatsnew-body :deep(p) { margin-top: 0.5rem; max-width: 64ch; }
.whatsnew-body :deep(p:first-child) { margin-top: 0; }
.whatsnew-body :deep(ul) { margin-top: 0.375rem; padding-left: 1rem; list-style: disc; }
.whatsnew-body :deep(li) { margin-top: 0.125rem; }
.whatsnew-body :deep(code) { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.whatsnew-body :deep(a) { text-decoration: underline; text-underline-offset: 2px; }
.whatsnew-enter-active, .whatsnew-leave-active { transition: opacity 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.whatsnew-enter-active .whatsnew-card, .whatsnew-leave-active .whatsnew-card { transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms ease-out; }
.whatsnew-enter-from, .whatsnew-leave-to { opacity: 0; }
.whatsnew-enter-from .whatsnew-card, .whatsnew-leave-to .whatsnew-card { transform: translateY(6px) scale(0.99); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .whatsnew-enter-active, .whatsnew-leave-active, .whatsnew-enter-active .whatsnew-card, .whatsnew-leave-active .whatsnew-card { transition: none; }
}
</style>
