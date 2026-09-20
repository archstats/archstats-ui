<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-baseline gap-2">
      <span class="ui-label">{{ title }}</span>
      <span class="font-mono text-xs text-neutral-400">{{ ids.length }}</span>
      <button v-if="ids.length" type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="emit('unpark', ids)">Put them all back</button>
    </div>
    <p v-if="!ids.length" class="text-sm leading-4 text-neutral-500">{{ empty }}</p>
    <ul v-else class="flex max-h-[32rem] flex-col overflow-y-auto">
      <li v-for="id in ids" :key="id" class="group flex h-6 items-center gap-2">
        <KindMark kind="component"/>
        <button type="button" class="min-w-0 truncate text-left font-mono text-sm text-neutral-700 hover:text-accent-700" :title="`${id} · show it in the map`" @click="emit('focus', id)">{{ id }}</button>
        <button type="button" class="ml-auto shrink-0 text-xs text-neutral-500 opacity-0 hover:text-neutral-900 focus:opacity-100 group-hover:opacity-100" @click="emit('unpark', [id])">Back</button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import KindMark from "~/components/connections/KindMark.vue";

// A pile comes back at the end rather than vanishing: everything parked for
// later, or declared outside this dimension, one click from the queue again.

defineProps<{ title: string; ids: string[]; empty: string }>();
const emit = defineEmits<{ (e: "unpark", ids: string[]): void; (e: "focus", id: string): void }>();
</script>
