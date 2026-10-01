<template>
  <div class="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-3 px-6 py-8" role="status" aria-live="polite" data-loading>
    <span class="shell-progress h-0.5 w-32 rounded-full"><span></span></span>
    <p class="text-sm text-neutral-500">{{ text || t('ui.loadingState.loading') }}</p>
  </div>
</template>
<script setup lang="ts">
import { t } from "~/shared/i18n"
defineProps<{ text?: string }>()
</script>
