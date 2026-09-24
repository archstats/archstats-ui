<template>
  <!-- The claim you clicked, restated where you landed.
       Descending on a finding and arriving at a bare list drops the thing
       that made the list worth opening: the breadcrumb names the region but
       not the reading, and rows cannot say on their own why these and not
       others. So the sentence travels down with them. -->
  <div class="shrink-0 hairline-b bg-ground px-4 py-2.5">
    <p class="flex items-start gap-2 text-base leading-5 text-neutral-900">
      <span v-if="claim.tone === 'warn'" class="mt-0.5 shrink-0 text-red-500" aria-hidden="true">
        <Icon icon="alert" :size="14"/>
      </span>
      <span class="min-w-0">{{ claim.headline }}</span>
    </p>
    <p class="mt-0.5 max-w-[78ch] text-sm leading-5 text-neutral-500">{{ claim.detail }}</p>
    <!-- How the list below is arranged, which is a different thought from
         what the claim rests on and does not belong in the same sentence. -->
    <p v-if="note" class="mt-0.5 text-sm leading-5 text-neutral-500">{{ note }}</p>
    <p v-if="hint" class="mt-1.5 flex items-center gap-1.5 text-sm leading-4 text-neutral-500">
      <span class="shrink-0 text-neutral-400"><Icon icon="info" :size="12"/></span>
      <span>{{ hint }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue"

defineProps<{
  claim: { headline: string; detail: string; tone: "neutral" | "warn" }
  note: string
  hint: string
}>()
</script>
