
<template>
  <div>
    <div class="flex cursor-pointer select-none items-center gap-1" @click="expanded = !expanded">
      <Icon class="shrink-0 text-neutral-400" :size="14" :icon="expanded ? 'chevron-down' : 'chevron-right'"/>
      <slot></slot>
    </div>
    <div v-if="expanded" class="pl-5">
      <slot name="expanded-content"></slot>
    </div>
  </div>
</template>
<script setup lang="ts">

import Icon from "~/components/ui/common/Icon.vue";

const expanded = ref(false)
</script>