<template>
  <!-- The findings, as the thing you navigate.
       Coupling between files belongs to Connections; what only this grain
       knows is what the codebase declares, so that is what the rail is made
       of. Each row is a specific claim, not a category. -->
  <nav class="flex h-full flex-col bg-ground" aria-label="Findings">
    <div v-if="!sections.length" class="flex h-full items-center justify-center px-6 text-center">
      <p class="max-w-[30ch] text-sm leading-5 text-neutral-500">
        Nothing stands out in what this codebase declares. No repeated names, no crowded files,
        nothing overgrown.
      </p>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto pb-4">
      <section v-for="section in sections" :key="section.kind">
        <h2 class="flex items-baseline gap-2 px-4 pb-1 pt-4">
          <span class="ui-section-title">{{ section.title }}</span>
          <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ section.findings.length }}</span>
        </h2>
        <p class="px-4 pb-2 text-xs leading-4 text-neutral-500">{{ section.note }}</p>

        <ul>
          <li v-for="f in section.findings" :key="f.id">
            <button type="button"
                    class="flex w-full items-start gap-2 px-4 py-2 text-left transition-colors duration-100"
                    :class="f.id === selectedId ? 'bg-accent-50' : 'hover:bg-neutral-100'"
                    :aria-current="f.id === selectedId ? 'true' : undefined"
                    @click="$emit('select', f.id)">
              <span v-if="f.tone === 'warn'" class="mt-0.5 shrink-0 text-red-500" aria-hidden="true">
                <Icon icon="alert" :size="12"/>
              </span>
              <span v-else class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" aria-hidden="true"/>

              <span class="min-w-0 flex-1">
                <span class="block text-base leading-5 text-neutral-900">{{ f.headline }}</span>
              </span>

              <span class="shrink-0 text-right">
                <span class="block font-mono text-xs tabular-nums text-neutral-700">{{ f.metric.toLocaleString() }}</span>
                <span class="block text-[10px] uppercase tracking-wide text-neutral-500">{{ f.metricLabel }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </nav>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue"
import type { FindingSection } from "~/utils/unitFindings"

defineProps<{ sections: FindingSection[]; selectedId: string | null }>()
defineEmits<{ (e: "select", id: string): void }>()
</script>
