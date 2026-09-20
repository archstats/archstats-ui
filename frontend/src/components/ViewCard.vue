<template>
  <router-link :to="path" class="group flex h-14 items-center gap-4 px-3 transition-colors hover:bg-neutral-50">
    <span class="h-10 w-16 shrink-0 overflow-hidden rounded-sm bg-neutral-100 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]">
      <img v-if="image" :src="image" alt="" class="h-full w-full object-cover object-left-top opacity-90 transition-opacity group-hover:opacity-100 dark:hidden"/>
      <img v-if="image" :src="darkImage" alt="" class="hidden h-full w-full object-cover object-left-top opacity-90 transition-opacity group-hover:opacity-100 dark:block"/>
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-base font-medium leading-4 text-neutral-900">{{ name }}</span>
      <span class="mt-0.5 block truncate text-sm leading-4 text-neutral-500">{{ description }}</span>
    </span>
    <Icon icon="chevron-right" :size="14" class="shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500"/>
  </router-link>
</template>
<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";

import { computed } from "vue";

const props = defineProps({
  name: String,
  description: String,
  path: String,
  image: String
})

// Every thumbnail ships a dark twin next to it: /img/views/x.png → /img/views/x-dark.png
const darkImage = computed(() => (props.image ?? "").replace(/\.png$/, "-dark.png"))
</script>
