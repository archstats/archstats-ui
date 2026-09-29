<template>
  <!-- A person's initials in a quiet disc; still-here people get a blue ring. -->
  <span class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight"
        :class="[here ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-neutral-100 text-neutral-500', size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]']"
        aria-hidden="true">{{ initials }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{ name: string; here?: boolean; size?: "sm" | "md" }>(), { here: false, size: "md" })

// "Samir Shah" → SS, "jjanvier" → JJ, "Author 12" → 12.
const initials = computed(() => {
  const n = props.name.trim()
  const numbered = /^Author (\d+)$/.exec(n)
  if (numbered) return numbered[1].slice(0, 3)
  const words = n.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return (words[0] ?? "?").slice(0, 2).toUpperCase()
})
</script>
