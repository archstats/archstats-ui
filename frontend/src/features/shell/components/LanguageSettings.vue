<template>
  <section class="flex items-start gap-4 rounded-md px-4 py-3.5 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]" aria-labelledby="language-title">
    <Languages :size="16" :stroke-width="1.75" class="mt-px shrink-0 text-neutral-400" aria-hidden="true"/>
    <div class="min-w-0 grow">
      <h3 id="language-title" class="text-base font-semibold text-neutral-900">{{ t('shell.languageSettings.language') }}</h3>
      <p class="mt-0.5 max-w-[58ch] text-sm leading-[18px] text-neutral-600">{{ t('shell.languageSettings.appReloads') }}</p>
    </div>
    <select
        class="ui-input ui-input-sm w-36 shrink-0"
        aria-labelledby="language-title"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as Locale)"
    >
      <option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_NAMES[l] }}</option>
    </select>
  </section>
</template>

<script setup lang="ts">
// The app's language. It is read once at startup, so changing it reloads
// the window; every string, the reports and the metric definitions follow.
import { Languages } from "lucide-vue-next"
import { LOCALES, LOCALE_NAMES, locale, setLocale, t, type Locale } from "~/shared/i18n"
</script>
