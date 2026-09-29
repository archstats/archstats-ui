<template>
  <!-- The claims worth making about the whole codebase, each one a way down
       into its own evidence. The Units landing and the Overview share it. -->
  <ul class="grid grid-cols-1">
    <li v-for="f in findings" :key="f.id" class="hairline-t">
      <button type="button"
              class="group -mx-3 block w-full rounded px-3 py-4 text-left transition-colors duration-100 hover:bg-neutral-100"
              @click="$emit('open', f)">
        <p class="flex items-start gap-2 text-base leading-5 text-neutral-900">
          <span v-if="f.tone === 'warn'" class="mt-0.5 shrink-0 text-red-500" aria-hidden="true">
            <Icon icon="alert" :size="14"/>
          </span>
          <span class="min-w-0">{{ f.headline }}</span>
        </p>
        <p class="mt-1 max-w-[54ch] text-sm leading-5 text-neutral-500">{{ f.detail }}</p>
        <p class="mt-1.5 flex items-center gap-1 text-sm text-neutral-500 group-hover:text-neutral-900">
          <span>{{ f.action }}</span>
          <Icon icon="arrow-right" :size="11"
                class="transition-transform duration-200 group-hover:translate-x-0.5"/>
        </p>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import Icon from "~/shared/ui/Icon.vue"
import type { Finding } from "~/features/units/findings"

defineProps<{ findings: Finding[] }>()
defineEmits<{ (e: "open", finding: Finding): void }>()
</script>
