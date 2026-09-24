<template>
  <!-- Where you are in the descent, the way back up, and how the codebase is
       being read. A filter you cannot see is a view that lies, so the path is
       always on screen and every level above the current one is a way out. -->
  <nav class="flex shrink-0 items-center gap-1 hairline-b bg-ground px-3 py-1.5"
       aria-label="Descent">
    <button type="button"
            class="shrink-0 rounded px-1.5 py-0.5 text-sm transition-colors duration-100"
            :class="steps.length ? 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900' : 'text-neutral-900'"
            :aria-current="steps.length ? undefined : 'page'"
            @click="$emit('up', -1)">{{ root }}</button>

    <template v-for="(step, i) in steps" :key="i">
      <Icon icon="chevron-right" :size="12" class="shrink-0 text-neutral-400" aria-hidden="true"/>
      <button type="button"
              class="min-w-0 truncate rounded px-1.5 py-0.5 text-sm transition-colors duration-100"
              :class="i === steps.length - 1
                ? 'text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'"
              :aria-current="i === steps.length - 1 ? 'page' : undefined"
              :title="step.title ?? step.label"
              @click="$emit('up', i)">{{ step.label }}</button>
    </template>

    <span v-if="count !== null"
          class="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
      {{ count.toLocaleString() }} {{ noun }}{{ count === 1 ? '' : 's' }}
    </span>

    <!-- The lanes are a reading, not a fact, and every level of the descent
         is coloured by it. Buried in a settings popover it looked like a
         property of the codebase rather than a choice about how to see it. -->
    <label class="ml-auto flex shrink-0 items-center gap-1.5 pl-3">
      <span class="ui-label">Read as</span>
      <select class="ui-input ui-input-sm max-w-[13rem]" :value="framework" aria-label="Framework"
              @change="$emit('framework', ($event.target as HTMLSelectElement).value)">
        <option :value="AUTO">Auto · {{ autoLabel }}</option>
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>
  </nav>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue"
import { AUTO } from "~/utils/javaFrameworks"

defineProps<{
  root: string
  steps: Array<{ label: string; title?: string }>
  /** Rows on screen at this level, or null at the top. */
  count: number | null
  /** What those rows are: modules, or references between them. */
  noun: string
  framework: string
  autoLabel: string
  profiles: Array<{ id: string; label: string }>
}>()
defineEmits<{ (e: "up", index: number): void; (e: "framework", value: string): void }>()
</script>
