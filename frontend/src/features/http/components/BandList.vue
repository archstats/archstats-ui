<template>
  <!-- Where a box's routes come from or go to: each neighbour, with how many
       routes pass between them, widest first. A click picks the neighbour. -->
  <div>
    <h4 class="ui-label">{{ title }}</h4>
    <ul class="flex flex-col">
      <li v-for="it in items" :key="it.id">
        <button type="button" class="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" @click="emit('pick', it.id)">
          <span class="min-w-0 truncate text-xs text-neutral-800">{{ it.name }}</span>
          <span class="ml-auto h-1.5 shrink-0 rounded-full bg-neutral-300" :style="{ width: `${Math.max(4, (it.count / max) * 56)}px` }"/>
          <span class="w-10 shrink-0 text-right font-mono text-[11px] text-neutral-500">{{ it.count.toLocaleString(intlLocale) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { intlLocale } from "~/shared/i18n"

const props = defineProps<{ title: string; items: Array<{ id: string; name: string; count: number }> }>()
const emit = defineEmits<{ (e: "pick", id: string): void }>()
const max = computed(() => Math.max(1, ...props.items.map(i => i.count)))
</script>
