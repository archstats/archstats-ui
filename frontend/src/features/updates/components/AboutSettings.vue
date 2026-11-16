<template>
  <section class="about-panel flex items-start gap-4 px-4 py-3.5" aria-labelledby="about-title">
    <Info :size="16" :stroke-width="1.75" class="mt-px shrink-0 text-neutral-400" aria-hidden="true"/>
    <div class="min-w-0 grow">
      <h3 id="about-title" class="text-base font-semibold text-neutral-900">{{ t('updates.aboutSettings.title', { version: about?.version ?? '' }) }}</h3>
      <dl v-if="about" class="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-sm">
        <dt class="text-neutral-500">{{ t('updates.aboutSettings.engine') }}</dt>
        <dd class="truncate font-mono text-neutral-800" :title="about.engine">{{ about.engine }}</dd>
        <dt class="text-neutral-500">{{ t('updates.aboutSettings.analysisRevision') }}</dt>
        <dd class="font-mono text-neutral-800">{{ about.analysisRevision }}</dd>
        <dt class="text-neutral-500">{{ t('updates.aboutSettings.platform') }}</dt>
        <dd class="font-mono text-neutral-800">{{ about.platform }}</dd>
      </dl>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="ui-btn ui-btn-sm" @click="updates.openNotes()">{{ t('updates.aboutSettings.whatsNew') }}</button>
        <button type="button" class="ui-btn ui-btn-sm" @click="updates.open(about?.docs)">
          {{ t('updates.aboutSettings.documentation') }}<ArrowUpRight :size="12" :stroke-width="2" aria-hidden="true"/>
        </button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="showLog">{{ t('updates.aboutSettings.showLog') }}</button>
      </div>
    </div>
  </section>

  <section class="about-panel flex items-start gap-4 px-4 py-3.5" aria-labelledby="updates-title">
    <RefreshCw :size="16" :stroke-width="1.75" class="mt-px shrink-0 text-neutral-400" aria-hidden="true"/>
    <div class="min-w-0 grow">
      <h3 id="updates-title" class="text-base font-semibold text-neutral-900">{{ t('updates.aboutSettings.checkForUpdates') }}</h3>
      <p class="mt-0.5 max-w-[58ch] text-sm leading-[18px] text-neutral-600">{{ t('updates.aboutSettings.checkExplained') }}</p>
      <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-800" role="status">
        <template v-if="!release">{{ t('updates.aboutSettings.notARelease') }}</template>
        <template v-else-if="updates.checking"><Loader2 :size="12" class="animate-spin text-neutral-500" aria-hidden="true"/>{{ t('updates.aboutSettings.checking') }}</template>
        <template v-else-if="updates.error"><span class="text-red-700">{{ t('updates.aboutSettings.couldNotCheck', { error: updates.error }) }}</span></template>
        <template v-else-if="updates.newer && updates.latest">
          <span>{{ t('updates.aboutSettings.newerOut', { version: updates.latest.version, date: updates.latest.published }) }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="updates.open(updates.latest.url)">
            {{ t('updates.aboutSettings.download') }}<ArrowUpRight :size="12" :stroke-width="2" aria-hidden="true"/>
          </button>
        </template>
        <template v-else-if="updates.checkedAt">{{ t('updates.aboutSettings.upToDate', { time: checkedTime }) }}</template>
        <template v-else-if="!updates.checkEnabled">{{ t('updates.aboutSettings.off') }}</template>
        <button v-if="release && !updates.checking" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="updates.check()">{{ t('updates.aboutSettings.checkNow') }}</button>
      </p>
    </div>
    <Switch
        :model-value="updates.checkEnabled"
        aria-labelledby="updates-title"
        class="mt-0.5"
        @update:model-value="v => updates.setCheckEnabled(v)"
    />
  </section>
</template>

<script setup lang="ts">
// Settings → About: which build this is, the engine inside it and the
// analysis revision it writes, and the switch for the update check.
import { computed, onMounted } from "vue"
import { ArrowUpRight, Info, Loader2, RefreshCw } from "lucide-vue-next"
import Switch from "~/shared/ui/Switch.vue"
import { showLog } from "~/platform/diagnostics"
import { intlLocale, t } from "~/shared/i18n"
import { isRelease, useUpdatesStore } from "../updates.store"

const updates = useUpdatesStore()
const about = computed(() => updates.about)
const release = computed(() => isRelease(about.value?.version ?? ""))
const checkedTime = computed(() => updates.checkedAt?.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" }) ?? "")

onMounted(() => { void updates.start() })
</script>

<style scoped>
.about-panel { border-radius: 6px; box-shadow: 0 0 0 1px rgb(var(--c-neutral-200)); }
</style>
