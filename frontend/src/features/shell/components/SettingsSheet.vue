<template>
  <Teleport to="body">
    <Transition name="settings">
      <div v-if="open" class="settings-scrim fixed inset-0 z-[60] flex items-start justify-center pt-[8vh]" @click.self="close">
        <div ref="card" class="settings-card ui-popover flex max-h-[84vh] w-[640px] max-w-[94vw] flex-col outline-none" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
          <header class="flex h-12 shrink-0 items-center gap-3 pl-5 pr-3 hairline-b">
            <h2 id="settings-title" class="text-[15px] font-semibold leading-5 text-neutral-900">{{ t('shell.settingsSheet.settings') }}</h2>
            <kbd class="font-mono text-xs text-neutral-400">{{ isMac ? "⌘," : "Ctrl+," }}</kbd>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" :aria-label="t('shell.settingsSheet.closeSettings')" :title="t('shell.settingsSheet.closeEsc')" @click="close"><Icon icon="x" :size="14"/></button>
          </header>
          <div class="flex min-h-0 grow flex-col gap-6 overflow-y-auto px-5 pb-6 pt-5">
            <LanguageSettings/>
            <AISettings/>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// App-wide settings, opened from File → Settings… (⌘,), the rail's gear, or
// any feature that needs one set ("settings:open").
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import AISettings from "~/features/ai/components/AISettings.vue"
import LanguageSettings from "./LanguageSettings.vue"
import { usePlatform } from "~/platform/usePlatform"
import { t } from "~/shared/i18n"

const open = defineModel<boolean>({ default: false })
const card = ref<HTMLElement | null>(null)
const { isMac } = usePlatform()
let returnTo: HTMLElement | null = null

function close() { open.value = false }
function onKey(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); close() } }

// Focus moves into the sheet, and back to where it came from when it closes.
watch(open, async on => {
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
.settings-scrim { background: rgb(0 0 0 / 0.28); backdrop-filter: blur(2px); }
.settings-enter-active, .settings-leave-active { transition: opacity 160ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.settings-enter-active .settings-card, .settings-leave-active .settings-card { transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms ease-out; }
.settings-enter-from, .settings-leave-to { opacity: 0; }
.settings-enter-from .settings-card, .settings-leave-to .settings-card { transform: translateY(6px) scale(0.99); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .settings-enter-active, .settings-leave-active, .settings-enter-active .settings-card, .settings-leave-active .settings-card { transition: none; }
}
</style>
