<template>
  <div v-if="release" class="pointer-events-none fixed bottom-4 left-4 z-50 w-[320px]" role="status" aria-live="polite">
    <div class="pointer-events-auto rounded-md bg-surface p-3 shadow-lg hairline">
      <div class="flex items-start gap-2">
        <ArrowDownCircle :size="14" :stroke-width="1.75" class="mt-0.5 shrink-0 text-accent-700" aria-hidden="true"/>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium text-neutral-900">{{ t('updates.updateNotice.title', { version: release.version }) }}</p>
          <p class="mt-0.5 text-[12px] text-neutral-600">{{ t('updates.updateNotice.youHave', { version: updates.about?.version ?? '', date: release.published }) }}</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="updates.open(release.url)">
              {{ t('updates.updateNotice.download') }}<ArrowUpRight :size="12" :stroke-width="2" aria-hidden="true"/>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="updates.dismiss()">{{ t('updates.updateNotice.notNow') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A newer release, said once in a corner until it is downloaded or waved
// off; a later release asks again. Mounted once in the layout, it also starts
// the update feature and serves its Help menu commands.
import { computed, onBeforeUnmount, onMounted } from "vue"
import { ArrowDownCircle, ArrowUpRight } from "lucide-vue-next"
import { registerCommand, runCommand } from "~/platform/commands"
import { t } from "~/shared/i18n"
import { useUpdatesStore } from "../updates.store"

const updates = useUpdatesStore()
const release = computed(() => updates.available)

const off: Array<() => void> = []
onMounted(() => {
  void updates.start()
  off.push(registerCommand("help:docs", () => updates.open(updates.about?.docs)))
  off.push(registerCommand("help:whatsnew", () => updates.openNotes()))
  off.push(registerCommand("help:updates", async () => {
    await runCommand("settings:open")
    void updates.check()
  }))
})
onBeforeUnmount(() => off.forEach(f => f()))
</script>
