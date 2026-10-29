<template>
  <!-- API design rule findings: the rule, what it found, and where. Facts
       with a file and line, not a verdict on the API. -->
  <ul class="flex flex-col gap-1">
    <li v-for="(f, i) in findings" :key="i" class="flex min-w-0 items-baseline gap-2 text-sm">
      <span class="ui-tag shrink-0 !text-[10px]" :class="f.severity === 'must' ? 'bg-red-50 text-red-700' : ''" :title="f.severity === 'must' ? t('http.findingList.mustTitle') : t('http.findingList.shouldTitle')">{{ f.severity === 'must' ? t('http.findingList.must') : t('http.findingList.should') }}</span>
      <span class="shrink-0 font-mono text-xs text-neutral-800">{{ f.rule }}</span>
      <span class="min-w-0 truncate text-neutral-600" :title="f.detail">{{ f.detail }}</span>
      <router-link :to="`${filePath(f.file, 'source')}${f.line ? `#L${f.line}` : ''}`" class="ml-auto shrink-0 font-mono text-xs text-neutral-400 hover:underline">{{ f.file.split('/').pop() }}:{{ f.line }}</router-link>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { filePath } from "~/features/navigation/routes"
import { t } from "~/shared/i18n"
import type { Finding } from "../http"

defineProps<{ findings: Finding[] }>()
</script>
