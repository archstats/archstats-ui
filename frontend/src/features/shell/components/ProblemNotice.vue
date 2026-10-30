<template>
  <div v-if="notices.length" class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2" role="status" aria-live="polite">
    <div
        v-for="n in notices"
        :key="n.id"
        class="pointer-events-auto rounded-md bg-surface p-3 shadow-lg hairline"
    >
      <div class="flex items-start gap-2">
        <component :is="n.kind === 'error' ? AlertCircle : RotateCcw" :size="14" :stroke-width="1.75" class="mt-0.5 shrink-0" :class="n.kind === 'error' ? 'text-red-600' : 'text-amber-600'"/>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium text-neutral-900">{{ n.kind === "error" ? t("shell.problemNotice.errorTitle") : t("shell.problemNotice.reloadedTitle") }}</p>
          <p v-if="n.kind === 'error' && n.message" class="mt-0.5 line-clamp-3 break-words text-[12px] text-neutral-600">{{ n.message }}</p>
          <p class="mt-0.5 text-[12px] text-neutral-600">{{ t("shell.problemNotice.detailsInLog") }}</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm" @click="showLog">{{ t("shell.problemNotice.showLog") }}</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="dismiss(n.id)">{{ t("shell.problemNotice.dismiss") }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertCircle, RotateCcw } from "lucide-vue-next";
import { dismiss, notices, showLog } from "~/platform/diagnostics";
import { t } from "~/shared/i18n";
</script>
