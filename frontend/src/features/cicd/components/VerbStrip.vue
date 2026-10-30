<template>
  <!-- The verbs a pipeline reaches, as small marks in run order. -->
  <span class="inline-flex items-center gap-[3px]" :aria-label="verbs.map(v => t(`cicd.verbs.${v}`)).join(', ')">
    <span v-for="v in verbs" :key="v" class="h-[7px] w-[7px] rounded-[2px]" :class="VERB_TONE[v] ?? 'bg-neutral-300'" :title="t(`cicd.verbs.${v}`)"></span>
  </span>
</template>

<script setup lang="ts">
import { VERB_TONE } from "../verbs"
import { t } from "~/shared/i18n"

defineProps<{ verbs: string[] }>()
</script>
